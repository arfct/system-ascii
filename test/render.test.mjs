import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hud } from "../examples/hud.js";
import { render } from "../web/canvas.js";
import { button } from "../web/components.js";
import { domFamily, ICON_FONT } from "../web/dom.js";
import { Grid } from "../web/grid.js";
import { gridBox, wholeDevice } from "../web/metrics.js";
import { themes } from "../web/spec.js";
import { hitRects } from "../web/targets.js";

/** A canvas whose 2D context records calls; enough for the vector face, which needs no OffscreenCanvas. */
function stubCanvas() {
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      get: (o, k) => (k in o ? o[k] : (...a) => calls.push([k, ...a])),
      set: (o, k, v) => {
        o[k] = v;
        return true;
      },
    },
  );
  return { width: 0, height: 0, style: {}, calls, getContext: () => ctx };
}

describe("render (canvas)", () => {
  it("throws on a role that is neither in the theme nor a colour", () => {
    const g = new Grid(4, 1);
    g.text(0, 0, "AB", "acent");
    assert.throws(() => render(stubCanvas(), g, { face: "jgs-vector", scale: 1, theme: themes.mock, dpr: 1, reduceMotion: true }), /acent/);
  });

  it("the vector halo pass skips a character the face lacks when a fallback draws it", () => {
    const g = new Grid(2, 1);
    g.put(0, 0, "🜍", "accent", undefined, true);
    g.put(1, 0, "A", "accent", undefined, true);
    const c = stubCanvas();
    render(c, g, { face: "jgs-vector", scale: 1, theme: themes.mock, dpr: 1, reduceMotion: true, fallback: "Noto Sans Symbols" });
    assert.deepEqual(
      c.calls.filter(([m]) => m === "strokeText").map(([, t]) => t),
      ["A"],
    );
  });

  it("sizes the canvas from the dpr option, its CSS size on the 1/64 px layout unit", () => {
    const c = stubCanvas();
    render(c, hud("jgs-vector"), { face: "jgs-vector", scale: 1, theme: themes.mock, dpr: 1.5, snap: true, reduceMotion: true });
    // 46 cells × 7 font px × 2 device px = 644 device px = 429.33 CSS px, padded to 645 (430 CSS px).
    assert.equal(c.width, 645);
    assert.equal(c.style.width, "430px");
    assert.equal(wholeDevice(644, 1.5), 645);
    assert.equal(wholeDevice(644, 2), 644);
  });

  it("snap rounds the vector face to whole device pixels per font pixel; bitmap faces always are", () => {
    assert.equal(gridBox("jgs-vector", 1.25, 1, 1, 2).k, 2.5);
    assert.equal(gridBox("jgs-vector", 1.25, 1, 1, 2, true).k, 3);
    assert.equal(gridBox("jgs7", 1.25, 1, 1, 2).k, 3);
  });
});

describe("targets", () => {
  it("a disabled target with a reason keeps its hit rect and carries the reason", () => {
    const r = hitRects(hud("jgs7"), { cellW: 14, cellH: 28 }, 44).find((x) => x.id === "WARP");
    assert.equal(r.reason, "NO LANE");
    assert.equal(r.disabled, true);
    assert.ok(r.w >= 44 && r.h >= 44);
  });

  it("a target's own hit size in CSS px need not be whole cells", () => {
    const g = new Grid(10, 3);
    button(g, 1, 1, { id: "A", label: "A", hit: { h: 44 } });
    const [r] = hitRects(g, { cellW: 8.75, cellH: 18.75 }, 24);
    assert.equal(r.h, 44);
    assert.equal(r.y, 18.75 - (44 - 18.75) / 2);
    assert.equal(r.w, 3 * 8.75);
  });
});

describe("renderDOM and icons", () => {
  it("draws the vector face through the metrics-overridden alias, bitmap faces as themselves", () => {
    assert.match(domFamily("jgs-vector"), /^"jgs-vector-cell", jgs-vector$/);
    assert.equal(domFamily("jgs7"), "jgs7");
    assert.equal(ICON_FONT, "Material Symbols Sharp");
  });

  it("g.icon records a block and clears its cells", () => {
    const g = new Grid(6, 2);
    g.text(0, 0, "ABCDEF", "accent");
    g.icon(1, 0, 2, 1, "rocket_launch", "cyan", { label: "LAUNCH" });
    assert.deepEqual(g.icons, [{ x: 1, y: 0, w: 2, h: 1, name: "rocket_launch", fg: "cyan", label: "LAUNCH" }]);
    assert.equal(g.toString().split("\n")[0], "A  DEF");
  });
});
