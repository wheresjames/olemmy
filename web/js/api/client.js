// fetch wrapper for one Lemmy instance (docs/OLEMMY.md §15 #6):
//
// - one request queue per instance: at most 4 requests at once;
// - 429 backs off exponentially, honoring Retry-After; a GET that fails on
//   the network or with a 5xx is retried once;
// - identical GETs in flight share one fetch, and GET responses are cached
//   briefly (per user), so back/forward is instant;
// - errors come back as ApiError with a kind the UI can explain;
// - the demo's addresses are answered in the page (demo/, docs/demo.md),
//   never on the network.

import { isDemoBase, demoFetch } from '../demo/index.js';

const MAX_AT_ONCE = 4;
const MAX_429_RETRIES = 4;
const DEFAULT_TTL = 60_000;
const MAX_CACHE = 300;
const TIMEOUT = 30_000;

export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{ kind: 'cors'|'network'|'timeout'|'aborted'|'http'|'auth'|'rate', status?: number, code?: string }} info
   */
  constructor(message, { kind, status = 0, code = '' }) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

/** "lemmy.world" or "http://localhost:8536" -> "https://lemmy.world" (no trailing slash). */
export function baseUrl(instance) {
  const s = String(instance || '').trim().replace(/\/+$/, '');
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

/** The host part of an instance address ("localhost:8536", "lemmy.world"). */
export function hostOf(instance) {
  try { return new URL(baseUrl(instance)).host; } catch { return String(instance); }
}

class Queue {
  constructor(max) { this.max = max; this.active = 0; this.waiting = []; this.pausedUntil = 0; }
  async run(fn) {
    // Recheck after every wait: another request may take the released slot,
    // and a rate-limit pause can wake several requests at once.
    while (this.active >= this.max || this.pausedUntil > Date.now()) {
      if (this.active >= this.max) await new Promise((resolve) => this.waiting.push(resolve));
      else await sleep(this.pausedUntil - Date.now());
    }
    this.active++;
    try { return await fn(); } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
  /** Hold every request to this instance for [ms] (after a 429). */
  pause(ms) { this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms); }
}

const queues = new Map();
const inflight = new Map();
const cache = new Map();

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new ApiError('Cancelled', { kind: 'aborted' })); }, { once: true });
});

function queueFor(base) {
  if (!queues.has(base)) queues.set(base, new Queue(MAX_AT_ONCE));
  return queues.get(base);
}

/** Forget cached GETs, for one instance or all (after any write). */
export function clearCache(base) {
  for (const key of cache.keys()) if (!base || key.startsWith(`${base} `)) cache.delete(key);
}

function retryAfter(res, attempt) {
  const header = res.headers.get('Retry-After');
  const secs = Number(header);
  if (header && Number.isFinite(secs)) return Math.min(secs * 1000, 60_000);
  if (header) {
    const at = Date.parse(header);
    if (!Number.isNaN(at)) return Math.min(Math.max(0, at - Date.now()), 60_000);
  }
  return Math.min(1000 * 2 ** attempt, 30_000);
}

/** Turn a failed fetch into an ApiError. */
function networkError(e, signal) {
  if (signal?.aborted) return new ApiError('Cancelled', { kind: 'aborted' });
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return new ApiError('The instance took too long to answer', { kind: 'timeout' });
  // fetch can't tell CORS refusals from network failures; when the browser
  // says it's online, CORS (or a down instance) is the likely cause.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return new ApiError('You appear to be offline', { kind: 'network' });
  return new ApiError("Couldn't reach the instance. It may be down, or it doesn't allow third-party web clients", { kind: 'cors' });
}

async function readError(res) {
  let code = '';
  try {
    const body = await res.json();
    code = body?.error || body?.message || '';
  } catch { /* not JSON */ }
  const kind = res.status === 429 ? 'rate'
    : (res.status === 401 || /not_logged_in|incorrect_login|invalid_auth|password_incorrect/.test(code)) ? 'auth'
      : 'http';
  return new ApiError(describe(code) || `The instance answered ${res.status}`, { kind, status: res.status, code });
}

