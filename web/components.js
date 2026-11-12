// Components: pure functions that write cells into a grid. Positions and sizes are whole cells.
// A tone is any role (`accent`, `alert`, landroid's `cyan` ...); its dim shade is the role
// `${tone}Off`, which the renderer resolves to the theme's `ghost` when the theme has none.

/**
 * A frame with a surface behind it. The title replaces the top stroke under it, from column 2.
 * `close` puts a close button on the top stroke the same way, mirrored: a two-column icon
 * (`close` from the icon font) ending one stroke column left of the top-right corner, so the row
 * reads `┌─TITLE───XX─┐`. It is a target one row tall whose hit area grows to `minH` CSS px
 * (44) by the renderer's rule, outward past the frame and into the row below. The title is
 * clipped to end at least one stroke column before it. The close button's states follow
 * `iconButton`'s: `state: "hover" | "focus"` fills it with `hover`, `pressed` with the tone's dim
 * shade, `disabled` draws it in `ghostText`.
 * The inner box it returns is inset two columns and one row from the frame's outer edge: the
 * frame's own column plus one blank column of padding each side, and the frame's own row. With a
 * close button it also has `close`, the button's cells `{ x, y, w, h }`.
 * @param {import("./grid.js").Grid} g
 * @param {{ title?: string, tone?: string, titleStyle?: "halo" | "chip" | "plain", titleSpaces?: boolean, close?: { id?: string, label?: string, icon?: string, pressed?: boolean, disabled?: boolean, reason?: string, state?: string, minH?: number, role?: string, aria?: object, attrs?: object, data?: object, className?: string } }} o
 * @returns {{ left: number, right: number, top: number, bottom: number, width: number, height: number, close?: { x: number, y: number, w: number, h: number } }} the inner box, in columns and rows (edges inclusive)
 */
export function panel(g, x, y, w, h, { title, tone = "accent", titleStyle = "halo", titleSpaces = false, close } = {}) {
  g.surfaces.push({ x, y, w, h });
  g.fill(x + 1, y, w - 2, 1, "─", tone);
  g.fill(x + 1, y + h - 1, w - 2, 1, "─", tone);
  g.fill(x, y + 1, 1, h - 2, "│", tone);
  g.fill(x + w - 1, y + 1, 1, h - 2, "│", tone);
  g.put(x, y, "┌", tone);
  g.put(x + w - 1, y, "┐", tone);
  g.put(x, y + h - 1, "└", tone);
  g.put(x + w - 1, y + h - 1, "┘", tone);
  // The close button's first column: two icon columns and one stroke column left of the corner.
  const cx = x + w - 2 - CLOSE_W;
  if (title) {
    const label = titleSpaces ? ` ${title} ` : title;
    const width = close ? Math.max(0, cx - 1 - (x + 2)) : w - 4;
    g.line(x + 2, y, label, { width, fg: tone, bg: titleStyle === "chip" ? "panel" : undefined, halo: titleStyle === "halo" });
  }
  const inner = { left: x + 2, right: x + w - 3, top: y + 1, bottom: y + h - 2, width: w - 4, height: h - 2 };
  if (close && w >= CLOSE_W + 4) inner.close = closeButton(g, cx, y, { tone, chip: titleStyle === "chip", ...close });
  return inner;
}

/** Columns a title-bar close button takes. */
export const CLOSE_W = 2;

/**
 * A close button on a frame's top stroke (see `panel`'s `close`): the icon over `CLOSE_W`
 * blank cells of row `y` from column `x`, and its target. Returns its cells.
 */
