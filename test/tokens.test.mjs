import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { off, parseColor, resolve } from "../web/color.js";
import { button, meter } from "../web/components.js";
import { Grid } from "../web/grid.js";
import { roles, themes, tokens } from "../web/spec.js";

const HEX = /^#[0-9a-f]{6}$/;

/** Every theme in `t` has every required role as a hex colour; returns the failures. */
export function missingRoles(t) {
  const out = [];
  for (const [name, theme] of Object.entries(t)) for (const r of roles.required) if (!HEX.test(theme[r] ?? "")) out.push(`${name}.${r}`);
  return out;
}

describe("spec/tokens.json", () => {
  it("every theme defines every required role (spec/roles.json) as a hex colour", () => {
    assert.deepEqual(missingRoles(tokens), []);
  });

  it("the check fails when a theme loses a role", () => {
    const broken = structuredClone(tokens);
    delete broken.landroid.ghost;
    assert.deepEqual(missingRoles(broken), ["landroid.ghost"]);
  });

  it("aliases fill in: dim is ghostText in every theme", () => {
    for (const t of Object.values(themes)) assert.equal(t.dim, t.ghostText);
    assert.equal(tokens.landroid.dim, undefined);
  });

  it("landroid is the game's palette", () => {
    const t = themes.landroid;
    assert.deepEqual([t.world, t.accent, t.cyan, t.alert, t.pink, t.flag], ["#16161d", "#b7b7ff", "#6fe3e0", "#ffc79a", "#ffb7d5", "#c6ff00"]);
  });
});

describe("roles to colours", () => {
  it("a button and a meter in every landroid role resolve to colours in the theme", () => {
    const t = themes.landroid;
    const values = new Set(Object.values(t));
    for (const tone of Object.keys(t).filter((r) => r !== "label")) {
      const g = new Grid(30, 1);
      button(g, 0, 0, { id: "B", label: "GO", tone });
      meter(g, 6, 0, { segments: 4, on: 2, glyphs: "█", tone });
      for (const c of g.cells) {
        for (const r of [c.fg, c.bg]) if (r) assert.ok(values.has(resolve(t, r)), `${tone}: ${r}`);
      }
    }
    assert.equal(off(t, "cyan"), t.ghost);
    assert.equal(off(t, "alert"), t.alertOff);
  });

  it("an unknown role throws; colours and transparent pass", () => {
    assert.throws(() => resolve(themes.mock, "acent"), /acent/);
    assert.equal(resolve(themes.mock, "#ff0000"), "#ff0000");
    assert.equal(resolve(themes.mock, "transparent"), null);
    assert.equal(resolve(themes.mock, null), null);
  });

  it("parseColor reads hex and rgb forms", () => {
    assert.deepEqual(parseColor("#ff8000"), [255, 128, 0, 1]);
    assert.deepEqual(parseColor("#f80"), [255, 136, 0, 1]);
    assert.deepEqual(parseColor("rgba(1, 2, 3, 0.5)"), [1, 2, 3, 0.5]);
    assert.equal(parseColor("transparent"), null);
  });
});
