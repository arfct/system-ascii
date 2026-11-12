import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dialog } from "../examples/dialog.js";
import { menu } from "../examples/menu.js";
import { buildWindow } from "../examples/window.js";
import { divider, dividerV, panel, STATUS_MIN, TITLE_MIN, titleBarFit } from "../web/components.js";
import { check, field, heading, iconButton, key, kv, note, row, segmented, slider, tabs, tabsSize, toolbar } from "../web/controls.js";
import { Grid } from "../web/grid.js";
import { iconAxes, iconBox, icons, strokeEm, strokeWidth } from "../web/icons.js";
import { domBox, domHitRects, fit, rowLayout } from "../web/layout.js";
import { nextInDirection, nextTarget } from "../web/nav.js";
import { canDraw, faces, glyphFor, tokens } from "../web/spec.js";
import { scrollRegion, tooltip, windowFrame } from "../web/window.js";
import { FIXTURES, snapshot, text, WIDTHS } from "./components-snapshot.mjs";

const all = (g) => [g, ...(g.scrolls ?? []).flatMap((s) => all(s.grid))];

describe("component fixtures", () => {
  it("match test/snapshots/components.txt at 27, 44 and 64 columns", () => {
    const want = readFileSync(new URL("./snapshots/components.txt", import.meta.url), "utf8");
    assert.equal(snapshot(), want);
  });

  for (const face of Object.keys(faces))
    it(`${face}: every glyph the fixtures emit can be drawn`, () => {
      const missing = new Set();
      for (const make of Object.values(FIXTURES))
        for (const cols of WIDTHS)
          for (const g of all(make(cols)))
            for (const c of g.cells) {
              const ch = glyphFor(face, c.ch);
              if (!canDraw(face, ch)) missing.add(ch);
            }
      assert.deepEqual([...missing], []);
    });

  for (const [name, make] of Object.entries(FIXTURES))
    for (const [face, scale, dpr] of [
      ["jgs-vector", 1.25, 2],
      ["jgs-vector", 1, 1],
      ["jgs7", 2, 1.5],
    ])
      it(`${name}: hit rects do not overlap (${face} × ${scale}, DPR ${dpr}, 44 px minimum)`, () => {
        for (const cols of WIDTHS)
          for (const g of all(make(cols))) {
            const rects = domHitRects(g, face, scale, { dpr, min: 44 });
            for (let i = 0; i < rects.length; i++)
              for (let j = i + 1; j < rects.length; j++) {
                const a = rects[i];
                const b = rects[j];
                const over = a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;
                assert.ok(!over, `${cols}: ${a.id} overlaps ${b.id}`);
              }
          }
      });

  it("every row target in the menu is at least 44 CSS px tall at jgs-vector × 1.25", () => {
    for (const r of domHitRects(menu(44), "jgs-vector", 1.25, { dpr: 2, min: 24 })) assert.ok(r.h >= 44 - 1e-9, `${r.id} ${r.h}`);
  });

  it("menu: icon rows with plain keys, a divider, a greyed row with its reason", () => {
    const g = menu(44);
    const lines = g.toString().split("\n");
    assert.match(lines[4], /^├─+┤$/);
    const dock = g.targets.find((t) => t.id === "dock");
    assert.equal(dock.disabled, true);
    assert.equal(dock.reason, "NO PORT IN RANGE");
    assert.equal(dock.h, 2);
    assert.match(lines[2], /NO PORT IN RANGE/);
    assert.match(lines[5], /INVENTORY +I │$/);
    assert.ok(g.targets.every((t) => t.role === "menuitem"));
    assert.equal(g.icons.length, 8);
  });

  it("dialog: a radiogroup, a checkbox, two slider slots, a stepper and Close", () => {
    const g = dialog(44);
    assert.deepEqual(g.groups[0].ids, ["steer:turn", "steer:direct"]);
    assert.equal(g.targets.find((t) => t.id === "steer:turn").aria.checked, "true");
    assert.equal(g.targets.find((t) => t.id === "damping").role, "checkbox");
    assert.deepEqual(
      g.slots.map((s) => [s.id, s.kind]),
      [
        ["sound", "range"],
        ["music", "range"],
      ],
    );
    assert.ok(g.targets.some((t) => t.id === "size:dec") && g.targets.some((t) => t.id === "size:inc"));
    const close = g.targets.find((t) => t.id === "close");
    assert.deepEqual([close.x, close.y, close.w, close.h], [44 - 4, 0, 2, 1]);
    assert.match(g.toString().split("\n")[0], /^┌─SETTINGS─+ {2}─┐$/);
  });

  it("panel: the close button sits on the top stroke, right-aligned as the title is left-aligned", () => {
    for (const titleStyle of ["halo", "chip", "plain"]) {
      const g = new Grid(20, 5);
      const p = panel(g, 0, 0, 20, 5, { title: "A VERY LONG TITLE HERE", titleStyle, close: { id: "x", label: "CLOSE" } });
      const top = g.toString().split("\n")[0];
      assert.equal(top.slice(-4), "  ─┐", titleStyle);
      assert.equal(top.slice(0, 2), "┌─");
      // The title is clipped to end one stroke column before the button.
      assert.equal(top.at(-5), "─", top);
      assert.deepEqual(p.close, { x: 16, y: 0, w: 2, h: 1 });
      const t = g.targets.find((q) => q.id === "x");
      assert.deepEqual([t.x, t.y, t.w, t.h, t.hit.w, t.hit.h], [16, 0, 2, 1, 44, 44]);
      assert.equal(g.icons.at(-1).name, "close");
      assert.equal(g.icons.at(-1).y, 0);
    }
  });

  it("windowFrame passes close through and returns its cells", () => {
    const g = new Grid(30, 8);
    const w = windowFrame(g, 0, 0, 30, 8, { title: "T", head: 1, close: { id: "c" } });
    assert.deepEqual(w.close, { x: 26, y: 0, w: 2, h: 1 });
  });

  it("panel: the status sits right-aligned on the top stroke, one stroke column before the close button", () => {
    for (const titleStyle of ["halo", "chip", "plain"]) {
      const g = new Grid(30, 4);
      const p = panel(g, 0, 0, 30, 4, { title: "STRUCTURE", status: "DATA 0", titleStyle, close: { id: "x" } });
      assert.equal(g.toString().split("\n")[0], "┌─STRUCTURE────────DATA 0─  ─┐", titleStyle);
      assert.deepEqual(p.status, { x: 19, y: 0, w: 6, h: 1 });
      assert.deepEqual(p.close, { x: 26, y: 0, w: 2, h: 1 });
      assert.equal(g.at(19, 0).halo, titleStyle === "halo");
      assert.equal(g.at(19, 0).bg, titleStyle === "chip" ? "panel" : null);
      // Display only: the close button is the only target.
      assert.deepEqual(
        g.targets.map((t) => [t.id, t.x, t.w, t.hit.w, t.hit.h]),
        [["x", 26, 2, 44, 44]],
      );
    }
    const g = new Grid(20, 3);
    panel(g, 0, 0, 20, 3, { title: "T", status: "OK" });
    assert.equal(g.toString().split("\n")[0], "┌─T─────────────OK─┐");
  });

  it("panel: status segments take their own tones, one blank column apart", () => {
    const g = new Grid(24, 3);
    panel(g, 0, 0, 24, 3, {
      status: [
        { text: "DATA", tone: "dim" },
        { text: "0", tone: "alert" },
      ],
    });
    assert.equal(g.toString().split("\n")[0], `┌${"─".repeat(15)}DATA 0─┐`);
    assert.deepEqual([g.at(16, 0).fg, g.at(20, 0).ch, g.at(21, 0).fg], ["dim", " ", "alert"]);
  });

  it("titleBarFit: the title is clipped first, down to TITLE_MIN, then the status", () => {
    assert.deepEqual(titleBarFit(9, 6, 30), { title: 9, status: 6 });
    assert.deepEqual(titleBarFit(9, 6, 16), { title: 9, status: 6 });
    assert.deepEqual(titleBarFit(9, 6, 14), { title: 7, status: 6 });
    assert.deepEqual(titleBarFit(9, 6, 11), { title: TITLE_MIN, status: 6 });
    assert.deepEqual(titleBarFit(9, 6, 9), { title: TITLE_MIN, status: 4 });
    assert.deepEqual(titleBarFit(9, 6, 7), { title: TITLE_MIN, status: STATUS_MIN });
    assert.deepEqual(titleBarFit(9, 6, 6), { title: 6, status: 0 });
    assert.deepEqual(titleBarFit(2, 6, 6), { title: 2, status: 3 });
    assert.deepEqual(titleBarFit(0, 6, 4), { title: 0, status: 4 });
    assert.deepEqual(titleBarFit(5, 0, 3), { title: 3, status: 0 });
    const rows = [30, 24, 20, 16, 14, 12, 10].map((w) => {
      const g = new Grid(w, 2);
      panel(g, 0, 0, w, 2, { title: "STRUCTURE", status: "DATA 0", close: { id: "c" } });
      return g.toString().split("\n")[0];
    });
    assert.deepEqual(rows, [
      "┌─STRUCTURE────────DATA 0─  ─┐",
      "┌─STRUCTURE──DATA 0─  ─┐",
      "┌─STRUC…─DATA 0─  ─┐",
      "┌─STR…─DAT…─  ─┐",
      "┌─STR…─D…─  ─┐",
      "┌─STRU…─  ─┐",
      "┌─ST…─  ─┐",
    ]);
  });

  it("windowFrame passes status through and returns its cells", () => {
    const g = new Grid(30, 8);
    const w = windowFrame(g, 0, 0, 30, 8, { title: "T", status: "DATA 0", head: 1, close: { id: "c" } });
    assert.deepEqual(w.status, { x: 19, y: 0, w: 6, h: 1 });
    assert.deepEqual(w.close, { x: 26, y: 0, w: 2, h: 1 });
  });

  it("window fixture: the tab's name is the title and DATA 0 the status; the close hit is unchanged", () => {
    for (const cols of [27, 44, 64]) {
      const g = buildWindow(cols);
      const top = g.toString().split("\n")[0];
      assert.match(top, /^┌─SUPPLY─+DATA 0─ {2}─┐$/, top);
      const c = g.targets.find((t) => t.id === "close");
      assert.deepEqual([c.x, c.y, c.w, c.h, c.hit.w, c.hit.h], [cols - 4, 0, 2, 1, 44, 44]);
      const plain = new Grid(cols, g.rows);
      const ref = windowFrame(plain, 0, 0, cols, g.rows, { close: { id: "close" } });
      assert.deepEqual(ref.close, { x: c.x, y: c.y, w: c.w, h: c.h });
    }
  });

  it("close: its hit rect is at least 44 CSS px and overlaps no other target in the fixtures", () => {
    for (const g of [dialog(44), buildWindow(44), buildWindow(27), buildWindow(64)]) {
      const rects = domHitRects(g, "jgs-vector", 1.25, { dpr: 2, min: 24 });
      const c = rects.find((r) => r.id === "close");
      assert.ok(c.w >= 44 - 1e-9 && c.h >= 44 - 1e-9, JSON.stringify(c));
      for (const r of rects) if (r !== c) assert.ok(!(c.x < r.x + r.w && r.x < c.x + c.w && c.y < r.y + r.h && r.y < c.y + c.h), `close overlaps ${r.id}`);
    }
  });

  it("window: a radiogroup in the head, a scroll body of two-line rows with thumbnail slots, a tablist", () => {
    const g = buildWindow(44);
    assert.equal(g.groups.find((x) => x.id === "side").role, "radiogroup");
    assert.equal(g.groups.find((x) => x.id === "tabs").role, "tablist");
    assert.equal(g.groups.find((x) => x.id === "tabs").ids.length, 7);
    const body = g.scrolls[0].grid;
    assert.ok(body.targets.every((t) => t.h === 2));
    assert.equal(body.slots.length, body.targets.length);
    assert.equal(body.targets.find((t) => t.id === "drill").reason, "NOT LEARNED");
  });
});

