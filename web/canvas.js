// Canvas 2D renderer. Bitmap faces: each glyph is rasterized once at its native size, thresholded
// to 1 bit, tinted per colour and drawn at k whole device pixels per font pixel. The vector face
// is drawn as text at any scale. Order, back to front: surfaces, cell backgrounds, halos, glyphs,
// focus outline. Motions (web/motion.js) hide cells for the frame at `now`; a character the face
// lacks is drawn as text in the `fallback` family, fitted to the cell.
import { prefersReducedMotion, surfaceVisible, visibility } from "./motion.js";
import { canDraw, faces, glyphFor } from "./spec.js";

const ARMS = { "─": "lr", "│": "ud", "┌": "rd", "┐": "ld", "└": "ru", "┘": "lu", "├": "udr", "┤": "udl", "┬": "lrd", "┴": "lru", "┼": "lrud" };

/** A frame glyph built from one-pixel strokes through the face's stroke position. */
function synthMask(f, ch) {
  const [cw, chh] = f.cell;
  const [sx, sy] = f.stroke;
  const bits = new Uint8Array(cw * chh);
  const set = (x, y) => {
    bits[y * cw + x] = 1;
  };
  if (ch === "▏") for (let y = 0; y < chh; y++) set(0, y);
  else if (ch === "▕") for (let y = 0; y < chh; y++) set(cw - 1, y);
  else {
    const arms = ARMS[ch];
    set(sx, sy);
    if (arms.includes("l")) for (let x = 0; x <= sx; x++) set(x, sy);
    if (arms.includes("r")) for (let x = sx; x < cw; x++) set(x, sy);
    if (arms.includes("u")) for (let y = 0; y <= sy; y++) set(sx, y);
    if (arms.includes("d")) for (let y = sy; y < chh; y++) set(sx, y);
  }
  return { w: cw, h: chh, bits };
}

const masks = new Map();
function mask(face, ch) {
  const key = `${face}|${ch}`;
  if (masks.has(key)) return masks.get(key);
  const f = faces[face];
  const [cw, chh] = f.cell;
  let out;
  if ((f.synth ?? "").includes(ch)) out = synthMask(f, ch);
  else {
    const c = new OffscreenCanvas(cw, chh);
    const ctx = c.getContext("2d");
    ctx.font = `${f.size}px ${f.file}`;
    ctx.fillText(ch, 0, f.baseline);
    const d = ctx.getImageData(0, 0, cw, chh).data;
    const bits = new Uint8Array(cw * chh);
    for (let i = 0; i < bits.length; i++) bits[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
    out = { w: cw, h: chh, bits };
  }
  masks.set(key, out);
  return out;
}
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
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16));
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
      d[i + 3] = on ? 255 : 0;
    }
  ctx.putImageData(img, 0, 0);
  tints.set(key, c);
  return c;
}

/** Device pixels per font pixel: whole for bitmap faces, any value for the vector face. */
export function devicePixelsPerFontPixel(face, scale, dpr) {
  return faces[face].vector ? scale * dpr : Math.max(1, Math.round(scale * dpr));
}

/** The cell's size in CSS pixels at this scale. */
export function cellSize(face, scale, dpr = globalThis.devicePixelRatio || 1) {
  const k = devicePixelsPerFontPixel(face, scale, dpr);
  const [cw, ch] = faces[face].cell;
  return { w: (cw * k) / dpr, h: (ch * k) / dpr };
}

/**
 * Draws a grid into a canvas, sizing the canvas to it.
 * @param {HTMLCanvasElement} canvas
 * @param {import("./grid.js").Grid} g
 * @param {{ face: string, scale: number, theme: Record<string, string>, fill?: number, fixes?: boolean, focused?: string | null, now?: number, reduceMotion?: boolean, fallback?: string }} o
 */
