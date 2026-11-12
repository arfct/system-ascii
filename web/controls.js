// Controls for windows, menus and dialogs: pure functions that write cells into a grid, like the
// components in components.js. Rows, toggles, tabs and toolbar buttons add targets; fields and
// sliders add slots for a native element the consumer supplies. Text is drawn as given (the
// fixtures upper-case theirs). A `minH` in CSS px adds a band (see `Grid.band`), so a row keeps a
// 44 px box with its text on the cell grid inside it.
import { meter } from "./components.js";
import { clip, wrap } from "./grid.js";
import { iconBox, icons } from "./icons.js";
import { faces } from "./spec.js";

const len = (s) => [...s].length;

/**
 * A shortcut tag: the key between `▕` and `▏`, in `dim`. With `align: "right"`, `x` is the last
 * column. Returns the columns used. Hiding it on coarse pointers is the caller's choice.
 */
export function key(g, x, y, k, { fg = "dim", align = "left" } = {}) {
  const s = `▕${k}▏`;
  const at = align === "right" ? x - len(s) + 1 : x;
  g.text(at, y, s, fg);
  return len(s);
}

/** A radio (`●` on, `○` off) or checkbox (`■` on, `□` off) mark in one cell. */
export function check(g, x, y, { on = false, kind = "radio", fg = "accent" } = {}) {
  g.put(x, y, kind === "checkbox" ? (on ? "■" : "□") : on ? "●" : "○", fg);
  return 1;
}

/** A label left in `labelFg` and a value right-aligned to column x + w - 1. Returns 1. */
export function kv(g, x, y, w, label, value, { fg = "accent", labelFg = "dim" } = {}) {
  const v = clip(String(value), w);
  g.textRight(x + w - 1, y, v, fg);
  g.line(x, y, label, { width: Math.max(0, w - len(v) - 1), fg: labelFg });
  return 1;
}

/** A section heading, clipped to `w`. Returns 1. */
export function heading(g, x, y, w, text, { fg = "dim" } = {}) {
  g.line(x, y, text, { width: w, fg });
  return 1;
}

/** Free text wrapped to `w` columns. Returns the rows used. */
export function note(g, x, y, w, text, { fg = "dim", maxLines } = {}) {
  return g.block(x, y, wrap(text, w), { width: w, fg, maxLines });
}

const CHECKED = new Set(["radio", "checkbox", "menuitemradio", "menuitemcheckbox", "switch"]);

/**
 * A list row; the whole row is one target. Columns, left to right: a selection bar (`▌` in
 * `selected` when on), `indent` blank columns, a check mark or a two-cell icon (or a slot for a
 * thumbnail, `slot: { id, w }`), the label, the value right-aligned (in `selected`), and the key
 * tag. A second line (`line2`, or the reason of a disabled row) sits under the label in `dim`.
 *
 * States: `state: "hover" | "focus"` fills the row with `hover`; `on` (or `selected`) draws the
 * label in `selected` with the bar; `disabled` draws in `ghostText`, and with a `reason` the row
 * stays focusable (`aria-disabled`) and shows the reason as its second line. The focus ring is
 * the renderer's. `role` is the target's role (`menuitem`, `menuitemradio`, `radio`, `tab` ...);
 * checkable roles get `aria-checked`. Returns the rows used (1 or 2).
 * @param {{ id: string, label: string, icon?: string, iconLabel?: string, check?: "radio" | "checkbox", slot?: { id: string, w: number, kind?: string }, value?: string, key?: string, indent?: number, state?: "rest" | "hover" | "focus", on?: boolean, selected?: boolean, disabled?: boolean, reason?: string, line2?: string, tone?: string, role?: string, aria?: object, attrs?: object, data?: object, className?: string, minH?: number }} o
 */