describe("dividers", () => {
  it("a divider's ends sit on the frame's columns, at every width", () => {
    for (const w of [5, 27, 44, 64]) {
      const g = new Grid(w, 6);
      panel(g, 0, 0, w, 6);
      divider(g, 0, 2, w);
      assert.equal(g.at(0, 2).ch, "├");
      assert.equal(g.at(w - 1, 2).ch, "┤");
      assert.equal(g.at(0, 1).ch, "│");
      assert.equal(g.at(w - 1, 1).ch, "│");
      for (let x = 1; x < w - 1; x++) assert.equal(g.at(x, 2).ch, "─");
    }
  });

  it("windowFrame joins its head and foot dividers to the frame", () => {
    const g = new Grid(20, 10);
    const w = windowFrame(g, 0, 0, 20, 10, { head: 1, foot: 2 });
    const lines = g.toString().split("\n");
    assert.match(lines[2], /^├─+┤$/);
    assert.match(lines[6], /^├─+┤$/);
    assert.deepEqual([w.head.top, w.body.top, w.body.bottom, w.foot.top, w.foot.bottom], [1, 3, 5, 7, 8]);
  });

  it("dividerV meets a divider in ┼ and the frame in ┬ ┴", () => {
    const g = new Grid(12, 7);
    panel(g, 0, 0, 12, 7);
    divider(g, 0, 3, 12);
    dividerV(g, 5, 0, 7);
    assert.equal(g.at(5, 0).ch, "┬");
    assert.equal(g.at(5, 3).ch, "┼");
    assert.equal(g.at(5, 6).ch, "┴");
  });
});

