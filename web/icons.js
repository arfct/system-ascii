// Icon axes: Material Symbols is a variable font (wght 100 to 700, opsz 20 to 48, GRAD -50 to
// 200, FILL 0 to 1). spec/icons.json holds its measured stroke width (in em) over wght and GRAD
// at a few optical sizes, and the jgs faces' own stroke width (in font px); `iconAxes` picks the
// weight (then the grade, when the weight hits an end) whose stroke is as wide in device px as the
// face's stroke at the same scale, so an icon reads at the weight of the text beside it.
import icons from "../spec/icons.json" with { type: "json" };

export { icons };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

/** A face's stroke width in font px: 1 for the bitmap faces; the vector face's as measured. */
export function strokeWidth(face) {
  return icons.faceStroke[face] ?? 1;
}

/** Linear interpolation of `ys` over ascending `xs` at `x`, clamped to the ends. */
function interp(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return lerp(ys[i - 1], ys[i], (x - xs[i - 1]) / (xs[i] - xs[i - 1]));
  return ys.at(-1);
}

/** The inverse: the x where the ascending `ys` reach `y`, clamped to the ends. */
function invert(xs, ys, y) {
  if (y <= ys[0]) return xs[0];
  for (let i = 1; i < xs.length; i++) if (y <= ys[i]) return lerp(xs[i - 1], xs[i], (y - ys[i - 1]) / (ys[i] - ys[i - 1] || 1));
  return xs.at(-1);
}

/** The stroke in em at `opsz` for a weight and grade, from the measured table. */
export function strokeEm(wght, grad = 0, opsz = 24) {
  const s = icons.stroke;
  const at = (gi) => {
    const rows = s.em[gi];
    return interp(
      s.opsz,
      s.opsz.map((_, oi) => interp(s.wght, rows[oi], wght)),
      opsz,
    );
  };
  return interp(
    s.grad,
    s.grad.map((_, gi) => at(gi)),
    grad,
  );
}

/**
 * The axes for an icon `sizeDev` device px tall whose stroke should be `strokeDev` device px:
 * `{ wght, grad, opsz, fill, css }`, `css` being a `font-variation-settings` value. opsz is the
 * icon's CSS px size clamped to 20..48; wght is solved at GRAD 0 and clamped to 100..700, and GRAD
 * then takes up what the weight cannot (clamped to -50..200).
 */
export function iconAxes(sizeDev, strokeDev, dpr = 1, { fill = 0 } = {}) {
  const s = icons.stroke;
  const opsz = Math.round(clamp(sizeDev / dpr, 20, 48));
  const target = strokeDev / Math.max(1, sizeDev);
  const g0 = s.grad.indexOf(0);
  const byWght = s.wght.map((w) => strokeEm(w, 0, opsz));
  const wght = Math.round(clamp(invert(s.wght, byWght, target), 100, 700));
  let grad = 0;
  if (g0 >= 0) {
    const byGrad = s.grad.map((gr) => strokeEm(wght, gr, opsz));
    grad = Math.round(clamp(invert(s.grad, byGrad, target), -50, 200));
  }
  const f = fill ? 1 : 0;
  return { wght, grad, opsz, fill: f, css: `"FILL" ${f}, "wght" ${wght}, "GRAD" ${grad}, "opsz" ${opsz}` };
}

/**
 * An icon button's box in whole cells for a size in spec/icons.json (`ib`, `close`, `step`,
 * `bar`, `row`): the column and row counts whose drawn box (stroke to stroke when boxed) lands
 * nearest the size's CSS px at this face and scale, and the icon's CSS px, scaled from the size's
 * icon by the drawn box's width over the size. `{ cols, rows, boxW, boxH, icon, boxed }`.
 */
export function iconBox(size, face, scale, faces) {
  const s = typeof size === "string" ? icons.sizes[size] : size;
  const [cw, ch] = faces[face].cell;
  const w = cw * scale;
  const h = ch * scale;
  const boxed = s.boxed !== false;
  // Boxed: n cells give n - 1 cells stroke to stroke. Unboxed: n cells are the box.
  const pick = (px, cell) => {
    const n = Math.max(1, Math.round(px / cell));
    return boxed ? n + 1 : n;
  };
  const cols = Math.max(boxed ? 3 : 1, pick(s.box, w));
  const rows = Math.max(boxed ? 2 : 1, pick(s.box, h));
  const boxW = (boxed ? cols - 1 : cols) * w;
  const boxH = (boxed ? rows - 1 : rows) * h;
  // The icon scales with the box's width: columns are the finer step, so the width lands nearest.
  const icon = Math.round(s.icon * (boxW / s.box) * 4) / 4;
  return { cols, rows, boxW, boxH, icon, boxed };
}
