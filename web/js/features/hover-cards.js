// User info hover card: rest the pointer on a username for 400ms, or
// long-press it on a touch screen, for account age, instance, post and
// comment counts, your tag, and quick message / block / hide buttons.
// Lookups are cached for the session (§15 #6). The card's code
// (impl/hover-card.js) loads the first time one is shown.

import { defineFeature, enabled } from './registry.js';

const DELAY = 400;
const LONG_PRESS = 500;
let ui = null;
const load = async () => (ui ??= await import('./impl/hover-card.js'));
let showTimer = 0;

export default defineFeature({
  id: 'hoverCards',
  name: 'User info cards',
  category: 'Users',
  description: 'Rest the pointer on a username (or long-press it on a touch screen) to see their account age, posts, comments and your tag, with message and block buttons.',
  keywords: 'hover popup user info card profile',
  start() {
    const isAuthor = (t) => t?.closest?.('a.author');
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType === 'touch' || !enabled('hoverCards')) return;
      const link = isAuthor(e.target);
      if (!link || link === ui?.current()) return;
      clearTimeout(showTimer);
      showTimer = setTimeout(async () => (await load()).show(link), DELAY);
    });
    document.addEventListener('pointerout', (e) => {
      const link = isAuthor(e.target);
      if (!link) return;
      clearTimeout(showTimer);
      if (link === ui?.current()) ui.scheduleHide();
    });
    // Touch: a long press opens the card instead of following the link.
    let pressTimer = 0;
    let pressed = null;
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || !enabled('hoverCards')) return;
      const link = isAuthor(e.target);
      if (!link) { if (ui?.isOpen() && !ui.contains(e.target)) ui.hide(); return; }
      pressTimer = setTimeout(async () => { pressed = link; (await load()).show(link); }, LONG_PRESS);
    });
    const cancel = () => clearTimeout(pressTimer);
    document.addEventListener('pointerup', cancel);
    document.addEventListener('pointercancel', cancel);
    document.addEventListener('click', (e) => {
      if (pressed && isAuthor(e.target) === pressed) { e.preventDefault(); e.stopPropagation(); }
      pressed = null;
    }, true);
    document.addEventListener('contextmenu', (e) => { if (isAuthor(e.target) && ui?.isOpen()) e.preventDefault(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ui?.hide(); });
    window.addEventListener('hashchange', () => { clearTimeout(showTimer); ui?.hide(); });
  },
});
