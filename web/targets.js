// Input for the canvas renderer: one transparent native <button> per target, laid over its hit
// rect (the HTML renderer, web/dom.js, makes the chips themselves buttons instead). The browser
// supplies pointer capture, focus, keyboard activation and the accessibility tree. The layer
// itself takes no events (web/targets.css), so touches between controls reach whatever is
// underneath.

/** Movement in CSS px after which a press becomes a drag and the button lets go. */
export const DRAG_SLOP = 8;

/** Minimum hit size in CSS px: 44 on coarse pointers, 24 (WCAG 2.2 minimum) on fine ones. */
export function minTarget(coarse = globalThis.matchMedia?.("(pointer: coarse)").matches ?? false) {
  return coarse ? 44 : 24;
}

/**
 * Each target's hit rect in CSS px, grown evenly to the minimum size: `min`, or the target's own
 * `hit: { w, h }` where larger. Hit sizes are CSS px and need not be whole cells; the chip stays
 * where its cells are.
 */
export function hitRects(g, cell, min) {
  return g.targets.map((t) => {
    const w = t.w * cell.cellW;
    const h = t.h * cell.cellH;
    const gx = Math.max(0, (Math.max(min, t.hit?.w ?? 0) - w) / 2);
    const gy = Math.max(0, (Math.max(min, t.hit?.h ?? 0) - h) / 2);
    const r = { id: t.id, x: t.x * cell.cellW - gx, y: t.y * cell.cellH - gy, w: w + gx * 2, h: h + gy * 2 };
    if (t.disabled) r.disabled = true;
    if (t.reason) r.reason = t.reason;
    return r;
  });
}

/**
 * Applies a target's state to its button: a disabled target with a `reason` stays focusable and
 * pressable as `aria-disabled`; without one it is `disabled`.
 */
export function targetAttributes(b, t) {
  b.type = "button";
  b.dataset.target = t.id;
  if (t.toggle) b.setAttribute("aria-pressed", String(!!t.on));
  else b.removeAttribute("aria-pressed");
  const inert = t.disabled && !t.reason;
  b.disabled = inert;
  if (t.disabled && t.reason) b.setAttribute("aria-disabled", "true");
  else b.removeAttribute("aria-disabled");
  if (t.reason) b.title = t.reason;
  else b.removeAttribute("title");
}

/**
 * Wires the press rules to a button. `current()` returns the target it stands for now, so a
 * reused element always acts for the latest layout. Activation is on `click`, which covers
 * pointers, Enter and Space, `element.click()` and assistive technology; the pointer handlers only
 * draw the pressed state and cancel a press that slides off or turns into a drag.
 * @param {HTMLButtonElement} b
 * @param {() => object} current
 * @param {() => { onPress?: (id: string | null) => void, onActivate?: (target: object, reason: string | null) => void, onFocus?: (id: string | null) => void }} handlers
 */
export function wireButton(b, current, handlers) {
  let start = null;
  let cancelled = false;
  const release = () => {
    if (start === null) return;
    start = null;
    handlers().onPress?.(null);
  };
  b.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY };
    cancelled = false;
    handlers().onPress?.(current().id);
  });
  b.addEventListener("pointermove", (e) => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_SLOP) {
      cancelled = true;
      release();
    }
  });
  b.addEventListener("pointerup", () => {
    release();
    // The click that follows this pointerup is dispatched in the same task; a cancelled press
    // swallows only that one, never a later keyboard activation.
    if (cancelled) setTimeout(() => (cancelled = false));
  });
  b.addEventListener("pointercancel", () => {
    cancelled = true;
    release();
  });
  b.addEventListener("click", () => {
    if (cancelled) {
      cancelled = false;
      return;
    }
    const t = current();
    if (t.disabled && !t.reason) return;
    handlers().onActivate?.(t, t.disabled ? t.reason : null);
  });
  b.addEventListener("focus", () => {
    if (b.matches(":focus-visible")) handlers().onFocus?.(current().id);
  });
  b.addEventListener("blur", () => handlers().onFocus?.(null));
}

/**
 * Brings `parent`'s children into the order of `els` without moving an element already in place,
 * so the focused element is never detached (detaching drops focus and pointer capture).
 */
export function placeInOrder(parent, els) {
  els.forEach((el, i) => {
    if (parent.children[i] !== el) parent.insertBefore(el, parent.children[i] ?? null);
  });
  while (parent.children.length > els.length) parent.lastElementChild.remove();
}

const layers = new WeakMap();

/**
 * Reconciles the buttons in `layer` with the grid's targets by id: an id that stays keeps its
 * element (focus, hover and pointer capture survive), a new id gets one, a removed id loses its.
 * @param {HTMLElement} layer
 * @param {{ onPress?: (id: string | null) => void, onActivate?: (target: object, reason: string | null) => void, onFocus?: (id: string | null) => void }} handlers
 */
export function layoutTargets(layer, g, cell, handlers) {
  let state = layers.get(layer);
  if (!state) {
    state = { els: new Map(), handlers };
    layers.set(layer, state);
  }
  state.handlers = handlers;
  const rects = hitRects(g, cell, minTarget());
  const next = new Map();
  const order = g.targets.map((t, i) => {
    let entry = state.els.get(t.id);
    if (!entry) {
      const b = document.createElement("button");
      entry = { b, t };
      wireButton(
        b,
        () => entry.t,
        () => state.handlers,
      );
    }
    entry.t = t;
    next.set(t.id, entry);
    const { b } = entry;
    targetAttributes(b, t);
    if (b.textContent !== t.label) b.textContent = t.label;
    const r = rects[i];
    Object.assign(b.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    return b;
  });
  state.els = next;
  placeInOrder(layer, order);
}

/**
 * Mouse drag-to-scroll in a scroll container, starting anywhere, buttons included. Touch
 * scrolling stays the browser's. `onDragStart` lets the caller drop a pressed state. Returns a
 * function that removes the listeners.
 */
export function dragScroll(scroller, onDragStart = () => {}) {
  let drag = null;
  const down = (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, left: scroller.scrollLeft, top: scroller.scrollTop, moving: false, id: e.pointerId };
  };
  const move = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moving && Math.hypot(dx, dy) <= DRAG_SLOP) return;
    if (!drag.moving) onDragStart();
    drag.moving = true;
    scroller.classList.add("dragging");
    scroller.scrollLeft = drag.left - dx;
    scroller.scrollTop = drag.top - dy;
  };
  const end = () => {
    drag = null;
    scroller.classList.remove("dragging");
  };
  scroller.addEventListener("pointerdown", down);
  addEventListener("pointermove", move);
  addEventListener("pointerup", end);
  addEventListener("pointercancel", end);
  return () => {
    scroller.removeEventListener("pointerdown", down);
    removeEventListener("pointermove", move);
    removeEventListener("pointerup", end);
    removeEventListener("pointercancel", end);
  };
}
