// Canvas 2D renderer, deprecated in favour of the HTML renderer (web/dom.js, `renderDOM`). It
// stays working for products that import it and as the pixel reference for bitmap faces in
// scripts/parity.mjs; it gets no new features (it ignores `g.icon` blocks).
// Bitmap faces: each glyph is rasterized once at its native size, thresholded
// to 1 bit, tinted per colour and drawn at k whole device pixels per font pixel. The vector face
// is drawn as text at any scale. Order, back to front:
// surfaces, cell backgrounds, halos, glyphs, focus outline. Motions (web/motion.js) hide
// cells for the frame at `now`; a character the face lacks is drawn as text in the `fallback`
// family, fitted to the cell.
import { parseColor, resolve } from "./color.js";
import { fallbackFont, onFontsReady } from "./fonts.js";
import { gridBox } from "./metrics.js";
import { prefersReducedMotion, surfaceVisible, visibility } from "./motion.js";
import { canDraw, faces, glyphFor, synthRects } from "./spec.js";

export { cellSize, devicePixelsPerFontPixel, gridBox, wholeDevice } from "./metrics.js";

const masks = new Map();
function mask(face, ch) {
  const key = `${face}|${ch}`;
  if (masks.has(key)) return masks.get(key);
  const f = faces[face];
  const [cw, chh] = f.cell;
  const bits = new Uint8Array(cw * chh);
  const rects = synthRects(face, ch);
  if (rects) {
    for (const [x0, y0, x1, y1] of rects) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) bits[y * cw + x] = 1;
  } else {
    const c = new OffscreenCanvas(cw, chh);
    const ctx = c.getContext("2d");
    ctx.font = `${f.size}px ${f.file}`;
    ctx.fillText(ch, 0, f.baseline);
    const d = ctx.getImageData(0, 0, cw, chh).data;
    for (let i = 0; i < bits.length; i++) bits[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
  }
  const out = { w: cw, h: chh, bits };
  masks.set(key, out);
  return out;
}
// Masks rasterized before the fonts arrived would be wrong for good; `ready()` drops them.
onFontsReady(() => {
  masks.clear();
  tints.clear();
});
const lit = (mk, x, y) => x >= 0 && y >= 0 && x < mk.w && y < mk.h && mk.bits[y * mk.w + x] === 1;

const tints = new Map();
/** A glyph in one colour; with `halo`, its mask dilated by one font pixel in eight directions. */
function tinted(face, ch, color, halo = false) {
  const key = `${face}|${ch}|${color}|${halo}`;
  if (tints.has(key)) return tints.get(key);
  const mk = mask(face, ch);
  const pad = halo ? 1 : 0;
  const w = mk.w + pad * 2;
  const h = mk.h + pad * 2;
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const [r, g, b, a] = parseColor(color);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let on = false;
      if (halo) {
        for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1 && !on; dx++) on = lit(mk, x - pad + dx, y - pad + dy);
      } else on = lit(mk, x, y);
      const i = (y * w + x) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = on ? Math.round(255 * a) : 0;
    }
  ctx.putImageData(img, 0, 0);
  tints.set(key, c);
  return c;
}

/**
 * @deprecated Use `renderDOM` from web/dom.js: native focus, inputs, scrolling and accessibility,
 * with pixel parity measured by scripts/parity.mjs. Kept working until its consumers move.
 *
 * Draws a grid into a canvas, sizing the canvas to it. The canvas's CSS size lands on the browser's
 * layout unit, padded right and bottom by a few transparent device pixels where it must
 * (`wholeDevice`), so it is never resampled.
 * @param {HTMLCanvasElement} canvas
 * @param {import("./grid.js").Grid} g
 * @param {{ face: string, scale: number, theme: Record<string, string>, dpr?: number, snap?: boolean, fill?: number, fixes?: boolean, focused?: string | null, now?: number, reduceMotion?: boolean, fallback?: string | { family: string, weight?: string | number } }} o
 */
