// Single-click opener: an "↗ + comments" button beside link posts' titles that
// opens the link in a new tab and the comments here, in one click. Off by
// default. Not on media that plays inline, or links that open in the app.

import { h } from '../core/h.js';
import { navigate } from '../core/router.js';
import { defineFeature } from './registry.js';
import { safeUrl, lemmyRoute } from '../util/links.js';
import { postHref, homeHost } from '../components/common.js';
import { expandoKind } from '../components/expando.js';
import { markPostRead } from '../state/actions.js';

/** Expandos that show the link's content in the listing already. */
const INLINE = new Set(['image', 'video', 'embed']);

export default defineFeature({
  id: 'singleClick',
  name: 'Single-click opener',
  category: 'Browsing',
  defaultEnabled: false,
  description: 'Adds ↗ + comments beside link posts: opens the link in a new tab and the comments in this one.',
  keywords: 'open link comments both tab',
  onPostRender(node, post, ctx) {
    const url = post.url && safeUrl(post.url);
    if (!url || ctx.onPostPage || INLINE.has(expandoKind(post)) || lemmyRoute(url, homeHost())) return;
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
