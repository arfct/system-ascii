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

From git: `npm install github:arfct/system-ascii` (the repo is private), then import `@arfct/system-ascii` and `@arfct/system-ascii/fonts.css`.

## Layout

| Path | What it is | Platforms |
|---|---|---|
| `spec/faces.json` | Per face: cell, baseline, frame stroke position, meter segment, glyph fixes, synthesized glyphs | All |
| `spec/tokens.json` | Themes: colour per role (`world`, `panel`, `ink`, `accent`, `accentOff`, `alert`, `alertOff`, `warnOff`, `ghost`, `ghostText`) | All |
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
