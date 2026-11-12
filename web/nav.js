// Controller focus: the next target in a direction, by where the targets are drawn. The logic is
// exo-space's padnav.js (plan 38 there): the nearest target whose centre lies that way, those
// sharing the current one's row band (or column band) first, distance along the axis counted once
// and across it twice. One difference: across is measured from the current centre to the other
// target's span, not to its centre, so a full-width row is reached from a button above any part
// of it (padnav compares centres, which sends focus past a wide row to a small target further
// down that happens to be centred). Pure: rects in, an index or id out.

/**
 * rects: `[{ x, y, w, h }]`; from: the current index or -1; dx, dy: -1, 0 or 1. Returns the index
 * to focus: the nearest rect whose centre lies that way, preferring those in the current rect's
 * row (moving sideways) or column (moving up or down); the current one at an edge; the first when
 * nothing is focused; -1 when there are none.
 */
export function nextInDirection(rects, from, dx, dy) {
  if (!rects.length) return -1;
  if (from < 0 || from >= rects.length) return 0;
  const c = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const f = rects[from];
  const a = c(f);
  let best = from;
  let score = Number.POSITIVE_INFINITY;
  rects.forEach((r, i) => {
    if (i === from) return;
    const b = c(r);
    const along = (b.x - a.x) * dx + (b.y - a.y) * dy;
    // Across: from the current centre to the other rect's span, 0 when the centre is inside it,
    // so a wide row under a small button is as near as a button straight under it.
    const gap = (c0, lo, len) => Math.max(0, lo - c0, c0 - (lo + len));
    const across = dy ? gap(a.x, r.x, r.w) : gap(a.y, r.y, r.h);
    // Half a cell: a target must lie that way by more than rounding.
    if (along <= 0.5) return;
    const band = dx ? r.y < f.y + f.h && f.y < r.y + r.h : r.x < f.x + f.w && f.x < r.x + r.w;
    const s = (band ? 0 : 1e6) + along + 2 * across;
    if (s < score) {
      score = s;
      best = i;
    }
  });
  return best;
}

/**
 * A grid's focusable targets as cell rects, scroll bodies included: a body's targets are placed
 * at the region's position less its scroll (in rows), so moving down from the last visible row
 * reaches the next row of the body before anything under the region. Inert targets (disabled with
 * no reason) are left out.
 */
export function navRects(g, ox = 0, oy = 0) {
  const out = [];
  for (const t of g.targets) if (!(t.disabled && !t.reason)) out.push({ id: t.id, x: t.x + ox, y: t.y + oy, w: t.w, h: t.h });
  for (const s of g.scrolls ?? []) {
    const sc = s.scroll ?? {};
    const rows = sc.height && sc.viewport ? ((sc.top ?? 0) / sc.viewport) * s.h : (sc.top ?? 0);
    out.push(...navRects(s.grid, ox + s.x, oy + s.y - rows));
  }
  return out;
}

/**
 * The id of the target to focus from `fromId` in direction (dx, dy), scroll bodies included.
 * The first target when `fromId` is null or gone; `fromId` itself at an edge; null with none.
 * @param {import("./grid.js").Grid} g
 * @param {string | null} fromId
 */
export function nextTarget(g, fromId, dx, dy) {
  const rects = navRects(g);
  const i = nextInDirection(
    rects,
    rects.findIndex((r) => r.id === fromId),
    dx,
    dy,
  );
  return i < 0 ? null : rects[i].id;
}
