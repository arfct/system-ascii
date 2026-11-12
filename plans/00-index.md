# Plans

| # | Plan | What it settles |
|---|---|---|
| 01 | [The system](01-system.md) | The font's measured facts, the cell model, tokens, components, buttons and touch, background protection and titles; the shared `spec/`. |
| 02 | [The web renderer](02-web.md) | The HTML renderer as primary (amended 2026-11-12, pixel parity measured); the deprecated Canvas 2D over 1-bit glyph masks at whole device pixels per font pixel, the vector face as text, native buttons for input, drag to scroll, motion (flicker, typed on) and clipped text blocks; the atlas build to come. |
| 03 | [iOS and Android](03-ios-and-android.md) | Native renderers reading the same spec, matched to the web by screenshot; where the components live. |
| 04 | [Windows, menus and dialogs](04-windows.md) | Rows as targets with 44 px bands, states and their roles, slots for native inputs, scroll regions, icon buttons sized to exo-space with icon weights matched to the face's stroke, focus groups, `nextTarget`, modals, the text mirror, the flicker cascade (proposed); why HTML. |

Status lives in GitHub issues, not here.
