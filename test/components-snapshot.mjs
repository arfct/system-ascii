// Serializes the component fixtures for the snapshot test: each fixture's text at 27, 44 and 64
// columns (scroll bodies appended under their window). Regenerate on purpose with
// `node test/components-snapshot.mjs --write`.
import { dialog } from "../examples/dialog.js";
import { iconButtons } from "../examples/icons.js";
import { menu } from "../examples/menu.js";
import { buildWindow } from "../examples/window.js";

export const WIDTHS = [27, 44, 64];
export const FIXTURES = {
  menu: (cols) => menu(cols),
  dialog: (cols) => dialog(cols),
  window: (cols) => buildWindow(cols),
  icons: (cols) => iconButtons(cols),
};

/** The fixture's text, with each scroll body's text under it. */
export function text(g) {
  const parts = [g.toString()];
  for (const s of g.scrolls ?? []) parts.push(`-- ${s.id} --`, s.grid.toString());
  return parts.join("\n");
}

export function snapshot() {
  const out = [];
  for (const [name, make] of Object.entries(FIXTURES)) for (const cols of WIDTHS) out.push(`== ${name} ${cols} ==`, text(make(cols)));
  return `${out.join("\n")}\n`;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()) && process.argv[2] === "--write") {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(new URL("./snapshots/components.txt", import.meta.url), snapshot());
}
