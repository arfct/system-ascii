---
title: System ASCII
date: 2026-11
category: system
tags: [web, design]
url: https://arfct.github.io/system-ascii/
links:
  source: https://github.com/arfct/system-ascii
media:
  - src: telemetry.png
    caption: The autopilot and flight telemetry panels of the preview's HUD in the 7×14 face at scale 2; the lower one has two meters, an amber toggle that is on and a row of buttons, the last of them disabled
    alt: Pixel-font text on near black in two thin frames, the upper one amber and titled Autopilot Engaged, the lower one cyan and titled Flight Telemetry, with two rows of square meter segments labelled THR and VEL, an amber AUTO chip, and buttons reading DOCK, SCAN, LAND and a dimmed WARP
  - src: hud-landroid.png
    caption: The whole HUD in the second theme, three panels over a stand-in for the game's world
    alt: Three framed panels of pixel-font text in lavender and peach on dark slate, titled System, Autopilot Engaged and Flight Telemetry, over faint grid lines and orbit curves
unconfirmed: [date]
---

The unit of System ASCII is the character cell. Panels, badges, rules, meters, readouts and buttons are laid out in whole cells of the jgs pixel font and drawn as positioned HTML elements, with every edge on a whole device pixel. The system began as the heads-up display for a game, exo*space, and was moved into a repository of its own to serve other products.

The font comes in three 1-bit faces, with cells of 5×10, 7×14 and 9×18 pixels, and one vector face that is antialiased at any scale. The largest bitmap face has no box-drawing characters, so its frames are built from one-pixel strokes. Each button on screen is a native button element, so presses, keyboard focus and the accessibility tree are the browser's.

Two themes assign colors by role. Of the two motions, one is a flicker of eight on-and-off steps over 0.9 seconds, taken from the game's console, and the other reveals the cells one by one in reading order; with reduced motion set on the device, every cell is drawn at rest. The preview page draws a flight HUD, with pickers for the face, scale, theme and motion among others. The canvas renderer that came first is deprecated and kept as the pixel reference for the bitmap faces. Jgs Font is by Adel Faure, in tribute to Joan G. Stark, and comes from the Velvetyne type foundry.

JavaScript, HTML, CSS. 2026.
