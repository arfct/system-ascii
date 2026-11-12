# The web renderer

Amendment, 2026-11-12: the HTML renderer (`renderDOM`, `web/dom.js`) is the primary renderer and the canvas renderer below is deprecated. Reasons: native focus, inputs, scrolling and accessibility come with real elements, and pixel parity is measured rather than assumed. `scripts/parity.mjs` finds 0 differing device pixels between the two for jgs5, jgs7 and jgs9 at DPR 1, 1.5, 2 and 3 and scale 1 and 2, and no break in the vector face's vertical frame stroke in the HTML renderer at DPR 1, 1.25, 1.5, 2, 2.625 and 3 and scale 1 to 2. What made it exact: every edge rounded to a whole device pixel in a stage laid out in device pixels and scaled by 1 / devicePixelRatio; bitmap glyphs clipped to their cells; jgs9's frame glyphs as one-font-pixel boxes; bitmap halos as eight shifted copies of the clipped glyph; the vector face through a metrics-overridden alias of its woff2 plus a baseline measured at load. Option B's verdict below ("cannot draw halos at one font pixel") no longer holds. The canvas renderer stays working for current consumers and as the bitmap pixel reference, with no new features. The rest of this plan is the canvas design as built.

Canvas 2D in `web/canvas.js`, the input layer in `web/targets.js`. The model, components and tokens are [01-system.md](01-system.md).

## Rendering on the web

| | A. Canvas 2D atlas | B. DOM text | C. WebGL instanced cells | D. SVG |
|---|---|---|---|---|
| Pixel-exact | Yes, at any devicePixelRatio | Only where the browser snaps glyphs to device pixels; unverified at 1.5 and 2.625 | Yes | No (antialiased paths) |
| Glyph clipped to its cell | Yes | No (jgs5 advances, missing glyphs fall back) | Yes | Yes |
| Surfaces snapped to the stroke, 1 px halos | Yes | Approximate (positioned divs, `text-shadow` is antialiased) | Yes | Yes |
| Same output on iOS and Android natively | Yes, same atlas | No | Yes, same atlas | No |
| Accessibility | Native buttons layer plus the semantics mirror | Native | Same as A | Partial |
| Cost per frame | One `drawImage` per changed cell | DOM diff | One draw call | DOM diff |

Advocates, in short: B is the simplest and keeps text selectable and readable by screen readers. A is the only one that gives the same pixels everywhere, does not depend on the browser's text engine or the woff2's glyph set, and draws protection exactly. C is A for full-screen grids redrawn every frame. D has no advocate here.

**Taken: A as the renderer (`web/canvas.js`), C only if A's frame time fails the exit test.** B matched A in the first round of the preview, but cannot draw halos at one font pixel, so it was dropped and is kept only as an idea for static text pages.

How A works:

1. **Atlas at build time. Not built.** `scripts/build-atlas` reads each TTF's outlines, which are pixel-aligned polygons, and rasterizes every glyph into a 1-bit sheet: one PNG per face, glyphs in code-point order, plus `atlas.json` mapping code point to sheet index, the substitution table, and the stroke position from `spec/faces.json`. Deterministic, no browser in the loop. `web/canvas.js` rasterizes at runtime with `fillText` and a 50 percent alpha threshold instead.
2. **Integer device scale.** `k = max(1, round(scale × devicePixelRatio))` device pixels per font pixel. The canvas backing store is `cols × cellWidth × k` wide and its CSS width that divided by `devicePixelRatio`, so the CSS size may be fractional but every font pixel is exactly k device pixels. `imageSmoothingEnabled = false`. The buttons layer uses the same CSS cell size, so hit rects line up with the drawn chips.
3. **Tinting and halos.** One tinted copy of a glyph per colour in use, and one dilated copy per glyph for halos, cached; a palette is under 16 colours, so the cache is bounded by glyphs × colours.
4. **Dirty cells. Not built:** `render` redraws every cell on every call; it skips only the canvas resize when the size is unchanged. The plan: the grid keeps the previous frame; only changed cells are cleared and redrawn, with their halos' one-pixel spill. A meter's value change redraws its segments and number, not the panel. The buttons layer is rebuilt only when targets change, never while a pointer is held (a rebuild drops pointer capture).
5. **Motion.** (`g.motion(...)`; `g.flicker` is its old name, kept as an alias for one release.) A motion is data on the grid (`{ x, y, w, h, start, pattern }`, patterns in `spec/motion.json`), so a native renderer applies the same steps. The renderer takes `now` and skips, for that frame, every cell a running motion hides; a surface flickers only with a `steps` motion that covers its panel whole, so a flickering label never cuts a hole in a panel. Frames are driven by `play(draw)`: one `requestAnimationFrame` loop that runs while the drawn grid has a running motion and then stops, so a static HUD costs no frames. Under `prefers-reduced-motion: reduce` the renderer draws every cell at rest (`reduceMotion`, default from the media query) and `play` draws once. The default pattern is exo-space's `.console.loaded` keyframes (`flicker .9s steps(1)`); the steps hold their value until the next offset, as CSS `steps(1)` does, which the tests check at each boundary.
6. **Text.** `g.line` and `g.block` clip each line to a width in columns with `…` (drawn by every face) and take runs of roles, so a product's one-line consoles keep their per-symbol colours; `wrap` breaks free text (tooltips, logs) to a width first. Characters a face lacks (exo-space's alchemical item symbols) are drawn by the renderer as text in a `fallback` family, centred in the cell and antialiased; they are the only cells not pixel-exact.
7. **Accessibility.** The buttons layer; **not built:** a visually hidden list built from the display components' semantics. The plan: the buttons layer, plus a visually hidden list built from the display components' semantics, with `aria-live="polite"` on the telemetry panel only.

## Exit test

- Landed in `test/spec.test.mjs`: per face, the horizontal arms of `─┌┐└┘├┤┬┴┼` (after fixes) share one row and the vertical arms one column, on the face's stroke; jgs9's synthesized stroke sits where its own `-` and `|` do.
- The atlas build run twice gives byte-identical files. Cannot run: the atlas is not built.
- Landed in `test/motion.test.mjs`: the flicker's opacity at each step boundary matches the game's keyframes, a motion hides only its rect and stops at its duration, reduced motion draws everything, the typed-on reveal goes in reading order, and clipping, runs, blocks and wrapping.
- The preview's flicker, sampled every 25 ms in headless Chrome with reduced motion emulated off: the HUD is off, on, off, on, off, on, off and then on from about 630 ms, and the loop stops after 900 ms. Not on a phone.
- Landed: every glyph the example HUD emits can be drawn in every face; no two hit rects overlap and each is at least 44 × 44 CSS px under a coarse pointer, at jgs7 × 2 and jgs5 × 3.
- On a phone: each button activates on tap, a press slid off does not activate, and a pan that starts between panels moves the world. Untested; the preview has been driven by keyboard in desktop Chrome only.
- Drag to scroll in the preview: a mouse drag of 100 × 200 px scrolled the box by exactly that, a drag that started on SCAN did not activate it, and a tap on SCAN did. Driven with synthetic pointer events in headless Chrome; not on a phone.
- A full-screen grid (desktop at jgs7 × 2) redrawn every frame stays under 4 ms of render time on an M4 and on the Fold8 in a WebView. Unmeasured; not built into any script.
