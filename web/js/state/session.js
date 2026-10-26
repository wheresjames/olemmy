// Who is browsing, where: the accounts, the instance in use, its /site
// information, and the unread inbox count.
//
// Accounts are stored in olemmy:accounts as { instance, username, jwt,
// remember }. With "Remember me" off the token isn't stored there but in
// sessionStorage, so it goes when the browser session does (§15 #9).

import { signal, computed, effect, batch, untrack } from '../core/signal.js';
import { persisted, readRaw, writeRaw } from '../core/store.js';
import { baseUrl, hostOf, clearCache } from '../api/client.js';
import { LemmyV3 } from '../api/v3.js';
import { settings, setSettings } from './settings.js';

/** @typedef {{ instance: string, username: string, jwt: string|null, remember: boolean }} Account */

export const accounts = persisted('accounts', { version: 1, defaults: { active: -1, list: [] } });

const sessionJwtKey = (a) => `olemmy:jwt:${hostOf(a.instance)}:${a.username.toLowerCase()}`;

/** @type {{ value: Account|null }} */
export const account = computed(() => {
  const { active, list } = accounts.value;
  return list[active] || null;
});

export const instance = computed(() => account.value?.instance || settings.value.instance || '');
export const base = computed(() => baseUrl(instance.value));
export const loggedIn = computed(() => !!account.value && !!jwtFor(account.value));
/** Set when the instance rejects the stored token. */
export const loginExpired = signal(false);

function jwtFor(a) {
  if (!a) return null;
  return a.remember ? a.jwt : readRaw(sessionJwtKey(a), 'session');
}

export function jwt() {
  return loginExpired.peek() ? null : jwtFor(account.peek());
}

/**
 * Which API each instance speaks, once probed: host -> 3 | 4. With the
 * apiVersion setting on 'auto', an instance that answers /api/v4/site
 * (Lemmy 1.x) gets the v4 adapter (§15 #3); otherwise everything uses v3,
 * which Lemmy 1.x also keeps.
 */
const apiVersions = signal(/** @type {Record<string, number>} */ ({}));
const PROBED = 'olemmy:api-versions';
/** The v4 adapter, loaded only when an instance needs it. */
let LemmyV4 = null;
const loadV4 = async () => { LemmyV4 ??= (await import('../api/v4.js')).LemmyV4; };

async function probeVersion(b) {
  const cached = readRaw(PROBED, 'session');
  let known = {};
  try { known = (cached && JSON.parse(cached)) || {}; } catch { /* unreadable: probe again */ }
  if (known[b]) {
    if (known[b] === 4) await loadV4();
    apiVersions.value = { ...apiVersions.peek(), [b]: known[b] };
    return;
  }
  let v = 3;
  try {
    const r = await fetch(`${b}/api/v4/site`, { credentials: 'omit', signal: AbortSignal.timeout(5000) });
    if (r.ok && (await r.json())?.site_view) v = 4;
  } catch { /* no v4 */ }
  writeRaw(PROBED, JSON.stringify({ ...known, [b]: v }), 'session');
  if (v === 4) await loadV4();
  apiVersions.value = { ...apiVersions.peek(), [b]: v };
}

// Only this setting, so changing any other one doesn't replace the client
// (which re-renders the current view).
const apiVersion = computed(() => settings.value.apiVersion);

/** The API for the instance in use (a new one when the instance, login or API version changes). */
export const api = computed(() => {
  const b = base.value;
  const activeAccount = account.value;
  if (!b) return null;
  // A client may outlive its view (for example, a cached favorites merge).
  // Never let it borrow a different account's token after a switch.
  const clientJwt = () => account.peek() === activeAccount && !loginExpired.peek() ? jwtFor(activeAccount) : null;
  if (apiVersion.value === 'auto') {
    const v = apiVersions.value[b];
    if (v === undefined) queueMicrotask(() => probeVersion(b));
    if (v === 4 && LemmyV4) return new LemmyV4(b, clientJwt);
  }
  return new LemmyV3(b, clientJwt);
});

