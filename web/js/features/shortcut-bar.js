// Community shortcut bar: the user's favorite communities across the top,
// in their own order (drag to reorder, or use the arrows in the editor).
// Stored in olemmy:shortcuts, per instance, as community full names.

import { h, dynamic } from '../core/h.js';
import { persisted } from '../core/store.js';
import { href } from '../core/router.js';
import { instance } from '../state/session.js';
import { hostOf } from '../api/client.js';
import { defineFeature, enabled } from './registry.js';
import { toast } from '../components/toast.js';

const shortcuts = persisted('shortcuts', { version: 1, defaults: {} });

function key() { return hostOf(instance.value) || 'default'; }

export function listShortcuts() { return shortcuts.value[key()] || []; }

function save(list) {
  const k = key();
  shortcuts.update((all) => ({ ...all, [k]: list }));
}

export function hasShortcut(name) { return listShortcuts().includes(name); }

export function addShortcut(name) {
  if (hasShortcut(name)) return;
  save([...listShortcuts(), name]);
  toast(`Added ${name} to the shortcut bar`);
}

export function removeShortcut(name) { save(listShortcuts().filter((n) => n !== name)); }

export function moveShortcut(from, to) {
  const list = [...listShortcuts()];
  if (to < 0 || to >= list.length) return;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  save(list);
}

/** "name@host" -> "name" for display. */
const short = (n) => n.replace(/@.*$/, '');

/** The bar in the header's community strip. */
export function shortcutBar() {
  return dynamic(() => {
    if (!enabled('shortcutBar')) return null;
    const list = listShortcuts();
    let dragging = -1;
    return h('ul.sr-shortcuts', { 'aria-label': 'Community shortcuts' },
      list.length ? list.map((name, i) => h('li', {
        draggable: 'true',
        ondragstart: (e) => { dragging = i; e.dataTransfer.effectAllowed = 'move'; },
        ondragover: (e) => { e.preventDefault(); },
        ondrop: (e) => { e.preventDefault(); if (dragging >= 0) moveShortcut(dragging, i); dragging = -1; },
      }, h('a', { href: href(`/c/${name}`), title: name }, short(name))))
        : h('li.sr-shortcuts-empty', 'add communities here from their sidebars'));
  });
}

/** "+shortcut" / "−shortcut" for a community page's sidebar. */
export function shortcutButton(fullName) {
  return dynamic(() => {
    if (!enabled('shortcutBar')) return null;
    const on = listShortcuts().includes(fullName);
    return h('button.link-button.shortcut-button', {
      type: 'button',
      onclick: () => (on ? removeShortcut(fullName) : addShortcut(fullName)),
    }, on ? '− remove from shortcut bar' : '+ add to shortcut bar');
  });
}

/** The editor in the settings console. */
function editorList() {
  return () => {
    const list = listShortcuts();
    if (!list.length) return h('p.small', 'No shortcuts yet. Open a community and use "+ add to shortcut bar" in its sidebar.');
    return h('ol.shortcut-editor', list.map((name, i) => h('li',
      h('span', name),
      h('button.btn.btn-small', { type: 'button', 'aria-label': `Move ${name} up`, disabled: i === 0, onclick: () => moveShortcut(i, i - 1) }, '↑'),
      h('button.btn.btn-small', { type: 'button', 'aria-label': `Move ${name} down`, disabled: i === list.length - 1, onclick: () => moveShortcut(i, i + 1) }, '↓'),
      h('button.btn.btn-small', { type: 'button', 'aria-label': `Remove ${name}`, onclick: () => removeShortcut(name) }, 'remove'))));
  };
}

export default defineFeature({
  id: 'shortcutBar',
  name: 'Community shortcut bar',
  category: 'Communities',
  description: 'Your favorite communities across the top of every page, in your own order. Drag them in the bar to reorder.',
  keywords: 'favorites communities bar',
  options: {
    list: { type: 'custom', default: null, label: 'Shortcuts on this instance', render: editorList },
  },
});
