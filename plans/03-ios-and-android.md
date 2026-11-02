# iOS and Android

Native renderers for the same grid, planned and not started. The model is [01-system.md](01-system.md); the web renderer it has to match is [02-web.md](02-web.md).

## Settled

- A product that ships on phones through a WebView shell (Capacitor, as exo-space plans) uses the web renderer as it stands, buttons layer included; WKWebView and Android System WebView treat the layer as ordinary buttons. That is the first form of "all platforms", and needs nothing here.
- Native renderers read the same `spec/faces.json`, `spec/tokens.json` and glyph data, and draw the same 1-bit glyphs at the same integer scale rule, so a screenshot diff against the web is the test.

## Proposed

| | iOS | Android |
|---|---|---|
| Folder | `ios/` (Swift package `SystemASCII`) | `android/` (Gradle module `system-ascii`) |
| Draw | SwiftUI `Canvas`, or a Metal quad per cell if frame time needs it | Compose `Canvas`, `drawImage` with `FilterQuality.None` |
| Glyphs | The atlas PNGs and `atlas.json` from the build step in 02 | The same files |
| Vector face | Core Text with the TTF from `fonts/src/` | `Typeface` from the same TTF |
| Controls | Invisible views over each hit rect with `accessibilityElement` frames, 44 pt minimum | `Modifier.clickable` boxes with `semantics`, 48 dp minimum |
| Scroll | `ScrollView`; a press past 8 pt releases the control | `verticalScroll`; same slop |

## Open

1. **Where the components live.** Port the component functions to Swift and Kotlin (they are small and pure), or keep them in JavaScript and send a serialized grid to the native side. Porting keeps native apps free of a JS runtime; sharing keeps one definition. A cross-platform fixture (the example HUD serialized to JSON, with a test on each platform that its own components produce the same grid) makes porting safe.
2. **Atlas build first.** Both native renderers want the build-time atlas from [02-web.md](02-web.md), step 1; it should land before either starts.

## Exit test

- `examples/hud.js`, built on each platform, produces the same grid as the web (the JSON fixture).
- A screenshot of the example on the iOS simulator and the Android emulator at jgs7 × 2 matches the web's at the same device pixel ratio, pixel for pixel.
