# 04. Windows, menus and dialogs

The components that turn the HUD kit into windows, menus and dialogs, for the HTML renderer (`renderDOM`). They are modelled on exo-space's More menu, Settings dialog and build window (`game/client/index.html`, `main.js`, `picker.js`, `buildwin.css`), and specified by the review of 2026-11-12 (section 3.3, SA-3 and SA-4). Components stay pure functions that write cells into a `Grid`, checkable with `Grid.toString()`; the renderer turns targets, slots and scroll regions into real elements.

## Why HTML

The owner chose the HTML renderer over the canvas path the review recommended (its section 3.2). PR #4 measured the two: `scripts/parity.mjs` finds 0 differing device pixels between canvas and HTML for jgs5, jgs7 and jgs9 at DPR 1, 1.5, 2 and 3 and scale 1 and 2, and no break in the vector face's vertical frame stroke in the HTML renderer at DPR 1, 1.25, 1.5, 2, 2.625 and 3 and scale 1 to 2. With parity settled, real elements give focus, Tab order, inputs, native scrolling, `inert` and the accessibility tree without reimplementing them. The canvas renderer is deprecated: it ignores icons, slots, bands, groups and scroll regions, and gets no new features.

## Rows and bands

A row is one target the width of its list: a selection bar, an indent, an icon (or a check mark, or a thumbnail slot), the label, a value right-aligned, a key tag, and an optional second line. Exo-space's rows and buttons are 44 CSS px tall, which is not a whole number of cells at most scales (2.35 rows of 18.75 px at jgs-vector × 1.25). Rather than change the sizes, a row may carry a band: `g.band(y, h, min)` makes rows `y` to `y + h − 1` at least `min` CSS px tall. The renderer adds the difference in whole device pixels, split above and below, so the text stays on the cell grid inside the row; cell backgrounds and the target's box take the full height; vertical frame strokes (`│ ├ ┤ ┼`, and the arms of `┌ ┐ └ ┘ ┬ ┴`) and a row's selection bar continue through the added space as the face's own `│`, clipped to the gap. `Grid.toString()`, the snapshots and the canvas renderer ignore bands. Rows, tabs, segmented controls and toolbars default to `minH: 44`.

Measured in headless Chrome at jgs-vector × 1.25, DPR 2: a one-line menu row is 44 CSS px tall (`scripts/components.mjs`).

## States

| State | Drawn as | Element |
|---|---|---|
| Rest | The tone | `<button>` |
| Hover | Row filled with `hover` | `onHover(id)` for mouse pointers only; the layout redraws with `state: "hover"` |
| Focus | Row filled with `hover`; the ring is one font px wide, one font px outside, in `focus` | `:focus-visible`, or the `focused` option for a controller's focus |
| On, selected | `▌` bar and label in `selected` | `aria-checked`, `aria-selected` or `aria-pressed` by role |
| Disabled | `ghostText` | `disabled` |
| Disabled with a reason | `ghostText`, the reason as the second line | `aria-disabled="true"`, focusable, `title` is the reason; `onActivate(target, reason)` gets it |

The state roles are new names for colours each theme already has, so no colour is added:

| Role | landroid | mock |
|---|---|---|
| `focus` | `#c6ff00` (`flag`) | `#2ef5d2` (`accent`) |
| `hover` | `#232330` (`ghost`) | `#1f2a28` (`ghost`) |
| `selected` | `#c6ff00` (`flag`) | `#ffb000` (`alert`) |
| `error` | `#ffb7d5` (`pink`) | `#ffb000` (`alert`) |

## Slots and scroll regions

A slot (`g.slot(id, x, y, w, h, { kind, box })`) is a rect of cells the renderer covers with an element the consumer supplies (`renderDOM(..., { slots: { id: element } })`): an `<input>`, an `<img>`, an iframe. The slot's box keeps its element across redraws, so a typed value, a caret and a drag survive. `web/dom.css` gives text inputs the face at the cell size (`--sa-font`, `--sa-lh`) and makes a range input transparent over the meter the grid draws, keeping the focus ring. A slider is therefore a meter plus a native `<input type="range">`: keyboard, drag and the value for screen readers are the browser's.

