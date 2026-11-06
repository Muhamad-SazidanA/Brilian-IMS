const test = require('node:test');
const assert = require('node:assert/strict');
const { computeHighlightRectangles } = require('../helpers/wasm_oracle');

test('Tier 1 - Feature 03: Rust WebAssembly Document Highlighting Module', async (t) => {
  const sampleBoxes = JSON.stringify([
    { page: 1, x: 50, y: 100, width: 200, height: 30 },
    { page: 2, x: 120, y: 340, width: 180, height: 45 }
  ]);

  await t.test('3.1 Accurate coordinate transformation with scale factor = 1.5', () => {
    const viewportW = 1000;
    const viewportH = 1500;
    const scale = 1.5;

    const resultJson = computeHighlightRectangles(sampleBoxes, viewportW, viewportH, scale);
    const rects = JSON.parse(resultJson);

    assert.equal(rects.length, 2);
    
    // Box 1: (50*1.5, 100*1.5, 200*1.5, 30*1.5) => (75, 150, 300, 45)
    assert.equal(rects[0].page, 1);
    assert.equal(rects[0].x, 75);
    assert.equal(rects[0].y, 150);
    assert.equal(rects[0].width, 300);
    assert.equal(rects[0].height, 45);

    // Box 2: (120*1.5, 340*1.5, 180*1.5, 45*1.5) => (180, 510, 270, 67.5)
    assert.equal(rects[1].page, 2);
    assert.equal(rects[1].x, 180);
    assert.equal(rects[1].y, 510);
    assert.equal(rects[1].width, 270);
    assert.equal(rects[1].height, 67.5);
  });

  await t.test('3.2 Strict viewport clamping for boxes extending beyond right/bottom edges', () => {
    const overflowBoxes = JSON.stringify([
      { page: 1, x: 700, y: 900, width: 400, height: 300 }
    ]);
    const viewportW = 800;
    const viewportH = 1000;
    const scale = 1.0;

    const resultJson = computeHighlightRectangles(overflowBoxes, viewportW, viewportH, scale);
    const rects = JSON.parse(resultJson);

    assert.equal(rects[0].x, 700);
    assert.equal(rects[0].y, 900);
    // Width clamped to maxAvailable (800 - 700 = 100)
    assert.equal(rects[0].width, 100);
    // Height clamped to maxAvailable (1000 - 900 = 100)
    assert.equal(rects[0].height, 100);
  });

  await t.test('3.3 Handles negative input coordinates by clamping to zero', () => {
    const negativeBoxes = JSON.stringify([
      { page: 1, x: -25, y: -10, width: 100, height: 50 }
    ]);
    const viewportW = 500;
    const viewportH = 500;
    const scale = 1.0;

    const resultJson = computeHighlightRectangles(negativeBoxes, viewportW, viewportH, scale);
    const rects = JSON.parse(resultJson);

    assert.equal(rects[0].x, 0);
    assert.equal(rects[0].y, 0);
    assert.equal(rects[0].width, 100);
    assert.equal(rects[0].height, 50);
  });

  await t.test('3.4 Validates error handling on malformed JSON or invalid numbers', () => {
    assert.throws(() => {
      computeHighlightRectangles('invalid-json', 800, 600, 1.0);
    }, /Invalid JSON syntax/i);

    assert.throws(() => {
      computeHighlightRectangles(sampleBoxes, -800, 600, 1.0);
    }, /viewport_width must be a positive number/i);

    assert.throws(() => {
      computeHighlightRectangles(sampleBoxes, 800, 600, -1.0);
    }, /scale must be a positive number/i);
  });
});
