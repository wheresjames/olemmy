// Post listings: the front page (Subscribed when logged in), Local, All,
// and community pages. Sort tabs, numbered rows, never-ending scroll or
// classic pages, and the sidebar.
//
// Going back to a listing puts you where you were: the pages on screen are
// kept in memory (and their count in sessionStorage, for reloads), and the
// router restores the scroll position.

import { h, add } from '../core/h.js';
import { signal } from '../core/signal.js';
import { href, entryState, restoreScroll } from '../core/router.js';
import { api, account, loggedIn, me, site, base, setActiveAccount } from '../state/session.js';
import { isDemoBase, demoAccount } from '../demo/index.js';
import { settings, setSettings } from '../state/settings.js';
import { postRow } from '../components/post-row.js';
import { tabMenu, navSelect } from '../components/tab-menu.js';
import { searchBox, submitButtons, communityBox, siteBox, sidebar } from '../components/sidebar.js';
import { spinner, errorBox, empty, setTitle, homeHost } from '../components/common.js';
import { passes } from '../features/registry.js';
import { nerEnabled, watchSentinel, pageSeparator } from '../features/never-ending-scroll.js';
import { showImagesButton, autoOpen, allImagesOpen } from '../features/expandos.js';
import { shortcutButton } from '../features/shortcut-bar.js';
import { expandoKind } from '../components/expando.js';
import { SORT_LABELS } from '../util/format.js';
import { communitySideHooks, listingToolbarHooks } from './hooks.js';

const LIMIT = 25;
const MAX_SNAPSHOTS = 10;
/** route key -> { pages: Post[][], ended } for instant back navigation. */
const snapshots = new Map();

const MAIN_SORTS = [['Hot', 'hot'], ['New', 'new'], ['Active', 'active'], ['Scaled', 'scaled'], ['Controversial', 'controversial'], ['Top', 'top'], ['Old', 'old'], ['MostComments', 'most comments'], ['NewComments', 'new comments']];
const TOP_RANGES = ['TopHour', 'TopSixHour', 'TopTwelveHour', 'TopDay', 'TopWeek', 'TopMonth', 'TopThreeMonths', 'TopSixMonths', 'TopNineMonths', 'TopYear', 'TopAll'];

/** The sort in effect: the address's, else the user's default. */
export function currentSort(query) {
  return query.get('sort') || settings.peek().defaultSort || me.peek()?.settings.defaultSortType || 'Hot';
}

/** The listing type of the front page. */
function frontType() {
  if (loggedIn.peek()) return 'Subscribed';
  return settings.peek().defaultListing || site.peek()?.defaultListingType || 'Local';
}

/** Hot/new/top... tabs for [path], keeping other query values. */
export function sortTabs(path, sort, extra = {}) {
  const isTop = sort.startsWith('Top');
  const tabs = tabMenu(MAIN_SORTS.map(([value, label]) => ({
    label,
    href: href(path, { ...extra, sort: value === 'Top' ? 'TopDay' : value }),
    selected: value === 'Top' ? isTop : sort === value,
  })));
  if (!isTop) return tabs;
  return h('div.tabs-with-range', tabs,
    navSelect('links from', TOP_RANGES.map((r) => [r, SORT_LABELS[r], href(path, { ...extra, sort: r })]), sort));
}

/**
 * A feed of post rows, page by page: never-ending scroll or classic pages
 * (?after=<cursor>&count=<rank so far>). [fetchPage]
 * (cursor, signal) resolves to { posts, next }. Used by listings and favorites.
 * @param {{ route: any, ctx: any, fetchPage: (cursor: string|undefined, signal: AbortSignal) => Promise<{ posts: any[], next: string|null }>,
 *           showCommunity?: boolean, emptyText?: string, toolbar?: any[] | ((feed: Feed) => any[]) }} o
 *
 * @typedef {{ list: HTMLElement, kept: (name: string) => boolean, keep: (name: string, on: boolean) => void }} Feed
 *   What toolbar buttons get: the list, and toggles kept with the history
 *   entry, so going back (or reloading) returns to them as they were.
 */
