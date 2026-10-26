// Show parent on hover: rest the pointer on a comment's "parent"
// link, or an inbox reply's "context", to read the comment it answers
// without leaving your place. On touch, the links work as before. The
// popup (impl/show-parent.js) loads on first use.

import { defineFeature, enabled } from './registry.js';

const DELAY = 300;
let ui = null;
let timer = 0;

export default defineFeature({
  id: 'showParent',
  name: 'Show parent on hover',
  category: 'Comments',
  description: 'Rest the pointer on a comment\'s "parent" link, or a reply\'s "context" in your inbox, to read the comment it answers.',
  keywords: 'parent context hover popup reply',
  start() {
    const target = (t) => t?.closest?.('a[data-parent]');
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType === 'touch' || !enabled('showParent')) return;
      const link = target(e.target);
      if (!link) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        ui ??= await import('./impl/show-parent.js');
        ui.show(link, Number(link.dataset.parent));
      }, DELAY);
    });
    const hide = () => { clearTimeout(timer); ui?.hide(); };
    document.addEventListener('pointerout', (e) => { if (target(e.target)) hide(); });
    window.addEventListener('hashchange', hide);
  },
});