export function row(g, x, y, w, o) {
  const { id, label, icon, check: mark, slot, value, key: k, indent = 0, state = "rest", disabled = false, reason, tone = "accent", role, minH = 44 } = o;
  const on = !!(o.on || o.selected);
  const second = o.line2 ?? (disabled && reason ? reason : null);
  const h = second !== null && second !== undefined && second !== "" ? 2 : 1;
  const fg = disabled ? "ghostText" : on ? "selected" : tone;
  const bg = state === "hover" || state === "focus" ? "hover" : null;
  g.fill(x, y, w, h, " ", fg, bg);
  // The selection bar continues through the row's band (the renderer stretches cells marked so).
  if (on)
    for (let j = 0; j < h; j++) {
      g.put(x, y + j, "▌", "selected");
      g.cells[(y + j) * g.cols + x].stretch = true;
    }
  let c = x + 1 + indent;
  if (mark) {
    check(g, c, y, { on, kind: mark, fg });
    c += 2;
  } else if (slot) {
    g.slot(slot.id, c, y, slot.w, h, { kind: slot.kind ?? "image", box: true });
    c += slot.w + 1;
  } else if (icon) {
    g.icon(c, y, 2, 1, icon, fg, o.iconLabel ? { label: o.iconLabel } : undefined);
    c += 3;
  }
  let r = x + w - 2;
  if (k) r -= key(g, r, y, k, { align: "right", fg: disabled ? "ghostText" : on ? "selected" : "dim" }) + 1;
  if (value !== undefined && value !== null && value !== "") {
    const v = clip(String(value), Math.max(1, r - c - 1));
    g.textRight(r, y, v, disabled ? "ghostText" : "selected");
    r -= len(v) + 1;
  }
  g.line(c, y, label, { width: Math.max(0, r - c + 1), fg });
  if (h === 2) g.line(c, y + 1, second, { width: Math.max(0, x + w - 1 - c), fg: disabled ? "ghostText" : "dim" });
  const aria = { ...(o.aria ?? {}) };
  if (CHECKED.has(role) && aria.checked === undefined) aria.checked = String(on);
  if (role === "tab" && aria.selected === undefined) aria.selected = String(on);
  const t = { id, label: [label, value, disabled ? reason : null].filter(Boolean).join(", "), x, y, w, h, tone, toggle: false, on, disabled, ring: "focus" };
  if (reason) t.reason = reason;
  if (role) t.role = role;
  if (Object.keys(aria).length) t.aria = aria;
  for (const p of ["attrs", "data", "className"]) if (o[p]) t[p] = o[p];
  g.targets.push(t);
  if (minH) g.band(y, h, minH);
  return h;
}

/**
 * A text field: a slot for the consumer's <input> plus its line. `style: "underline"` draws `─`
 * under the slot row (two rows); `"frame"` draws a box around it (three rows). The line is in the
 * tone, `focus` when `state: "focus"`, `error` when `state: "error"`. A `label` goes left of the
 * slot on its row. Returns `{ rows, slot }`.
 * @param {{ id: string, label?: string, style?: "underline" | "frame", state?: "rest" | "focus" | "error", tone?: string, fg?: string, minH?: number }} o
 */
export function field(g, x, y, w, { id, label, style = "underline", state = "rest", tone = "accent", fg = "accent", minH = 0 }) {
  const line = state === "error" ? "error" : state === "focus" ? "focus" : tone;
  const lw = label ? len(label) + 1 : 0;
  if (style === "frame") {
    if (label) g.text(x, y + 1, label, "dim");
    const fx = x + lw;
    const fw = w - lw;
    g.fill(fx + 1, y, fw - 2, 1, "─", line);
    g.fill(fx + 1, y + 2, fw - 2, 1, "─", line);
    g.put(fx, y, "┌", line);
    g.put(fx + fw - 1, y, "┐", line);
    g.put(fx, y + 2, "└", line);
    g.put(fx + fw - 1, y + 2, "┘", line);
    g.put(fx, y + 1, "│", line);
    g.put(fx + fw - 1, y + 1, "│", line);
    const s = g.slot(id, fx + 2, y + 1, fw - 4, 1, { kind: "text", fg });
    if (minH) g.band(y + 1, 1, minH);
    return { rows: 3, slot: s };
  }
  if (label) g.text(x, y, label, "dim");
  const s = g.slot(id, x + lw, y, w - lw, 1, { kind: "text", fg });
  g.fill(x + lw, y + 1, w - lw, 1, "─", line);
  if (minH) g.band(y, 1, minH);
  return { rows: 2, slot: s };
}

/**
 * A segmented control: adjacent chips, one per option, the selected one inverted (`ink` on the
 * tone), the rest dim chips. A `radiogroup` of `radio` targets; Left and Right move and select
 * (the renderer's roving focus). `options` are strings or `{ id, label }`. Returns the columns used.
 * @param {{ id: string, options: (string | { id: string, label: string, disabled?: boolean, reason?: string })[], selected: string, tone?: string, label?: string, minH?: number }} o
 */
