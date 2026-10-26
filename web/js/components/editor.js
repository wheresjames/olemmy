// Markdown editor: auto-growing textarea, live preview, and a draft saved
// to localStorage as you type (olemmy:drafts), so a reload, a crash or an
// app update never loses a reply.

import { h } from '../core/h.js';
import { signal, onCleanup } from '../core/signal.js';
import { readDraft, saveDraft, clearDraft, hasOpenDraft, openEditors as open } from '../state/drafts.js';
import { editorToolbar, editorKeys, bigEditorButton } from './editor-tools.js';
import { mdBlock } from './common.js';

export { readDraft, saveDraft, clearDraft, hasOpenDraft };

/** Grow [ta] to fit its text. */
export function autosize(ta) {
  const fit = () => {
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight + 2, window.innerHeight * 0.8)}px`;
  };
  ta.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return fit;
}

/**
 * @param {{ draftKey?: string, initial?: string, placeholder?: string, rows?: number, label?: string,
 *           id?: string, required?: boolean, maxLength?: number }} opts
 * @returns {{ el: HTMLElement, textarea: HTMLTextAreaElement, value: () => string, clear: () => void, focus: () => void }}
 */
export function editor({ draftKey, initial = '', placeholder = '', rows = 4, label = 'Text', id, required = false, maxLength = 10000 } = {}) {
  const start = (draftKey && readDraft(draftKey)) || initial;
  const preview = signal(false);
  const big = signal(false);
  const text = signal(start);
  const textarea = /** @type {HTMLTextAreaElement} */ (h('textarea.md-editor', {
    id, rows, placeholder, required, maxlength: maxLength, 'aria-label': label, value: start,
    oninput: () => {
      text.value = textarea.value;
      if (draftKey) {
        clearTimeout(timer);
        timer = setTimeout(flush, 400);
      }
    },
  }));
  let timer = 0;
  autosize(textarea);
  // Typing is saved after a pause; leaving the field or the page saves at once.
  const flush = () => {
    if (!draftKey || !timer) return;
    clearTimeout(timer);
    timer = 0;
    saveDraft(draftKey, textarea.value === initial ? '' : textarea.value);
  };
  textarea.addEventListener('blur', flush);
  textarea.addEventListener('keydown', (e) => editorKeys(e, textarea, big));
  window.addEventListener('pagehide', flush);
  onCleanup(() => window.removeEventListener('pagehide', flush));

  const handle = {
    el: null,
    textarea,
    value: () => textarea.value,
    dirty: () => textarea.value.trim() !== '' && textarea.value !== initial,
    clear() {
      clearTimeout(timer);
      timer = 0;
      textarea.value = '';
      text.value = '';
      if (draftKey) clearDraft(draftKey);
    },
    focus() { textarea.focus(); },
  };
  open.add(handle);
  onCleanup(() => open.delete(handle));

  handle.el = h('div.editor', { class: { 'editor-big': () => big.value } },
    h('div.editor-tabs', { role: 'tablist' },
      h('button.editor-tab', { type: 'button', role: 'tab', 'aria-selected': () => String(!preview.value), onclick: () => { preview.value = false; textarea.focus(); } }, 'write'),
      h('button.editor-tab', { type: 'button', role: 'tab', 'aria-selected': () => String(preview.value), onclick: () => { preview.value = true; } }, 'preview'),
      bigEditorButton(big),
      h('a.editor-help', { href: 'https://join-lemmy.org/docs/users/02-media.html', target: '_blank', rel: 'noopener noreferrer' }, 'formatting help'),
      start && start !== initial && h('span.editor-restored', 'draft restored')),
    editorToolbar(textarea),
    h('div.editor-panes',
      h('div.editor-write', { hidden: () => preview.value && !big.value }, textarea),
      // The big editor shows the preview beside the text, always.
      () => (preview.value || big.value ? h('div.editor-preview', text.value.trim() ? mdBlock(text.value) : h('p.empty', 'Nothing to preview')) : null)));
  return handle;
}
