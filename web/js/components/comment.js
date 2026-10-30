// Nested comments: [–] collapse with child counts, inline reply / edit,
// "load more comments" for replies beyond the depth fetched, and
// "continue this thread" past the depth limit.

import { h } from '../core/h.js';
import { signal, effect, getOwner, runWithOwner } from '../core/signal.js';
import { commentState, updateComment } from '../state/entities.js';
import { voteComment, saveComment, report, requireLogin } from '../state/actions.js';
import { api, me } from '../state/session.js';
import { voteArrows } from './vote.js';
import { timeEl, userLink, mdBlock, postHref, commentHref } from './common.js';
import { editor, clearDraft } from './editor.js';
import { languageSelect, selectedLanguage } from './language-select.js';
import { ask, confirmAction } from './dialog.js';
import { toastError } from './toast.js';
import { moreMenu, share } from './post-row.js';
import { commentTree } from '../api/normalize.js';
import { runHook, passes } from '../features/registry.js';
import { relabel } from '../features/language-labels.js';
import { commentModHooks } from '../views/hooks.js';
import { plural, compact } from '../util/format.js';

/**
 * @typedef {{ postId: number, opId?: number, locked?: boolean, maxDepth: number, baseDepth?: number, flat?: boolean,
 *             context?: (c: any) => Node, isCollapsed?: (id: number) => boolean, setCollapsed?: (id: number, on: boolean) => void,
 *             guest?: { client: any, commentHref: (c: any) => string, postHref: (p: any) => string, why: string } }} ThreadCtx
 * [guest]: comments read from another instance (views/address.js): read only,
 * links to share addresses, more replies from [guest.client].
 */

/** Count every comment under [c] that's been loaded. */
function loadedDescendants(c) {
  let n = 0;
  for (const k of c.children) n += 1 + loadedDescendants(k);
  return n;
}

/**
 * One comment and its children.
 * @param {any} c  a comment with children (normalize.commentTree)
 * @param {ThreadCtx} ctx
 */
export function commentNode(c, ctx) {
  const s = commentState(c);
  const guest = ctx.guest;
  const depth = c.depth - (ctx.baseDepth || 0);
  const collapsed = signal(ctx.isCollapsed?.(c.id) ?? false);
  const replying = signal(false);
  const editing = signal(false);
  const mine = !guest && me.peek()?.person?.id === c.creator?.id;
  const shareIt = () => share(c, `Comment by ${c.creator?.name || 'someone'}`);
  const children = h('div.children', { role: 'group' });
  // Bumped when replies are loaded or added, for the counts that depend on them.
  const loaded = signal(0);
  const total = () => { loaded.value; return Math.max(s.childCount.value, loadedDescendants(c)); };

  const toggle = () => {
    collapsed.value = !collapsed.value;
    ctx.setCollapsed?.(c.id, collapsed.value);
  };

  const body = () => {
    if (s.deleted.value) return h('div.md.usertext-body.gone', h('p', '[deleted by the author]'));
    if (s.removed.value) return h('div.md.usertext-body.gone', h('p', '[removed by a moderator]'));
    if (editing.value) return editForm(c, s, editing);
    return mdBlock(s.content.value, 'usertext-body');
  };

  const node = h('div.comment.thing', {
    id: `c${c.id}`,
    tabIndex: -1,
    role: 'treeitem',
    'aria-expanded': () => String(!collapsed.value),
    dataset: { id: c.id, kind: 'comment', depth, author: c.creator?.fullName },
    class: {
      collapsed: () => collapsed.value,
      'by-op': ctx.opId != null && c.creator?.id === ctx.opId,
      mine,
      distinguished: () => s.distinguished.value,
      [`depth-${depth % 6}`]: true,
      saved: () => s.saved.value,
      removed: () => s.removed.value,
    },
  },
  ctx.context && ctx.context(c),
  h('div.comment-inner',
    voteArrows(s, (dir) => voteComment(c, dir), { label: 'comment', layout: 'stacked', disabled: guest?.why }),
    h('div.entry',
      h('p.tagline',
        h('button.expand', {
          type: 'button',
          onclick: toggle,
          'aria-label': () => (collapsed.value ? 'Expand comment' : 'Collapse comment'),
          title: () => (collapsed.value ? 'Expand' : 'Collapse'),
        }, () => (collapsed.value ? '[+]' : '[–]')),
        ' ',
        userLink(c.creator, { op: ctx.opId != null && c.creator?.id === ctx.opId, mod: c.creatorIsMod, admin: c.creatorIsAdmin }),
        ' ',
        h('span.score', { title: () => `${compact(s.upvotes.value)} up, ${compact(s.downvotes.value)} down` }, () => plural(s.score.value, 'point')),
        ' ',
        timeEl(c.published),
        c.updated && h('span.edited', { title: 'edited' }, '*'),
        () => (collapsed.value && total() ? h('span.child-count', ` (${plural(total(), 'child', 'children')})`) : null)),
      h('div.comment-body', { hidden: () => collapsed.value }, body),
      h('ul.flat-list.buttons', { hidden: () => collapsed.value },
        h('li.first', h('a.permalink', { href: guest ? guest.commentHref(c) : commentHref(c) }, 'permalink')),
        c.parentId != null && h('li', h('a.parent-link', { href: `#c${c.parentId}`, dataset: { parent: c.parentId }, onclick: (e) => jumpToParent(e, c, ctx) }, 'parent')),
        // On phones, share and report move into "more" (as on posts), where there is one.
        h(guest || mine ? 'li' : 'li.secondary', h('button.link-button.share-button', { type: 'button', onclick: shareIt }, 'share')),
        !guest && [h('li', h('button.link-button.save-button', { type: 'button', onclick: () => saveComment(c) }, () => (s.saved.value ? 'unsave' : 'save'))),
        !ctx.locked && h('li', h('button.link-button.reply-button', {
          type: 'button',
          onclick: () => { if (requireLogin('Log in to reply')) replying.value = !replying.value; },
        }, 'reply')),
        mine && [
          h('li', h('button.link-button', { type: 'button', onclick: () => { editing.value = true; } }, 'edit')),
          h('li', h('button.link-button', { type: 'button', onclick: () => deleteComment(c, s) }, () => (s.deleted.value ? 'restore' : 'delete'))),
        ],
        !mine && h('li.secondary', h('button.link-button', { type: 'button', onclick: () => reportComment(c) }, 'report')),
        commentModHooks.map((fn) => fn(c, ctx)),
        !mine && h('li.more', moreMenu(c, 'comment', {
          compact: [
            h('li.compact-only', h('button.link-button', { type: 'button', onclick: shareIt }, 'share')),
            h('li.compact-only', h('button.link-button', { type: 'button', onclick: () => reportComment(c) }, 'report')),
          ],
        }))]),
      () => (replying.value ? replyForm(c.postId, c.id, { ...ctx, languageId: c.languageId || ctx.postLanguageId }, (created) => {
        replying.value = false;
        const fresh = { ...created, children: [] };
        c.children.unshift(fresh);
        children.prepend(commentNode(fresh, ctx));
        s.childCount.value++;
        loaded.value++;
      }, () => { replying.value = false; }) : null))),
  children,
  () => (collapsed.value || ctx.flat ? null : moreLink(c, ctx, children, loaded)));

  // For replies loaded later (post.js morePages): they join this comment's children.
  node.olemmyComment = c;
  // Children stay in the DOM when collapsed (cheap to reopen), just hidden.
  effect(() => { children.hidden = collapsed.value; });
  queueChildren(c.children, ctx, children, getOwner());
  runHook('onCommentRender', node, c, ctx);
  return node;
}

