// The flight HUD mock as a layout: three panels, a map label and a row of buttons. The preview
// draws it, and the tests check it against every face.
import { badge, button, ghost, meter, panel, rule } from "../web/components.js";
import { Grid } from "../web/grid.js";
import { faces } from "../web/spec.js";

export const COLS = 46;
export const ROWS = 35;

/**
 * @param {string} face
 * @param {{ titleStyle?: string, titleSpaces?: boolean, labelHalo?: boolean, pressed?: string | null, toggles?: Record<string, boolean>, last?: string }} o
 */
export function hud(face, { titleStyle = "halo", titleSpaces = false, labelHalo = true, pressed = null, toggles = { AUTO: true }, last = "NONE" } = {}) {
  const seg = faces[face].segment;
  const g = new Grid(COLS, ROWS);
  const frame = { titleStyle, titleSpaces };

  let p = panel(g, 0, 1, 36, 10, { title: "SYSTEM // DEV-60930", ...frame });
  g.text(p.left, p.top, "ABNORMA-B", "accent");
  badge(g, p.right, p.top, "CLASS K", "accent", { align: "right" });
  g.text(p.left, p.top + 1, "RAD: 6710", "accent");
  g.textRight(p.right, p.top + 1, "MASS: 4.75e+11", "accent");
  g.text(p.left, p.top + 2, "BODIES", "accent");
  meter(g, p.left + 7, p.top + 2, { segments: 4, on: 1, glyphs: seg + seg });
  g.textRight(p.right, p.top + 2, "1/4", "accent");
  rule(g, p.left, p.top + 3, p.width);
  badge(g, p.left, p.top + 4, "ABNORMA-B  1", "alert");
  g.textRight(p.right, p.top + 4, "MID ASTEROID", "alert");
  g.text(p.left, p.top + 5, "ATMO: VIBRANT", "alert");
  g.text(p.left, p.top + 6, "FAUN: ECLECTIC // FLOR: CATS", "alert");

  // Text on the world with no panel: a map label, protected by its halo only.
  g.text(4, 13, "o ABNORMA-B 3", "accent", undefined, labelHalo);

  p = panel(g, 0, 16, COLS, 6, { title: "AUTOPILOT ENGAGED", tone: "alert", ...frame });
  g.text(p.left, p.top, "TGT: ABNORMA-B  3", "alert");
  badge(g, p.right, p.top, "APPROACHING", "alert", { align: "right" });
  g.text(p.left, p.top + 2, "DV=3091 D=15964 T+5.2", "alert");
  g.textRight(p.right, p.top + 2, `LAST: ${last}`, "alert");

  p = panel(g, 0, 23, COLS, 12, { title: "FLIGHT TELEMETRY", ...frame });
  ghost(g, p.left, p.top, "▕ALT▏ 8888");
  button(g, p.right, p.top, { align: "right", id: "AUTO", label: "AUTO", tone: "alert", toggle: true, on: !!toggles.AUTO, pressed: pressed === "AUTO" });
  rule(g, p.left, p.top + 1, p.width);
  g.text(p.left, p.top + 2, "THR", "accent");
  meter(g, p.left + 4, p.top + 2, { segments: 16, on: 9, glyphs: seg, warnFrom: 12 });
  g.textRight(p.right, p.top + 2, "54%", "accent");
  g.text(p.left, p.top + 4, "VEL", "accent");
  meter(g, p.left + 4, p.top + 4, { segments: 16, on: 10, glyphs: seg, warnFrom: 12 });
  g.textRight(p.right, p.top + 4, "3229", "accent");
  g.text(p.left, p.top + 6, "POS", "accent");
  g.textRight(p.right, p.top + 6, "X:+10452  Y:+138379", "accent");
  // A button row has a blank row above and below: the gutter is part of the touch target.
  const at = (id) => ({ id, label: id, pressed: pressed === id });
  button(g, p.left, p.top + 8, at("DOCK"));
  button(g, p.left + 8, p.top + 8, at("SCAN"));
  button(g, p.left + 16, p.top + 8, at("LAND"));
  button(g, p.right, p.top + 8, { ...at("WARP"), align: "right", disabled: true, reason: "NO LANE" });
  return g;
}
