/**
 * Schema Oracle for PostgreSQL DDL Validation
 * Validates table definitions, vector dimensions, full-text indexes, foreign key cascades, and constraints.
 */

const REQUIRED_TABLES = [
  'users',
  'folders',
  'documents',
  'document_versions',
  'document_chunks',
  'document_workflows'
];

const REQUIRED_EXTENSIONS = [
  'uuid-ossp',
  'vector'
];

/**
 * Validates SQL DDL text against BrilianIDMS relational & vector specifications.
 * @param {string} sqlContent 
 */
function validateSchemaDDL(sqlContent) {
  const errors = [];
  const normalizedSql = sqlContent.toLowerCase();

  // Check extensions
  for (const ext of REQUIRED_EXTENSIONS) {
    if (!normalizedSql.includes(`extension if not exists "${ext}"`) && !normalizedSql.includes(`extension if not exists '${ext}'`)) {
      errors.push(`Missing required extension: ${ext}`);
    }
  }

  // Check tables
  for (const table of REQUIRED_TABLES) {
    const tableRegex = new RegExp(`create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+${table}\\b`, 'i');
    if (!tableRegex.test(sqlContent)) {
      errors.push(`Missing required table: ${table}`);
    }
  }

  // Check vector(1536)
  if (!sqlContent.includes('vector(1536)')) {
    errors.push('Missing vector(1536) embedding column definition in document_chunks');
  }

  // Check Indonesian tsvector
  if (!normalizedSql.includes("to_tsvector('indonesian', content)")) {
    errors.push('Missing Indonesian language configuration in generated tsvector column');
  }

  // Check GIN index
  if (!normalizedSql.includes('using gin(search_vector)')) {
    errors.push('Missing GIN index on search_vector');
  }

  // Check IVFFLAT index with cosine ops
  if (!normalizedSql.includes('using ivfflat (embedding vector_cosine_ops) with (lists = 100)')) {
    errors.push('Missing IVFFLAT index with vector_cosine_ops and lists = 100 on embedding');
  }

  // Check CASCADE foreign keys
  const cascadeCount = (normalizedSql.match(/on\s+delete\s+cascade/g) || []).length;
  if (cascadeCount < 5) {
    errors.push(`Expected at least 5 ON DELETE CASCADE foreign keys, found ${cascadeCount}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  validateSchemaDDL,
  REQUIRED_TABLES,
  REQUIRED_EXTENSIONS
};