export function segmented(g, x, y, { id, options, selected, tone = "accent", label, minH = 44 }) {
  let c = x;
  const ids = [];
  for (const opt of options) {
    const o = typeof opt === "string" ? { id: opt, label: opt } : opt;
    const text = ` ${o.label} `;
    const on = o.id === selected;
    if (o.disabled) g.text(c, y, text, "ghostText", "ghost");
    else if (on) g.text(c, y, text, "ink", tone);
    else g.text(c, y, text, tone, `${tone}Off`);
    const tid = `${id}:${o.id}`;
    const t = {
      id: tid,
      label: o.label,
      x: c,
      y,
      w: len(text),
      h: 1,
      tone,
      toggle: false,
      on,
      disabled: !!o.disabled,
      role: "radio",
      aria: { checked: String(on) },
      data: { value: o.id },
    };
    if (o.reason) t.reason = o.reason;
    g.targets.push(t);
    ids.push(tid);
    c += len(text);
  }
  g.groups.push({ id, role: "radiogroup", label: label ?? id, ids });
  if (minH) g.band(y, 1, minH);
  return c - x;
}

/**
 * A tab bar: one block of `tabW` columns per item (an icon centred, or the label), the selected
 * one filled with `hover` and drawn in `selected`, the rest in `dim`. A `tablist` of `tab`
 * targets; Left and Right move and select. `tabW` defaults to the widest that fits `w`, from 3 to
 * 6 columns. Returns the columns used.
 * @param {{ id: string, items: { id: string, icon?: string, label: string }[], selected: string, tabW?: number, label?: string, minH?: number }} o
 */
export function tabs(g, x, y, w, { id, items, selected, tabW, label, minH = 44 }) {
  const tw = tabW ?? Math.max(3, Math.min(6, Math.floor(w / Math.max(1, items.length))));
  const ids = [];
  items.forEach((it, i) => {
    const on = it.id === selected;
    const at = x + i * tw;
    const fg = on ? "selected" : "dim";
    g.fill(at, y, tw, 1, " ", fg, on ? "hover" : null);
    if (it.icon) g.icon(at + Math.floor((tw - 2) / 2), y, 2, 1, it.icon, fg);
    else g.line(at + 1, y, it.label, { width: tw - 2, fg });
    const tid = `${id}:${it.id}`;
    g.targets.push({
      id: tid,
      label: it.label,
      x: at,
      y,
      w: tw,
      h: 1,
      tone: "accent",
      toggle: false,
      on,
      disabled: false,
      role: "tab",
      aria: { selected: String(on) },
      ring: "focus",
      tip: it.label,
      data: { value: it.id },
    });
    ids.push(tid);
  });
  g.groups.push({ id, role: "tablist", label: label ?? id, ids });
  if (minH) g.band(y, 1, minH);
  return items.length * tw;
}

/**
 * A slider: a meter of `w` one-cell segments lit to the value, and a slot of kind `range` over it
 * for a transparent native <input type="range"> (keyboard, drag and the value for screen readers
 * are the browser's). Returns `w`.
 * @param {{ id: string, value: number, min?: number, max?: number, tone?: string, glyph?: string, label?: string }} o
 */
export function slider(g, x, y, w, { id, value, min = 0, max = 100, tone = "accent", glyph = "▌", label }) {
  const on = Math.round(((value - min) / (max - min || 1)) * w);
  meter(g, x, y, { segments: w, on: Math.max(0, Math.min(w, on)), glyphs: glyph, tone });
  g.slot(id, x, y, w, 1, { kind: "range", box: true, label });
  return w;
}

/**
 * A toolbar of icon buttons: each item is a target `iconW + 2` columns wide (the icon between two
 * blank columns), `gap` blank columns apart. Rest: the icon in the tone, no chip; on: `selected`;
 * disabled: `ghostText`; `state: "hover" | "focus"` on an item fills it with `hover`. The label
 * is the button's name and tip. Returns the columns used.
 * @param {{ id: string, icon: string, label: string, on?: boolean, disabled?: boolean, reason?: string, state?: string, toggle?: boolean }[]} items
 * @param {{ tone?: string, gap?: number, iconW?: number, minH?: number, hitW?: number, align?: "left" | "right" }} [o]
 */
