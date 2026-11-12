// Windows: a framed panel with a head and a foot, a scroll region for its body, and tooltips.
// Pure, like the other components: cells into a grid. The renderer draws a scroll region's body
// grid inside a native scroll container over the region's cells.
import { divider, panel } from "./components.js";
import { Grid, wrap } from "./grid.js";

/**
 * A window: `panel` plus a divider under the head rows and one over the foot rows, each joined to
 * the frame (`├─┤`). Returns the boxes, edges inclusive: `head`, `body` and `foot` with `left`,
 * `right` (inset two columns, as `panel`'s inner box), `top`, `bottom`, `width`, `height`, and
 * `x`, `w` (the full width inside the frame, for a scroll region or a row that fills it).
 * @param {{ title?: string, head?: number, foot?: number, tone?: string, titleStyle?: "halo" | "chip" | "plain" }} o
 */
export function windowFrame(g, x, y, w, h, { title, head = 0, foot = 0, tone = "accent", titleStyle } = {}) {
  const p = panel(g, x, y, w, h, { title, tone, titleStyle });
  const box = (top, rows) =>
    rows > 0 ? { left: p.left, right: p.right, top, bottom: top + rows - 1, width: p.width, height: rows, x: x + 1, w: w - 2 } : null;
  if (head > 0) divider(g, x, y + 1 + head, w, tone);
  if (foot > 0) divider(g, x, y + h - 2 - foot, w, tone);
  const bodyTop = y + 1 + (head > 0 ? head + 1 : 0);
  const bodyBottom = y + h - 2 - (foot > 0 ? foot + 1 : 0);
  return { head: box(y + 1, head), body: box(bodyTop, bodyBottom - bodyTop + 1), foot: box(y + h - 1 - foot, foot) };
}

/**
 * A scroll region: `body` (a grid of its own, any number of rows) is drawn by the renderer in a
 * native scroll container over columns x to x + w - 2 and rows y to y + h - 1; column x + w - 1
 * is its scrollbar, drawn here from `scroll`: a `│` track in the tone's dim shade and a thumb of
 * cells filled with the tone, or blank when the body fits. `scroll` is `{ top, height, viewport }` in any one
 * unit (the renderer's `onScroll` reports CSS px); without it the body's rows are the unit.
 * @param {{ id: string, scroll?: { top?: number, height?: number, viewport?: number }, tone?: string }} o
 */
export function scrollRegion(g, x, y, w, h, body, { id, scroll = {}, tone = "accent" }) {
  const height = scroll.height ?? body.rows;
  const viewport = scroll.viewport ?? h;
  const top = Math.max(0, Math.min(scroll.top ?? 0, Math.max(0, height - viewport)));
  g.scrolls.push({ id, x, y, w: w - 1, h, grid: body, scroll: { top, height, viewport } });
  g.fill(x, y, w, h, " ");
  if (height <= viewport + 0.5) return { thumb: null };
  const thumb = Math.max(1, Math.min(h, Math.round((h * viewport) / height)));
  const at = Math.round(((h - thumb) * top) / (height - viewport));
  // The thumb is a cell background in the tone, so it has no seams between rows in any face.
  for (let j = 0; j < h; j++) {
    if (j >= at && j < at + thumb) g.put(x + w - 1, y + j, " ", tone, tone);
    else g.put(x + w - 1, y + j, "│", `${tone}Off`);
  }
  return { thumb: { y: y + at, h: thumb } };
}

/**
 * A tooltip as its own grid: the lines wrapped to at most `cols - 4` columns inside a frame with
 * a surface. Placement is the caller's. A line is wrapped on its own; `\n` breaks too.
 * @param {string[] | string} lines
 * @param {number} cols the most columns the tooltip may take, frame included
 */
export function tooltip(lines, cols, { tone = "accent", fg = tone } = {}) {
  const inner = Math.max(1, cols - 4);
  const rows = (Array.isArray(lines) ? lines : [lines]).flatMap((l) => wrap(l, inner));
  const width = Math.min(inner, Math.max(1, ...rows.map((r) => [...r].length)));
  const g = new Grid(width + 4, rows.length + 2);
  panel(g, 0, 0, g.cols, g.rows, { tone });
  g.block(2, 1, rows, { width, fg });
  return g;
}
