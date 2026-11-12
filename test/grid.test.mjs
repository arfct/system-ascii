import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { divider, dividerV, panel } from "../web/components.js";
import { clip, clipRuns, ELLIPSIS, Grid, lengthOf, runsOf, wrap } from "../web/grid.js";
import { canDraw, faces, glyphFor } from "../web/spec.js";

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

  it("runsOf and lengthOf are exported", () => {
    assert.deepEqual(runsOf("AB", "dim"), [["AB", "dim"]]);
    assert.equal(
      lengthOf([
        ["AB", "x"],
        ["…", "y"],
      ]),
      3,
    );
  });
});

describe("components", () => {
  it("panel returns its inner box with width and height", () => {
    const g = new Grid(20, 6);
    assert.deepEqual(panel(g, 1, 0, 10, 6), { left: 3, right: 8, top: 1, bottom: 4, width: 6, height: 4 });
  });

  it("divider and dividerV join a frame, and every face draws them", () => {
    const g = new Grid(9, 5);
    panel(g, 0, 0, 9, 5);
    divider(g, 0, 2, 9);
    dividerV(g, 4, 0, 5);
    assert.deepEqual(g.toString().split("\n"), ["┌───┬───┐", "│   │   │", "├───┼───┤", "│   │   │", "└───┴───┘"]);
    for (const face of Object.keys(faces)) for (const ch of "├┤┬┴") assert.ok(canDraw(face, glyphFor(face, ch)), `${face} ${ch}`);
  });
});
