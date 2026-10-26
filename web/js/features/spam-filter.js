// Spam and troll heuristics (Tier 3): mark posts and comments from
// accounts younger than a few days, and optionally hide them. In this
// browser only; Lemmy's own blocks are on the account.

import { h } from '../core/h.js';
import { defineFeature, option } from './registry.js';
import { parseTime, age } from '../util/format.js';

const DAY = 86400000;

function young(person) {
  const days = Number(option('spamFilter', 'days')) || 0;
  if (!person || !days) return false;
  return Date.now() - parseTime(person.published) < days * DAY;
}

function mark(node, item, selector) {
  if (!young(item.creator)) return;
  node.querySelector(selector)?.append(h('span.userattr.new-account', { title: `Account created ${age(item.creator.published)} ago` }, 'new'));
}

export default defineFeature({
  id: 'spamFilter',
  name: 'New account warnings',
  category: 'Filtering',
  description: 'Marks posts and comments from accounts younger than a few days, a common sign of spam, and can hide them.',
  defaultEnabled: true,
  keywords: 'spam troll new account age young bot',
  options: {
    days: { type: 'number', default: 3, min: 0, max: 365, label: 'Accounts younger than this many days count as new (0 = off)' },
    hide: { type: 'boolean', default: false, label: 'Hide their posts and comments instead of marking them' },
  },
  filterPost: (post) => !(option('spamFilter', 'hide') && young(post.creator)),
  filterComment: (comment) => !(option('spamFilter', 'hide') && young(comment.creator)),
  onPostRender(node, post) { mark(node, post, '.tagline .author-wrap'); },
  onCommentRender(node, comment) { mark(node, comment, ':scope > .comment-inner .tagline .author-wrap'); },
});
