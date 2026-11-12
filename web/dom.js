// The HTML renderer, the primary one. It draws the same grid as web/canvas.js, as positioned
// elements: every edge is a font-pixel position rounded to a whole device pixel (the rule the
// canvas renderer applies to its fills), so a bitmap face lands on exactly the device pixels the
// canvas draws (scripts/parity.mjs measures it). The elements sit in a stage laid out in device
// pixels and scaled by 1 / devicePixelRatio: a CSS length such as 9.333 px (14 device px at DPR
// 1.5) is not on the browser's 1/64 px layout grid and lands a device pixel off, while 14 px in
// the stage is exact. Layers, back to front, as in the canvas:
// surfaces, cell backgrounds, halos, glyphs, icons; then the targets, which are real <button>
// elements that are the chips themselves, so focus, keyboard, `click()` and the accessibility
// tree are the browser's. Text that is not a control is mirrored once, in reading order, into a
// visually hidden element; the painted cells are aria-hidden.
//
// Needs web/dom.css and fonts/fonts.css on the page.
import { resolve } from "./color.js";
import { fallbackFont, onFontsReady } from "./fonts.js";
import { gridBox } from "./metrics.js";
import { prefersReducedMotion, surfaceVisible, visibility } from "./motion.js";
import { canDraw, faces, glyphFor, synthRects } from "./spec.js";
import { minTarget as defaultMinTarget, placeInOrder, targetAttributes, wireButton } from "./targets.js";

/** The default icon family for `g.icon` blocks: Material Symbols, drawn by ligature name. */
export const ICON_FONT = "Material Symbols Sharp";

/**
 * The family the DOM draws a face in. The vector face goes through `jgs-vector-cell`, an alias of
 * the same woff2 in fonts/fonts.css with `ascent-override: 85.714%`, `descent-override: 21.429%`
 * and `line-gap-override: 0%` (480 and 120 of the font's 560 units), so its line box is exactly
 * the 7 × 15 cell. The font's own hhea metrics (524 + 124 = 648 units) make the browser round
 * ascent and descent per size and move the glyph within the line, which broke vertical frame
 * strokes in DOM text (measured in the review). The font files are not modified (OFL reserved
 * names). Support for the override descriptors in Safari and WKWebView is unverified, so the
 * baseline is also measured at load (`baselineOffset`) and corrected per render: where the
 * overrides are ignored, the measured offset still puts the baseline on the canvas's row.
 */
export function domFamily(face) {
  const f = faces[face];
  return f.vector ? `"jgs-vector-cell", ${f.file}` : f.file;
}

const baselines = new Map();
onFontsReady(() => baselines.clear());

/**
 * Where the browser puts the baseline, in CSS px from the top of a line box of `lineHeight`
 * CSS px, for `font`. Measured with a zero-height inline-block on the baseline; cached until
 * `ready()` runs again.
 */
