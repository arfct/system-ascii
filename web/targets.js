// Input: one transparent native <button> per target, laid over its hit rect. The canvas draws;
// the browser supplies pointer capture, focus, keyboard activation, disabled and the
// accessibility tree. The layer itself takes no events, so touches between controls reach
// whatever is underneath.

/** Movement in CSS px after which a press becomes a drag and the button lets go. */
export const DRAG_SLOP = 8;

/** Minimum hit size in CSS px: 44 on coarse pointers, 24 (WCAG 2.2 minimum) on fine ones. */
export function minTarget(coarse = globalThis.matchMedia?.("(pointer: coarse)").matches ?? false) {
  return coarse ? 44 : 24;
}

/** Each target's hit rect in CSS px, grown evenly to the minimum size. */
export function hitRects(g, cell, min) {
  return g.targets.map((t) => {
    const w = t.w * cell.cellW;
    const h = t.h * cell.cellH;
    const gx = Math.max(0, (min - w) / 2);
    const gy = Math.max(0, (min - h) / 2);
    return { id: t.id, x: t.x * cell.cellW - gx, y: t.y * cell.cellH - gy, w: w + gx * 2, h: h + gy * 2 };
  });
}

/**
 * Rebuilds the buttons in `layer`. Don't call while a pointer is held: a rebuild drops capture.
 * @param {HTMLElement} layer
 * @param {{ onPress: (id: string | null) => void, onActivate: (target: object) => void, onFocus: (id: string | null) => void }} handlers
 */
export function layoutTargets(layer, g, cell, { onPress, onActivate, onFocus }) {
  const focusedId = document.activeElement?.closest?.("[data-target]")?.dataset.target;
  layer.replaceChildren();
  const rects = hitRects(g, cell, minTarget());
  g.targets.forEach((t, i) => {
    const r = rects[i];
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.target = t.id;
    b.textContent = t.label;
    if (t.toggle) b.setAttribute("aria-pressed", String(!!t.on));
    b.disabled = t.disabled;
    Object.assign(b.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    let start = null;
    const release = () => {
      start = null;
      onPress(null);
    };
    b.onpointerdown = (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY };
      onPress(t.id);
    };
    b.onpointermove = (e) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_SLOP) release();
    };
    b.onpointerup = (e) => {
      const box = b.getBoundingClientRect();
      const inside = e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom;
      const held = start !== null;
      release();
      if (inside && held) onActivate(t);
    };
    b.onpointercancel = release;
    b.onkeydown = (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      onActivate(t);
    };
    b.onfocus = () => {
      if (b.matches(":focus-visible")) onFocus(t.id);
    };
    b.onblur = () => onFocus(null);
    layer.append(b);
  });
  if (focusedId) layer.querySelector(`[data-target="${focusedId}"]`)?.focus();
}

/**
 * Mouse drag-to-scroll in a scroll container, starting anywhere, buttons included. Touch
 * scrolling stays the browser's. `onDragStart` lets the caller drop a pressed state.
 */
export function dragScroll(scroller, onDragStart = () => {}) {
  let drag = null;
  scroller.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, left: scroller.scrollLeft, top: scroller.scrollTop, moving: false, id: e.pointerId };
  });
  addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moving && Math.hypot(dx, dy) <= DRAG_SLOP) return;
    if (!drag.moving) onDragStart();
    drag.moving = true;
    scroller.classList.add("dragging");
    scroller.scrollLeft = drag.left - dx;
    scroller.scrollTop = drag.top - dy;
  });
  const end = () => {
    drag = null;
    scroller.classList.remove("dragging");
  };
  addEventListener("pointerup", end);
  addEventListener("pointercancel", end);
}