export function postFeed({ route, ctx, fetchPage, showCommunity = true, emptyText = 'There doesn\'t seem to be anything here.', toolbar = [] }) {
  const client = api.peek();
  const scope = `${client?.base || ''} ${account.peek()?.username || ''}`;
  const ner = nerEnabled();
  const path = route.path;
  const startCursor = route.query.get('after') || undefined;
  const startRank = Math.max(0, Number(route.query.get('count')) || 0);
  const showNsfw = () => (me.peek() ? me.peek().settings.showNsfw : settings.peek().showNsfw);
  const list = h('div#siteTable.sitetable.linklisting', { role: 'feed', 'aria-busy': 'true' });
  const status = h('div.listing-status');
  const filteredNote = signal(0);
  let rank = startRank;
  let cursor = startCursor;
  let ended = false;
  let loading = null;              // the page load in flight
  let watcher = null;              // never-ending scroll's sentinel watch
  // In the tree from the start: a revisit renders from the snapshot before the
  // feed is mounted, so it can't be inserted next to [status] later.
  const sentinel = ner ? h('div.ner-sentinel', { 'aria-hidden': 'true' }) : null;
  const pages = [];                // { posts, cursor } per page loaded
  const saved = route.revisit ? entryState(route.key) : null;
  const toggles = { ...(saved?.scope === scope ? saved.toggles : null) };
  /** @type {Feed} */
  const feed = {
    list,
    kept: (name) => !!toggles[name],
    keep: (name, on) => { toggles[name] = on; remember(); },
  };

  function renderPage(posts, n) {
    const frag = document.createDocumentFragment();
    if (ner && n > 1) frag.append(pageSeparator(n + Math.floor(startRank / LIMIT)));
    let hidden = 0;
    for (const p of posts) {
      if (!passes('filterPost', p) || (p.nsfw && !showNsfw())) { hidden++; continue; }
      frag.append(postRow(p, { rank: ++rank, showCommunity, expanded: autoOpen(expandoKind(p)) }));
    }
    filteredNote.value += hidden;
    list.append(frag);
  }

  function remember() {
    snapshots.delete(route.key);
    snapshots.set(route.key, { client, pages: pages.slice(), cursor, ended });
    if (snapshots.size > MAX_SNAPSHOTS) snapshots.delete(snapshots.keys().next().value);
    entryState(route.key, { scope, cursors: pages.map((pg) => pg.cursor ?? null), toggles });
  }

  /** Load the next page; resolves to whether there may be more. A call while
   * a page is loading shares that load, so the sentinel doesn't give up. */
  function loadNext() {
    if (loading) return loading;
    if (ended || ctx.signal.aborted) return Promise.resolve(false);
    return (loading = fetchNext());
  }

  async function fetchNext() {
    status.replaceChildren(spinner('Loading posts…'));
    try {
      const at = cursor;
      const r = await fetchPage(at, ctx.signal);
      if (ctx.signal.aborted || api.peek() !== client) return false;
      pages.push({ posts: r.posts, cursor: at });
      renderPage(r.posts, pages.length);
      cursor = r.next || undefined;
      ended = !r.next || !r.posts.length;
      remember();
      status.replaceChildren(footer());
      return !ended;
    } catch (e) {
      if (e.kind !== 'aborted') status.replaceChildren(errorBox(e, () => loadNext().then(() => watcher?.resume())));
      return false;
    } finally {
      loading = null;
      list.setAttribute('aria-busy', 'false');
    }
  }

  function footer() {
    if (!pages.some((pg) => pg.posts.length)) return empty(emptyText);
    if (ner) {
      if (ended) return h('p.ner-end', 'That\'s everything.');
      return h('div.ner-more', h('button.btn', { type: 'button', onclick: () => loadNext() }, 'load more'));
    }
    // Classic pages: forward by cursor, back through history.
    const keep = Object.fromEntries([...route.query].filter(([k]) => k !== 'after' && k !== 'count'));
    const prev = startCursor && h('button.link-button.prev', { type: 'button', onclick: () => history.back() }, '← Previous page');
    const next = !ended && h('a.next', { href: href(path, { ...keep, after: cursor, count: rank }), rel: 'next' }, 'Next page →');
    return h('div.nav-buttons', h('span.nextprev', prev, prev && next && h('span.separator', '·'), next));
  }

  const cached = route.revisit ? snapshots.get(route.key) : null;
  const snap = cached?.client === client ? cached : null;
  // Before the rows render (a snapshot renders right away), so they open.
  allImagesOpen.value = feed.kept('images');
  (async () => {
    if (snap) {
      for (const pg of snap.pages) { pages.push(pg); renderPage(pg.posts, pages.length); }
      cursor = snap.cursor;
      ended = snap.ended;
      list.setAttribute('aria-busy', 'false');
      status.replaceChildren(footer());
    } else {
      // A reload of a long never-ending listing: fetch the pages it had.
      const want = ner && saved?.scope === scope ? Math.min(saved.cursors?.length || 1, 10) : 1;
      for (let i = 0; i < want; i++) if (!await loadNext()) break;
    }
    restoreScroll(route);
    if (ner && !ctx.signal.aborted) {
      watcher = watchSentinel(sentinel, loadNext);
      ctx.signal.addEventListener('abort', watcher.stop, { once: true });
    }
  })();

  return h('div.feed',
    h('div.listing-toolbar',
      showImagesButton(feed),
      ...(typeof toolbar === 'function' ? toolbar(feed) : toolbar),
      () => (filteredNote.value ? h('span.small.filtered-note', `${filteredNote.value} hidden by your filters · `, h('a', { href: href('/settings', { tab: 'filters' }) }, 'edit filters')) : null)),
    list, status, sentinel);
}

