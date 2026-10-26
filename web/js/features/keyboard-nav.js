// Keyboard navigation: j/k move between posts or comments, a/z vote,
// enter opens comments, x expands, s saves, h hides, l opens the link,
// [ collapses, ] goes to the parent, . focuses search, ? shows help.
// The selected item gets focus, so the highlight is the focus ring too.

import { h } from '../core/h.js';
import { registerKey, listShortcuts, keysEnabled } from '../core/events.js';
import { effect } from '../core/signal.js';
import { route } from '../core/router.js';
import { defineFeature, enabled } from './registry.js';
import { openDialog } from '../components/dialog.js';

let selected = null;

function things() {
  return [...document.querySelectorAll('#main .thing')].filter((el) => el.offsetParent !== null && !el.closest('.collapsed > .children'));
}

export function select(el, { scroll = true } = {}) {
  if (!el) return;
  selected?.classList.remove('kb-selected');
  selected = el;
  el.classList.add('kb-selected');
  el.focus({ preventScroll: true });
  if (scroll) {
    const r = el.getBoundingClientRect();
    if (r.top < 60 || r.bottom > window.innerHeight) el.scrollIntoView({ block: r.height > window.innerHeight * 0.8 ? 'start' : 'center' });
  }
}

function current() {
  if (selected && selected.isConnected && selected.offsetParent !== null) return selected;
  // Nothing selected: start from the first item on screen.
  return things().find((el) => el.getBoundingClientRect().bottom > 0) || null;
}

function move(dir) {
  const list = things();
  if (!list.length) return;
  const cur = current();
  if (!cur || !selected) { select(cur || list[0]); return; }
  const i = list.indexOf(cur);
  select(list[Math.max(0, Math.min(list.length - 1, i + dir))]);
}

/** Click the first element matching [selector] in the selected item (not its children). */
function press(selector) {
  const cur = current();
  if (!cur) return;
  const own = [...cur.querySelectorAll(selector)].find((el) => el.closest('.thing') === cur);
  own?.click();
}

function showHelp() {
  const groups = new Map();
  for (const s of listShortcuts()) {
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group).push(s);
  }
  openDialog((close) => h('div.dialog-body.help-body',
    h('h2', 'Keyboard shortcuts'),
    [...groups].map(([group, list]) => h('section',
      h('h3', group === 'Always' ? 'General' : group),
      h('dl.shortcut-list', list.map((s) => [h('dt', h('kbd', s.key === ' ' ? 'space' : s.key)), h('dd', s.description)])))),
    h('div.dialog-buttons', h('button.btn.btn-primary', { type: 'button', autofocus: true, onclick: () => close() }, 'Close'))),
  { cls: 'help-dialog', label: 'Keyboard shortcuts' });
}

export default defineFeature({
  id: 'keyboardNav',
  name: 'Keyboard navigation',
  category: 'Browsing',
  description: 'Browse with the keyboard: j/k to move, a/z to vote, enter for comments, x to expand. Press ? for the full list.',
  keywords: 'shortcuts keys hotkeys keyboard',
  start() {
    effect(() => { keysEnabled.value = enabled('keyboardNav'); });
    effect(() => { route.value; selected = null; });
    const g = 'Navigation';
    registerKey('j', () => move(1), { description: 'Next post or comment', group: g });
    registerKey('k', () => move(-1), { description: 'Previous post or comment', group: g });
    registerKey('a', () => press('.arrow.up'), { description: 'Upvote', group: 'Actions' });
    registerKey('z', () => press('.arrow.down'), { description: 'Downvote', group: 'Actions' });
    registerKey('Enter', () => { const c = current(); (c?.querySelector('a.comments') || c?.querySelector('a.permalink'))?.click(); }, { description: 'Open comments', group: g });
    registerKey('l', () => press('a.title'), { description: 'Open the link', group: g });
    registerKey('x', () => press('.expando-button'), { description: 'Expand or collapse the media', group: 'Actions' });
    registerKey('s', () => press('.save-button'), { description: 'Save', group: 'Actions' });
    registerKey('h', () => press('.hide-button'), { description: 'Hide the post', group: 'Actions' });
    registerKey('r', () => press('.reply-button'), { description: 'Reply to the comment', group: 'Actions' });
    registerKey('[', () => press('.expand'), { description: 'Collapse or expand the comment', group: 'Comments' });
    registerKey(']', () => {
      const cur = current();
      const parent = cur?.parentElement?.closest('.comment');
      if (parent) select(parent);
    }, { description: 'Go to the parent comment', group: 'Comments' });
    registerKey('.', () => document.getElementById('search-box')?.focus(), { description: 'Focus the search box', group: 'Always' });
    registerKey('?', showHelp, { description: 'Show this help', group: 'Always' });
  },
});
