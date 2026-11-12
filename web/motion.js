// Motion: time-based visibility of cells, applied by the renderer per frame. A grid carries
// motions (a rect of cells, a start time and a pattern from spec/motion.json); the renderer asks
// which cells are visible at `now`, and `play` drives frames only while a motion is running.
// Patterns: "steps" holds an opacity of 0 or 1 from each offset of a duration (the flicker, as
// CSS `steps(1)` keyframes); "reveal" shows the rect's cells one by one in reading order.
import motion from "../spec/motion.json" with { type: "json" };

export { motion };

const patternOf = (p) => (typeof p === "string" ? motion[p] : p);

/** A "steps" pattern's opacity `t` ms after its start: the last step at or before t, 1 when done. */
export function stepOpacity(pattern, t) {
  const p = patternOf(pattern);
  if (t >= p.duration) return 1;
  if (t < 0) return 0;
  let o = 1;
  for (const [at, v] of p.steps) if (t >= Math.round(at * p.duration)) o = v;
  return o;
}

/**
 * A steps motion's delay per row, in ms: the motion's own `rowDelay`, else the pattern's (the
 * flicker cascades line by line), else 0. Row r of the rect starts at `start + r * rowDelay`.
 */
export function rowDelay(m) {
  const p = patternOf(m.pattern);
  if (p.kind !== "steps") return 0;
  return m.rowDelay ?? p.rowDelay ?? 0;
}

/** How long a motion runs, in ms: the pattern, plus the cascade's delay to its last row. */
export function motionDuration(m) {
  const p = patternOf(m.pattern);
  return p.kind === "reveal" ? m.w * m.h * p.msPerCell : p.duration + Math.max(0, m.h - 1) * rowDelay(m);
}

/** Whether any of the grid's motions is still running at `now`. */
export function running(g, now) {
  return g.motions.some((m) => now < m.start + motionDuration(m));
}

/**
 * Which cells are drawn at `now`: a Uint8Array of 0 or 1 per cell, or null when every cell is
 * (no motion running, or `reduce`). A cell under several motions is drawn only if each shows it.
 * A steps motion runs row by row: row j of its rect is at `now - start - j * rowDelay`.
 */
export function visibility(g, now, reduce = false) {
  if (reduce || !running(g, now)) return null;
  const vis = new Uint8Array(g.cols * g.rows).fill(1);
  for (const m of g.motions) {
    const p = patternOf(m.pattern);
    const t = now - m.start;
    if (t >= motionDuration(m)) continue;
    const delay = rowDelay(m);
    for (let j = 0; j < m.h; j++) {
      const rowOn = p.kind === "reveal" ? null : stepOpacity(p, t - j * delay) === 1;
      for (let i = 0; i < m.w; i++) {
        const x = m.x + i;
        const y = m.y + j;
        if (x < 0 || y < 0 || x >= g.cols || y >= g.rows) continue;
        const on = p.kind === "reveal" ? t >= (j * m.w + i + 1) * p.msPerCell : rowOn;
        if (!on) vis[y * g.cols + x] = 0;
      }
    }
  }
  return vis;
}

/**
 * Whether a surface (panel rect) is drawn: hidden only by a "steps" motion that covers it whole,
 * and then it flickers with the motion's row at the surface's top edge (its frame's top line), so
 * in a cascade the panel's fill comes on with its title row, before the rows inside it.
 */
export function surfaceVisible(g, s, now, reduce = false) {
  if (reduce) return true;
  return g.motions.every((m) => {
    const p = patternOf(m.pattern);
    if (p.kind !== "steps" || now >= m.start + motionDuration(m)) return true;
    const covers = m.x <= s.x && m.y <= s.y && m.x + m.w >= s.x + s.w && m.y + m.h >= s.y + s.h;
    return !covers || stepOpacity(p, now - m.start - (s.y - m.y) * rowDelay(m)) === 1;
  });
}

/** The platform's reduced-motion setting; false where there is none (Node). */
export function prefersReducedMotion() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * Drives frames while a motion runs. `draw(now)` renders and returns the grid it drew; the loop
 * asks for another frame only while that grid has a running motion, so it stops by itself when
 * the flicker ends. With `reduce` it draws once. Returns a function that stops the loop.
 * @param {(now: number) => import("./grid.js").Grid} draw
 */
export function play(draw, { reduce = prefersReducedMotion() } = {}) {
  let id = 0;
  let stopped = false;
  const frame = (now) => {
    const g = draw(now);
    if (!stopped && !reduce && g && running(g, now)) id = requestAnimationFrame(frame);
  };
  frame(performance.now());
  return () => {
    stopped = true;
    cancelAnimationFrame(id);
  };
}
