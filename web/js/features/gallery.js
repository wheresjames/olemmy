// Gallery mode (Tier 3): a listing's image posts as a grid of pictures,
// toggled from the listing's toolbar. New pages from never-ending scroll
// join the grid as they load. The grid (impl/gallery.js) loads when first used.

import { h, icon } from '../core/h.js';
import { signal } from '../core/signal.js';
import { defineFeature, enabled } from './registry.js';
import { listingToolbarHooks } from '../views/hooks.js';

export const galleryOn = signal(false);

function button() {
  let detach = null;
  galleryOn.value = false;
  return () => (enabled('gallery') ? h('button.btn.btn-small.gallery-button', {
    type: 'button',
    'aria-pressed': () => String(galleryOn.value),
    onclick: async (e) => {
      const list = e.currentTarget.closest('.feed')?.querySelector('.sitetable');
      if (!list) return;
      galleryOn.value = !galleryOn.value;
      if (galleryOn.value) detach = (await import('./impl/gallery.js')).attach(list);
      else { detach?.(); detach = null; }
    },
  }, icon('grid'), () => (galleryOn.value ? ' list' : ' gallery')) : null);
}

export default defineFeature({
  id: 'gallery',
  name: 'Gallery mode',
  category: 'Media',
  description: 'A "gallery" button on listings shows their image posts as a grid of pictures.',
  keywords: 'gallery grid images pictures',
  start() { listingToolbarHooks.push(button); },
});