describe("controls", () => {
  it("row: states draw the bar, the hover fill, the ghost and the reason line", () => {
    const g = new Grid(30, 8);
    row(g, 0, 0, 30, { id: "a", label: "ALPHA", icon: "add", key: "A" });
    row(g, 0, 1, 30, { id: "b", label: "BETA", value: "ON", on: true, role: "menuitemradio" });
    row(g, 0, 2, 30, { id: "c", label: "GAMMA", state: "hover" });
    const h = row(g, 0, 3, 30, { id: "d", label: "DELTA", disabled: true, reason: "LOCKED" });
    row(g, 0, 5, 30, { id: "e", label: "EPSILON", indent: 2, line2: "SECOND LINE" });
    const t = (id) => g.targets.find((x) => x.id === id);
    assert.equal(h, 2);
    assert.equal(g.at(0, 1).ch, "▌");
    assert.equal(g.at(0, 1).fg, "selected");
    assert.equal(t("b").aria.checked, "true");
    assert.equal(g.at(5, 2).bg, "hover");
    assert.equal(g.at(1, 3).fg, "ghostText");
    assert.equal(t("d").reason, "LOCKED");
    assert.match(g.toString().split("\n")[4], /LOCKED/);
    assert.match(g.toString().split("\n")[0], /ALPHA +A $/);
    assert.match(g.toString().split("\n")[1], /BETA +ON $/);
    assert.equal(g.toString().split("\n")[5].indexOf("EPSILON"), 3);
    assert.equal(g.toString().split("\n")[6].indexOf("SECOND LINE"), 3);
    assert.deepEqual(
      g.bands.map((b) => [b.y, b.h, b.min]),
      [
        [0, 1, 44],
        [1, 1, 44],
        [2, 1, 44],
        [3, 2, 44],
        [5, 2, 44],
      ],
    );
  });

  it("key, check, kv, heading, note", () => {
    const g = new Grid(24, 6);
    assert.equal(key(g, 0, 0, "F10"), 3);
    check(g, 6, 0, { on: true });
    check(g, 7, 0, { on: false });
    check(g, 8, 0, { on: true, kind: "checkbox" });
    check(g, 9, 0, { kind: "checkbox" });
    kv(g, 0, 1, 24, "MASS", "4.75e+11");
    heading(g, 0, 2, 24, "SOUND");
    assert.equal(note(g, 0, 3, 12, "A NOTE THAT WRAPS TO LINES"), 3);
    const lines = g.toString().split("\n");
    assert.equal(lines[0].slice(0, 10), "F10   ●○■□");
    assert.match(lines[1], /^MASS +4\.75e\+11$/);
    assert.equal(lines[2].trim(), "SOUND");
  });

  it("field: underline and frame, with a text slot and the state's line", () => {
    const g = new Grid(20, 6);
    const u = field(g, 0, 0, 20, { id: "name", label: "NAME" });
    const f = field(g, 0, 2, 20, { id: "seed", style: "frame", state: "error" });
    assert.deepEqual([u.rows, u.slot.x, u.slot.w, u.slot.kind], [2, 5, 15, "text"]);
    assert.deepEqual([f.rows, f.slot.x, f.slot.y, f.slot.w], [3, 2, 3, 16]);
    assert.equal(g.at(0, 2).ch, "┌");
    assert.equal(g.at(0, 2).fg, "error");
    assert.equal(g.at(5, 1).ch, "─");
  });

  it("segmented and tabs: groups of radio and tab targets, the selected one marked", () => {
    const g = new Grid(40, 3);
    segmented(g, 0, 0, { id: "side", options: ["BASE", "SHIP"], selected: "SHIP" });
    tabs(g, 0, 2, 40, {
      id: "t",
      items: [
        { id: "a", label: "A", icon: "bolt" },
        { id: "b", label: "B", icon: "memory" },
      ],
      selected: "a",
    });
    assert.equal(g.toString().split("\n")[0].slice(0, 12), " BASE  SHIP ");
    assert.equal(g.at(7, 0).bg, "accent");
    assert.equal(g.at(7, 0).fg, "ink");
    assert.deepEqual(
      g.groups.map((x) => [x.role, x.ids]),
      [
        ["radiogroup", ["side:BASE", "side:SHIP"]],
        ["tablist", ["t:a", "t:b"]],
      ],
    );
    assert.equal(g.targets.find((t) => t.id === "t:a").aria.selected, "true");
  });

  it("slider: a lit meter and a range slot over it", () => {
    const g = new Grid(10, 1);
    slider(g, 0, 0, 10, { id: "v", value: 30 });
    assert.equal(g.toString(), "▌▌▌▌▌▌▌▌▌▌");
    assert.equal(g.at(2, 0).fg, "accent");
    assert.equal(g.at(3, 0).fg, "accentOff");
    assert.deepEqual(g.slots[0], { id: "v", x: 0, y: 0, w: 10, h: 1, kind: "range", box: true });
  });

  it("toolbar: icon buttons with a 44 px hit, right-aligned", () => {
    const g = new Grid(20, 1);
    toolbar(
      g,
      19,
      0,
      [
        { id: "a", icon: "add", label: "ADD" },
        { id: "b", icon: "close", label: "CLOSE", disabled: true, reason: "NO" },
      ],
      { align: "right" },
    );
    assert.deepEqual(
      g.targets.map((t) => [t.id, t.x, t.w, t.hit.w]),
      [
        ["a", 10, 4, 44],
        ["b", 16, 4, 44],
      ],
    );
  });

  it("scrollRegion: the thumb follows scrollTop; the body is kept for the renderer", () => {
    const g = new Grid(10, 6);
    const body = new Grid(9, 24);
    scrollRegion(g, 0, 0, 10, 6, body, { id: "s", scroll: { top: 0 } });
    assert.equal(g.at(9, 0).bg, "accent");
    assert.equal(g.at(9, 5).ch, "│");
    const h = new Grid(10, 6);
    const r = scrollRegion(h, 0, 0, 10, 6, body, { id: "s", scroll: { top: 18 } });
    assert.deepEqual(r.thumb, { y: 4, h: 2 });
    assert.equal(h.scrolls[0].w, 9);
    const fits = scrollRegion(new Grid(10, 6), 0, 0, 10, 6, new Grid(9, 4), { id: "s" });
    assert.equal(fits.thumb, null);
  });

  it("tooltip returns its own framed grid", () => {
    const t = tooltip("DOCKING NEEDS A PORT IN RANGE", 16);
    assert.equal(t.cols, 16);
    assert.match(t.toString().split("\n")[0], /^┌─+┐$/);
    assert.ok(t.surfaces.length === 1);
  });
});

