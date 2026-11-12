// Pixel parity and stroke continuity for the two renderers, in headless Chrome over CDP.
//
//   node scripts/parity.mjs [outDir]
//
// 1. Bitmap faces (jgs7, jgs5, jgs9): examples/hud.js drawn by the canvas renderer (the pixel
//    reference) and by renderDOM at DPR 1, 1.5, 2, 3 and scale 1, 2; prints the device pixels
//    that differ (any channel sum over 24). Expected: 0 everywhere.
// 2. The vector face (jgs-vector): the review's continuity fixture (a 12 × 5 frame with a tee row)
//    drawn by renderDOM at DPR 1, 1.25, 1.5, 2, 2.625, 3 and scale 1, 1.25, 1.5, 1.75, 2; per
//    device row of the frame's left vertical stroke, the ink summed across the stroke. Counts rows
//    with no ink (a break; expected 0) and rows under half the mean ink (a thin joint, reported).
//    The DOM path only: the canvas renderer is deprecated and is the reference for bitmap faces only.
//
// Serves the repo with `python3 -m http.server` on port 8794 and drives Chrome on debugging port
// 9471; both are stopped at the end. Exits 1 if a bitmap combination differs or the DOM vector
// stroke breaks.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HTTP = 8794;
const PORT = 9471;
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = process.argv[2] || null;
if (OUT) mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn("python3", ["-m", "http.server", String(HTTP), "--bind", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${mkdtempSync(join(process.env.TMPDIR || tmpdir(), "parity-"))}`,
    "--no-first-run",
    "--hide-scrollbars",
    "--force-color-profile=srgb",
    "--window-size=3200,1600",
  ],
  { stdio: "ignore" },
);
const stop = () => {
  chrome.kill();
  server.kill();
};
process.on("exit", stop);

let page;
for (let i = 0; i < 100 && !page; i++) {
  try {
    page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === "page");
  } catch {}
  if (!page) await sleep(200);
}
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${HTTP}/scripts/parity.html`)).ok) break;
  } catch {}
  await sleep(100);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let seq = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const id = ++seq;
    pending.set(id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
const ev = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};

async function load(dpr, query) {
  await send("Emulation.setDeviceMetricsOverride", { width: 3200, height: 1600, deviceScaleFactor: dpr, mobile: false });
  await send("Page.navigate", { url: `http://127.0.0.1:${HTTP}/scripts/parity.html?${query}` });
  let r = null;
  for (let i = 0; i < 100 && !r; i++) {
    await sleep(50);
    try {
      r = await ev("window.ready ?? null");
    } catch {}
  }
  if (!r) throw new Error(`page did not draw: ${query}`);
  await sleep(100);
  return r;
}
const shot = async (x, w, h) =>
  (await send("Page.captureScreenshot", { format: "png", clip: { x, y: 0, width: w, height: h, scale: 1 }, captureBeyondViewport: true })).result.data;

// In-page image helpers: decode two PNGs, count differing pixels; measure a stroke's ink per row.
const DECODE = `const ld=(s)=>new Promise((r)=>{const i=new Image();i.onload=()=>r(i);i.src='data:image/png;base64,'+s});
  const px=(img)=>{const c=new OffscreenCanvas(img.width,img.height);const x=c.getContext('2d');x.drawImage(img,0,0);return x.getImageData(0,0,img.width,img.height)};`;
const diff = (A, B) =>
  ev(`(async()=>{${DECODE}const [a,b]=await Promise.all([ld(${JSON.stringify(A)}),ld(${JSON.stringify(B)})]);
    const da=px(a),db=px(b);const w=Math.min(da.width,db.width),h=Math.min(da.height,db.height);let n=0,ink=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*da.width+x)*4,j=(y*db.width+x)*4;
      const d=Math.abs(da.data[i]-db.data[j])+Math.abs(da.data[i+1]-db.data[j+1])+Math.abs(da.data[i+2]-db.data[j+2]);if(d>24)n++;
      if(da.data[i]!==0x16||da.data[i+1]!==0x16||da.data[i+2]!==0x1d)ink++;}
    return {w,h,n,ink,sizeA:[da.width,da.height],sizeB:[db.width,db.height]};})()`);
