// Single-click opener: an "↗ + comments" button beside link posts' titles that
// opens the link in a new tab and the comments here, in one click.

import { h } from '../core/h.js';
import { navigate } from '../core/router.js';
import { defineFeature } from './registry.js';
import { safeUrl } from '../util/links.js';
import { postHref } from '../components/common.js';
import { markPostRead } from '../state/actions.js';

export default defineFeature({
  id: 'singleClick',
  name: 'Single-click opener',
  category: 'Browsing',
  description: 'Adds ↗ + comments beside link posts: opens the link in a new tab and the comments in this one.',
  keywords: 'open link comments both tab',
  onPostRender(node, post, ctx) {
    const url = post.url && safeUrl(post.url);
    if (!url || ctx.onPostPage) return;
    node.querySelector('.title-line .domain')?.before(h('button.link-button.single-click', {
      type: 'button',
      title: 'Open the link in a new tab, and the comments here',
      'aria-label': 'Open link in a new tab and comments here',
      onclick: () => {
        window.open(url, '_blank', 'noopener,noreferrer');
        markPostRead(post);
        navigate(postHref(post));
      },
    }, '↗ + comments'), ' ');
  },
});