/** Lemmy error codes worth spelling out. */
const MESSAGES = {
  incorrect_login: 'Wrong username or password',
  not_logged_in: 'Your login has expired. Please log in again',
  missing_totp_token: 'This account uses two-factor authentication. Enter your code',
  incorrect_totp_token: 'That two-factor code is wrong',
  email_not_verified: 'Please verify your email address first',
  registration_application_is_pending: 'Your registration application is still waiting for approval',
  registration_denied: 'Your registration application was denied',
  site_ban: 'You are banned from this instance',
  deleted: 'This account was deleted',
  rate_limit_error: 'Too many requests. Please wait a moment',
  couldnt_find_post: "That post couldn't be found",
  couldnt_find_comment: "That comment couldn't be found",
  couldnt_find_community: "That community couldn't be found",
  couldnt_find_person: "That user couldn't be found",
  couldnt_find_object: "That couldn't be found on this instance yet",
  banned_from_community: 'You are banned from this community',
  locked: 'This post is locked',
  captcha_incorrect: 'The captcha answer is wrong',
  passwords_do_not_match: "The passwords don't match",
  username_already_exists: 'That username is taken',
  email_already_exists: 'That email address is already in use',
  invalid_password: 'Passwords must be 10 to 60 characters long',
  registration_closed: 'This instance is closed to new registrations',
  only_mods_can_post_in_community: 'Only moderators can post in this community',
  invalid_url: "That URL isn't valid",
  post_title_too_long: 'The title is too long',
  invalid_post_title: "That title isn't allowed",
  blocked_url: 'That URL is blocked on this instance',
};

export function describe(code) {
  if (!code) return '';
  return MESSAGES[code] || code.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/**
 * Make a request to [base] (an instance base URL).
 * @param {string} base
 * @param {{ method?: string, path: string, query?: Record<string, any>, body?: any, form?: FormData,
 *           jwt?: string|null, signal?: AbortSignal, ttl?: number, fresh?: boolean }} opts
 */
export async function request(base, { method = 'GET', path, query, body, form, jwt, signal, ttl = DEFAULT_TTL, fresh = false }) {
  const url = new URL(path, `${base}/`);
  for (const [k, v] of Object.entries(query || {})) if (v != null && v !== '') url.searchParams.set(k, String(v));
  const isGet = method === 'GET';
  const who = jwt ? jwt.slice(-12) : 'anon';
  const key = `${base} ${who} ${url.pathname}${url.search}`;

  if (isGet && !fresh) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.time < ttl) return structuredClone(hit.data);
    if (inflight.has(key)) return withAbort(inflight.get(key), signal).then((d) => structuredClone(d));
  }
  if (!isGet) clearCache(base);

  const headers = {};
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }

  const queue = queueFor(base);
  // A GET may be shared by several callers: one leaving mustn't cancel it for the rest.
  const own = isGet ? undefined : signal;
  const run = async () => {
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await queue.run(() => (isDemoBase(base) ? demoFetch : fetch)(url, {
          method, headers, body: payload,
          // A shared GET isn't cancelled by one caller leaving; writes are.
          signal: isGet ? AbortSignal.timeout(TIMEOUT) : anySignal(signal, AbortSignal.timeout(TIMEOUT)),
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        }));
      } catch (e) {
        if (isGet && attempt === 0 && e?.name !== 'TimeoutError') { await sleep(800); continue; }
        throw networkError(e, own);
      }
      if (res.status === 429 && attempt < MAX_429_RETRIES) {
        const wait = retryAfter(res, attempt);
        queue.pause(wait);
        await sleep(wait, own);
        continue;
      }
      if (res.status >= 500 && isGet && attempt === 0) { await sleep(1000); continue; }
      if (!res.ok) throw await readError(res);
      const text = await res.text();
      let data;
      try { data = text ? JSON.parse(text) : {}; } catch {
        // A web page, say: the address isn't a Lemmy instance's API.
        throw new ApiError('The instance\'s answer wasn\'t one Olemmy can read. Is this a Lemmy instance?', { kind: 'http', status: res.status, code: 'not_json' });
      }
      if (isGet) {
        cache.set(key, { time: Date.now(), data });
        if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
      }
      return data;
    }
  };

  if (!isGet) return run();
  const shared = run().finally(() => inflight.delete(key));
  inflight.set(key, shared);
  return withAbort(shared, signal).then((d) => structuredClone(d));
}

/** [promise], rejected early with 'aborted' if [signal] fires. */
function withAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new ApiError('Cancelled', { kind: 'aborted' }));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new ApiError('Cancelled', { kind: 'aborted' }));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

function anySignal(...signals) {
  const list = signals.filter(Boolean);
  if (AbortSignal.any) return AbortSignal.any(list);
  const c = new AbortController();
  for (const s of list) s.addEventListener('abort', () => c.abort(s.reason), { once: true });
  return c.signal;
}