// Rows of the left vertical stroke: cell rows 1 to 3 of the frame, device x from the stroke column
// minus one device px to the column after it plus one. Ink: the brightest channel over the world's.
const stroke = (A, k) =>
  ev(`(async()=>{${DECODE}const d=px(await ld(${JSON.stringify(A)}));const k=${k};const R=Math.round;
    const x0=Math.max(0,R(3*k)-1),x1=R(4*k)+1,y0=R(15*k),y1=R(60*k);const rows=[];
    for(let y=y0;y<y1;y++){let s=0;for(let x=x0;x<x1;x++){const i=(y*d.width+x)*4;s+=Math.max(0,d.data[i]-0x16,d.data[i+1]-0x16,d.data[i+2]-0x1d)}rows.push(s)}
    const mean=rows.reduce((a,b)=>a+b,0)/rows.length;
    return {rows:rows.length,zero:rows.filter((r)=>r===0).length,thin:rows.filter((r)=>r<mean/2).length};})()`);

let failed = false;
const parity = [];
for (const face of ["jgs7", "jgs5", "jgs9"])
  for (const dpr of [1, 1.5, 2, 3])
    for (const scale of [1, 2]) {
      const r = await load(dpr, `face=${face}&scale=${scale}&fixture=hud`);
      const A = await shot(0, r.cw, r.ch);
      const B = await shot(r.left, r.w, r.h);
      const d = await diff(A, B);
      const row = { face, dpr, scale, k: r.k, device: `${d.w}x${d.h}`, differing: d.n, ink: d.ink };
      if (d.n !== 0 || d.sizeA.join() !== d.sizeB.join()) failed = true;
      parity.push(row);
      if (OUT) {
        writeFileSync(join(OUT, `${face}-dpr${dpr}-s${scale}-canvas.png`), Buffer.from(A, "base64"));
        writeFileSync(join(OUT, `${face}-dpr${dpr}-s${scale}-dom.png`), Buffer.from(B, "base64"));
      }
    }

const continuity = [];
for (const dpr of [1, 1.25, 1.5, 2, 2.625, 3])
  for (const scale of [1, 1.25, 1.5, 1.75, 2]) {
    const r = await load(dpr, `face=jgs-vector&scale=${scale}&fixture=frame`);
    const A = await shot(r.left, r.w, r.h);
    const dom = await stroke(A, r.k);
    if (dom.zero > 0) failed = true;
    continuity.push({ dpr, scale, k: +r.k.toFixed(3), rows: dom.rows, domZero: dom.zero, domThin: dom.thin });
    if (OUT) writeFileSync(join(OUT, `vector-dpr${dpr}-s${scale}-dom.png`), Buffer.from(A, "base64"));
  }

console.log("Bitmap faces, examples/hud.js, canvas against renderDOM (device px that differ):\n");
console.log("| Face | DPR | Scale | k | Device px | Differing | Ink px |");
console.log("|---|---|---|---|---|---|---|");
for (const r of parity) console.log(`| ${r.face} | ${r.dpr} | ${r.scale} | ${r.k} | ${r.device} | ${r.differing} | ${r.ink} |`);
console.log("\njgs-vector, 12 × 5 frame with a tee row, left vertical stroke (device rows with no ink / under half the mean):\n");
console.log("| DPR | Scale | k | Rows | Zero | Thin |");
console.log("|---|---|---|---|---|---|");
for (const r of continuity) console.log(`| ${r.dpr} | ${r.scale} | ${r.k} | ${r.rows} | ${r.domZero} | ${r.domThin} |`);
const sum = (key) => continuity.filter((r) => r[key] > 0).length;
console.log(`\nCombinations with a break: ${sum("domZero")} of 30. With a thin joint: ${sum("domThin")} of 30.`);
if (OUT) writeFileSync(join(OUT, "parity.json"), JSON.stringify({ parity, continuity }, null, 1));
ws.close();
stop();
process.exit(failed ? 1 : 0);
