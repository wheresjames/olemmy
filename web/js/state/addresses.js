// Which post or comment on the instance in use an original address is.
// Filled as content is shown (common.js postHref, commentHref), so opening
// a share address (#/lemmy.world/post/123) from a listing needs no lookup;
// only a pasted link, or a reload in a new tab, asks the instance. Per tab
// (sessionStorage), the most recent MAX.

import { readJSON, writeJSON } from '../core/store.js';
import { instance } from './session.js';
import { hostOf } from '../api/client.js';
import { shareRoute } from '../util/links.js';

const KEY = 'olemmy:addresses';
const MAX = 3000;

/** @type {Map<string, { post: number, comment?: number, parent?: number|null }>|null} */
let map = null;
let timer = 0;

function load() {
  if (!map) {
    const saved = readJSON(KEY, 'session');
    map = new Map(Array.isArray(saved) ? saved : []);
  }
  return map;
}

// By share route, so 'https://Lemmy.World/post/1/' and the address rebuilt from
// #/lemmy.world/post/1 are the same key.
const key = (apId) => `${hostOf(instance.peek())}|${shareRoute(apId) || apId}`;

/** [apId] is post [post] here (and comment [comment], for a comment). */
export function rememberAddress(apId, value) {
  if (!apId || !value?.post) return;
  const m = load();
  const k = key(apId);
  const old = m.get(k);
  if (old && old.post === value.post && old.comment === value.comment && old.parent === value.parent) return;
  m.delete(k);
  m.set(k, value);
  if (m.size > MAX) m.delete(m.keys().next().value);
  clearTimeout(timer);
  timer = setTimeout(flush, 400);
}

function flush() {
  clearTimeout(timer);
  timer = 0;
  if (map) writeJSON(KEY, [...map], 'session');
}

// A reload within the delay mustn't lose what was just learned.
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { if (timer) flush(); });

export function lookupAddress(apId) {
  return load().get(key(apId)) || null;
}
