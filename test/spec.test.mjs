import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { COLS, hud } from "../examples/hud.js";
import { canDraw, faces, glyphFor, glyphs } from "../web/spec.js";
import { hitRects } from "../web/targets.js";

const FRAME = "─│┌┐└┘├┤┬┴┼";

describe("spec/faces.json", () => {
  for (const [face, f] of Object.entries(faces)) {
    if (f.synth) continue;
    const g = glyphs[face];
    it(`${face}: horizontal frame strokes share one row after fixes, on the face's stroke`, () => {
      const rows = new Set([...FRAME].filter((ch) => g.h[ch] || g.h[glyphFor(face, ch)]).map((ch) => g.h[glyphFor(face, ch)].join("-")));
      assert.deepEqual([...rows], [`${f.stroke[1]}-${f.stroke[1] + 1}`]);
    });
    it(`${face}: vertical frame strokes share one column, on the face's stroke`, () => {
      const cols = new Set([...FRAME].filter((ch) => g.v[ch]).map((ch) => g.v[ch].join("-")));
      assert.deepEqual([...cols], [`${f.stroke[0]}-${f.stroke[0] + 1}`]);
    });
  }

  it("jgs7's ─ is off the corners without its fix (the reason the fix exists)", () => {
    assert.notDeepEqual(glyphs.jgs7.h["─"], glyphs.jgs7.h["┌"]);
  });

  it("synthesized faces put the stroke where their own - and | are", () => {
    for (const [face, f] of Object.entries(faces)) {
      if (!f.synth) continue;
      assert.equal(glyphs[face].h["-"][0], f.stroke[1], face);
      assert.equal(glyphs[face].v["|"][0], f.stroke[0], face);
    }
  });
});

describe("examples/hud.js", () => {
  for (const face of Object.keys(faces)) {
    it(`${face}: every glyph the layout emits can be drawn`, () => {
      const missing = new Set(
        hud(face)
          .cells.map((c) => glyphFor(face, c.ch))
          .filter((ch) => !canDraw(face, ch)),
      );
      assert.deepEqual([...missing], []);
    });
  }

  it("draws titles with no spaces by default", () => {
    assert.match(hud("jgs7").toString().split("\n")[1], /^┌─SYSTEM \/\/ DEV-60930─+┐ *$/);
  });

  it("hit rects don't overlap and are 44 px or more under a coarse pointer, at jgs7 × 2 and jgs5 × 3", () => {
    for (const [face, scale] of [
      ["jgs7", 2],
      ["jgs5", 3],
    ]) {
      const [cw, ch] = faces[face].cell;
      const rects = hitRects(hud(face), { cellW: cw * scale, cellH: ch * scale }, 44);
      for (const r of rects) assert.ok(r.w >= 44 && r.h >= 44, `${face} ${r.id}`);
      for (const a of rects)
        for (const b of rects) {
          if (a === b) continue;
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          assert.ok(!overlap, `${face}: ${a.id} overlaps ${b.id}`);
        }
    }
  });

  it("fits the grid", () => {
    assert.ok(
      hud("jgs7")
        .toString()
        .split("\n")
        .every((l) => [...l].length === COLS),
    );
  });
});

describe("fonts", () => {
  it("ship a woff2 per face and the OFL", () => {
    for (const f of Object.values(faces)) assert.ok(readFileSync(new URL(`../fonts/${f.file}.woff2`, import.meta.url)).length > 0);
    assert.match(readFileSync(new URL("../fonts/OFL.txt", import.meta.url), "utf8"), /SIL OPEN FONT LICENSE/i);
  });
});
