import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dialog } from "../examples/dialog.js";
import { menu } from "../examples/menu.js";
import { buildWindow } from "../examples/window.js";
import { installDOM } from "./dom-stub.mjs";

const document = installDOM();
const { renderDOM } = await import("../web/dom.js");
const { themes } = await import("../web/spec.js");

const opts = (extra = {}) => ({ face: "jgs-vector", scale: 1.25, theme: themes.landroid, dpr: 2, minTarget: 44, reduceMotion: true, now: 0, ...extra });
const root = () => {
  const r = document.createElement("div");
  document.body.append(r);
  return r;
};
const byTarget = (r) => new Map(r.querySelectorAll(".sa-t").map((b) => [b.dataset.target, b]));

describe("renderDOM reconcile (DOM stub)", () => {
  it("keeps each target's element across redraws; new ids get one, removed ids lose theirs", () => {
    const r = root();
    renderDOM(r, menu(44), opts());
    const first = byTarget(r);
    assert.equal(first.size, 8);
    renderDOM(r, menu(44, { hover: "scan" }), opts());
    const second = byTarget(r);
    for (const [id, b] of first) assert.equal(second.get(id), b, id);
    renderDOM(r, menu(27, { keys: false }), opts());
    for (const [id, b] of byTarget(r)) assert.equal(first.get(id), b, id);
  });

  it("a disabled row with a reason is aria-disabled, focusable, titled with the reason", () => {
    const r = root();
    renderDOM(r, menu(44), opts());
    const dock = byTarget(r).get("dock");
    assert.equal(dock.getAttribute("aria-disabled"), "true");
    assert.equal(dock.disabled, false);
    assert.equal(dock.getAttribute("title"), "NO PORT IN RANGE");
    assert.equal(dock.getAttribute("role"), "menuitem");
  });

  it("onActivate gets the reason; onHover fires for mouse pointers only", () => {
    const r = root();
    const got = [];
    const hovers = [];
    const o = opts({ onActivate: (t, reason) => got.push([t.id, reason]), onHover: (id) => hovers.push(id) });
    renderDOM(r, menu(44), o);
    const m = byTarget(r);
    m.get("dock").click();
    m.get("scan").click();
    m.get("scan").dispatch("pointerenter", { pointerType: "touch" });
    m.get("scan").dispatch("pointerenter", { pointerType: "mouse" });
    m.get("scan").dispatch("pointerleave", { pointerType: "mouse" });
    assert.deepEqual(got, [
      ["dock", "NO PORT IN RANGE"],
      ["scan", null],
    ]);
    assert.deepEqual(hovers, ["scan", null]);
  });

  it("role, aria, attrs, className and data are applied and dropped when a later layout drops them", () => {
    const r = root();
    const g = menu(44);
    Object.assign(g.targets[1], { attrs: { "aria-keyshortcuts": "R" }, className: "extra", data: { kind: "act" } });
    renderDOM(r, g, opts());
    const b = byTarget(r).get("scan");
    assert.equal(b.getAttribute("aria-keyshortcuts"), "R");
    assert.ok(b.classList.contains("extra") && b.classList.contains("sa-t"));
    assert.equal(b.dataset.kind, "act");
    renderDOM(r, menu(44), opts());
    assert.equal(byTarget(r).get("scan"), b);
    assert.equal(b.getAttribute("aria-keyshortcuts"), null);
    assert.ok(!b.classList.contains("extra") && b.classList.contains("sa-t"));
    assert.equal(b.dataset.kind, undefined);
  });

  it("groups wrap their members with the role; only the selected member is in the Tab order", () => {
    const r = root();
    renderDOM(r, buildWindow(44), opts());
    const groups = r.querySelectorAll(".sa-group");
    assert.deepEqual(
      groups.map((x) => x.getAttribute("role")),
      ["radiogroup", "tablist"],
    );
    const tabs = groups[1].children;
    assert.equal(tabs.length, 7);
    assert.deepEqual(
      tabs.map((b) => b.tabIndex),
      [-1, 0, -1, -1, -1, -1, -1],
    );
    assert.equal(tabs[1].getAttribute("aria-selected"), "true");
  });

  it("slots hold the consumer's element and keep it across redraws; scroll bodies keep theirs", () => {
    const r = root();
    const sound = document.createElement("input");
    const music = document.createElement("input");
    renderDOM(r, dialog(44), opts({ slots: { sound, music } }));
    assert.equal(sound.parentElement.dataset.slot, "sound");
    assert.equal(sound.getAttribute("aria-label"), "SOUND");
    const box = sound.parentElement;
    renderDOM(r, dialog(44, { sound: 80 }), opts({ slots: { sound, music } }));
    assert.equal(sound.parentElement, box);
    const w = root();
    renderDOM(w, buildWindow(44), opts());
    const body = w.querySelector('[data-scroll="body"]');
    const cargo = w.querySelector('[data-target="cargo"]');
    renderDOM(w, buildWindow(44, { selected: "pad" }), opts());
    assert.equal(w.querySelector('[data-scroll="body"]'), body);
    assert.equal(w.querySelector('[data-target="cargo"]'), cargo);
    assert.equal(cargo.getAttribute("aria-selected"), "false");
  });

  it("the text mirror holds the non-control text; the paint is aria-hidden", () => {
    const r = root();
    renderDOM(r, dialog(44), opts({ mirror: { role: "status", live: "polite" } }));
    const t = r.querySelector(".sa-text");
    assert.equal(t.textContent.split("\n")[0], "SETTINGS");
    assert.ok(t.textContent.includes("SOUND 50"));
    assert.ok(!t.textContent.includes("CLOSE"));
    assert.ok(!/[─│┌┐└┘├┤]/.test(t.textContent));
    assert.equal(t.getAttribute("role"), "status");
    assert.equal(t.getAttribute("aria-live"), "polite");
    assert.equal(r.querySelector(".sa-paint").getAttribute("aria-hidden"), "true");
  });
});
