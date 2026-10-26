// "videos" on a listing's toolbar: shows only posts with a video (a video
// file, or an embed like YouTube) until pressed again. New pages from
// never-ending scroll are filtered the same way. A class on the list does
// it (features.css), so it costs nothing while off.

import { h, icon } from '../core/h.js';
import { signal } from '../core/signal.js';
import { defineFeature, enabled } from './registry.js';
import { listingToolbarHooks } from '../views/hooks.js';

export const videosOnly = signal(false);

function button() {
  videosOnly.value = false;
  return () => (enabled('videos') ? h('button.btn.btn-small.videos-button', {
    type: 'button',
    'aria-pressed': () => String(videosOnly.value),
    title: () => (videosOnly.value ? 'Show all posts again' : 'Show only posts with videos'),
    onclick: (e) => {
      const list = e.currentTarget.closest('.feed')?.querySelector('.sitetable');
      if (!list) return;
      videosOnly.value = !videosOnly.value;
      list.classList.toggle('videos-only', videosOnly.value);
    },
  }, icon('play'), () => (videosOnly.value ? ' all posts' : ' videos')) : null);
}

export default defineFeature({
  id: 'videos',
  name: 'Videos only',
  category: 'Media',
  description: 'A "videos" button on listings shows only the posts with a video.',
  keywords: 'video youtube filter play',
  start() { listingToolbarHooks.push(button); },
});