describe("icon buttons", () => {
  it("are a framed box around one icon, the whole box the target, with a 44 px hit", () => {
    const g = new Grid(10, 4);
    const b = iconButton(g, 0, 0, { id: "x", icon: "settings", label: "SETTINGS" });
    assert.deepEqual(b, { cols: 6, rows: 3 });
    assert.equal(g.toString().split("\n")[0], "┌────┐    ");
    assert.equal(g.icons[0].name, "settings");
    assert.equal(g.icons[0].px, 22);
    const t = g.targets[0];
    assert.deepEqual([t.w, t.h, t.hit.w, t.hit.h, t.label], [6, 3, 44, 44, "SETTINGS"]);
    const r = domHitRects(g, "jgs-vector", 1.25, { dpr: 2, min: 24 })[0];
    assert.ok(r.w >= 44 && r.h >= 44);
  });

  it("on fills the icon in the selected role; pressed fills the box; disabled with a reason stays a target", () => {
    const g = new Grid(30, 4);
    iconButton(g, 0, 0, { id: "a", icon: "build", label: "BUILD", on: true });
    iconButton(g, 8, 0, { id: "b", icon: "build", label: "BUILD", pressed: true });
    iconButton(g, 16, 0, { id: "c", icon: "build", label: "BUILD", disabled: true, reason: "NOT HERE" });
    assert.equal(g.icons[0].fill, true);
    assert.equal(g.icons[0].fg, "selected");
    assert.equal(g.at(9, 1).bg, "accentOff");
    assert.equal(g.at(16, 0).fg, "ghostText");
    assert.equal(g.targets[2].reason, "NOT HERE");
  });

  it("pick the cell counts nearest exo-space's sizes at each scale", () => {
    const table = {};
    for (const scale of [1, 1.25, 1.5, 1.75])
      table[scale] = Object.keys(icons.sizes).map((k) => (({ cols, rows }) => `${cols}x${rows}`)(iconBox(k, "jgs-vector", scale, faces)));
    // ib, close, step, bar, lg, row
    assert.deepEqual(table[1.25], ["6x3", "6x3", "5x3", "7x4", "6x3", "2x1"]);
    for (const scale of Object.keys(table)) {
      const b = iconBox("ib", "jgs-vector", Number(scale), faces);
      const [cw, ch] = faces["jgs-vector"].cell;
      const nearest = (px, cell) => [1, 2, 3, 4, 5, 6, 7, 8].reduce((best, n) => (Math.abs(n * cell - px) < Math.abs(best * cell - px) ? n : best), 1);
      assert.equal(b.cols - 1, nearest(44, cw * Number(scale)), `cols at ${scale}`);
      assert.equal(b.rows - 1, nearest(44, ch * Number(scale)), `rows at ${scale}`);
    }
  });
});

