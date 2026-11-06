const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeFilename } = require('../helpers/sanitizer_oracle');

test('Tier 1 - Feature 18: Filename Sanitization & Path Traversal Defense', async (t) => {
  await t.test('18.1 Directory traversal sequences stripped to safe basename', () => {
    assert.equal(sanitizeFilename('../../../../etc/passwd.pdf'), 'passwd.pdf');
    assert.equal(sanitizeFilename('..\\..\\Windows\\System32\\report.docx'), 'report.docx');
    assert.equal(sanitizeFilename('/var/log/nginx/access.log.txt'), 'access.log.txt');
  });

  await t.test('18.2 Null byte injections detected and rejected', () => {
    assert.throws(() => {
      sanitizeFilename('report.pdf\0.exe');
    }, /Null byte injection detected/i);

    assert.throws(() => {
      sanitizeFilename('contract%00.pdf');
    }, /Null byte injection detected/i);
  });

  await t.test('18.3 Dangerous executable extensions prohibited', () => {
    const dangerousNames = [
      'payload.exe',
      'script.bat',
      'install.cmd',
      'deploy.sh',
      'macro.vbs',
      'runner.js',
      'backdoor.ps1',
      'setup.msi',
      'library.dll'
    ];

    for (const name of dangerousNames) {
      assert.throws(() => {
        sanitizeFilename(name);
      }, /prohibited/i, `Must reject dangerous file: ${name}`);
    }
  });

  await t.test('18.4 Windows reserved device names protected with safe prefix', () => {
    assert.equal(sanitizeFilename('CON.pdf'), 'safe_CON.pdf');
    assert.equal(sanitizeFilename('PRN.txt'), 'safe_PRN.txt');
    assert.equal(sanitizeFilename('AUX.docx'), 'safe_AUX.docx');
    assert.equal(sanitizeFilename('NUL.xlsx'), 'safe_NUL.xlsx');
    assert.equal(sanitizeFilename('COM1.pdf'), 'safe_COM1.pdf');
    assert.equal(sanitizeFilename('LPT1.pdf'), 'safe_LPT1.pdf');
  });

  await t.test('18.5 Stripping invalid filesystem characters', () => {
    // Characters: < > : " / \ | ? *
    const raw = 'Annual<Report>:2026"Final"|Draft?.pdf';
    const cleaned = sanitizeFilename(raw);
    assert.ok(!/[<>:"/\\|?*]/.test(cleaned), 'Cleaned filename must not contain invalid chars');
    assert.equal(cleaned, 'Annual_Report__2026_Final__Draft_.pdf');
  });
});
