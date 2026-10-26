// Gallery mode's grid (features/gallery.js), loaded when first turned on.

import { h } from '../../core/h.js';
import { postHref } from '../../components/common.js';
import { thumbnailUrl, safeMediaUrl } from '../../util/links.js';
import { nsfwBlurred } from '../../components/thumbnail.js';

function tile(post) {
  const src = thumbnailUrl(safeMediaUrl(post.url), 640) || thumbnailUrl(post.thumbnail, 640);
  return h('a.gallery-tile', { href: postHref(post), class: { 'nsfw-blur': nsfwBlurred(post) }, title: post.title },
    h('img', { src, alt: post.altText || post.title, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' }),
    h('span.gallery-caption', post.title));
}

/** Build the grid from [list]'s rows, and keep it in step with new ones. */
export function attach(list) {
  const grid = h('div.gallery-grid', { role: 'list' });
  const add = (thing) => {
    const post = thing.post;
    if (post && thing.classList.contains('has-image')) grid.append(tile(post));
  };
  list.querySelectorAll('.thing.link').forEach(add);
  const watch = new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) if (n.classList?.contains('thing')) add(n);
  });
  watch.observe(list, { childList: true });
  list.before(grid);
  list.classList.add('gallery-hidden');
  if (!grid.children.length) grid.append(h('p.empty', 'No image posts on this page yet.'));
  return () => { watch.disconnect(); grid.remove(); list.classList.remove('gallery-hidden'); };
}

