# The system

A UI drawn as text art in Adel Faure's jgs font: a design system whose unit is the character cell. It began as plan 24 in arfct/exo-space, for that game's HUD mock (SYSTEM, AUTOPILOT ENGAGED, FLIGHT TELEMETRY), and moved here to serve other products and platforms. This plan covers the platform-neutral parts; [02-web.md](02-web.md) is the web renderer and [03-ios-and-android.md](03-ios-and-android.md) the native ones.

## Summary

The UI is a grid of cells, each holding one glyph, a foreground and a background role. Components (panel, badge, label and value, rule, meter, ghost readout, button) are functions that write cells into a grid, and a renderer per platform turns the grid into pixels at a whole number of device pixels per font pixel. Panels are protected from what is behind them by a fill snapped to the frame's stroke, and text that sits on the world (titles, map labels) by a one-pixel halo. Controls are drawn as cells and operated through invisible native controls over their hit rects. The font metrics, glyph fixes and tokens are data in `spec/`, shared by every platform.

## The font

Measured with fontTools on `fonts/src/*.ttf` from the jgs repository (gitlab.com/velvetyne/jgs, `main`, fetched 2026-11-01). Licence: SIL Open Font License 1.1, Reserved Font Names "Jgs Font, jgs5, jgs7, jgs9".

| Face | Font size | Cell (px) | Baseline from top | Units per em | Line gap (units) | Glyphs | Box drawing (─│┌ …) |
|---|---|---|---|---|---|---|---|
| jgs5 | 10 | 5 × 10 | 9 | 20 | 2 | 405 | Yes, plus ▉▊▋▍▎ eighths |
| jgs7 | 14 | 7 × 14 | 11 | 28 | 3 | 399 | Yes, but `─` is off by a pixel (below) |
| jgs9 | 18 | 9 × 18 | 14 | 18 | 2 | 277 | No: blocks and shades only; built by the atlas |
| jgs_Font (vector) | any | 7 × 15 font px (0.5 × 1.07 em) | 12 font px | 560 | 50 | 409 | Yes, and `─` meets the corners |

- Each face is pixel-exact only at whole multiples of its size (10, 14, 18 px); the cell is half the em wide and one em tall.
- The fonts carry a line gap, so CSS `line-height: normal` adds 2 to 3 units per line and breaks vertical continuity. Line height must be set to the font size.
- jgs9 has no box drawing and no `▏▕`. Its `-` is a one-pixel stroke on row 8 and its `|` on column 4, so the atlas builds the eleven frame glyphs (`─│┌┐└┘├┤┬┴┼`) and `▏▕` for jgs9 from one-pixel strokes at those positions. Measured in the preview's canvas: the corner's stroke and the line both sit on row 8. jgs9's frames are thinner relative to its text than jgs5's and jgs7's are.
- **jgs7's `─` (U+2500) sits one font pixel below every other horizontal stroke.** Its outline spans y 14 to 16 units from the top; the horizontal arms of `┌┐└┘├┤┬┴┼` and the hyphen `-` span 12 to 14. A frame drawn with `─` steps down a pixel at each corner. jgs5 has no such offset (all at 10 to 12). The double lines `═╔╗╚╝` agree in both faces. Each face therefore has a substitution table applied by the renderer, not by the components: jgs7 maps `─` to `-`. Components keep writing `─`, so the grid stays meaningful text and the fix goes away if the font is corrected upstream. Measured in the preview's canvas: with the table, the `┌` stroke and the line both sit on font-pixel row 6.
- jgs5 has four glyphs off the cell width: `ø`, `þ` and `▘` advance 4 px, `◂` advances 10 px. In a text renderer they shift the rest of the line; the atlas clips every glyph to its cell.
- The published `jgs7.woff2` (in `fonts/webfonts/` and `web-specimen/webfonts/`) lacks `▏` and `▕`, which the TTF has. The woff2 files in `fonts/` are converted from the TTFs in `fonts/src/`.
- The vector face, `jgs_Font.ttf`, is the same design drawn as outlines on a 40-unit pixel grid: the em is 14 of its pixels, the cell 7 × 15 (280 × 600 units, from −120 to 480), the baseline 12 pixels down and the frame stroke at pixel (3, 7). Each pixel's edge is pushed out half a pixel (outlines run from −20 to 300 on a 280 advance) so neighbouring glyphs overlap and join at any size. Its `─` and its corners share the stroke at 160 to 200 units, so it needs no substitution. It draws at any scale, antialiased: the renderer draws it as text (`fillText`, the halo as `strokeText` one font pixel wide), not from the atlas, and snaps cell fills to whole device pixels so fractional cell sizes leave no seams. Measured in the preview at scale 2 on a 2× display: the corner's horizontal stroke and the line's both start on device row 27 of the cell. It is the face for sizes between the bitmap multiples (the preview's 1.5 and 2.5 scales) and for native clients that would rather draw text than blit.
- jgs draws punctuation for continuity, not for reading: `+` is a full-cell cross that joins its neighbours, `=` joins into a bracket, `:` and `;` are hard to tell apart at jgs7. `DV=3091` and `X:+10452` read oddly in the preview. See Open 1.
- The mock's two accents are a cyan near `#2EF5D2` and an amber near `#FFB000`, each with a dark "off" shade for unlit meter segments, plus a dark red and dark amber for the meter's warning zone. The values are read from the mock image, not from a spec.

