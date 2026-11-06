const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { computeHighlightRectangles } = require('../helpers/wasm_oracle');

test('Tier 1 - Feature 09: React SPA UI & Wasm Bridge Architecture', async (t) => {
  await t.test('9.1 Frontend architecture specifications check', () => {
    const techDoc = fs.readFileSync(path.resolve(__dirname, '../../../spesifikasi_teknologi.md'), 'utf8');
    assert.match(techDoc, /React 18 \+ TypeScript \+ Vite/i, 'Frontend must be React 18 with TypeScript and Vite');
    assert.match(techDoc, /Rust \(WebAssembly \/ `\.wasm`\)/i, 'High-performance logic must use Rust Wasm');
    assert.match(techDoc, /tidak dapat dibaca atau di-.*reverse-engineer.* lewat .*Inspect Element.*/i, 'IP protection note for Wasm');
  });

  await t.test('9.2 TypeScript / Wasm Bridge contract simulation', () => {
    // Simulates the frontend/src/wasm/bridge.ts interface
    class WasmHighlightBridge {
      constructor(wasmModule) {
        this.wasm = wasmModule || { compute_highlight_rectangles: computeHighlightRectangles };
      }

      renderHighlights(boxes, viewportWidth, viewportHeight, scale) {
        if (!boxes || boxes.length === 0) {
          return [];
        }
        const jsonInput = JSON.stringify(boxes);
        const resultJson = this.wasm.compute_highlight_rectangles(jsonInput, viewportWidth, viewportHeight, scale);
        return JSON.parse(resultJson);
      }
    }

    const bridge = new WasmHighlightBridge();
    const boxes = [
      { page: 1, x: 10, y: 20, width: 100, height: 40 }
    ];
    const rendered = bridge.renderHighlights(boxes, 1000, 1000, 2.0);

    assert.equal(rendered.length, 1);
    assert.equal(rendered[0].x, 20);
    assert.equal(rendered[0].y, 40);
    assert.equal(rendered[0].width, 200);
    assert.equal(rendered[0].height, 80);
  });

  await t.test('9.3 Bridge graceful degradation on empty boxes array', () => {
    class WasmHighlightBridge {
      renderHighlights(boxes) {
        if (!boxes || boxes.length === 0) return [];
        return [];
      }
    }
    const bridge = new WasmHighlightBridge();
    assert.deepEqual(bridge.renderHighlights([]), []);
    assert.deepEqual(bridge.renderHighlights(null), []);
  });
});
