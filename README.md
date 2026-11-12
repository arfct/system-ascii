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

Call `renderDOM` again with a new grid to update: the cells are repainted and each target keeps its `<button>` by id, so focus and a held press survive. `examples/hud.js` and `index.html` show the whole loop (press, toggle, focus, a disabled button with a reason, an icon, drag to scroll).

From git: `npm install github:arfct/system-ascii#<commit>`, then import `@arfct/system-ascii`, `@arfct/system-ascii/fonts.css` and `@arfct/system-ascii/dom.css`.

## Renderers

| Renderer | Function | Status |
|---|---|---|
| HTML | `renderDOM(root, grid, { face, scale, theme, dpr, snap, fill, fixes, focused, now, reduceMotion, fallback, iconFont, minTarget, onPress, onActivate, onFocus })` | Primary. Needs `web/dom.css`. Every edge is a font-pixel position rounded to a whole device pixel, in a stage laid out in device pixels and scaled by `1 / devicePixelRatio`. Bitmap faces match the canvas renderer pixel for pixel (`node scripts/parity.mjs`); the vector face draws through `jgs-vector-cell`, a metrics-overridden alias of the same woff2 (`fonts/fonts.css`), with the baseline also measured at load |
| Canvas | `render(canvas, grid, { ... })` with `layoutTargets(layer, grid, cell, handlers)` and `web/targets.css` | Deprecated. Kept working for current consumers and as the pixel reference for bitmap faces; no new features (it ignores icons) |

Both take `dpr` (default `devicePixelRatio`) and `snap` (round the vector face to whole device pixels per font pixel; default off, so the vector face draws at any scale). `ready(face, { fallback, iconFont })` awaits the fonts and clears what both renderers cache from them; call it before the first render.

Targets: a toggle carries `aria-pressed`; a disabled target with a `reason` stays focusable as `aria-disabled` and `onActivate(target, reason)` gets the reason; activation is on `click`, so Enter, Space, `element.click()` and assistive technology all activate. The focus ring is a CSS outline one font pixel wide and one font pixel outside the chip. The hit area grows to 44 CSS px on coarse pointers and 24 otherwise, or a target's own `hit: { w, h }`, which need not be whole cells; the chip stays in its cells.

Icons: `g.icon(x, y, w, h, name, fg, { font, weight, label })` puts a ligature from an icon font (Material Symbols Sharp by default, `iconFont` to change it) over a block of cells, centred, clipped to the block, in the role colour. The page loads the icon font. `label` is what the text mirror reads.

## Layout

| Path | What it is | Platforms |
|---|---|---|
| `spec/faces.json` | Per face: cell, baseline, frame stroke position, meter segment, glyph fixes, synthesized glyphs | All |
| `spec/tokens.json` | Themes (`mock`, `landroid`): colour per role (`world`, `panel`, `ink`, `accent`, `accentOff`, `alert`, `alertOff`, `warnOff`, `ghost`, `ghostText`); a theme may add roles of its own (`landroid`: `text`, `cyan`, `pink`, `flag`) | All |
| `spec/roles.json` | The roles every theme must define, and aliases (`dim` is `ghostText`). A tone's `${tone}Off` with no entry draws in `ghost`; an unknown role throws | All |
| `spec/motion.json` | Motion patterns: `flicker` (opacity steps over 0.9 s) and `type` (a typed-on reveal) | All |
| `spec/glyphs.json` | Generated from the TTFs by `npm run fonts`: each face's characters and where its frame strokes sit | All |
| `fonts/` | woff2 per face, `fonts.css`, the TTF sources in `fonts/src/`, the OFL | All |
| `web/` | Grid, components, the HTML renderer (`dom.js`, `dom.css`), the deprecated canvas renderer and its input layer (`canvas.js`, `targets.js`, `targets.css`) | Web |
| `scripts/parity.mjs` | Headless Chrome: canvas against HTML for the bitmap faces, and the vector face's stroke continuity in the HTML renderer | Web |
| `examples/hud.js` | The flight HUD layout the preview draws and the tests check | All, as a fixture |
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
| Panel | `panel(g, x, y, w, h, { title, tone, titleStyle, titleSpaces })` | Frame with a surface behind it; the title runs into the line, halo by default |
| Badge | `badge(g, x, y, label, tone, { align })` | ` LABEL ` in ink on the tone; display only. `badgeRight` is an alias for one release |
| Rule | `rule` | `─` across |
| Divider | `divider(g, x, y, w, tone)`, `dividerV(g, x, y, h, tone)` | `├─┤` and `┬│┴` joined to a frame; a crossing becomes `┼` |
| Meter | `meter(g, x, y, { segments, on, glyphs, tone, warnFrom })` | Lit, dim, and warning segments |
| Ghost readout | `ghost` | The unlit state |
| Button | `button(g, x, y, { id, label, tone, pressed, on, toggle, disabled, reason, align, hit })` | Dim chip at rest, inverted pressed or on, ghost disabled, outlined on focus. A disabled button with a `reason` stays focusable (`aria-disabled`) and `onActivate(target, reason)` gets the reason. `hit: { w, h }` sets a minimum hit size in CSS px that need not be whole cells. `buttonRight` is an alias for one release |

## Text

| Function | What it does |
|---|---|
| `g.line(x, y, line, { width, align, fg, bg, halo })` | One line, clipped to `width` columns with `…`; `align: "right"` puts its last column on `x`. A line is a string or runs `[[text, role], ...]`, so one line can mix colours |
| `g.block(x, y, lines, { width, maxLines, ... })` | Lines down from row `y`, each clipped, at most `maxLines` |
| `clip(s, width)`, `clipRuns(runs, width)`, `wrap(s, width)` | The same rules as plain functions; `wrap` breaks at spaces |

`renderDOM(..., { fallback: "Noto Sans Symbols" })` (or `{ family, weight }`) draws a character the face lacks as text in that family, fitted to the cell, instead of a 1-bit guess from the browser's default font.

## Motion

A grid carries motions: `g.motion(x, y, w, h, { start, pattern })` (`g.flicker` is the old name, kept as an alias for one release) marks a rect of cells to flicker from `start` (a `performance.now()` time) with a pattern from `spec/motion.json`. `flicker` is exo-space's console keyframes (off, then on at 12, off at 20, on at 28, off at 41, on at 55, off at 63 and on from 70 percent of 0.9 s, held between steps like CSS `steps(1)`); `type` reveals the cells one by one in reading order. The renderer draws the frame at its `now` option: hidden cells lose glyph, chip and halo, and a panel's surface flickers with a motion that covers the panel whole.

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
node --test       # spec, glyph data, the example layout's snapshot; needs no install
npm ci            # only for the linter
npm run lint
npm run fonts     # regenerate spec/glyphs.json (needs python3 and fontTools)
node scripts/parity.mjs [outDir]   # needs Google Chrome; serves on 8794, debugs on 9471
npm run preview
```

Merging to `main` publishes the preview to GitHub Pages.

## Credits

Jgs Font by Adel Faure, in tribute to Joan G. Stark, from the [Velvetyne type foundry](https://velvetyne.fr/fonts/jgs-font/), under the SIL Open Font License 1.1 (`fonts/OFL.txt`). The woff2 files are converted from the TTFs unchanged.

A project of [Artifact](https://github.com/arfct).