describe("large icon buttons (lg)", () => {
  it("reserve the cells exo-space's toolbar button draws: 56 px less half a cell, nearest whole cells", () => {
    const got = Object.fromEntries(
      [1, 1.25, 1.5, 1.75].map((s) => [s, (({ cols, rows, icon }) => `${cols}x${rows} ${icon}`)(iconBox("lg", "jgs-vector", s, faces))]),
    );
    assert.deepEqual(got, { 1: "8x4 35.25", 1.25: "6x3 31.5", 1.5: "5x3 30.25", 1.75: "5x3 35.25" });
    // The same as exo-space's "fit" rule for a 56 px side.
    for (const s of [1, 1.25, 1.5, 1.75]) {
      const side = 56 - 0.5 * 15 * s;
      const fit = iconBox({ box: side, icon: side * 0.72 }, "jgs-vector", s, faces);
      const lg = iconBox("lg", "jgs-vector", s, faces);
      assert.deepEqual([lg.cols, lg.rows, lg.icon], [fit.cols, fit.rows, fit.icon], `scale ${s}`);
    }
  });

  it("toolbar and tabs take a size; sized tabs wrap and keep the tablist", () => {
    const g = new Grid(40, 10);
    const n = toolbar(
      g,
      0,
      0,
      [
        { id: "a", icon: "build", label: "A" },
        { id: "b", icon: "add", label: "B", on: true },
      ],
      { size: "lg" },
    );
    assert.equal(n, 6 + 1 + 6);
    assert.equal(g.toString().split("\n")[0].slice(0, 13), "┌────┐ ┌────┐");
    const h = new Grid(20, 10);
    const r = tabs(h, 0, 0, 20, { id: "t", items: ["a", "b", "c", "d"].map((id) => ({ id, icon: "add", label: id })), selected: "c", size: "lg" });
    assert.deepEqual(r, { cols: 20, rows: 6 });
    assert.deepEqual(tabsSize(4, 20, { size: "lg" }).perRow, 3);
    const sel = h.targets.find((t) => t.id === "t:c");
    assert.equal(sel.role, "tab");
    assert.equal(sel.aria.selected, "true");
    assert.equal(sel.on, true);
    assert.deepEqual([sel.x, sel.y], [14, 0]);
    assert.deepEqual([h.targets.find((t) => t.id === "t:d").x, h.targets.find((t) => t.id === "t:d").y], [0, 3]);
    assert.deepEqual(h.groups[0].ids, ["t:a", "t:b", "t:c", "t:d"]);
    assert.ok(h.icons.find((i) => i.y === 0 && i.x === 14).fill);
  });
});