A scroll region (`scrollRegion`) holds a body grid of any height. The renderer draws the body with `renderDOM` itself inside a native scroll container over the region's cells, inset inside the frame; the region's last column is the scrollbar, drawn by the component from `scroll: { top, height, viewport }` (`onScroll` reports CSS px). The thumb is cell backgrounds, so it has no seams between rows.

## Icons

Material Symbols Sharp icons sit in blocks of cells (`g.icon`). The icon-only button (`iconButton`) is an icon alone in a framed box of whole cells, the whole box the target, the label its `aria-label` and tip. Its box is the cell count whose drawn size (stroke to stroke) lands nearest exo-space's CSS size; the hit area keeps the 44 CSS px minimum whatever the drawn box. In jgs-vector (cell 7 × 15 font px):

| Size | Target (CSS px) | Scale | Cells (cols x rows) | Drawn box (CSS px) | Error w, h (CSS px) | Icon (CSS px) |
|---|---|---|---|---|---|---|
| ib | 44 box, 22 icon | 1 | 7 x 4 | 42 x 45 | -2, 1 | 21 |
| ib | 44 box, 22 icon | 1.25 | 6 x 3 | 43.75 x 37.5 | -0.25, -6.5 | 22 |
| ib | 44 box, 22 icon | 1.5 | 5 x 3 | 42 x 45 | -2, 1 | 21 |
| ib | 44 box, 22 icon | 1.75 | 5 x 3 | 49 x 52.5 | 5, 8.5 | 24.5 |
| close | 44 box, 16 icon | 1 | 7 x 4 | 42 x 45 | -2, 1 | 15.25 |
| close | 44 box, 16 icon | 1.25 | 6 x 3 | 43.75 x 37.5 | -0.25, -6.5 | 16 |
| close | 44 box, 16 icon | 1.5 | 5 x 3 | 42 x 45 | -2, 1 | 15.25 |
| close | 44 box, 16 icon | 1.75 | 5 x 3 | 49 x 52.5 | 5, 8.5 | 17.75 |
| step | 32 box, 22 icon | 1 | 6 x 3 | 35 x 30 | 3, -2 | 24 |
| step | 32 box, 22 icon | 1.25 | 5 x 3 | 35 x 37.5 | 3, 5.5 | 24 |
| step | 32 box, 22 icon | 1.5 | 4 x 2 | 31.5 x 22.5 | -0.5, -9.5 | 21.75 |
| step | 32 box, 22 icon | 1.75 | 4 x 2 | 36.75 x 26.25 | 4.75, -5.75 | 25.25 |
| bar | 56 box, 40.32 icon | 1 | 9 x 5 | 56 x 60 | 0, 4 | 40.25 |
| bar | 56 box, 40.32 icon | 1.25 | 7 x 4 | 52.5 x 56.25 | -3.5, 0.25 | 37.75 |
| bar | 56 box, 40.32 icon | 1.5 | 6 x 3 | 52.5 x 45 | -3.5, -11 | 37.75 |
| bar | 56 box, 40.32 icon | 1.75 | 6 x 3 | 61.25 x 52.5 | 5.25, -3.5 | 44 |
| row | 20 box, 20 icon | 1 | 3 x 1 | 21 x 15 | 1, -5 | 21 |
| row | 20 box, 20 icon | 1.25 | 2 x 1 | 17.5 x 18.75 | -2.5, -1.25 | 17.5 |
| row | 20 box, 20 icon | 1.5 | 2 x 1 | 21 x 22.5 | 1, 2.5 | 21 |
| row | 20 box, 20 icon | 1.75 | 2 x 1 | 24.5 x 26.25 | 4.5, 6.25 | 24.5 |