/** Render [list] into [container], in chunks so huge threads stay responsive. */
function queueChildren(list, ctx, container, owner) {
  const visible = list.filter((k) => passes('filterComment', k));
  for (const k of visible) container.append(runWithOwner(owner, () => commentNode(k, ctx)));
}

/**
 * "load more comments (N replies)" when the instance has replies not yet
 * loaded; "continue this thread" past the depth limit.
 */
function moreLink(c, ctx, children, loaded) {
  loaded.value;
  const missing = commentState(c).childCount.value - loadedDescendants(c);
  if (missing <= 0) return null;
  const depth = c.depth - (ctx.baseDepth || 0);
  if (depth + 1 >= ctx.maxDepth && !c.children.length) {
    return h('div.more-comments', h('a', { href: ctx.guest ? ctx.guest.commentHref(c) : commentHref(c) }, 'continue this thread →'));
  }
  const owner = getOwner();
  const loading = signal(false);
  return h('div.more-comments', h('button.link-button', {
    type: 'button',
    disabled: () => loading.value,
    onclick: async () => {
      loading.value = true;
      try {
        const list = await (ctx.guest?.client || api.peek()).comments({ postId: c.postId, parentId: c.id, sort: ctx.sort || 'Hot', maxDepth: 8 });
        const known = new Set();
        const walk = (n) => { known.add(n.id); n.children.forEach(walk); };
        walk(c);
        const fresh = list.filter((x) => !known.has(x.id));
        // Attach the new comments to their parents in this subtree.
        const byId = new Map();
        const index = (n) => { byId.set(n.id, n); n.children.forEach(index); };
        index(c);
        const roots = commentTree(fresh);
        for (const r of roots) {
          const parent = byId.get(r.parentId);
          if (!parent) continue;
          parent.children.push(r);
          const container = parent === c ? children : document.querySelector(`#c${parent.id} > .children`);
          container?.append(runWithOwner(owner, () => commentNode(r, ctx)));
        }
        // Whatever the count says, nothing more is there to load.
        if (!fresh.length) commentState(c).childCount.value = loadedDescendants(c);
        loaded.value++;
      } catch (e) { toastError(e); } finally { loading.value = false; }
    },
  }, () => (loading.value ? 'loading…' : `load more comments (${plural(missing, 'reply', 'replies')})`)));
}

