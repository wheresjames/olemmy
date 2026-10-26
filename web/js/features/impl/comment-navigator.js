// The comment navigator's box (features/comment-navigator.js), loaded on
// a post's page.

import { h, icon } from '../../core/h.js';
import { signal } from '../../core/signal.js';
import { select } from '../keyboard-nav.js';

const CATEGORIES = [
  ['op', 'by the poster', (c) => c.classList.contains('by-op')],
  ['mine', 'mine', (c) => c.classList.contains('mine')],
  ['new', 'new since last visit', (c) => c.classList.contains('new-comment')],
  ['media', 'with links or images', (c) => !!own(c, '.comment-body a[href^="http"], .comment-body img, .comment-body video')],
  ['staff', 'by moderators and admins', (c) => !!own(c, '.tagline .author.moderator, .tagline .author.admin') || c.classList.contains('distinguished')],
];

/** The first match of [selector] in comment [c] itself, not in its replies. */
function own(c, selector) {
  return [...c.querySelectorAll(`:scope > .comment-inner ${selector}`)][0] || null;
}

const category = signal('op');
const position = signal({ at: 0, of: 0 });

function matches() {
  const test = CATEGORIES.find(([id]) => id === category.peek())?.[2];
  return [...document.querySelectorAll('#main .comment')].filter((c) => c.offsetParent !== null && test?.(c));
}

export function go(dir) {
  const list = matches();
  if (!list.length) { position.value = { at: 0, of: 0 }; return; }
  const sel = document.querySelector('#main .comment.kb-selected');
  let i = sel ? list.indexOf(sel) : -1;
  if (i < 0) {
    // From where the screen is: the next one below the top, or the last above it.
    const below = list.findIndex((c) => c.getBoundingClientRect().top > 70);
    i = dir > 0 ? (below < 0 ? list.length - 1 : below) - 1 : (below < 0 ? list.length : below);
  }
  const next = (i + dir + list.length) % list.length;
  select(list[next]);
  position.value = { at: next + 1, of: list.length };
}

export function panel() {
  return h('div.comment-navigator', { role: 'navigation', 'aria-label': 'Comment navigator' },
    h('select', {
      'aria-label': 'Show comments',
      onchange: (e) => { category.value = e.target.value; position.value = { at: 0, of: matches().length }; },
    }, CATEGORIES.map(([id, label]) => h('option', { value: id, selected: id === category.peek() }, label))),
    h('button.btn.btn-small', { type: 'button', 'aria-label': 'Previous', title: 'Previous (N)', onclick: () => go(-1) }, icon('arrow-up')),
    h('button.btn.btn-small', { type: 'button', 'aria-label': 'Next', title: 'Next (n)', onclick: () => go(1) }, icon('arrow-down')),
    h('span.cn-count', { 'aria-live': 'polite' }, () => (position.value.of ? `${position.value.at || '–'} of ${position.value.of}` : '')));
}