Sources: `.ib` 44 × 44 with a 22 px icon (exo-space `index.html`:54, :66), row icons 20 px (:77, :146), the stepper's `.ib` 32 px (:156), the goals close 44 px with a 16 px icon (:104 to 105), the bar's buttons `min(56px, ...)` with the icon at 0.72 of the side (:91 to 95). A boxed size counts the cells stroke to stroke (n cells give n − 1 between the strokes); the row icon is unboxed. The icon scales with the drawn width over the target width. Cells are 1.875 times taller than wide, so a square target cannot be met both ways: the height error reaches 11 CSS px (bar at 1.5).

### Line weight

An icon's stroke should match the text's. A jgs stroke is one font pixel, `scale` CSS px; the vector face's outline is pushed out by half a pixel each side and measures 1.0625 font px (coverage across `│` and the stem of `l` at 16 px per font px). Material Symbols Sharp is variable: wght 100 to 700, opsz 20 to 48, GRAD −50 to 200. `scripts/icon-weights.mjs` draws `add`, `remove`, `close`, `settings` and `build` at 192 px in headless Chrome over wght 100 to 700 (7 steps), opsz 20, 24, 32, 40 and 48, and GRAD −50, 0 and 200, and reads the stroke from coverage. `add`'s bar at opsz 24 runs from 0.0336 em at wght 100 to 0.1359 em at wght 700; `close` is within 0.004 em of it at every weight; `settings` and `build`, estimated as 2 × area / perimeter, run 7 to 37 percent lower (round parts and joins thicken an area estimate less than a bar). GRAD moves `add` at wght 400 from 0.0663 em (−50) to 0.1131 em (200). The table (`add`'s, `em[grad][opsz][wght]`) is in `spec/icons.json` for every platform.

`iconAxes(sizeDev, strokeDev, dpr)` interpolates the table: opsz is the icon's CSS px clamped to 20 to 48; wght is solved at GRAD 0 so the stroke in device px equals the face's (`1.0625 × scale × dpr`), clamped to 100 to 700; GRAD then takes up what the weight cannot. The renderer sets `font-variation-settings` per rendered icon; FILL is 1 when the icon is on. At DPR 2:

| Scale | Stroke (device px) | ib | close | step | bar | row |
|---|---|---|---|---|---|---|
| 1 | 2.13 | 21 px: wght 255, GRAD 1, opsz 21 | 15.25 px: wght 351, GRAD 1, opsz 20 | 24 px: wght 187, GRAD 0, opsz 24 | 40.25 px: wght 100, GRAD -50, opsz 41 | 21 px: wght 255, GRAD 1, opsz 21 |
| 1.25 | 2.66 | 22 px: wght 292, GRAD 1, opsz 22 | 16 px: wght 439, GRAD 0, opsz 20 | 24 px: wght 247, GRAD 0, opsz 24 | 37.75 px: wght 156, GRAD 0, opsz 38 | 17.5 px: wght 387, GRAD 0, opsz 20 |
| 1.5 | 3.19 | 21 px: wght 377, GRAD 0, opsz 21 | 15.25 px: wght 583, GRAD 1, opsz 20 | 21.75 px: wght 350, GRAD 0, opsz 22 | 37.75 px: wght 213, GRAD 0, opsz 38 | 21 px: wght 377, GRAD 0, opsz 21 |
| 1.75 | 3.72 | 24.5 px: wght 350, GRAD 0, opsz 25 | 17.75 px: wght 587, GRAD 0, opsz 20 | 25.25 px: wght 339, GRAD 0, opsz 26 | 44 px: wght 231, GRAD 1, opsz 44 | 24.5 px: wght 350, GRAD 0, opsz 25 |

The bar icon at scale 1 needs a stroke thinner than wght 100 gives at GRAD 0, and is met at GRAD −50. A test checks that the solved stroke is within 5 percent of the face's for every size at scales 1 to 1.75 and DPR 1 to 3, and that every weight is inside 100 to 700. The screenshots at scales 1, 1.25 and 1.75 show icon and text strokes of the same weight by eye; the stroke match was not measured on the rendered screenshots.

## Focus and modals

Groups (`segmented`, `tabs`) are wrapped in one element with the role (`radiogroup`, `tablist`); only the selected member is in the Tab order, and Left and Right (also Up and Down in a radiogroup), Home and End move and activate. `nextTarget(g, fromId, dx, dy)` ports exo-space's padnav: the nearest target that way, those in the current row or column band first, distance along counted once and across twice. One change: across is measured to the other target's span, not its centre, so a full-width list row is reached from a button above any part of it. `modal(el, { onClose, opener })` keeps Tab and Shift+Tab inside, closes on Escape, makes the rest of the page `inert` and returns focus to the opener.

## Text for screen readers

`renderDOM` writes the grid's non-control text, in reading order, into a visually hidden element after the stage (`mirror: { role, live, label }`); box drawing and block elements are left out, an icon with a `label` reads as that label, and the painted cells are `aria-hidden`. Controls read through their buttons and slots. `textRegion` (from exo-space's `ascii.js`) draws lines with the same text in the mirror, written only when the lines change.

