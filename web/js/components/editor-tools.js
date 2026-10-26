// The editor helpers' tools (features/editor-helpers.js): formatting
// toolbar, keyboard shortcuts, the big editor, and the saved-drafts list.
// Loaded with the views that have an editor.

import { h, dynamic } from '../core/h.js';
import { enabled } from '../features/registry.js';
import { drafts, clearDraft } from '../state/drafts.js';
import { timeAgo, clip } from '../util/format.js';

/** Put [before]/[after] around the selection of [ta] (or [placeholder]). */
function wrap(ta, before, after = before, placeholder = '') {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const selected = value.slice(s, e) || placeholder;
  ta.setRangeText(`${before}${selected}${after}`, s, e, 'end');
  // Leave the placeholder selected, to type over.
  if (s === e && placeholder) ta.setSelectionRange(s + before.length, s + before.length + placeholder.length);
  changed(ta);
}

/** Start each selected line with [prefix] ('> ', '- ', '1. '). */
function prefixLines(ta, prefix) {
  const { value } = ta;
  const start = value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
  let end = value.indexOf('\n', ta.selectionEnd);
  if (end < 0) end = value.length;
  const lines = value.slice(start, end).split('\n').map((l, i) => (typeof prefix === 'function' ? prefix(i) : prefix) + l);
  ta.setRangeText(lines.join('\n'), start, end, 'select');
  changed(ta);
}

function changed(ta) {
  ta.focus();
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

const ACTIONS = [
  ['bold', 'B', 'Bold (Ctrl+B)', (ta) => wrap(ta, '**', '**', 'bold text')],
  ['italic', 'I', 'Italic (Ctrl+I)', (ta) => wrap(ta, '_', '_', 'italic text')],
  ['strike', 'S', 'Strikethrough', (ta) => wrap(ta, '~~', '~~', 'struck text')],
  ['link', '🔗', 'Link (Ctrl+K)', (ta) => {
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    if (/^https?:\/\/\S+$/.test(sel)) wrap(ta, '[', `](${sel})`, 'link text');
    else wrap(ta, '[', '](https://)', sel ? '' : 'link text');
  }],
  ['quote', '❝', 'Quote', (ta) => prefixLines(ta, '> ')],
  ['code', '</>', 'Code', (ta) => {
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    if (sel.includes('\n')) wrap(ta, '```\n', '\n```');
    else wrap(ta, '`', '`', 'code');
  }],
  ['list', '•', 'Bulleted list', (ta) => prefixLines(ta, '- ')],
  ['numbered', '1.', 'Numbered list', (ta) => prefixLines(ta, (i) => `${i + 1}. `)],
  ['spoiler', '⚠', 'Spoiler', (ta) => wrap(ta, '\n::: spoiler spoiler\n', '\n:::\n', 'hidden text')],
  ['sup', 'x²', 'Superscript', (ta) => wrap(ta, '^', '^', 'sup')],
];

export function editorToolbar(ta) {
  return dynamic(() => (enabled('editorHelpers')
    ? h('div.editor-toolbar', { role: 'toolbar', 'aria-label': 'Formatting' },
      ACTIONS.map(([id, label, title, run]) => h(`button.editor-tool.tool-${id}`, {
        type: 'button', title, 'aria-label': title, onclick: () => run(ta),
      }, label)))
    : null));
}

export function bigEditorButton(big) {
  return dynamic(() => (enabled('editorHelpers')
    ? h('button.editor-tab.editor-big-toggle', {
      type: 'button', 'aria-pressed': () => String(big.value),
      onclick: (e) => { big.value = !big.value; e.currentTarget.closest('.editor')?.querySelector('textarea')?.focus(); },
    }, () => (big.value ? 'close big editor' : 'big editor'))
    : null));
}

/** Keyboard shortcuts inside an editor's textarea. */
export function editorKeys(e, ta, big) {
  if (e.key === 'Escape' && big?.peek()) { e.preventDefault(); e.stopPropagation(); big.value = false; return; }
  const mod = e.ctrlKey || e.metaKey;
  if (!mod || e.altKey) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    ta.form?.requestSubmit();
    return;
  }
  if (!enabled('editorHelpers')) return;
  const run = { b: 'bold', i: 'italic', k: 'link' }[e.key.toLowerCase()];
  if (!run) return;
  e.preventDefault();
  ACTIONS.find(([id]) => id === run)[3](ta);
}

const DRAFT_LABELS = [[/^reply:(\d+):0$/, (m) => `comment on post ${m[1]}`], [/^reply:(\d+):(\d+)$/, (m) => `reply in post ${m[1]}`],
  [/^edit:(\d+)$/, (m) => `edit of comment ${m[1]}`], [/^submit:/, () => 'new post'], [/^edit-post:(\d+)/, (m) => `edit of post ${m[1]}`],
  [/^message:(.*)$/, (m) => `message ${m[1] === 'compose' || m[1] === 'new' ? '' : `to ${m[1]}`}`]];

function draftLabel(key) {
  for (const [re, fn] of DRAFT_LABELS) { const m = key.match(re); if (m) return fn(m); }
  return key;
}

export function draftList() {
  return () => {
    const all = Object.entries(drafts.value).sort((a, b) => b[1].time - a[1].time);
    if (!all.length) return h('p.small', 'No saved drafts.');
    return h('ul.draft-list', all.map(([key, d]) => h('li',
      h('div', h('strong', draftLabel(key)), ' ', h('span.small', timeAgo(new Date(d.time).toISOString()))),
      h('p.small.draft-text', clip(d.text, 160)),
      h('button.btn.btn-small', { type: 'button', onclick: () => clearDraft(key) }, 'discard'))));
  };
}

