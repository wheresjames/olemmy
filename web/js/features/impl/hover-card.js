// The user info card itself (features/hover-cards.js decides when to
// show it). Loaded the first time a card is wanted.

import { h } from '../../core/h.js';
import { href } from '../../core/router.js';
import { api } from '../../state/session.js';
import { blockPerson } from '../../state/actions.js';
import { addFilter } from '../filters.js';
import { tagBadge } from '../user-tagger.js';
import { avatar, mdBlock, spinner, errorBox } from '../../components/common.js';
import { confirmAction } from '../../components/dialog.js';
import { age, number, shortDate, clip } from '../../util/format.js';

const cache = new Map();

/** The person behind a #/u/name link, cached for the session. */
export function lookup(name) {
  const client = api.peek();
  const key = `${client.base} ${name}`;
  if (!cache.has(key)) {
    cache.set(key, client.user({ name, limit: 1 }).then((r) => r.person).catch((e) => { cache.delete(key); throw e; }));
  }
  return cache.get(key);
}

let card = null;
let anchor = null;
let hideTimer = 0;

function nameFrom(link) {
  const m = (link.getAttribute('href') || '').match(/^#\/u\/([^/?]+)/);
  try { return m ? decodeURIComponent(m[1]) : null; } catch { return null; }
}

function place(el, target) {
  const r = target.getBoundingClientRect();
  const w = Math.min(320, window.innerWidth - 16);
  el.style.width = `${w}px`;
  const left = Math.max(8, Math.min(window.scrollX + r.left, window.scrollX + window.innerWidth - w - 8));
  el.style.left = `${left}px`;
  const below = r.bottom + 6;
  el.style.top = `${window.scrollY + below}px`;
  // Flip above when it would run off the bottom.
  requestAnimationFrame(() => {
    if (below + el.offsetHeight > window.innerHeight - 8 && r.top > el.offsetHeight + 8) {
      el.style.top = `${window.scrollY + r.top - el.offsetHeight - 6}px`;
    }
  });
}

function content(p) {
  return [
    h('div.hc-head',
      avatar(p.avatar, '', 'hc-avatar'),
      h('div',
        h('a.hc-name', { href: href(`/u/${p.fullName}`) }, p.displayName || p.name),
        h('div.hc-full', `@${p.fullName}`),
        h('div', tagBadge(p)))),
    h('ul.hc-facts',
      h('li', h('strong', { title: shortDate(p.published) }, age(p.published)), ' old'),
      h('li', h('strong', number(p.postCount)), ' posts'),
      h('li', h('strong', number(p.commentCount)), ' comments'),
      p.admin && h('li.userattr.adm', 'admin'),
      p.bot && h('li', 'bot'),
      p.banned && h('li.banned', 'banned')),
    p.bio && mdBlock(clip(p.bio, 280), 'hc-bio'),
    h('div.hc-buttons',
      h('a.btn.btn-small', { href: href('/message/compose', { to: p.fullName }) }, 'message'),
      h('button.btn.btn-small', { type: 'button', onclick: () => { addFilter('user', p.fullName); hide(); } }, 'hide here'),
      h('button.btn.btn-small', {
        type: 'button',
        onclick: async () => { hide(); if (await confirmAction(`Block ${p.fullName}?`, 'Saved on your account.', 'Block')) blockPerson(p); },
      }, 'block')),
  ];
}

export function show(link) {
  const name = nameFrom(link);
  if (!name || !api.peek()) return;
  hide();
  anchor = link;
  card = h('div.hover-card', { role: 'dialog', 'aria-label': `About ${name}` }, spinner());
  card.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  card.addEventListener('pointerleave', scheduleHide);
  document.body.append(card);
  place(card, link);
  const mine = card;
  lookup(name).then((p) => {
    if (card !== mine) return;
    card.replaceChildren(...content(p));
    place(card, link);
  }).catch((e) => { if (card === mine) card.replaceChildren(errorBox(e)); });
}

export function hide() {
  clearTimeout(hideTimer);
  card?.remove();
  card = null;
  anchor = null;
}

export function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hide, 250);
}


/** The link the card is showing, if any. */
export function current() { return anchor; }
export function isOpen() { return !!card; }
export function contains(node) { return !!card && card.contains(node); }
