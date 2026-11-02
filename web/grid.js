// The cell grid: one glyph, a foreground role and a background role per cell, plus the panels
// (surfaces), controls (targets) and motions laid on it. Roles are token names from
// spec/tokens.json; the renderer resolves them, so a grid knows no colours.

/** The ellipsis that ends clipped text; every face draws it. */
export const ELLIPSIS = "…";

/** `s` cut to `width` columns, its last column an ellipsis when anything was cut. */
export function clip(s, width) {
  const chars = [...s];
  if (chars.length <= width) return s;
  if (width <= 0) return "";
  return chars.slice(0, width - 1).join("") + ELLIPSIS;
}

/** `s` broken into lines of at most `width` columns, at spaces where it can; `\n` breaks too. */
export function wrap(s, width) {
  const out = [];
  for (const para of String(s).split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      let w = word;
      while ([...w].length > width) {
        if (line) out.push(line);
        line = "";
        out.push([...w].slice(0, width).join(""));
        w = [...w].slice(width).join("");
      }
      if (!line) line = w;
      else if ([...line].length + 1 + [...w].length <= width) line += ` ${w}`;
      else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

/**
 * A line as runs of one role each: a string (all in `fg`) or `[[text, fg], ...]`.
 * @typedef {string | [string, string][]} Line
 */
const runsOf = (line, fg) => (typeof line === "string" ? [[line, fg]] : line);
const lengthOf = (runs) => runs.reduce((n, [t]) => n + [...t].length, 0);

/** Runs cut to `width` columns, ending in an ellipsis in the role of the run it cuts. */
export function clipRuns(runs, width) {
  if (lengthOf(runs) <= width) return runs;
  if (width <= 0) return [];
  const out = [];
  let left = width - 1;
  for (const [t, fg] of runs) {
    const chars = [...t];
    if (chars.length <= left) {
      out.push([t, fg]);
      left -= chars.length;
    } else {
      out.push([chars.slice(0, left).join("") + ELLIPSIS, fg]);
      break;
    }
  }
  return out;
}

export class Grid {
  /** @param {number} cols @param {number} rows */
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    /** @type {{ ch: string, fg: string, bg: string | null, halo: boolean }[]} */
    this.cells = Array.from({ length: cols * rows }, () => ({ ch: " ", fg: "accent", bg: null, halo: false }));
    /** Panels, in cells: the renderer fills them from stroke to stroke. */
    this.surfaces = [];
    /** Controls, in cells: the input layer lays a native button over each. */
    this.targets = [];
    /** Motions, in cells: `{ x, y, w, h, start, pattern }`, applied by the renderer at its `now`. */
    this.motions = [];
  }

  put(x, y, ch, fg, bg, halo = false) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    const cell = this.cells[y * this.cols + x];
    cell.ch = ch;
    cell.halo = halo;
    if (fg !== undefined) cell.fg = fg;
    if (bg !== undefined) cell.bg = bg;
  }

  text(x, y, s, fg, bg, halo) {
    [...s].forEach((ch, i) => {
      this.put(x + i, y, ch, fg, bg, halo);
    });
  }

  /** Text whose last character lands on column `right`. */
  textRight(right, y, s, fg, bg, halo) {
    this.text(right - [...s].length + 1, y, s, fg, bg, halo);
  }

  fill(x, y, w, h, ch, fg, bg) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.put(x + i, y + j, ch, fg, bg);
  }

  /**
   * One line of runs, clipped to `width` columns with an ellipsis. With `align: "right"`, `x` is
   * the right edge (the last column written). Returns the columns written.
   * @param {Line} line
   * @param {{ width?: number, align?: "left" | "right", fg?: string, bg?: string, halo?: boolean }} o
   */
  line(x, y, line, { width = this.cols, align = "left", fg = "accent", bg, halo } = {}) {
    const runs = clipRuns(runsOf(line, fg), width);
    const n = lengthOf(runs);
    let at = align === "right" ? x - n + 1 : x;
    for (const [t, role] of runs) {
      this.text(at, y, t, role, bg, halo);
      at += [...t].length;
    }
    return n;
  }

  /**
   * Lines from row `y` down, each clipped to `width` with an ellipsis, at most `maxLines` of them.
   * Returns the rows written.
   * @param {Line[]} lines
   * @param {{ width?: number, maxLines?: number, align?: "left" | "right", fg?: string, bg?: string, halo?: boolean }} o
   */
  block(x, y, lines, { maxLines = Number.POSITIVE_INFINITY, ...o } = {}) {
    const shown = lines.slice(0, maxLines);
    shown.forEach((l, j) => {
      this.line(x, y + j, l, o);
    });
    return shown.length;
  }

  /**
   * Starts a motion over a rect of cells: a pattern name from spec/motion.json ("flicker",
   * "type") or a pattern object. `start` is in the renderer's clock (performance.now()).
   */
  flicker(x, y, w, h, { start = globalThis.performance?.now() ?? 0, pattern = "flicker" } = {}) {
    this.motions.push({ x, y, w, h, start, pattern });
  }

  /** The grid as plain text, one line per row. */
  toString() {
    const lines = [];
    for (let y = 0; y < this.rows; y++)
      lines.push(
        this.cells
          .slice(y * this.cols, (y + 1) * this.cols)
          .map((c) => c.ch)
          .join(""),
      );
    return lines.join("\n");
  }
}
