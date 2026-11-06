/**
 * Wasm Oracle for PDF Coordinate Transformation & Bounding Box Math
 * Authoritative mathematical reference model matching Rust crate in frontend/src/wasm/
 */

/**
 * Transforms and clamps bounding boxes to viewport dimensions and scale.
 * 
 * @param {string} boxesJson - JSON string of Array<{ page: number, x: number, y: number, width: number, height: number }>
 * @param {number} viewportWidth - Viewport width in pixels
 * @param {number} viewportHeight - Viewport height in pixels
 * @param {number} scale - DPI/zoom scaling factor (> 0)
 * @returns {string} - JSON string of transformed and clamped rectangles
 */
function computeHighlightRectangles(boxesJson, viewportWidth, viewportHeight, scale) {
  if (typeof boxesJson !== 'string') {
    throw new Error('boxes_json must be a string');
  }
  if (typeof viewportWidth !== 'number' || viewportWidth <= 0 || isNaN(viewportWidth)) {
    throw new Error('viewport_width must be a positive number');
  }
  if (typeof viewportHeight !== 'number' || viewportHeight <= 0 || isNaN(viewportHeight)) {
    throw new Error('viewport_height must be a positive number');
  }
  if (typeof scale !== 'number' || scale <= 0 || isNaN(scale)) {
    throw new Error('scale must be a positive number');
  }

  let boxes;
  try {
    boxes = JSON.parse(boxesJson);
  } catch (err) {
    throw new Error(`Invalid JSON syntax: ${err.message}`);
  }

  if (!Array.isArray(boxes)) {
    throw new Error('Input must be a JSON array of bounding boxes');
  }

  const results = [];

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

    // Mathematical scaling
    const scaledX = rawX * scale;
    const scaledY = rawY * scale;
    const scaledW = rawW * scale;
    const scaledH = rawH * scale;

    // Strict boundary clamping within [0, viewportWidth] and [0, viewportHeight]
    const clampedX = Math.max(0, Math.min(scaledX, viewportWidth));
    const clampedY = Math.max(0, Math.min(scaledY, viewportHeight));

    // Ensure width and height do not extend beyond the viewport boundaries
    const maxAvailableW = Math.max(0, viewportWidth - clampedX);
    const maxAvailableH = Math.max(0, viewportHeight - clampedY);

    const clampedW = Math.max(0, Math.min(scaledW, maxAvailableW));
    const clampedH = Math.max(0, Math.min(scaledH, maxAvailableH));

    results.push({
      page,
      x: Number(clampedX.toFixed(4)),
      y: Number(clampedY.toFixed(4)),
      width: Number(clampedW.toFixed(4)),
      height: Number(clampedH.toFixed(4))
    });
  }

  return JSON.stringify(results);
}

module.exports = {
  computeHighlightRectangles
};
