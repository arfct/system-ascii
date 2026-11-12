import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Grid } from "../web/grid.js";
import { motion, motionDuration, rowDelay, running, stepOpacity, surfaceVisible, visibility } from "../web/motion.js";

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

  it("Grid.flicker is an alias of Grid.motion", () => {
    const a = new Grid(2, 1);
    a.flicker(0, 0, 2, 1, { start: 5, pattern: "type" });
    const b = new Grid(2, 1);
    b.motion(0, 0, 2, 1, { start: 5, pattern: "type" });
    assert.deepEqual(a.motions, b.motions);
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
    p.flicker(0, 0, 10, 5, { start: 0, rowDelay: 0 });
    assert.equal(surfaceVisible(p, s, 0), false);
    assert.equal(surfaceVisible(p, s, 0, true), true);
    const q = new Grid(10, 5);
    q.flicker(2, 1, 2, 1, { start: 0 });
    assert.equal(surfaceVisible(q, s, 0), true);
  });

  it("the flicker cascades: row 3 runs 3 × rowDelay behind row 0 at the same now", () => {
    const c = new Grid(1, 4);
    c.fill(0, 0, 1, 4, "X", "accent");
    c.motion(0, 0, 1, 4, { start: 0 });
    const d = motion.flicker.rowDelay;
    assert.equal(d, 60);
    assert.equal(rowDelay(c.motions[0]), 60);
    // At 120 ms row 0 is past its 0.12 step (108 ms) and lit; row 3 is at -60 ms and off.
    const vis = visibility(c, 120);
    assert.equal(vis[0], 1);
    assert.equal(vis[3], 0);
    // Row 3 sees row 0's frame 3 × 60 ms later.
    for (const t of [0, 110, 200, 400, 640]) assert.equal(visibility(c, t + 3 * d)?.[3] ?? 1, stepOpacity("flicker", t), `t ${t}`);
  });

  it("the duration includes the cascade, and rowDelay 0 turns it off", () => {
    const c = new Grid(2, 5);
    c.motion(0, 0, 2, 5, { start: 0 });
    assert.equal(motionDuration(c.motions[0]), 900 + 4 * 60);
    assert.equal(running(c, 900 + 4 * 60 - 1), true);
    assert.equal(running(c, 900 + 4 * 60), false);
    const z = new Grid(2, 5);
    z.motion(0, 0, 2, 5, { start: 0, rowDelay: 0 });
    assert.equal(motionDuration(z.motions[0]), 900);
  });

  it("in a cascade a surface follows the motion's row at its top edge", () => {
    const c = new Grid(10, 6);
    const s = { x: 0, y: 2, w: 10, h: 3 };
    c.motion(0, 0, 10, 6, { start: 0 });
    // The surface's top row is row 2 of the rect: 120 ms behind. At 120 ms row 0 is lit, row 2 is at 0 ms (off).
    assert.equal(surfaceVisible(c, s, 120), false);
    assert.equal(surfaceVisible(c, s, 120 + 120), true);
  });
});