export function baselineOffset(font, lineHeight) {
  const key = `${font}|${lineHeight}`;
  if (baselines.has(key)) return baselines.get(key);
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;left:-9999px;top:0;white-space:pre;font:${font};line-height:${lineHeight}px;`;
  const mark = document.createElement("span");
  mark.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline;";
  probe.append("X", mark);
  document.body.append(probe);
  const v = mark.getBoundingClientRect().top - probe.getBoundingClientRect().top;
  probe.remove();
  baselines.set(key, v);
  return v;
}

const roots = new WeakMap();

/**
 * Draws a grid into `root` as elements. Calling it again with a new grid repaints the cells and
 * reconciles the targets by id: a target that stays keeps its <button> (focus, hover and pointer
 * capture survive), new ids get one, removed ids lose theirs.
 *
 * Targets: the button is the chip. Toggles carry `aria-pressed`; a disabled target with a
 * `reason` stays focusable as `aria-disabled` and `onActivate(target, reason)` gets the reason;
 * without a reason it is `disabled`. Activation is on `click` (pointer, Enter, Space,
 * `element.click()`, assistive technology); `onPress(id | null)` reports the pressed state.
 * The focus ring is a CSS outline one font pixel wide, one font pixel outside the chip, on
 * `:focus-visible` and on the target whose id is `focused` (a controller's focus). The hit area
 * grows to `minTarget` CSS px (44 on coarse pointers, 24 otherwise) or the target's own
 * `hit: { w, h }`, which need not be whole cells.
 *
 * @param {HTMLElement} root
 * @param {import("./grid.js").Grid} g
 * @param {{ face: string, scale: number, theme: Record<string, string>, dpr?: number, snap?: boolean, fill?: number, fixes?: boolean, focused?: string | null, now?: number, reduceMotion?: boolean, fallback?: string | { family: string, weight?: string | number }, iconFont?: string, minTarget?: number, onPress?: (id: string | null) => void, onActivate?: (target: object, reason: string | null) => void, onFocus?: (id: string | null) => void }} o
 * @returns {{ cellW: number, cellH: number, width: number, height: number, k: number }}
 */
export function renderDOM(root, g, o) {
  const {
    face,
    scale,
    theme,
    dpr = globalThis.devicePixelRatio || 1,
    snap = false,
    fill = 1,
    fixes = true,
    focused = null,
    now = globalThis.performance?.now() ?? 0,
    reduceMotion = prefersReducedMotion(),
    fallback = "",
    iconFont = ICON_FONT,
    minTarget = defaultMinTarget(),
  } = o;
  const f = faces[face];
  const box = gridBox(face, scale, g.cols, g.rows, dpr, snap);
  const { k } = box;
  const [cw, chh] = f.cell;
  const R = Math.round;
  const D = (fpx) => R(fpx * k); // font px to whole device px
  const css = (dev) => `${dev}px`; // stage units are device px
  const color = (role) => resolve(theme, role);
  const glyph = (ch) => glyphFor(face, ch, fixes);
  const vis = visibility(g, now, reduceMotion);
  const shown = (c, i) => c.ch !== " " && (!vis || vis[i] === 1);
  const fb = fallbackFont(fallback);
  const missing = (ch) => fb && !canDraw(face, ch);
  const bitmap = !f.vector;

  let state = roots.get(root);
  if (!state) {
    root.classList.add("sa-dom");
    const paint = document.createElement("div");
    paint.className = "sa-paint";
    paint.setAttribute("aria-hidden", "true");
    const text = document.createElement("div");
    text.className = "sa-text";
    const targets = document.createElement("div");
    targets.className = "sa-buttons";
    const stage = document.createElement("div");
    stage.className = "sa-stage";
    stage.append(paint, targets);
    root.replaceChildren(stage, text);
    state = { stage, paint, text, targets, els: new Map(), handlers: o };
    roots.set(root, state);
  }
  state.handlers = o;
  root.toggleAttribute("data-bitmap", bitmap);
  root.style.width = `${box.cssWidth}px`;
  root.style.height = `${box.cssHeight}px`;
  Object.assign(state.stage.style, { width: css(box.width), height: css(box.height), transform: dpr === 1 ? "" : `scale(${1 / dpr})` });
  // One font pixel in stage px, for the focus ring and the vector halo.
  root.style.setProperty("--sa-px", `${k}px`);
  const fontPx = f.size * k;
  const family = domFamily(face);
  const font = `${fontPx}px ${family}`;
  // Cell boxes vary by a device pixel at fractional ratios; the line box is the nominal cell, and
  // each glyph is moved so its baseline lands on the cell's top plus the baseline, rounded.
  const lineH = chh * k;
  const dy = D(f.baseline) - baselineOffset(font, lineH);
  root.style.setProperty("--sa-font", font);
  root.style.setProperty("--sa-lh", `${lineH}px`);
  root.style.setProperty("--sa-dy", `${dy}px`);

  const targetAt = new Map();
  for (const t of g.targets) for (let j = 0; j < t.h; j++) for (let i = 0; i < t.w; i++) targetAt.set((t.y + j) * g.cols + t.x + i, t);

  const el = (tag, cls, x0, y0, x1, y1, ox = 0, oy = 0) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    const s = e.style;
    s.left = css(x0 - ox);
    s.top = css(y0 - oy);
    s.width = css(x1 - x0);
    s.height = css(y1 - y0);
    return e;
  };
  const cellBox = (i) => {
    const x = (i % g.cols) * cw;
    const y = Math.floor(i / g.cols) * chh;
    return [D(x), D(y), D(x + cw), D(y + chh), x, y];
  };

  // Surfaces run from the top-left stroke to the bottom-right stroke, so the line is the edge.
  const paint = document.createDocumentFragment();
  const [sx, sy] = f.stroke;
  const panel = color("panel");
  if (fill > 0 && panel)
    for (const p of g.surfaces) {
      if (!surfaceVisible(g, p, now, reduceMotion)) continue;
      const e = el("div", "sa-s", D(p.x * cw + sx), D(p.y * chh + sy), D((p.x + p.w - 1) * cw + sx + 1), D((p.y + p.h - 1) * chh + sy + 1));
      e.style.background = panel;
      if (fill < 1) e.style.opacity = String(fill);
      paint.append(e);
    }

  // Cell backgrounds, merged into runs of one colour along a row. Chips are drawn by their button.
  for (let y = 0; y < g.rows; y++) {
    let x = 0;
    while (x < g.cols) {
      const i = y * g.cols + x;
      const c = g.cells[i];
      const bg = c.bg && !targetAt.has(i) && !(vis && vis[i] === 0) ? color(c.bg) : null;
      if (!bg) {
        x++;
        continue;
      }
      let n = 1;
      while (x + n < g.cols) {
        const j = i + n;
        const d = g.cells[j];
        if (targetAt.has(j) || (vis && vis[j] === 0) || !d.bg || color(d.bg) !== bg) break;
        n++;
      }
      const e = el("div", "sa-b", D(x * cw), D(y * chh), D((x + n) * cw), D((y + 1) * chh));
      e.style.background = bg;
      paint.append(e);
      x += n;
    }
  }

  // A glyph in one colour, positioned in its cell. Bitmap faces clip to the cell, as the canvas's
  // masks do (jgs5 has glyphs wider than its cell); the vector face does not, as fillText does not.
  // jgs9's synthesized frame glyphs are one-font-pixel strokes; `grow` widens them for a halo.
  const glyphEl = (i, ch, fg, ox = 0, oy = 0, shiftX = 0, shiftY = 0) => {
    const [x0, y0, x1, y1] = cellBox(i);
    const e = el("span", "sa-g", x0 + shiftX, y0 + shiftY, x1 + shiftX, y1 + shiftY, ox, oy);
    e.style.color = fg;
    const t = document.createElement("i");
    t.textContent = ch;
    e.append(t);
    return e;
  };
  const synthEls = (i, rects, fg, grow, out, ox = 0, oy = 0) => {
    const [, , , , cx, cy] = cellBox(i);
    for (const [a, b, c, d] of rects) {
      const e = el("div", "sa-r", D(cx + a - grow), D(cy + b - grow), D(cx + c + grow), D(cy + d + grow), ox, oy);
      e.style.background = fg;
      out.append(e);
    }
  };
  const fallbackEl = (i, ch, fg, ox = 0, oy = 0) => {
    const [x0, y0, x1, y1] = cellBox(i);
    const e = el("span", "sa-f", x0, y0, x1, y1, ox, oy);
    Object.assign(e.style, { color: fg, font: `${fb.weight} ${R(chh * k * 0.8)}px "${fb.family}"`, lineHeight: css(y1 - y0) });
    e.textContent = ch;
    return e;
  };

  // Halos. Bitmap faces: the clipped glyph drawn eight times, one font pixel out in each
  // direction, which is the canvas's dilated mask exactly. (Eight zero-blur text-shadows on one
  // element would be clipped by the cell's own overflow, and a later run's shadow would cover an
  // earlier run's glyph; a separate layer under every glyph avoids both.) The vector face: a
  // text stroke two font pixels wide under a transparent fill, as the canvas's strokeText.
  const world = color("world");
  if (world)
    g.cells.forEach((c, i) => {
      if (!c.halo || !shown(c, i) || missing(c.ch)) return;
      const ch = glyph(c.ch);
      const rects = synthRects(face, ch);
      if (rects) return synthEls(i, rects, world, 1, paint);
      if (bitmap) {
        for (const ddy of [-k, 0, k])
          for (const ddx of [-k, 0, k]) {
            if (!ddx && !ddy) continue;
            paint.append(glyphEl(i, ch, world, 0, 0, ddx, ddy));
          }
      } else {
        const e = glyphEl(i, ch, "transparent");
        e.classList.add("sa-h");
        e.style.setProperty("--sa-halo", world);
        paint.append(e);
      }
    });

  // Glyphs.
  const drawCell = (i, out, ox = 0, oy = 0) => {
    const c = g.cells[i];
    if (!shown(c, i)) return;
    if (missing(c.ch)) {
      const fg = color(c.fg);
      if (fg) out.append(fallbackEl(i, c.ch, fg, ox, oy));
      return;
    }
    const fg = color(c.fg);
    if (!fg) return;
    const ch = glyph(c.ch);
    const rects = synthRects(face, ch);
    if (rects) synthEls(i, rects, fg, 0, out, ox, oy);
    else out.append(glyphEl(i, ch, fg, ox, oy));
  };
  g.cells.forEach((_, i) => {
    if (!targetAt.has(i)) drawCell(i, paint);
  });

  // Icons: a ligature name in the icon font, centred in its block of cells and clipped to it.
  for (const ic of g.icons ?? []) {
    if (vis && vis[ic.y * g.cols + ic.x] === 0) continue;
    const fg = color(ic.fg);
    if (!fg) continue;
    const e = el("span", "sa-icon", D(ic.x * cw), D(ic.y * chh), D((ic.x + ic.w) * cw), D((ic.y + ic.h) * chh));
    Object.assign(e.style, {
      color: fg,
      fontFamily: `"${ic.font ?? iconFont}"`,
      fontWeight: String(ic.weight ?? "normal"),
      fontSize: `${R(Math.min(ic.w * cw, ic.h * chh) * k)}px`,
    });
    e.textContent = ic.name;
    paint.append(e);
  }
  state.paint.replaceChildren(paint);

  // The text mirror: every row's non-control text, in reading order.
  // An icon with a `label` reads as that label where its block starts.
  const iconLabel = new Map((g.icons ?? []).filter((ic) => ic.label).map((ic) => [ic.y * g.cols + ic.x, ic.label]));
  const lines = [];
  for (let y = 0; y < g.rows; y++) {
    let s = "";
    for (let x = 0; x < g.cols; x++) {
      const i = y * g.cols + x;
      s += iconLabel.has(i) ? ` ${iconLabel.get(i)} ` : targetAt.has(i) ? " " : g.cells[i].ch;
    }
    s = s
      .replace(/[─│┌┐└┘├┤┬┴┼▏▕]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (s) lines.push(s);
  }
  const mirror = lines.join("\n");
  if (state.text.textContent !== mirror) state.text.textContent = mirror;

  // Targets, reconciled by id.
  const next = new Map();
  const order = g.targets.map((t) => {
    let entry = state.els.get(t.id);
    if (!entry) {
      const b = document.createElement("button");
      b.className = "sa-t";
      entry = { b, t };
      wireButton(
        b,
        () => entry.t,
        () => state.handlers,
      );
    }
    entry.t = t;
    next.set(t.id, entry);
    const { b } = entry;
    targetAttributes(b, t);
    b.setAttribute("aria-label", t.label);
    const x0 = D(t.x * cw);
    const y0 = D(t.y * chh);
    const x1 = D((t.x + t.w) * cw);
    const y1 = D((t.y + t.h) * chh);
    Object.assign(b.style, { left: css(x0), top: css(y0), width: css(x1 - x0), height: css(y1 - y0) });
    // Hit growth: CSS px minimums, converted to stage (device) px.
    const w = x1 - x0;
    const h = y1 - y0;
    b.style.setProperty("--sa-gx", `${Math.max(0, (Math.max(minTarget, t.hit?.w ?? 0) * dpr - w) / 2)}px`);
    b.style.setProperty("--sa-gy", `${Math.max(0, (Math.max(minTarget, t.hit?.h ?? 0) * dpr - h) / 2)}px`);
    const ring = color(t.tone);
    if (ring) b.style.setProperty("--sa-ring", ring);
    b.classList.toggle("sa-focus", t.id === focused);
    // The chip: its cells' backgrounds and glyphs, positioned inside the button.
    const chip = document.createDocumentFragment();
    for (let j = 0; j < t.h; j++)
      for (let i = 0; i < t.w; i++) {
        const idx = (t.y + j) * g.cols + t.x + i;
        const c = g.cells[idx];
        if (vis && vis[idx] === 0) continue;
        const bg = c.bg ? color(c.bg) : null;
        if (!bg) continue;
        const [cx0, cy0, cx1, cy1] = cellBox(idx);
        const e = el("span", "sa-b", cx0, cy0, cx1, cy1, x0, y0);
        e.style.background = bg;
        chip.append(e);
      }
    for (let j = 0; j < t.h; j++) for (let i = 0; i < t.w; i++) drawCell((t.y + j) * g.cols + t.x + i, chip, x0, y0);
    b.replaceChildren(chip);
    return b;
  });
  state.els = next;
  placeInOrder(state.targets, order);
  return { cellW: box.cellW, cellH: box.cellH, width: box.cssWidth, height: box.cssHeight, k };
}