/** /site of the instance in use (with my_user when logged in), or null while loading. */
export const site = signal(null);
/** An error from loading /site, for the instance picker and error page. */
export const siteError = signal(null);
/** { total, replies, mentions, messages, reports? }; the per-kind counts are null on API v4. */
export const unread = signal({ total: 0, replies: 0, mentions: 0, messages: 0 });
export const unreadTotal = computed(() => unread.value.total || 0);

export const me = computed(() => site.value?.myUser || null);
/** Communities I moderate (full names), and whether I'm an admin. */
export const moderated = computed(() => new Set((me.value?.moderates || []).map((c) => c.fullName)));
export const isAdmin = computed(() => !!me.value?.person?.admin || !!me.value?.settings?.admin);

/** Can I moderate [community]? Admins can, on their own instance. */
export function canModerate(community) {
  if (!community) return false;
  return moderated.peek().has(community.fullName) || (isAdmin.peek() && community.local);
}

/** Open reports in the communities I moderate (0 when I moderate none). */
export const reportCount = signal(0);

export const subscriptions = computed(() => (me.value?.follows || []).slice().sort((a, b) => a.name.localeCompare(b.name)));

let siteRequest = 0;
let siteLoading = null;

/** Load /site for the current instance and account (one request at a time per client). */
export function loadSite() {
  const client = api.peek();
  if (siteLoading && siteLoading.client === client) return siteLoading.promise;
  const id = ++siteRequest;
  const promise = fetchSite(client, id).finally(() => {
    if (siteLoading?.promise === promise) siteLoading = null;
  });
  siteLoading = { client, promise };
  return promise;
}

async function fetchSite(client, id) {
  if (!client) { batch(() => { site.value = null; siteError.value = null; }); return null; }
  try {
    const s = await client.site({ fresh: true });
    if (id !== siteRequest) return null;
    // A token the instance no longer accepts comes back without my_user.
    if (jwt() && !s.myUser) loginExpired.value = true;
    batch(() => { site.value = s; siteError.value = null; });
    return s;
  } catch (e) {
    if (id !== siteRequest) return null;
    if (e.kind === 'auth' && jwt()) {
      loginExpired.value = true;
      return fetchSite(client, id);
    }
    batch(() => { site.value = null; siteError.value = e; });
    return null;
  }
}

/** Reload /site after a change to subscriptions, blocks or account settings. */
export function refreshSite() {
  clearCache(base.peek());
  siteLoading = null;
  return loadSite();
}

/** Use [inst] while logged out (the instance picker). */
export function chooseInstance(inst) {
  batch(() => {
    setSettings({ instance: hostOrUrl(inst) });
    accounts.update((a) => ({ ...a, active: -1 }));
    loginExpired.value = false;
  });
}

/** "https://lemmy.world/" -> "lemmy.world"; local http addresses keep their scheme. */
export function hostOrUrl(inst) {
  const b = baseUrl(inst);
  return b.startsWith('http://') ? b : hostOf(b);
}

/**
 * Log in and make the account active. Throws ApiError (with code
 * missing_totp_token when a 2FA code is needed).
 */
export async function login({ instance: inst, username, password, totp, remember }) {
  const b = baseUrl(inst);
  const client = settings.peek().apiVersion === 'auto' && apiVersions.peek()[b] === 4 && LemmyV4 ? new LemmyV4(b) : new LemmyV3(b);
  const r = await client.login(username, password, totp);
  if (!r.jwt) {
    const why = r.verify_email_sent ? 'Check your email to verify your address, then log in.'
      : r.registration_created ? 'Your registration application is waiting for approval.'
        : 'The instance did not return a login token.';
    throw Object.assign(new Error(why), { kind: 'pending' });
  }
  setActiveAccount({ instance: hostOrUrl(inst), username: username.replace(/@.*$/, ''), jwt: r.jwt, remember });
  return r;
}

