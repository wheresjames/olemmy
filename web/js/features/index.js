// Every feature module, imported once so they register themselves.

import './themes.js';
import './never-ending-scroll.js';
import './expandos.js';
import './keyboard-nav.js';
import './comment-collapse.js';
import './new-comments.js';
import './filters.js';
import './shortcut-bar.js';
// Phase 2: tags, cards and other helpers
import './user-tagger.js';
import './hover-cards.js';
import './comment-navigator.js';
import './show-parent.js';
import './single-click.js';
import './editor-helpers.js';
import './accounts.js';
import './favorites.js';
import './mod-tools.js';
// Tier 3
import './gallery.js';
import './videos.js';
import './saved-searches.js';
import './spam-filter.js';
import './notifications.js';
import './custom-css.js';
import './pwa.js';

export { startFeatures, runHook, featuresReady } from './registry.js';
