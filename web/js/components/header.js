// The page chrome: the community bar across the top, the header with logo,
// page name, tab menu and user area, and the sidebar drawer toggle.
// Views fill the page name, tabs and sidebar through the `chrome` object.

import { h, icon, fill } from '../core/h.js';
import { signal } from '../core/signal.js';
import { href, navigate } from '../core/router.js';
import { loggedIn, account, accounts, instance, subscriptions, unread, unreadTotal, logout, site, switchAccount, hasToken, moderated, isAdmin, reportCount, chooseInstance } from '../state/session.js';
import { starred } from '../state/starred-instances.js';
import { baseUrl, hostOf } from '../api/client.js';
import { LemmyV3 } from '../api/v3.js';
import { toastError } from './toast.js';
import { onErrors, unseenErrors } from '../core/errors.js';
import { communityHref } from './common.js';
import { shortcutBar } from '../features/shortcut-bar.js';
import { themeToggle } from '../features/themes.js';
import { favoriteMenuItems } from '../features/favorites.js';

/** What the current view shows in the header and sidebar. */
export const chrome = {
  pageName: signal(/** @type {null | { text: string, href: string }} */ (null)),
  tabs: signal(/** @type {Node|null} */ (null)),
  sidebar: signal(/** @type {Node|null} */ (null)),
  drawerOpen: signal(false),
};

function subscriptionsMenu() {
  return h('details.sr-dropdown',
    h('summary', 'my communities'),
    () => {
      const list = subscriptions.value;
      const favItems = favoriteMenuItems();
      return h('ul.sr-dropdown-menu',
        favItems.length > 0 && [h('li.sr-dropdown-heading', 'favorites'), favItems, h('li.sr-dropdown-heading', 'subscriptions')],
        !loggedIn.value ? h('li', h('a', { href: href('/login') }, 'Log in »'))
          : list.length ? list.map((c) => h('li', h('a', { href: communityHref(c) }, c.name, !c.local && h('span.host', `@${c.host}`))))
            : h('li', 'No subscriptions yet.'),
        h('li.sr-dropdown-footer', h('a', { href: href('/subscriptions') }, 'manage communities »'), h('a', { href: href('/communities') }, 'browse communities »')));
    });
}

/**
 * The username, with the account switcher: every stored account, each on
 * its own instance (§7 Tier 2).
 */
function accountMenu(a) {
  const { list, active } = accounts.value;
  if (list.length < 2) {
    return h('span.account-menu', h('a.username', { href: href(`/u/${a.username}@${hostOf(a.instance)}`), title: `${a.username}@${site.value?.host || hostOf(a.instance)}` }, a.username),
      h('a.add-account', { href: href('/login', { add: 1 }), title: 'Add another account', 'aria-label': 'Add another account' }, '+'));
  }
  return h('details.account-menu',
    h('summary', h('span.username', a.username), h('span.host', `@${hostOf(a.instance)}`)),
    h('ul.account-list', { 'aria-label': 'Switch account' },
      list.map((x, i) => h('li', { class: { current: i === active } },
        i === active
          ? h('a', { href: href(`/u/${x.username}@${hostOf(x.instance)}`) }, `${x.username}@${hostOf(x.instance)}`, h('span.small', ' (profile)'))
          : h('button.link-button', {
            type: 'button',
            onclick: (e) => { e.currentTarget.closest('details').open = false; switchAccount(i); },
          }, `${x.username}@${hostOf(x.instance)}`, !hasToken(x) && h('span.small', ' (log in again)')))),
      h('li.account-add', h('a', { href: href('/login', { add: 1 }) }, '+ add an account')),
      h('li.account-manage', h('a', { href: href('/settings', { feature: 'accounts' }) }, 'manage accounts'))));
}

/** Switch to starred instance [host], once it answers, and go to its front page. */
async function switchInstance(host) {
  try {
    await new LemmyV3(baseUrl(host)).site({ fresh: true });
    chooseInstance(host);
    navigate('#/');
  } catch (e) {
    toastError(e, `Couldn't switch to ${host}`);
  }
}

/**
 * The instance, linking to the picker; with starred instances, a menu of
 * them headed by the picker.
 */
function instanceMenu() {
  const label = () => site.value?.host || instance.value || 'choose an instance';
  const current = () => (instance.value ? hostOf(baseUrl(instance.value)) : '');
  return () => {
    const stars = starred.value.list;
    if (!stars.length) return h('span.instance-name', { title: 'Your instance' }, h('a', { href: href('/instance') }, label));
    return h('details.account-menu.instance-menu',
      h('summary', { title: 'Your instance' }, h('span.instance-name', label)),
      h('ul.account-list', { 'aria-label': 'Switch instance' },
        h('li.instance-choose', h('a', { href: href('/instance') }, 'choose an instance…')),
        stars.map((host) => h('li', { class: { current: () => host === current() } },
          () => (host === current()
            ? h('a', { href: href('/'), 'aria-current': 'true' }, host)
            : h('button.link-button', { type: 'button', onclick: () => switchInstance(host) }, host))))));
  };
}

