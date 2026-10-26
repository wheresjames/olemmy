// Sidebar boxes: search, submit buttons, community info, instance info,
// moderators. The sidebar sits after the main content in the DOM and turns
// into a drawer on narrow screens (layout.css).

import { h, dynamic } from '../core/h.js';
import { signal } from '../core/signal.js';
import { href, navigate } from '../core/router.js';
import { loggedIn, site } from '../state/session.js';
import { follow, blockCommunity } from '../state/actions.js';
import { mdBlock, userLink, timeEl, avatar, communityHref } from './common.js';
import { number, plural } from '../util/format.js';
import { confirmAction } from './dialog.js';
import { favoriteButton } from '../features/favorites.js';
import { shareLink, appUrl } from './send-link.js';

/** The search box; scoped to [community] when given. */
export function searchBox(community) {
  const input = h('input.search-input', { type: 'search', name: 'q', placeholder: 'search', 'aria-label': 'Search', id: 'search-box' });
  const scoped = h('input', { type: 'checkbox', checked: !!community, id: 'search-scoped' });
  return h('form.side-search', {
    role: 'search',
    onsubmit: (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (q) navigate(href('/search', { q, community: community && scoped.checked ? community.fullName : '' }));
    },
  },
  input,
  community && h('label.search-scope', scoped, ` limit my search to ${community.name}`));
}

/** "Submit a new link" / "Submit a new text post". */
export function submitButtons(community) {
  const q = (type) => ({ type, community: community?.fullName });
  return h('div.side-submit',
    h('a.submit-button', { href: href('/submit', q('link')) }, 'Submit a new link'),
    h('a.submit-button', { href: href('/submit', q('text')) }, 'Submit a new text post'));
}

/** Community box: title, subscribe, counts, description. */
export function communityBox(community, moderators = []) {
  const subscribed = signal(community.subscribed);
  const busy = signal(false);
  const toggle = async () => {
    const on = subscribed.peek() === 'NotSubscribed';
    if (!on && !await confirmAction(`Unsubscribe from ${community.name}?`, '', 'Unsubscribe')) return;
    busy.value = true;
    const c = await follow(community, on);
    busy.value = false;
    if (c) subscribed.value = c.subscribed;
  };
  return h('div.side-box.community-box',
    community.banner && h('img.side-banner', { src: community.banner, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }),
    h('h2.side-title', avatar(community.icon, '', 'side-icon'), h('a', { href: href(`/c/${community.fullName}`) }, community.title)),
    h('p.side-name', `!${community.fullName}`),
    h('div.side-subscribe',
      h('button.btn.subscribe-button', {
        type: 'button',
        disabled: () => busy.value,
        class: { subscribed: () => subscribed.value !== 'NotSubscribed' },
        onclick: toggle,
      }, () => ({ Subscribed: 'unsubscribe', Pending: 'pending', NotSubscribed: 'subscribe' }[subscribed.value] || 'subscribe')),
      favoriteButton(community.fullName),
      h('span.side-counts',
        h('span', { title: `${number(community.subscribers)} subscribers` }, plural(community.subscribers, 'subscriber')),
        h('span', { title: 'users active this week' }, `${number(community.usersActiveWeek)} active this week`))),
    community.nsfw && h('p.stamp.nsfw-stamp', 'NSFW community'),
    community.postingRestrictedToMods && h('p.small', 'Only moderators can post here.'),
    community.description && mdBlock(community.description, 'side-md'),
    h('p.small.side-created', 'created ', timeEl(community.published), ' · ',
      h('button.link-button.share-button', { type: 'button', onclick: () => shareLink(appUrl(communityHref(community)), community.title) }, 'share')),
    loggedIn.peek() && h('p.small', h('button.link-button', {
      type: 'button',
      onclick: async () => { if (await confirmAction(`Block ${community.fullName}?`, 'You will no longer see its posts. Saved on your account.', 'Block')) blockCommunity(community); },
    }, 'block this community')),
    moderators.length > 0 && moderatorBox(moderators, community));
}

export function moderatorBox(moderators, community) {
  return h('div.side-mods',
    h('h3', 'moderators'),
    h('ul', moderators.slice(0, 15).map((m) => h('li', userLink(m)))),
    moderators.length > 15 && h('p.small', `and ${moderators.length - 15} more`),
    community && h('p.small', h('a', { href: href('/message/compose', { to: moderators[0]?.fullName }) }, 'message the moderators')));
}

/** The instance's box, for the front page and All/Local. */
export function siteBox() {
  return dynamic(() => {
    const s = site.value;
    if (!s) return null;
    return h('div.side-box.site-box',
      s.banner && h('img.side-banner', { src: s.banner, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }),
      h('h2.side-title', avatar(s.icon, '', 'side-icon'), s.name || s.host),
      s.description && h('p.side-desc', s.description),
      h('p.site-counts',
        h('span', plural(s.usersActiveDay, 'user'), ' today'), ' · ',
        h('span', plural(s.usersActiveMonth, 'user'), ' this month'), ' · ',
        h('span', plural(s.communities, 'community', 'communities'))),
      s.sidebar && mdBlock(s.sidebar, 'side-md'),
      s.admins.length > 0 && h('div.side-mods', h('h3', 'admins'), h('ul', s.admins.slice(0, 10).map((a) => h('li', userLink(a))))),
      s.legal && h('details.side-legal', h('summary', 'legal'), mdBlock(s.legal)),
      h('p.small', `Lemmy ${s.version} · `,
        h('button.link-button.share-button', {
          type: 'button',
          title: `A link that offers to browse ${s.host} in Olemmy`,
          onclick: () => shareLink(appUrl(href('/instance', { use: s.host })), `${s.name || s.host} in Olemmy`),
        }, 'share this instance')));
  });
}

/** Wrap boxes in the sidebar's standard order. */
export function sidebar(...boxes) {
  return h('div.side', ...boxes);
}
