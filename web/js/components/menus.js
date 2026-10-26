// Dropdown menus built on <details> ("my communities", the account
// switcher, "more ▾", the mod menu, the favorites page picker) behave like
// menus: choosing an item closes them, as do a click elsewhere, Escape and
// moving to another page. One set of document listeners covers them all,
// including menus added later and a mod menu nested in "more ▾".

import { registerKey } from '../core/events.js';

export const MENUS = 'details.sr-dropdown, details.account-menu, details.more-menu, details.fav-pick';

const openMenus = () => [...document.querySelectorAll(MENUS)].filter((d) => d.open);

/** Close every open menu that doesn't contain [keep]. */
export function closeMenus(keep = null) {
  for (const d of openMenus()) if (!keep || !d.contains(keep)) d.open = false;
}

export function installMenus() {
  document.addEventListener('click', (e) => {
    const target = /** @type {Element} */ (e.target);
    const menu = target.closest?.(MENUS);
    // An item chosen (not a menu's own summary): close it and any menu around it.
    // Listening on the document, this runs after the item's own handler.
    if (menu && target.closest('a, button') && !target.closest('summary')) {
      closeMenus();
      return;
    }
    // Anywhere else, including another menu's summary: close the others.
    closeMenus(menu);
  });
  registerKey('Escape', () => {
    const open = openMenus();
    const inner = open[open.length - 1];
    closeMenus();
    inner?.querySelector('summary')?.focus();
  }, { group: 'Always', when: () => openMenus().length > 0 });
  window.addEventListener('hashchange', () => closeMenus());
}
