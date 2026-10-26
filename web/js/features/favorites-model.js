// Favorites as plain data: pages = [{ name, communities: [full names] }].
// Pure functions, so the rules live in one place (and in unit tests): at
// most PER_PAGE communities a page and MAX_PAGES pages, a community on one
// page only, and no empty pages. Each change returns new pages, or
// { error } saying why it can't be done.

export const PER_PAGE = 10;
export const MAX_PAGES = 20;
/** Page colors repeat after this many (features.css, tokens.css). */
export const COLORS = 8;

const same = (a, b) => a.toLowerCase() === b.toLowerCase();

/** A page name: letters, numbers, - and _ (it's also the old #/m/ link). */
export const cleanName = (name) => String(name || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/** Drop empty pages and repeats; spill anything over PER_PAGE onto new pages; at most MAX_PAGES. */
export function tidy(pages) {
  const seen = new Set();
  const out = [];
  for (const p of pages || []) {
    const list = [];
    for (const c of p.communities || []) {
      const k = String(c).toLowerCase();
      if (!c || seen.has(k)) continue;
      seen.add(k);
      list.push(c);
    }
    for (let i = 0; i < list.length; i += PER_PAGE) {
      out.push({ name: i ? '' : cleanName(p.name), communities: list.slice(i, i + PER_PAGE) });
    }
  }
  return out.slice(0, MAX_PAGES);
}

/** Where [name] is: { page, index }, or null. */
export function find(pages, name) {
  for (let page = 0; page < pages.length; page++) {
    const index = pages[page].communities.findIndex((c) => same(c, name));
    if (index >= 0) return { page, index };
  }
  return null;
}

/**
 * Add [name] to page [to] (pages.length: a new page). Without [to], the
 * last page if it has room, else a new one.
 */
export function add(pages, name, to) {
  if (find(pages, name)) return { error: 'already' };
  if (to === undefined) {
    const last = pages[pages.length - 1];
    to = last && last.communities.length < PER_PAGE ? pages.length - 1 : pages.length;
  }
  if (to >= pages.length) {
    if (pages.length >= MAX_PAGES) return { error: 'full' };
    return { pages: [...pages, { name: '', communities: [name] }], page: pages.length };
  }
  if (pages[to].communities.length >= PER_PAGE) return { error: 'page-full' };
  return { pages: pages.map((p, i) => (i === to ? { ...p, communities: [...p.communities, name] } : p)), page: to };
}

export function remove(pages, name) {
  return tidy(pages.map((p) => ({ ...p, communities: p.communities.filter((c) => !same(c, name)) })));
}

/**
 * Move [name] to page [to] (pages.length: a new page) at [index] (end when
 * omitted). Moving within a page reorders it; a full page takes nothing new.
 */
export function move(pages, name, to, index) {
  const at = find(pages, name);
  if (!at) return { error: 'missing' };
  const newPage = to >= pages.length;
  if (newPage && pages.length >= MAX_PAGES) return { error: 'full' };
  if (!newPage && to !== at.page && pages[to].communities.length >= PER_PAGE) return { error: 'page-full' };
  const next = pages.map((p) => ({ ...p, communities: p.communities.filter((c) => !same(c, name)) }));
  if (newPage) next.push({ name: '', communities: [] });
  const list = next[to].communities;
  list.splice(index === undefined ? list.length : Math.max(0, Math.min(index, list.length)), 0, pages[at.page].communities[at.index]);
  const out = tidy(next);
  return { pages: out, page: find(out, name).page };
}

/** Swap page [i] with its neighbour [dir] (-1 or 1). */
export function movePage(pages, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= pages.length) return { error: 'edge' };
  const out = pages.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return { pages: out, page: j };
}

export function rename(pages, i, name) {
  const n = cleanName(name);
  if (n && pages.some((p, k) => k !== i && p.name === n)) return { error: 'taken' };
  return { pages: pages.map((p, k) => (k === i ? { ...p, name: n } : p)), page: i };
}

export function deletePage(pages, i) {
  return pages.filter((_, k) => k !== i);
}

/**
 * A new page of [communities] (those not favorited already), called [name]
 * when no other page is.
 */
export function addPage(pages, name, communities) {
  const fresh = [...new Set(communities)].filter((c) => !find(pages, c)).slice(0, PER_PAGE);
  if (!fresh.length) return { error: 'already' };
  if (pages.length >= MAX_PAGES) return { error: 'full' };
  const n = cleanName(name);
  return { pages: [...pages, { name: n && !pages.some((p) => p.name === n) ? n : '', communities: fresh }], page: pages.length };
}

/** Old client-side multis ({ name, communities }) become pages, after [pages]. */
export function fromMultis(pages, multis) {
  return tidy([...pages, ...(multis || []).map((m) => ({ name: m.name, communities: m.communities || [] }))]);
}

/** The page called [name] (an old multi), or -1. */
export function pageNamed(pages, name) {
  const n = cleanName(name);
  return n ? pages.findIndex((p) => p.name === n) : -1;
}

/** "page 2 · linux" */
export const pageLabel = (pages, i) => `page ${i + 1}${pages[i]?.name ? ` · ${pages[i].name}` : ''}`;
