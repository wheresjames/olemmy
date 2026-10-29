// A post in a listing (a "thing"): rank, vote arrows, thumbnail,
// title with domain, tagline, action buttons, and an expando below.

import { h } from '../core/h.js';
import { href } from '../core/router.js';
import { postState } from '../state/entities.js';
import { votePost, savePost, hidePost, report, blockPerson, blockCommunity, requireLogin } from '../state/actions.js';
import { me, api } from '../state/session.js';
import { settings } from '../state/settings.js';
import { voteArrows } from './vote.js';
import { thumbnail } from './thumbnail.js';
import { makeExpando } from './expando.js';
import { timeEl, userLink, communityLink, postHref, communityHref, homeHost, shareUrl } from './common.js';
import { ask, confirmAction } from './dialog.js';
import { toastError } from './toast.js';
import { shareLink } from './send-link.js';
import { domainOf, safeUrl, lemmyRoute } from '../util/links.js';
import { plural } from '../util/format.js';
import { runHook } from '../features/registry.js';
import { addFilter } from '../features/filters.js';
import { postModHooks } from '../views/hooks.js';
import { isDemoAddress } from '../demo/index.js';

/** Where [apId] lives, to open: not for the demo's, which no browser can reach. */
const originalUrl = (apId) => (isDemoAddress(apId) ? null : safeUrl(apId));

/**
 * @param {import('../api/normalize.js').Post} post
 * @param {{ rank?: number, showCommunity?: boolean, onPostPage?: boolean, expanded?: boolean,
 *           guest?: { postHref: (p: any) => string, why: string } }} [ctx]
 *   [guest]: read from another instance (views/address.js): links go to share
 *   addresses, and nothing acts on the post (its id isn't this instance's).
 */
export function postRow(post, ctx = {}) {
  const s = postState(post);
  const guest = ctx.guest;
  const link = guest ? guest.postHref(post) : postHref(post);
  const external = post.url && safeUrl(post.url);
  const internal = external && lemmyRoute(external, homeHost());
  const titleHref = ctx.onPostPage && !external ? null : external ? (internal || external) : link;
  const newTab = settings.peek().openLinksInNewTab && external && !internal;
  const expando = makeExpando(post, !!ctx.expanded);
  const mine = !guest && me.peek()?.person?.id === post.creator?.id;

  const titleLink = titleHref
    ? h('a.title', {
      href: titleHref,
      rel: external && !internal ? 'noopener noreferrer ugc' : undefined,
      target: newTab ? '_blank' : undefined,
      dataset: { eventAction: 'title' },
    }, () => s.title.value)
    : h('span.title', () => s.title.value);

  const thing = h('article.thing.link', {
    dataset: { id: post.id, kind: 'post', community: post.community?.fullName, author: post.creator?.fullName, domain: external ? domainOf(external) : '' },
    tabIndex: -1,
    class: {
      self: !post.url,
      'has-image': expando?.kind === 'image',
      'has-video': expando?.kind === 'video' || expando?.kind === 'embed',
      nsfw: post.nsfw,
      stickied: post.featuredCommunity || post.featuredLocal,
      saved: () => s.saved.value,
      hidden: () => s.hidden.value,
      read: () => s.read.value && !ctx.onPostPage,
      deleted: () => s.deleted.value,
      removed: () => s.removed.value,
    },
  },
  ctx.rank != null && h('span.rank', String(ctx.rank)),
  voteArrows(s, (dir) => votePost(post, dir), { label: post.title, disabled: guest?.why }),
  thumbnail(post, { href: titleHref || link, external: external && !internal, target: newTab ? '_blank' : undefined }),
  h('div.entry',
    h('p.title-line',
      titleLink,
      ' ',
      post.nsfw && h('span.stamp.nsfw-stamp', { title: 'Not safe for work' }, 'nsfw'),
      (post.featuredCommunity || post.featuredLocal) && h('span.stamp.pinned-stamp', { title: post.featuredLocal ? 'Pinned by the instance' : 'Pinned in the community' }, 'pinned'),
      () => (s.locked.value ? h('span.stamp.locked-stamp', { title: 'Locked: no new comments' }, 'locked') : null),
      external && h('span.domain', '(', h('a', {
        href: href('/search', { q: domainOf(external), type: 'Url' }),
        title: `Search for ${domainOf(external)}`,
      }, domainOf(external)), ')')),
    h('div.tagline-row',
      expando && expando.button,
      h('p.tagline',
        'submitted ', timeEl(post.published),
        post.updated && h('span.edited', { title: 'edited' }, '*'),
        ' by ', userLink(post.creator, { mod: post.creatorIsMod, admin: post.creatorIsAdmin }),
        ctx.showCommunity !== false && post.community && [' to ', communityLink(post.community)])),
    guest ? h('ul.flat-list.buttons',
      h('li.first', h('a.comments', { href: link }, () => (s.comments.value ? plural(s.comments.value, 'comment') : 'comment'))),
      h('li', h('button.link-button.share-button', { type: 'button', onclick: () => share(post) }, 'share')),
      originalUrl(post.apId) && h('li', h('a', { href: originalUrl(post.apId), rel: 'noopener noreferrer', target: '_blank' }, 'original')))
    : h('ul.flat-list.buttons',
      h('li.first', h('a.comments', { href: postHref(post) }, () => (s.comments.value ? plural(s.comments.value, 'comment') : 'comment'))),
      h('li.secondary', h('button.link-button.share-button', { type: 'button', onclick: () => share(post) }, 'share')),
      h('li', h('button.link-button.save-button', { type: 'button', onclick: () => savePost(post) }, () => (s.saved.value ? 'unsave' : 'save'))),
      h('li', h('button.link-button.hide-button', { type: 'button', onclick: () => hidePost(post) }, () => (s.hidden.value ? 'unhide' : 'hide'))),
      !mine && h('li.secondary', h('button.link-button', { type: 'button', onclick: () => reportPost(post) }, 'report')),
      h('li.secondary', h('a', { href: href('/submit', { crosspost: post.id }) }, 'crosspost')),
      mine && [
        h('li', h('a', { href: href('/submit', { edit: post.id }) }, 'edit')),
        h('li', h('button.link-button', { type: 'button', onclick: () => deletePost(post, s) }, () => (s.deleted.value ? 'restore' : 'delete'))),
      ],
      postModHooks.map((fn) => fn(post, ctx)),
      h('li.more', moreMenu(post, 'post', {
        own: mine,
        // On phones the secondary actions above are hidden; they're here instead.
        compact: [
          h('li.compact-only', h('button.link-button', { type: 'button', onclick: () => share(post) }, 'share')),
          !mine && h('li.compact-only', h('button.link-button', { type: 'button', onclick: () => reportPost(post) }, 'report')),
          h('li.compact-only', h('a', { href: href('/submit', { crosspost: post.id }) }, 'crosspost')),
        ],
      }))),
    expando && expando.content));

  thing.expando = expando;
  thing.post = post;
  runHook('onPostRender', thing, post, ctx);
  return thing;
}

