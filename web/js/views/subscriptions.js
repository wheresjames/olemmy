// #/subscriptions: your favorites (this browser) and your account's
// subscriptions. Favorites are shown as their pages, each in its color;
// rows move by dragging the handle (pointer events, so touch works too),
// with ↑ ↓ and "move to" for keyboards and small screens.

import { h, dynamic } from '../core/h.js';
import { effect, onCleanup } from '../core/signal.js';
import { href } from '../core/router.js';
import { api, loggedIn, subscriptions, instance, site } from '../state/session.js';
import { follow } from '../state/actions.js';
import { hostOf } from '../api/client.js';
import { tabMenu } from '../components/tab-menu.js';
import { setTitle, empty, communityHref } from '../components/common.js';
import { ask, confirmAction } from '../components/dialog.js';
import {
  favoritePages, addFavorite, removeFavorite, moveFavorite, movePage, renamePage, deletePage,
  favoriteButton, colorClass, pageLabel, sharedPageHref, PER_PAGE, MAX_PAGES,
} from '../features/favorites.js';
import { shareLink, appUrl } from '../components/send-link.js';

const TABS = [['favorites', 'favorites'], ['subscribed', 'subscribed']];

export function subscriptionsView(route, { chrome }) {
  const tab = route.query.get('tab') === 'subscribed' ? 'subscribed' : 'favorites';
  setTitle(tab === 'subscribed' ? 'subscriptions' : 'favorites');
  chrome.pageName.value = { text: 'my communities', href: href('/subscriptions') };
  chrome.tabs.value = tabMenu(TABS.map(([id, text]) => ({ label: text, href: href('/subscriptions', { tab: id === 'favorites' ? '' : id }), selected: id === tab })), 'My communities');
  chrome.sidebar.value = null;
  return h('div.subs-page', tab === 'subscribed' ? subscribedTab() : favoritesTab());
}

// --- favorites ------------------------------------------------------------------------

/** name -> 'ok' | 'unfollowed' | 'missing', for this session. */
const federation = new Map();

function favoritesTab() {
  const host = site.peek()?.host || hostOf(instance.peek());
  const watcher = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { watcher.unobserve(e.target); checkFederation(e.target); }
  });
  onCleanup(() => watcher.disconnect());

  return h('div.fav-manage',
    h('p.subs-intro', 'Favorites are kept in this browser for ', h('strong', host), ', whether or not you\'re logged in. ',
      h('strong', 'FAVORITES'), ` at the top shows one page at a time, its communities merged into one listing. Up to ${PER_PAGE} communities a page; drag them by `,
      h('span.fav-handle-sample', { 'aria-hidden': 'true' }, '⠿'), ' to arrange your pages.'),
    addForm(),
    dynamic(() => {
      const pages = favoritePages.value;
      if (!pages.length) return empty('No favorites yet. Add one above, or press ☆ favorite in a community\'s sidebar.');
      const sections = pages.map((p, i) => pageSection(pages, i, watcher));
      return [sections, pages.length < MAX_PAGES && h('div.fav-new-page', { dataset: { page: pages.length } }, 'Drop a community here to start a new page')];
    }));
}

