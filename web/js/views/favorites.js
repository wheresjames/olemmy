// FAVORITES: one favorites page at a time (#/favorites?page=N), its
// communities' posts merged into one listing, in the browser. Fetches go
// through the instance's request queue
// and are cached for 5 minutes; a merge in progress is kept for back and
// forward. #/m/<name> (an old multi) opens the page of that name.
// #/favorites/view?c=<communities>&name=<name> shows a page someone shared,
// with a button to add it to your own favorites.

import { h } from '../core/h.js';
import { signal, onCleanup } from '../core/signal.js';
import { href, navigate } from '../core/router.js';
import { registerKey } from '../core/events.js';
import { api } from '../state/session.js';
import { tabMenu, navSelect } from '../components/tab-menu.js';
import { searchBox, sidebar } from '../components/sidebar.js';
import { setTitle, empty } from '../components/common.js';
import { postFeed } from './listing.js';
import { createMerger, comparator } from '../api/merge.js';
import { favoritePages, currentPage, setCurrentPage, colorClass, pageLabel, pageNamed, isFavorite, addFavoritePage, sharedPageHref, PER_PAGE } from '../features/favorites.js';
import { shareLink, appUrl } from '../components/send-link.js';
import { validHost } from '../util/links.js';
import { cleanName } from '../features/favorites-model.js';
import { SORT_LABELS } from '../util/format.js';

const CACHE_MS = 5 * 60 * 1000;
const PAGE = 25;
const TOPS = ['TopDay', 'TopWeek', 'TopMonth', 'TopYear', 'TopAll'];
/** route key -> { merger, time }: going back continues the same merge. */
const merges = new Map();

const pageHref = (i, sort) => href('/favorites', { page: i + 1, sort: sort === 'Hot' ? '' : sort });

/** hot · new · top, [link](sort) giving each one's address. */
function sortTabs(link, sort) {
  const isTop = sort.startsWith('Top');
  const tabs = tabMenu([['Hot', 'hot'], ['New', 'new'], ['TopDay', 'top']].map(([v, label]) => ({
    label, href: link(v), selected: v === 'TopDay' ? isTop : sort === v,
  })));
  if (!isTop) return tabs;
  return h('div.tabs-with-range', tabs, navSelect('links from', TOPS.map((r) => [r, SORT_LABELS[r], link(r)]), sort));
}

const sortOf = (route) => (['Hot', 'New', ...TOPS].includes(route.query.get('sort')) ? route.query.get('sort') : 'Hot');

/** ◀ [■ page 2 · linux ▾] ▶ : which page this is, its color, and the way to the others. */
function pager(pages, i, sort) {
  const step = (to, label, text) => (to >= 0 && to < pages.length
    ? h('a.fav-step', { href: pageHref(to, sort), 'aria-label': label, title: `${label} ([ and ])`, rel: to < i ? 'prev' : 'next' }, text)
    : h('span.fav-step.disabled', { 'aria-hidden': 'true' }, text));
  return h(`nav.fav-pager.${colorClass(i)}`, { 'aria-label': 'Favorites pages' },
    step(i - 1, 'Previous page', '◀'),
    h('details.fav-pick',
      h('summary', { 'aria-label': `${pageLabel(pages, i)} of ${pages.length}: choose a page` },
        h('span.fav-swatch', { 'aria-hidden': 'true' }), h('span.fav-pick-label', pageLabel(pages, i)), h('span.fav-of', ` / ${pages.length}`)),
      h('ul.fav-pick-menu',
        pages.map((p, k) => h('li', h('a', { href: pageHref(k, sort), 'aria-current': k === i ? 'page' : undefined },
          h(`span.fav-swatch.${colorClass(k)}`, { 'aria-hidden': 'true' }), pageLabel(pages, k), h('span.small', ` (${p.communities.length})`)))),
        h('li.fav-pick-manage', h('button.link-button', {
          type: 'button',
          onclick: () => shareLink(appUrl(sharedPageHref(pages[i])), `Favorites: ${pageLabel(pages, i)}`),
        }, 'share this page')),
        h('li', h('a', { href: href('/subscriptions') }, 'manage favorites »')))),
    step(i + 1, 'Next page', '▶'));
}

export function favoritesView(route, ctx) {
  const { chrome } = ctx;
  const pages = favoritePages.peek();
  const sort = sortOf(route);
  setTitle('favorites');
  chrome.pageName.value = { text: 'favorites', href: href('/favorites') };

  if (!pages.length) {
    chrome.tabs.value = null;
    chrome.sidebar.value = sidebar(searchBox());
    return h('div.fav-empty',
      empty('No favorites yet.'),
      h('p', 'Press ', h('strong', '☆ favorite'), ' in a community\'s sidebar, or in the ', h('a', { href: href('/communities') }, 'communities directory'),
        ', to add it here. Favorites are kept in this browser, whether or not you\'re logged in, in pages of up to 10 communities; this shows one page at a time.'),
      h('p', h('a', { href: href('/subscriptions') }, 'Manage favorites »')));
  }

  const asked = Number(route.query.get('page'));
  // Plain FAVORITES opens the page you were on last.
  const i = asked >= 1 && asked <= pages.length ? asked - 1 : currentPage.peek();
  setCurrentPage(i);
  const page = pages[i];
  setTitle(`favorites: ${pageLabel(pages, i)}`);
  chrome.tabs.value = h('div.fav-tabs', pager(pages, i, sort), sortTabs((v) => pageHref(i, v), sort));
  chrome.sidebar.value = sidebar(searchBox(), pageBox(pages, i));

  const go = (to) => { if (to >= 0 && to < pages.length) navigate(pageHref(to, sort)); };
  const keys = [
    registerKey('[', () => go(i - 1), { description: 'Previous favorites page', group: 'Favorites' }),
    registerKey(']', () => go(i + 1), { description: 'Next favorites page', group: 'Favorites' }),
  ];
  onCleanup(() => keys.forEach((off) => off()));

  return h(`div.listing-page.fav-feed.${colorClass(i)}`, mergedFeed(route, ctx, page.communities, sort));
}

