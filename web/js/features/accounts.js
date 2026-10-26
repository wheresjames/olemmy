// Several accounts (§7 Tier 2): the account list in the settings console
// (impl/accounts.js). Switching is in the header's account menu
// (components/header.js).

import { later } from '../core/h.js';
import { defineFeature } from './registry.js';

export default defineFeature({
  id: 'accounts',
  name: 'Accounts',
  category: 'Accounts',
  description: 'Every account you\'ve logged in with, on any instance. Switch between them from the menu under your name.',
  alwaysOn: true,
  keywords: 'account switch multiple login logout',
  options: { list: { type: 'custom', default: null, label: '', render: () => later(() => import('./impl/accounts.js').then((m) => m.accountList())) } },
});