## Motion

Proposed: the flicker cascades line by line. Row r of a motion's rect starts the 900 ms step pattern at `start + r × rowDelay`, with `rowDelay` 60 ms in `spec/motion.json` and a per-call override (`g.motion(..., { rowDelay })`, 0 turns it off). A motion's duration is `900 + (rows − 1) × 60` ms. A panel's surface flickers with the motion's row at the panel's top edge, so the fill comes on with the title line, before the rows inside it. The alternative, the surface shown once any row is lit, was not chosen: it lights the whole fill on the first row's first step and the cascade then reads as text appearing on a fixed panel rather than the panel coming on. Reduced motion draws everything at rest.

## Fixtures

| Fixture | Models | Checks |
|---|---|---|
| `examples/menu.js` | exo-space's More menu: icon rows with key tags, a divider, a greyed row with its reason | Tab order, Enter, the reason, ArrowUp and ArrowDown by position, 44 px rows |
| `examples/dialog.js` | Settings: headings, radio rows in a radiogroup, a checkbox row with a key tag, two sliders, a stepper, Close | Focus starts inside, 14 Tabs stay inside, Shift+Tab, arrows in the radiogroup, a slider by ArrowRight, Space on the checkbox, Escape and Close return focus to the opener |
| `examples/window.js` | The build window: BASE / SHIP segmented and close in the head, a scroll body of two-line rows with thumbnail slots, a tab bar of seven icon tabs | Left and Right in the tablist, scrolling reports its position, Enter selects a body row |
| `examples/icons.js` | Icon buttons at the five sizes in rest, pressed, on, disabled with a reason and focus, beside jgs text | 44 px hit, axes set per icon |

`node --test` checks their text at 27, 44 and 64 columns against `test/snapshots/components.txt`, that every glyph they emit is drawable in every face (jgs9 gains a synthesized `■`), that no two hit rects overlap at jgs-vector × 1.25 DPR 2, jgs-vector × 1 DPR 1 and jgs7 × 2 DPR 1.5, divider ends, `nextTarget` cases, and on a DOM stub that `renderDOM` keeps each target's, slot's and scroll region's element across redraws. `node scripts/components.mjs` runs the keyboard checks above in headless Chrome: 27 of 27 pass.

## Not tested

Safari and WKWebView, phones and touch, screen readers (VoiceOver, NVDA, TalkBack), a game controller driving `nextTarget`, right-to-left text, and the components in the bitmap faces beyond the glyph check (screenshots are jgs-vector only). The `field` component has unit tests but no fixture. In the screenshots, jgs-vector's `└` and `┘` meet `│` with a notch about one device pixel wide at the box corners of the icon buttons.
