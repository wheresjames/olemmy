// The instance directory for the picker: Lemmyverse's daily crawl of Lemmy
// instances (lemmyverse.net), fetched live, never stored in the repo or in
// localStorage. Everything in it was written by instance admins, so it is
// only ever shown as text and images. If it can't be fetched, the picker
// keeps its short built-in list.

import { validHost, safeMediaUrl } from '../util/links.js';

export const DIRECTORY_URL = 'https://data.lemmyverse.net/data/instance.full.json';
export const DIRECTORY_HOME = 'https://lemmyverse.net/';

/** Lemmy's registration modes, as Lemmyverse reports them. */
export const SIGNUP = { 0: 'closed', 1: 'application', 2: 'open' };

export const SORTS = {
  score: 'recommended',
  active: 'most active',
  users: 'most users',
  newest: 'newest',
};

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const text = (x, max) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** One Lemmyverse entry as the picker uses it; null when it isn't usable. */
export function normalize(raw) {
  const host = String(raw?.baseurl || '').toLowerCase();
  if (!validHost(host)) return null;
  const langs = Array.isArray(raw.langs) ? raw.langs.filter((l) => typeof l === 'string') : [];
  return {
    host,
    name: text(raw.name, 100) || host,
    desc: text(raw.desc, 300),
    icon: safeMediaUrl(raw.icon),
    signup: SIGNUP[raw.reg_mode] || 'closed',
    private: raw.private === true,
    // Any language: Lemmy's "all" and "undetermined".
    langs: langs.some((l) => l === 'all' || l === 'und') ? [] : langs,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t) => typeof t === 'string').map((t) => text(t, 40)).slice(0, 6) : [],
    users: num(raw.counts?.users ?? raw.metrics?.usersTotal),
    active: num(raw.counts?.users_active_month ?? raw.metrics?.usersMonth),
    published: num(raw.published),
    score: num(raw.score),
    suspicious: raw.isSuspicious === true,
  };
}

/** Lemmyverse's file, as a list of normalized instances. */
export function parse(data) {
  if (!Array.isArray(data)) throw new Error('The instance list isn\'t in the expected format.');
  const seen = new Set();
  return data.map(normalize).filter((i) => i && !seen.has(i.host) && seen.add(i.host));
}

let pending = null;

/** The directory, fetched once per page load (the browser caches the file too). */
export function loadDirectory() {
  pending ??= fetch(DIRECTORY_URL, { credentials: 'omit', referrerPolicy: 'no-referrer' })
    .then((r) => {
      if (!r.ok) throw new Error(`It answered ${r.status}.`);
      return r.json();
    })
    .then(parse)
    .catch((e) => {
      pending = null;
      throw new Error(`Couldn't load the instance list from Lemmyverse. ${e.message || ''}`.trim());
    });
  return pending;
}

const BY = {
  score: (a, b) => b.score - a.score,
  active: (a, b) => b.active - a.active,
  users: (a, b) => b.users - a.users,
  newest: (a, b) => b.published - a.published,
};

/**
 * [list] narrowed and ordered for the picker. [q] matches the name, address,
 * description and tags; [lang] keeps instances in that language or any.
 * Instances Lemmyverse flags as suspicious (inflated user counts and the
 * like) are left out.
 */
export function search(list, { q = '', sort = 'score', signups = false, lang = '' } = {}) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return list
    .filter((i) => !i.suspicious
      && (!signups || i.signup !== 'closed')
      && (!lang || !i.langs.length || i.langs.includes(lang))
      && words.every((w) => i.host.includes(w) || i.name.toLowerCase().includes(w)
        || i.desc.toLowerCase().includes(w) || i.tags.some((t) => t.toLowerCase().includes(w))))
    .sort(BY[sort] || BY.score);
}

/** The languages instances name, most common first. */
export function languages(list) {
  const counts = new Map();
  for (const i of list) for (const l of i.langs) counts.set(l, (counts.get(l) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([l]) => l);
}