function addForm() {
  const input = h('input#fav-add-input', { type: 'text', placeholder: 'name@instance', list: 'fav-add-options', autocomplete: 'off', autocapitalize: 'off', spellcheck: false });
  const options = h('datalist#fav-add-options');
  let timer = 0;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    if (input.value.trim().length < 2) return;
    timer = setTimeout(async () => {
      try {
        const r = await api.peek().search({ q: input.value.replace(/^!/, '').replace(/@.*/, ''), type: 'Communities', limit: 10 });
        options.replaceChildren(...r.communities.map((c) => h('option', { value: c.fullName }, c.title)));
      } catch { /* suggestions are optional */ }
    }, 300);
  });
  const where = h('select#fav-add-page', { 'aria-label': 'Add to' });
  const fill = () => {
    const pages = favoritePages.value;
    where.replaceChildren(
      h('option', { value: '' }, 'last page with room'),
      ...pages.map((p, i) => h('option', { value: String(i), disabled: p.communities.length >= PER_PAGE }, pageLabel(pages, i))),
      pages.length < MAX_PAGES && h('option', { value: String(pages.length) }, 'a new page'));
  };
  effect(fill);
  return h('form.fav-add', {
    onsubmit: async (e) => {
      e.preventDefault();
      const name = input.value.trim().replace(/^!/, '');
      if (!name) return;
      // Check it exists here, and use its full name (name@host).
      try {
        const { community } = await api.peek().community(name.includes('@') ? name : `${name}@${hostOf(instance.peek())}`);
        const r = addFavorite(community.fullName, where.value === '' ? undefined : Number(where.value));
        if (r.pages) input.value = '';
      } catch {
        addFailed(name);
      }
    },
  },
  h('label', { for: 'fav-add-input' }, 'Add a community'),
  h('div.fav-add-row', input, options, where, h('button.btn', { type: 'submit' }, 'add')));
}

function addFailed(name) {
  confirmAction(`Couldn't find ${name}`, `${hostOf(instance.peek())} doesn't know a community by that name. Check the spelling, including the part after @.`, 'OK');
}

function pageSection(pages, i, watcher) {
  const p = pages[i];
  return h(`section.fav-page.${colorClass(i)}`, { 'aria-label': pageLabel(pages, i) },
    h('div.fav-page-head',
      h('h2.fav-page-title', h('span.fav-swatch', { 'aria-hidden': 'true' }), `Page ${i + 1}`, p.name && h('span.fav-page-name', ` · ${p.name}`)),
      h('span.fav-count', `${p.communities.length} / ${PER_PAGE}`),
      h('span.fav-page-actions',
        h('a', { href: href('/favorites', { page: i + 1 }) }, 'view'),
        h('button.link-button', { type: 'button', onclick: () => shareLink(appUrl(sharedPageHref(p)), `Favorites: ${pageLabel(pages, i)}`) }, 'share'),
        h('button.link-button', { type: 'button', onclick: () => doRename(i) }, 'rename'),
        h('button.link-button', { type: 'button', disabled: i === 0, 'aria-label': `Move page ${i + 1} up`, onclick: () => movePage(i, -1) }, '↑'),
        h('button.link-button', { type: 'button', disabled: i === pages.length - 1, 'aria-label': `Move page ${i + 1} down`, onclick: () => movePage(i, 1) }, '↓'),
        h('button.link-button', { type: 'button', onclick: () => doDelete(pages, i) }, 'delete'))),
    h('ol.fav-list', { dataset: { page: i }, start: 1 },
      p.communities.map((name, k) => row(pages, i, k, name, watcher))));
}

function row(pages, i, k, name, watcher) {
  const at = name.indexOf('@');
  const note = h('span.fav-note');
  const li = h('li.fav-row', { dataset: { name } },
    h('button.fav-handle', {
      type: 'button',
      'aria-label': `Drag to move ${name}`,
      title: 'Drag to move',
      onpointerdown: (e) => startDrag(e, li, name, i),
      onkeydown: (e) => keyMove(e, pages, i, k, name),
    }, '⠿'),
    h('span.fav-name',
      h('a', { href: href(`/c/${name}`) }, at > 0 ? name.slice(0, at) : name),
      at > 0 && h('span.host', name.slice(at)),
      note),
    h('span.fav-row-actions',
      h('button.link-button', { type: 'button', 'aria-label': `Move ${name} up`, disabled: i === 0 && k === 0, onclick: () => step(pages, i, k, name, -1) }, '↑'),
      h('button.link-button', { type: 'button', 'aria-label': `Move ${name} down`, disabled: i === pages.length - 1 && k === pages[i].communities.length - 1, onclick: () => step(pages, i, k, name, 1) }, '↓'),
      h('select.fav-move', {
        'aria-label': `Move ${name} to another page`,
        onchange: (e) => { const to = Number(e.target.value); e.target.value = ''; if (!Number.isNaN(to)) moveFavorite(name, to); },
      },
      h('option', { value: '' }, 'move to…'),
      pages.map((p, j) => j !== i && h('option', { value: String(j), disabled: p.communities.length >= PER_PAGE }, pageLabel(pages, j))),
      pages.length < MAX_PAGES && h('option', { value: String(pages.length) }, 'a new page')),
      h('button.link-button.fav-remove', { type: 'button', 'aria-label': `Remove ${name} from favorites`, title: 'Remove', onclick: () => removeFavorite(name) }, '×')));
  li.note = note;
  showFederation(li, name);
  if (!federation.has(name)) watcher.observe(li);
  return li;
}

