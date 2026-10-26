// Basic moderation (§7, Phase 2): for communities you moderate (and, for
// admins, local ones), a "mod" menu on posts and comments to remove or
// restore, lock, pin, distinguish, and ban from the community. The mod log
// and the reports queue are views/mod.js. The menus' code
// (impl/mod-tools.js) loads only for moderators and admins, before the
// first view that needs it.

import { effect } from '../core/signal.js';
import { moderated, isAdmin } from '../state/session.js';
import { defineFeature, waitFor } from './registry.js';

export default defineFeature({
  id: 'modTools',
  name: 'Moderator tools',
  category: 'Moderation',
  description: 'In communities you moderate: a "mod" menu on posts and comments (remove, lock, pin, distinguish, ban), the reports queue, and the mod log.',
  keywords: 'moderator moderation remove lock pin ban reports modlog',
  start() {
    let loading = false;
    effect(() => {
      if (loading || !(moderated.value.size || isAdmin.value)) return;
      loading = true;
      waitFor(import('./impl/mod-tools.js').then((m) => m.install()));
    });
  },
});
