// Saved searches' store and UI (features/saved-searches.js), loaded with
// the search page.

import { h } from '../../core/h.js';
import { persisted } from '../../core/store.js';
import { href } from '../../core/router.js';
import { enabled } from '../registry.js';
import { toast } from '../../components/toast.js';

const MAX = 50;
export const searches = persisted('searches', { version: 1, defaults: { list: [] } });

const keyOf = (s) => JSON.stringify([s.q, s.type, s.community || '', s.sort]);
const label = (s) => `${s.q}${s.type && s.type !== 'Posts' ? ` (${s.type.toLowerCase()})` : ''}${s.community ? ` in ${s.community}` : ''}`;

export function isSaved(s) { return searches.value.list.some((x) => keyOf(x) === keyOf(s)); }

export function toggleSaved(s) {
  const list = searches.peek().list;
  if (list.some((x) => keyOf(x) === keyOf(s))) {
    searches.set({ list: list.filter((x) => keyOf(x) !== keyOf(s)) });
  } else {
    searches.set({ list: [{ ...s, time: Date.now() }, ...list].slice(0, MAX) });
    toast(`Saved the search "${label(s)}"`);
  }
}

/** "save this search" for the search page. */
export function saveButton(s) {
  return () => (enabled('savedSearches') && s.q
    ? h('button.btn.btn-small.save-search', { type: 'button', 'aria-pressed': String(isSaved(s)), onclick: () => toggleSaved(s) },
      isSaved(s) ? '★ saved' : '☆ save this search')
    : null);
}

/** The sidebar list of saved searches. */
export function savedSearchesBox() {
  return () => {
    if (!enabled('savedSearches')) return null;
    const list = searches.value.list;
    return h('div.side-box.saved-searches',
      h('h2', 'saved searches'),
      list.length
        ? h('ul', list.map((s) => h('li',
          h('a', { href: href('/search', { q: s.q, type: s.type, community: s.community, sort: s.sort }) }, label(s)), ' ',
          h('button.link-button.small', { type: 'button', 'aria-label': `Forget ${label(s)}`, onclick: () => toggleSaved(s) }, '×'))))
        : h('p.small', 'None yet. Search, then "save this search".'));
  };
}

