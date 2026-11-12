// Drives the preview's component fixtures in headless Chrome (debugging port 9473, or CDP_PORT;
// HTTP_PORT for the server) and checks the keyboard: Tab order and Enter in the menu, the dialog's
// Tab trap, Escape and focus return, Arrow keys in a radiogroup and a tablist, a slider through
// its native range input, and the build window's scroll; and, per device row, the continuity of
// a box's left stroke for the icon buttons and the banded menu panel at DPR 1, 2, 3 and scale 1
// to 1.75. With an output directory it also saves a screenshot of each fixture at DPR 2 in
// jgs-vector at 1.25, and the icon buttons at 1, 1.25 and 1.75.
//
//   node scripts/components.mjs [out-dir]
import { writeFileSync } from "node:fs";
import { launch, sleep } from "./cdp.mjs";

const OUT = process.argv[2] ?? null;
const c = await launch({ http: Number(process.env.HTTP_PORT ?? 8797), port: Number(process.env.CDP_PORT ?? 9473) });
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
};
const READY = "document.fonts.status === 'loaded' && !!document.querySelector('#fixture-root .sa-stage')";
const active = () => c.ev("(() => { const a = document.activeElement; return a ? (a.dataset?.target ?? a.dataset?.slot ?? a.id ?? a.tagName) : null; })()");
const activeSlot = () => c.ev("document.activeElement?.parentElement?.dataset?.slot ?? null");
const open = async (fixture, extra = "", motion = "off") => {
  await c.load(`index.html?fixture=${fixture}&motion=${motion}${extra}`, { dpr: 2, ready: READY });
  await sleep(400);
};
const shoot = async (name, pad = 12) => {
  if (!OUT) return;
  const r = await c.ev(
    "(() => { const b = document.getElementById('fixtureBox').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()",
  );
  const png = await c.shot({ x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.w + 2 * pad, height: r.h + 2 * pad });
  const path = `${OUT}/${name}.png`;
  writeFileSync(path, Buffer.from(png, "base64"));
  console.log(`shot ${path}`);
};

/**
 * The left side of the box `el` (a JS expression) in device px: a shot of its first 30 CSS px,
 * every row's ink columns (coverage over half, between the row's leftmost pixel and the brightest
 * pixel of the shot) and ink sum. Rows where a horizontal arm runs right (ink two device px past
 * the side) are the corners and tees; every other row from the first to the last ink row must
 * have ink in exactly the side's columns and at least three quarters of the median ink. The
 * preview's world canvas is hidden first.
 */
const leftSide = async (elExpr, dpr) => {
  // The preview's world (grid lines, orbits) is hidden so its lines do not cross the side.
  await c.ev("document.getElementById('world').style.visibility = 'hidden'");
  await sleep(50);
  const r = await c.ev(`(() => { const b = ${elExpr}.getBoundingClientRect(); return { x: b.x, y: b.y, h: b.height }; })()`);
  const png = await c.shot({ x: r.x - 2, y: r.y - 2, width: 30, height: r.h + 4 });
  const rows = await c.ev(`(async () => {
    const img = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,${png}'; });
    const cv = new OffscreenCanvas(img.width, img.height); const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, img.width, img.height).data; const W = img.width;
    const lum = (xx, yy) => { const i = (yy * W + xx) * 4; return d[i] + d[i + 1] + d[i + 2]; };
    let fg = 0; for (let yy = 0; yy < img.height; yy++) for (let xx = 0; xx < W; xx++) fg = Math.max(fg, lum(xx, yy));
    const out = [];
    for (let yy = 0; yy < img.height; yy++) {
      const bg = lum(0, yy); let a0 = -1, a1 = -1, s = 0;
      for (let xx = 0; xx < Math.min(W, 12 * ${dpr}); xx++) {
        const a = (lum(xx, yy) - bg) / Math.max(1, fg - bg); s += Math.max(0, a);
        if (a > 0.5) { if (a0 < 0) a0 = xx; a1 = xx; }
      }
      out.push([a0, a1, s]);
    }
    return out;
  })()`);
  const ink = rows.map((r, y) => ({ y, a0: r[0], a1: r[1], s: r[2] })).filter((r) => r.a0 >= 0);
  if (!ink.length) return { ok: false, detail: "no ink" };
  const count = new Map();
  for (const r of ink) count.set(`${r.a0}-${r.a1}`, (count.get(`${r.a0}-${r.a1}`) ?? 0) + 1);
  const side = [...count].sort((a, b) => b[1] - a[1])[0][0];
  const [s0, s1] = side.split("-").map(Number);
  const first = ink[0].y;
  const last = ink[ink.length - 1].y;
  const body = [];
  for (let y = first; y <= last; y++) {
    const [a0, a1, s] = rows[y];
    if (a1 >= s1 + 2) continue; // a corner or tee's horizontal arm
    body.push({ y, a0, a1, s });
  }
  const sums = body.map((b) => b.s).sort((a, b) => a - b);
  const median = sums[sums.length >> 1];
  const bad = body.filter((b) => b.a0 < 0 || b.a0 !== s0 || b.a1 !== s1 || b.s < 0.75 * median);
  return {
    ok: bad.length === 0 && body.length > 0,
    detail: `${body.length} rows in columns ${side}${bad.length ? `; off: ${bad.map((b) => `${b.y}:${b.a0 < 0 ? "none" : `${b.a0}-${b.a1}`}(${b.s.toFixed(2)})`).join(" ")}` : ""}`,
  };
};

