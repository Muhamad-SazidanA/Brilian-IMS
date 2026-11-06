const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateSchemaDDL } = require('../helpers/schema_oracle');

test('Tier 1 - Feature 05: Relational & Vector Database Schema', async (t) => {
  const schemaDocPath = path.resolve(__dirname, '../../../skema_basis_data.md');
  assert.ok(fs.existsSync(schemaDocPath), 'skema_basis_data.md must exist in workspace root');
  const schemaContent = fs.readFileSync(schemaDocPath, 'utf8');

  await t.test('5.1 Schema DDL adheres to full relational & vector specifications', () => {
    const result = validateSchemaDDL(schemaContent);
    assert.ok(result.valid, `Schema DDL validation failed: ${result.errors.join('; ')}`);
  });

  await t.test('5.2 Verification of migration files if present', () => {
    const migrationFile = path.resolve(__dirname, '../../../internal/database/migrations/000001_init_schema.up.sql');
    if (fs.existsSync(migrationFile)) {
      const migrationContent = fs.readFileSync(migrationFile, 'utf8');
      const result = validateSchemaDDL(migrationContent);
      assert.ok(result.valid, `Migration 000001_init_schema.up.sql validation failed: ${result.errors.join('; ')}`);
    } else {
      // Validate the DDL in the official document is ready for migration
      assert.match(schemaContent, /CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+"vector"/i);
      assert.match(schemaContent, /vector\(1536\)/);
    }
  });

  await t.test('5.3 User role domain constraints', () => {
    assert.match(schemaContent, /role VARCHAR\(50\)/i);
    assert.match(schemaContent, /admin,\s*reviewer,\s*uploader,\s*viewer/i, 'Schema must define all 4 RBAC roles');
  });

  await t.test('5.4 Workflow stages and statuses constraints', () => {
    assert.match(schemaContent, /stage VARCHAR\(50\)/i);
    assert.match(schemaContent, /draft,\s*supervisor_review,\s*director_approval/i, 'Schema must define stages');
    assert.match(schemaContent, /pending,\s*approved,\s*rejected/i, 'Schema must define workflow statuses');
  });
});