describe("icon weights (spec/icons.json)", () => {
  it("the measured table is ascending in wght at every opsz and grade", () => {
    for (const byOpsz of icons.stroke.em) for (const ws of byOpsz) for (let i = 1; i < ws.length; i++) assert.ok(ws[i] > ws[i - 1]);
  });

  it("the weight for every icon size in use, at scales 1 to 1.75 and DPR 1 to 3, is inside 100..700 and matches the face's stroke", () => {
    for (const scale of [1, 1.25, 1.5, 1.75])
      for (const dpr of [1, 1.5, 2, 3])
        for (const [name, s] of Object.entries(icons.sizes)) {
          const b = iconBox(name, "jgs-vector", scale, faces);
          const sizeDev = Math.round(b.icon * dpr);
          const strokeDev = strokeWidth("jgs-vector") * scale * dpr;
          const a = iconAxes(sizeDev, strokeDev, dpr);
          assert.ok(a.wght >= 100 && a.wght <= 700, `${name} ${scale} ${dpr}: ${a.wght}`);
          assert.ok(a.opsz >= 20 && a.opsz <= 48);
          assert.ok(a.grad >= -50 && a.grad <= 200);
          const got = strokeEm(a.wght, a.grad, a.opsz) * sizeDev;
          assert.ok(Math.abs(got - strokeDev) < 0.05 * strokeDev, `${name} ${s.icon} ${scale} ${dpr}: ${got} vs ${strokeDev}`);
        }
  });

  it("opsz is the icon's CSS px clamped to 20..48, and FILL follows on", () => {
    assert.equal(iconAxes(32, 2, 2).opsz, 20);
    assert.equal(iconAxes(88, 4, 2).opsz, 44);
    assert.equal(iconAxes(200, 4, 2).opsz, 48);
    assert.match(iconAxes(44, 2.5, 2, { fill: true }).css, /^"FILL" 1, "wght" \d+, "GRAD" -?\d+, "opsz" 22$/);
  });
});

