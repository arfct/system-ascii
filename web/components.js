// Components: pure functions that write cells into a grid. Positions and sizes are whole cells.
// A tone is "accent" or "alert"; its dim shade is the token `${tone}Off`.

/**
 * A frame with a surface behind it. The title replaces the top stroke under it, from column 2.
 * @param {import("./grid.js").Grid} g
 * @param {{ title?: string, tone?: string, titleStyle?: "halo" | "chip" | "plain", titleSpaces?: boolean }} o
 * @returns {{ left: number, right: number, top: number, bottom: number }} the inner edges, in columns and rows
 */
export function panel(g, x, y, w, h, { title, tone = "accent", titleStyle = "halo", titleSpaces = false } = {}) {
  g.surfaces.push({ x, y, w, h });
  g.fill(x + 1, y, w - 2, 1, "─", tone);
  g.fill(x + 1, y + h - 1, w - 2, 1, "─", tone);
  g.fill(x, y + 1, 1, h - 2, "│", tone);
  g.fill(x + w - 1, y + 1, 1, h - 2, "│", tone);
  g.put(x, y, "┌", tone);
  g.put(x + w - 1, y, "┐", tone);
  g.put(x, y + h - 1, "└", tone);
  g.put(x + w - 1, y + h - 1, "┘", tone);
  if (title) {
    const label = titleSpaces ? ` ${title} ` : title;
    if (titleStyle === "chip") g.text(x + 2, y, label, tone, "panel");
    else g.text(x + 2, y, label, tone, undefined, titleStyle === "halo");
  }
  return { left: x + 2, right: x + w - 3, top: y + 1, bottom: y + h - 2 };
}

/** A label in ink on the tone. Display only; never a target. */
export function badge(g, x, y, label, tone = "accent") {
  g.text(x, y, ` ${label} `, "ink", tone);
}
export function badgeRight(g, right, y, label, tone = "accent") {
  g.textRight(right, y, ` ${label} `, "ink", tone);
}

export function rule(g, x, y, w, tone = "accent") {
  g.fill(x, y, w, 1, "─", tone);
}

/**
 * Segments lit up to `on`; unlit in the tone's dim shade, or in warnOff from `warnFrom` on.
 * @param {{ segments: number, on: number, glyphs: string, tone?: string, warnFrom?: number }} o
 */
export function meter(g, x, y, { segments, on, glyphs, tone = "accent", warnFrom = Number.POSITIVE_INFINITY }) {
  for (let i = 0; i < segments; i++) {
    const fg = i < on ? tone : i >= warnFrom ? "warnOff" : `${tone}Off`;
    g.text(x + i * [...glyphs].length, y, glyphs, fg);
  }
}

/** The unlit state of a readout. */
export function ghost(g, x, y, text) {
  g.text(x, y, text, "ghostText");
}

/**
 * A one-row chip. Rest: the tone on its dim shade. Pressed, or a toggle that is on: inverted.
 * Disabled: ghost. Keyboard focus is drawn by the renderer around the target.
 * @param {{ id: string, label: string, tone?: string, pressed?: boolean, on?: boolean, toggle?: boolean, disabled?: boolean }} o
 */
export function button(g, x, y, { id, label, tone = "accent", pressed = false, on = false, toggle = false, disabled = false }) {
  const text = ` ${label} `;
  if (disabled) g.text(x, y, text, "ghostText", "ghost");
  else if (pressed || on) g.text(x, y, text, "ink", tone);
  else g.text(x, y, text, tone, `${tone}Off`);
  g.targets.push({ id, label, x, y, w: [...text].length, h: 1, tone, toggle, on, disabled });
}
export function buttonRight(g, right, y, o) {
  button(g, right - [...o.label].length - 1, y, o);
}