export function render(
  canvas,
  g,
  {
    face,
    scale,
    theme,
    fill = 1,
    fixes = true,
    focused = null,
    now = globalThis.performance?.now() ?? 0,
    reduceMotion = prefersReducedMotion(),
    fallback = "",
  },
) {
  const f = faces[face];
  const dpr = globalThis.devicePixelRatio || 1;
  const k = devicePixelsPerFontPixel(face, scale, dpr);
  const [cw, chh] = f.cell;
  const R = Math.round;
  canvas.width = R(g.cols * cw * k);
  canvas.height = R(g.rows * chh * k);
  canvas.style.width = `${canvas.width / dpr}px`;
  canvas.style.height = `${canvas.height / dpr}px`;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Fills snap to whole device pixels so neighbouring cells leave no seam at fractional sizes.
  const rect = (x0, y0, x1, y1) => ctx.fillRect(R(x0 * k), R(y0 * k), R(x1 * k) - R(x0 * k), R(y1 * k) - R(y0 * k));
  const color = (role) => theme[role] ?? role;
  const glyph = (ch) => glyphFor(face, ch, fixes);
  // Cells hidden by a running motion are skipped in every pass, chip and halo included.
  const vis = visibility(g, now, reduceMotion);
  const shown = (c, i) => c.ch !== " " && (!vis || vis[i] === 1);
  const missing = (ch) => fallback && !canDraw(face, ch);
  const drawFallback = (ch, x, y, fg) => {
    ctx.save();
    ctx.font = `${Math.round(chh * k * 0.8)}px ${fallback}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color(fg);
    ctx.fillText(ch, (x + cw / 2) * k, (y + chh / 2) * k);
    ctx.restore();
  };

  // Surfaces run from the top-left stroke to the bottom-right stroke, so the line is the edge.
  const [sx, sy] = f.stroke;
  if (fill > 0) {
    ctx.globalAlpha = fill;
    ctx.fillStyle = color("panel");
    for (const p of g.surfaces)
      if (surfaceVisible(g, p, now, reduceMotion)) rect(p.x * cw + sx, p.y * chh + sy, (p.x + p.w - 1) * cw + sx + 1, (p.y + p.h - 1) * chh + sy + 1);
    ctx.globalAlpha = 1;
  }
  const cellAt = (i) => [(i % g.cols) * cw, Math.floor(i / g.cols) * chh];
  g.cells.forEach((c, i) => {
    if (!c.bg || (vis && vis[i] === 0)) return;
    const [x, y] = cellAt(i);
    ctx.fillStyle = color(c.bg);
    rect(x, y, x + cw, y + chh);
  });
  if (f.vector) {
    ctx.font = `${f.size * k}px ${f.file}`;
    ctx.lineJoin = "round";
    ctx.lineWidth = 2 * k;
    ctx.strokeStyle = color("world");
    g.cells.forEach((c, i) => {
      if (!c.halo || !shown(c, i)) return;
      const [x, y] = cellAt(i);
      ctx.strokeText(glyph(c.ch), x * k, (y + f.baseline) * k);
    });
    g.cells.forEach((c, i) => {
      if (!shown(c, i)) return;
      const [x, y] = cellAt(i);
      if (missing(c.ch)) return drawFallback(c.ch, x, y, c.fg);
      ctx.fillStyle = color(c.fg);
      ctx.fillText(glyph(c.ch), x * k, (y + f.baseline) * k);
    });
  } else {
    g.cells.forEach((c, i) => {
      if (!c.halo || !shown(c, i) || missing(c.ch)) return;
      const [x, y] = cellAt(i);
      ctx.drawImage(tinted(face, glyph(c.ch), color("world"), true), (x - 1) * k, (y - 1) * k, (cw + 2) * k, (chh + 2) * k);
    });
    g.cells.forEach((c, i) => {
      if (!shown(c, i)) return;
      const [x, y] = cellAt(i);
      if (missing(c.ch)) return drawFallback(c.ch, x, y, c.fg);
      ctx.drawImage(tinted(face, glyph(c.ch), color(c.fg)), x * k, y * k, cw * k, chh * k);
    });
  }
  // Keyboard focus: a one-font-pixel outline, one pixel outside the chip.
  const t = g.targets.find((t) => t.id === focused);
  if (t) {
    ctx.strokeStyle = color(t.tone);
    ctx.lineWidth = k;
    ctx.strokeRect((t.x * cw - 1.5) * k, (t.y * chh - 1.5) * k, (t.w * cw + 3) * k, (t.h * chh + 3) * k);
  }
  return { cellW: (cw * k) / dpr, cellH: (chh * k) / dpr };
}
