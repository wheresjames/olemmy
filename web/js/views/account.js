// Lemmy account settings, saved on the instance (PUT /user/save_user_settings):
// profile, content preferences, password, and blocks. Kept apart from
// Olemmy's own preferences (settings.js).

import { h } from '../core/h.js';
import { signal } from '../core/signal.js';
import { href } from '../core/router.js';
import { api, me, refreshSite, account, setActiveAccount } from '../state/session.js';
import { requireLogin, blockCommunity, blockPerson, blockInstance } from '../state/actions.js';
import { setTitle, spinner, errorBox } from '../components/common.js';
import { editor } from '../components/editor.js';
import { toast, toastError } from '../components/toast.js';
import { SORT_LABELS } from '../util/format.js';
import { POST_SORTS } from '../api/v3.js';
import { safeUrl } from '../util/links.js';

export function accountView(route, ctx) {
  const { chrome } = ctx;
  if (!requireLogin('Log in to change your account settings')) return h('div');
  setTitle('account settings');
  chrome.pageName.value = { text: 'account', href: href('/account') };
  chrome.tabs.value = null;
  chrome.sidebar.value = h('div.side', h('div.side-box', h('p', 'These settings are saved on your Lemmy account and apply in every app. ', h('a', { href: href('/settings') }, 'Olemmy preferences'), ' are saved in this browser.')));
  return h('div.form-page.account-page', () => {
    const m = me.value;
    if (!m) return spinner();
    return [profileForm(m), passwordForm(), blocksSection(m)];
  });
}

function profileForm(m) {
  const s = m.settings;
  const p = m.person;
  const displayName = h('input#acct-display', { type: 'text', value: p.displayName, maxlength: 50 });
  const email = h('input#acct-email', { type: 'email', value: s.email });
  const bio = editor({ initial: p.bio, label: 'Bio', rows: 4, id: 'acct-bio' });
  const checks = {
    show_nsfw: ['show NSFW content', s.showNsfw],
    blur_nsfw: ['blur NSFW images', s.blurNsfw],
    show_bot_accounts: ['show bot accounts', s.showBotAccounts],
    show_read_posts: ['show posts I\'ve read', s.showReadPosts],
    show_scores: ['show scores', s.showScores],
    show_avatars: ['show avatars', s.showAvatars],
    send_notifications_to_email: ['send notifications to my email', s.sendNotificationsToEmail],
  };
  const boxes = Object.fromEntries(Object.entries(checks).map(([k, [, v]]) => [k, h('input', { type: 'checkbox', checked: v, id: `acct-${k}` })]));
  const sort = h('select#acct-sort', POST_SORTS.map((x) => h('option', { value: x, selected: x === s.defaultSortType }, SORT_LABELS[x] || x)));
  const listing = h('select#acct-listing', ['Subscribed', 'Local', 'All'].map((x) => h('option', { value: x, selected: x === s.defaultListingType }, x)));
  const busy = signal(false);
  return h('form.account-form', {
    onsubmit: async (e) => {
      e.preventDefault();
      busy.value = true;
      try {
        await api.peek().saveUserSettings({
          display_name: displayName.value.trim(),
          email: email.value.trim() || undefined,
          bio: bio.value(),
          default_sort_type: sort.value,
          default_listing_type: listing.value,
          ...Object.fromEntries(Object.entries(boxes).map(([k, el]) => [k, el.checked])),
        });
        await refreshSite();
        toast('Account settings saved', { kind: 'success' });
      } catch (err) { toastError(err); } finally { busy.value = false; }
    },
  },
  h('h1', `account settings for ${p.fullName}`),
  h('h2', 'profile'),
  h('label', { for: 'acct-display' }, 'display name'), displayName,
  h('label', { for: 'acct-email' }, 'email'), email,
  h('label', { for: 'acct-bio' }, 'bio'), bio.el,
  h('p.small', 'Change your avatar, banner and two-factor authentication on ', h('a', { href: safeUrl(`${p.actorId.replace(/\/u\/.*$/, '')}/settings`) || undefined, target: '_blank', rel: 'noopener noreferrer' }, 'your instance\'s site'), '.'),
  h('h2', 'content'),
  Object.entries(checks).map(([k, [text]]) => h('label.checkbox', boxes[k], ` ${text}`)),
  h('label', { for: 'acct-sort' }, 'default sort'), sort,
  h('label', { for: 'acct-listing' }, 'default front page'), listing,
  h('div.form-buttons', h('button.btn.btn-primary', { type: 'submit', disabled: () => busy.value }, () => (busy.value ? 'saving…' : 'save'))));
}

function passwordForm() {
  const old = h('input#pw-old', { type: 'password', required: true, autocomplete: 'current-password' });
  const next = h('input#pw-new', { type: 'password', required: true, minlength: 10, maxlength: 60, autocomplete: 'new-password' });
  const error = signal(null);
  return h('form.account-form', {
    onsubmit: async (e) => {
      e.preventDefault();
      error.value = null;
      try {
        const r = await api.peek().changePassword(old.value, next.value);
        // The instance logs out every other session and answers with a new
        // token: without it, this one would be logged out on the next request.
        const a = account.peek();
        if (r?.jwt && a) setActiveAccount({ ...a, jwt: r.jwt });
        old.value = ''; next.value = '';
        toast('Password changed', { kind: 'success' });
      } catch (err) { error.value = err; }
    },
  },
  h('h2', 'change password'),
  h('label', { for: 'pw-old' }, 'current password'), old,
  h('label', { for: 'pw-new' }, 'new password (10 to 60 characters)'), next,
  () => (error.value ? errorBox(error.value) : null),
  h('div.form-buttons', h('button.btn', { type: 'submit' }, 'change password')));
}

function blocksSection(m) {
  const list = (items, text, unblock) => (items.length
    ? h('ul.block-list', items.map((x) => h('li', text(x), ' ', h('button.btn.btn-small', { type: 'button', onclick: () => unblock(x) }, 'unblock'))))
    : h('p.small', 'none'));
  return h('section.account-blocks',
    h('h2', 'blocked'),
    h('h3', 'users'), list(m.personBlocks, (p) => p.fullName, (p) => blockPerson(p, false)),
    h('h3', 'communities'), list(m.communityBlocks, (c) => c.fullName, (c) => blockCommunity(c, false)),
    h('h3', 'instances'), list(m.instanceBlocks, (i) => i.domain, (i) => blockInstance(i.id, i.domain, false)));
}
