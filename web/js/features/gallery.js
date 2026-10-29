// Gallery mode (Tier 3): a listing's image posts as a grid of pictures,
// toggled from the listing's toolbar. New pages from never-ending scroll
// join the grid as they load. The grid (impl/gallery.js) loads when first used.

import { h, icon } from '../core/h.js';
import { signal } from '../core/signal.js';
import { defineFeature, enabled } from './registry.js';
import { listingToolbarHooks } from '../views/hooks.js';

export const galleryOn = signal(false);

function button(feed) {
  let detach = null;
  const set = async (on) => {
    galleryOn.value = on;
    if (on) {
      const { attach } = await import('./impl/gallery.js');
      if (galleryOn.peek() && !detach) detach = attach(feed.list);
    } else { detach?.(); detach = null; }
  };
  // Back to a listing that was in gallery mode: the import is async, so the
  // list is in the feed by the time the grid goes in before it.
  galleryOn.value = false;
  if (feed.kept('gallery') && enabled('gallery')) set(true);
  return () => (enabled('gallery') ? h('button.btn.btn-small.gallery-button', {
    type: 'button',
    'aria-pressed': () => String(galleryOn.value),
    onclick: () => {
      const on = !galleryOn.peek();
      feed.keep('gallery', on);
      set(on);
    },
  }, icon('grid'), ' gallery') : null);
}

export default defineFeature({
  id: 'gallery',
  name: 'Gallery mode',
  category: 'Media',
  description: 'A "gallery" button on listings shows their image posts as a grid of pictures.',
  keywords: 'gallery grid images pictures',
  start() { listingToolbarHooks.push(button); },
});
