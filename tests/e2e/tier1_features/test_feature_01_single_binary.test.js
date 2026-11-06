const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Tier 1 - Feature 01: Single-Binary On-Premise Engine Architecture', async (t) => {
  await t.test('1.1 Architecture & Directory specifications adherence', () => {
    const archDocPath = path.resolve(__dirname, '../../../arsitektur_sistem_direktori.md');
    assert.ok(fs.existsSync(archDocPath), 'arsitektur_sistem_direktori.md must exist in root');
    
    const content = fs.readFileSync(archDocPath, 'utf8');
    const deployContent = fs.readFileSync(path.resolve(__dirname, '../../../panduan_deployment.md'), 'utf8');

    assert.match(deployContent, /Single-Binary On-Premise/i, 'Deployment guide must specify Single-Binary On-Premise paradigm');
    assert.match(content, /go:embed/i, 'Architecture must specify go:embed directive for embedding frontend and wasm');
    assert.match(content, /main\.go/, 'Main entrypoint must be designated at main.go');
    assert.match(content, /Scratch/i, 'Multi-stage Docker packaging must target Scratch base image');
  });

  await t.test('1.2 Embedded assets directory tree contract', () => {
    const expectedModules = [
      'cmd/',
      'server/',
      'main.go',
      'internal/',
      'api/',
      'core/',
      'ai/',
      'ocr/',
      'workflow/',
      'database/',
      'migrations/',
      'repository/',
      'license/',
      'validator.go',
      'wasm/'
    ];

    const archDoc = fs.readFileSync(path.resolve(__dirname, '../../../arsitektur_sistem_direktori.md'), 'utf8');
    for (const mod of expectedModules) {
      assert.ok(archDoc.includes(mod), `Architecture must document module: ${mod}`);
    }
  });

  await t.test('1.3 Zero-source-code on-premise IP protection invariant', () => {
    const securityDoc = fs.readFileSync(path.resolve(__dirname, '../../../kebijakan_keamanan.md'), 'utf8');
    assert.match(securityDoc, /kompilasi biner native Golang/i, 'Must specify native binary compilation');
    assert.match(securityDoc, /enkripsi memori RAM/i, 'Must specify in-memory prompt protection');
  });
});
