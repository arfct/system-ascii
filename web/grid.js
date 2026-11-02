// The cell grid: one glyph, a foreground role and a background role per cell, plus the panels
// (surfaces) and controls (targets) laid on it. Roles are token names from spec/tokens.json;
// the renderer resolves them, so a grid knows no colours.

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
