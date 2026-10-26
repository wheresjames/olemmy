// Share addresses (not views/share.js: blockers block that name): an
// original address without its "https:/", like
// #/lemmy.world/post/123 or #/piefed.social/c/linux@lemmy.ml/p/42/a-title
// (common.js postHref, shareUrl). The same for everyone, so the address bar
// can be copied and sent. The page shows the post in place, under that
// address:
//   - known in this tab, or this instance's own /post/<id>: shown at once;
//   - else your instance looks it up (resolve_object), and its copy is shown;
//   - else, for a Lemmy-style /post/<id> or /comment/<id>, it's read from its
//     own instance, read only (post.js postPage's guest mode); anything
//     else gets "not here yet" and the original's link.

import { h, fill } from '../core/h.js';
import { href, navigate } from '../core/router.js';
import { api, loggedIn, site, loadSite } from '../state/session.js';
import { lookupAddress, rememberAddress } from '../state/addresses.js';
import { LemmyV3 } from '../api/v3.js';
import { hostOf } from '../api/client.js';
import { validHost, shareRoute, shareOriginal } from '../util/links.js';
import { spinner, errorBox, setTitle } from '../components/common.js';
import { postPage } from './post.js';

/**
 * An anonymous client for [base]: no login token goes there. Everything it
 * returns gets a state key of its own ("host:id"), so it never shares state
 * with this instance's post or comment of the same number.
 */
export function guestClient(base) {
  const host = hostOf(base);
  const c = new LemmyV3(base);
  const tag = (x) => (x ? Object.assign(x, { stateKey: `${host}:${x.id}` }) : x);
  return {
    base,
    async post(id, o) { const d = await c.post(id, o); tag(d.post); return d; },
    async comment(id, o) { return tag(await c.comment(id, o)); },
    async comments(q, o) { return (await c.comments(q, o)).map(tag); },
    async commentPage(q, o) { const r = await c.commentPage(q, o); r.comments.forEach(tag); return r; },
  };
}

export function shareView(route, ctx) {
  const { chrome } = ctx;
  const host = String(route.params.host || '').toLowerCase();
  const rest = String(route.params.rest || '');
  chrome.pageName.value = null;
  chrome.tabs.value = null;
  chrome.sidebar.value = null;
  setTitle('opening…');
  if (!validHost(host) || !rest || /[?#\s]/.test(rest)) {
    return h('div.error-box', h('h1', 'Page not found'), h('p', h('a', { href: '#/' }, 'Go to the front page')));
  }
  const original = shareOriginal(host, rest);
  // Lemmy's own addresses: readable from that instance if need be.
  const lemmy = rest.match(/^(post|comment)\/(\d{1,12})$/);
  const client = api.peek();
  const myHost = client ? hostOf(client.base) : '';
  const box = h('div.share-page', spinner(client ? `Opening on ${site.peek()?.host || myHost}…` : `Opening from ${host}…`));
  // ?context=1 on a comment: its parent's thread, with the comment marked in it.
  const context = route.query.get('context') === '1';
  const focusOf = (comment, parent) => (context && parent ? { focusId: parent, highlightId: comment } : { focusId: comment ?? null });
  const show = (postId, comment = null, parent = null) => fill(box, postPage(route, ctx, { postId, ...focusOf(comment, parent) }));
  const aborted = () => ctx.signal.aborted;

  (async () => {
    if (client) {
      // Views get /site first (who you are, downvotes); this route works without one.
      if (!site.peek()) { await loadSite().catch(() => {}); if (aborted()) return; }
      const known = lookupAddress(original);
      if (known) { show(known.post, known.comment ?? null, known.parent ?? null); return; }
      if (lemmy && host === myHost) {
        if (lemmy[1] === 'post') { show(Number(lemmy[2])); return; }
        try {
          const c = await client.comment(Number(lemmy[2]), { signal: ctx.signal });
          rememberAddress(original, { post: c.postId, comment: c.id, parent: c.parentId ?? null });
          show(c.postId, c.id, c.parentId);
        } catch (e) {
          if (e.kind !== 'aborted') fill(box, errorBox(e));
        }
        return;
      }
      try {
        const r = await client.resolve(original);
        if (aborted()) return;
        if (r?.post) { rememberAddress(original, { post: r.post.id }); show(r.post.id); return; }
        if (r?.comment) {
          rememberAddress(original, { post: r.comment.postId, comment: r.comment.id, parent: r.comment.parentId ?? null });
          show(r.comment.postId, r.comment.id, r.comment.parentId);
          return;
        }
        if (r?.community) { navigate(href(`/c/${r.community.fullName}`), { replace: true }); return; }
        if (r?.person) { navigate(href(`/u/${r.person.fullName}`), { replace: true }); return; }
      } catch (e) {
        if (e.kind === 'aborted') return;
        // Not known there: read it from its own instance, below.
      }
    }
    if (aborted()) return;
    if (!lemmy) { notHere(box, route, host, original, client && (site.peek()?.host || myHost)); return; }
    const gc = guestClient(shareOriginal(host, '').replace(/\/$/, ''));
    let postId = Number(lemmy[2]);
    let focus = { focusId: null };
    if (lemmy[1] === 'comment') {
      try {
        const c = await gc.comment(postId, { signal: ctx.signal });
        postId = c.postId;
        focus = focusOf(c.id, c.parentId);
      } catch (e) {
        if (e.kind !== 'aborted') failed(box, e, host, original);
        return;
      }
    }
    if (aborted()) return;
    const guest = {
      client: gc,
      host,
      why: 'Open this on your own instance to vote',
      banner: banner(route, host, client && (site.peek()?.host || myHost)),
      postHref: (p) => shareRoute(p.apId) || route.hash,
      commentHref: (c) => shareRoute(c.apId) || route.hash,
    };
    // Fill, not replace: with nothing to wait for, this runs before the box is in the page.
    fill(box, postPage(route, ctx, { postId, ...focus, guest }));
  })();
  return box;
}

/** Why this is read only, and the way to the full page. */
function banner(route, host, myHost) {
  return h('div.infobar.guest-banner', { role: 'note' },
    h('strong', `Shown from ${host}, read only. `), ...nextStep(route, myHost));
}

function nextStep(route, myHost) {
  const back = route.hash;
  if (!myHost) return [h('a', { href: href('/instance', { return: back }) }, 'Choose your instance'), ' to vote and comment: Olemmy will open it there.'];
  if (!loggedIn.peek()) return [`${myHost} doesn't have this yet. `, h('a', { href: href('/login', { return: back }) }, 'Log in'), ` and ${myHost} can fetch it, so you can vote and comment.`];
  return [`${myHost} couldn't fetch this, so you can't vote or comment on it from there yet.`];
}

/** Not a Lemmy address, and your instance doesn't have it (or there's none chosen). */
function notHere(box, route, host, original, myHost) {
  setTitle('not found here yet');
  fill(box,
    h('h1', myHost ? 'Not found here yet' : 'Choose an instance to open this'),
    h('p', ...nextStep(route, myHost)),
    h('p', h('a', { href: original, rel: 'noopener noreferrer', target: '_blank' }, `Open it on ${host}`), ' instead.'));
}

function failed(box, e, host, original) {
  fill(box,
    h('h1', 'Couldn\'t open this'),
    errorBox(e),
    h('p', h('a', { href: original, rel: 'noopener noreferrer', target: '_blank' }, `Open it on ${host}`), ' instead.'));
}
