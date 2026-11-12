// A text region: lines of text drawn as cells by renderDOM, with the same text in a visually
// hidden element for screen readers and scripts. Ported from exo-space's ascii.js `textRegion`:
// lines clipped or wrapped to a column budget, centred or aligned, an optional frame, and a
// flicker of every line or of some lines. The text is written only when the lines change, not
// every frame. `fit` is how many cells fit a size in CSS px.
import { panel } from "./components.js";
import { renderDOM } from "./dom.js";
import { Grid, lengthOf, runsOf, wrap } from "./grid.js";
import { fit } from "./layout.js";
import { motionDuration, play, prefersReducedMotion } from "./motion.js";

export { fit };

const plain = (line) => (typeof line === "string" ? line : line.map((r) => r.text).join(""));

/**
 * A region in `host`: `set(lines, { flicker })` lays the lines out and draws them; `flicker(which)`
 * runs the flicker on every line (null) or the lines at these indexes; `text()` is the mirror's
 * text. `cols()` is the column budget, called on every draw (use `fit(face, scale, px).cols`).
 * `role` and `live` go on the mirror (`role: "status", live: "polite"` for a status line).
 * @param {HTMLElement} host
 * @param {{ cols: () => number, face: string, scale: number, theme: Record<string, string>, fg?: string, wrap?: boolean, frame?: boolean, align?: "left" | "right" | "center", role?: string, live?: string, label?: string, render?: object }} o
 */
export function textRegion(host, o) {
  const fg = o.fg ?? "accent";
  let lines = [];
  let key = "";
  let motions = [];
  let stop = () => {};
  let last = null;

  const layout = (cols) => {
    const rows = [];
    lines.forEach((l, i) => {
      if (o.wrap && typeof l === "string") for (const w of wrap(l, cols)) rows.push({ line: w, of: i });
      else rows.push({ line: l, of: i });
    });
    return rows;
  };

  const grid = (now) => {
    const cols = Math.max(4, o.cols() - (o.frame ? 4 : 0));
    const rows = layout(cols);
    const textW = rows.length ? Math.min(cols, Math.max(...rows.map((r) => lengthOf(r.line)))) : 0;
    const pad = o.frame ? 2 : 0;
    const top = o.frame ? 1 : 0;
    const g = new Grid(rows.length ? textW + pad * 2 : 0, rows.length ? rows.length + top * 2 : 0);
    if (!rows.length) return g;
    if (o.frame) panel(g, 0, 0, g.cols, g.rows, { tone: fg });
    rows.forEach((r, y) => {
      const align = o.align ?? (o.frame ? "center" : "left");
      g.line(align === "right" ? pad + textW - 1 : pad, y + top, runsOf(r.line, fg), {
        width: textW,
        align: align === "center" ? "left" : align,
        fg,
        halo: !o.frame,
      });
      if (align === "center") {
        const n = Math.min(lengthOf(r.line), textW);
        const shift = (textW - n) >> 1;
        if (shift) {
          const row = g.cells.slice((y + top) * g.cols + pad, (y + top) * g.cols + pad + textW).map((c) => ({ ...c }));
          for (let i = 0; i < textW; i++) g.cells[(y + top) * g.cols + pad + i] = i >= shift ? row[i - shift] : { ch: " ", fg, bg: null, halo: false };
        }
      }
    });
    for (const m of motions) {
      const ys = rows.map((r, y) => (m.lines === null || m.lines.includes(r.of) ? y : -1)).filter((y) => y >= 0);
      if (ys.length) g.motion(0, ys[0] + top, g.cols, ys.at(-1) - ys[0] + 1, { start: m.start });
    }
    if (o.frame && motions.some((m) => m.lines === null)) g.motion(0, 0, g.cols, g.rows, { start: motions[0].start });
    return g;
  };

  const draw = (now) => {
    const g = grid(now);
    const { mirror: _m, ...rest } = o.render ?? {};
    renderDOM(host, g, { face: o.face, scale: o.scale, theme: o.theme, ...rest, now, mirror: { role: o.role, live: o.live, label: o.label } });
    last = g;
    return g;
  };

  const animating = (now) => last?.motions.some((m) => now < m.start + motionDuration(m));

  /** Starts a flicker of every line (null) or of the lines at these indexes. */
  function flicker(which = null) {
    const now = globalThis.performance.now();
    if (prefersReducedMotion()) {
      draw(now);
      return;
    }
    motions = motions.filter((m) => !last || now < m.start + 2000);
    motions.push({ start: now, lines: which });
    stop();
    draw(now);
    stop = play((t) => {
      const g = draw(t);
      if (!animating(t)) motions = [];
      return g;
    });
  }

  return {
    host,
    /** Sets the lines; draws only when they changed. `flicker: true` flickers every line. */
    set(next, { flicker: which } = {}) {
      const k = JSON.stringify(next);
      if (k !== key) {
        key = k;
        lines = next;
        if (!animating(globalThis.performance.now())) draw(globalThis.performance.now());
      }
      if (which !== undefined && which !== false) flicker(which === true ? null : which);
    },
    flicker,
    redraw: () => draw(globalThis.performance.now()),
    /** The mirror's text: what a screen reader reads. */
    text: () => host.querySelector(".sa-text")?.textContent ?? lines.map(plain).join("\n"),
    get grid() {
      return last;
    },
  };
}
