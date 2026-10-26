// Every user you've tagged or voted on, for the user tagger's settings
// (features/user-tagger.js): their tag, vote weight, and edit / remove.
// Tagged users first (by name), then the rest by vote weight.

import { h } from '../../core/h.js';
import { signal } from '../../core/signal.js';
import { href } from '../../core/router.js';
import { tags, setTag, contrastText, editTag } from '../user-tagger.js';

/** More than this many rows: the filter finds the others. */
const SHOWN = 200;

const weight = (v) => `[${v > 0 ? '+' : ''}${v}]`;

function row(name, t) {
  return h('li.tag-row', { dataset: { user: name } },
    t.tag
      ? h('span.user-tag', { style: { '--tag-bg': t.color || '#3498db', '--tag-fg': contrastText(t.color || '#3498db') } }, t.tag)
      : h('span.tag-none', 'no tag'),
    h('a.tag-user', { href: href(`/u/${name}`) }, name),
    t.votes ? h('span.vote-weight', { class: { up: t.votes > 0, down: t.votes < 0 }, title: 'Your votes on this user, added up' }, weight(t.votes)) : null,
    h('span.tag-row-actions',
      h('button.link-button', { type: 'button', 'aria-label': `Edit the tag for ${name}`, onclick: () => editTag({ fullName: name }) }, t.tag ? 'edit' : 'tag'),
      h('button.link-button.tag-remove', {
        type: 'button',
        'aria-label': t.tag ? `Remove the tag for ${name}` : `Reset the vote weight for ${name}`,
        title: t.tag ? 'Remove the tag' : 'Reset the vote weight',
        onclick: () => setTag(name, t.tag ? { tag: '', color: '' } : { votes: 0 }),
      }, '×')));
}

export function tagList() {
  const query = signal('');
  const filter = h('input.tag-filter', {
    type: 'search',
    placeholder: 'filter by name or tag',
    'aria-label': 'Filter tagged users',
    oninput: (e) => { query.value = e.target.value.trim().toLowerCase(); },
  });
  return h('div.tag-list', filter, () => {
    const all = Object.entries(tags.value).filter(([, t]) => t && (t.tag || t.votes));
    if (!all.length) return h('p.small', 'No tagged users yet. Use the tag icon beside a name, or the tag button on a user\'s info card.');
    const tagged = all.filter(([, t]) => t.tag).length;
    const q = query.value;
    const rows = all
      .filter(([name, t]) => !q || name.toLowerCase().includes(q) || (t.tag || '').toLowerCase().includes(q))
      .sort(([an, a], [bn, b]) => (!!b.tag - !!a.tag) || (a.tag ? an.localeCompare(bn) : (b.votes || 0) - (a.votes || 0) || an.localeCompare(bn)));
    return [
      h('p.small.tag-count', `${tagged} tagged, ${all.length - tagged} with only a vote weight`,
        rows.length > SHOWN ? `; showing ${SHOWN} of ${rows.length}, filter to find the rest` : ''),
      rows.length ? h('ul.tag-rows', rows.slice(0, SHOWN).map(([name, t]) => row(name, t))) : h('p.small', 'No one matches.'),
    ];
  });
}