/** ⚠ and a count while there are errors not yet seen at #/errors (core/errors.js). */
function errorsLink() {
  const changed = signal(0);
  onErrors(() => { changed.value++; });
  return () => {
    changed.value;
    const n = unseenErrors();
    if (!n) return null;
    const what = `${n} new ${n === 1 ? 'error' : 'errors'}`;
    return h('a.sr-errors', { href: href('/errors'), title: `${what}: see what went wrong`, 'aria-label': what }, icon('alert'), h('span.badge', String(n)));
  };
}

function srHeader() {
  return h('div#sr-header-area',
    subscriptionsMenu(),
    h('div.sr-strip',
      h('ul.sr-fixed',
        h('li', h('a', { href: href('/') }, 'home')),
      h('li', h('a', { href: href('/favorites') }, 'favorites')),
        h('li', h('a', { href: href('/local') }, 'local')),
        h('li', h('a', { href: href('/all') }, 'all')),
        h('li', h('a', { href: href('/communities') }, 'communities'))),
      shortcutBar()),
    // Outside the scrolling strip, so it's always visible.
    // Set off by a divider, the settings button boxed so it reads as one.
    h('span.sr-tools',
      errorsLink(),
      h('a.sr-settings', { href: href('/settings'), title: 'Olemmy settings', 'aria-label': 'Settings' },
        icon('gear'), h('span.sr-settings-label', { 'aria-hidden': 'true' }, 'settings'))));
}

function userArea() {
  return h('div#header-bottom-right',
    () => {
      if (!loggedIn.value) {
        return h('span.user',
          instanceMenu(),
          h('span.separator', '|'),
          h('a.login-link', { href: href('/login') }, 'log in'),
          ' or ',
          h('a', { href: href('/signup') }, 'sign up'),
          accounts.value.list.length > 0 && [h('span.separator', '|'), h('details.account-menu',
            h('summary', 'accounts'),
            h('ul.account-list', accounts.value.list.map((x, i) => h('li', h('button.link-button', {
              type: 'button', onclick: () => switchAccount(i),
            }, `${x.username}@${hostOf(x.instance)}`)))))]);
      }
      const a = account.value;
      return h('span.user',
        accountMenu(a),
        h('span.separator', '|'),
        h('a.inbox-link', {
          href: href('/inbox', { tab: unreadTotal.value ? 'unread' : '' }),
          class: { 'has-mail': () => unreadTotal.value > 0 },
          title: () => (unreadTotal.value ? `${unreadTotal.value} unread${unread.value.replies == null ? '' : ` (${unread.value.replies} replies, ${unread.value.mentions} mentions, ${unread.value.messages} messages)`}` : 'Inbox: no new messages'),
          'aria-label': () => (unreadTotal.value ? `Inbox, ${unreadTotal.value} unread` : 'Inbox'),
        }, icon('mail'), () => (unreadTotal.value ? h('span.badge', String(unreadTotal.value)) : null)),
        (moderated.value.size > 0 || isAdmin.value) && [h('span.separator', '|'), h('a.mod-link', {
          href: href('/reports'),
          class: { 'has-reports': () => reportCount.value > 0 },
          title: () => (reportCount.value ? `${reportCount.value} open reports` : 'Reports queue'),
          'aria-label': () => (reportCount.value ? `Reports, ${reportCount.value} open` : 'Reports'),
        }, icon('shield'), () => (reportCount.value ? h('span.badge', String(reportCount.value)) : null))],
        h('span.separator', '|'),
        h('a.prefs-link', { href: href('/settings'), title: 'Olemmy preferences' }, 'preferences'),
        h('span.separator', '|'),
        h('button.link-button.logout', { type: 'button', onclick: () => logout() }, 'logout'));
    },
    h('span.separator', '|'),
    themeToggle());
}

/** Build the header into [el]. */
export function mountHeader(el) {
  fill(el,
    srHeader(),
    h('div#header-bottom',
      h('div.header-left',
        h('a#header-img', { href: href('/'), 'aria-label': 'Olemmy home' },
          h('img', { src: 'assets/favicon.svg', alt: '', width: 32, height: 32 }),
          h('span.wordmark', { 'aria-hidden': 'true' }, 'olemmy')),
        () => {
          const p = chrome.pageName.value;
          return p ? h('span.pagename', h('a', { href: p.href }, p.text)) : null;
        },
        () => chrome.tabs.value),
      userArea(),
      h('button.sidebar-toggle', {
        type: 'button',
        'aria-controls': 'sidebar',
        'aria-expanded': () => String(chrome.drawerOpen.value),
        'aria-label': 'Show the sidebar',
        onclick: () => { chrome.drawerOpen.value = !chrome.drawerOpen.value; },
      }, icon('menu'))));
}