try {
  // Menu: Tab goes through the rows in order, the greyed row included; Enter activates.
  await open("menu");
  await shoot("menu-jgs-vector-1.25");
  await c.ev("document.querySelector('#fixture-root .sa-t').focus()");
  const order = [await active()];
  for (let i = 0; i < 7; i++) {
    await c.key("Tab");
    order.push(await active());
  }
  check(
    "menu: Tab order is reading order, the greyed row focusable",
    order.join(",") === "dock,scan,inventory,build,checklist,log,fullscreen,settings",
    order.join(","),
  );
  await c.key("Enter");
  const last = await c.ev("window.fx.last");
  check("menu: Enter activates the focused row", last === "settings", last);
  await c.ev("document.querySelector('[data-target=\"dock\"]').focus()");
  await c.key("Enter");
  check("menu: Enter on the greyed row reports its reason", (await c.ev("window.fx.last")) === "dock: NO PORT IN RANGE");
  await c.key("ArrowDown");
  check("menu: ArrowDown moves focus by position (nextTarget)", (await active()) === "scan");
  await c.key("ArrowUp");
  check("menu: ArrowUp moves back", (await active()) === "dock");
  const rowH = await c.ev("Math.round(document.querySelector('[data-target=\"scan\"]').getBoundingClientRect().height * 100) / 100");
  check("menu: a one-line row is 44 CSS px tall", rowH >= 44 && rowH < 45, `${rowH}`);
  const mirror = await c.ev("document.querySelector('#fixture-root .sa-text').textContent");
  check("menu: the text mirror holds no control text", !mirror.includes("SETTINGS"), JSON.stringify(mirror));

  // Dialog: opens as a modal; Tab stays inside; Escape closes and focus returns to the opener.
  await open("dialog");
  await shoot("dialog-jgs-vector-1.25");
  const first = await active();
  check("dialog: focus starts inside the dialog, on the title bar's close button (first in reading order)", first === "close", first);
  const seen = new Set();
  for (let i = 0; i < 14; i++) {
    await c.key("Tab");
    const inside = await c.ev("document.getElementById('fixtureBox').contains(document.activeElement)");
    if (!inside) seen.add("OUTSIDE");
    seen.add((await active()) ?? "null");
  }
  check("dialog: Tab stays inside (14 presses)", !seen.has("OUTSIDE"), [...seen].join(","));
  await c.key("Tab", { shift: true });
  check("dialog: Shift+Tab stays inside", await c.ev("document.getElementById('fixtureBox').contains(document.activeElement)"));
  check("dialog: the header is inert while open", await c.ev("document.querySelector('header').inert === true"));
  // Arrow keys in the radiogroup move and select.
  await c.ev("document.querySelector('[data-target=\"steer:turn\"]').focus()");
  await c.key("ArrowDown");
  check(
    "dialog: ArrowDown in the radiogroup selects the next radio",
    (await c.ev("window.fx.dialog.steering")) === "direct" && (await active()) === "steer:direct",
  );
  // The slider: focus its native range input and press ArrowRight twice.
  await c.ev("document.querySelector('[data-slot=\"sound\"] input').focus()");
  check("dialog: the slider's range input takes focus", (await activeSlot()) === "sound");
  const before = await c.ev("window.fx.dialog.sound");
  await c.key("ArrowRight");
  await c.key("ArrowRight");
  const after = await c.ev("window.fx.dialog.sound");
  const label = await c.ev("document.querySelector('#fixture-root .sa-text').textContent.match(/SOUND (\\d+)/)?.[1]");
  check(
    "dialog: ArrowRight on the slider raises the value and the drawn value follows",
    after === before + 2 && Number(label) === after,
    `${before} -> ${after}, drawn ${label}`,
  );
  const pre = await c.ev("window.fx.dialog.damping");
  await c.ev("document.querySelector('[data-target=\"damping\"]').focus()");
  await c.key(" ");
  check("dialog: Space toggles the checkbox row", (await c.ev("window.fx.dialog.damping")) === !pre);
  await c.key("Escape");
  check("dialog: Escape closes it", await c.ev("document.getElementById('fixtureBox').hidden === true"));
  check("dialog: focus returns to the opener", (await active()) === "open");
  check("dialog: the page is no longer inert", await c.ev("document.querySelector('header').inert === false"));
  await c.key("Enter");
  await sleep(100);
  check("dialog: Enter on the opener opens it again", await c.ev("document.getElementById('fixtureBox').hidden === false"));
  await c.ev("document.querySelector('[data-target=\"close\"]').focus()");
  await c.key("Enter");
  check("dialog: Enter on CLOSE closes it and returns focus", (await c.ev("document.getElementById('fixtureBox').hidden")) && (await active()) === "open");

  // The close button on the title bar: its button sits on the frame's top row, two columns ending
  // one column left of the right edge, and its hit area (box plus growth) overlaps no other target.
  const closeCheck = async (name) => {
    const r = await c.ev(`(() => {
      const root = document.getElementById('fixture-root').getBoundingClientRect();
      const hit = (b) => { const r = b.getBoundingClientRect(); const s = getComputedStyle(b); const g = (k) => parseFloat(s.getPropertyValue(k) || 0) / devicePixelRatio; return { id: b.dataset.target, x: r.x - g('--sa-gl'), y: r.y - g('--sa-gt'), w: r.width + g('--sa-gl') + g('--sa-gr'), h: r.height + g('--sa-gt') + g('--sa-gb'), top: r.y, bottom: r.bottom, right: r.right, cw: r.width }; };
      const all = [...document.querySelectorAll('#fixture-root [data-target]')].filter((b) => !b.closest('[data-scroll]')).map(hit);
      const c = all.find((h) => h.id === 'close');
      const over = all.filter((h) => h !== c && c.x < h.x + h.w - 0.01 && h.x < c.x + c.w - 0.01 && c.y < h.y + h.h - 0.01 && h.y < c.y + c.h - 0.01).map((h) => h.id);
      return { top: c.top - root.y, bottom: c.bottom - root.y, fromRight: root.right - c.right, cw: c.cw, w: c.w, h: c.h, over };
    })()`);
    check(
      `${name}: the close button is on the top row, right-aligned with one stroke column before the corner`,
      Math.abs(r.top) < 0.6 && r.bottom < 20 && Math.abs(r.fromRight - r.cw) < 0.6,
      JSON.stringify(r),
    );
    check(
      `${name}: the close button's hit area is 44 CSS px and overlaps no other target`,
      r.w >= 44 - 0.01 && r.h >= 44 - 0.01 && r.over.length === 0,
      JSON.stringify(r),
    );
  };
  await open("dialog");
  await closeCheck("dialog");

  // Window: the tablist moves with Left and Right; the body scrolls and the scrollbar follows.
  await open("window");
  await shoot("window-jgs-vector-1.25");
  await closeCheck("window");
  // The title bar: title left, status right, one stroke column between them and between the
  // status and the close button; the status is no target, so the close hit stays 44 px centred.
  const bar = await c.ev(`(() => {
    const root = document.querySelector('#fixture-root .sa-stage').getBoundingClientRect();
    const close = document.querySelector('#fixture-root [data-target="close"]');
    const cb = close.getBoundingClientRect();
    const s = getComputedStyle(close); const g = (k) => parseFloat(s.getPropertyValue(k) || 0) / devicePixelRatio;
    const hit = { x: cb.x - g('--sa-gl'), y: cb.y - g('--sa-gt'), w: cb.width + g('--sa-gl') + g('--sa-gr'), h: cb.height + g('--sa-gt') + g('--sa-gb') };
    const glyphs = [...document.querySelectorAll('#fixture-root .sa-stage .sa-g')].filter((e) => !e.closest('[data-scroll]')).map((e) => ({ ch: e.textContent, r: e.getBoundingClientRect() }))
      .filter((q) => Math.abs(q.r.y - root.y) < 2 && /[A-Z0-9…]/.test(q.ch)).sort((a, b) => a.r.x - b.r.x)
      .filter((q, i, a) => i === 0 || Math.abs(q.r.x - a[i - 1].r.x) > 0.5); // a halo repeats each glyph under it
    const cw = cb.width / 2;
    const words = []; for (const q of glyphs) { const w = words.at(-1); if (w && q.r.x - w.right < cw * 1.5) { w.text += q.ch; w.right = q.r.right; } else words.push({ text: q.ch, left: q.r.x, right: q.r.right }); }
    return { words, cw, close: { left: cb.x, right: cb.right, cx: cb.x + cb.width / 2, cy: cb.y + cb.height / 2 }, hit };
  })()`);
  {
    const [title, ...rest] = bar.words;
    const status = { text: rest.map((w) => w.text).join(" "), left: rest[0]?.left, right: rest.at(-1)?.right };
    check(
      "window: the title bar reads the tab's name on the left and DATA 0 on the right",
      title?.text === "SUPPLY" && status.text.replace(/ /g, "") === "DATA0", // a one-cell gap joins a word
      JSON.stringify(bar.words.map((w) => w.text)),
    );
    check(
      "window: title and status do not overlap; one stroke column between them and before the close button",
      title.right + bar.cw - 0.6 <= status.left && Math.abs(bar.close.left - status.right - bar.cw) < 0.6,
      JSON.stringify({ title: title.right, status: [status.left, status.right], close: bar.close.left, cw: bar.cw }),
    );
    const h = bar.hit;
    check(
      "window: the close hit rect is unchanged by the status (44 x 44, centred on the button)",
      Math.abs(h.w - 44) < 0.6 && Math.abs(h.h - 44) < 0.6 && Math.abs(h.x + h.w / 2 - bar.close.cx) < 0.6 && Math.abs(h.y + h.h / 2 - bar.close.cy) < 0.6,
      JSON.stringify(h),
    );
  }
  await c.ev("document.querySelector('[data-target=\"tabs:supply\"]').focus()");
  await c.key("ArrowRight");
  check(
    "window: ArrowRight in the tablist selects the next tab",
    (await c.ev("window.fx.window.tab")) === "materials" && (await active()) === "tabs:materials",
  );
  await c.key("ArrowLeft");
  await c.key("ArrowLeft");
  check("window: ArrowLeft moves back", (await c.ev("window.fx.window.tab")) === "structure");
  const thumbBefore = await c.ev("window.fx.window.scroll.top ?? 0");
  await c.ev(
    "(() => { const s = document.querySelector('[data-scroll=\"body\"]'); s.scrollTop = s.scrollHeight; s.dispatchEvent(new Event('scroll')); return true; })()",
  );
  await sleep(100);
  const sc = await c.ev("window.fx.window.scroll");
  check("window: scrolling the body reports its position", sc.top > thumbBefore && sc.height > sc.viewport, JSON.stringify(sc));
  await shoot("window-scrolled-jgs-vector-1.25");
  await c.ev("document.querySelector('[data-target=\"pad\"]').focus()");
  await c.key("Enter");
  check("window: Enter on a body row selects it", (await c.ev("window.fx.window.selected")) === "pad");

  // Icon buttons at three scales.
  for (const scale of ["1", "1.25", "1.75"]) {
    await open("icons", `&scale=${scale}&cols=64`);
    await shoot(`icons-jgs-vector-${scale}`);
  }
  // The hit area of a 44 px icon button is at least 44 CSS px either way.
  // The hit area of a 44 px icon button: its box plus the ::before growth, in CSS px.
  const ib = await c.ev(
    "(() => { const b = document.querySelector('[data-target=\"ib:rest\"]'); const r = b.getBoundingClientRect(); const s = getComputedStyle(b); const g = (k) => parseFloat(s.getPropertyValue(k)) / devicePixelRatio; return { w: r.width + g('--sa-gl') + g('--sa-gr'), h: r.height + g('--sa-gt') + g('--sa-gb') }; })()",
  );
  check("icons: a 44 px icon button's hit area is 44 CSS px or more", ib.w >= 44 - 0.01 && ib.h >= 44 - 0.01, JSON.stringify(ib));
  const fvs = await c.ev("getComputedStyle(document.querySelector('[data-target=\"ib:rest\"] .sa-icon')).fontVariationSettings");
  check("icons: the icon's axes are set per size", /wght/.test(fvs), fvs);
  const lgSize = await c.ev(
    "(() => { const b = document.querySelector('[data-target=\"lg:rest\"]').getBoundingClientRect(); const i = document.querySelector('[data-target=\"lg:rest\"] .sa-icon'); return { w: b.width, h: b.height, icon: parseFloat(getComputedStyle(i).fontSize) }; })()",
  );
  check(
    "icons: a large button is 5 x 3 cells at scale 1.75 (61.25 x 78.75 CSS px)",
    Math.abs(lgSize.w - 61.25) < 0.6 && Math.abs(lgSize.h - 78.75) < 0.6,
    JSON.stringify(lgSize),
  );
  const tabSel = await c.ev("document.querySelector('[data-target=\"lgtabs:supply\"]').getAttribute('aria-selected')");
  check("icons: the large tab bar marks its selected tab", tabSel === "true", tabSel);

  // Stroke continuity of a box's left side, per device row, at DPR 1, 2, 3 and scale 1 to 1.75:
  // the icon buttons (one band-free box per size) and the menu (a panel whose rows are bands).
  // The vector `│` ends in half-font-px round caps flush with its cell, so unjoined strokes
  // narrow at every cell joint; renderDOM draws the joints straight (web/dom.js, `joints`).
  for (const dpr of [1, 2, 3])
    for (const scale of ["1", "1.25", "1.5", "1.75"]) {
      await c.load(`index.html?fixture=icons&motion=off&scale=${scale}&cols=64`, { dpr, ready: READY });
      await sleep(300);
      for (const id of ["ib:rest", "step:rest", "bar:rest", "close:rest", "lg:rest", "lg:on", "lgtabs:supply", "lgtabs:power"]) {
        const s = await leftSide(`document.querySelector('[data-target="${id}"]')`, dpr);
        check(`continuity: ${id} left side, DPR ${dpr}, scale ${scale}`, s.ok, s.detail);
      }
      await c.load(`index.html?fixture=menu&motion=off&scale=${scale}`, { dpr, ready: READY });
      await sleep(300);
      const s = await leftSide("document.getElementById('fixture-root')", dpr);
      check(`continuity: banded menu panel left side, DPR ${dpr}, scale ${scale}`, s.ok, s.detail);
    }

  // The flicker cascade: row 0 lit before row 3 at the same moment.
  await open("menu", "", "flicker");
  await sleep(1500);
  const cascade = await c.ev(
    "(() => { const n = () => document.querySelectorAll('#fixture-root .sa-g').length; window.fx.flickerStart = null; const out = {}; for (const t of [50, 130, 300, 2000]) { window.frameAt(t); out[t] = n(); } return out; })()",
  );
  check(
    "motion: the flicker cascades down the menu (glyphs drawn at 50, 130, 300 and 2000 ms)",
    cascade[50] < cascade[130] && cascade[130] < cascade[300] && cascade[300] < cascade[2000],
    JSON.stringify(cascade),
  );
} finally {
  c.stop();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} of ${results.length} checks pass`);
process.exit(failed ? 1 : 0);
