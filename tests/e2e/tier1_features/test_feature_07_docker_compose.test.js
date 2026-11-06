const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Tier 1 - Feature 07: Docker Compose Services Topology', async (t) => {
  const deployDoc = fs.readFileSync(path.resolve(__dirname, '../../../panduan_deployment.md'), 'utf8');

  await t.test('7.1 Postgres service with pgvector:pg16 specification', () => {
    assert.match(deployDoc, /image:\s*pgvector\/pgvector:pg16/, 'Postgres must use pgvector/pgvector:pg16 image');
    assert.match(deployDoc, /POSTGRES_DB:\s*brilian_db/, 'Default database name brilian_db');
    assert.match(deployDoc, /pgdata:\/var\/lib\/postgresql\/data/, 'Persistent storage volume pgdata mapped');
  });

  await t.test('7.2 MinIO object storage service specification', () => {
    assert.match(deployDoc, /image:\s*minio\/minio/, 'MinIO service image');
    assert.match(deployDoc, /command:\s*server \/data --console-address ":9001"/, 'MinIO server command with console port 9001');
    assert.match(deployDoc, /miniodata:\/data/, 'Persistent storage volume miniodata mapped');
  });

  await t.test('7.3 brilian-engine topology wiring and dependencies', () => {
    assert.match(deployDoc, /image:\s*brilian-dms:v1\.0\.0/, 'Target production image');
    assert.match(deployDoc, /ports:\s*-\s*"8080:8080"/, 'Exposed HTTP port 8080');
    assert.match(deployDoc, /depends_on:\s*-\s*postgres\s*-\s*minio/, 'Engine must depend on postgres and minio services');
    assert.match(deployDoc, /-\s*\.\/license\.lic:\/app\/license\.lic/, 'License file volume mount');
  });
});
