import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { divider, dividerV, panel } from "../web/components.js";
import { cellsOf, clip, clipRuns, ELLIPSIS, Grid, lengthOf, runsOf, wrap } from "../web/grid.js";
import { canDraw, faces, glyphFor } from "../web/spec.js";

describe("cells", () => {
  // Enigma's notation (github.com/arfct/enigma, NOTATION.md): U+0301 and U+0300 on a vowel.
  const word = "sɛlfɛ\u0301vɪdənt";

  it("a combining mark shares its letter's cell", () => {
    assert.deepEqual(cellsOf("ɛ\u0301v"), ["ɛ\u0301", "v"]);
    assert.equal(cellsOf(word).length, 11);
    assert.deepEqual(cellsOf("n\u0329"), ["n\u0329"]);
    assert.deepEqual(cellsOf("abc"), ["a", "b", "c"]);
  });

  it("a pair Unicode has as one character becomes it; a mark with no letter keeps a cell", () => {
    assert.deepEqual(cellsOf("a\u0300ʊ"), ["à", "ʊ"]);
    assert.deepEqual(cellsOf("æ\u0301"), ["ǽ"]);
    assert.deepEqual(cellsOf("\u0301a \u0301"), ["\u0301", "a", " ", "\u0301"]);
  });

  it("text, clip, wrap and lengthOf count cells, not code points", () => {
    const g = new Grid(12, 1);
    g.text(0, 0, word, "accent");
    assert.equal(g.at(4, 0).ch, "ɛ\u0301");
    assert.equal(g.at(10, 0).ch, "t");
    assert.equal(g.at(11, 0).ch, " ");
    g.textRight(11, 0, word, "accent");
    assert.equal(g.at(1, 0).ch, "s");
    assert.equal(clip(word, 11), word);
    assert.equal(clip(word, 6), `sɛlfɛ\u0301${ELLIPSIS}`);
    assert.equal(lengthOf([[word, "accent"]]), 11);
    assert.deepEqual(wrap(`təbi ${word}`, 11), ["təbi", word]);
  });

  it("jgs-extended draws a letter with its accent; the other faces do not have the letter", () => {
    assert.ok(canDraw("jgs-extended", "ɛ\u0301"));
    assert.ok(canDraw("jgs-extended", "ǽ"));
    assert.ok(!canDraw("jgs-vector", "ɛ\u0301"));
    assert.ok(!canDraw("jgs7", "ɛ\u0301"));
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
