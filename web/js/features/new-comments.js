// New comment highlighting: remembers when you last opened each thread and
// how many comments it had (olemmy:seen, the most recent 5000 threads).
// Comments newer than your last visit are highlighted, and listings show
// "(N new)" beside the comment count.

import { h } from '../core/h.js';
import { persisted } from '../core/store.js';
import { defineFeature, option } from './registry.js';
import { parseTime } from '../util/format.js';

const MAX_THREADS = 5000;
const seen = persisted('seen', { version: 1, defaults: {} });

/** What's remembered about thread [postId]: { time, count } or null. */
export function lastVisit(postId) { return seen.peek()[postId] || null; }

/**
 * Record a visit to [postId] with [count] comments. Returns the previous
 * visit, which is what this visit highlights against.
 */
export function recordVisit(postId, count) {
  const previous = lastVisit(postId);
  seen.update((all) => {
    const next = { ...all };
    delete next[postId];
    next[postId] = { time: Date.now(), count };
    const keys = Object.keys(next);
    if (keys.length > MAX_THREADS) for (const k of keys.slice(0, keys.length - MAX_THREADS)) delete next[k];
    return next;
  });
  return previous;
}

/** Highlight threshold for the current post page. */
let since = 0;
export function setHighlightSince(time) { since = time || 0; }

export default defineFeature({
  id: 'newComments',
  name: 'New comment highlighting',
  category: 'Comments',
  description: 'Highlights comments posted since your last visit to a thread, and shows "(N new)" in listings.',
  keywords: 'unread new comments count',
  options: {
    expireDays: { type: 'number', default: 7, min: 1, max: 365, label: 'Forget visits after this many days' },
  },
  onPostRender(node, post, ctx) {
    if (ctx.onPostPage) return;
    const v = lastVisit(post.id);
    if (!v || Date.now() - v.time > option('newComments', 'expireDays') * 86400000) return;
    const fresh = post.comments - v.count;
    if (fresh > 0) node.querySelector('a.comments')?.after(h('span.newComments', ` (${fresh} new)`));
  },
  onCommentRender(node, comment) {
    if (since && parseTime(comment.published) > since) node.classList.add('new-comment');
  },
});
