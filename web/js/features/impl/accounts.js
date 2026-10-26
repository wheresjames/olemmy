// The settings console's account list (features/accounts.js).

import { h } from '../../core/h.js';
import { href } from '../../core/router.js';
import { accounts, switchAccount, removeAccount, hasToken } from '../../state/session.js';
import { hostOf } from '../../api/client.js';
import { confirmAction } from '../../components/dialog.js';

export function accountList() {
  return () => {
    const { list, active } = accounts.value;
    return h('div',
      list.length ? h('ul.account-editor', list.map((a, i) => h('li',
        h('span', h('strong', a.username), `@${hostOf(a.instance)}`,
          i === active && h('span.small', ' (in use)'),
          !hasToken(a) && h('span.small', ' (needs logging in again)'),
          !a.remember && hasToken(a) && h('span.small', ' (until the browser closes)')),
        i !== active && h('button.btn.btn-small', { type: 'button', onclick: () => switchAccount(i) }, 'use'),
        h('button.btn.btn-small', {
          type: 'button',
          onclick: async () => { if (await confirmAction(`Remove ${a.username}@${hostOf(a.instance)}?`, i === active ? 'This logs it out.' : 'Its login is forgotten in this browser.', 'Remove')) removeAccount(i); },
        }, 'remove'))))
        : h('p.small', 'No accounts yet.'),
      h('p', h('a.btn.btn-small', { href: href('/login', { add: 1 }) }, '+ add an account')));
  };
}

