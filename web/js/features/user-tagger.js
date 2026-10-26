// User tagger: give a user a label and a color, shown beside their
// name everywhere; and vote weight, the sum of your votes on their posts
// and comments ([+3]). Stored in olemmy:tags by full name (name@host).

import { h, icon, dynamic, later } from '../core/h.js';
import { persisted } from '../core/store.js';
import { defineFeature, enabled, option } from './registry.js';

export const tags = persisted('tags', { version: 1, defaults: {} });

/** Black or white, whichever reads better on [bg] (#rrggbb). */
export function contrastText(bg) {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg || '');
  if (!m) return '#000';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? '#000' : '#fff';
}

export function tagOf(fullName) { return tags.value[fullName] || null; }

export function setTag(fullName, patch) {
  tags.update((all) => {
    const next = { ...all, [fullName]: { ...(all[fullName] || {}), ...patch } };
    const t = next[fullName];
    if (!t.tag && !t.votes) delete next[fullName];
    return next;
  });
}

/** The tag editor (impl/tag-editor.js, loaded when first used). */
export async function editTag(person) {
  (await import('./impl/tag-editor.js')).editTag(person);
}

/** The tag badge, vote weight and tag button for [person], live. */
export function tagBadge(person) {
  return dynamic(() => {
    if (!enabled('userTagger') || !person) return null;
    const t = tags.value[person.fullName];
    const parts = [];
    if (t?.tag) {
      parts.push(h('button.user-tag', {
        type: 'button', title: `Your tag for ${person.fullName}. Click to edit`,
        style: { '--tag-bg': t.color || '#3498db', '--tag-fg': contrastText(t.color || '#3498db') },
        onclick: () => editTag(person),
      }, t.tag));
    } else {
      parts.push(h('button.tag-button', { type: 'button', title: `Tag ${person.fullName}`, 'aria-label': `Tag ${person.fullName}`, onclick: () => editTag(person) }, icon('tag')));
    }
    if (t?.votes && option('userTagger', 'voteWeight')) {
      parts.push(h('span.vote-weight', { title: 'Your votes on this user, added up', class: { up: t.votes > 0, down: t.votes < 0 } }, `[${t.votes > 0 ? '+' : ''}${t.votes}]`));
    }
    return parts;
  });
}

/** Put a badge after the author link in [node]'s own tagline (not its replies'). */
function decorate(node, item, own) {
  const wrap = node.querySelector(own);
  if (wrap && item.creator) wrap.append(tagBadge(item.creator));
}

export default defineFeature({
  id: 'userTagger',
  name: 'User tagger',
  category: 'Users',
  description: 'Tag users with a label and a color that show beside their name everywhere. Vote weight adds up your votes on each user.',
  keywords: 'tag label note color vote weight',
  options: {
    voteWeight: { type: 'boolean', default: true, label: 'Show vote weight ([+3]) beside names' },
    list: { type: 'custom', default: null, label: 'Tagged users', render: () => later(() => import('./impl/tag-list.js').then((m) => m.tagList())) },
  },
  onPostRender(node, post) { decorate(node, post, '.tagline .author-wrap'); },
  onCommentRender(node, comment) { decorate(node, comment, ':scope > .comment-inner .tagline .author-wrap'); },
  onVote(person, before, after) {
    if (!person || before === after) return;
    const t = tagOf(person.fullName) || {};
    setTag(person.fullName, { votes: (t.votes || 0) - before + after });
  },
});