/** ↑ / ↓: within the page, or across to the neighbouring page's end or start. */
function step(pages, i, k, name, dir) {
  const last = pages[i].communities.length - 1;
  if (dir < 0 && k === 0) return i > 0 && moveFavorite(name, i - 1);
  if (dir > 0 && k === last) return i < pages.length - 1 && moveFavorite(name, i + 1, 0);
  return moveFavorite(name, i, k + dir);
}

/** Alt+↑/↓ on a handle moves its row, keeping focus on it. */
function keyMove(e, pages, i, k, name) {
  if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  e.preventDefault();
  step(pages, i, k, name, e.key === 'ArrowUp' ? -1 : 1);
  requestAnimationFrame(() => document.querySelector(`.fav-row[data-name="${CSS.escape(name)}"] .fav-handle`)?.focus());
}

async function doRename(i) {
  const name = await ask(`Rename page ${i + 1}`, { label: 'Name (letters, numbers, - and _)', submit: 'Rename' });
  if (name) renamePage(i, name);
}

async function doDelete(pages, i) {
  const n = pages[i].communities.length;
  if (n && !await confirmAction(`Delete ${pageLabel(pages, i)}?`, `Its ${n} ${n === 1 ? 'community leaves' : 'communities leave'} your favorites. The communities themselves aren't affected.`, 'Delete')) return;
  deletePage(i);
}

// --- dragging ----------------------------------------------------------------------------

function startDrag(e, li, name, from) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  const handle = /** @type {HTMLElement} */ (e.currentTarget);
  handle.setPointerCapture(e.pointerId);
  const rect = li.getBoundingClientRect();
  const offsetY = e.clientY - rect.top;
  const ghost = /** @type {HTMLElement} */ (li.cloneNode(true));
  ghost.classList.add('fav-ghost');
  ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, { width: `${rect.width}px`, left: `${rect.left}px`, top: `${rect.top}px` });
  document.body.append(ghost);
  li.classList.add('fav-dragging');
  const marker = h('li.fav-drop-marker', { 'aria-hidden': 'true' });
  let target = null;
  let lastY = e.clientY;
  let raf = 0;

  const clearOver = () => document.querySelectorAll('.fav-page.drop-full, .fav-new-page.over').forEach((el) => el.classList.remove('drop-full', 'over'));
  const place = (x, y) => {
    clearOver();
    const el = document.elementFromPoint(x, y);
    const zone = el?.closest('.fav-new-page');
    const list = el?.closest('.fav-page')?.querySelector('.fav-list');
    if (zone) {
      marker.remove();
      zone.classList.add('over');
      target = { page: Number(zone.dataset.page), index: 0 };
      return;
    }
    if (!list) { marker.remove(); target = null; return; }
    const page = Number(list.dataset.page);
    const rows = [...list.querySelectorAll(':scope > .fav-row:not(.fav-dragging)')];
    if (page !== from && rows.length >= PER_PAGE) {
      marker.remove();
      list.closest('.fav-page').classList.add('drop-full');
      target = null;
      return;
    }
    let index = rows.findIndex((r) => { const b = r.getBoundingClientRect(); return y < b.top + b.height / 2; });
    if (index < 0) index = rows.length;
    if (rows[index]) rows[index].before(marker); else list.append(marker);
    target = { page, index };
  };
  // Near the top or bottom of the screen, scroll, so long lists work on phones.
  const scroll = () => {
    const edge = 56;
    const dy = lastY < edge ? -(edge - lastY) / 3 : lastY > innerHeight - edge ? (lastY - (innerHeight - edge)) / 3 : 0;
    if (dy) { scrollBy(0, dy); place(innerWidth / 2, lastY); }
    raf = requestAnimationFrame(scroll);
  };
  raf = requestAnimationFrame(scroll);

  const onMove = (ev) => {
    lastY = ev.clientY;
    ghost.style.top = `${ev.clientY - offsetY}px`;
    place(ev.clientX, ev.clientY);
  };
  const onEnd = (ev) => {
    cancelAnimationFrame(raf);
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onEnd);
    handle.removeEventListener('pointercancel', onEnd);
    ghost.remove();
    marker.remove();
    clearOver();
    li.classList.remove('fav-dragging');
    if (ev.type === 'pointerup' && target) moveFavorite(name, target.page, target.index);
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onEnd);
  handle.addEventListener('pointercancel', onEnd);
}