function jumpToParent(e, c, ctx) {
  const target = document.getElementById(`c${c.parentId}`);
  e.preventDefault();
  if (!target) {
    if (ctx.guest) return;  // its address there isn't known here
    location.hash = postHref(c.postId, c.parentId).slice(1);
    return;
  }
  target.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  target.focus({ preventScroll: true });
  target.classList.add('flash');
  setTimeout(() => target.classList.remove('flash'), 1500);
}

/** The language picker beside a form's buttons. */
function languageField(selected) {
  const select = languageSelect({ selected, cls: 'reply-language' });
  return { select, el: h('label.reply-language-field', { title: 'The language you\'re writing in' }, 'language ', select) };
}

/**
 * A reply box under a post ([parentId] null) or a comment. Its language starts
 * as ctx.languageId (the parent comment's), else ctx.postLanguageId.
 */
export function replyForm(postId, parentId, ctx, onCreated, onCancel) {
  const key = `reply:${postId}:${parentId || 0}`;
  const ed = editor({ draftKey: key, placeholder: 'What are your thoughts?', label: 'Reply', rows: parentId ? 4 : 5 });
  const lang = languageField(ctx.languageId || ctx.postLanguageId || 0);
  const busy = signal(false);
  const form = h('form.reply-form', {
    onsubmit: async (e) => {
      e.preventDefault();
      const text = ed.value().trim();
      if (!text) return;
      busy.value = true;
      try {
        const created = await api.peek().createComment(postId, text, parentId, selectedLanguage(lang.select));
        runHook('onVote', created.creator, 0, created.myVote);
        clearDraft(key);
        ed.clear();
        onCreated(created);
      } catch (err) { toastError(err); } finally { busy.value = false; }
    },
  },
  ed.el,
  h('div.form-buttons',
    h('button.btn.btn-primary', { type: 'submit', disabled: () => busy.value }, () => (busy.value ? 'saving…' : 'save')),
    onCancel && h('button.btn', { type: 'button', onclick: onCancel }, 'cancel'),
    lang.el));
  requestAnimationFrame(() => { if (parentId) ed.focus(); });
  return form;
}

function editForm(c, s, editing) {
  const ed = editor({ draftKey: `edit:${c.id}`, initial: s.content.peek(), label: 'Edit comment' });
  const lang = languageField(c.languageId);
  const busy = signal(false);
  requestAnimationFrame(() => ed.focus());
  return h('form.reply-form', {
    onsubmit: async (e) => {
      e.preventDefault();
      busy.value = true;
      try {
        const updated = await api.peek().editComment(c.id, ed.value(), selectedLanguage(lang.select));
        updateComment(updated);
        if (updated.languageId !== c.languageId) {
          c.languageId = updated.languageId;
          const node = document.getElementById(`c${c.id}`);
          if (node) relabel(node, c);
        }
        clearDraft(`edit:${c.id}`);
        editing.value = false;
      } catch (err) { toastError(err); } finally { busy.value = false; }
    },
  },
  ed.el,
  h('div.form-buttons',
    h('button.btn.btn-primary', { type: 'submit', disabled: () => busy.value }, 'save'),
    h('button.btn', { type: 'button', onclick: () => { clearDraft(`edit:${c.id}`); editing.value = false; } }, 'cancel'),
    lang.el));
}

async function deleteComment(c, s) {
  const deleting = !s.deleted.peek();
  if (deleting && !await confirmAction('Delete this comment?', '', 'Delete')) return;
  try {
    updateComment(await api.peek().deleteComment(c.id, deleting));
  } catch (e) { toastError(e); }
}

async function reportComment(c) {
  if (!requireLogin('Log in to report')) return;
  const reason = await ask('Report comment', { label: 'Why are you reporting this comment?', submit: 'Report' });
  if (reason) report('comment', c, reason);
}

/**
 * A whole comment forest; roots rendered a chunk at a time, so the first
 * screenful appears at once and the rest follows without blocking.
 */
export function commentForest(roots, ctx) {
  const area = h('div.comment-tree', { role: 'tree', 'aria-label': 'Comments' });
  const owner = getOwner();
  const list = roots.filter((c) => passes('filterComment', c));
  let i = 0;
  const CHUNK = 15;
  const step = () => {
    const end = Math.min(list.length, i + CHUNK);
    for (; i < end; i++) area.append(runWithOwner(owner, () => commentNode(list[i], ctx)));
    if (i < list.length) (window.requestIdleCallback || requestAnimationFrame)(step);
    // Later, not now: a small forest is done before its caller has put it in the page.
    else queueMicrotask(() => area.dispatchEvent(new CustomEvent('comments-rendered', { bubbles: true })));
  };
  step();
  return area;
}
