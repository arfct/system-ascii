# System ASCII

A UI drawn as text art in the jgs pixel font: panels, badges, meters, readouts and buttons laid out on a grid of character cells, rendered pixel-exact at any screen density. Web first; iOS and Android are planned ([plans/03-ios-and-android.md](plans/03-ios-and-android.md)).

**[Preview](https://arfct.github.io/system-ascii/)**, or `npm run preview` and open http://localhost:8790/.

## Use

```html
<link rel="stylesheet" href="fonts/fonts.css">
<canvas id="hud"></canvas>
<script type="module">
  import { Grid, panel, meter, button, render, themes } from "./web/index.js";

  await document.fonts.load("14px jgs7");
  const g = new Grid(30, 8);
  const p = panel(g, 0, 0, 30, 8, { title: "FLIGHT TELEMETRY" });
  g.text(p.left, p.top, "THR", "accent");
  meter(g, p.left + 4, p.top, { segments: 12, on: 7, glyphs: "█▌" });
  button(g, p.left, p.top + 3, { id: "DOCK", label: "DOCK" });
  render(document.getElementById("hud"), g, { face: "jgs7", scale: 2, theme: themes.mock });
</script>
```

Controls get invisible native buttons from `layoutTargets(layer, grid, cell, handlers)`; `examples/hud.js` and `index.html` show the whole loop (press, toggle, focus, drag to scroll).

From git: `npm install github:arfct/system-ascii#<commit>`, then import `@arfct/system-ascii` and `@arfct/system-ascii/fonts.css`.

## Layout

| Path | What it is | Platforms |
|---|---|---|
| `spec/faces.json` | Per face: cell, baseline, frame stroke position, meter segment, glyph fixes, synthesized glyphs | All |
| `spec/tokens.json` | Themes (`mock`, `landroid`): colour per role (`world`, `panel`, `ink`, `accent`, `accentOff`, `alert`, `alertOff`, `warnOff`, `ghost`, `ghostText`); a theme may add roles of its own (`landroid`: `dim`, `text`, `cyan`, `pink`, `flag`) | All |
| `spec/motion.json` | Motion patterns: `flicker` (opacity steps over 0.9 s) and `type` (a typed-on reveal) | All |
| `spec/glyphs.json` | Generated from the TTFs by `npm run fonts`: each face's characters and where its frame strokes sit | All |
| `fonts/` | woff2 per face, `fonts.css`, the TTF sources in `fonts/src/`, the OFL | All |
| `web/` | Grid, components, the Canvas renderer, the input layer | Web |
| `examples/hud.js` | The flight HUD layout the preview draws and the tests check | All, as a fixture |
| `plans/` | Why it works this way | |

Layout is in whole cells only; anything finer (surfaces snapped to the stroke, halos, focus outlines) is the renderer's. A per-face glyph problem is fixed in `spec/faces.json`, never in a component, and the tests check the fix against the font data.

## Faces

| Face | Cell (font px) | Draws | Notes |
|---|---|---|---|
| jgs5 | 5 × 10 | 1-bit, whole multiples | |
| jgs7 | 7 × 14 | 1-bit, whole multiples | `─` sits a pixel low; drawn as `-` |
| jgs9 | 9 × 18 | 1-bit, whole multiples | No box drawing; frames built from 1 px strokes |
| jgs (vector) | 7 × 15 | Antialiased, any scale | |

## Components

| Component | Function | Drawn as |
|---|---|---|
| Panel | `panel(g, x, y, w, h, { title, tone, titleStyle, titleSpaces })` | Frame with a surface behind it; the title runs into the line, halo by default |
| Badge | `badge`, `badgeRight` | ` LABEL ` in ink on the tone; display only |
| Rule | `rule` | `─` across |
| Meter | `meter(g, x, y, { segments, on, glyphs, tone, warnFrom })` | Lit, dim, and warning segments |
| Ghost readout | `ghost` | The unlit state |
| Button | `button`, `buttonRight` with `{ id, label, tone, pressed, on, toggle, disabled }` | Dim chip at rest, inverted pressed or on, ghost disabled, outlined on focus |

## Text

| Function | What it does |
|---|---|
| `g.line(x, y, line, { width, align, fg, bg, halo })` | One line, clipped to `width` columns with `…`; `align: "right"` puts its last column on `x`. A line is a string or runs `[[text, role], ...]`, so one line can mix colours |
| `g.block(x, y, lines, { width, maxLines, ... })` | Lines down from row `y`, each clipped, at most `maxLines` |
| `clip(s, width)`, `clipRuns(runs, width)`, `wrap(s, width)` | The same rules as plain functions; `wrap` breaks at spaces |

`render(..., { fallback: "Noto Sans Symbols" })` draws a character the face lacks as text in that family, fitted to the cell, instead of a 1-bit guess from the browser's default font.

## Motion

A grid carries motions: `g.flicker(x, y, w, h, { start, pattern })` marks a rect of cells to flicker from `start` (a `performance.now()` time) with a pattern from `spec/motion.json`. `flicker` is exo-space's console keyframes (off, then on at 12, off at 20, on at 28, off at 41, on at 55, off at 63 and on from 70 percent of 0.9 s, held between steps like CSS `steps(1)`); `type` reveals the cells one by one in reading order. The renderer draws the frame at its `now` option: hidden cells lose glyph, chip and halo, and a panel's surface flickers with a motion that covers the panel whole.

```js
import { play, render } from "@arfct/system-ascii";

const start = performance.now();
play((now) => {
  const g = layout();                          // rebuild or reuse the grid
  g.flicker(0, 0, g.cols, g.rows, { start });  // the same start every frame
  render(canvas, g, { face: "jgs7", scale: 2, theme, now });
  return g;
});
```

`play` asks for animation frames only while a motion in the returned grid is running, so it stops by itself when the flicker ends; it returns a function that stops it early. Reduced motion: `render`'s `reduceMotion` defaults to the `prefers-reduced-motion` setting and draws every cell at rest, and `play` then draws once. The preview's Motion picker and **Replay flicker** button show both patterns and the switch.

## Develop

```
npm install
npm test          # spec, glyph data and the example layout
npm run lint
npm run fonts     # regenerate spec/glyphs.json (needs python3 and fontTools)
npm run preview
```

Merging to `main` publishes the preview to GitHub Pages.

## Credits

Jgs Font by Adel Faure, in tribute to Joan G. Stark, from the [Velvetyne type foundry](https://velvetyne.fr/fonts/jgs-font/), under the SIL Open Font License 1.1 (`fonts/OFL.txt`). The woff2 files are converted from the TTFs unchanged.

A project of [Artifact](https://github.com/arfct).
