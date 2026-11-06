const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Tier 1 - Feature 14: Task Status Board Maintenance', async (t) => {
  const taskDocPath = path.resolve(__dirname, '../../../daftar_tugas_status.md');

  await t.test('14.1 Task status board exists and defines priority sections', () => {
    assert.ok(fs.existsSync(taskDocPath), 'daftar_tugas_status.md must exist in root');
    const content = fs.readFileSync(taskDocPath, 'utf8');

    assert.match(content, /Dalam Pengembangan \(In Progress\)/i);
    assert.match(content, /Perencanaan Berikutnya \(Backlog\)/i);
    assert.match(content, /Bug Tracker & Catatan Perbaikan/i);
  });

  await t.test('14.2 Priority in-progress tasks are enumerated', () => {
    const content = fs.readFileSync(taskDocPath, 'utf8');
    assert.match(content, /Implementasi modul enkripsi AES-256 untuk \*system prompt\*/i);
    assert.match(content, /Integrasi Rust WebAssembly \(`\.wasm`\) untuk \*highlighting\* dokumen PDF/i);
    assert.match(content, /Pembuatan skrip otomatis Multi-Stage Dockerfile \(`FROM scratch`\)/i);
  });
});
