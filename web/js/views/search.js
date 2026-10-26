// Search: posts / comments / communities / users, globally or in one
// community; and #/communities, the community directory.

import { h, add, fill } from '../core/h.js';
import { href, navigate, restoreScroll } from '../core/router.js';
import { api, me } from '../state/session.js';
import { settings } from '../state/settings.js';
import { follow } from '../state/actions.js';
import { postRow } from '../components/post-row.js';
import { tabMenu, navSelect } from '../components/tab-menu.js';
import { spinner, errorBox, empty, setTitle, communityHref, userLink, mdBlock, avatar, cursorPager } from '../components/common.js';
import { standaloneComment } from './user.js';
import { saveButton, savedSearchesBox } from '../features/impl/saved-searches.js';
import { passes } from '../features/registry.js';
import { favoriteButton } from '../features/favorites.js';
import { number, plural, clip, SORT_LABELS } from '../util/format.js';

const TYPES = [['Posts', 'posts'], ['Comments', 'comments'], ['Communities', 'communities'], ['Users', 'users'], ['Url', 'links']];
const SEARCH_SORTS = ['TopAll', 'TopYear', 'TopMonth', 'TopWeek', 'New', 'Old', 'Hot', 'Active'];

export function searchView(route, ctx) {
  const { chrome } = ctx;
  const q = route.query.get('q') || '';
  const type = route.query.get('type') || 'Posts';
  const sort = route.query.get('sort') || 'TopAll';
  const community = route.query.get('community') || '';
  const cursor = route.query.get('after') || undefined;
  const keep = { q, community, sort };
  setTitle(q ? `search: ${q}` : 'search');
  chrome.pageName.value = { text: 'search', href: href('/search') };
  chrome.tabs.value = tabMenu(TYPES.map(([t, label]) => ({ label, href: href('/search', { ...keep, type: t }), selected: type === t })), 'Search type');
  chrome.sidebar.value = h('div.side', savedSearchesBox());

  const input = h('input#search-page-q', { type: 'search', value: q, placeholder: 'search', 'aria-label': 'Search for' });
  const results = h('div.search-results');
  const page = h('div.search-page',
    h('form.search-form', {
      role: 'search',
      onsubmit: (e) => { e.preventDefault(); navigate(href('/search', { ...keep, q: input.value.trim(), type, page: '' })); },
    },
    input, h('button.btn', { type: 'submit' }, 'search'),
    saveButton({ q, type, community, sort }),
    community && h('p.small', 'searching in ', h('strong', community), ' · ', h('a', { href: href('/search', { q, type, sort }) }, 'search everywhere')),
    navSelect('sort', SEARCH_SORTS.map((s) => [s, SORT_LABELS[s], href('/search', { ...keep, type, sort: s })]), sort)),
    results);

  if (!q) { results.append(empty('Type something to search for.')); return page; }
  results.append(spinner('Searching…'));
  api.peek().search({ q, type, sort, community: community || undefined, cursor, limit: 20 }, { signal: ctx.signal }).then((r) => {
    const nodes = [];
    if (type === 'Posts' || type === 'Url') nodes.push(...r.posts.filter((p) => passes('filterPost', p)).map((p) => postRow(p)));
    if (type === 'Comments') nodes.push(...r.comments.map((c) => standaloneComment(c)));
    if (type === 'Communities') nodes.push(...r.communities.map(communityRow));
    if (type === 'Users') nodes.push(...r.users.map(userRow));
    results.replaceChildren(...(nodes.length ? nodes : [empty('No results.')]));
    add(results, cursorPager(route, r.next));
    restoreScroll(route);
  }).catch((e) => { if (e.kind !== 'aborted') results.replaceChildren(errorBox(e)); });
  return page;
}

/** A row in the community directory or search results. */
export function communityRow(c) {
  let state = c.subscribed;
  const button = h('button.btn.btn-small.subscribe-button', {
    type: 'button',
    class: { subscribed: state !== 'NotSubscribed' },
    onclick: async () => {
      const r = await follow(c, state === 'NotSubscribed');
      if (r) {
        state = r.subscribed;
        button.textContent = state === 'NotSubscribed' ? 'subscribe' : state === 'Pending' ? 'pending' : 'unsubscribe';
        button.classList.toggle('subscribed', state !== 'NotSubscribed');
      }
    },
  }, state === 'NotSubscribed' ? 'subscribe' : state === 'Pending' ? 'pending' : 'unsubscribe');
  return h('div.community-row.thing', { tabIndex: -1, dataset: { kind: 'community', id: c.id } },
    h('div.community-row-main',
      avatar(c.icon, '', 'community-icon'),
      h('p.title-line', h('a.title', { href: communityHref(c) }, c.title), ' ', h('span.small', `!${c.fullName}`),
        c.nsfw && h('span.stamp.nsfw-stamp', 'nsfw')),
      h('p.tagline', `${plural(c.subscribers, 'subscriber')}, ${number(c.usersActiveMonth)} active this month, ${plural(c.posts, 'post')}`),
      c.description && h('div.community-desc', mdBlock(clip(c.description.split('\n').find((l) => l.trim() && !/^[#!\[]/.test(l.trim())) || '', 240)))),
    h('div.community-row-buttons', button, favoriteButton(c.fullName, { small: true })));
}

function userRow(p) {
  return h('div.user-row.thing', { tabIndex: -1 },
    avatar(p.avatar), userLink(p), ' ',
    h('span.small', `${plural(p.postCount, 'post')}, ${plural(p.commentCount, 'comment')}`));
}

const DIRECTORY_SORTS = [['TopMonth', 'popular'], ['Active', 'active'], ['New', 'new'], ['TopAll', 'all-time']];

export function communitiesView(route, ctx) {
  const { chrome } = ctx;
  const type = route.query.get('type') || 'All';
  const sort = route.query.get('sort') || 'TopMonth';
  const cursor = route.query.get('after') || undefined;
  setTitle('communities');
  chrome.pageName.value = { text: 'communities', href: href('/communities') };
  chrome.tabs.value = tabMenu(DIRECTORY_SORTS.map(([s, label]) => ({ label, href: href('/communities', { type, sort: s }), selected: sort === s })), 'Sort');
  chrome.sidebar.value = null;
  const list = h('div.community-list', spinner());
  const showNsfw = me.peek() ? me.peek().settings.showNsfw : settings.peek().showNsfw;
  api.peek().communities({ type, sort, cursor, limit: 30, showNsfw }, { signal: ctx.signal }).then(({ communities: cs, next }) => {
    fill(list, cs.length ? cs.map(communityRow) : empty('No communities found.'), cursorPager(route, next));
    restoreScroll(route);
  }).catch((e) => { if (e.kind !== 'aborted') list.replaceChildren(errorBox(e)); });
  return h('div.communities-page',
    h('div.listing-toolbar',
      tabMenu([['All', 'all instances'], ['Local', 'this instance'], ['Subscribed', 'subscribed']].map(([t, label]) => ({
        label, href: href('/communities', { type: t, sort }), selected: type === t,
      })), 'Show communities from'),
      h('form.inline-form', {
        role: 'search',
        onsubmit: (e) => { e.preventDefault(); navigate(href('/search', { q: e.target.elements.q.value, type: 'Communities' })); },
      }, h('input', { type: 'search', name: 'q', placeholder: 'find communities', 'aria-label': 'Find communities' }), h('button.btn.btn-small', { type: 'submit' }, 'search'))),
    list);
}
