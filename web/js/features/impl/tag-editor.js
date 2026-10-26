// The user tagger's edit dialog (features/user-tagger.js).

import { h } from '../../core/h.js';
import { openDialog } from '../../components/dialog.js';
import { tagOf, setTag } from '../user-tagger.js';

const COLORS = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#7f8c8d', '#222222', '#ffffff'];

/** The tag editor. */
export async function editTag(person) {
  const current = tagOf(person.fullName) || {};
  const result = await openDialog((close) => {
    const text = h('input#tag-text', { type: 'text', value: current.tag || '', maxlength: 60, autofocus: true });
    const color = h('input#tag-color', { type: 'color', value: current.color || '#3498db' });
    return h('form.dialog-body', {
      onsubmit: (e) => { e.preventDefault(); close({ tag: text.value.trim(), color: color.value }); },
    },
    h('h2', `Tag ${person.fullName}`),
    h('label', { for: 'tag-text' }, 'tag'), text,
    h('label', { for: 'tag-color' }, 'color'),
    h('div.swatches', color, COLORS.map((c) => h('button.swatch', {
      type: 'button', title: c, 'aria-label': `Color ${c}`, style: { '--swatch': c },
      onclick: () => { color.value = c; },
    }))),
    h('div.dialog-buttons',
      current.tag && h('button.btn', { type: 'button', onclick: () => close({ tag: '', color: '' }) }, 'remove tag'),
      h('button.btn', { type: 'button', onclick: () => close(null) }, 'cancel'),
      h('button.btn.btn-primary', { type: 'submit' }, 'save')));
  }, { label: `Tag ${person.fullName}` });
  if (result) setTag(person.fullName, result);
}

