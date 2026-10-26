// Favorites: communities kept in this browser, per instance, whether or not
// you're logged in, in pages of up to 10 (favorites-model.js). FAVORITES
// (#/favorites, views/favorites.js) merges one page's communities into a
// listing; #/subscriptions manages them. They replaced client-side multis:
// a multi became a named page, and #/m/<name> still opens it.
// Stored in olemmy:favorites as { [host]: { pages, current } }.

import { h } from '../core/h.js';
import { computed, effect } from '../core/signal.js';
import { persisted, readJSON, writeRaw, PREFIX } from '../core/store.js';
import { href } from '../core/router.js';
import { instance } from '../state/session.js';
import { hostOf } from '../api/client.js';
import { defineFeature, enabled } from './registry.js';
import { toast } from '../components/toast.js';
import * as M from './favorites-model.js';

export { PER_PAGE, MAX_PAGES, pageLabel } from './favorites-model.js';

const store = persisted('favorites', { version: 1, defaults: {} });
const key = () => hostOf(instance.value) || 'default';

/** This instance's pages. */
export const favoritePages = computed(() => store.value[key()]?.pages || []);
/** The page FAVORITES opened last (0-based). */
export const currentPage = computed(() => Math.min(store.value[key()]?.current || 0, Math.max(0, favoritePages.value.length - 1)));

function save(pages, current) {
  const k = key();
  store.update((all) => {
    const mine = all[k] || {};
    return { ...all, [k]: { pages, current: current ?? mine.current ?? 0 } };
  });
}

export function setCurrentPage(i) {
  if (i !== currentPage.peek()) save(favoritePages.peek(), i);
}

/** CSS class for page [i]'s color (features.css). */
export const colorClass = (i) => `fav-c${i % M.COLORS}`;

const ERRORS = {
  'page-full': `That page is full (${M.PER_PAGE} communities)`,
  full: `Favorites can have ${M.MAX_PAGES} pages`,
  taken: 'Another page already has that name',
};

/** Apply a model change, or explain why not. Resolves to the result. */
function apply(r) {
  if (r.error) {
    if (ERRORS[r.error]) toast(ERRORS[r.error], { kind: 'error' });
    return r;
  }
  save(r.pages);
  return r;
}

export const isFavorite = (name) => !!M.find(favoritePages.value, name);
export const favoriteAt = (name) => M.find(favoritePages.value, name);

export function addFavorite(name, to) {
  const r = apply(M.add(favoritePages.peek(), name, to));
  if (r.pages) toast(`Added ${name.replace(/@.*/, '')} to favorites, page ${r.page + 1}`, { kind: 'success' });
  return r;
}

export function removeFavorite(name) {
  save(M.remove(favoritePages.peek(), name));
}

export const moveFavorite = (name, to, index) => apply(M.move(favoritePages.peek(), name, to, index));
export const movePage = (i, dir) => apply(M.movePage(favoritePages.peek(), i, dir));
export const renamePage = (i, name) => apply(M.rename(favoritePages.peek(), i, name));
export const deletePage = (i) => save(M.deletePage(favoritePages.peek(), i));
export const pageNamed = (name) => M.pageNamed(favoritePages.peek(), name);

/** Add a shared page (views/favorites.js favoritesSharedView) as a page of your own. */
export function addFavoritePage(name, communities) {
  const r = apply(M.addPage(favoritePages.peek(), name, communities));
  if (r.pages) toast(`Added to your favorites as page ${r.page + 1}`, { kind: 'success' });
  else if (r.error === 'already') toast('They\'re all in your favorites already');
  return r;
}

/** An address that shows page [p] to anyone, with a button to add it to their favorites. */
export const sharedPageHref = (p) => href('/favorites/view', { c: p.communities.join(','), name: p.name });

/** "☆ favorite" / "★ page 2": a community's star, for sidebars and rows. */
export function favoriteButton(fullName, { small = false } = {}) {
  return () => {
    if (!enabled('favorites')) return null;
    const at = favoriteAt(fullName);
    return h(`button.btn.favorite-button${small ? '.btn-small' : ''}`, {
      type: 'button',
      'aria-pressed': String(!!at),
      title: at ? `On favorites ${M.pageLabel(favoritePages.peek(), at.page)}. Click to remove.` : 'Add to your favorites (saved in this browser)',
      onclick: () => (at ? removeFavorite(fullName) : addFavorite(fullName)),
    }, at ? [h(`span.fav-swatch.${colorClass(at.page)}`, { 'aria-hidden': 'true' }), `★ page ${at.page + 1}`] : '☆ favorite');
  };
}

/** Favorites pages in the header's subscriptions menu. */
export function favoriteMenuItems() {
  if (!enabled('favorites')) return [];
  const pages = favoritePages.value;
  return pages.map((p, i) => h('li.fav-menu-item', h('a', { href: href('/favorites', { page: i + 1 }) },
    h(`span.fav-swatch.${colorClass(i)}`, { 'aria-hidden': 'true' }), M.pageLabel(pages, i))));
}

/** Multis (olemmy:multis) become pages on the instance in use, once. */
function migrateMultis() {
  effect(() => {
    if (!hostOf(instance.value)) return;
    const old = readJSON(`${PREFIX}multis`)?.data?.list;
    if (!Array.isArray(old)) return;
    save(M.fromMultis(favoritePages.peek(), old));
    writeRaw(`${PREFIX}multis`, null);
  });
}

export default defineFeature({
  id: 'favorites',
  name: 'Favorites',
  category: 'Communities',
  description: 'Star communities to keep them in this browser, logged in or not, in pages of up to 10. FAVORITES at the top shows one page at a time, merged into one listing (sorted by hot, new or top).',
  keywords: 'favorite star multi group combine feed subscribe pages',
  options: {
    manage: { type: 'custom', default: null, label: '', render: () => h('p', h('a', { href: href('/subscriptions') }, 'Manage your favorites »')) },
  },
  start() { migrateMultis(); },
});
