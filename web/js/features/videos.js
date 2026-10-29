// "videos" on a listing's toolbar: shows only posts with a video (a video
// file, or an embed like YouTube) until pressed again. New pages from
// never-ending scroll are filtered the same way. A class on the list does
// it (features.css), so it costs nothing while off.

import { h, icon } from '../core/h.js';
import { signal } from '../core/signal.js';
import { defineFeature, enabled } from './registry.js';
import { listingToolbarHooks } from '../views/hooks.js';

export const videosOnly = signal(false);

function button(feed) {
  const set = (on) => {
    videosOnly.value = on;
    feed.list.classList.toggle('videos-only', on);
  };
  set(feed.kept('videos') && enabled('videos'));
  return () => (enabled('videos') ? h('button.btn.btn-small.videos-button', {
    type: 'button',
    'aria-pressed': () => String(videosOnly.value),
    title: 'Show only posts with videos',
    onclick: () => {
      set(!videosOnly.peek());
      feed.keep('videos', videosOnly.peek());
    },
  }, icon('play'), ' videos') : null);
}

export default defineFeature({
  id: 'videos',
  name: 'Videos only',
  category: 'Media',
  description: 'A "videos" button on listings shows only the posts with a video.',
  keywords: 'video youtube filter play',
  start() { listingToolbarHooks.push(button); },
});
