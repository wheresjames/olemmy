// Keyboard shortcut registry and delegated event helpers.
//
//   registerKey('j', next, { description: 'Next item', group: 'Navigation' })
//
// Shortcuts are ignored while typing in a field, and when ctrl/alt/meta is
// held (so browser shortcuts keep working). Shift is part of the key ('J',
// '?'). A registration returns its own removal.

import { signal } from './signal.js';

/** @typedef {{ key: string, handler: (e: KeyboardEvent) => void, description: string, group: string, when?: () => boolean }} Shortcut */

/** @type {Shortcut[]} */
const shortcuts = [];
/** Bumped when the registry changes, for the help overlay. */
export const shortcutsChanged = signal(0);
/** Off when the keyboard navigation feature is disabled. */
export const keysEnabled = signal(true);

export function registerKey(key, handler, { description = '', group = 'General', when } = {}) {
  const s = { key, handler, description, group, when };
  shortcuts.push(s);
  shortcutsChanged.value++;
  return () => {
    const i = shortcuts.indexOf(s);
    if (i >= 0) shortcuts.splice(i, 1);
    shortcutsChanged.value++;
  };
}

/** Every active shortcut, for the help overlay. */
export function listShortcuts() {
  return shortcuts.filter((s) => s.description && (!s.when || s.when()));
}

/** Is [el] something keystrokes should go to? */
export function isTyping(el) {
  if (!el || !(el instanceof Element)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(/** @type {HTMLInputElement} */ (el).type);
  return false;
}

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
    if (isTyping(/** @type {Element} */ (e.target))) {
      if (e.key === 'Escape') /** @type {HTMLElement} */ (e.target).blur();
      return;
    }
    if (document.querySelector('dialog[open]:not(.help-dialog)')) return;
    // Later registrations win: a view's keys over the app's.
    for (let i = shortcuts.length - 1; i >= 0; i--) {
      const s = shortcuts[i];
      if (s.key !== e.key) continue;
      if (!keysEnabled.peek() && s.group !== 'Always') continue;
      if (s.when && !s.when()) continue;
      e.preventDefault();
      s.handler(e);
      return;
    }
  });
}

/**
 * Delegate [type] events under [root] to elements matching [selector]:
 * handler(event, matchedElement).
 */
export function delegate(root, type, selector, handler) {
  const listener = (e) => {
    const target = /** @type {Element} */ (e.target)?.closest?.(selector);
    if (target && root.contains(target)) handler(e, target);
  };
  root.addEventListener(type, listener);
  return () => root.removeEventListener(type, listener);
}
