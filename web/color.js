// Roles to colours. A grid holds role names; the renderers resolve them here against a theme, so
// both renderers agree on every fallback and both refuse the same mistakes.
import { roles } from "./spec.js";

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC = /^(?:rgba?|hsla?)\(/i;

/** Whether `s` is a colour literal rather than a role name: hex, rgb(), hsl() or `transparent`. */
export function isColor(s) {
  return typeof s === "string" && (HEX.test(s) || FUNC.test(s) || s === "transparent");
}

/** A tone's dim shade: `${tone}Off` where the theme has one, `ghost` otherwise. */
export function off(theme, tone) {
  return theme[`${tone}Off`] ?? theme.ghost;
}

/**
 * The colour for a role, or null for "draw nothing" (no role, or `transparent`).
 * Order: the theme's own role, an alias from spec/roles.json, `${tone}Off` with no entry (the
 * theme's `ghost`), a colour literal. Anything else throws, so a misspelt role fails loudly
 * instead of drawing in whatever colour was set last.
 */
export function resolve(theme, role) {
  if (role === null || role === undefined || role === "") return null;
  let c = theme[role];
  if (c === undefined && roles.aliases[role]) c = theme[roles.aliases[role]];
  if (c === undefined && role.endsWith("Off") && theme[role.slice(0, -3)] !== undefined) c = off(theme, role.slice(0, -3));
  if (c === undefined && isColor(role)) c = role;
  if (c === undefined) throw new Error(`system-ascii: "${role}" is neither a role in the theme nor a colour`);
  return c === "transparent" ? null : c;
}

/**
 * `[r, g, b, a]` (0 to 255, alpha 0 to 1) for a hex or rgb() colour; other CSS colours go through
 * a canvas where there is one. Null for transparent.
 */
export function parseColor(c) {
  if (c === null || c === "transparent") return null;
  if (HEX.test(c)) {
    let h = c.slice(1);
    if (h.length <= 4) h = [...h].map((x) => x + x).join("");
    const n = [0, 2, 4, 6].map((i) => (i < h.length ? Number.parseInt(h.slice(i, i + 2), 16) : 255));
    return [n[0], n[1], n[2], n[3] / 255];
  }
  const m = /^rgba?\(([^)]+)\)$/i.exec(c);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean);
    const ch = (s) => (s.endsWith("%") ? Math.round(Number.parseFloat(s) * 2.55) : Number(s));
    const a = p[3] === undefined ? 1 : p[3].endsWith("%") ? Number.parseFloat(p[3]) / 100 : Number(p[3]);
    return [ch(p[0]), ch(p[1]), ch(p[2]), a];
  }
  if (globalThis.OffscreenCanvas) {
    const ctx = new OffscreenCanvas(1, 1).getContext("2d");
    ctx.fillStyle = c;
    if (ctx.fillStyle !== c) return parseColor(ctx.fillStyle);
  }
  throw new Error(`system-ascii: cannot parse colour "${c}"`);
}
