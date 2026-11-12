// Icon buttons at each of exo-space's sizes, in every state, with jgs text beside each row so the
// strokes can be compared: the 44 px .ib with a 22 px icon, the 20 px row icon, the 32 px stepper
// button, the 56 px bar button, the 44 px close and the large (`lg`) toolbar button; then a tab
// bar of large icon tabs, as the build window's.
import { iconButton, tabs } from "../web/controls.js";
import { Grid } from "../web/grid.js";
import { iconBox, icons } from "../web/icons.js";
import { faces } from "../web/spec.js";

export const SIZES = [
  { size: "ib", label: "IB 44 / 22", icon: "settings" },
  { size: "row", label: "ROW 20", icon: "inventory_2" },
  { size: "step", label: "STEP 32", icon: "add", boxed: true },
  { size: "bar", label: "BAR 56", icon: "build" },
  { size: "close", label: "CLOSE 44 / 16", icon: "close" },
  { size: "lg", label: "LG TOOLBAR", icon: "build" },
];

export const TABS = [
  { id: "structure", label: "STRUCTURE", icon: "deployed_code" },
  { id: "supply", label: "SUPPLY", icon: "package_2" },
  { id: "materials", label: "MATERIALS", icon: "category" },
  { id: "power", label: "POWER", icon: "bolt" },
  { id: "motion", label: "MOTION", icon: "rocket" },
];

export const STATES = [
  { id: "rest", label: "REST" },
  { id: "pressed", label: "PRESSED", pressed: true },
  { id: "on", label: "ON", on: true },
  { id: "off", label: "DISABLED", disabled: true, reason: "NOT HERE" },
  { id: "focus", label: "FOCUS", state: "focus" },
];

/**
 * @param {number} cols the least width; the grid widens to fit every state
 * @param {{ face?: string, scale?: number, tab?: string }} [o]
 */
export function iconButtons(cols, { face = "jgs-vector", scale = 1.25, tab = "supply" } = {}) {
  const gap = 1;
  const boxes = SIZES.map((s) => iconBox(s.boxed === undefined ? s.size : { ...icons.sizes[s.size], boxed: s.boxed }, face, scale, faces));
  const lg = iconBox("lg", face, scale, faces);
  // The rows of sizes, then a heading row and the large tab bar.
  const height = boxes.reduce((n, b) => n + b.rows + 2, 1) + 1 + lg.rows + 1;
  // At least wide enough for every state of the widest size.
  const width = Math.max(cols, 16 + Math.max(...boxes.map((b) => STATES.length * (b.cols + gap))));
  const g = new Grid(width, height);
  let y = 1;
  SIZES.forEach((s, i) => {
    const b = boxes[i];
    g.text(1, y, s.label, "accent");
    g.text(1, y + 1, "ABC 123 +-", "dim");
    let x = 16;
    for (const st of STATES) {
      iconButton(g, x, y, {
        id: `${s.size}:${st.id}`,
        icon: s.icon,
        label: `${s.label} ${st.label}`,
        size: s.size,
        face,
        scale,
        boxed: s.boxed,
        on: st.on,
        pressed: st.pressed,
        disabled: st.disabled,
        reason: st.reason,
        state: st.state,
        toggle: true,
      });
      x += b.cols + gap;
    }
    y += b.rows + 2;
  });
  g.text(1, y, "LG TABS", "accent");
  g.text(1, y + 1, "ABC 123 +-", "dim");
  tabs(g, 16, y, width - 17, { id: "lgtabs", label: "LG TABS", items: TABS, selected: tab, size: "lg", face, scale, gap: 1 });
  return g;
}
