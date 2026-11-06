import test from 'node:test';
import assert from 'node:assert/strict';
import { computeHighlightRectangles, WasmHighlightBridge } from '../src/wasm/bridge.ts';

test('Frontend Unit Tests: WasmHighlightBridge & computeHighlightRectangles', async (t) => {
  const sampleBoxes = JSON.stringify([
    { page: 1, x: 50, y: 100, width: 200, height: 30 },
    { page: 2, x: 120, y: 340, width: 180, height: 45 }
  ]);

  await t.test('1. Accurate coordinate scaling with factor = 1.5', () => {
    const resultJson = computeHighlightRectangles(sampleBoxes, 1000, 1500, 1.5);
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

  await t.test('2. Strict viewport boundary clamping on overflow', () => {
    const overflowBoxes = JSON.stringify([
      { page: 1, x: 700, y: 900, width: 400, height: 300 }
    ]);

    const resultJson = computeHighlightRectangles(overflowBoxes, 800, 1000, 1.0);
    const rects = JSON.parse(resultJson);

    assert.equal(rects[0].x, 700);
    assert.equal(rects[0].y, 900);
    assert.equal(rects[0].width, 100); // 800 - 700
    assert.equal(rects[0].height, 100); // 1000 - 900
  });

  await t.test('3. Negative coordinate clamping to 0', () => {
    const negativeBoxes = JSON.stringify([
      { page: 1, x: -25, y: -10, width: 100, height: 50 }
    ]);

    const resultJson = computeHighlightRectangles(negativeBoxes, 500, 500, 1.0);
    const rects = JSON.parse(resultJson);

    assert.equal(rects[0].x, 0);
    assert.equal(rects[0].y, 0);
    assert.equal(rects[0].width, 100);
    assert.equal(rects[0].height, 50);
  });

  await t.test('4. Strict error throwing on invalid inputs', () => {
    assert.throws(() => {
      computeHighlightRectangles('invalid-json', 800, 600, 1.0);
    }, /Invalid JSON syntax/i);

    assert.throws(() => {
      computeHighlightRectangles(sampleBoxes, -800, 600, 1.0);
    }, /viewport_width must be a positive number/i);

    assert.throws(() => {
      computeHighlightRectangles(sampleBoxes, 800, -600, 1.0);
    }, /viewport_height must be a positive number/i);

    assert.throws(() => {
      computeHighlightRectangles(sampleBoxes, 800, 600, -1.0);
    }, /scale must be a positive number/i);
  });

  await t.test('5. WasmHighlightBridge renderHighlights array input & scale factor 2.0', () => {
    const bridge = new WasmHighlightBridge();
    const boxes = [{ page: 1, x: 10, y: 20, width: 100, height: 40 }];
    const rendered = bridge.renderHighlights(boxes, 1000, 1000, 2.0);

    assert.equal(rendered.length, 1);
    assert.equal(rendered[0].x, 20);
    assert.equal(rendered[0].y, 40);
    assert.equal(rendered[0].width, 200);
    assert.equal(rendered[0].height, 80);
  });

  await t.test('6. Bridge graceful degradation on empty or null boxes', () => {
    const bridge = new WasmHighlightBridge();
    assert.deepEqual(bridge.renderHighlights([]), []);
    assert.deepEqual(bridge.renderHighlights(null), []);
    assert.deepEqual(bridge.renderHighlights(undefined), []);
  });
});
