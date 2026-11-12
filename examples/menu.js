// The More menu, modelled on exo-space's (game/client/index.html #menu): icon rows with key tags,
// a divider between the context actions and the fixed rows, and a greyed action with its reason.
// Every row is a 44 px menuitem; the text sits on the cell grid inside it.
import { divider, panel } from "../web/components.js";
import { row } from "../web/controls.js";
import { Grid } from "../web/grid.js";

export const ITEMS = [
  { id: "dock", icon: "login", label: "DOCK", disabled: true, reason: "NO PORT IN RANGE" },
  { id: "scan", icon: "radar", label: "SCAN", key: "R" },
  null,
  { id: "inventory", icon: "inventory_2", label: "INVENTORY", key: "I" },
  { id: "build", icon: "apps", label: "BUILD WINDOW", key: "K" },
  { id: "checklist", icon: "checklist", label: "CHECKLIST", key: "J" },
  { id: "log", icon: "history", label: "SHOW AWAY LOG", key: "L" },
  { id: "fullscreen", icon: "fullscreen", label: "FULLSCREEN", key: "F10" },
  { id: "settings", icon: "settings", label: "SETTINGS" },
];

/**
 * @param {number} cols the menu's width, frame included
 * @param {{ hover?: string | null, focused?: string | null, keys?: boolean, rowH?: number }} [o]
 */
export function menu(cols, { hover = null, focused = null, keys = true, rowH = 44 } = {}) {
  const rows = 2 + ITEMS.reduce((n, it) => n + (it === null ? 1 : it.disabled && it.reason ? 2 : 1), 0);
  const g = new Grid(cols, rows);
  panel(g, 0, 0, cols, rows);
  let y = 1;
  for (const it of ITEMS) {
    if (it === null) {
      divider(g, 0, y, cols);
      y++;
      continue;
    }
    const state = it.id === focused ? "focus" : it.id === hover ? "hover" : "rest";
    y += row(g, 1, y, cols - 2, { ...it, key: keys ? it.key : undefined, state, role: "menuitem", minH: rowH });
  }
  return g;
}
