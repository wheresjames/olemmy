// While the demo is the instance in use (main.js): a bar on every page
// saying so, with "leave the demo" (and "reset the demo" once you've
// changed something), and the DEMO button and its panel: who you are
// (user, moderator of chosen communities, or admin), logging in and out,
// resetting, and leaving.
//
// Leaving keeps what you did: "continue the demo" takes you back to it.
// Only a reset throws it away. A role change reloads the page: every view
// then asks again, with the new role.

import { h } from '../core/h.js';
import { signal } from '../core/signal.js';
import { navigate } from '../core/router.js';
import { account, accounts, loggedIn, setActiveAccount, logout, removeAccount } from '../state/session.js';
import { setSettings } from '../state/settings.js';
import { banner, removeBanner, toast } from '../components/toast.js';
import { confirmAction } from '../components/dialog.js';
import { getRole, setRole, takeDiscarded } from './server.js';
import { DEMO_HOST, demoAccount, demoChanged, resetDemo } from './index.js';
import { hostOf } from '../api/client.js';

let root = null;
const open = signal(false);

const ROLES = [['user', 'a user'], ['mod', 'a moderator'], ['admin', 'an admin']];

/** Back to the real instances. What you did in the demo is kept for next time. */
export async function leaveDemo() {
  const inDemo = (a) => hostOf(a.instance) === DEMO_HOST;
  if (account.peek() && inDemo(account.peek())) await logout();
  for (let i = accounts.peek().list.length - 1; i >= 0; i--) {
    if (inDemo(accounts.peek().list[i])) await removeAccount(i);
  }
  setSettings({ instance: '' });
  navigate('/instance');
  if (demoChanged.peek()) toast('Your changes in the demo are kept. "Continue the demo" takes you back.', { ms: 6000 });
}

/** Ask, then start the demo over. Resolves to whether it was reset. */
export async function confirmReset() {
  if (!await confirmAction('Reset the demo?', 'Every vote, comment, post and moderator action you made in the demo goes, and it starts as new.', 'Reset')) return false;
  await resetDemo();
  return true;
}

const resetAndReload = async () => { if (await confirmReset()) location.reload(); };

function body() {
  const { role, communities } = getRole();
  const roleSelect = h('select#demo-role', ROLES.map(([v, label]) => h('option', { value: v, selected: v === role }, label)));
  const boxes = communities.map((c) => h('input', { type: 'checkbox', value: c.id, checked: c.moderated }));
  const modList = h('fieldset.demo-mods', { disabled: role !== 'mod' },
    h('legend', 'moderating'),
    communities.map((c, i) => h('label', boxes[i], ` ${c.title}`)));
  roleSelect.addEventListener('change', () => { modList.disabled = roleSelect.value !== 'mod'; });

  const apply = () => {
    setRole(roleSelect.value, boxes.filter((b) => b.checked).map((b) => b.value));
    location.reload();
  };

  return h('div.demo-panel-body',
    h('p.demo-panel-title', h('strong', 'Demo'), h('span.small', 'nothing here is real')),
    h('label.demo-row', { for: 'demo-role' }, 'You are ', roleSelect),
    modList,
    h('p.demo-row', h('button.btn.btn-primary.btn-small', { type: 'button', onclick: apply }, 'apply')),
    h('p.demo-row',
      () => (loggedIn.value
        ? h('button.btn.btn-small', { type: 'button', onclick: () => logout() }, 'log out')
        : h('button.btn.btn-small', { type: 'button', onclick: () => setActiveAccount(demoAccount()) }, 'log in')),
      () => (demoChanged.value ? h('button.btn.btn-small.demo-reset', { type: 'button', onclick: resetAndReload }, 'reset') : null),
      h('button.btn.btn-small', { type: 'button', onclick: leaveDemo }, 'leave the demo')),
    h('p.small.demo-panel-note', 'Made-up people and posts. What you do stays in this browser, even after you leave, until you reset the demo.'));
}

export function showPanel() {
  banner('demo', [
    h('strong', 'Demo: '), 'made-up people and posts, so you can try Olemmy out. Nothing you do here leaves your browser. ',
    h('button.link-button.demo-leave', { type: 'button', onclick: leaveDemo }, 'Leave the demo'),
    () => (demoChanged.value ? [' · ', h('button.link-button.demo-reset', { type: 'button', onclick: resetAndReload }, 'Reset the demo')] : null),
  ], { kind: 'demo', dismissible: false });
  if (takeDiscarded()) toast('The demo was updated, so it started fresh: your earlier changes there are gone.', { ms: 8000 });
  if (root) return;
  const panel = () => (open.value ? h('div.demo-panel', { role: 'dialog', 'aria-label': 'Demo' }, body()) : null);
  root = h('div.demo-ui',
    panel,
    h('button.demo-button', {
      type: 'button',
      'aria-expanded': () => String(open.value),
      title: 'Demo: your role, logging in, resetting',
      onclick: () => { open.value = !open.peek(); },
    }, 'DEMO'));
  document.body.append(root);
}

export function hidePanel() {
  removeBanner('demo');
  root?.remove();
  root = null;
  open.value = false;
}
