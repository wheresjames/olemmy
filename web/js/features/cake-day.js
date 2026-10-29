// A cake beside a user's name on the anniversary of their account, from the
// account's creation date that comes with every post and comment.

import { h } from '../core/h.js';
import { cakeDayText, isCakeDay } from '../util/format.js';
import { defineFeature } from './registry.js';

function decorate(node, item, own) {
  const wrap = node.querySelector(own);
  const p = item.creator;
  if (!wrap || !p || !isCakeDay(p.published)) return;
  wrap.querySelector(':scope > .author')?.after(
    h('span.cake-day', { title: `Cake day: ${cakeDayText(p.published)}`, role: 'img', 'aria-label': 'Cake day' }, '🎂'));
}

export default defineFeature({
  id: 'cakeDay',
  name: 'Cake day',
  category: 'Users',
  description: 'A cake beside a user\'s name on the anniversary of the day they joined.',
  keywords: 'cake day birthday anniversary joined',
  onPostRender(node, post) { decorate(node, post, '.tagline .author-wrap'); },
  onCommentRender(node, comment) { decorate(node, comment, ':scope > .comment-inner .tagline .author-wrap'); },
});
