import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { snapshot } from "./snapshot.mjs";

// The snapshot was written from e2de82d; a change that moves a cell, a role, a surface or a target fails here.
// Regenerate on purpose with `node test/snapshot.mjs --write`.
describe("examples/hud.js snapshot", () => {
  const want = JSON.parse(readFileSync(new URL("./snapshots/hud.json", import.meta.url), "utf8"));
  const got = snapshot();
  for (const key of Object.keys(want))
    it(`${key} is unchanged`, () => {
      assert.deepEqual(got[key], want[key]);
    });
});
