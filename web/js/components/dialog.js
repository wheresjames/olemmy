// Modal dialogs on <dialog>: ask(), confirmAction(), and a generic open().

import { h } from '../core/h.js';
import { root } from '../core/signal.js';

/**
 * Open a modal with [content]; resolves with what close(value) is given
 * (undefined when dismissed).
 * @param {(close: (v?: any) => void) => Node} build
 */
export function openDialog(build, { cls = '', label = 'Dialog' } = {}) {
  return new Promise((resolve) => {
    root((dispose) => {
      const dialog = h(`dialog.modal${cls ? `.${cls}` : ''}`, { 'aria-label': label });
      let done = false;
      const close = (value) => {
        if (done) return;
        done = true;
        try { dialog.close(); } catch { /* not open */ }
        dialog.remove();
        dispose();
        resolve(value);
      };
      dialog.append(build(close));
      dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(undefined); });
      dialog.addEventListener('click', (e) => { if (e.target === dialog) close(undefined); });
      document.body.append(dialog);
      dialog.showModal();
      dialog.querySelector('[autofocus], input, textarea, select, button')?.focus();
    });
  });
}

/** Ask for text; resolves to it, or null when cancelled. */
export function ask(title, { label = '', placeholder = '', submit = 'OK', multiline = false, required = true } = {}) {
  return openDialog((close) => {
    const field = h(multiline ? 'textarea' : 'input', { id: 'dialog-field', placeholder, required, autofocus: true, rows: multiline ? 4 : undefined });
    return h('form.dialog-body', {
      method: 'dialog',
      onsubmit: (e) => { e.preventDefault(); close(field.value.trim() || null); },
    },
    h('h2', title),
    label && h('label', { for: 'dialog-field' }, label),
    field,
    h('div.dialog-buttons',
      h('button.btn', { type: 'button', onclick: () => close(null) }, 'Cancel'),
      h('button.btn.btn-primary', { type: 'submit' }, submit)));
  }, { label: title }).then((v) => v ?? null);
}

/** Yes/no; resolves to a boolean. */
export function confirmAction(title, body = '', yes = 'Yes') {
  return openDialog((close) => h('div.dialog-body',
    h('h2', title),
    body && h('p', body),
    h('div.dialog-buttons',
      h('button.btn', { type: 'button', onclick: () => close(false) }, 'Cancel'),
      h('button.btn.btn-primary', { type: 'button', autofocus: true, onclick: () => close(true) }, yes))), { label: title })
    .then((v) => !!v);
}
