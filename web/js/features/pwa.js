// Install as an app, and an offline shell (Tier 3). The service worker
// (sw.js) only runs on a built site, where the updater has a file list for
// it; it keeps those files for when the network is down, and never serves
// them while it's up. Lemmy content isn't kept offline.
//
// Where the browser can install it (it fires beforeinstallprompt: Chromium
// browsers, not Safari or Firefox), a toast offers to, at most once a day,
// until it's installed or the user says never (the "offer" option).

import { h } from '../core/h.js';
import { signal } from '../core/signal.js';
import { readJSON, writeJSON, PREFIX } from '../core/store.js';
import { defineFeature, enabled, option, setOption } from './registry.js';
import { installed } from '../update.js';
import { toast, toastError } from '../components/toast.js';

const OFFER_KEY = `${PREFIX}install-offer`;
const DAY = 24 * 60 * 60 * 1000;
/** How long after the browser says it's installable before the toast, so it isn't the first thing on screen. */
const OFFER_DELAY = 5000;
/** Where Olemmy's worker runs: the site's folder. Another site on this origin has its own. */
const SCOPE = new URL('./', document.baseURI).href;
const ours = async () => (await navigator.serviceWorker.getRegistrations()).filter((r) => r.scope.startsWith(SCOPE));

let promptEvent = null;
let offered = false;
let offerToast = null;
/** Can the browser install Olemmy right now? Reactive. */
export const canInstall = signal(false);
/** Running as the app, or installed from this browser. Reactive. */
const appInstalled = signal(matchMedia('(display-mode: standalone)').matches || !!readJSON(OFFER_KEY)?.done);

function markInstalled() {
  promptEvent = null;
  canInstall.value = false;
  appInstalled.value = true;
  offerToast?.remove();
  offerToast = null;
  writeJSON(OFFER_KEY, { ...readJSON(OFFER_KEY), done: true });
}

/** Show the browser's install dialog. Resolves true if the user installed. */
export async function install() {
  if (!promptEvent) return false;
  const e = promptEvent;
  promptEvent = null;
  canInstall.value = false;
  offerToast?.remove();
  offerToast = null;
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    if (outcome === 'accepted') markInstalled();
    return outcome === 'accepted';
  } catch (err) {
    toastError(err, 'Couldn\'t install');
    return false;
  }
}

function offer() {
  // Not in a background tab: wait until it's looked at.
  if (document.visibilityState === 'hidden') {
    document.addEventListener('visibilitychange', offer, { once: true });
    return;
  }
  // Read now, not when the browser said it was installable: another tab may have offered since.
  const state = readJSON(OFFER_KEY) || {};
  if (offered || state.done || !canInstall.value || !enabled('pwa') || !option('pwa', 'offer')) return;
  if (state.last && Date.now() - state.last < DAY) return;
  offered = true;
  writeJSON(OFFER_KEY, { ...state, last: Date.now() });
  const offline = installed()?.files ? ', and works offline' : '';
  offerToast = toast(`Install Olemmy as an app? It opens in its own window${offline}.`, {
    ms: 0,
    actions: [
      { label: 'install', run: install },
      { label: 'later', run: () => {} },
      { label: 'never', run: () => setOption('pwa', 'offer', false) },
    ],
  });
}

/** The install button, or why there isn't one. Reactive; used here and in the options tab. */
export function installControl() {
  return () => (appInstalled.value ? h('p.small', 'Olemmy is installed as an app.')
    : !enabled('pwa') ? h('p.small', 'Turn on "App and offline" (features) to install.')
      : canInstall.value ? h('button.btn.btn-small', { type: 'button', onclick: install }, 'install Olemmy as an app')
        : h('p.small', 'To install, use your browser\'s "Install" or "Add to Home Screen" menu item.'));
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
    for (const r of await ours()) r.unregister();
    return;
  }
  const reg = await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;
  precache(reg);
}

function control() {
  return () => h('div',
    installControl(),
    h('p.small', installed()?.files ? 'The app\'s files are kept for offline use.' : 'Offline use works on the published site, not a development copy.'));
}

export default defineFeature({
  id: 'pwa',
  name: 'App and offline',
  category: 'Browsing',
  description: 'Install Olemmy like an app, and open it without a connection (you\'ll see your instance\'s content again once you\'re back online).',
  keywords: 'pwa install app offline home screen service worker',
  options: {
    install: { type: 'custom', default: null, label: '', render: control },
    offer: { type: 'boolean', default: true, label: 'Offer to install', description: 'A reminder at most once a day, in browsers that can install it, until it\'s installed.' },
  },
  start() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      promptEvent = e;
      canInstall.value = true;
      // So it isn't installed (any more). The toast stays away after an
      // uninstall all the same (state.done).
      appInstalled.value = false;
      setTimeout(offer, OFFER_DELAY);
    });
    // Installed some other way (the browser's own menu or address bar icon).
    window.addEventListener('appinstalled', markInstalled);
    // Installed from another tab.
    window.addEventListener('storage', (e) => {
      if (e.key === OFFER_KEY && readJSON(OFFER_KEY)?.done && !appInstalled.peek()) markInstalled();
    });
    if (enabled('pwa')) register().catch((e) => console.warn('service worker', e));
    else if ('serviceWorker' in navigator) ours().then((rs) => rs.forEach((r) => r.unregister()));
  },
});