describe("layout: bands, hit rects, fit", () => {
  it("a band adds height split above and below; rows without bands land where gridBox puts them", () => {
    const g = new Grid(10, 4);
    g.band(1, 1, 44);
    const k = 2 * 1.25;
    const r = rowLayout(g, 15, k, 2);
    const natural = Math.round(2 * 15 * k) - Math.round(15 * k);
    assert.equal(r.extra, 88 - natural);
    assert.equal(r.top(0), 0);
    assert.equal(r.glyph(1) - r.top(1), Math.floor((88 - natural) / 2));
    assert.equal(r.bottom(1) - r.top(1), 88);
    assert.equal(r.glyph(2), Math.round(2 * 15 * k) + r.extra);
    assert.equal(domBox(g, "jgs-vector", 1.25, 2).cssHeight * 2 >= Math.round(4 * 15 * k) + r.extra, true);
  });

  it("fit gives the whole cells that fit a size", () => {
    assert.deepEqual(fit("jgs-vector", 1.25, { width: 385, height: 300 }, { dpr: 2 }), { cols: 44, rows: 16 });
    assert.deepEqual(fit("jgs7", 2, 100, { dpr: 1 }), { cols: 7, rows: 3 });
  });
});

describe("nextTarget", () => {
  const g = new Grid(30, 10);
  // A row of three buttons over a column of two rows, and one far right.
  for (const [id, x, y, w] of [
    ["a", 0, 0, 6],
    ["b", 8, 0, 6],
    ["c", 16, 0, 6],
    ["d", 0, 3, 20],
    ["e", 0, 5, 20],
    ["f", 24, 8, 4],
  ])
    g.targets.push({ id, label: id, x, y, w, h: 1 });

  it("moves along a row and stays at an edge", () => {
    assert.equal(nextTarget(g, "a", 1, 0), "b");
    assert.equal(nextTarget(g, "b", 1, 0), "c");
    assert.equal(nextTarget(g, "a", -1, 0), "a");
  });
  it("moves down to the nearest below, preferring those in the same column band", () => {
    assert.equal(nextTarget(g, "b", 0, 1), "d");
    assert.equal(nextTarget(g, "d", 0, 1), "e");
    assert.equal(nextTarget(g, "e", 0, 1), "f");
    assert.equal(nextTarget(g, "e", 0, -1), "d");
    assert.equal(nextTarget(g, "d", 0, -1), "b");
  });
  it("starts at the first target with nothing focused, and returns null with none", () => {
    assert.equal(nextTarget(g, null, 0, 1), "a");
    assert.equal(nextTarget(new Grid(4, 4), null, 0, 1), null);
  });
  it("leaves out disabled targets without a reason, keeps those with one", () => {
    const h = new Grid(10, 6);
    h.targets.push(
      { id: "x", x: 0, y: 0, w: 4, h: 1 },
      { id: "y", x: 0, y: 2, w: 4, h: 1, disabled: true },
      { id: "z", x: 0, y: 4, w: 4, h: 1, disabled: true, reason: "R" },
    );
    assert.equal(nextTarget(h, "x", 0, 1), "z");
  });
  it("reaches into a scroll body, placed by its scroll", () => {
    const w = buildWindow(44);
    assert.equal(nextTarget(w, "side:ship", 0, 1), "cockpit");
    assert.equal(nextTarget(w, "cockpit", 0, 1), "cargo");
  });
  it("nextInDirection matches exo-space's padnav cases", () => {
    const rects = [
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 20, y: 0, w: 10, h: 10 },
      { x: 0, y: 20, w: 10, h: 10 },
      { x: 40, y: 22, w: 10, h: 10 },
    ];
    assert.equal(nextInDirection(rects, 0, 1, 0), 1);
    assert.equal(nextInDirection(rects, 0, 0, 1), 2);
    assert.equal(nextInDirection(rects, 2, 1, 0), 3);
    assert.equal(nextInDirection(rects, -1, 1, 0), 0);
    assert.equal(nextInDirection([], 0, 1, 0), -1);
  });
});

describe("state roles", () => {
  it("focus, hover, selected and error map to colours already in each theme", () => {
    for (const [name, t] of Object.entries(tokens)) {
      if (typeof t !== "object" || !t.accent) continue;
      const base = new Set(
        Object.entries(t)
          .filter(([k]) => !["focus", "hover", "selected", "error", "label"].includes(k))
          .map(([, v]) => String(v).toLowerCase()),
      );
      for (const role of ["focus", "hover", "selected", "error"])
        assert.ok(base.has(String(t[role]).toLowerCase()), `${name}.${role} ${t[role]} is a new colour`);
    }
  });
});
