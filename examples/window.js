// The build window, modelled on exo-space's (game/client/picker.js, buildwin.css): a head with
// the BASE / SHIP segmented control, the tab's title and a close button; a scrolling body of
// two-line rows, each with a thumbnail slot; a tab bar of icon tabs along the bottom.
import { row, segmented, tabs, toolbar } from "../web/controls.js";
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
 * @param {{ rows?: number, side?: "base" | "ship", tab?: string, selected?: string, hover?: string | null, scroll?: { top?: number, height?: number, viewport?: number }, rowH?: number }} [o]
 */
export function buildWindow(cols, { rows = 14, side = "ship", tab = "supply", selected = "cargo", hover = null, scroll, rowH = 44 } = {}) {
  const g = new Grid(cols, rows);
  const win = windowFrame(g, 0, 0, cols, rows, { head: 1, foot: 1 });
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
  // The close button: one row in the head, its hit area the 44 px exo's .bw-x has.
  const tx = win.head.left + 13;
  const cx = win.head.right - 3;
  if (cx - tx > 2) g.line(tx, hy, title, { width: cx - tx - 1, fg: "dim" });
  toolbar(g, win.head.right, hy, [{ id: "close", icon: "close", label: "CLOSE" }], { align: "right", minH: rowH });
  const body = windowBody(win.body.w - 1, { selected, hover, rowH });
  scrollRegion(g, win.body.x, win.body.top, win.body.w, win.body.height, body, { id: "body", scroll });
  tabs(g, win.foot.x, win.foot.top, win.foot.w, { id: "tabs", label: "TABS", items: TABS, selected: tab, minH: rowH });
  return g;
}
