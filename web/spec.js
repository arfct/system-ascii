// The shared spec: face metrics and fixes, tokens, and each face's glyph data. Every platform
// reads these files; nothing here is web-only.
import faces from "../spec/faces.json" with { type: "json" };
import glyphs from "../spec/glyphs.json" with { type: "json" };
import themes from "../spec/tokens.json" with { type: "json" };

export { faces, glyphs, themes };

/** The glyph a face draws for `ch`, after its fixes. */
export function glyphFor(face, ch, fixes = true) {
  return (fixes ? faces[face].fixes[ch] : undefined) ?? ch;
}

/** Whether a face can draw `ch`: in its cmap, or synthesized by the renderer. */
export function canDraw(face, ch) {
  const f = faces[face];
  return ch === " " || glyphs[face].chars.includes(ch) || (f.synth ?? "").includes(ch);
}
