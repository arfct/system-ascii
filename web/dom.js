// The HTML renderer, the primary one. It draws the same grid as web/canvas.js, as positioned
// elements: every edge is a font-pixel position rounded to a whole device pixel (the rule the
// canvas renderer applies to its fills), so a bitmap face lands on exactly the device pixels the
// canvas draws (scripts/parity.mjs measures it). The elements sit in a stage laid out in device
// pixels and scaled by 1 / devicePixelRatio: a CSS length such as 9.333 px (14 device px at DPR
// 1.5) is not on the browser's 1/64 px layout grid and lands a device pixel off, while 14 px in
// the stage is exact. Layers, back to front, as in the canvas:
// surfaces, cell backgrounds, halos, glyphs, icons; then one layer, in reading order, of the
// targets (real <button> elements that are the chips themselves, so focus, keyboard, `click()`
// and the accessibility tree are the browser's), the slots (the consumer's own elements) and the
// scroll regions (native scroll containers with the body grid drawn inside). Text that is not a control is mirrored once, in reading order, into a
// visually hidden element; the painted cells are aria-hidden.
//
// Needs web/dom.css and fonts/fonts.css on the page.
import { resolve } from "./color.js";
import { fallbackFont, onFontsReady } from "./fonts.js";
import { iconAxes, strokeWidth } from "./icons.js";
import { domBox, targetBoxes } from "./layout.js";
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

// Glyphs whose strokes run the full cell height, and the arms that continue through a band's
// added space: `u` above the cell, `d` below. The extension is the face's own `│` (or the block
// itself), clipped to the gap, so it lands on the stroke's exact columns in every face.
// A cell marked `stretch` (a row's selection bar) continues both ways whatever its glyph.
const STRETCH = { "│": "ud", "├": "ud", "┤": "ud", "┼": "ud", "┬": "d", "┌": "d", "┐": "d", "┴": "u", "└": "u", "┘": "u" };
const FRAME_ARM = "│├┤┼┬┌┐┴└┘";

// Characters the text mirror leaves out: box drawing and block elements are drawing, not text.
const DRAWING = /[\u2500-\u259f]/g;

