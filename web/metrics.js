// Sizes shared by the renderers: device pixels per font pixel, the cell in CSS px, and the grid's
// box. Every renderer (canvas, DOM) takes its geometry from here so the two land on the same
// device pixels.
import { faces } from "./spec.js";

/**
 * Device pixels per font pixel. Whole for bitmap faces always. The vector face takes any ratio
 * (exo-space draws it at scale 1.25); `snap` rounds it to a whole ratio as well, which the canvas
 * renderer needs for even joints at fractional ratios (measured).
 */
export function devicePixelsPerFontPixel(face, scale, dpr = globalThis.devicePixelRatio || 1, snap = false) {
  return faces[face].vector && !snap ? scale * dpr : Math.max(1, Math.round(scale * dpr));
}

/** The cell's size in CSS pixels at this scale. */
export function cellSize(face, scale, dpr = globalThis.devicePixelRatio || 1, snap = false) {
  const k = devicePixelsPerFontPixel(face, scale, dpr, snap);
  const [cw, ch] = faces[face].cell;
  return { w: (cw * k) / dpr, h: (ch * k) / dpr };
}

/**
 * The smallest device length at or above `n` whose CSS length (n / dpr) is a whole multiple of
 * 1/64 px, the layout unit browsers round box sizes to. A canvas whose CSS size is off that grid is
 * resampled by the compositor (at dpr 1.5 a 644-px canvas is 429.33 CSS px and comes out blurred);
 * padding it to 645 device px (430 CSS px) keeps one backing pixel per device pixel.
 */
export function wholeDevice(n, dpr) {
  for (let m = n; m < n + 4096; m++) {
    const css = (m / dpr) * 64;
    if (Math.abs(css - Math.round(css)) < 1e-6) return m;
  }
  return n;
}

/**
 * A grid's box: `k`, the drawn size in device px, and the padded size in device and CSS px.
 * The padding (at most a few device px, right and bottom) is transparent.
 */
export function gridBox(face, scale, cols, rows, dpr = globalThis.devicePixelRatio || 1, snap = false) {
  const k = devicePixelsPerFontPixel(face, scale, dpr, snap);
  const [cw, ch] = faces[face].cell;
  const drawnW = Math.round(cols * cw * k);
  const drawnH = Math.round(rows * ch * k);
  const width = wholeDevice(drawnW, dpr);
  const height = wholeDevice(drawnH, dpr);
  return { k, drawnW, drawnH, width, height, cssWidth: width / dpr, cssHeight: height / dpr, cellW: (cw * k) / dpr, cellH: (ch * k) / dpr };
}