export function render(
  canvas,
  g,
  {
    face,
    scale,
    theme,
    dpr = globalThis.devicePixelRatio || 1,
    snap = false,
    fill = 1,
    fixes = true,
    focused = null,
    now = globalThis.performance?.now() ?? 0,
    reduceMotion = prefersReducedMotion(),
    fallback = "",
  },
) {
  const f = faces[face];
  const box = gridBox(face, scale, g.cols, g.rows, dpr, snap);
  const { k } = box;
  const [cw, chh] = f.cell;
  const R = Math.round;
  // Resizing reallocates the backing store; skip it when the size is unchanged.
  if (canvas.width !== box.width) canvas.width = box.width;
  if (canvas.height !== box.height) canvas.height = box.height;
  const cssW = `${box.cssWidth}px`;
  const cssH = `${box.cssHeight}px`;
  if (canvas.style.width !== cssW) canvas.style.width = cssW;
  if (canvas.style.height !== cssH) canvas.style.height = cssH;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Fills snap to whole device pixels so neighbouring cells leave no seam at fractional sizes.
  const D = (fpx) => R(fpx * k);
  const rect = (x0, y0, x1, y1) => ctx.fillRect(D(x0), D(y0), D(x1) - D(x0), D(y1) - D(y0));
  const color = (role) => resolve(theme, role);
  const glyph = (ch) => glyphFor(face, ch, fixes);
  // Cells hidden by a running motion are skipped in every pass, chip and halo included.
  const vis = visibility(g, now, reduceMotion);
  const shown = (c, i) => c.ch !== " " && (!vis || vis[i] === 1);
  const fb = fallbackFont(fallback);
  const missing = (ch) => fb && !canDraw(face, ch);
  const drawFallback = (ch, x, y, fg) => {
    const c = color(fg);
    if (!c) return;
    ctx.save();
    ctx.font = `${fb.weight} ${R(chh * k * 0.8)}px "${fb.family}"`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = c;
    ctx.fillText(ch, (x + cw / 2) * k, (y + chh / 2) * k);
    ctx.restore();
  };

  // Surfaces run from the top-left stroke to the bottom-right stroke, so the line is the edge.
  const [sx, sy] = f.stroke;
  const panel = color("panel");
  if (fill > 0 && panel) {
    ctx.globalAlpha = fill;
    ctx.fillStyle = panel;
    for (const p of g.surfaces)
      if (surfaceVisible(g, p, now, reduceMotion)) rect(p.x * cw + sx, p.y * chh + sy, (p.x + p.w - 1) * cw + sx + 1, (p.y + p.h - 1) * chh + sy + 1);
    ctx.globalAlpha = 1;
  }
  const cellAt = (i) => [(i % g.cols) * cw, Math.floor(i / g.cols) * chh];
  g.cells.forEach((c, i) => {
    if (!c.bg || (vis && vis[i] === 0)) return;
    const bg = color(c.bg);
    if (!bg) return;
    const [x, y] = cellAt(i);
    ctx.fillStyle = bg;
    rect(x, y, x + cw, y + chh);
  });
  const world = color("world");
  if (f.vector) {
    ctx.font = `${f.size * k}px ${f.file}`;
    ctx.lineJoin = "round";
    ctx.lineWidth = 2 * k;
    if (world) {
      ctx.strokeStyle = world;
      g.cells.forEach((c, i) => {
        if (!c.halo || !shown(c, i) || missing(c.ch)) return;
        const [x, y] = cellAt(i);
        ctx.strokeText(glyph(c.ch), x * k, (y + f.baseline) * k);
      });
    }
    g.cells.forEach((c, i) => {
      if (!shown(c, i)) return;
      const [x, y] = cellAt(i);
      if (missing(c.ch)) return drawFallback(c.ch, x, y, c.fg);
      const fg = color(c.fg);
      if (!fg) return;
      ctx.fillStyle = fg;
      ctx.fillText(glyph(c.ch), x * k, (y + f.baseline) * k);
    });
  } else {
    if (world)
      g.cells.forEach((c, i) => {
        if (!c.halo || !shown(c, i) || missing(c.ch)) return;
        const [x, y] = cellAt(i);
        ctx.drawImage(tinted(face, glyph(c.ch), world, true), (x - 1) * k, (y - 1) * k, (cw + 2) * k, (chh + 2) * k);
      });
    g.cells.forEach((c, i) => {
      if (!shown(c, i)) return;
      const [x, y] = cellAt(i);
      if (missing(c.ch)) return drawFallback(c.ch, x, y, c.fg);
      const fg = color(c.fg);
      if (!fg) return;
      ctx.drawImage(tinted(face, glyph(c.ch), fg), x * k, y * k, cw * k, chh * k);
    });
  }
  // Keyboard focus: a one-font-pixel outline, one font pixel outside the chip.
  const t = g.targets.find((t) => t.id === focused);
  const ring = t && color(t.tone);
  if (ring) {
    ctx.fillStyle = ring;
    const x0 = D(t.x * cw - 2);
    const y0 = D(t.y * chh - 2);
    const x1 = D((t.x + t.w) * cw + 2);
    const y1 = D((t.y + t.h) * chh + 2);
    const w = D(1) || 1;
    ctx.fillRect(x0, y0, x1 - x0, w);
    ctx.fillRect(x0, y1 - w, x1 - x0, w);
    ctx.fillRect(x0, y0, w, y1 - y0);
    ctx.fillRect(x1 - w, y0, w, y1 - y0);
  }
  return { cellW: box.cellW, cellH: box.cellH, width: box.cssWidth, height: box.cssHeight, k };
}