/**
 * Draws a grid into `root` as elements. Calling it again with a new grid repaints the cells and
 * reconciles the targets, slots and scroll regions by id: one that stays keeps its element (focus,
 * hover, pointer capture, a typed value and a scroll position survive), new ids get one, removed
 * ids lose theirs.
 *
 * Targets: the button is the chip. Toggles carry `aria-pressed`; a target's `role`, `aria`,
 * `attrs`, `className` and `data` are applied (web/targets.js); a disabled target with a `reason`
 * stays focusable as `aria-disabled` and `onActivate(target, reason)` gets the reason; without a
 * reason it is `disabled`. Activation is on `click` (pointer, Enter, Space, `element.click()`,
 * assistive technology); `onPress(id | null)` reports the pressed state and `onHover(id | null)`
 * a mouse pointer over a target. The focus ring is a CSS outline one font pixel wide, one font
 * pixel outside the chip, on `:focus-visible` and on the target whose id is `focused` (a
 * controller's focus, see `nextTarget`). The hit area grows to `minTarget` CSS px (44 on coarse
 * pointers, 24 otherwise) or the target's own `hit: { w, h }`, and stops halfway to a neighbour.
 *
 * Groups (`g.groups`, from `segmented` and `tabs`) wrap their targets in one element with the
 * group's role (`radiogroup`, `tablist`); only the selected member is in the Tab order, and Left
 * and Right (Up and Down too in a radiogroup), Home and End move to a member and activate it.
 *
 * Slots: `slots` maps a slot id to the consumer's element (an <input>, <img>, iframe), placed
 * over the slot's cells in a `.sa-slot` box; web/dom.css gives inputs the face at the cell size.
 * Scroll regions: the body grid is drawn by renderDOM itself in a native scroll container over
 * the region's cells; `onScroll(id, { top, height, viewport })` reports its position in CSS px.
 *
 * Bands (`g.band`) make rows at least a CSS px height; the text stays on the cell grid inside.
 * The text mirror (`mirror: { role, live, label }`) holds the grid's non-control text in reading
 * order for screen readers and scripts; the painted cells are aria-hidden.
 *
 * @param {HTMLElement} root
 * @param {import("./grid.js").Grid} g
 * @param {{ face: string, scale: number, theme: Record<string, string>, dpr?: number, snap?: boolean, fill?: number, fixes?: boolean, focused?: string | null, now?: number, reduceMotion?: boolean, fallback?: string | { family: string, weight?: string | number }, iconFont?: string, minTarget?: number, slots?: Record<string, Element> | Map<string, Element>, mirror?: { role?: string, live?: string, label?: string }, onPress?: (id: string | null) => void, onActivate?: (target: object, reason: string | null) => void, onFocus?: (id: string | null) => void, onHover?: (id: string | null) => void, onScroll?: (id: string, at: { top: number, height: number, viewport: number }) => void }} o
 * @returns {{ cellW: number, cellH: number, width: number, height: number, k: number, scrolls: Record<string, { top: number, height: number, viewport: number }> }}
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
    mirror = {},
  } = o;
  const nested = !!o._nested;
  const f = faces[face];
  const box = domBox(g, face, scale, dpr, snap);
  const { k, rows } = box;
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
  const slotEls = o.slots instanceof Map ? o.slots : new Map(Object.entries(o.slots ?? {}));

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
    state = { stage, paint, text, targets, els: new Map(), groups: new Map(), slots: new Map(), scrolls: new Map(), handlers: o };
    roots.set(root, state);
  }
  state.handlers = o;
  root.toggleAttribute("data-bitmap", bitmap);
  // A nested root (a scroll body) sits inside its parent's stage, which is already in device px.
  const outerW = nested ? box.width : box.cssWidth;
  const outerH = nested ? box.height : box.cssHeight;
  root.style.width = `${outerW}px`;
  root.style.height = `${outerH}px`;
  Object.assign(state.stage.style, { width: css(box.width), height: css(box.height), transform: dpr === 1 || nested ? "" : `scale(${1 / dpr})` });
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
  const covered = new Set();
  for (const s of [...(g.slots ?? []), ...(g.scrolls ?? [])])
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) covered.add((s.y + j) * g.cols + s.x + i);

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
  // A cell's glyph box: [x0, y0, x1, y1] in device px, its font-px origin, and its row's shift.
  const cellBox = (i) => {
    const col = i % g.cols;
    const row = Math.floor(i / g.cols);
    const x = col * cw;
    const y = row * chh;
    const s = rows.shift(row);
    return [D(x), D(y) + s, D(x + cw), D(y + chh) + s, x, y, s, row];
  };
  // A cell's background box: the glyph box, stretched to its row's full height in a band.
  const bgBox = (i) => {
    const col = i % g.cols;
    const row = Math.floor(i / g.cols);
    return [D(col * cw), rows.top(row), D((col + 1) * cw), rows.bottom(row)];
  };

  // Surfaces run from the top-left stroke to the bottom-right stroke, so the line is the edge.
  const paint = document.createDocumentFragment();
  const [sx, sy] = f.stroke;
  const panel = color("panel");
  if (fill > 0 && panel)
    for (const p of g.surfaces) {
      if (!surfaceVisible(g, p, now, reduceMotion)) continue;
      const yb = p.y + p.h - 1;
      const e = el(
        "div",
        "sa-s",
        D(p.x * cw + sx),
        D(p.y * chh + sy) + rows.shift(p.y),
        D((p.x + p.w - 1) * cw + sx + 1),
        D(yb * chh + sy + 1) + rows.shift(yb),
      );
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
      const [x0, y0] = bgBox(i);
      const [, , x1, y1] = bgBox(i + n - 1);
      const e = el("div", "sa-b", x0, y0, x1, y1);
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
    const [, , , , cx, cy, s] = cellBox(i);
    for (const [a, b, c, d] of rects) {
      const e = el("div", "sa-r", D(cx + a - grow), D(cy + b - grow) + s, D(cx + c + grow), D(cy + d + grow) + s, ox, oy);
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
  // A stroke continued through a band's added space: the face's own `│` (or the block glyph),
  // clipped to the gap and repeated down it.
  const stretchEls = (i, ch, fg, out, ox = 0, oy = 0) => {
    const arms = g.cells[i].stretch ? "ud" : STRETCH[ch];
    if (!arms) return;
    const [x0, gy0, x1, gy1, , , , row] = cellBox(i);
    const fillCh = FRAME_ARM.includes(ch) ? glyph("│") : ch;
    const gaps = [];
    if (arms.includes("u") && rows.padAbove[row] > 0) gaps.push([rows.top(row), gy0]);
    if (arms.includes("d") && rows.padBelow[row] > 0) gaps.push([gy1, rows.bottom(row)]);
    const ch0 = gy1 - gy0;
    for (const [top, bottom] of gaps) {
      const clipEl = el("div", "sa-x", x0, top, x1, bottom, ox, oy);
      const rects = synthRects(face, fillCh);
      for (let y = top; y < bottom; y += ch0) {
        if (rects) {
          for (const [a, , c] of rects.filter((r) => r[3] - r[1] >= chh)) {
            const e = el("div", "sa-r", D((i % g.cols) * cw + a) - x0, y - top, D((i % g.cols) * cw + c) - x0, y - top + ch0);
            e.style.background = fg;
            clipEl.append(e);
          }
        } else {
          const e = el("span", "sa-g", 0, y - top, x1 - x0, y - top + ch0);
          e.style.color = fg;
          const t = document.createElement("i");
          t.textContent = fillCh;
          e.append(t);
          clipEl.append(e);
        }
      }
      out.append(clipEl);
    }
  };

  // The vector face's vertical strokes end in round caps half a font px long, flush with the cell
  // (the outline runs exactly from the cell's top to its bottom), so two cells' strokes meet cap to
  // cap and the stroke narrows at every joint by a device px or two. Where a vertical arm joins
  // the cell above or below (or a band's added space), the glyph is clipped `capDev` device px
  // short of that edge and the rest, to the row's edge, is drawn with the straight middle of the
  // face's `│`, so the stroke has the same columns and coverage from end to end.
  const capDev = Math.ceil(k / 2 + 0.5);
  const armsAt = (j) => {
    const d = g.cells[j];
    return d && shown(d, j) && !missing(d.ch) ? (STRETCH[d.ch] ?? "") : "";
  };
  const joints = (i, ch) => {
    if (bitmap || g.cells[i].stretch || !STRETCH[ch]) return null;
    const col = i % g.cols;
    const row = (i - col) / g.cols;
    const up = STRETCH[ch].includes("u") && (rows.padAbove[row] > 0 || (row > 0 && armsAt(i - g.cols).includes("d")));
    const down = STRETCH[ch].includes("d") && (rows.padBelow[row] > 0 || (row < g.rows - 1 && armsAt(i + g.cols).includes("u")));
    return up || down ? { up, down } : null;
  };
  const jointEls = (i, { up, down }, fg, out, ox = 0, oy = 0) => {
    const [x0, gy0, x1, gy1, , , , row] = cellBox(i);
    const ch0 = gy1 - gy0;
    const step = Math.max(1, ch0 - 3 * capDev);
    const spans = [];
    if (up) spans.push([rows.top(row), gy0 + capDev]);
    if (down) spans.push([gy1 - capDev, rows.bottom(row)]);
    for (const [a, b] of spans)
      for (let s = a; s < b; s += step) {
        const clipEl = el("div", "sa-x", x0, s, x1, Math.min(b, s + step), ox, oy);
        const e = el("span", "sa-g", 0, -capDev, x1 - x0, ch0 - capDev);
        e.style.color = fg;
        const t = document.createElement("i");
        t.textContent = glyph("│");
        e.append(t);
        clipEl.append(e);
        out.append(clipEl);
      }
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
    const joint = !rects && joints(i, c.ch);
    if (joint) {
      const e = glyphEl(i, ch, fg, ox, oy);
      const [, y0, , y1] = cellBox(i);
      const top = joint.up ? capDev : -9999;
      const bottom = joint.down ? y1 - y0 - capDev : 9999;
      e.style.clipPath = `polygon(-9999px ${top}px, 9999px ${top}px, 9999px ${bottom}px, -9999px ${bottom}px)`;
      out.append(e);
      return jointEls(i, joint, fg, out, ox, oy);
    }
    if (rects) synthEls(i, rects, fg, 0, out, ox, oy);
    else out.append(glyphEl(i, ch, fg, ox, oy));
    stretchEls(i, c.ch, fg, out, ox, oy);
  };
  g.cells.forEach((_, i) => {
    if (!targetAt.has(i)) drawCell(i, paint);
  });

  // Icons: a ligature name in the icon font, centred in its block of cells and clipped to it. Its
  // axes come from spec/icons.json: the weight that makes its stroke as wide as the face's, the
  // optical size from its size in CSS px, FILL 1 when the icon is filled. An icon inside a target
  // is drawn by the target, above the chip.
  const strokeDev = strokeWidth(face) * k;
  const iconEl = (ic, ox = 0, oy = 0) => {
    const fg = color(ic.fg);
    if (!fg) return null;
    const x0 = D(ic.x * cw);
    const x1 = D((ic.x + ic.w) * cw);
    const y0 = rows.glyph(ic.y);
    const y1 = rows.glyph(ic.y + ic.h - 1) + D(chh);
    const sizeDev = ic.px ? R(ic.px * dpr) : R(Math.min(x1 - x0, y1 - y0));
    const e = el("span", "sa-icon", x0, y0, x1, y1, ox, oy);
    const axes = iconAxes(sizeDev, strokeDev, dpr, { fill: ic.fill });
    Object.assign(e.style, {
      color: fg,
      fontFamily: `"${ic.font ?? iconFont}"`,
      fontWeight: String(ic.weight ?? "normal"),
      fontSize: `${sizeDev}px`,
    });
    if (!ic.font && ic.axes !== false) e.style.fontVariationSettings = axes.css;
    e.textContent = ic.name;
    return e;
  };
  const iconTarget = new Map();
  for (const ic of g.icons ?? []) {
    if (vis && vis[ic.y * g.cols + ic.x] === 0) continue;
    const t = targetAt.get(ic.y * g.cols + ic.x);
    if (t) {
      if (!iconTarget.has(t)) iconTarget.set(t, []);
      iconTarget.get(t).push(ic);
      continue;
    }
    const e = iconEl(ic);
    if (e) paint.append(e);
  }
  state.paint.replaceChildren(paint);

  // The text mirror: every row's non-control text, in reading order. An icon with a `label`
  // reads as that label where its block starts; box drawing and block elements are left out.
  const iconLabel = new Map((g.icons ?? []).filter((ic) => ic.label).map((ic) => [ic.y * g.cols + ic.x, ic.label]));
  const lines = [];
  for (let y = 0; y < g.rows; y++) {
    let s = "";
    for (let x = 0; x < g.cols; x++) {
      const i = y * g.cols + x;
      s += iconLabel.has(i) && !targetAt.has(i) ? ` ${iconLabel.get(i)} ` : targetAt.has(i) || covered.has(i) ? " " : g.cells[i].ch;
    }
    s = s.replace(DRAWING, " ").replace(/\s+/g, " ").trim();
    if (s) lines.push(s);
  }
  const text = lines.join("\n");
  if (state.text.textContent !== text) state.text.textContent = text;
  for (const [attr, v] of [
    ["role", mirror.role],
    ["aria-live", mirror.live],
    ["aria-label", mirror.label],
  ])
    if (v) state.text.setAttribute(attr, v);
    else state.text.removeAttribute(attr);

  // Targets, reconciled by id.
  const boxes = new Map(targetBoxes(g, face, box, minTarget, dpr).map((b) => [b.id, b]));
  const next = new Map();
  const targetEls = g.targets.map((t) => {
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
    const { x0, y0, x1, y1, grow } = boxes.get(t.id);
    Object.assign(b.style, { left: css(x0), top: css(y0), width: css(x1 - x0), height: css(y1 - y0) });
    b.style.setProperty("--sa-gl", `${grow.l}px`);
    b.style.setProperty("--sa-gr", `${grow.r}px`);
    b.style.setProperty("--sa-gt", `${grow.t}px`);
    b.style.setProperty("--sa-gb", `${grow.b}px`);
    const ring = color(t.ring ?? t.tone);
    if (ring) b.style.setProperty("--sa-ring", ring);
    b.classList.toggle("sa-focus", t.id === focused || !!t.focus);
    // The chip: its cells' backgrounds and glyphs, positioned inside the button.
    const chip = document.createDocumentFragment();
    for (let j = 0; j < t.h; j++)
      for (let i = 0; i < t.w; i++) {
        const idx = (t.y + j) * g.cols + t.x + i;
        const c = g.cells[idx];
        if (vis && vis[idx] === 0) continue;
        const bg = c.bg ? color(c.bg) : null;
        if (!bg) continue;
        const [cx0, cy0, cx1, cy1] = bgBox(idx);
        const e = el("span", "sa-b", cx0, cy0, cx1, cy1, x0, y0);
        e.style.background = bg;
        chip.append(e);
      }
    for (let j = 0; j < t.h; j++) for (let i = 0; i < t.w; i++) drawCell((t.y + j) * g.cols + t.x + i, chip, x0, y0);
    for (const ic of iconTarget.get(t) ?? []) {
      const e = iconEl(ic, x0, y0);
      if (e) chip.append(e);
    }
    b.replaceChildren(chip);
    return b;
  });
  state.els = next;

  // Groups: one element per group with its role; members keep their order inside it.
  const nextGroups = new Map();
  const groupOf = new Map();
  for (const gr of g.groups ?? []) {
    let w = state.groups.get(gr.id);
    if (!w) {
      w = document.createElement("div");
      w.className = "sa-group";
      w.addEventListener("keydown", (e) => roveKey(w, e));
      state.groups.set(gr.id, w);
    }
    w.setAttribute("role", gr.role);
    if (gr.label) w.setAttribute("aria-label", gr.label);
    w.dataset.group = gr.id;
    nextGroups.set(gr.id, w);
    const members = gr.ids.map((id) => next.get(id)?.b).filter(Boolean);
    // Roving focus: only the selected member (or the first) is in the Tab order.
    const sel = gr.ids.findIndex((id) => next.get(id)?.t.on);
    members.forEach((b, i) => {
      b.tabIndex = i === (sel < 0 ? 0 : sel) ? 0 : -1;
    });
    placeInOrder(w, members);
    for (const id of gr.ids) groupOf.set(id, w);
  }
  state.groups = nextGroups;

  // Slots: the consumer's element in a box over the slot's cells.
  const nextSlots = new Map();
  const slotItems = (g.slots ?? []).map((s) => {
    let box = state.slots.get(s.id);
    if (!box) {
      box = document.createElement("div");
      box.className = "sa-slot";
    }
    nextSlots.set(s.id, box);
    box.dataset.slot = s.id;
    if (s.kind) box.dataset.kind = s.kind;
    else delete box.dataset.kind;
    const x0 = D(s.x * cw);
    const x1 = D((s.x + s.w) * cw);
    const y0 = s.box ? rows.top(s.y) : rows.glyph(s.y);
    const y1 = s.box ? rows.bottom(s.y + s.h - 1) : rows.glyph(s.y + s.h - 1) + D(chh);
    Object.assign(box.style, { left: css(x0), top: css(y0), width: css(x1 - x0), height: css(y1 - y0) });
    const fg = color(s.fg ?? "accent");
    if (fg) box.style.setProperty("--sa-slot-fg", fg);
    const ring = color("focus") ?? fg;
    if (ring) box.style.setProperty("--sa-ring", ring);
    const child = slotEls.get(s.id);
    if (child && child.parentElement !== box) box.replaceChildren(child);
    if (!child && box.firstChild) box.replaceChildren();
    if (child && s.label && !child.getAttribute("aria-label")) child.setAttribute("aria-label", s.label);
    return { y: s.y, x: s.x, node: box };
  });
  state.slots = nextSlots;

  // Scroll regions: a native scroll container over the region's cells, the body drawn inside it.
  const nextScrolls = new Map();
  const scrollAt = {};
  const scrollItems = (g.scrolls ?? []).map((s) => {
    let sc = state.scrolls.get(s.id);
    if (!sc) {
      const outer = document.createElement("div");
      outer.className = "sa-scroll";
      const inner = document.createElement("div");
      inner.className = "sa-body";
      outer.append(inner);
      sc = { outer, inner };
      outer.addEventListener("scroll", () => state.handlers.onScroll?.(outer.dataset.scroll, scrollMetrics(sc)));
    }
    nextScrolls.set(s.id, sc);
    sc.outer.dataset.scroll = s.id;
    sc.dpr = dpr;
    const x0 = D(s.x * cw);
    const x1 = D((s.x + s.w) * cw);
    const y0 = rows.top(s.y);
    const y1 = rows.bottom(s.y + s.h - 1);
    Object.assign(sc.outer.style, { left: css(x0), top: css(y0), width: css(x1 - x0), height: css(y1 - y0) });
    const inner = renderDOM(sc.inner, s.grid, { ...o, _nested: true, mirror: {} });
    sc.height = inner.height * dpr;
    sc.viewport = y1 - y0;
    scrollAt[s.id] = scrollMetrics(sc);
    return { y: s.y, x: s.x, node: sc.outer };
  });
  state.scrolls = nextScrolls;

  // One layer, in reading order: targets (a group where its first member was), then slots and
  // scroll regions where they fall among them, so Tab goes through the window as it reads.
  const order = [];
  const placed = new Set();
  g.targets.forEach((t, i) => {
    const w = groupOf.get(t.id);
    const node = w ?? targetEls[i];
    if (placed.has(node)) return;
    placed.add(node);
    order.push({ y: t.y, x: t.x, node });
  });
  for (const it of [...slotItems, ...scrollItems]) {
    const at = order.findIndex((e) => e.y > it.y || (e.y === it.y && e.x > it.x));
    order.splice(at < 0 ? order.length : at, 0, it);
  }
  placeInOrder(
    state.targets,
    order.map((e) => e.node),
  );
  return { cellW: box.cellW, cellH: box.cellH, width: box.cssWidth, height: box.cssHeight, k, scrolls: scrollAt };
}

function scrollMetrics(sc) {
  return { top: sc.outer.scrollTop / sc.dpr, height: sc.height / sc.dpr, viewport: sc.viewport / sc.dpr };
}

/** Arrow keys in a tablist or radiogroup: move to the next member (wrapping) and activate it. */
function roveKey(w, e) {
  const role = w.getAttribute("role");
  const keys = role === "radiogroup" ? ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"] : ["ArrowLeft", "ArrowRight", "Home", "End"];
  if (!keys.includes(e.key)) return;
  const members = [...w.children].filter((b) => !b.disabled);
  const i = members.indexOf(document.activeElement);
  if (i < 0 || !members.length) return;
  e.preventDefault();
  const n = members.length;
  const j = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (i - 1 + n) % n : (i + 1) % n;
  members[j].focus();
  members[j].click();
}

/** The element renderDOM made for a target id under `root` (scroll bodies included), or null. */
export function targetElement(root, id) {
  return root.querySelector(`[data-target="${CSS.escape(id)}"]`);
}
