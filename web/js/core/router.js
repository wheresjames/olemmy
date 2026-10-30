// Hash router: #/c/linux@lemmy.ml?sort=New
//
// Routes are matched in order; ":name" captures one path segment. Each
// history entry is stamped with a key in history.state, so a revisited entry
// (back/forward, or a reload) can restore its scroll position and whatever
// else the view stored for it, while a fresh navigation starts at the top.

import { signal } from './signal.js';
import { readJSON, writeJSON } from './store.js';

const SCROLL_KEY = 'olemmy:scroll';
const MAX_SCROLL_ENTRIES = 100;

/** @typedef {{ path: string, query: URLSearchParams, params: Record<string,string>, name: string, key: string, revisit: boolean, hash: string }} Route */

/** @type {ReturnType<typeof signal<Route|null>>} */
export const route = signal(null);

let table = [];
const beforeHooks = [];

/** Parse "#/a/b?x=1" into its path and query. */
export function parseHash(hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const q = raw.indexOf('?');
  const path = (q < 0 ? raw : raw.slice(0, q)) || '/';
  const query = new URLSearchParams(q < 0 ? '' : raw.slice(q + 1));
  return { path: path.startsWith('/') ? path : `/${path}`, query };
}

/**
 * Compile "/c/:name" into a matcher. A last "/*rest" captures the rest of
 * the path, kept as written (not decoded).
 */
export function compile(pattern) {
  const names = [];
  let splat = null;
  const source = pattern
    .replace(/\/\*(\w+)$/, (_, n) => { splat = n; return '/(.+)'; })
    .replace(/\/:(\w+)/g, (_, n) => { names.push(n); return '/([^/]+)'; });
  const re = new RegExp(`^${source}${splat ? '' : '/?'}$`);
  return (path) => {
    const m = path.match(re);
    if (!m) return null;
    const params = {};
    names.forEach((n, i) => {
      try { params[n] = decodeURIComponent(m[i + 1]); } catch { params[n] = m[i + 1]; }
    });
    if (splat) params[splat] = m[names.length + 1];
    return params;
  };
}

/** Match [path] against the table: { name, params } or null. */
export function match(path, routes = table) {
  for (const r of routes) {
    const params = r.match(path);
    if (params) return { name: r.name, params };
  }
  return null;
}

/**
 * An address for [path] and [query] ({ key: value }, empty values dropped).
 * @param {string} path
 * @param {Record<string, any>} [query]
 */
export function href(path, query) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query || {})) if (v != null && v !== '' && v !== false) q.set(k, String(v));
  const s = q.toString();
  return `#${path}${s ? `?${s}` : ''}`;
}

/** Go to [to] ("#/..." or "/..."). */
export function navigate(to, { replace = false } = {}) {
  const hash = to.startsWith('#') ? to : `#${to}`;
  if (replace) {
    history.replaceState(null, '', hash);
    onChange();
  } else if (location.hash === hash) {
    onChange();
  } else {
    location.hash = hash;
  }
}

/** Run [fn] before each route change; it may return false to cancel. */
export function beforeNavigate(fn) { beforeHooks.push(fn); }

// --- scroll positions ----------------------------------------------------------

// A position is the pixel offset plus an anchor: the post or comment at the
// top of the screen and how far it sat from the top. Rows above can come
// back taller or shorter (images loading, expandos closed), so the anchor is
// what's restored; the offset is the fallback when it's gone.

const ANCHORS = '[data-kind][data-id]';

function positions() { return readJSON(SCROLL_KEY, 'session') || {}; }

/** The innermost post or comment at the top of the screen, else the first below it. */
function topAnchor() {
  let best = null;
  for (const el of document.querySelectorAll(ANCHORS)) {
    const r = el.getBoundingClientRect();
    if (r.bottom <= 0 || (!r.width && !r.height)) continue;
    if (r.top <= 0) { best = el; continue; }
    best ||= el;
    break;
  }
  if (!best) return null;
  return { kind: best.dataset.kind, id: best.dataset.id, top: Math.round(best.getBoundingClientRect().top) };
}

