// The parent-comment popup (features/show-parent.js), loaded on first hover.

import { h } from '../../core/h.js';
import { api } from '../../state/session.js';
import { mdBlock, userLink, timeEl, spinner, errorBox } from '../../components/common.js';

const cache = new Map();
let pop = null;

function render(c) {
  return [
    h('p.tagline', userLink(c.creator), ' ', timeEl(c.published)),
    c.deleted || c.removed ? h('p.gone', '[gone]') : mdBlock(c.content),
  ];
}

/** The parent comment: from the page if it's there, else from the instance. */
function parentOf(id, guest) {
  const onPage = document.getElementById(`c${id}`);
  if (onPage) {
    const entry = onPage.querySelector(':scope > .comment-inner .entry');
    const tagline = entry.querySelector('.tagline').cloneNode(true);
    tagline.querySelector('.expand')?.remove();
    tagline.querySelectorAll('button').forEach((b) => b.remove());
    return Promise.resolve([tagline, entry.querySelector('.comment-body').cloneNode(true)]);
  }
  // Read from another instance (views/address.js), the number means nothing here.
  if (guest) return Promise.resolve([h('p.small', 'The parent comment isn\'t on this page.')]);
  if (!cache.has(id)) cache.set(id, api.peek().comment(id).then(render).catch((e) => { cache.delete(id); throw e; }));
  return cache.get(id);
}

export function show(link, id) {
  hide();
  pop = h('div.parent-popup', { role: 'tooltip' }, spinner());
  document.body.append(pop);
  const r = link.getBoundingClientRect();
  const w = Math.min(560, window.innerWidth - 16);
  pop.style.width = `${w}px`;
  pop.style.left = `${Math.max(8, Math.min(window.scrollX + r.left, window.scrollX + window.innerWidth - w - 8))}px`;
  pop.style.top = `${window.scrollY + r.bottom + 6}px`;
  const mine = pop;
  parentOf(id, !!link.closest('.guest-page')).then((nodes) => { if (pop === mine) pop.replaceChildren(...nodes.map((n) => n.cloneNode ? n.cloneNode(true) : n)); })
    .catch((e) => { if (pop === mine) pop.replaceChildren(errorBox(e)); });
}

export function hide() {
  pop?.remove();
  pop = null;
}

