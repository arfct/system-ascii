// Measures Material Symbols Sharp's stroke width over its wght, GRAD and opsz axes, and the jgs
// vector face's stroke, in headless Chrome, and writes the table into spec/icons.json.
//
//   node scripts/icon-weights.mjs            measure and write spec/icons.json
//   node scripts/icon-weights.mjs --check    measure and print, write nothing
//
// Each icon is drawn white on black at 192 px (DPR 1) with the axes set by font-variation-settings,
// and the stroke is read from coverage (the sum of a scanline's brightness over 255 is the ink
// width it crosses, antialiasing included):
//   add, remove: the vertical coverage through the horizontal bar, a quarter in from its end;
//   close: the horizontal coverage through both arms a quarter down, divided by 2 √2;
//   settings, build: 2 × area / perimeter (an estimate, printed for comparison, not fitted).
// The table holds add's stroke in em. The jgs-vector stroke is the coverage across `│` and the
// stem of `l` at 16 px per font px, in font px.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, ROOT, sleep } from "./cdp.mjs";

const CHECK = process.argv.includes("--check");
const SIZE = 192;
const OPSZ = [20, 24, 32, 40, 48];
const WGHT = [100, 200, 300, 400, 500, 600, 700];
const GRAD = [-50, 0, 200];
const ICONS = ["add", "remove", "close", "settings", "build"];
const cases = [];
for (const icon of ICONS) for (const grad of GRAD) for (const opsz of OPSZ) for (const wght of WGHT) cases.push({ icon, grad, opsz, wght });

const c = await launch({ http: 8796, port: 9473 });
try {
  await c.load("index.html?fixture=icons&motion=off", {
    dpr: 1,
    width: 1600,
    height: 1200,
    ready: "document.fonts.status === 'loaded' && !!document.querySelector('#fixture-root .sa-stage')",
  });
  await sleep(300);
  // One page per case set: a column of cells, each SIZE × SIZE, screenshotted one at a time.
  await c.ev(`(() => {
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;background:#000';
    const d = document.createElement('div');
    d.id = 'm';
    d.style.cssText = 'position:absolute;left:0;top:0;width:${SIZE}px;height:${SIZE}px;display:flex;align-items:center;justify-content:center;color:#fff;font:${SIZE}px "Material Symbols Sharp";line-height:1;-webkit-font-smoothing:antialiased';
    document.body.append(d);
    const j = document.createElement('div');
    j.id = 'j';
    j.style.cssText = 'position:absolute;left:0;top:${SIZE + 10}px;color:#fff;font:${14 * 16}px jgs-vector;line-height:1;white-space:pre';
    j.textContent = '│ l';
    document.body.append(j);
    return true;
  })()`);
  await c.ev(`document.fonts.load('${SIZE}px "Material Symbols Sharp"', 'add')`);
  const measure = (png, kind) =>
    c.ev(`(async () => {
      const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,${png}'; });
      const cv = new OffscreenCanvas(img.width, img.height); const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, img.width, img.height); const W = d.width, H = d.height;
      const a = (px, py) => d.data[(py * W + px) * 4] / 255;
      let x0 = W, x1 = -1, y0 = H, y1 = -1, area = 0, per = 0;
      for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) { const v = a(px, py); area += v; if (v > 0.5) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
        if (px + 1 < W && (a(px, py) > 0.5) !== (a(px + 1, py) > 0.5)) per++; if (py + 1 < H && (a(px, py) > 0.5) !== (a(px, py + 1) > 0.5)) per++; }
      const col = (px) => { let s = 0; for (let py = y0; py <= y1; py++) s += a(px, py); return s; };
      const row = (py) => { let s = 0; for (let px = x0; px <= x1; px++) s += a(px, py); return s; };
      const kind = '${kind}';
      if (kind === 'bar') return col(Math.round(x0 + (x1 - x0) * 0.25));
      if (kind === 'x') return row(Math.round(y0 + (y1 - y0) * 0.25)) / (2 * Math.SQRT2);
      if (kind === 'jgs') { const r = Math.round((y0 + y1) / 2); let s = 0, t = 0; for (let px = 0; px < W / 3; px++) s += a(px, r); for (let px = Math.round(W / 2); px < W; px++) t += a(px, r); return [s, t]; }
      return (2 * area) / Math.max(1, per);
    })()`);
  const out = [];
  for (const k of cases) {
    await c.ev(
      `(() => { const m = document.getElementById('m'); m.textContent = '${k.icon}'; m.style.fontVariationSettings = '"FILL" 0, "wght" ${k.wght}, "GRAD" ${k.grad}, "opsz" ${k.opsz}'; return true; })()`,
    );
    await sleep(5);
    const png = await c.shot({ x: 0, y: 0, width: SIZE, height: SIZE });
    const kind = k.icon === "add" || k.icon === "remove" ? "bar" : k.icon === "close" ? "x" : "area";
    out.push({ ...k, px: await measure(png, kind) });
  }
  const jpng = await c.shot({ x: 0, y: SIZE + 10, width: 14 * 16 * 2, height: 14 * 16 });
  const [bar, stem] = await measure(jpng, "jgs");
  const jgs = { bar: bar / 16, stem: stem / 16 };
  const em = (icon, grad, opsz, wght) => out.find((o) => o.icon === icon && o.grad === grad && o.opsz === opsz && o.wght === wght).px / SIZE;
  console.log(`jgs-vector stroke: │ ${jgs.bar.toFixed(3)} font px, l ${jgs.stem.toFixed(3)} font px`);
  for (const icon of ICONS) {
    console.log(`\n${icon}: stroke in em at GRAD 0 (rows opsz, columns wght ${WGHT.join(" ")})`);
    for (const opsz of OPSZ) console.log(`  opsz ${String(opsz).padStart(2)}: ${WGHT.map((w) => em(icon, 0, opsz, w).toFixed(4)).join(" ")}`);
  }
  console.log("\nadd at wght 400, opsz 24, by GRAD:", GRAD.map((g) => `${g}: ${em("add", g, 24, 400).toFixed(4)}`).join("  "));
  if (!CHECK) {
    const path = join(ROOT, "spec/icons.json");
    const spec = JSON.parse(readFileSync(path, "utf8"));
    const r4 = (v) => Math.round(v * 1e4) / 1e4;
    spec.faceStroke["jgs-vector"] = r4((jgs.bar + jgs.stem) / 2);
    spec.stroke = {
      note: `Stroke of "add" in em (the bar's coverage), measured by scripts/icon-weights.mjs in headless Chrome at ${SIZE} px; em[grad][opsz][wght].`,
      icon: "add",
      opsz: OPSZ,
      wght: WGHT,
      grad: GRAD,
      em: GRAD.map((g) => OPSZ.map((o) => WGHT.map((w) => r4(em("add", g, o, w))))),
      others: Object.fromEntries(["remove", "close", "settings", "build"].map((icon) => [icon, OPSZ.map((o) => WGHT.map((w) => r4(em(icon, 0, o, w))))])),
    };
    let s = JSON.stringify(spec, null, 2);
    // Keep the numeric rows on one line each.
    s = s.replace(/\[\s+(-?[\d.]+(?:,\s+-?[\d.]+)*)\s+\]/g, (_, xs) => `[${xs.split(/,\s+/).join(", ")}]`);
    writeFileSync(path, `${s}\n`);
    console.log(`\nwrote ${path}`);
  }
} finally {
  c.stop();
}
process.exit(0);
