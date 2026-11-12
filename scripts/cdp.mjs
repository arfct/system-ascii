// A small Chrome DevTools Protocol driver for the headless checks: serves the repo with
// `python3 -m http.server`, starts headless Chrome on a debugging port, and kills both on exit.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Starts the server and Chrome; returns `{ send, ev, load, shot, key, stop, http }`.
 * @param {{ http?: number, port?: number }} [o]
 */
export async function launch({ http = 8795, port = 9473 } = {}) {
  const server = spawn("python3", ["-m", "http.server", String(http), "--bind", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${mkdtempSync(join(process.env.TMPDIR || tmpdir(), "cdp-"))}`,
      "--no-first-run",
      "--hide-scrollbars",
      "--force-color-profile=srgb",
      "--window-size=1600,1200",
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
      page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
    } catch {}
    if (!page) await sleep(200);
  }
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${http}/index.html`)).ok) break;
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
  /** Loads `path` at a DPR and waits until `ready` (a JS expression) is truthy. */
  const load = async (path, { dpr = 2, width = 1200, height = 900, ready = "document.readyState === 'complete'" } = {}) => {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile: false });
    await send("Page.navigate", { url: `http://127.0.0.1:${http}/${path}` });
    for (let i = 0; i < 200; i++) {
      await sleep(50);
      try {
        if (await ev(ready)) return;
      } catch {}
    }
    throw new Error(`page did not get ready: ${path}`);
  };
  /** A PNG (base64) of a CSS px rect of the page. */
  const shot = async ({ x, y, width, height }) =>
    (await send("Page.captureScreenshot", { format: "png", clip: { x, y, width, height, scale: 1 }, captureBeyondViewport: true })).result.data;
  /** A key press through the input pipeline (so default actions such as Tab and Enter run). */
  const key = async (k, { shift = false } = {}) => {
    const codes = { Tab: 9, Enter: 13, Escape: 27, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Home: 36, End: 35, " ": 32 };
    const base = { key: k, code: k === " " ? "Space" : k, windowsVirtualKeyCode: codes[k], modifiers: shift ? 8 : 0 };
    await send("Input.dispatchKeyEvent", { type: "keyDown", ...base, ...(k === "Enter" ? { text: "\r" } : k === " " ? { text: " " } : {}) });
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await sleep(30);
  };
  return { send, ev, load, shot, key, stop, http };
}
