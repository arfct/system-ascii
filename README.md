# System ASCII

A UI drawn as text art in the jgs pixel font: panels, badges, meters, readouts and buttons laid out on a grid of character cells, rendered pixel-exact at any screen density. Web first; iOS and Android are planned ([plans/03-ios-and-android.md](plans/03-ios-and-android.md)).

**[Preview](https://arfct.github.io/system-ascii/)**, or `npm run preview` and open http://localhost:8790/.

## Use

A layout is one set of functions that write cells into a `Grid`. The HTML renderer, `renderDOM`, draws it as positioned elements with the chips as real `<button>`s, so focus, keyboard, inputs, scrolling and the accessibility tree are the browser's.

```html
<link rel="stylesheet" href="fonts/fonts.css">
<link rel="stylesheet" href="web/dom.css">
<div id="hud"></div>
<script type="module">
  import { Grid, panel, meter, button, ready, renderDOM, themes } from "./web/index.js";

  await ready("jgs7");
  const g = new Grid(30, 8);
  const p = panel(g, 0, 0, 30, 8, { title: "FLIGHT TELEMETRY" });
  g.text(p.left, p.top, "THR", "accent");
  meter(g, p.left + 4, p.top, { segments: 12, on: 7, glyphs: "█▌" });
  button(g, p.left, p.top + 3, { id: "DOCK", label: "DOCK" });
  renderDOM(document.getElementById("hud"), g, {
    face: "jgs7", scale: 2, theme: themes.landroid,
    onActivate: (target, reason) => console.log(target.id, reason),
  });
</script>
```

Call `renderDOM` again with a new grid to update: the cells are repainted and each target keeps its `<button>` by id, so focus and a held press survive. `examples/hud.js` and `index.html` show the whole loop (press, toggle, focus, a disabled button with a reason, an icon, drag to scroll); the preview's Fixture picker also shows the menu, the dialog, the build window and the icon buttons.

From git: `npm install github:arfct/system-ascii#<commit>`, then import `@arfct/system-ascii`, `@arfct/system-ascii/fonts.css` and `@arfct/system-ascii/dom.css`.

## Renderers

| Renderer | Function | Status |
|---|---|---|
| HTML | `renderDOM(root, grid, { face, scale, theme, dpr, snap, fill, fixes, focused, now, reduceMotion, fallback, iconFont, minTarget, slots, mirror, onPress, onActivate, onFocus, onHover, onScroll })` | Primary. Needs `web/dom.css`. Every edge is a font-pixel position rounded to a whole device pixel, in a stage laid out in device pixels and scaled by `1 / devicePixelRatio`. Bitmap faces match the canvas renderer pixel for pixel (`node scripts/parity.mjs`); the vector face draws through `jgs-vector-cell`, a metrics-overridden alias of the same woff2 (`fonts/fonts.css`), with the baseline also measured at load |
| Canvas | `render(canvas, grid, { ... })` with `layoutTargets(layer, grid, cell, handlers)` and `web/targets.css` | Deprecated. Kept working for current consumers and as the pixel reference for bitmap faces; no new features (it ignores icons) |

Both take `dpr` (default `devicePixelRatio`) and `snap` (round the vector face to whole device pixels per font pixel; default off, so the vector face draws at any scale). `ready(face, { fallback, iconFont })` awaits the fonts and clears what both renderers cache from them; call it before the first render.

Targets: a toggle carries `aria-pressed`; a disabled target with a `reason` stays focusable as `aria-disabled` and `onActivate(target, reason)` gets the reason; activation is on `click`, so Enter, Space, `element.click()` and assistive technology all activate. The focus ring is a CSS outline one font pixel wide and one font pixel outside the chip. The hit area grows to 44 CSS px on coarse pointers and 24 otherwise, or a target's own `hit: { w, h }`, which need not be whole cells; the chip stays in its cells.

Icons: `g.icon(x, y, w, h, name, fg, { font, weight, label })` puts a ligature from an icon font (Material Symbols Sharp by default, `iconFont` to change it) over a block of cells, centred, clipped to the block, in the role colour. The page loads the icon font. `label` is what the text mirror reads.

## Layout

| Path | What it is | Platforms |
|---|---|---|
| `spec/faces.json` | Per face: cell, baseline, frame stroke position, meter segment, glyph fixes, synthesized glyphs | All |
| `spec/tokens.json` | Themes (`mock`, `landroid`): colour per role (`world`, `panel`, `ink`, `accent`, `accentOff`, `alert`, `alertOff`, `warnOff`, `ghost`, `ghostText`, and the state roles `focus`, `hover`, `selected`, `error`, each an existing colour of the theme); a theme may add roles of its own (`landroid`: `text`, `cyan`, `pink`, `flag`) | All |
| `spec/roles.json` | The roles every theme must define, and aliases (`dim` is `ghostText`). A tone's `${tone}Off` with no entry draws in `ghost`; an unknown role throws | All |
| `spec/motion.json` | Motion patterns: `flicker` (opacity steps over 0.9 s, cascading 60 ms per row) and `type` (a typed-on reveal) | All |
| `spec/icons.json` | Material Symbols Sharp: the icon sizes taken from exo-space, each face's stroke width, and the icon's stroke width in em over wght, GRAD and opsz as measured by `scripts/icon-weights.mjs` | All |
| `spec/glyphs.json` | Generated from the TTFs by `npm run fonts`: each face's characters and where its frame strokes sit | All |
| `fonts/` | woff2 per face, `fonts.css`, the TTF sources in `fonts/src/`, the OFL | All |
| `web/` | Grid, components (`components.js`, `controls.js`, `window.js`), the HTML renderer (`dom.js`, `dom.css`, `layout.js`), focus and modals (`nav.js`, `modal.js`), icon axes (`icons.js`), text regions (`region.js`), the deprecated canvas renderer and its input layer (`canvas.js`, `targets.js`, `targets.css`) | Web |
| `scripts/parity.mjs` | Headless Chrome: canvas against HTML for the bitmap faces, and the vector face's stroke continuity in the HTML renderer | Web |
| `scripts/components.mjs` | Headless Chrome: drives the fixtures by keyboard (Tab, Enter, Space, Escape, arrows, a slider) and saves screenshots | Web |
| `scripts/icon-weights.mjs` | Headless Chrome: measures Material Symbols' stroke over its axes and writes `spec/icons.json` | Web |
| `examples/` | Fixtures the preview draws and the tests check: the flight HUD (`hud.js`), the More menu (`menu.js`), the Settings dialog (`dialog.js`), the build window with the tab's name, a `DATA 0` status and its close on the title bar and large icon tabs (`window.js`), icon buttons at exo-space's sizes and a large icon tab bar (`icons.js`) | All, as fixtures |
| `plans/` | Why it works this way | |

Layout is in whole cells only; anything finer (surfaces snapped to the stroke, halos, focus outlines) is the renderer's. A per-face glyph problem is fixed in `spec/faces.json`, never in a component, and the tests check the fix against the font data.

## Faces

| Face | Cell (font px) | Draws | Notes |
|---|---|---|---|
| jgs5 | 5 × 10 | 1-bit, whole multiples | |
| jgs7 | 7 × 14 | 1-bit, whole multiples | `─` sits a pixel low; drawn as `-` |
| jgs9 | 9 × 18 | 1-bit, whole multiples | No box drawing; frames built from 1 px strokes |
| jgs (vector) | 7 × 15 | Antialiased, any scale | The HTML renderer uses `jgs-vector-cell` (line metrics set to the cell) |

## Components

| Component | Function | Drawn as |
|---|---|---|
| Panel | `panel(g, x, y, w, h, { title, tone, titleStyle, titleSpaces, status, close })` | Frame with a surface behind it; the title runs into the line, halo by default. `close: { id, label }` puts a close button on the top stroke, right-aligned as the title is left-aligned (`┌─TITLE───XX─┐`): the `close` icon over two cells, one row tall, its hit area 44 CSS px. `status` (a string, `{ text, tone }`, or a list of those, one blank column apart) is short text right-aligned on the top stroke, one stroke column before the close button or the corner, in the title's style (`┌─TITLE───DATA 0─XX─┐`); display only, so the close hit is unchanged. On a narrow bar the title is clipped first, down to `TITLE_MIN` (4) columns, then the status; a status under `STATUS_MIN` (2) columns is left out (`titleBarFit(title, status, room)` gives the split) |
| Badge | `badge(g, x, y, label, tone, { align })` | ` LABEL ` in ink on the tone; display only. `badgeRight` is an alias for one release |
| Rule | `rule` | `─` across |
| Divider | `divider(g, x, y, w, tone)`, `dividerV(g, x, y, h, tone)` | `├─┤` and `┬│┴` joined to a frame; a crossing becomes `┼` |
| Meter | `meter(g, x, y, { segments, on, glyphs, tone, warnFrom })` | Lit, dim, and warning segments |
| Ghost readout | `ghost` | The unlit state |
| Button | `button(g, x, y, { id, label, tone, pressed, on, toggle, disabled, reason, align, hit })` | Dim chip at rest, inverted pressed or on, ghost disabled, outlined on focus. A disabled button with a `reason` stays focusable (`aria-disabled`) and `onActivate(target, reason)` gets the reason. `hit: { w, h }` sets a minimum hit size in CSS px that need not be whole cells. `buttonRight` is an alias for one release |

Windows, menus and dialogs (`web/controls.js`, `web/window.js`; the HTML renderer only). A `minH` in CSS px (44 by default on rows, tabs, segments and toolbars) adds a band: the rows keep that height while their text stays on the cell grid inside it, and frame strokes and the selection bar continue through the added space.

| Component | Function | Drawn as |
|---|---|---|
| Row | `row(g, x, y, w, { id, label, icon, check, slot, value, key, indent, state, on, disabled, reason, line2, role, aria, minH })` | The whole row is one target: a `▌` selection bar when on, an icon (or a check mark, or a thumbnail slot), the label, a value right-aligned, the key as plain letters. `state: "hover" \| "focus"` fills it with `hover`; on draws the label in `selected`; disabled draws in `ghostText` and, with a `reason`, stays focusable and shows the reason as its second line. Returns 1 or 2 rows |
| Key | `key(g, x, y, k, { align })` | The key as plain letters (`K`, `F10`) in `dim`, no bars; a row keeps one blank column before it |
| Check | `check(g, x, y, { on, kind })` | `●` `○` (radio), `■` `□` (checkbox) |
| Label and value | `kv(g, x, y, w, label, value)` | Label left in `dim`, value right in the tone |
| Heading, note | `heading(g, x, y, w, text)`, `note(g, x, y, w, text)` | A section heading; wrapped text in `dim` |
| Field | `field(g, x, y, w, { id, label, style, state })` | A text slot under an underline (`style: "underline"`) or inside a frame (`"frame"`), the line in `focus` or `error` by state |
| Segmented | `segmented(g, x, y, { id, options, selected })` | Adjacent chips, the selected one inverted; a `radiogroup` of `radio` targets |
| Tabs | `tabs(g, x, y, w, { id, items, selected, tabW, size, face, scale, gap })` | Icon (or label) tabs, the selected one filled with `hover` in `selected`; a `tablist`; Left and Right move and select. With `size` (`lg`) each tab is an icon button of that size, the selected one on and filled with `hover`, wrapping to more rows when `w` is short; `tabsSize(n, w, o)` gives the cells without drawing |
| Slider | `slider(g, x, y, w, { id, value, min, max })` | A meter lit to the value under a slot for a transparent `<input type="range">` |
| Toolbar | `toolbar(g, x, y, items, { align, gap, hitW, size, face, scale })` | Icon buttons a row tall with a 44 px hit; with `size` (`lg`), framed icon buttons of that size |
| Icon button | `iconButton(g, x, y, { id, icon, label, size, face, scale, on, pressed, disabled, reason, boxed })` | One icon in a framed box of whole cells nearest exo-space's size (`ib` 44, `close` 44 with a 16 px icon, `step` 32, `bar` 56, `lg` the toolbar button, `row` 20 unboxed); on fills the icon in `selected`; the hit keeps 44 CSS px |
| Window close | `closeButton(g, x, y, { id, label })` | The title-bar close button `panel` and `windowFrame` draw for `close`, for a frame drawn some other way; `CLOSE_W` is its width, 2 columns |
| Window | `windowFrame(g, x, y, w, h, { title, head, foot, status, close })` | A panel with `├─┤` dividers under the head and over the foot; returns the head, body and foot boxes, and `close`'s and `status`'s cells. A window's name and short status (a count, a mode) go on the title bar, not in a head row |
| Scroll region | `scrollRegion(g, x, y, w, h, body, { id, scroll })` | A body grid in a native scroll container inset in the frame; the last column is the scrollbar, drawn from `scroll` |
| Tooltip | `tooltip(lines, cols)` | A framed grid of its own; placement is the caller's |

Large icon buttons (`size: "lg"`) are exo-space's main toolbar button: a 56 CSS px side with the frame drawn inside it by half a cell height, the icon 0.72 of the framed side, the box the nearest whole cells stroke to stroke. The reservation is in cells and chosen per scale, so it reads square (a cell is 15 / 7 = 2.14 times taller than wide) and matches the toolbar: in jgs-vector 8 × 4 cells at scale 1, 6 × 3 at 1.25, 5 × 3 at 1.5 and 1.75 (the table and the rule are in [plans/04-windows.md](plans/04-windows.md)). Pass `{ ...icons.sizes.lg, box, icon }` for a toolbar whose side is not 56 px.

Grid additions: `g.slot(id, x, y, w, h, { kind, box })` puts a consumer's element (`renderDOM(..., { slots: { id: element } })`) over cells; inputs take the face at the cell size from `web/dom.css`. `g.band(y, h, min)` is the row height rule above. `g.icon(..., { px, fill })` sets an icon's size and FILL; the renderer sets wght, GRAD and opsz from `spec/icons.json` so the icon's stroke is as wide as the face's (wght 100 to 700, opsz the icon's CSS px clamped to 20 to 48).

## Focus, modals, text

| Function | What it does |
|---|---|
| Target fields | `role`, `aria`, `attrs`, `className`, `data` on a target are applied to its button and dropped when a later layout drops them; `reason` makes a disabled target `aria-disabled` and focusable |
| Groups | `g.groups` (from `segmented` and `tabs`) wrap their targets in one element with the role; only the selected member is in the Tab order; arrows, Home and End move and activate |
| `nextTarget(g, fromId, dx, dy)` | The target to focus for a controller's direction, scroll bodies included (exo-space's padnav rules) |
| `modal(el, { onClose, opener, initial })` | Tab and Shift+Tab stay inside `el`, Escape closes, the rest of the page is `inert`, focus returns to the opener; returns `close()` |
| Text mirror | `renderDOM` writes the grid's non-control text, in reading order, into a visually hidden element (`mirror: { role, live, label }`); the painted cells are `aria-hidden` |
| `textRegion(host, { cols, face, scale, theme, wrap, frame, role, live })` | Lines drawn by `renderDOM` with the same text in the mirror; `set(lines, { flicker })`, `flicker(which)`, `text()` |
| `fit(face, scale, px)` | `{ cols, rows }` of whole cells that fit a size in CSS px |

## Text

| Function | What it does |
|---|---|
| `g.line(x, y, line, { width, align, fg, bg, halo })` | One line, clipped to `width` columns with `…`; `align: "right"` puts its last column on `x`. A line is a string or runs `[[text, role], ...]`, so one line can mix colours |
| `g.block(x, y, lines, { width, maxLines, ... })` | Lines down from row `y`, each clipped, at most `maxLines` |
| `clip(s, width)`, `clipRuns(runs, width)`, `wrap(s, width)` | The same rules as plain functions; `wrap` breaks at spaces |

`renderDOM(..., { fallback: "Noto Sans Symbols" })` (or `{ family, weight }`) draws a character the face lacks as text in that family, fitted to the cell, instead of a 1-bit guess from the browser's default font.

## Motion

A grid carries motions: `g.motion(x, y, w, h, { start, pattern, rowDelay })` (`g.flicker` is the old name, kept as an alias for one release) marks a rect of cells to flicker from `start` (a `performance.now()` time) with a pattern from `spec/motion.json`. `flicker` is exo-space's console keyframes (off, then on at 12, off at 20, on at 28, off at 41, on at 55, off at 63 and on from 70 percent of 0.9 s, held between steps like CSS `steps(1)`); `type` reveals the cells one by one in reading order. The flicker cascades line by line: row r of the rect starts its pattern `r × rowDelay` ms after `start` (60 ms in `spec/motion.json`; `rowDelay: 0` turns the cascade off), so a motion lasts 900 ms plus `(rows − 1) × 60` ms. A panel's surface flickers with the motion's row at the panel's top edge. The renderer draws the frame at its `now` option: hidden cells lose glyph, chip and halo, and a panel's surface flickers with a motion that covers the panel whole.

```js
import { play, renderDOM } from "@arfct/system-ascii";

const start = performance.now();
play((now) => {
  const g = layout();                          // rebuild or reuse the grid
  g.motion(0, 0, g.cols, g.rows, { start });   // the same start every frame
  renderDOM(root, g, { face: "jgs7", scale: 2, theme, now });
  return g;
});
```

`play` asks for animation frames only while a motion in the returned grid is running, so it stops by itself when the flicker ends; it returns a function that stops it early. Reduced motion: the renderers' `reduceMotion` defaults to the `prefers-reduced-motion` setting and draws every cell at rest, and `play` then draws once. The preview's Motion picker and **Replay flicker** button show both patterns and the switch.

## Develop

```
node --test       # spec, glyph data, the fixtures' snapshots, layout, focus, renderDOM on a DOM stub; needs no install
npm ci            # only for the linter
npm run lint
npm run fonts     # regenerate spec/glyphs.json (needs python3 and fontTools)
node scripts/parity.mjs [outDir]   # needs Google Chrome; serves on 8794, debugs on 9471
node scripts/components.mjs [outDir]   # drives the fixtures by keyboard; serves on 8797, debugs on 9473
node scripts/icon-weights.mjs         # measures Material Symbols and writes spec/icons.json; needs network for the font
npm run preview
```

Merging to `main` publishes the preview to GitHub Pages.

## Credits

Jgs Font by Adel Faure, in tribute to Joan G. Stark, from the [Velvetyne type foundry](https://velvetyne.fr/fonts/jgs-font/), under the SIL Open Font License 1.1 (`fonts/OFL.txt`). The woff2 files are converted from the TTFs unchanged.

A project of [Artifact](https://github.com/arfct).
