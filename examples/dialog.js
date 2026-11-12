// The Settings dialog, modelled on exo-space's (game/client/index.html #settings): headings,
// radio rows (steering), a checkbox row with a key tag (damping), sliders (sound, music), a
// stepper (text size) and Close in the foot. The dialog is a window with a head and a foot.
import { button } from "../web/components.js";
import { heading, iconButton, row, slider } from "../web/controls.js";
import { Grid } from "../web/grid.js";
import { windowFrame } from "../web/window.js";

export const SIZES = ["80%", "100%", "120%", "140%"];

/**
 * @param {number} cols the dialog's width, frame included
 * @param {{ steering?: "turn" | "direct", damping?: boolean, sound?: number, music?: number, size?: number, pressed?: string | null, face?: string, scale?: number, rowH?: number }} [o]
 */
export function dialog(
  cols,
  { steering = "turn", damping = true, sound = 50, music = 30, size = 1, pressed = null, face = "jgs-vector", scale = 1.25, rowH = 44 } = {},
) {
  const w = cols - 4;
  const x = 2;
  const stepper = { size: "step", face, scale, boxed: false, minH: rowH };
  const step = iconButton(new Grid(8, 4), 0, 0, { id: "probe", icon: "add", label: "", ...stepper });
  // The body, from row 1 down; returns the first row after it. Run once to measure, once to draw.
  const body = (g) => {
    let y = 1;
    heading(g, x, y++, w, "STEERING");
    g.groups.push({ id: "steering", role: "radiogroup", label: "STEERING", ids: ["steer:turn", "steer:direct"] });
    y += row(g, x - 1, y, w + 2, { id: "steer:turn", check: "radio", label: "TURN: ROTATE, UP THRUSTS", on: steering === "turn", role: "radio", minH: rowH });
    y += row(g, x - 1, y, w + 2, {
      id: "steer:direct",
      check: "radio",
      label: "DIRECT: THRUST WHERE PRESSED",
      on: steering === "direct",
      role: "radio",
      minH: rowH,
    });
    heading(g, x, y++, w, "DAMPING");
    y += row(g, x - 1, y, w + 2, { id: "damping", check: "checkbox", label: "SLOW WHEN NOT THRUSTING", key: "F", on: damping, role: "checkbox", minH: rowH });
    heading(g, x, y++, w, "SOUND");
    for (const [id, label, icon, v] of [
      ["sound", "SOUND", "volume_up", sound],
      ["music", "MUSIC", "music_note", music],
    ]) {
      g.icon(x, y, 2, 1, icon, "accent");
      g.text(x + 3, y, label, "accent");
      slider(g, x + 9, y, Math.max(4, w - 9 - 4), { id, value: v, label });
      g.textRight(x + w - 1, y, String(v), "selected");
      g.band(y, 1, rowH);
      y++;
    }
    heading(g, x, y++, w, "DISPLAY");
    g.icon(x, y, 2, 1, "format_size", "accent");
    g.text(x + 3, y, "SIZE", "accent");
    // The stepper: two 32 px icon buttons around the value, as exo's .steprow.
    const incX = x + w - step.cols;
    const vX = incX - 1 - 4;
    iconButton(g, vX - 1 - step.cols, y, {
      id: "size:dec",
      icon: "remove",
      label: "SMALLER TEXT",
      ...stepper,
      disabled: size === 0,
      pressed: pressed === "size:dec",
    });
    g.textRight(vX + 3, y, SIZES[size], "selected");
    iconButton(g, incX, y, {
      id: "size:inc",
      icon: "add",
      label: "LARGER TEXT",
      ...stepper,
      disabled: size === SIZES.length - 1,
      pressed: pressed === "size:inc",
    });
    g.band(y, step.rows, rowH);
    return y + step.rows;
  };
  const end = body(new Grid(cols, 60));
  // The foot: a divider, then Close right-aligned.
  const rows = end + 3;
  const g = new Grid(cols, rows);
  windowFrame(g, 0, 0, cols, rows, { title: "SETTINGS", foot: 1 });
  body(g);
  button(g, cols - 3, rows - 2, { id: "close", label: "CLOSE", align: "right", pressed: pressed === "close", hit: { h: rowH } });
  g.band(rows - 2, 1, rowH);
  return g;
}
