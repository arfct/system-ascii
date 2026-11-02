import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clip, clipRuns, ELLIPSIS, Grid, wrap } from "../web/grid.js";
import { motion, motionDuration, running, stepOpacity, surfaceVisible, visibility } from "../web/motion.js";
import { canDraw, faces, themes } from "../web/spec.js";

describe("spec/motion.json", () => {
  it("flicker is the game's keyframes: 0.9 s, steps of opacity, ending lit", () => {
    const f = motion.flicker;
    assert.equal(f.kind, "steps");
    assert.equal(f.duration, 900);
    const at = f.steps.map(([t]) => t);
    assert.deepEqual(
      at,
      [...at].sort((a, b) => a - b),
    );
    assert.equal(at[0], 0);
    assert.equal(f.steps.at(-1)[1], 1);
  });

  it("stepOpacity holds each step until the next, like CSS steps(1)", () => {
    const o = (ms) => stepOpacity("flicker", ms);
    assert.deepEqual([0, 100, 108, 179, 180, 252, 369, 495, 567, 630, 899, 900, 5000].map(o), [0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1]);
    assert.equal(o(-1), 0);
  });
});

describe("motions on a grid", () => {
  const g = new Grid(4, 2);
  g.text(0, 0, "ABCD", "accent");
  g.text(0, 1, "EFGH", "accent");
  g.flicker(0, 0, 4, 1, { start: 1000 });

  it("hide the rect's cells while off, and only those", () => {
    const vis = visibility(g, 1000);
    assert.deepEqual([...vis], [0, 0, 0, 0, 1, 1, 1, 1]);
    assert.deepEqual([...visibility(g, 1150)], [1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it("stop running when the pattern ends, and then draw everything", () => {
    assert.equal(running(g, 1899), true);
    assert.equal(running(g, 1900), false);
    assert.equal(visibility(g, 1900), null);
  });

  it("are off under reduced motion", () => {
    assert.equal(visibility(g, 1000, true), null);
  });

  it("a typed-on reveal shows cells one by one in reading order", () => {
    const t = new Grid(3, 2);
    t.flicker(0, 0, 3, 2, { start: 0, pattern: "type" });
    const ms = motion.type.msPerCell;
    assert.equal(motionDuration(t.motions[0]), 6 * ms);
    assert.deepEqual([...visibility(t, 2 * ms)], [1, 1, 0, 0, 0, 0]);
    assert.deepEqual([...visibility(t, 4 * ms)], [1, 1, 1, 1, 0, 0]);
  });

  it("a surface flickers only with a steps motion that covers it whole", () => {
    const p = new Grid(10, 5);
    const s = { x: 1, y: 1, w: 4, h: 3 };
    p.flicker(0, 0, 10, 5, { start: 0 });
    assert.equal(surfaceVisible(p, s, 0), false);
    assert.equal(surfaceVisible(p, s, 0, true), true);
    const q = new Grid(10, 5);
    q.flicker(2, 1, 2, 1, { start: 0 });
    assert.equal(surfaceVisible(q, s, 0), true);
  });
});

describe("text blocks", () => {
  it("clip ends in an ellipsis only when cut, and every face draws it", () => {
    assert.equal(clip("SHIP: DOCKED", 20), "SHIP: DOCKED");
    assert.equal(clip("SHIP: DOCKED", 8), `SHIP: D${ELLIPSIS}`);
    assert.equal([...clip("SHIP: DOCKED", 8)].length, 8);
    for (const face of Object.keys(faces)) assert.ok(canDraw(face, ELLIPSIS), face);
  });

  it("clipRuns keeps each run's role up to the cut", () => {
    assert.deepEqual(
      clipRuns(
        [
          ["ORE ", "accent"],
          ["12345", "text"],
        ],
        7,
      ),
      [
        ["ORE ", "accent"],
        [`12${ELLIPSIS}`, "text"],
      ],
    );
  });

  it("line and block write runs, clipped, left or right aligned, at most maxLines", () => {
    const g = new Grid(12, 3);
    g.block(
      0,
      0,
      [
        "ONE",
        [
          ["TWO ", "dim"],
          ["LONGER TEXT", "accent"],
        ],
        "THREE",
        "FOUR",
      ],
      { width: 10, maxLines: 3 },
    );
    assert.deepEqual(g.toString().split("\n"), ["ONE         ", `TWO LONGE${ELLIPSIS}  `, "THREE       "]);
    assert.equal(g.cells[12].fg, "dim");
    assert.equal(g.cells[16].fg, "accent");
    const r = new Grid(8, 1);
    r.line(7, 0, "AB", { align: "right" });
    assert.equal(r.toString(), "      AB");
  });

  it("wrap breaks at spaces and splits words longer than the width", () => {
    assert.deepEqual(wrap("GO TO THE HUB NOW", 9), ["GO TO THE", "HUB NOW"]);
    assert.deepEqual(wrap("ABCDEFGHIJ", 4), ["ABCD", "EFGH", "IJ"]);
    assert.deepEqual(wrap("A\nB", 4), ["A", "B"]);
  });
});

describe("spec/tokens.json", () => {
  it("every theme defines every role the components use", () => {
    const roles = Object.keys(themes.mock);
    for (const [name, t] of Object.entries(themes)) for (const r of roles) assert.match(t[r], /^#[0-9a-f]{6}$|./, `${name}.${r}`);
  });

  it("landroid is the game's palette", () => {
    const t = themes.landroid;
    assert.deepEqual([t.world, t.accent, t.cyan, t.alert, t.pink, t.flag], ["#16161d", "#b7b7ff", "#6fe3e0", "#ffc79a", "#ffb7d5", "#c6ff00"]);
  });
});
