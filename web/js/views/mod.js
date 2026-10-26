// The mod log (#/modlog, optionally ?community=name@host), public; and the
// reports queue (#/reports) for communities you moderate.

import { h, fill } from '../core/h.js';
import { signal } from '../core/signal.js';
import { href } from '../core/router.js';
import { api, refreshUnread, moderated, isAdmin } from '../state/session.js';
import { requireLogin } from '../state/actions.js';
import { tabMenu } from '../components/tab-menu.js';
import { spinner, errorBox, empty, setTitle, userLink, communityLink, timeEl, postHref, commentHref, mdBlock, cursorPager } from '../components/common.js';
import { toastError, toast } from '../components/toast.js';
import { banDialog } from '../features/impl/mod-tools.js';
import { ask } from '../components/dialog.js';
import { clip } from '../util/format.js';

/** The community named in ?community=, as { id, fullName } (null for all). */
async function communityFrom(route, signal) {
  const name = route.query.get('community');
  if (!name) return null;
  return (await api.peek().community(name, { signal })).community;
}

function target(e) {
  if (e.comment) return h('span', 'comment ', h('a', { href: commentHref(e.comment) }, `"${clip(e.comment.content, 80)}"`));
  if (e.post) return h('span', 'post ', h('a', { href: postHref(e.post) }, e.post.title));
  if (e.person) return userLink(e.person);
  if (e.community) return communityLink(e.community);
  return null;
}

export function modlogView(route, ctx) {
  const { chrome } = ctx;
  const name = route.query.get('community');
  setTitle('mod log', name && `!${name}`);
  chrome.pageName.value = { text: 'mod log', href: href('/modlog') };
  chrome.tabs.value = null;
  chrome.sidebar.value = null;
  const list = h('div.modlog', spinner());
  (async () => {
    try {
      const community = await communityFrom(route, ctx.signal);
      const { entries, next } = await api.peek().modlog({ communityId: community?.id, cursor: route.query.get('after') || undefined }, { signal: ctx.signal });
      fill(list,
        community && h('p', 'Actions in ', communityLink(community), ' · ', h('a', { href: href('/modlog') }, 'whole instance')),
        entries.length ? h('table.modlog-table',
          h('thead', h('tr', h('th', 'when'), h('th', 'moderator'), h('th', 'action'), h('th', 'reason'))),
          h('tbody', entries.map((e) => h('tr',
            h('td', timeEl(e.when)),
            h('td', e.moderator ? userLink(e.moderator) : h('span.small', 'a moderator')),
            h('td', h('strong', e.action), ' ', target(e), e.community && !community && [' in ', communityLink(e.community)],
              e.expires && h('span.small', ' until ', timeEl(e.expires))),
            h('td', e.reason || h('span.small', '—'))))))
          : empty('Nothing in the mod log.'),
        cursorPager(route, next));
    } catch (e) {
      if (e.kind !== 'aborted') fill(list, errorBox(e));
    }
  })();
  return h('div.mod-page', h('h1', 'mod log'), list);
}

export function reportsView(route, ctx) {
  const { chrome } = ctx;
  if (!requireLogin('Log in to see reports')) return h('div');
  const showAll = route.query.get('all') === '1';
  const name = route.query.get('community') || '';
  setTitle('reports');
  chrome.pageName.value = { text: 'reports', href: href('/reports') };
  chrome.tabs.value = tabMenu([
    { label: 'open', href: href('/reports', { community: name }), selected: !showAll },
    { label: 'all', href: href('/reports', { community: name, all: 1 }), selected: showAll },
  ], 'Reports');
  chrome.sidebar.value = h('div.side', h('div.side-box',
    h('h2', 'communities you moderate'),
    h('ul', [...moderated.peek()].map((c) => h('li', h('a', { href: href('/reports', { community: c }) }, c)))),
    isAdmin.peek() && h('p.small', 'As an admin you also see reports from local communities.'),
    h('p', h('a', { href: href('/modlog', { community: name }) }, 'mod log'))));
  const list = h('div.reports', spinner());
  (async () => {
    try {
      const community = await communityFrom(route, ctx.signal);
      const { reports, next } = await api.peek().reports({ unresolvedOnly: !showAll, communityId: community?.id, cursor: route.query.get('after') || undefined });
      fill(list, reports.length ? reports.map(reportItem) : empty(showAll ? 'No reports.' : 'No open reports. Nice.'), cursorPager(route, next));
    } catch (e) {
      if (e.kind !== 'aborted') fill(list, errorBox(e));
    }
  })();
  return h('div.mod-page', h('h1', name ? `reports in ${name}` : 'reports'), list);
}

function reportItem(r) {
  const resolved = signal(r.resolved);
  const removed = signal(r.kind === 'post' ? r.post.removed : r.comment.removed);
  const a = () => api.peek();
  const resolve = async () => {
    try {
      await a().resolveReport(r, !resolved.peek());
      resolved.value = !resolved.peek();
      refreshUnread();
    } catch (e) { toastError(e); }
  };
  const remove = async () => {
    const removing = !removed.peek();
    const why = removing ? await ask('Reason', { label: 'Reason (shown in the mod log)', required: false }) : '';
    if (why === null) return;
    try {
      if (r.kind === 'post') await a().removePost(r.post.id, removing, why || r.reason);
      else await a().removeComment(r.comment.id, removing, why || r.reason);
      removed.value = removing;
      if (removing && !resolved.peek()) await resolve();
      toast(removing ? 'Removed' : 'Restored', { kind: 'success' });
    } catch (e) { toastError(e); }
  };
  return h('div.report-item.thing', { class: { resolved: () => resolved.value }, tabIndex: -1 },
    h('p.subject',
      h('strong', r.kind === 'post' ? 'post report' : 'comment report'), ' in ', communityLink(r.community),
      ' · ', h('a', { href: r.kind === 'post' ? postHref(r.post) : commentHref(r.comment) }, r.kind === 'post' ? r.post.title : `on "${r.post.title}"`)),
    h('p.tagline', 'reported by ', userLink(r.reporter), ' ', timeEl(r.published), ': ', h('strong.report-reason', r.reason)),
    h('div.report-original',
      h('p.small', 'by ', userLink(r.author), ':'),
      r.kind === 'post'
        ? [h('p', h('strong', r.original.title)), r.original.url && h('p.small', r.original.url), r.original.body && mdBlock(clip(r.original.body, 600))]
        : mdBlock(clip(r.original.content, 600))),
    h('ul.flat-list.buttons',
      h('li', h('button.link-button', { type: 'button', onclick: resolve }, () => (resolved.value ? 'reopen' : 'resolve'))),
      h('li', h('button.link-button', { type: 'button', onclick: remove }, () => (removed.value ? 'restore' : `remove ${r.kind}`))),
      r.author && h('li', h('button.link-button', { type: 'button', onclick: () => banDialog(r.author, r.community) }, `ban ${r.author.name}`)),
      () => (resolved.value && r.resolver ? h('li.small', 'resolved by ', userLink(r.resolver)) : null)));
}
