// Serializes examples/hud.js for the snapshot test: text, roles per cell, surfaces and targets.
import { hud } from "../examples/hud.js";
import { faces } from "../web/spec.js";

export const VARIANTS = {
  default: {},
  chip: { titleStyle: "chip", titleSpaces: true, labelHalo: false, pressed: "SCAN", toggles: { AUTO: false }, last: "DOCK" },
};

export function snapshot() {
  const out = {};
  for (const face of Object.keys(faces))
    for (const [name, o] of Object.entries(VARIANTS)) {
      const g = hud(face, o);
      out[`${face}/${name}`] = {
        text: g.toString().split("\n"),
        roles: g.cells.map((c) => `${c.fg}|${c.bg ?? ""}|${c.halo ? 1 : 0}`).join(" "),
        surfaces: g.surfaces,
        targets: g.targets.map(({ id, x, y, w, h, tone, toggle, on, disabled }) => ({ id, x, y, w, h, tone, toggle, on, disabled })),
      };
    }
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()) && process.argv[2] === "--write") {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(new URL("./snapshots/hud.json", import.meta.url), `${JSON.stringify(snapshot(), null, 1)}\n`);
}
