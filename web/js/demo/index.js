// The demo (docs/demo.md): a pretend Lemmy instance in the page, so anyone
// can try Olemmy without an account and without anything leaving their
// browser. This part is always loaded and stays small: the addresses, the
// hook request() calls, and whether you've changed anything (so the
// instance picker can offer to continue or start over without loading the
// demo). The server itself (server.js) loads the first time it's used.

import { signal } from '../core/signal.js';

/** The demo's own instance; beta and gamma are its "remote" ones. */
export const DEMO_HOST = 'demo.olemmy.invalid';
export const DEMO_BASE = `https://${DEMO_HOST}`;
/**
 * The demo's login tokens: any username and password log in, as that name,
 * and the token carries it ("olemmy-demo-token:bob"), so the demo answers
 * as whoever the account says.
 */
export const DEMO_JWT = 'olemmy-demo-token';
export const demoToken = (name) => `${DEMO_JWT}:${name}`;
/** The name "try the demo" uses the first time. */
export const DEMO_USER = 'visitor';

const CHANGED = 'olemmy:demo-changed';
const NAME = 'olemmy:demo-name';
const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => {
  try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* no storage */ }
};

/** Have you changed anything in the demo (voted, posted, saved...)? Then reset is offered. */
export const demoChanged = signal(read(CHANGED) === '1');

export function markDemoChanged(on) {
  if (demoChanged.peek() === on) return;
  write(CHANGED, on ? '1' : null);
  demoChanged.value = on;
}

/** The name you last used in the demo, so coming back makes you that name again. */
export function rememberDemoName(name) { write(NAME, name === DEMO_USER ? null : name); }

/** The demo account: as whoever you were last time. */
export function demoAccount() {
  const name = read(NAME) || DEMO_USER;
  return { instance: DEMO_HOST, username: name, jwt: demoToken(name), remember: true };
}

/** Start the demo over: everything you did in it goes. */
export async function resetDemo() {
  const [{ resetWorld }, { clearCache }] = await Promise.all([import('./server.js'), import('../api/client.js')]);
  resetWorld();
  clearCache();   // the app's short-lived copies of the old answers, too
}

// Another tab resetting or changing the demo.
try {
  addEventListener('storage', (e) => { if (e.key === CHANGED || e.key === null) demoChanged.value = read(CHANGED) === '1'; });
} catch { /* not in a page */ }

/** Is [base] (an instance base URL) one of the demo's? .invalid never resolves. */
export function isDemoBase(base) {
  return typeof base === 'string' && /^https:\/\/(demo|beta|gamma)\.olemmy\.invalid$/.test(base);
}

/** Is [url] an address on one of the demo's instances (an original post, a profile)? */
export function isDemoAddress(url) {
  return typeof url === 'string' && /^https:\/\/(demo|beta|gamma)\.olemmy\.invalid(\/|$)/.test(url);
}

const OLD_HOST = 'test.olemmy.invalid';

/**
 * What the developer-only test server left behind when it became the demo:
 * its saved world and flag go, and accounts on its old address become demo
 * accounts (same name, a demo token), so you stay logged in. Without this
 * the old address is answered logged out: "your login has expired", forever.
 */
export function migrateTestServer(storage) {
  storage.removeItem('olemmy:testserver');
  storage.removeItem('olemmy:testserver-offered');
  const readJson = (key) => { try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; } };
  const accounts = readJson('olemmy:accounts');
  const list = accounts?.data?.list;
  if (Array.isArray(list) && list.some((a) => a?.instance === OLD_HOST)) {
    const active = list[accounts.data.active];
    const moved = [];
    for (const a of list) {
      const b = a?.instance === OLD_HOST ? { ...a, instance: DEMO_HOST, jwt: demoToken(a.username), remember: true } : a;
      const same = moved.findIndex((x) => x.instance === b.instance && x.username.toLowerCase() === b.username.toLowerCase());
      if (same < 0) moved.push(b);
      else if (a === active) moved[same] = b;
    }
    const where = active ? moved.findIndex((x) => x.username.toLowerCase() === active.username.toLowerCase() && x.instance === (active.instance === OLD_HOST ? DEMO_HOST : active.instance)) : -1;
    storage.setItem('olemmy:accounts', JSON.stringify({ ...accounts, data: { ...accounts.data, list: moved, active: where } }));
  }
  const settings = readJson('olemmy:settings');
  if (settings?.data?.instance === OLD_HOST) {
    storage.setItem('olemmy:settings', JSON.stringify({ ...settings, data: { ...settings.data, instance: DEMO_HOST } }));
  }
}

try { migrateTestServer(localStorage); } catch { /* no storage */ }

/** fetch() for the demo: the same Response the network would give. */
export async function demoFetch(url, init = {}) {
  const { handle } = await import('./server.js');
  return handle(String(url), init);
}
