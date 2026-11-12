// Geometry for the HTML renderer, pure so the tests can check what renderDOM places: where each
// row sits once bands have added their height, each target's box and hit area in device px, and
// how many cells fit a size. Every edge is a font-pixel position rounded to a whole device pixel,
// plus a whole number of device pixels per band, so a grid without bands lands exactly where
// web/metrics.js puts it.
import { gridBox, wholeDevice } from "./metrics.js";
import { faces } from "./spec.js";

/**
 * Rows with bands applied, in device px. `shift(y)` is the height bands above row y's cell have
 * added (every vertical position in row y moves down by it); `glyph(y)` is the top of row y's cell (where its glyph
 * and icon sit); `top(y)` and `bottom(y)` bound the row's box, which includes a band's added
 * space above its first row and below its last. Overlapping bands: the first one listed wins.
 * @param {import("./grid.js").Grid} g
 * @param {number} chh cell height in font px
 * @param {number} k device px per font px
 * @param {number} dpr
 */
export function rowLayout(g, chh, k, dpr) {
  const D = (fpx) => Math.round(fpx * k);
  const n = g.rows;
  const off = new Array(n + 1).fill(0);
  const pt = new Array(n).fill(0);
  const pb = new Array(n).fill(0);
  const start = new Map();
  const taken = new Set();
  for (const b of g.bands ?? []) {
    let free = b.y >= 0 && b.y + b.h <= n;
    for (let j = 0; j < b.h && free; j++) if (taken.has(b.y + j)) free = false;
    if (!free) continue;
    for (let j = 0; j < b.h; j++) taken.add(b.y + j);
    start.set(b.y, b);
  }
  let cum = 0;
  for (let y = 0; y < n; ) {
    const b = start.get(y);
    if (!b) {
      off[y] = cum;
      y++;
      continue;
    }
    const natural = D((y + b.h) * chh) - D(y * chh);
    const extra = Math.max(0, Math.ceil(b.min * dpr - 1e-9) - natural);
    const above = Math.floor(extra / 2);
    pt[y] = above;
    pb[y + b.h - 1] = extra - above;
    for (let j = 0; j < b.h; j++) off[y + j] = cum + above;
    cum += extra;
    y += b.h;
  }
  off[n] = cum;
  return {
    extra: cum,
    padAbove: pt,
    padBelow: pb,
    shift: (y) => off[y],
    glyph: (y) => D(y * chh) + off[y],
    top: (y) => D(y * chh) + off[y] - (pt[y] ?? 0),
    bottom: (y) => D((y + 1) * chh) + off[y] + (pb[y] ?? 0),
  };
}

/**
 * The grid's box for the HTML renderer: gridBox plus the bands' height. `width`/`height` are
 * device px padded to the 1/64 CSS px layout unit; `cssWidth`/`cssHeight` the same in CSS px.
 */
export function domBox(g, face, scale, dpr = globalThis.devicePixelRatio || 1, snap = false) {
  const box = gridBox(face, scale, g.cols, g.rows, dpr, snap);
  const rows = rowLayout(g, faces[face].cell[1], box.k, dpr);
  const drawnH = box.drawnH + rows.extra;
  const height = wholeDevice(drawnH, dpr);
  return { ...box, drawnH, height, cssHeight: height / dpr, rows };
}

/**
 * Each target's box and hit growth in device px. The box covers the target's cells, its rows'
 * full height in a band. The hit area grows evenly to `min` CSS px (or the target's own
 * `hit: { w, h }`), and stops halfway to a neighbouring target's box, so no two hit areas overlap.
 * @returns {{ id: string, x0: number, y0: number, x1: number, y1: number, grow: { l: number, r: number, t: number, b: number } }[]}
 */
export function targetBoxes(g, face, box, min, dpr) {
  const [cw] = faces[face].cell;
  const D = (fpx) => Math.round(fpx * box.k);
  const out = g.targets.map((t) => {
    const x0 = D(t.x * cw);
    const x1 = D((t.x + t.w) * cw);
    const y0 = box.rows.top(t.y);
    const y1 = box.rows.bottom(t.y + t.h - 1);
    const gx = Math.max(0, (Math.max(min, t.hit?.w ?? 0) * dpr - (x1 - x0)) / 2);
    const gy = Math.max(0, (Math.max(min, t.hit?.h ?? 0) * dpr - (y1 - y0)) / 2);
    return { id: t.id, x0, y0, x1, y1, grow: { l: gx, r: gx, t: gy, b: gy } };
  });
  const grown = (a) => [a.x0 - a.grow.l, a.y0 - a.grow.t, a.x1 + a.grow.r, a.y1 + a.grow.b];
  const hits = (p, q) => p[0] < q[2] && q[0] < p[2] && p[1] < q[3] && q[1] < p[3];
  for (let i = 0; i < out.length; i++)
    for (let j = i + 1; j < out.length; j++) {
      const a = out[i];
      const b = out[j];
      if (!hits(grown(a), grown(b))) continue;
      // Split the gap between the two boxes on the axis that separates them.
      if (a.x1 <= b.x0 || b.x1 <= a.x0) {
        const [l, r] = a.x1 <= b.x0 ? [a, b] : [b, a];
        const half = (r.x0 - l.x1) / 2;
        l.grow.r = Math.min(l.grow.r, half);
        r.grow.l = Math.min(r.grow.l, half);
      } else if (a.y1 <= b.y0 || b.y1 <= a.y0) {
        const [u, d] = a.y1 <= b.y0 ? [a, b] : [b, a];
        const half = (d.y0 - u.y1) / 2;
        u.grow.b = Math.min(u.grow.b, half);
        d.grow.t = Math.min(d.grow.t, half);
      }
    }
  return out;
}

/**
 * Hit rects in CSS px, as renderDOM lays them out: `{ id, x, y, w, h }`. For tests and layout checks.
 * @param {{ dpr?: number, min?: number, snap?: boolean }} [o]
 */
export function domHitRects(g, face, scale, { dpr = 1, min = 44, snap = false } = {}) {
  const box = domBox(g, face, scale, dpr, snap);
  return targetBoxes(g, face, box, min, dpr).map((b) => ({
    id: b.id,
    x: (b.x0 - b.grow.l) / dpr,
    y: (b.y0 - b.grow.t) / dpr,
    w: (b.x1 - b.x0 + b.grow.l + b.grow.r) / dpr,
    h: (b.y1 - b.y0 + b.grow.t + b.grow.b) / dpr,
  }));
}

/**
 * How many whole cells fit `px` CSS px: `{ cols, rows }`. `px` is a number (both ways) or
 * `{ width, height }`. Uses the renderer's own cell size, so `fit(...).cols` cells never overflow.
 * @param {number | { width?: number, height?: number }} px
 */
export function fit(face, scale, px, { dpr = globalThis.devicePixelRatio || 1, snap = false } = {}) {
  const w = typeof px === "number" ? px : (px.width ?? 0);
  const h = typeof px === "number" ? px : (px.height ?? 0);
  const cols = Math.max(0, Math.floor(w / gridBox(face, scale, 1, 1, dpr, snap).cellW + 1e-9));
  const rows = Math.max(0, Math.floor(h / gridBox(face, scale, 1, 1, dpr, snap).cellH + 1e-9));
  return { cols, rows };
}
