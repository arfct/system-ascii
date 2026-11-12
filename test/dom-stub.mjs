// A minimal DOM for running renderDOM under node: enough elements, styles, attributes, classes,
// datasets, events and tree operations for the reconcile tests. Layout is not modelled
// (getBoundingClientRect is all zeros).

class ClassList {
  constructor(el) {
    this.el = el;
  }
  get set() {
    return new Set(String(this.el.className).split(/\s+/).filter(Boolean));
  }
  write(s) {
    this.el.className = [...s].join(" ");
  }
  add(...cs) {
    const s = this.set;
    for (const c of cs) s.add(c);
    this.write(s);
  }
  remove(...cs) {
    const s = this.set;
    for (const c of cs) s.delete(c);
    this.write(s);
  }
  contains(c) {
    return this.set.has(c);
  }
  toggle(c, on) {
    const want = on === undefined ? !this.contains(c) : !!on;
    if (want) this.add(c);
    else this.remove(c);
    return want;
  }
}

class Style {
  constructor() {
    this.props = {};
  }
  setProperty(k, v) {
    this.props[k] = String(v);
  }
  getPropertyValue(k) {
    return this.props[k] ?? "";
  }
}

const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const kebab = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

class Node {
  constructor() {
    this.childNodes = [];
    this.parentNode = null;
  }
  get children() {
    return this.childNodes.filter((n) => n instanceof Element);
  }
  get parentElement() {
    return this.parentNode instanceof Element ? this.parentNode : null;
  }
  get firstChild() {
    return this.childNodes[0] ?? null;
  }
  get lastElementChild() {
    return this.children.at(-1) ?? null;
  }
  get isConnected() {
    let n = this;
    while (n.parentNode) n = n.parentNode;
    return n === doc.documentElement;
  }
  _adopt(n) {
    if (typeof n === "string") {
      const t = new Text(n);
      t.parentNode = this;
      return [t];
    }
    if (n instanceof Fragment) {
      const kids = [...n.childNodes];
      n.childNodes = [];
      for (const k of kids) k.parentNode = this;
      return kids;
    }
    n.remove?.();
    n.parentNode = this;
    return [n];
  }
  append(...ns) {
    for (const n of ns) this.childNodes.push(...this._adopt(n));
  }
  replaceChildren(...ns) {
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
    this.append(...ns);
  }
  insertBefore(n, ref) {
    const add = this._adopt(n);
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) this.childNodes.push(...add);
    else this.childNodes.splice(i, 0, ...add);
    return n;
  }
  remove() {
    if (!this.parentNode) return;
    const p = this.parentNode;
    p.childNodes = p.childNodes.filter((c) => c !== this);
    this.parentNode = null;
  }
  get textContent() {
    return this.childNodes.map((c) => c.textContent).join("");
  }
  set textContent(v) {
    this.replaceChildren(String(v));
  }
}

class Text extends Node {
  constructor(s) {
    super();
    this.data = s;
  }
  get textContent() {
    return this.data;
  }
}

class Fragment extends Node {}

class Element extends Node {
  constructor(tag) {
    super();
    this.tagName = tag.toUpperCase();
    this.attributes = new Map();
    this.className = "";
    this.classList = new ClassList(this);
    this.style = new Style();
    this.listeners = {};
    this.disabled = false;
    this.tabIndex = tag === "button" || tag === "input" ? 0 : -1;
    const ds = {};
    this.dataset = new Proxy(ds, {
      set: (o, k, v) => {
        o[k] = String(v);
        return true;
      },
      deleteProperty: (o, k) => {
        delete o[k];
        return true;
      },
    });
  }
  setAttribute(k, v) {
    if (k.startsWith("data-")) this.dataset[camel(k.slice(5))] = v;
    else this.attributes.set(k, String(v));
  }
  getAttribute(k) {
    if (k.startsWith("data-")) return this.dataset[camel(k.slice(5))] ?? null;
    return this.attributes.has(k) ? this.attributes.get(k) : null;
  }
  hasAttribute(k) {
    return this.getAttribute(k) !== null;
  }
  removeAttribute(k) {
    if (k.startsWith("data-")) delete this.dataset[camel(k.slice(5))];
    else this.attributes.delete(k);
  }
  toggleAttribute(k, on) {
    if (on) this.setAttribute(k, "");
    else this.removeAttribute(k);
  }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  dispatch(type, init = {}) {
    const e = { type, target: this, preventDefault() {}, stopPropagation() {}, ...init };
    for (const fn of this.listeners[type] ?? []) fn(e);
  }
  click() {
    if (!this.disabled) this.dispatch("click");
  }
  focus() {
    doc.activeElement = this;
    this.dispatch("focus");
  }
  getBoundingClientRect() {
    return { x: 0, y: 0, top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 };
  }
  getClientRects() {
    return [this.getBoundingClientRect()];
  }
  closest() {
    return null;
  }
  /** Descendant elements, depth first. */
  *all() {
    for (const c of this.children) {
      yield c;
      yield* c.all();
    }
  }
  /** `[data-x="v"]` and `.class` selectors only. */
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] ?? null;
  }
  querySelectorAll(sel) {
    const m = sel.match(/^\[data-([a-z-]+)="(.*)"\]$/);
    const c = sel.match(/^\.([\w-]+)$/);
    return [...this.all()].filter((e) => (m ? e.dataset[camel(m[1])] === m[2] : c ? e.classList.contains(c[1]) : false));
  }
}

const doc = {
  activeElement: null,
  createElement: (tag) => new Element(tag),
  createDocumentFragment: () => new Fragment(),
  documentElement: new Element("html"),
};
doc.body = new Element("body");
doc.documentElement.append(doc.body);

/** Installs the stub as globalThis.document (and CSS.escape, matchMedia); returns it. */
export function installDOM() {
  globalThis.document = doc;
  globalThis.CSS ??= { escape: (s) => String(s).replace(/"/g, '\\"') };
  globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
  return doc;
}

export { kebab };
