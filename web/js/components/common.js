// Small shared pieces: times, user and community links, markdown blocks,
// loading and error states.

import { h } from '../core/h.js';
import { href } from '../core/router.js';
import { timeAgo, fullDate } from '../util/format.js';
import { renderMarkdown } from '../markdown/render.js';
import { site, instance } from '../state/session.js';
import { settings } from '../state/settings.js';
import { hostOf } from '../api/client.js';
import { shareRoute } from '../util/links.js';
import { rememberAddress } from '../state/addresses.js';
import { appUrl } from './send-link.js';

/** <time> showing "3 hours ago", with the exact time on hover. */
export function timeEl(iso, prefix = '') {
  if (!iso) return null;
  return h('time.live-timestamp', { datetime: iso, title: fullDate(iso) }, prefix + timeAgo(iso));
}

/** The host of the instance in use. */
export function homeHost() {
  return site.peek()?.host || hostOf(instance.peek());
}

/** "name@host" for remote objects, "name" for local ones, for routes. */
/** name@instance, so an address means the same community or user on every instance. */
export function routeName(obj) {
  return obj.fullName || obj.name;
}

export const userHref = (p, tab) => href(`/u/${routeName(p)}${tab ? `/${tab}` : ''}`);
export const communityHref = (c, query) => href(`/c/${routeName(c)}`, query);
const localPostHref = (p, commentId) => href(commentId ? `/post/${p.id || p}/comment/${commentId}` : `/post/${p.id || p}`);

/**
 * A short share address (common to every instance) for original address
 * [apId], or null: not for #/resolve?q= ones, which would be long.
 */
function shareAddress(apId) {
  const r = apId && shareRoute(apId);
  return r && !r.startsWith('#/resolve') ? r : null;
}

/**
 * A post's address: its share address when it has an original address
 * (the same for everyone, so the address bar can be copied and sent; this
 * instance's number is remembered for it), else this instance's. With a
 * number, or a comment id, this instance's.
 */
export function postHref(p, commentId) {
  if (!commentId && p && typeof p === 'object') {
    const r = shareAddress(p.apId);
    if (r) {
      // Read from another instance (views/address.js): its number isn't ours.
      if (!p.stateKey) rememberAddress(p.apId, { post: p.id });
      return r;
    }
  }
  return localPostHref(p, commentId);
}

/**
 * A comment's thread, by share address when it has one (as postHref). With
 * [context], its parent's thread instead, the comment highlighted in it.
 */
export function commentHref(c, { context = false } = {}) {
  const r = shareAddress(c.apId);
  if (r) {
    if (!c.stateKey) rememberAddress(c.apId, { post: c.postId, comment: c.id, parent: c.parentId ?? null });
    return context ? `${r}?context=1` : r;
  }
  return localPostHref(c.postId, context ? (c.parentId ?? c.id) : c.id);
}

/**
 * The Olemmy address of a post or comment that opens for anyone, on any
 * instance (views/address.js): built from its original address, not the
 * instance's own number for it.
 */
export function shareUrl(item) {
  return appUrl(shareRoute(item.apId) || location.hash);
}

/**
 * A link to [person], with the host dimmed when remote, and OP / mod /
 * admin / bot marks.
 */
export function userLink(person, { op = false, mod = false, admin = false, cls = '' } = {}) {
  if (!person) return h('span.author.deleted', '[deleted]');
  const remote = !person.local && person.host !== homeHost();
  const title = person.displayName && person.displayName !== person.name ? `${person.displayName} (${person.fullName})` : person.fullName;
  return h('span.author-wrap', { dataset: { person: person.id } },
    h(`a.author${cls ? `.${cls}` : ''}`, {
      href: userHref(person),
      title,
      class: { submitter: op, moderator: mod, admin },
    }, person.name, remote && h('span.host', `@${person.host}`)),
    op && h('span.userattr.op', { title: 'Original poster' }, 'OP'),
    mod && h('span.userattr.mod', { title: 'Moderator of this community' }, 'M'),
    admin && h('span.userattr.adm', { title: 'Instance admin' }, 'A'),
    person.bot && h('span.userattr.bot', { title: 'Bot account' }, 'bot'));
}

export function communityLink(community, cls = 'community-link') {
  if (!community) return null;
  const remote = !community.local && community.host !== homeHost();
  return h(`a.${cls}`, { href: communityHref(community), title: community.fullName },
    community.name, remote && h('span.host', `@${community.host}`));
}

/** Rendered markdown in a div.md. */
export function mdBlock(text, cls = '') {
  const div = h(`div.md${cls ? `.${cls}` : ''}`);
  div.append(renderMarkdown(text, { home: homeHost(), newTab: settings.peek().openLinksInNewTab, textOnly: settings.peek().displayMode === 'text' }));
  return div;
}

export function spinner(label = 'Loading…') {
  return h('div.loading', { role: 'status' }, h('span.spinner', { 'aria-hidden': 'true' }), h('span', label));
}

/** An error box; [retry] adds a "try again" button. */
export function errorBox(e, retry) {
  const kind = e?.kind;
  const text = kind === 'cors'
    ? "Couldn't reach the instance. It may be down, or it doesn't allow third-party web clients like Olemmy."
    : e?.message || String(e);
  return h('div.error-box', { role: 'alert' },
    h('p', text),
    kind === 'cors' && h('p.small', 'You can choose another instance, or ask its admins to allow other origins (Lemmy\'s cors_origin setting). ',
      h('a', { href: href('/instance') }, 'Choose an instance')),
    retry && h('button.btn', { type: 'button', onclick: retry }, 'Try again'));
}

/** An empty-state message. */
export function empty(text) {
  return h('p.empty', text);
}

/** Avatar or community icon, small, if allowed. */
export function avatar(url, alt = '', cls = 'avatar') {
  if (!url || settings.peek().showAvatars === false) return null;
  return h(`img.${cls}`, { src: url, alt, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', width: 24, height: 24 });
}

/** Set the document title. */
export function setTitle(...parts) {
  document.title = [...parts.filter(Boolean), 'Olemmy'].join(' · ');
}

/**
 * "← Previous page · Next page →" for cursor-paged pages: forward with ?after=<next>,
 * back through history (cursors only go one way).
 */
export function cursorPager(route, next) {
  const keep = Object.fromEntries([...route.query].filter(([k]) => k !== 'after'));
  const prev = route.query.get('after') && h('button.link-button.prev', { type: 'button', onclick: () => history.back() }, '← Previous page');
  const more = next && h('a.next', { href: href(route.path, { ...keep, after: next }), rel: 'next' }, 'Next page →');
  if (!prev && !more) return null;
  return h('div.nav-buttons', h('span.nextprev', prev, prev && more && h('span.separator', '·'), more));
}