/** [communities]' posts merged into one listing, sorted by [sort]. */
function mergedFeed(route, ctx, communities, sort) {
  const key = `${route.key}|${sort}|${communities.join(',')}`;
  const client = api.peek();
  let entry = merges.get(key);
  if (!entry || entry.client !== client || Date.now() - entry.time > CACHE_MS) {
    entry = {
      client,
      time: Date.now(),
      merger: createMerger({
        names: communities,
        compare: comparator(sort),
        fetch: (community, cursor) => client.posts({ community, sort, cursor, limit: 20 }, { ttl: CACHE_MS }),
      }),
    };
    merges.set(key, entry);
    if (merges.size > 10) merges.delete(merges.keys().next().value);
  }
  const problems = signal([]);
  return postFeed({
    route, ctx,
    emptyText: 'Nothing in these communities yet.',
    // The merge keeps its own place: the cursor only says "there's more".
    fetchPage: async () => {
      const r = await entry.merger.next(PAGE);
      problems.value = entry.merger.errors();
      return { posts: r.posts, next: r.done ? null : 'more' };
    },
    toolbar: [
      () => (problems.value.length ? h('span.small.warning', `couldn't load: ${problems.value.map((p) => p.name).join(', ')}`) : null),
    ],
  });
}

/** A favorites page someone shared: its feed, and a button to keep it. */
export function favoritesSharedView(route, ctx) {
  const { chrome } = ctx;
  const communities = [...new Set((route.query.get('c') || '').split(',')
    .map((c) => c.trim().replace(/^!/, '').toLowerCase())
    .filter((c) => /^[a-z0-9_]{1,64}@/.test(c) && validHost(c.slice(c.indexOf('@') + 1))))].slice(0, PER_PAGE);
  const name = cleanName(route.query.get('name'));
  const sort = sortOf(route);
  const label = name ? `shared page · ${name}` : 'shared page';
  setTitle(`favorites: ${label}`);
  chrome.pageName.value = { text: 'favorites', href: href('/favorites') };
  if (!communities.length) {
    chrome.tabs.value = null;
    chrome.sidebar.value = null;
    return h('div', empty('This shared page has no communities in it.'));
  }
  const link = (v) => href('/favorites/view', { c: communities.join(','), name, sort: v === 'Hot' ? '' : v });
  chrome.tabs.value = h('div.fav-tabs', h('span.fav-pager.fav-shared', h('span.fav-pick-label', label)), sortTabs(link, sort));
  chrome.sidebar.value = sidebar(searchBox(), h('div.side-box.fav-box.fav-shared',
    h('h2.side-title', label),
    h('p.small', `${communities.length} communities, merged in your browser. Hot is approximate.`),
    h('ul.fav-box-list', communities.map((c) => h('li', h('a', { href: href(`/c/${c}`) }, c))))));

  const add = () => {
    const r = addFavoritePage(name, communities);
    if (r.pages) navigate(pageHref(r.page, sort));
  };
  const banner = h('div.infobar.fav-shared-banner', { role: 'note' },
    h('strong', 'A favorites page shared with you'), name && ` (${name})`, `: ${communities.length} communities. `,
    () => (communities.every((c) => isFavorite(c))
      ? h('span', '✓ They\'re all in your favorites.')
      : h('button.btn.btn-small.favorite-button', { type: 'button', onclick: add }, '★ add to my favorites')));
  return h('div.listing-page.fav-feed.fav-shared', banner, mergedFeed(route, ctx, communities, sort));
}

function pageBox(pages, i) {
  return h(`div.side-box.fav-box.${colorClass(i)}`,
    h('h2.side-title', h('span.fav-swatch', { 'aria-hidden': 'true' }), pageLabel(pages, i)),
    h('p.small', `${pages[i].communities.length} communities, merged in your browser. Hot is approximate.`),
    h('ul.fav-box-list', pages[i].communities.map((c) => h('li', h('a', { href: href(`/c/${c}`) }, c)))),
    h('p.small', h('a', { href: href('/subscriptions') }, 'manage favorites »')));
}

/** #/m/<name>: an old multi's link, now a named favorites page. */
export function multiView(route) {
  const i = pageNamed(route.params.name);
  if (i >= 0) {
    queueMicrotask(() => navigate(pageHref(i, route.query.get('sort') || 'Hot'), { replace: true }));
    return h('div');
  }
  return h('div', empty(`There's no favorites page called ${route.params.name}.`), h('p', h('a', { href: href('/subscriptions') }, 'Manage favorites »')));
}
