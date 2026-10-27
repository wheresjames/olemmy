// Never-ending scroll: the next page loads as you near the bottom, with a
// "page N" separator between pages. Off: classic prev/next pagination.
// The listing view does the loading; this decides when.

import { h } from '../core/h.js';
import { defineFeature, enabled, option } from './registry.js';

export const nerEnabled = () => enabled('neverEndingScroll');

/** Pages in a row that add nothing visible before auto-loading pauses. */
const MAX_EMPTY = 5;

/**
 * Watch [sentinel]; call [load] when it comes near the viewport.
 * After [pauseAfter] automatic pages, waits for a click (so the footer stays reachable).
 * Returns { stop, resume }; resume re-arms it after a failed load is retried.
 */
export function watchSentinel(sentinel, load) {
  let auto = 0;
  let empty = 0;
  const pauseAfter = option('neverEndingScroll', 'pauseAfter') || 0;
  const io = new IntersectionObserver(async (entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    if (pauseAfter && auto >= pauseAfter) return;
    auto++;
    io.unobserve(sentinel);
    const before = sentinel.offsetTop;
    const more = await load();
    // Pages that add nothing visible (filters, "videos") leave the sentinel in
    // view; after a few, wait for "load more" instead of paging to the end.
    empty = sentinel.offsetTop - before < 50 ? empty + 1 : 0;
    if (more && empty < MAX_EMPTY) io.observe(sentinel);
  }, { rootMargin: '0px 0px 800px 0px' });
  io.observe(sentinel);
  return {
    stop: () => io.disconnect(),
    resume: () => { empty = 0; io.unobserve(sentinel); io.observe(sentinel); },
  };
}

export function pageSeparator(n) {
  return h('div.ner-separator', { role: 'separator', dataset: { page: n } }, h('span', `page ${n}`));
}

export default defineFeature({
  id: 'neverEndingScroll',
  name: 'Never-ending scroll',
  category: 'Browsing',
  description: 'Load the next page of posts automatically as you scroll down, with a separator between pages. Off: classic next/prev buttons.',
  keywords: 'infinite scroll pagination endless',
  options: {
    pauseAfter: { type: 'number', default: 0, min: 0, max: 50, label: 'Pause after this many pages (0 = never)', description: 'Then a "load more" button appears, so the footer can be reached.' },
  },
});