`spec/faces.json` records each face's cell, baseline, stroke position, meter segment, fixes and synthesized glyphs; `scripts/font-data.py` writes `spec/glyphs.json` (each face's character set and where its frame glyphs' arms sit) from the TTFs, and `test/spec.test.mjs` checks the two against each other.

## The model

1. **The cell is the only unit for layout.** Position, size and spacing are whole cells. There is no padding, margin or point size in a component; a component is placed at (column, row) and spans columns × rows. A screen is `cols = floor(width / (cellWidth × scale))` wide, so layout responds to width by changing the column count, never the cell size. Two things are drawn below cell resolution, by the renderer only: panel fills (snapped to the frame's stroke) and halos and focus outlines (one font pixel). Components never place anything between cells.
2. **The spec is shared.** Face metrics, fixes and tokens live in `spec/` as JSON. Every platform reads those files; only the renderer and the input layer are per platform.
3. **The grid.** A flat array of `{ glyph, fg, bg, halo }`, a list of surfaces (panel rects in cells), a list of targets (controls with their cell rect) and a list of motions (a cell rect, a start time and a pattern from `spec/motion.json`, applied by the renderer per frame; [02-web.md](02-web.md) item 5). Colours are token names, resolved by the renderer, so a theme swap is a palette swap.
4. **Tokens.** Roles, not hues, in `spec/tokens.json`: `world` (the scene's clear colour, also the halo colour), `panel`, `ink` (text on a badge), `accent`, `accentOff`, `alert`, `alertOff`, `warnOff`, `ghost`, `ghostText`. A theme maps roles to colours. Face and scale are the only type tokens.
5. **Components** are pure functions `(grid, x, y, props)`. From the mock, plus buttons:

   | Component | Drawn as |
   |---|---|
   | Panel | `┌─┐│└┘` in the accent, a surface behind it, title inset at column 2 as `TITLE` with no spaces, replacing the stroke under it, so the line runs into the first and last letters; ` TITLE ` with a space each side as the alternative |
   | Badge | ` LABEL ` in `ink` on the accent; display only |
   | Label and value | left text, right-aligned value to the panel's inner edge (not built: no component; layouts use `g.text` and `g.textRight`) |
   | Rule | `─` across the inner width |
   | Meter | N segments of 1 or 2 cells (`█▌` in jgs7, `█▉` in jgs5), lit in the accent, unlit in `accentOff`, the warning zone in `warnOff` |
   | Ghost readout | the unlit state (`8888`, a boxed `ALT`) in `ghostText` |
   | Button | ` LABEL ` chip, one row; states below |

6. **Semantics beside the cells. Not built:** no component returns semantics yet, and there is no mirror. The plan: each component also returns its text and role (`{ role: "meter", label: "THR", value: 0.54 }`), which the renderer exposes to assistive technology. Cells are for drawing; the semantics are for reading.
7. **The world stays vector.** The grid is a layer over the product's own canvas (in exo-space, the Three.js world). Cells outside panels have no background, so the world shows through between panels.

## Buttons and touch

A badge and a button share a shape, so the state has to be readable from colour alone, and the rest state must not look like a badge:

| State | Drawn as |
|---|---|
| Rest | label in the accent on `accentOff` (a dim chip) |
| Pressed, and a toggle that is on | inverted: `ink` on the accent, the badge's form |
| Disabled | `ghostText` on `ghost` |
| Keyboard focus | rest plus a one-font-pixel outline in the accent, one pixel outside the chip |
| Hover (fine pointers only) | not drawn; Open 6 |

The mock's AUTO is a toggle that is on; APPROACHING and CLASS K stay badges, which are never targets.

**Input through native buttons.** Each target gets a transparent `<button>` laid over its hit rect in a layer above the canvas. The canvas draws; the browser supplies pointer capture, keyboard activation (Enter, Space), Tab order, `:focus-visible`, `disabled`, `aria-pressed` for toggles and the accessibility tree. This replaces the hit-test array of the first draft: it is less code than reimplementing focus and activation over a canvas, and the layer is the semantics mirror for controls. The layer has `pointer-events: none` and only the buttons take events, so a touch anywhere else reaches the world canvas below (pan, pinch, tap to navigate).

**Press rules.** Pointer down on a target captures the pointer and draws it pressed. Pointer up inside the hit rect activates; up outside, or `pointercancel` (the system took the gesture), releases without activating, so a press can be abandoned by sliding off. Long press is reserved for a target's menu, as everywhere in Artifact apps; no button in the mock has one.

**Target size.** The visible chip is one row: 28 CSS px tall at jgs7 × 2, 14 at × 1. The hit rect grows the chip on each side to a minimum of 44 × 44 CSS px on coarse pointers (`(pointer: coarse)`: Apple's 44 pt, inside Material's 48 dp only with the gutter) and 24 × 24 on fine pointers (WCAG 2.2 target size, minimum). Growth comes out of the blank cells around the button, so the layout rule is: **a button row has a blank row above and below it, and buttons on a row are at least two blank columns apart.** At jgs7 × 2 that gives each button 28 + 2 × 8 px of height with 20 px of the gutter to spare. A layout check fails any two hit rects that overlap.

**Drag to scroll.** A press that moves more than 8 CSS px releases the button without activating it and becomes a drag. On touch the browser scrolls (targets keep the default `touch-action`, so a pan that starts on a button scrolls the HUD or the page and the button gets `pointercancel`); with a mouse the HUD's scroll container scrolls by the drag itself, from anywhere, buttons included. In a product the drag goes to whatever is under the HUD: a scrolling panel if the press began in one, the world otherwise. The preview scrolls inside its own box under the pickers.

**Keyboard and controllers.** Tab order is component order (top to bottom, left to right within a panel). Not built: a controller moves focus between targets by direction (nearest target in the pressed direction, by cell centre) and activates with the south button, so the focus outline is the cursor (exo-space's plan 38 cursor cell).

## Background protection and titles

The HUD sits over a moving world of lines in colours close to the HUD's own, so every glyph needs something between it and the world. Three kinds, from heaviest to lightest:

| Protection | What it is | Used for |
|---|---|---|
| Surface | A fill in `panel` behind a panel, opaque by default | Everything inside a frame |
| Chip | The cell background of a badge or button | Badges and buttons, wherever they sit |
| Halo | The glyph's mask dilated by one font pixel in all eight directions, drawn in `world` under the glyph | Text on the world: frame titles, map labels |

**The surface snaps to the stroke, not the cell.** The frame's stroke runs through the middle of its cells (in jgs7 at x 3 and y 6 of the 7 × 14 cell, recorded in `spec/faces.json` and checked against the font by the tests). If the fill covered whole cells, a band of fill half a cell wide would stand outside the line on every side and the frame would read as a box with a border inset. The fill rect runs from the top-left stroke to the bottom-right stroke inclusive, so the line is the panel's edge, as in the mock.

**The title straddles the edge.** The title replaces the top stroke under its cells. In jgs7 the capitals fill rows 3 to 10 of the 14-row cell and the fill starts at row 6, so three rows of each letter are over the world and the rest over the panel; `/` fills all 14 rows, so the `//` in `SYSTEM // DEV-60930` reaches the top of the cell. Options, all in the preview's Title picker:

| Title | Effect | Cost |
|---|---|---|
| Halo (proposed) | The letters carry a `world`-coloured outline, so any world line passing behind the upper half stops a pixel short of them; the gap in the frame stays open, as in the mock | One extra blit per title glyph |
| Chip | The title's cells are filled in `panel` full height, so a tab of fill rises above the frame line | The panel's top edge is no longer one straight line |
| Plain | No protection; legible until a world line crosses the title | None |

With a translucent surface (Panel fill picker, 82 percent), world lines read faintly through panels; halos are still needed on titles because the part above the line has no surface at all. Text placed on the world with no panel (the map label in the preview) takes a halo by default; without one it is unreadable where an orbit crosses it.

**Order of drawing**, one pass, back to front: world (its own canvas) → surfaces → cell backgrounds (chips) → halos → glyphs → focus outlines. Halos come after chips so a halo never cuts into a neighbouring button's fill, and before all glyphs so one glyph's halo never covers its neighbour's strokes.

**Not proposed:** a backdrop blur behind panels. A canvas cannot blur the canvas below it; it would take a DOM element per panel with `backdrop-filter`, it costs a pass per panel per frame on phones, and a blurred grid behind a pixel font reads as a rendering fault.

## Open

1. **Punctuation in data.** Keep jgs's `+ = :` as drawn, or substitute reading forms in text components (a per-face table such as `+` to a small plus from the vector face, `=` to `═`)? The mock's numbers use all three. The substitution table built for `─` would carry this too.
2. **Face and scale.** jgs7 at scale 2 is 14 × 28 CSS px per cell, 30 columns on a 430 px phone; jgs5 at scale 3 is 15 × 30, 28 columns. The mock is drawn at about 30 to 36 columns.
3. **Meter segment.** `█▌` in jgs7 leaves a half-cell gap; the mock's gap is about a pixel. A two-cell segment of `██` with a one-pixel inset drawn by the renderer would match, at the cost of one more sub-cell feature.
4. **Package delivery.** Products take the web package from git, pinned to a commit (`npm install github:arfct/system-ascii#<commit>`); the repo is public, so CI and deploys install it without a token. A published npm package waits until a second product uses it.
5. **Licence for derived files.** Whether a woff2 converted from the TTF and a PNG atlas rasterized from it count as a Modified Version under the OFL's Reserved Font Name clause is unverified; the safe course is to ship them under a different name with the OFL and credit. Reporting the `─` offset and the missing woff2 glyphs upstream would remove two workarounds.
6. **Hover.** A fine-pointer hover state (say the label in the accent on a lighter `accentOff`) costs a fourth colour per accent; the mock has none.

## Proposed

The only consumer (exo-space) ships the vector face at scale 1.25 in the landroid palette, against the first and last items below; the preview opens in landroid.

- Face jgs7, scale 2 on phones and 3 on desktop.
- Punctuation as drawn, until the group sees it on a phone.
- Titles with a halo; panels opaque; map labels with a halo.
- Buttons as dim chips at rest, inverted when pressed or on; hit rects of 44 px on touch, 24 px otherwise, from a blank row above and below.
- Palette from the mock: `accent #2EF5D2`, `accentOff #0F2C27`, `alert #FFB000`, `alertOff #2B2412`, `warnOff #2E1717`, `panel #06090B`, `world #17181F`, `ghost #1F2A28`, `ghostText #3A4A47`.

## Exit test

- The tests in `test/spec.test.mjs` pass (`npm test`).
- iOS and Android draw `examples/hud.js` pixel-identical to the web at jgs7 × 2 on the same device pixel ratio ([03-ios-and-android.md](03-ios-and-android.md)).
