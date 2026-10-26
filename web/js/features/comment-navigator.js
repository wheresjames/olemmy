// Comment navigator: on a post's page, a small box to jump between
// the original poster's comments, yours, new ones, ones with links or
// images, and moderators' and admins'. Keys: n next, N previous. The box
// (impl/comment-navigator.js) loads with the first post page.

import { registerKey } from '../core/events.js';
import { route } from '../core/router.js';
import { defineFeature, enabled } from './registry.js';

let ui = null;
let box = null;
const onPostPage = (name) => name === 'post' || name === 'postComment';

function close() { box?.remove(); box = null; }

export default defineFeature({
  id: 'commentNavigator',
  name: 'Comment navigator',
  category: 'Comments',
  description: 'On a post\'s page, jump between comments by the poster, your own, new ones, ones with links or images, and moderators\'. Keys: n and N.',
  keywords: 'navigate jump op submitter comments',
  async onRoute(r) {
    close();
    if (!onPostPage(r.name)) return;
    ui ??= await import('./impl/comment-navigator.js');
    if (route.peek() !== r) return;
    close();
    box = ui.panel();
    document.body.append(box);
  },
  start() {
    const active = () => enabled('commentNavigator') && !!ui && onPostPage(route.peek()?.name);
    registerKey('n', () => ui.go(1), { description: 'Next comment in the navigator\'s category', group: 'Comments', when: active });
    registerKey('N', () => ui.go(-1), { description: 'Previous comment in the navigator\'s category', group: 'Comments', when: active });
    // Leaving the post page (onRoute only runs for enabled features).
    window.addEventListener('hashchange', () => { if (!/^#\/(post|comment)\//.test(location.hash)) close(); });
  },
});