/** Share an Olemmy link that opens for anyone (shareUrl); also used for comments. */
export const share = (item, title = item.title) => shareLink(shareUrl(item), title);

async function reportPost(post) {
  if (!requireLogin('Log in to report')) return;
  const reason = await ask('Report post', { label: 'Why are you reporting this post?', submit: 'Report' });
  if (reason) report('post', post, reason);
}

async function deletePost(post, s) {
  const deleting = !s.deleted.peek();
  if (deleting && !await confirmAction('Delete this post?', '', 'Delete')) return;
  try {
    const p = await api.peek().deletePost(post.id, deleting);
    s.deleted.value = p.deleted;
  } catch (e) { toastError(e); }
}

/**
 * "more ▾": block the user or community on the account, or filter them
 * locally. [compact] items show on phones only; [own] leaves out what
 * makes no sense for your own posts.
 */
export function moreMenu(item, kind = 'post', { own = false, compact = [] } = {}) {
  const person = own ? null : item.creator;
  const community = item.community;
  const filter = (type, value) => addFilter(type, value);
  return h('details.more-menu',
    h('summary', 'more'),
    h('ul.menu',
      compact,
      person && h('li', h('button.link-button', { type: 'button', onclick: () => filter('user', person.fullName) }, `hide posts by ${person.name} here`)),
      kind === 'post' && !own && community && h('li', h('button.link-button', { type: 'button', onclick: () => filter('community', community.fullName) }, `hide ${community.name} here`)),
      kind === 'post' && !own && item.url && h('li', h('button.link-button', { type: 'button', onclick: () => filter('domain', domainOf(item.url)) }, `hide ${domainOf(item.url)} here`)),
      person && h('li', h('button.link-button', { type: 'button', onclick: async () => { if (await confirmAction(`Block ${person.fullName}?`, 'Blocking is saved on your account.', 'Block')) blockPerson(person); } }, `block ${person.name}`)),
      kind === 'post' && !own && community && h('li', h('button.link-button', { type: 'button', onclick: async () => { if (await confirmAction(`Block ${community.fullName}?`, 'Blocking is saved on your account.', 'Block')) blockCommunity(community); } }, `block ${community.name}`)),
      person && h('li', h('a', { href: href('/message/compose', { to: person.fullName }) }, 'message user')),
      community && h('li', h('a', { href: communityHref(community) }, `go to ${community.name}`)),
      originalUrl(item.apId) && h('li', h('a', { href: originalUrl(item.apId), rel: 'noopener noreferrer', target: '_blank' }, 'view original')),
      h('li.menu-sep', h('a', { href: href('/settings', { tab: 'filters' }) }, 'edit filters…'))));
}
