// A modal: Tab and Shift+Tab stay inside `el`, Escape closes, the rest of the page is inert while
// it is open, and focus returns to the opener when it closes. For a dialog drawn by renderDOM
// (put the root in an element with role="dialog") or any other element.

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

/** Focusable elements under `el` in Tab order, visible ones only. */
export function focusables(el) {
  return [...el.querySelectorAll(FOCUSABLE)].filter((e) => e.tabIndex >= 0 && !e.closest("[inert]") && e.getClientRects().length > 0);
}

/**
 * Opens `el` as a modal. Returns `close()`, which undoes it (and calls `onClose`); Escape calls it
 * too. `opener` (default: the focused element) gets focus back on close; `initial` gets focus on
 * open (default: the first focusable element). The siblings of `el` and of each of its ancestors
 * are made `inert` (those already inert are left so).
 * @param {HTMLElement} el
 * @param {{ onClose?: () => void, opener?: HTMLElement | null, initial?: HTMLElement | null }} [o]
 */
export function modal(el, { onClose, opener = document.activeElement, initial } = {}) {
  const made = [];
  for (let n = el; n?.parentElement; n = n.parentElement)
    for (const s of n.parentElement.children)
      if (s !== n && !s.inert && s.tagName !== "SCRIPT" && s.tagName !== "STYLE") {
        s.inert = true;
        made.push(s);
      }
  if (!el.hasAttribute("aria-modal")) el.setAttribute("aria-modal", "true");
  const onKey = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab") return;
    const f = focusables(el);
    if (!f.length) {
      e.preventDefault();
      return;
    }
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && (i <= 0 || i < 0)) {
      e.preventDefault();
      f.at(-1).focus();
    } else if (!e.shiftKey && (i === f.length - 1 || i < 0)) {
      e.preventDefault();
      f[0].focus();
    }
  };
  // On the document so Escape and Tab are caught when focus has fallen outside (on the body).
  document.addEventListener("keydown", onKey, true);
  (initial ?? focusables(el)[0])?.focus();
  let open = true;
  function close() {
    if (!open) return;
    open = false;
    document.removeEventListener("keydown", onKey, true);
    for (const s of made) s.inert = false;
    onClose?.();
    if (opener?.isConnected) opener.focus();
  }
  return close;
}
