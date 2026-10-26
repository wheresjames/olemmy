// Inline image/video viewer settings, and "show images" in the tab bar,
// which opens every image expando on the page.

import { h } from '../core/h.js';
import { signal } from '../core/signal.js';
import { defineFeature, option } from './registry.js';

/** Whether "show images" is on for the current page. */
export const allImagesOpen = signal(false);

/** Open or close every image/video expando under [root]. */
export function setAllImages(root, open) {
  allImagesOpen.value = open;
  for (const thing of root.querySelectorAll('.thing.link')) {
    const e = /** @type {any} */ (thing).expando;
    if (e && (e.kind === 'image' || e.kind === 'video')) e.toggle(open);
  }
}

export function showImagesButton(getRoot) {
  return h('button.btn.btn-small.show-images', {
    type: 'button',
    'aria-pressed': () => String(allImagesOpen.value),
    onclick: () => setAllImages(getRoot(), !allImagesOpen.peek()),
  }, () => (allImagesOpen.value ? 'hide images' : 'show images'));
}

/** Should new rows open their image expandos (auto-expand, or "show images" is on)? */
export function autoOpen(kind) {
  if (kind !== 'image' && kind !== 'video') return false;
  return allImagesOpen.peek() || !!option('expandos', 'autoExpand');
}

export default defineFeature({
  id: 'expandos',
  name: 'Inline image viewer',
  category: 'Media',
  description: 'Expand images, videos and text posts in place. Third-party embeds (YouTube, Vimeo, PeerTube, Streamable) only load when you click them.',
  alwaysOn: true,
  keywords: 'expando image viewer video gif embed thumbnail youtube',
  options: {
    autoExpand: { type: 'boolean', default: false, label: 'Open images and videos automatically in listings' },
    maxWidth: { type: 'number', default: 0, min: 0, max: 4000, step: 50, label: 'Maximum width in pixels (0 = fit the page)' },
    maxHeight: { type: 'number', default: 600, min: 0, max: 4000, step: 50, label: 'Maximum height in pixels (0 = no limit)' },
    youtubeThumbnails: { type: 'boolean', default: true, label: 'Thumbnails for YouTube videos (loaded from YouTube, so Google sees your address)' },
  },
});
