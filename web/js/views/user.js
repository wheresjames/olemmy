// A user's page: overview / comments / submitted / saved (your own only).
// The user box: account age, instance, and counts.

import { h, add } from '../core/h.js';
import { href, restoreScroll } from '../core/router.js';
import { api, me, account } from '../state/session.js';
import { hostOf } from '../api/client.js';
import { blockPerson, requireLogin } from '../state/actions.js';
import { postRow } from '../components/post-row.js';
import { commentNode } from '../components/comment.js';
import { tabMenu } from '../components/tab-menu.js';
import { spinner, errorBox, empty, setTitle, mdBlock, postHref, commentHref, communityLink, userLink, userHref, avatar, cursorPager } from '../components/common.js';
import { confirmAction } from '../components/dialog.js';
import { shareLink, appUrl } from '../components/send-link.js';
import { passes } from '../features/registry.js';
import { age, number, shortDate, parseTime } from '../util/format.js';

const LIMIT = 20;
const SORTS = [['New', 'new'], ['Hot', 'hot'], ['TopAll', 'top'], ['Old', 'old']];

/** A comment shown outside its thread, with the post it's on. */
export function standaloneComment(c, extra = {}) {
  return commentNode({ ...c, children: [] }, {
    postId: c.postId,
    maxDepth: 1,
    flat: true,
    context: (x) => h('p.comment-context',
      h('a.context-title', { href: postHref(x.post || x.postId) }, x.post?.title || 'a post'),
      ' by ', userLink(x.creator), x.community && [' in ', communityLink(x.community)],
      ' · ', h('a', { href: commentHref(x, { context: true }) }, 'context'),
      ' · ', h('a', { href: postHref(x.post || x.postId) }, 'full comments')),
    ...extra,
  });
}

export function userView(route, ctx) {
  const { chrome } = ctx;
  const name = route.params.name;
  const tab = route.params.tab || 'overview';
  const sort = route.query.get('sort') || 'New';
  const cursor = route.query.get('after') || undefined;
  const base = `/u/${name}`;
  const acct = account.peek();
  const isMe = !!acct && [acct.username, `${acct.username}@${hostOf(acct.instance)}`, me.peek()?.person?.fullName].some((n) => n && n.toLowerCase() === name.toLowerCase());

  setTitle(`u/${name}`);
  chrome.pageName.value = { text: name.replace(/@.*/, ''), href: href(base) };
  chrome.tabs.value = tabMenu([
    ['overview', 'overview'], ['comments', 'comments'], ['submitted', 'submitted'],
    ...(isMe ? [['saved', 'saved']] : []),
  ].map(([t, label]) => ({ label, href: href(t === 'overview' ? base : `${base}/${t}`), selected: tab === t })), 'User page');
  const side = h('div.side', spinner());
  chrome.sidebar.value = side;

  const list = h('div.sitetable.user-listing');
  const page = h('div.user-page',
    h('div.listing-toolbar', tabMenu(SORTS.map(([v, label]) => ({ label, href: href(route.path, { sort: v }), selected: sort === v })), 'Sort')),
    list);
  list.append(spinner());

  api.peek().user({ name, sort, cursor, limit: LIMIT, view: tab }, { signal: ctx.signal }).then((r) => {
    side.replaceChildren(userBox(r.person, r.moderates, isMe));
    setTitle(r.person.displayName || r.person.name, `u/${r.person.fullName}`);
    let items = [];
    items.push(...r.posts.filter((p) => passes('filterPost', p)).map((p) => ({ time: p.published, node: () => postRow(p) })));
    items.push(...r.comments.map((c) => ({ time: c.published, node: () => standaloneComment(c) })));
    items = items.sort((a, b) => (sort === 'New' ? parseTime(b.time) - parseTime(a.time) : 0));
    list.replaceChildren(...(items.length ? items.map((i) => i.node()) : [empty('Nothing here.')]));
    add(list, cursorPager(route, r.next));
    restoreScroll(route);
  }).catch((e) => {
    if (e.kind === 'aborted') return;
    list.replaceChildren(errorBox(e));
    side.replaceChildren();
  });
  return page;
}

function userBox(p, moderates, isMe) {
  return h('div.side-box.user-box',
    p.banner && h('img.side-banner', { src: p.banner, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }),
    h('h2.side-title', avatar(p.avatar, '', 'side-icon'), p.displayName || p.name),
    h('p.side-name', `@${p.fullName}`),
    h('ul.user-facts',
      h('li', h('strong', number(p.postCount)), ' posts'),
      h('li', h('strong', number(p.commentCount)), ' comments'),
      h('li', 'account age: ', h('strong', { title: shortDate(p.published) }, age(p.published))),
      h('li', 'instance: ', h('strong', p.host)),
      p.admin && h('li.userattr.adm', 'instance admin'),
      p.bot && h('li', 'bot account'),
      p.banned && h('li.banned', 'banned')),
    p.bio && mdBlock(p.bio, 'side-md'),
    !isMe && h('p.user-actions',
      h('a.btn.btn-small', { href: href('/message/compose', { to: p.fullName }), onclick: (e) => { if (!requireLogin('Log in to send messages')) e.preventDefault(); } }, 'send message'),
      ' ',
      h('button.btn.btn-small', {
        type: 'button',
        onclick: async () => { if (await confirmAction(`Block ${p.fullName}?`, 'You won\'t see their posts or comments. Saved on your account.', 'Block')) blockPerson(p); },
      }, 'block user')),
    isMe && h('p', h('a.btn.btn-small', { href: href('/account') }, 'account settings')),
    h('p.small',
      h('button.link-button.share-button', { type: 'button', onclick: () => shareLink(appUrl(userHref(p)), p.displayName || p.name) }, 'share'),
      p.actorId && [' · ', h('a', { href: p.actorId, rel: 'noopener noreferrer', target: '_blank' }, 'view on their instance')]),
    moderates.length > 0 && h('div.side-mods', h('h3', 'moderates'), h('ul', moderates.map((c) => h('li', communityLink(c))))));
}
