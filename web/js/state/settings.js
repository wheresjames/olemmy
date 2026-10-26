// The app's own preferences (olemmy:settings). Lemmy account settings are
// separate and live on the instance (views/account.js).
//
// theme-init.js reads `data.theme` from this key before first paint, so the
// stored shape { v, data: { theme } } must keep that path.

import { persisted } from '../core/store.js';
import { computed } from '../core/signal.js';

export const SETTINGS_VERSION = 1;

export const DEFAULTS = {
  theme: 'auto',              // auto | light | dark
  instance: '',               // home instance when logged out (logged in, the account's)
  density: 'normal',          // compact | normal | comfortable
  fontSize: 100,              // percent of the base size
  maxWidth: 1600,             // px; 0 = no limit
  defaultSort: '',            // '' = the account's or instance's default
  defaultListing: '',
  commentSort: 'Hot',
  showNsfw: false,            // logged out only; logged in, the account decides (§15 #13)
  blurNsfw: true,
  showThumbnails: true,
  openLinksInNewTab: false,
  showScores: true,
  apiVersion: 'v3',           // 'v3', or 'auto': API v4 on Lemmy 1.x instances (§15 #3)
  displayMode: 'normal',      // normal | compact | text
  hideNsfwThumbnails: false,  // local, on top of the account's blur (§15 #13)
  hideWelcome: false,         // the front page's "browsing without an account" note, closed with its ×
  features: {},               // per feature: { enabled, ...options } (features/registry.js)
};

export const settings = persisted('settings', { version: SETTINGS_VERSION, defaults: DEFAULTS });

/** Change one or more settings. */
export function setSettings(patch) {
  settings.update((s) => ({ ...s, ...patch }));
}

/** A computed view of one setting. */
export function setting(key) {
  return computed(() => settings.value[key]);
}