/** Add or update [a] and make it the active account. */
export function setActiveAccount(a) {
  const stored = { instance: a.instance, username: a.username, remember: !!a.remember, jwt: a.remember ? a.jwt : null };
  if (!a.remember) writeRaw(sessionJwtKey(a), a.jwt, 'session');
  batch(() => {
    loginExpired.value = false;
    accounts.update(({ list }) => {
      const i = list.findIndex((x) => hostOf(x.instance) === hostOf(a.instance) && x.username.toLowerCase() === a.username.toLowerCase());
      const next = i >= 0 ? list.map((x, j) => (j === i ? stored : x)) : [...list, stored];
      return { list: next, active: i >= 0 ? i : next.length - 1 };
    });
  });
}

/** Log out of the active account: tell the instance, then forget the token. */
export async function logout() {
  const a = account.peek();
  if (!a) return;
  const client = api.peek();
  if (client && jwt()) await client.logout();
  writeRaw(sessionJwtKey(a), null, 'session');
  batch(() => {
    setSettings({ instance: a.instance });
    accounts.update(({ list, active }) => ({ list: list.filter((_, i) => i !== active), active: -1 }));
    loginExpired.value = false;
    unread.value = { total: 0, replies: 0, mentions: 0, messages: 0 };
  });
}

// --- unread polling -------------------------------------------------------------

const POLL_MS = 60_000;
let pollTimer = 0;

export async function refreshUnread() {
  const client = api.peek();
  if (!client || !jwt()) return;
  try {
    unread.value = await client.unreadCount();
    await refreshReports();
  } catch (e) {
    if (e.kind === 'auth') loginExpired.value = true;
  }
}

/** The open reports, for moderators and admins (the header's shield). */
async function refreshReports() {
  const client = api.peek();
  if (!client || !jwt() || !(moderated.peek().size || isAdmin.peek())) return;
  try {
    reportCount.value = unread.peek().reports ?? await client.reportCount();
  } catch (e) {
    if (e.kind === 'auth') loginExpired.value = true;
  }
}

function schedulePoll() {
  clearTimeout(pollTimer);
  if (document.visibilityState !== 'visible' || !loggedIn.peek()) return;
  pollTimer = setTimeout(async () => { await refreshUnread(); schedulePoll(); }, POLL_MS);
}

/** Start keeping /site and the unread count current. Called once from main.js. */
export function startSession() {
  let lastBase = null;
  effect(() => {
    api.value;
    // Another instance: its /site, not the old one's, before views use it.
    if (base.value !== lastBase) batch(() => { site.value = null; siteError.value = null; });
    lastBase = base.peek();
    loadSite();
    if (loggedIn.value) refreshUnread();
    schedulePoll();
  });
  // Who moderates what comes with /site, which may arrive after the first
  // unread check: count the reports as soon as it's known.
  effect(() => {
    if (moderated.value.size || isAdmin.value) untrack(refreshReports);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshUnread();
    schedulePoll();
  });
}

// --- several accounts ----------------------------------------------------------------

/** Switch to the [i]th stored account (on its own instance). */
export function switchAccount(i) {
  batch(() => {
    loginExpired.value = false;
    unread.value = { total: 0, replies: 0, mentions: 0, messages: 0 };
    accounts.update((a) => ({ ...a, active: i }));
  });
}

/** Can [a] be used without logging in again? (No token when "remember me" was off and the session ended.) */
export function hasToken(a) { return !!jwtFor(a); }

/** Forget the [i]th account (logging it out on its instance if it's the active one). */
export async function removeAccount(i) {
  const { active, list } = accounts.peek();
  if (i === active) return logout();
  writeRaw(sessionJwtKey(list[i]), null, 'session');
  accounts.update((a) => ({ list: a.list.filter((_, j) => j !== i), active: a.active > i ? a.active - 1 : a.active }));
}
