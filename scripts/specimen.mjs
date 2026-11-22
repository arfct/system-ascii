// A specimen of the phonemic script's letters in jgs-extended (scripts/build-extended.py), drawn
// by renderDOM in landroid at scale 1.25 and DPR 2 in headless Chrome (debugging port 9475, or
// CDP_PORT; HTTP_PORT for the server), saved as a PNG. Also measures that a letter with a
// combining accent takes one cell: the advance of `ɛ` + U+0301 in the face, and where the
// accent's ink lands.
//
//   node scripts/specimen.mjs [out.png] [scale]
import { writeFileSync } from "node:fs";
import { launch, sleep } from "./cdp.mjs";

const OUT = process.argv[2] ?? "specimen.png";
const SCALE = process.argv[3] ?? "1.25";
const c = await launch({ http: Number(process.env.HTTP_PORT ?? 8799), port: Number(process.env.CDP_PORT ?? 9475) });
let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
};
try {
  await c.load(`scripts/specimen.html?scale=${SCALE}`, {
    dpr: 2,
    width: 1400,
    height: 1200,
    ready: "document.body.dataset.ready === '1' && document.fonts.status === 'loaded'",
  });
  await sleep(300);
  const s = await c.ev("window.specimen");
  check("every cell of the specimen is in the face", s.missing.length === 0, s.missing.join(" "));
  check(
    "a letter and its accent are one cell",
    s.cells["ɛ́"] === 1 && s.cells["ǽ"] === 1 && s.cells["à"] === 1 && s.cells["n̩"] === 1 && s.cells["sɛlfɛ́vɪdənt"] === 11,
    JSON.stringify(s.cells),
  );
  // The shaped advance: a base and a mark advance one cell (7 font px at 14 px per em), and the
  // mark's ink sits over the base, above the x-height (acute) or below the baseline (syllabic).
  const m = await c.ev(`(() => {
    const cv = new OffscreenCanvas(200, 200); const x = cv.getContext('2d');
    x.font = '140px jgs-extended'; x.textBaseline = 'alphabetic';
    const w = (t) => x.measureText(t).width;
    const ink = (t) => { x.clearRect(0, 0, 200, 200); x.fillStyle = '#fff'; x.fillText(t, 20, 140);
      const d = x.getImageData(0, 0, 200, 200).data; let x0 = 999, x1 = -1, y0 = 999, y1 = -1;
      for (let yy = 0; yy < 200; yy++) for (let xx = 0; xx < 200; xx++) if (d[(yy * 200 + xx) * 4 + 3] > 127) { x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, yy); y1 = Math.max(y1, yy); }
      return { x0: (x0 - 20) / 10, x1: (x1 + 1 - 20) / 10, top: (140 - y0) / 10, bottom: (140 - y1 - 1) / 10 }; };
    return { base: w('ɛ'), acute: w('ɛ\\u0301'), grave: w('ʊ\\u0300'), cap: w('Ɛ\\u0301'), below: w('n\\u0329'), pair: w('ɛ\\u0301v'),
      inkBase: ink('ɛ'), inkAcute: ink('ɛ\\u0301'), inkCap: ink('Ɛ\\u0301'), inkBelow: ink('n\\u0329'), inkAE: ink('æ\\u0301'), inkAEone: ink('\\u01fd') };
  })()`);
  check(
    "base + accent advances one cell (70 px at 140 px)",
    [m.base, m.acute, m.grave, m.cap, m.below].every((w) => Math.abs(w - 70) < 0.01) && Math.abs(m.pair - 140) < 0.01,
    JSON.stringify([m.base, m.acute, m.grave, m.cap, m.below, m.pair]),
  );
  check(
    "the acute sits over its letter, rows 3 to 5 (4 to 7 font px above the x-height's 5)",
    m.inkAcute.x0 >= 0 && m.inkAcute.x1 <= 7 && Math.abs(m.inkAcute.top - 9) < 0.2 && Math.abs(m.inkBase.top - 5) < 0.2,
    JSON.stringify(m.inkAcute),
  );
  check(
    "over a capital the accent is jgs's own for À: one font px above the cell (top at 13 font px)",
    Math.abs(m.inkCap.top - 13) < 0.2 && m.inkCap.x0 >= 0 && m.inkCap.x1 <= 7,
    JSON.stringify(m.inkCap),
  );
  check(
    "the syllabic mark sits under its letter, inside the cell (bottom at -3 font px)",
    Math.abs(m.inkBelow.bottom + 3) < 0.2 && m.inkBelow.x0 >= 0 && m.inkBelow.x1 <= 7,
    JSON.stringify(m.inkBelow),
  );
  check("æ + acute draws as ǽ does", JSON.stringify(m.inkAE) === JSON.stringify(m.inkAEone), JSON.stringify([m.inkAE, m.inkAEone]));
  const r = await c.ev(
    "(() => { const b = document.getElementById('specimen').getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; })()",
  );
  writeFileSync(OUT, Buffer.from(await c.shot(r), "base64"));
  console.log(`shot ${OUT} (${r.width} x ${r.height} CSS px at DPR 2, scale ${SCALE})`);
} finally {
  c.stop();
}
process.exit(failed ? 1 : 0);
