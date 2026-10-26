#!/usr/bin/env node
//
// Phase 1 compatibility check (docs/OLEMMY.md §13, §15 #1-#3): can a web page
// on another origin talk to the largest Lemmy instances?
//
//   node scripts/compat.mjs                 the 20 instances most active this month
//   node scripts/compat.mjs -n 40           more of them
//   node scripts/compat.mjs lemmy.ml ...    just these
//   node scripts/compat.mjs --write         also rewrite the results table in docs/compat.md
//
// Node isn't a browser, so CORS is checked the way a browser decides it: each
// request carries the Origin a deployed Olemmy would send, and the answer's
// Access-Control-* headers are read. Per instance:
//
//   site      GET  /api/v3/site                      readable from our origin? which version?
//   preflight OPTIONS /api/v3/user/unread_count      would an Authorization header be allowed?
//   auth      GET  /api/v3/user/unread_count         with a made-up token: is even the error readable?
//   upload    OPTIONS /pictrs/image                  would a POST with Authorization be allowed?
//   v4        GET  /api/v4/site                      does the instance speak API v4 (Lemmy 1.x)?
//
// A real upload needs an account, so it's tested against a local Lemmy (see
// docs/compat.md); the upload preflight here says whether a browser would
// even send it.

import { readFile, writeFile } from 'node:fs/promises';

const ORIGIN = 'https://olemmy.com';
const LIST = 'https://data.lemmyverse.net/data/instance.full.json';
const TIMEOUT = 15000;
// Used when the instance list can't be fetched.
const FALLBACK = [
  'lemmy.world', 'sh.itjust.works', 'lemmy.ml', 'lemmy.dbzer0.com', 'programming.dev',
  'feddit.org', 'lemmy.blahaj.zone', 'lemmy.ca', 'lemmy.zip', 'beehaw.org',
  'startrek.website', 'discuss.tchncs.de', 'sopuli.xyz', 'reddthat.com', 'lemmy.today',
  'infosec.pub', 'midwest.social', 'slrpnk.net', 'aussie.zone', 'feddit.nl',
];

const args = process.argv.slice(2);
const write = args.includes('--write');
const count = Number(args[args.indexOf('-n') + 1]) || 20;
const named = args.filter((a, i) => !a.startsWith('-') && args[i - 1] !== '-n');

async function request(url, init = {}) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { redirect: 'manual', ...init, signal: abort.signal });
    const body = await res.text().catch(() => '');
    return { status: res.status, headers: res.headers, body };
  } catch (e) {
    return { status: 0, error: e.cause?.code || e.name, headers: new Headers(), body: '' };
  } finally {
    clearTimeout(timer);
  }
}

/** Does [res] let a page on ORIGIN read it? */
function allowsOrigin(res) {
  const allowed = res.headers.get('access-control-allow-origin');
  return allowed === '*' || allowed === ORIGIN;
}

/** Does a preflight answer [res] allow [method] with an Authorization header? */
function allowsPreflight(res, method) {
  if (res.status < 200 || res.status >= 300 || !allowsOrigin(res)) return false;
  const methods = (res.headers.get('access-control-allow-methods') || '').toUpperCase();
  const headers = (res.headers.get('access-control-allow-headers') || '').toLowerCase();
  const methodOk = !methods || methods.includes('*') || methods.includes(method) || method === 'GET';
  // With an Authorization header, "*" doesn't cover it: it must be named.
  return methodOk && /(^|[\s,])authorization([\s,]|$)/.test(headers);
}

const preflight = (url, method) => request(url, {
  method: 'OPTIONS',
  headers: {
    Origin: ORIGIN,
    'Access-Control-Request-Method': method,
    'Access-Control-Request-Headers': 'authorization,content-type',
  },
});

async function probe(host) {
  const base = `https://${host}`;
  const row = { host };

  const site = await request(`${base}/api/v3/site`, { headers: { Origin: ORIGIN } });
  row.site = site.status === 200 && allowsOrigin(site);
  row.siteStatus = site.status || site.error;
  try { row.version = JSON.parse(site.body).version; } catch { row.version = null; }

  const pre = await preflight(`${base}/api/v3/user/unread_count`, 'GET');
  row.preflight = allowsPreflight(pre, 'GET');
  row.preflightStatus = pre.status || pre.error;

  const auth = await request(`${base}/api/v3/user/unread_count`, {
    headers: { Origin: ORIGIN, Authorization: 'Bearer olemmy-compat-check' },
  });
  row.auth = auth.status !== 0 && allowsOrigin(auth);
  row.authStatus = auth.status || auth.error;

  const upload = await preflight(`${base}/pictrs/image`, 'POST');
  row.upload = allowsPreflight(upload, 'POST');
  row.uploadStatus = upload.status || upload.error;

  const v4 = await request(`${base}/api/v4/site`, { headers: { Origin: ORIGIN } });
  row.v4 = v4.status === 200;
  return row;
}

async function instances() {
  if (named.length) return named;
  try {
    const res = await fetch(LIST, { signal: AbortSignal.timeout(30000) });
    const all = await res.json();
    return all
      .filter((i) => i.baseurl && i.usage?.users)
      .sort((a, b) => (b.usage.users.activeMonth || 0) - (a.usage.users.activeMonth || 0))
      .slice(0, count)
      .map((i) => i.baseurl);
  } catch (e) {
    console.error(`Couldn't fetch ${LIST} (${e.message}) - using the built-in list`);
    return FALLBACK.slice(0, count);
  }
}

const mark = (ok, status) => (ok ? 'yes' : `**no** (${status})`);

function table(rows) {
  const lines = [
    '| Instance | Version | Read (`/site`) | Auth preflight | Auth error readable | Upload preflight | API v4 |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    lines.push(`| ${r.host} | ${r.version || '?'} | ${mark(r.site, r.siteStatus)} | ${mark(r.preflight, r.preflightStatus)} | ${mark(r.auth, r.authStatus)} | ${mark(r.upload, r.uploadStatus)} | ${r.v4 ? 'yes' : 'no'} |`);
  }
  const ok = rows.filter((r) => r.site && r.preflight && r.auth).length;
  const up = rows.filter((r) => r.upload).length;
  lines.push('', `${ok} of ${rows.length} instances allow reading and authenticated calls from another origin; ${up} of ${rows.length} allow an authenticated upload preflight.`);
  return lines.join('\n');
}

const hosts = await instances();
const rows = [];
// A few at a time: this is a courtesy check, not a load test.
for (let i = 0; i < hosts.length; i += 4) {
  rows.push(...await Promise.all(hosts.slice(i, i + 4).map(probe)));
}
const result = table(rows);
console.log(result);

if (write) {
  const file = new URL('../docs/compat.md', import.meta.url);
  const doc = await readFile(file, 'utf8');
  const stamp = `Checked ${new Date().toISOString().slice(0, 10)} with \`node scripts/compat.mjs --write\`, origin \`${ORIGIN}\`.`;
  const updated = doc.replace(/<!-- results -->[\s\S]*<!-- \/results -->/,
    `<!-- results -->\n${stamp}\n\n${result}\n<!-- /results -->`);
  await writeFile(file, updated);
  console.log(`\nWrote ${file.pathname}`);
}