// --- federation ---------------------------------------------------------------------------

/**
 * Your instance only receives a remote community's new posts if one of its
 * users subscribes; a favorite doesn't count. Checked as rows come into view.
 */
async function checkFederation(li) {
  const name = li.dataset.name;
  try {
    const { community } = await api.peek().community(name);
    federation.set(name, !community.local && community.subscribersLocal === 0 ? 'unfollowed' : 'ok');
  } catch (e) {
    if (e.kind === 'aborted') return;
    federation.set(name, e.status === 404 || /couldnt_find/.test(e.code || '') ? 'missing' : 'ok');
  }
  showFederation(li, name);
}

function showFederation(li, name) {
  const s = federation.get(name);
  const host = hostOf(instance.peek());
  if (s === 'unfollowed') {
    li.note.replaceChildren(h('span.fav-warning', { title: `Nobody on ${host} subscribes to this community, so ${host} may not be receiving its new posts. Subscribing (logged in) fixes that.` }, `not followed on ${host}: posts may be missing`));
  } else if (s === 'missing') {
    li.note.replaceChildren(h('span.fav-warning', `${host} doesn't know this community`));
  }
}

// --- the account's subscriptions -------------------------------------------------------------

function subscribedTab() {
  return dynamic(() => {
    if (!loggedIn.value) {
      return h('div',
        h('p.subs-intro', 'These are the communities your Lemmy account subscribes to: HOME shows them when you\'re logged in.'),
        h('p', h('a', { href: href('/login', { return: '#/subscriptions?tab=subscribed' }) }, 'Log in'), ' to see them. Favorites work without logging in.'));
    }
    const list = subscriptions.value;
    return h('div',
      h('p.subs-intro', 'Your Lemmy account\'s subscriptions, saved on ', h('strong', hostOf(instance.peek())), ': HOME shows them. ☆ adds one to your favorites too.'),
      list.length
        ? h('ul.subs-list', list.map((c) => h('li.subs-row',
          h('a.subs-name', { href: communityHref(c) }, c.name, !c.local && h('span.host', `@${c.host}`)),
          favoriteButton(c.fullName, { small: true }),
          h('button.btn.btn-small', {
            type: 'button',
            onclick: async () => { if (await confirmAction(`Unsubscribe from ${c.name}?`, '', 'Unsubscribe')) follow(c, false); },
          }, 'unsubscribe'))))
        : empty('No subscriptions yet.'),
      h('p', h('a', { href: href('/communities') }, 'Browse communities »')));
  });
}

