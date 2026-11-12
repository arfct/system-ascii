// Font loading shared by the renderers. Both cache things measured from the fonts (canvas: glyph
// masks; DOM: baseline offsets), so a render before the fonts load would cache wrong values.
// `ready()` awaits the fonts and then clears every renderer's cache.
import { faces } from "./spec.js";

const clearers = new Set();

/** Registers a cache to clear when `ready()` resolves. */
export function onFontsReady(fn) {
  clearers.add(fn);
}

/** `fallback` as `{ family, weight }`; a string is a family at the default weight. */
export function fallbackFont(fallback) {
  if (!fallback) return null;
  return typeof fallback === "string" ? { family: fallback, weight: "normal" } : { weight: "normal", ...fallback };
}

/**
 * Waits for a face (every face when omitted), the fallback font and the icon font, then drops
 * every renderer's cached glyph data. Call before the first render, and again after loading
 * another font.
 * @param {string} [face]
 * @param {{ fallback?: string | { family: string, weight?: string | number }, iconFont?: string }} [o]
 */
export async function ready(face, { fallback, iconFont } = {}) {
  const fonts = globalThis.document?.fonts;
  if (fonts) {
    const list = face ? [faces[face]] : Object.values(faces);
    const loads = list.map((f) => fonts.load(`${f.size}px ${f.file}`));
    // The DOM renderer draws the vector face through a metrics-overridden alias (fonts/fonts.css).
    if (list.some((f) => f.vector)) loads.push(fonts.load("14px jgs-vector-cell"));
    const fb = fallbackFont(fallback);
    if (fb) loads.push(fonts.load(`${fb.weight} 16px "${fb.family}"`));
    if (iconFont) loads.push(fonts.load(`24px "${iconFont}"`));
    await Promise.all(loads);
  }
  for (const fn of clearers) fn();
}