export function toolbar(g, x, y, items, { tone = "accent", gap = 2, iconW = 2, minH = 44, hitW = 44, align = "left" } = {}) {
  const bw = iconW + 2;
  const total = items.length * bw + Math.max(0, items.length - 1) * gap;
  let c = align === "right" ? x - total + 1 : x;
  for (const it of items) {
    const fg = it.disabled ? "ghostText" : it.on ? "selected" : tone;
    g.fill(c, y, bw, 1, " ", fg, it.state === "hover" || it.state === "focus" ? "hover" : null);
    g.icon(c + 1, y, iconW, 1, it.icon, fg);
    const t = {
      id: it.id,
      label: it.label,
      tip: it.label,
      x: c,
      y,
      w: bw,
      h: 1,
      tone,
      toggle: !!it.toggle,
      on: !!it.on,
      disabled: !!it.disabled,
      ring: "focus",
      hit: { w: hitW, h: minH },
    };
    if (it.reason) t.reason = it.reason;
    g.targets.push(t);
    c += bw + gap;
  }
  if (minH) g.band(y, 1, minH);
  return total;
}

/**
 * An icon-only button: a Material Symbols icon alone in a framed square (`┌─┐│└┘` in the tone,
 * a surface behind it snapped to the stroke, as `panel`), the whole box one target. `size` is a
 * size from spec/icons.json (`ib` 44 px, `close` 44 px with a 16 px icon, `step` 32 px, `bar`
 * 56 px, `row` an unboxed 20 px row icon) or `{ box, icon, boxed }` in CSS px; the box is the
 * whole number of cells nearest that size at `face` and `scale`, and the hit area keeps the CSS
 * px minimum (`minH`, 44) whatever the drawn box. States as `button`: rest in the tone, pressed
 * fills the box with the tone's dim shade, on draws the icon filled in `selected` (FILL 1, the
 * flag colour in landroid), disabled draws in `ghostText` (with a `reason` it stays focusable).
 * `label` is the button's name and tip; there is no caption. `state: "focus"` draws the focus
 * ring as if focused (for fixtures). Returns `{ cols, rows }`.
 * @param {{ id: string, icon: string, label: string, size?: string | { box: number, icon: number, boxed?: boolean }, face?: string, scale?: number, tone?: string, on?: boolean, pressed?: boolean, disabled?: boolean, reason?: string, toggle?: boolean, boxed?: boolean, state?: string, minH?: number }} o
 */
export function iconButton(g, x, y, o) {
  const {
    id,
    icon,
    label,
    size = "ib",
    face = "jgs-vector",
    scale = 1.25,
    tone = "accent",
    on = false,
    pressed = false,
    disabled = false,
    reason,
    toggle = false,
    minH = 44,
  } = o;
  const spec = typeof size === "string" ? icons.sizes[size] : size;
  const b = iconBox(o.boxed === undefined ? spec : { ...spec, boxed: o.boxed }, face, scale, faces);
  const { boxed } = b;
  const { cols, rows } = b;
  const line = disabled ? "ghostText" : on ? "selected" : tone;
  const fg = disabled ? "ghostText" : on ? "selected" : tone;
  const bg = pressed && !disabled ? `${tone}Off` : o.state === "hover" || o.state === "focus" ? "hover" : null;
  // The icon's block is the whole box, so it centres between the frame's strokes; the frame is
  // written over its blank cells.
  g.icon(x, y, cols, rows, icon, fg, { px: b.icon, fill: on });
  if (bg) g.fill(x, y, cols, rows, " ", fg, bg);
  if (boxed) {
    g.surfaces.push({ x, y, w: cols, h: rows });
    g.fill(x + 1, y, cols - 2, 1, "─", line);
    g.fill(x + 1, y + rows - 1, cols - 2, 1, "─", line);
    g.fill(x, y + 1, 1, rows - 2, "│", line);
    g.fill(x + cols - 1, y + 1, 1, rows - 2, "│", line);
    g.put(x, y, "┌", line);
    g.put(x + cols - 1, y, "┐", line);
    g.put(x, y + rows - 1, "└", line);
    g.put(x + cols - 1, y + rows - 1, "┘", line);
  }
  const t = { id, label, tip: label, x, y, w: cols, h: rows, tone, toggle, on, disabled, ring: "focus", hit: { w: minH, h: minH } };
  if (reason) t.reason = reason;
  if (o.state === "focus") t.focus = true;
  g.targets.push(t);
  return { cols, rows };
}
