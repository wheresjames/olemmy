// The searchable instance list on the picker (api/directory.js): search,
// sort, filters, and stars. Starred instances stay at the top, and work
// even when the list can't be fetched.

import { h } from '../core/h.js';
import { signal } from '../core/signal.js';
import { loadDirectory, search, languages, SORTS, DIRECTORY_HOME } from '../api/directory.js';
import { number, plural } from '../util/format.js';
import { errorBox, spinner } from './common.js';
import { starred, isStarred, toggleStar } from '../state/starred-instances.js';

const PAGE = 50;

let langNames = null;
function langName(code) {
  try {
    langNames ??= new Intl.DisplayNames([], { type: 'language' });
    return langNames.of(code) || code;
  } catch { return code; }
}

/**
 * The directory, with [popular] as the list while it loads or if it fails.
 * [use](host) switches to an instance; [busy] disables that while it checks.
 */
export function instanceDirectory({ use, busy, popular }) {
  const state = signal({ status: 'loading', list: [], error: null });
  const q = signal('');
  const sort = signal('score');
  const lang = signal('');
  const signups = signal(false);
  const shown = signal(PAGE);
  const restart = () => { shown.value = PAGE; };

  const load = () => {
    state.value = { status: 'loading', list: [], error: null };
    loadDirectory().then(
      (list) => { state.value = { status: 'ready', list, error: null }; },
      (error) => { state.value = { status: 'failed', list: [], error }; });
  };
  load();

  const starButton = (host, name) => h('button.link-button.instance-star', {
    type: 'button',
    'aria-pressed': () => String(isStarred(host)),
    'aria-label': () => `${isStarred(host) ? 'Unstar' : 'Star'} ${name}`,
    title: () => (isStarred(host) ? 'Unstar' : 'Star: keep it at the top'),
    onclick: () => toggleStar(host),
  }, () => (isStarred(host) ? '★' : '☆'));

  const card = (i) => {
    const initial = h('span.instance-icon.instance-initial', { 'aria-hidden': 'true' }, i.name.slice(0, 1).toUpperCase());
    const icon = i.icon
      ? h('img.instance-icon', { src: i.icon, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', onerror: (e) => e.target.replaceWith(initial) })
      : initial;
    return h('li.instance-card', { dataset: { host: i.host } },
      icon,
      h('div.instance-main',
        h('p.instance-title',
          h('button.link-button.instance-card-name', { type: 'button', disabled: () => busy.value, onclick: () => use(i.host) }, i.name),
          ' ', h('span.instance-host', i.host)),
        i.desc && h('p.instance-desc', i.desc),
        h('p.instance-meta.small',
          i.active != null && h('span', `${number(i.active)} active this month`),
          i.users != null && h('span', plural(i.users, 'user')),
          i.signup && h('span', { class: `signup-${i.signup}` }, { open: 'open sign-ups', application: 'sign-up by application', closed: 'sign-ups closed' }[i.signup]),
          i.private && h('span', { title: 'Content is only visible to members' }, 'private'),
          i.langs?.length ? h('span', i.langs.slice(0, 3).map(langName).join(', ')) : null,
          i.tags?.slice(0, 3).map((t) => h('span.instance-tag', t)))),
      starButton(i.host, i.name));
  };

  const starredSection = () => {
    const hosts = starred.value.list;
    if (!hosts.length) return null;
    const known = new Map(state.value.list.map((i) => [i.host, i]));
    return [
      h('h2', 'starred'),
      h('ul.instance-cards.starred-instances', hosts.map((host) => card(known.get(host) || { host, name: host }))),
    ];
  };

  const results = () => {
    const { status, list, error } = state.value;
    if (status === 'loading') {
      return [spinner('Loading the instance list…'), fallback()];
    }
    if (status === 'failed') {
      return [errorBox(error, load), fallback()];
    }
    const stars = new Set(starred.value.list);
    const found = search(list, { q: q.value, sort: sort.value, lang: lang.value, signups: signups.value })
      .filter((i) => !stars.has(i.host));
    const visible = found.slice(0, shown.value);
    return [
      h('p.small.instance-count', { role: 'status' }, found.length ? plural(found.length, 'instance') : 'No instances match.'),
      h('ul.instance-cards', visible.map(card)),
      found.length > visible.length && h('p', h('button.btn', { type: 'button', onclick: () => { shown.value += PAGE; } }, `show more (${number(found.length - visible.length)} left)`)),
    ];
  };

  // While loading, or if the list can't be fetched: the built-in few.
  const fallback = () => h('ul.instance-list', popular.map((i) => h('li', h('button.link-button', { type: 'button', onclick: () => use(i) }, i))));

  const controls = h('div.instance-filters',
    h('input#instance-search', {
      type: 'search', placeholder: 'search names, descriptions and tags', 'aria-label': 'Search instances',
      autocapitalize: 'off', spellcheck: false,
      oninput: (e) => { q.value = e.target.value; restart(); },
    }),
    h('label.inline-field', 'sort ',
      h('select#instance-sort', { onchange: (e) => { sort.value = e.target.value; restart(); } },
        Object.entries(SORTS).map(([k, label]) => h('option', { value: k }, label)))),
    () => {
      const langs = languages(state.value.list).slice(0, 30);
      return langs.length ? h('label.inline-field', 'language ',
        h('select#instance-lang', { onchange: (e) => { lang.value = e.target.value; restart(); } },
          h('option', { value: '' }, 'any'),
          langs.map((l) => h('option', { value: l, selected: l === lang.peek() }, langName(l))))) : null;
    },
    h('label.checkbox', h('input', { type: 'checkbox', onchange: (e) => { signups.value = e.target.checked; restart(); } }), 'accepting sign-ups'));

  return h('section.instance-directory',
    starredSection,
    h('h2', 'find an instance'),
    controls,
    results,
    h('p.small.directory-credit',
      'Instance list from ', h('a', { href: DIRECTORY_HOME, target: '_blank', rel: 'noopener noreferrer' }, 'Lemmyverse'),
      ', updated daily; descriptions are written by each instance. Loading it contacts lemmyverse.net, and icons load from each instance.'));
}
