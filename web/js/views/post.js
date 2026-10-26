// A post and its comments: #/post/:id, a single comment's thread at
// #/post/:id/comment/:cid, and #/comment/:cid (which finds its post).
// views/address.js shows a post read from another instance with postPage's
// guest mode: read only, nothing remembered against this instance's ids.

import { h, add, fill } from '../core/h.js';
import { signal } from '../core/signal.js';
import { href, navigate, restoreScroll } from '../core/router.js';
import { api, loggedIn } from '../state/session.js';
import { settings, setSettings } from '../state/settings.js';
import { postState } from '../state/entities.js';
import { markPostRead } from '../state/actions.js';
import { postRow } from '../components/post-row.js';
import { commentForest, replyForm, commentNode } from '../components/comment.js';
import { navSelect } from '../components/tab-menu.js';
import { searchBox, submitButtons, communityBox } from '../components/sidebar.js';
import { spinner, errorBox, setTitle, postHref, communityHref, communityLink, timeEl, mdBlock } from '../components/common.js';
import { commentTree } from '../api/normalize.js';
import { recordVisit, setHighlightSince } from '../features/new-comments.js';
import { isCollapsed, setCollapsed, collapseAllButton } from '../features/comment-collapse.js';
import { enabled } from '../features/registry.js';
import { plural } from '../util/format.js';
import { toastError } from '../components/toast.js';
import { COMMENT_SORTS } from '../api/v3.js';

const MAX_DEPTH = 8;

/** #/comment/:cid: look up the comment's post, then show its thread. */
export function commentRedirectView(route, ctx) {
  api.peek().comment(Number(route.params.id), { signal: ctx.signal })
    .then((c) => navigate(postHref(c.postId, c.id), { replace: true }))
    .catch((e) => { if (e.kind !== 'aborted') box.replaceWith(errorBox(e)); });
  const box = spinner('Finding the comment…');
  return box;
}

export function postView(route, ctx) {
  return postPage(route, ctx, {
    postId: Number(route.params.id),
    focusId: route.params.cid ? Number(route.params.cid) : null,
  });
}

/**
 * @param {{ postId: number, focusId: number|null, highlightId?: number|null,
 *           guest?: { client: any, host: string, banner: Node, postHref: (p: any) => string, commentHref: (c: any) => string, why: string } }} o
 *   [focusId]: show that comment's thread; [highlightId]: the comment to mark
 *   in it (the focused one unless given: a parent's thread, for "context").
 */
