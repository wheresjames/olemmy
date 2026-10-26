// Browser notifications (Tier 3): when the inbox count goes up while
// Olemmy is in a background tab, a system notification says so. It rides
// on the unread polling the header already does (state/session.js).

import { h } from '../core/h.js';
import { effect, signal } from '../core/signal.js';
import { navigate } from '../core/router.js';
import { unreadTotal, loggedIn } from '../state/session.js';
import { defineFeature, enabled, setEnabled } from './registry.js';

const supported = typeof Notification !== 'undefined';
const permission = signal(supported ? Notification.permission : 'denied');

async function ask() {
  if (!supported) return;
  permission.value = await Notification.requestPermission();
  if (permission.value === 'granted') setEnabled('notifications', true);
}

function control() {
  return () => {
    if (!supported) return h('p.small', 'This browser doesn\'t support notifications.');
    if (permission.value === 'denied') return h('p.small', 'Notifications are blocked for this site in your browser\'s settings.');
    if (permission.value !== 'granted') return h('button.btn.btn-small', { type: 'button', onclick: ask }, 'allow notifications');
    return h('p.small', 'Allowed. You\'ll be told about new messages while Olemmy is in the background.');
  };
}

export default defineFeature({
  id: 'notifications',
  name: 'Browser notifications',
  category: 'Accounts',
  description: 'A notification when new replies, mentions or messages arrive while Olemmy is in a background tab.',
  defaultEnabled: false,
  keywords: 'notification alert inbox unread desktop push',
  options: { permission: { type: 'custom', default: null, label: '', render: control } },
  start() {
    let last = 0;
    effect(() => {
      const n = unreadTotal.value;
      const on = enabled('notifications') && loggedIn.value && permission.value === 'granted';
      if (on && n > last && document.visibilityState === 'hidden') {
        const note = new Notification('Olemmy', {
          body: `${n} unread in your inbox`,
          icon: 'assets/icon-192.png',
          tag: 'olemmy-inbox',
        });
        note.onclick = () => { window.focus(); navigate('#/inbox?tab=unread'); note.close(); };
      }
      last = n;
    });
  },
});