/**
 * @param {import('../core/router.js').Route} route
 * @param {{ signal: AbortSignal, chrome: any }} ctx
 */
export function listingView(route, ctx) {
  const { chrome } = ctx;
  const name = route.params.name || null;          // community, for /c/:name
  const kind = route.name;                         // front | all | local | community
  const type = kind === 'all' ? 'All' : kind === 'local' ? 'Local' : kind === 'front' ? frontType() : undefined;
  const sort = currentSort(route.query);
  const path = route.path;

  const label = name ? name.replace(/@.*/, '') : { All: 'all', Local: 'local', Subscribed: 'subscribed' }[type] || 'front page';
  setTitle(name ? `!${name}` : label);
  chrome.pageName.value = { text: label, href: href(path) };
  chrome.tabs.value = sortTabs(path, sort);

  const side = h('div.side');
  chrome.sidebar.value = side;
  if (name) {
    add(side, searchBox({ name: name.replace(/@.*/, ''), fullName: name }), submitButtons({ fullName: name }), spinner('Loading community…'));
    api.peek().community(name, { signal: ctx.signal }).then(({ community, moderators }) => {
      side.lastChild.remove();
      add(side, communityBox(community, moderators), h('p.small', shortcutButton(community.fullName)), communitySideExtras(community));
      setTitle(community.title, `!${community.fullName}`);
    }).catch((e) => {
      if (e.kind === 'aborted') return;
      side.lastChild.replaceWith(errorBox(e));
    });
  } else {
    add(side, searchBox(), submitButtons(), siteBox());
  }

  const feed = postFeed({
    route, ctx,
    showCommunity: !name,
    emptyText: type === 'Subscribed' ? 'Nothing here yet. Subscribe to some communities, or browse All.' : 'There doesn\'t seem to be anything here.',
    fetchPage: (cursor, signal) => api.peek().posts({ type, sort, community: name || undefined, cursor, limit: LIMIT }, { signal }),
    toolbar: (f) => listingToolbarHooks.map((fn) => fn(f)),
  });
  return h('div.listing-page', kind === 'front' && !loggedIn.peek() && welcome(), feed);
}

function communitySideExtras(community) { return communitySideHooks.map((fn) => fn(community)); }

function welcome() {
  // In the demo, its own bar says where you are.
  if (settings.peek().hideWelcome || isDemoBase(base.peek())) return null;
  const note = h('div.welcome-note',
    h('p', 'You\'re browsing ', h('strong', homeHost()), ' without an account. ',
      h('a', { href: href('/login') }, 'Log in'), ' or ', h('a', { href: href('/signup') }, 'sign up'),
      ' to vote, comment and subscribe, or ', h('a', { href: href('/instance') }, 'choose another instance'), '. ',
      'New to Olemmy? ', h('button.link-button', { type: 'button', onclick: () => setActiveAccount(demoAccount()) }, 'Try the demo'), ' first.'),
    // Closed for good, in this browser.
    h('button.banner-close', { type: 'button', 'aria-label': 'Close', title: 'Close', onclick: () => { setSettings({ hideWelcome: true }); note.remove(); } }, '×'));
  return note;
}

