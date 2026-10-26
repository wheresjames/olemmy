// Just enough of a DOM for the markdown renderer to run in Node, with a
// serializer so tests can compare HTML strings.

class Node {
  constructor() { this.childNodes = []; this.parentNode = null; }
  appendChild(child) {
    if (child instanceof Fragment) {
      for (const c of [...child.childNodes]) this.appendChild(c);
      child.childNodes = [];
      return child;
    }
    child.parentNode?.removeChild?.(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  removeChild(child) {
    this.childNodes = this.childNodes.filter((c) => c !== child);
    child.parentNode = null;
  }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
}

class Text extends Node {
  constructor(data) { super(); this.data = data; }
  get textContent() { return this.data; }
}

class Comment extends Node {
  constructor(data) { super(); this.data = data; }
  get textContent() { return ''; }
}

class Fragment extends Node {}

class Element extends Node {
  constructor(tag) {
    super();
    this.tagName = tag.toUpperCase();
    this.attributes = new Map();
    const attrs = this.attributes;
    this.dataset = new Proxy({}, {
      set(_, k, v) { attrs.set(`data-${String(k).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, String(v)); return true; },
      get(_, k) { return attrs.get(`data-${String(k).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`); },
    });
  }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
  removeAttribute(k) { this.attributes.delete(k); }
  set className(v) { this.setAttribute('class', v); }
  get className() { return this.getAttribute('class') || ''; }
  set id(v) { this.setAttribute('id', v); }
  get id() { return this.getAttribute('id') || ''; }
}

const VOID = new Set(['br', 'hr', 'img', 'input']);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toHTML(node) {
  if (node instanceof Text) return esc(node.data);
  if (node instanceof Comment) return '';
  const inner = node.childNodes.map(toHTML).join('');
  if (!(node instanceof Element)) return inner;
  const tag = node.tagName.toLowerCase();
  const attrs = [...node.attributes].map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${esc(v)}"`)).join('');
  return VOID.has(tag) ? `<${tag}${attrs}>` : `<${tag}${attrs}>${inner}</${tag}>`;
}

export const fakeDocument = {
  createElement: (tag) => new Element(tag),
  createTextNode: (data) => new Text(data),
  createComment: (data) => new Comment(data),
  createDocumentFragment: () => new Fragment(),
};
