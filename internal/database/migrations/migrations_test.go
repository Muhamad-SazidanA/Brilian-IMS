package migrations_test

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"
)

// TestMigrationsOfflineSyntaxAndIntegrity validates the SQL DDL files statically
// without requiring a live PostgreSQL or pgvector database.
func TestMigrationsOfflineSyntaxAndIntegrity(t *testing.T) {
	// Locate migration files
	upPath := "000001_init_schema.up.sql"
	downPath := "000001_init_schema.down.sql"

	// Support running from package dir or project root
	if _, err := os.Stat(upPath); os.IsNotExist(err) {
		upPath = filepath.Join("internal", "database", "migrations", "000001_init_schema.up.sql")
		downPath = filepath.Join("internal", "database", "migrations", "000001_init_schema.down.sql")
	}

	upContentBytes, err := os.ReadFile(upPath)
	if err != nil {
		t.Fatalf("Failed to read up migration file %s: %v", upPath, err)
	}
	upContent := string(upContentBytes)

	downContentBytes, err := os.ReadFile(downPath)
	if err != nil {
		t.Fatalf("Failed to read down migration file %s: %v", downPath, err)
	}
	downContent := string(downContentBytes)

	t.Run("VerifyBalancedDelimiters", func(t *testing.T) {
		validateBalancedDelimiters(t, "up.sql", upContent)
		validateBalancedDelimiters(t, "down.sql", downContent)
	})

	t.Run("VerifyRequiredExtensions", func(t *testing.T) {
		extensions := []string{"uuid-ossp", "vector"}
		for _, ext := range extensions {
			pattern := `(?i)CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+["']?` + regexp.QuoteMeta(ext) + `["']?`
			matched, err := regexp.MatchString(pattern, upContent)
			if err != nil || !matched {
				t.Errorf("Up migration missing extension declaration: %s", ext)
			}
		}
	})

	t.Run("VerifyAllSixTablesCreated", func(t *testing.T) {
		requiredTables := []string{
			"users",
			"folders",
			"documents",
			"document_versions",
			"document_chunks",
			"document_workflows",
		}

		for _, table := range requiredTables {
			pattern := `(?i)CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?` + regexp.QuoteMeta(table) + `\s*\(`
			matched, err := regexp.MatchString(pattern, upContent)
			if err != nil || !matched {
				t.Errorf("Up migration missing CREATE TABLE for: %s", table)
			}
		}
	})

	t.Run("VerifyHybridSearchColumnsAndIndexes", func(t *testing.T) {
		// Verify tsvector generated column with indonesian config
		tsvectorPattern := `(?i)to_tsvector\(\s*'indonesian'\s*,\s*content\s*\)`
		if matched, _ := regexp.MatchString(tsvectorPattern, upContent); !matched {
			t.Errorf("document_chunks missing generated indonesian tsvector column")
		}

		// Verify 1536-dimensional vector embedding
		vectorPattern := `(?i)vector\(\s*1536\s*\)`
		if matched, _ := regexp.MatchString(vectorPattern, upContent); !matched {
			t.Errorf("document_chunks missing vector(1536) embedding column")
		}

		// Verify GIN index
		ginPattern := `(?i)CREATE\s+INDEX.*USING\s+gin\s*\(\s*search_vector\s*\)`
		if matched, _ := regexp.MatchString(ginPattern, upContent); !matched {
			t.Errorf("Missing GIN index on search_vector")
		}

		// Verify IVFFLAT index with cosine ops and lists=100
		ivfflatPattern := `(?i)CREATE\s+INDEX.*USING\s+ivfflat\s*\(\s*embedding\s+vector_cosine_ops\s*\)\s*WITH\s*\(\s*lists\s*=\s*100\s*\)`
		if matched, _ := regexp.MatchString(ivfflatPattern, upContent); !matched {
			t.Errorf("Missing IVFFLAT index with vector_cosine_ops and lists=100")
		}
	})

	t.Run("VerifyForeignKeyCascadeConstraints", func(t *testing.T) {
		cascades := []string{
			"folders(id)",
			"documents(id)",
		}
		for _, parent := range cascades {
			pattern := `(?i)REFERENCES\s+` + regexp.QuoteMeta(parent) + `\s+ON\s+DELETE\s+CASCADE`
			matched, err := regexp.MatchString(pattern, upContent)
			if err != nil || !matched {
				t.Errorf("Missing ON DELETE CASCADE foreign key reference to %s", parent)
			}
		}
	})

	t.Run("VerifyDownMigrationReverseDropOrder", func(t *testing.T) {
		// Tables must be dropped in reverse dependency order
		orderedDropTables := []string{
			"document_workflows",
			"document_chunks",
			"document_versions",
			"documents",
			"folders",
			"users",
		}

		var lastIndex int = -1
		for _, table := range orderedDropTables {
			pattern := `(?i)DROP\s+TABLE\s+IF\s+EXISTS\s+` + regexp.QuoteMeta(table)
			loc := regexp.MustCompile(pattern).FindStringIndex(downContent)
			if loc == nil {
				t.Errorf("Down migration missing DROP TABLE for %s", table)
				continue
			}
			if loc[0] < lastIndex {
				t.Errorf("Down migration table %s dropped out of reverse dependency order (found at %d, previous at %d)", table, loc[0], lastIndex)
			}
			lastIndex = loc[0]
		}
	})
}

func validateBalancedDelimiters(t *testing.T, filename, content string) {
	// Strip comments
	commentRegex := regexp.MustCompile(`--.*`)
	stripped := commentRegex.ReplaceAllString(content, "")

	var parenCount int
	for _, ch := range stripped {
		switch ch {
		case '(':
			parenCount++
		case ')':
			parenCount--
			if parenCount < 0 {
				t.Errorf("%s has unbalanced closing parenthesis ')'", filename)
				return
			}
		}
	}
	if parenCount != 0 {
		t.Errorf("%s has unbalanced opening parenthesis '(' (remaining unclosed: %d)", filename, parenCount)
	}
}
