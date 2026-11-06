package database

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strings"
)

// MigrationsFS embeds all SQL migration files into the binary.
//
//go:embed migrations/*.sql
var MigrationsFS embed.FS

// Migrator manages applying and rolling back database migrations.
type Migrator struct {
	db *sql.DB
	fs fs.FS
}

// NewMigrator initializes a Migrator with the embedded filesystem.
func NewMigrator(db *sql.DB) *Migrator {
	return &Migrator{
		db: db,
		fs: MigrationsFS,
	}
}

// EnsureSchemaMigrationsTable creates the migration history table if not exists.
func (m *Migrator) EnsureSchemaMigrationsTable(ctx context.Context) error {
	query := `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version VARCHAR(50) PRIMARY KEY,
			applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
	`
	_, err := m.db.ExecContext(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to create schema_migrations table: %w", err)
	}
	return nil
}

// MigrateUp applies all unapplied up migrations in alphanumeric order.
func (m *Migrator) MigrateUp(ctx context.Context) error {
	if err := m.EnsureSchemaMigrationsTable(ctx); err != nil {
		return err
	}

	entries, err := fs.ReadDir(m.fs, "migrations")
	if err != nil {
		return fmt.Errorf("failed to read migrations directory: %w", err)
	}

	var upFiles []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".up.sql") {
			upFiles = append(upFiles, entry.Name())
		}
	}
	sort.Strings(upFiles)

	for _, filename := range upFiles {
		version := strings.TrimSuffix(filename, ".up.sql")

		var exists bool
		err := m.db.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = $1)", version).Scan(&exists)
		if err != nil {
			return fmt.Errorf("failed to check migration status for %s: %w", version, err)
		}
		if exists {
			continue
		}

		content, err := fs.ReadFile(m.fs, "migrations/"+filename)
		if err != nil {
			return fmt.Errorf("failed to read migration file %s: %w", filename, err)
		}

		tx, err := m.db.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("failed to begin transaction for migration %s: %w", version, err)
		}

		if _, err := tx.ExecContext(ctx, string(content)); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("failed to execute migration %s: %w", version, err)
		}

		if _, err := tx.ExecContext(ctx, "INSERT INTO schema_migrations (version) VALUES ($1)", version); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("failed to record migration %s: %w", version, err)
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("failed to commit migration transaction %s: %w", version, err)
		}
	}

	return nil
}

// MigrateDown rolls back the most recently applied migration.
func (m *Migrator) MigrateDown(ctx context.Context) error {
	if err := m.EnsureSchemaMigrationsTable(ctx); err != nil {
		return err
	}

	var lastVersion string
	err := m.db.QueryRowContext(ctx, "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").Scan(&lastVersion)
	if err == sql.ErrNoRows {
		return nil // Nothing to roll back
	}
	if err != nil {
		return fmt.Errorf("failed to query last applied migration: %w", err)
	}

	downFilename := lastVersion + ".down.sql"
	content, err := fs.ReadFile(m.fs, "migrations/"+downFilename)
	if err != nil {
		return fmt.Errorf("failed to read down migration %s: %w", downFilename, err)
	}

	tx, err := m.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin rollback transaction for %s: %w", lastVersion, err)
	}

	if _, err := tx.ExecContext(ctx, string(content)); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("failed to execute rollback for %s: %w", lastVersion, err)
	}

	if _, err := tx.ExecContext(ctx, "DELETE FROM schema_migrations WHERE version = $1", lastVersion); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("failed to delete migration record %s: %w", lastVersion, err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit rollback transaction %s: %w", lastVersion, err)
	}

	return nil
}