export function postPage(route, ctx, { postId, focusId, highlightId = null, guest = null }) {
  const { chrome } = ctx;
  const client = guest?.client || api.peek();
  const sort = route.query.get('sort') || settings.peek().commentSort || 'Hot';
  const page = h(guest ? 'div.post-page.guest-page' : 'div.post-page');
  const side = h('div.side', searchBox(), spinner());
  chrome.sidebar.value = side;
  chrome.tabs.value = null;
  page.append(spinner('Loading post…'));

  (async () => {
    let data;
    try {
      data = await client.post(postId, { signal: ctx.signal });
    } catch (e) {
      if (e.kind !== 'aborted') page.replaceChildren(errorBox(e, () => navigate(route.hash, { replace: true })));
      side.lastChild?.remove();
      return;
    }
    const { post, community, moderators, crossPosts } = data;
    const s = postState(post);
    setTitle(post.title, community && `!${community.fullName}`);
    chrome.pageName.value = community ? { text: community.name, href: communityHref(community) } : null;
    if (guest) {
      fill(side, searchBox(), community && guestCommunityBox(community, guest.host));
    } else {
      fill(side, searchBox(community), submitButtons(community), community && communityBox(community, moderators));
      const previous = recordVisit(post.id, post.comments);
      setHighlightSince(enabled('newComments') && previous ? previous.time : 0);
      markPostRead(post);
    }

    const row = postRow(post, { onPostPage: true, expanded: true, showCommunity: true, guest });
    const area = h('div.commentarea');
    fill(page,
      guest?.banner,
      h('div.post-header', row),
      !guest && crossPosts.length > 0 && otherDiscussions(crossPosts),
      area);

    // --- comment area -----------------------------------------------------
    const tree = h('div.comments-holder', spinner('Loading comments…'));
    const locked = () => s.locked.value;
    const threadCtx = {
      postId: post.id,
      opId: post.creator?.id,
      locked: post.locked,
      sort,
      maxDepth: MAX_DEPTH,
      baseDepth: 0,
      isCollapsed: guest ? undefined : (id) => isCollapsed(post.id, id),
      setCollapsed: guest ? undefined : (id, on) => setCollapsed(post.id, id, on),
      guest,
    };

    add(area,
      h('div.panestack-title',
        h('span.title', () => (focusId ? 'single comment thread' : `all ${plural(s.comments.value, 'comment')}`)),
        navSelect('sorted by', COMMENT_SORTS.map((x) => [x, x.toLowerCase(), href(route.path, { sort: x })]), sort),
        h('span.remember-sort', h('button.link-button.small', {
          type: 'button',
          title: 'Use this sort for every thread',
          onclick: () => setSettings({ commentSort: sort }),
          hidden: () => settings.value.commentSort === sort,
        }, 'make default')),
        collapseAllButton(() => tree.querySelector('.comment-tree') || tree)),
      focusId
        ? h('div.infobar', 'you are viewing a single comment\'s thread. ',
          h('a', { href: guest ? guest.postHref(post) : postHref(post) }, 'view the rest of the comments →'))
        : () => {
          if (guest) return null;
          if (locked()) return h('div.infobar.locked', 'This post is locked. You won\'t be able to comment.');
          if (!loggedIn.value) return h('div.infobar', h('a', { href: href('/login', { return: route.hash }) }, 'Log in'), ' to comment.');
          return replyForm(post.id, null, threadCtx, (created) => {
            const holder = tree.querySelector('.comment-tree') || tree;
            holder.prepend(commentNode({ ...created, children: [] }, threadCtx));
            s.comments.value++;
          });
        },
      tree);

    let nextComments = null;
    try {
      let list;
      if (focusId) {
        list = await client.comments({ postId: post.id, parentId: focusId, sort, maxDepth: MAX_DEPTH }, { signal: ctx.signal });
        const focus = list.find((c) => c.id === focusId);
        threadCtx.baseDepth = focus ? focus.depth : 0;
      } else {
        const page = await client.commentPage({ postId: post.id, sort, maxDepth: MAX_DEPTH }, { signal: ctx.signal });
        list = page.comments;
        nextComments = page.next;
      }
      const roots = commentTree(list);
      tree.replaceChildren(roots.length ? commentForest(roots, threadCtx) : h('p.empty', 'No comments yet.'));
      if (!focusId && nextComments) tree.append(morePages(client, post, sort, threadCtx, tree, nextComments));
      if (focusId) {
        const target = () => document.getElementById(`c${highlightId ?? focusId}`);
        tree.addEventListener('comments-rendered', () => target()?.classList.add('highlighted'), { once: true });
      }
      restoreScroll(route);
    } catch (e) {
      if (e.kind !== 'aborted') tree.replaceChildren(errorBox(e));
    }
  })();
  return page;
}

/** Lemmy caps one answer at about 300 comments: page through the rest. */
function morePages(client, post, sort, threadCtx, tree, first) {
  let next = first;
  const busy = signal(false);
  const button = h('div.more-comments.more-top', h('button.btn', {
    type: 'button',
    disabled: () => busy.value,
    onclick: async () => {
      busy.value = true;
      try {
        const page = await client.commentPage({ postId: post.id, sort, maxDepth: MAX_DEPTH, cursor: next });
        const list = page.comments;
        next = page.next;
        const known = new Set([...tree.querySelectorAll('.comment')].map((el) => Number(el.dataset.id)));
        // Replies to comments already shown go under them, not at the top.
        for (const r of commentTree(list.filter((c) => !known.has(c.id)))) {
          const parent = r.parentId != null && tree.querySelector(`#c${r.parentId}`);
          parent?.olemmyComment?.children.push(r);
          (parent?.querySelector(':scope > .children') || tree.querySelector('.comment-tree'))?.append(commentNode(r, threadCtx));
        }
        if (!next) button.remove();
      } catch (e) { toastError(e, 'Couldn\'t load more comments'); } finally { busy.value = false; }
    },
  }, () => (busy.value ? 'loading…' : 'load more comments')));
  return button;
}

/** The community, read only: its actions would need this instance's ids. */
function guestCommunityBox(community, host) {
  return h('div.side-box.community-box',
    community.banner && h('img.side-banner', { src: community.banner, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }),
    h('h2.side-title', h('a', { href: communityHref(community) }, community.title)),
    h('p.side-name', `!${community.fullName}`),
    h('p.small', `Shown from ${host}.`),
    community.description && mdBlock(community.description, 'side-md'));
}

function otherDiscussions(crossPosts) {
  return h('details.other-discussions',
    h('summary', `other discussions (${crossPosts.length})`),
    h('ul', crossPosts.map((p) => h('li',
      h('a', { href: postHref(p) }, plural(p.comments, 'comment')), ' in ', communityLink(p.community), ' · ',
      plural(p.score, 'point'), ' · ', timeEl(p.published)))));
}

