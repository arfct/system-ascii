// The shared spec: face metrics and fixes, tokens, roles, and each face's glyph data. Every
// platform reads these files; nothing here is web-only.
import faces from "../spec/faces.json" with { type: "json" };
import glyphs from "../spec/glyphs.json" with { type: "json" };
import roles from "../spec/roles.json" with { type: "json" };
import tokens from "../spec/tokens.json" with { type: "json" };

/** Themes from spec/tokens.json, with spec/roles.json's aliases filled in (landroid's `dim`). */
const themes = Object.fromEntries(
  Object.entries(tokens).map(([name, t]) => {
    const out = { ...t };
    for (const [alias, role] of Object.entries(roles.aliases)) if (out[alias] === undefined && out[role] !== undefined) out[alias] = out[role];
    return [name, out];
  }),
);

export { faces, glyphs, roles, themes, tokens };

/** The glyph a face draws for `ch`, after its fixes. */
export function glyphFor(face, ch, fixes = true) {
  return (fixes ? faces[face].fixes[ch] : undefined) ?? ch;
}

const drawable = new Map();
/** Whether a face can draw `ch`: in its cmap, or synthesized by the renderer. One Set per face. */
export function canDraw(face, ch) {
  let set = drawable.get(face);
  if (!set) {
    set = new Set([" ", ...glyphs[face].chars, ...(faces[face].synth ?? "")]);
    drawable.set(face, set);
  }
  return set.has(ch);
}

const ARMS = { "─": "lr", "│": "ud", "┌": "rd", "┐": "ld", "└": "ru", "┘": "lu", "├": "udr", "┤": "udl", "┬": "lrd", "┴": "lru", "┼": "lrud" };

/**
 * A synthesized glyph (a frame glyph, or a shape listed in the face's `shapes`) as one-font-pixel strokes through the face's stroke position:
 * `[x0, y0, x1, y1]` rects in font px, end-exclusive. Null when the face draws `ch` itself.
 */
export function synthRects(face, ch) {
  const f = faces[face];
  if (!(f.synth ?? "").includes(ch)) return null;
  if (f.shapes?.[ch]) return f.shapes[ch];
  const [cw, chh] = f.cell;
  const [sx, sy] = f.stroke;
  if (ch === "▏") return [[0, 0, 1, chh]];
  if (ch === "▕") return [[cw - 1, 0, cw, chh]];
  const arms = ARMS[ch];
  const out = [];
  const l = arms.includes("l") ? 0 : sx;
  const r = arms.includes("r") ? cw : sx + 1;
  const u = arms.includes("u") ? 0 : sy;
  const d = arms.includes("d") ? chh : sy + 1;
  out.push([l, sy, r, sy + 1]);
  if (u < sy || d > sy + 1) out.push([sx, u, sx + 1, d]);
  return out;
}
