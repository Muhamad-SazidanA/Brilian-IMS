/**
 * Rust WebAssembly Document Highlighting Bridge & Coordinate Transformer
 * 
 * Implements high-performance coordinate scaling and strict boundary clamping
 * matching the authoritative Rust Wasm oracle specification.
 */

export interface BoundingBox {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

export function computeHighlightRectangles(
  boxesInput: string | BoundingBox[] | null | undefined,
  viewportWidth: number,
  viewportHeight: number,
  scale: number
): any {
  // Graceful degradation when input is null or undefined
  if (boxesInput === null || boxesInput === undefined) {
    return [];
  }

  // Viewport and scale validation
  if (typeof viewportWidth !== 'number' || viewportWidth <= 0 || isNaN(viewportWidth)) {
    throw new Error('viewport_width must be a positive number');
  }
  if (typeof viewportHeight !== 'number' || viewportHeight <= 0 || isNaN(viewportHeight)) {
    throw new Error('viewport_height must be a positive number');
  }
  if (typeof scale !== 'number' || scale <= 0 || isNaN(scale)) {
    throw new Error('scale must be a positive number');
  }

  const isJsonString = typeof boxesInput === 'string';
  let boxes: any[];

  if (isJsonString) {
    try {
      boxes = JSON.parse(boxesInput as string);
    } catch (err: any) {
      throw new Error(`Invalid JSON syntax: ${err.message}`);
    }
  } else if (Array.isArray(boxesInput)) {
    boxes = boxesInput;
  } else {
    throw new Error('boxes_json must be a string or array');
  }

  if (!Array.isArray(boxes)) {
    throw new Error('Input must be a JSON array of bounding boxes');
  }

  if (boxes.length === 0) {
    return isJsonString ? '[]' : [];
  }

  const results: BoundingBox[] = [];

  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    if (typeof box !== 'object' || box === null) {
      throw new Error(`Box at index ${i} is not a valid object`);
    }

    const page = Number(box.page);
    if (!Number.isInteger(page) || page < 1) {
      throw new Error(`Box at index ${i} has invalid page number (must be integer >= 1)`);
    }

    const rawX = Number(box.x);
    const rawY = Number(box.y);
    const rawW = Number(box.width);
    const rawH = Number(box.height);

    if (isNaN(rawX) || isNaN(rawY) || isNaN(rawW) || isNaN(rawH)) {
      throw new Error(`Box at index ${i} contains non-numeric coordinates`);
    }

    // Mathematical coordinate scaling
    const scaledX = rawX * scale;
    const scaledY = rawY * scale;
    const scaledW = rawW * scale;
    const scaledH = rawH * scale;

    // Boundary clamping within [0, viewportWidth] and [0, viewportHeight]
    // Negative coordinates are clamped to 0
    const clampedX = Math.max(0, Math.min(scaledX, viewportWidth));
    const clampedY = Math.max(0, Math.min(scaledY, viewportHeight));

    // Clamp width & height to remaining available dimensions in viewport
    const maxAvailableW = Math.max(0, viewportWidth - clampedX);
    const maxAvailableH = Math.max(0, viewportHeight - clampedY);

    const clampedW = Math.max(0, Math.min(scaledW, maxAvailableW));
    const clampedH = Math.max(0, Math.min(scaledH, maxAvailableH));

    results.push({
      page,
      x: Number(clampedX.toFixed(4)),
      y: Number(clampedY.toFixed(4)),
      width: Number(clampedW.toFixed(4)),
      height: Number(clampedH.toFixed(4)),
      ...(box.label ? { label: box.label } : {})
    });
  }

  return isJsonString ? JSON.stringify(results) : results;
}

export class WasmHighlightBridge {
  private wasm: any;

  constructor(wasmModule?: any) {
    this.wasm = wasmModule || null;
  }

  /**
   * Transforms raw document bounding boxes into scaled, clamped viewport overlay coordinates.
   */
  public renderHighlights(
    boxes: BoundingBox[] | null | undefined,
    viewportWidth: number = 800,
    viewportHeight: number = 1000,
    scale: number = 1.0
  ): BoundingBox[] {
    if (!boxes || !Array.isArray(boxes) || boxes.length === 0) {
      return [];
    }

    // If compiled WebAssembly module is loaded and provides the native binding
    if (this.wasm && typeof this.wasm.compute_highlight_rectangles === 'function') {
      const jsonInput = JSON.stringify(boxes);
      const res = this.wasm.compute_highlight_rectangles(jsonInput, viewportWidth, viewportHeight, scale);
      return typeof res === 'string' ? JSON.parse(res) : res;
    }

    // Fallback mathematical engine matching Rust WebAssembly oracle
    const result = computeHighlightRectangles(boxes, viewportWidth, viewportHeight, scale);
    return Array.isArray(result) ? result : JSON.parse(result);
  }
}

export const defaultHighlightBridge = new WasmHighlightBridge();
