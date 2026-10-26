// Comment collapse memory: which comments you collapsed, per thread, kept
// across visits (olemmy:collapsed, the most recent 300 threads). Also the
// "collapse all child comments" toggle on a post's page.

import { h } from '../core/h.js';
import { signal } from '../core/signal.js';
import { persisted } from '../core/store.js';
import { defineFeature, enabled } from './registry.js';

const MAX_THREADS = 300;
const collapsed = persisted('collapsed', { version: 1, defaults: {} });

export function isCollapsed(postId, commentId) {
  if (!enabled('commentCollapse')) return false;
  return (collapsed.peek()[postId] || []).includes(commentId);
}

export function setCollapsed(postId, commentId, on) {
  if (!enabled('commentCollapse')) return;
  collapsed.update((all) => {
    const ids = new Set(all[postId] || []);
    if (on) ids.add(commentId); else ids.delete(commentId);
    const next = { ...all };
    delete next[postId];
    if (ids.size) next[postId] = [...ids];
    const keys = Object.keys(next);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_THREADS))) delete next[k];
    return next;
  });
}

/**
 * "collapse all child comments": collapses every top-level comment's
 * children by clicking each reply's [–]; again to expand.
 */
export function collapseAllButton(getArea) {
  const on = signal(false);
  return h('button.btn.btn-small.collapse-all', {
    type: 'button',
    'aria-pressed': () => String(on.value),
    onclick: () => {
      on.value = !on.value;
      const area = getArea();
      for (const top of area.querySelectorAll(':scope > .comment')) {
        for (const child of top.querySelectorAll(':scope > .children > .comment')) {
          if (child.classList.contains('collapsed') !== on.peek()) child.querySelector(':scope > .comment-inner .expand')?.click();
        }
      }
    },
  }, () => (on.value ? 'expand all child comments' : 'collapse all child comments'));
}

export default defineFeature({
  id: 'commentCollapse',
  name: 'Remember collapsed comments',
  category: 'Comments',
  description: 'Comments you collapse stay collapsed when you come back to the thread.',
  keywords: 'collapse hide children thread',
});
