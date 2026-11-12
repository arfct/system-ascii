// The build window, modelled on exo-space's (game/client/picker.js, buildwin.css): the close
// button on the title bar; a head with the BASE / SHIP segmented control and the tab's title; a
// scrolling body of two-line rows, each with a thumbnail slot; a tab bar of large icon tabs (the
// toolbar's size, `lg`) along the bottom, wrapping when the window is narrow.
import { row, segmented, tabs, tabsSize } from "../web/controls.js";
import { Grid } from "../web/grid.js";
import { scrollRegion, windowFrame } from "../web/window.js";

export const TABS = [
  { id: "structure", label: "STRUCTURE", icon: "deployed_code" },
  { id: "supply", label: "SUPPLY", icon: "package_2" },
  { id: "materials", label: "MATERIALS", icon: "category" },
  { id: "refinement", label: "REFINEMENT", icon: "science" },
  { id: "power", label: "POWER", icon: "bolt" },
  { id: "motion", label: "MOTION", icon: "rocket" },
  { id: "systems", label: "SYSTEMS", icon: "memory" },
];

export const ROWS = [
  { id: "cockpit", label: "COCKPIT", line2: "STONE 4  GLASS 2  HOLDS 10" },
  { id: "cargo", label: "CARGO", line2: "RESIN 2  HOLDS 10" },
  { id: "storage", label: "STORAGE", line2: "STONE 2  RESIN 2  HOLDS 50" },
  { id: "wheels", label: "WHEELS", line2: "RESIN 1  DRIVES ON A SURFACE" },
  { id: "thruster", label: "THRUSTER", line2: "STONE 2  RESIN 1  THRUST 40" },
  { id: "battery", label: "BATTERY", line2: "GLASS 2  STORES 100" },
  { id: "drill", label: "DRILL", line2: "STONE 3", disabled: true, reason: "NOT LEARNED" },
  { id: "pad", label: "PAD", line2: "STONE 2  A SHIP SETS DOWN ON IT" },
];

/** The body grid: one two-line row per block, a three-column thumbnail slot at the left. */
export function windowBody(cols, { selected = "cargo", hover = null, rowH = 44 } = {}) {
  const g = new Grid(cols, ROWS.length * 2);
  ROWS.forEach((r, i) => {
    const { reason, ...rest } = r;
    row(g, 0, i * 2, cols, {
      ...rest,
      reason,
      line2: r.disabled ? `${r.line2}  ${reason}` : r.line2,
      on: r.id === selected,
      state: r.id === hover ? "hover" : "rest",
      slot: { id: `thumb:${r.id}`, w: 3 },
      role: "option",
      aria: { selected: String(r.id === selected) },
      minH: rowH,
    });
  });
  return g;
}

/**
 * @param {number} cols the window's width, frame included
 * @param {{ bodyRows?: number, side?: "base" | "ship", tab?: string, selected?: string, hover?: string | null, scroll?: { top?: number, height?: number, viewport?: number }, rowH?: number, face?: string, scale?: number }} [o]
 */
export function buildWindow(
  cols,
  { bodyRows = 8, side = "ship", tab = "supply", selected = "cargo", hover = null, scroll, rowH = 44, face = "jgs-vector", scale = 1.25 } = {},
) {
  const tabsAt = { size: "lg", face, scale, gap: 1 };
  const foot = tabsSize(TABS.length, cols - 4, tabsAt);
  // Frame, head, divider, body, divider, foot, frame.
  const rows = 1 + 1 + 1 + bodyRows + 1 + foot.rows + 1;
  const g = new Grid(cols, rows);
  const win = windowFrame(g, 0, 0, cols, rows, {
    head: 1,
    foot: foot.rows,
    close: { id: "close", label: "CLOSE", state: hover === "close" ? "hover" : undefined, minH: rowH },
  });
  const hy = win.head.top;
  segmented(g, win.head.left, hy, {
    id: "side",
    label: "BUILD",
    options: [
      { id: "base", label: "BASE" },
      { id: "ship", label: "SHIP" },
    ],
    selected: side,
    minH: rowH,
  });
  const title = TABS.find((t) => t.id === tab)?.label ?? "";
  const tx = win.head.left + 13;
  if (win.head.right - tx > 2) g.line(tx, hy, title, { width: win.head.right - tx + 1, fg: "dim" });
  const body = windowBody(win.body.w - 1, { selected, hover, rowH });
  scrollRegion(g, win.body.x, win.body.top, win.body.w, win.body.height, body, { id: "body", scroll });
  tabs(g, win.foot.left, win.foot.top, win.foot.width, { id: "tabs", label: "TABS", items: TABS, selected: tab, ...tabsAt });
  return g;
}
