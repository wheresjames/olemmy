// Install as an app, and an offline shell (Tier 3). The service worker
// (sw.js) only runs on a built site, where the updater has a file list for
// it; it keeps those files for when the network is down, and never serves
// them while it's up. Lemmy content isn't kept offline.

import { h } from '../core/h.js';
import { signal } from '../core/signal.js';
import { defineFeature, enabled } from './registry.js';
import { installed } from '../update.js';

let promptEvent = null;
const canInstall = signal(false);
const standalone = matchMedia('(display-mode: standalone)').matches;

export async function install() {
  if (!promptEvent) return;
  promptEvent.prompt();
  await promptEvent.userChoice;
  promptEvent = null;
  canInstall.value = false;
}

/** Send the build's file list to the worker, to keep for offline use. */
function precache(reg) {
  const files = installed()?.files;
  const worker = reg.active || reg.waiting || reg.installing;
  if (!files || !worker) return;
  worker.postMessage({ type: 'precache', paths: Object.keys(files) });
}

async function register() {
  if (!('serviceWorker' in navigator)) return;
  // Unbuilt site (development): no file list, no worker. Clear any old one.
  if (!installed()?.files) {
    for (const r of await navigator.serviceWorker.getRegistrations()) r.unregister();
    return;
  }
  const reg = await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;
  precache(reg);
}

function control() {
  return () => h('div',
    standalone ? h('p.small', 'Olemmy is running as an installed app.')
      : canInstall.value ? h('button.btn.btn-small', { type: 'button', onclick: install }, 'install Olemmy as an app')
        : h('p.small', 'To install, use your browser\'s "Install" or "Add to Home Screen" menu item.'),
    h('p.small', installed()?.files ? 'The app\'s files are kept for offline use.' : 'Offline use works on the published site, not a development copy.'));
}

export default defineFeature({
  id: 'pwa',
  name: 'App and offline',
  category: 'Browsing',
  description: 'Install Olemmy like an app, and open it without a connection (you\'ll see your instance\'s content again once you\'re back online).',
  keywords: 'pwa install app offline home screen service worker',
  options: { install: { type: 'custom', default: null, label: '', render: control } },
  start() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      promptEvent = e;
      canInstall.value = true;
    });
    if (enabled('pwa')) register().catch((e) => console.warn('service worker', e));
    else navigator.serviceWorker?.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
  },
});