export function closeButton(g, x, y, o = {}) {
  const { id = "close", label = "CLOSE", icon = "close", tone = "accent", pressed = false, disabled = false, reason, state, minH = 44, chip = false } = o;
  const fg = disabled ? "ghostText" : tone;
  const bg = pressed && !disabled ? `${tone}Off` : state === "hover" || state === "focus" ? "hover" : chip ? "panel" : null;
  g.icon(x, y, CLOSE_W, 1, icon, fg);
  if (bg) g.fill(x, y, CLOSE_W, 1, " ", fg, bg);
  const t = { id, label, tip: label, x, y, w: CLOSE_W, h: 1, tone, toggle: false, on: false, disabled, ring: "focus", hit: { w: minH, h: minH } };
  if (reason) t.reason = reason;
  if (state === "focus") t.focus = true;
  for (const p of ["role", "aria", "attrs", "data", "className"]) if (o[p]) t[p] = o[p];
  g.targets.push(t);
  return { x, y, w: CLOSE_W, h: 1 };
}

/**
 * A label in ink on the tone. Display only; never a target. With `align: "right"`, `x` is the
 * last column.
 */
export function badge(g, x, y, label, tone = "accent", { align = "left" } = {}) {
  if (align === "right") g.textRight(x, y, ` ${label} `, "ink", tone);
  else g.text(x, y, ` ${label} `, "ink", tone);
}
/** Alias of `badge(..., { align: "right" })`; kept for one release. */
export function badgeRight(g, right, y, label, tone = "accent") {
  badge(g, right, y, label, tone, { align: "right" });
}

export function rule(g, x, y, w, tone = "accent") {
  g.fill(x, y, w, 1, "─", tone);
}

// Whether the cell already holds the other direction's stroke, so the two cross as `┼`.
const cross = (g, x, y, ch) => x >= 0 && y >= 0 && x < g.cols && y < g.rows && g.cells[y * g.cols + x].ch === ch;

/** A horizontal divider joined to a frame: `├`, `─` across, `┤`, from column x to x + w - 1; a `│` it crosses becomes `┼`. */
export function divider(g, x, y, w, tone = "accent") {
  for (let i = 1; i < w - 1; i++) g.put(x + i, y, cross(g, x + i, y, "│") ? "┼" : "─", tone);
  g.put(x, y, "├", tone);
  g.put(x + w - 1, y, "┤", tone);
}

/** A vertical divider joined to a frame: `┬`, `│` down, `┴`, from row y to y + h - 1; a `─` it crosses becomes `┼`. */
export function dividerV(g, x, y, h, tone = "accent") {
  for (let j = 1; j < h - 1; j++) g.put(x, y + j, cross(g, x, y + j, "─") ? "┼" : "│", tone);
  g.put(x, y, "┬", tone);
  g.put(x, y + h - 1, "┴", tone);
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
 * Disabled: ghost. A disabled button with a `reason` stays focusable and pressable (the input
 * layer marks it `aria-disabled` and passes the reason to `onActivate`); without one it is inert.
 * Keyboard focus is drawn by the renderer around the target. With `align: "right"`, `x` is the
 * last column. `hit` sets this target's minimum hit size in CSS px (`{ w, h }`), which need not
 * be whole cells; the chip stays one row.
 * @param {{ id: string, label: string, tone?: string, pressed?: boolean, on?: boolean, toggle?: boolean, disabled?: boolean, reason?: string, align?: "left" | "right", hit?: { w?: number, h?: number } }} o
 */
export function button(g, x, y, { id, label, tone = "accent", pressed = false, on = false, toggle = false, disabled = false, reason, align = "left", hit }) {
  const text = ` ${label} `;
  const w = [...text].length;
  const at = align === "right" ? x - w + 1 : x;
  if (disabled) g.text(at, y, text, "ghostText", "ghost");
  else if (pressed || on) g.text(at, y, text, "ink", tone);
  else g.text(at, y, text, tone, `${tone}Off`);
  const t = { id, label, x: at, y, w, h: 1, tone, toggle, on, disabled };
  if (reason) t.reason = reason;
  if (hit) t.hit = hit;
  g.targets.push(t);
}
/** Alias of `button(..., { align: "right" })`; kept for one release. */
export function buttonRight(g, right, y, o) {
  button(g, right, y, { ...o, align: "right" });
}