export function saveScroll(key, y = window.scrollY) {
  if (!key) return;
  const all = positions();
  delete all[key];
  all[key] = { y: Math.round(y), anchor: y > 0 ? topAnchor() : null };
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_SCROLL_ENTRIES))) delete all[k];
  writeJSON(SCROLL_KEY, all, 'session');
}

/** { y, anchor } for entry [key], or undefined. */
export function savedScroll(key) {
  const p = positions()[key];
  return typeof p === 'number' ? { y: p, anchor: null } : p;
}

/** Where to scroll for [pos]: its anchor back where it was, else its offset. */
function targetY(pos) {
  const a = pos.anchor;
  const el = a && document.querySelector(`[data-kind="${CSS.escape(a.kind)}"][data-id="${CSS.escape(a.id)}"]`);
  if (!el) return pos.y;
  return Math.max(0, Math.round(window.scrollY + el.getBoundingClientRect().top - a.top));
}

/**
 * Per-entry view state ({ pages, cursor... }) in sessionStorage, so a reload
 * or back navigation can rebuild what was on screen.
 */
export function entryState(key, value) {
  const k = `olemmy:entry:${key}`;
  if (value === undefined) return readJSON(k, 'session');
  writeJSON(k, value, 'session');
  return value;
}

// --- running ----------------------------------------------------------------

let lastKey = null;
let counter = 0;

function stamp() {
  const state = history.state;
  if (state && state.olemmyKey) return { key: state.olemmyKey, revisit: true };
  const key = `${Date.now().toString(36)}-${(counter++).toString(36)}`;
  history.replaceState({ ...(state || {}), olemmyKey: key }, '');
  return { key, revisit: false };
}

function onChange() {
  const { path, query } = parseHash(location.hash);
  const found = match(path);
  for (const hook of beforeHooks) if (hook({ path, query }) === false) return;
  if (lastKey) saveScroll(lastKey);
  const { key, revisit } = stamp();
  lastKey = key;
  route.value = {
    path, query,
    params: found?.params || {},
    name: found?.name || 'notfound',
    key, revisit,
    hash: location.hash || '#/',
  };
}

/** Start routing with [routes]: [{ name, path: '/c/:name' }]. */
export function start(routes) {
  table = routes.map((r) => ({ ...r, match: compile(r.path) }));
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.addEventListener('hashchange', onChange);
  // Keep the scroll position of the entry being left on reload or close.
  window.addEventListener('pagehide', () => { if (lastKey) saveScroll(lastKey); });
  onChange();
}

/** How long a restored position is held while images load and the browser settles. */
const HOLD_MS = 2500;
const USER_INPUT = ['touchstart', 'wheel', 'keydown', 'pointerdown'];

/**
 * Scroll to where entry [key] was left, if it's a revisit, once the view
 * has content. Retries briefly while the page is still too short, then holds
 * the anchor in place for a moment: images above it load and change the
 * page's height, and Firefox for Android ignores scrollRestoration 'manual'
 * on hash navigation, adding its own saved offset on top of ours. Any user
 * input ends the hold.
 */
export function restoreScroll(r) {
  const pos = r.revisit ? savedScroll(r.key) : null;
  if (!pos?.y) { window.scrollTo(0, 0); return; }
  let tries = 0;
  let holding = true;
  const resized = new ResizeObserver(() => hold());
  const release = () => {
    holding = false;
    resized.disconnect();
    window.removeEventListener('scroll', hold);
    for (const t of USER_INPUT) window.removeEventListener(t, release, true);
  };
  const hold = () => {
    if (!holding) return;
    const y = targetY(pos);
    if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y);
  };
  const attempt = () => {
    if (!holding) return;
    const y = targetY(pos);
    window.scrollTo(0, y);
    if (Math.abs(window.scrollY - y) > 2 && tries++ < 20) requestAnimationFrame(attempt);
  };
  for (const t of USER_INPUT) window.addEventListener(t, release, { capture: true, passive: true });
  window.addEventListener('scroll', hold, { passive: true });
  resized.observe(document.body);
  setTimeout(release, HOLD_MS);
  requestAnimationFrame(attempt);
}
