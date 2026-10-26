// Store migrations, signals, routing, URL rules, and filters.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, mergeDefaults } from '../../web/js/core/store.js';
import { signal, computed, effect, batch, root } from '../../web/js/core/signal.js';
import { parseHash, compile, href } from '../../web/js/core/router.js';
import { lemmyRoute, embedFor, isImageUrl, isVideoUrl, thumbnailUrl, safeUrl, shareRoute, shareOriginal, validHost, shareToSubmit } from '../../web/js/util/links.js';
import { baseUrl, hostOf, describe } from '../../web/js/api/client.js';
import { nextVote } from '../../web/js/state/actions.js';
import { filters, postPasses } from '../../web/js/features/filters.js';

test('migrate: missing data gets defaults, old versions run each migration', () => {
  const defaults = { theme: 'auto', features: {}, density: 'normal' };
  assert.deepEqual(migrate(null, 2, defaults), defaults);
  const migrations = { 2: (d) => ({ ...d, theme: d.dark ? 'dark' : 'auto', dark: undefined }) };
  const out = migrate({ v: 1, data: { dark: true } }, 2, defaults, migrations);
  assert.equal(out.theme, 'dark');
  assert.equal(out.density, 'normal');
});

test('mergeDefaults keeps stored values and fills nested gaps', () => {
  assert.deepEqual(mergeDefaults({ a: 1, b: { c: 2, d: 3 } }, { b: { c: 9 }, x: 1 }), { a: 1, b: { c: 9, d: 3 }, x: 1 });
  assert.deepEqual(mergeDefaults({ list: [1] }, { list: [] }), { list: [] });
});

test('signals: effects follow, batch groups, dispose stops', () => {
  const a = signal(1);
  const b = signal(2);
  const sum = computed(() => a.value + b.value);
  const seen = [];
  let dispose;
  root((d) => { dispose = d; effect(() => { seen.push(sum.value); }); });
  a.value = 10;
  batch(() => { a.value = 20; b.value = 30; });
  dispose();
  a.value = 0;
  assert.deepEqual(seen, [3, 12, 50]);
});

test('router: hash parsing, params, addresses', () => {
  const { path, query } = parseHash('#/c/linux@lemmy.ml?sort=New');
  assert.equal(path, '/c/linux@lemmy.ml');
  assert.equal(query.get('sort'), 'New');
  assert.deepEqual(compile('/post/:id/comment/:cid')('/post/5/comment/7'), { id: '5', cid: '7' });
  assert.equal(compile('/post/:id')('/post/5/comment/7'), null);
  // "*rest": the rest of the path, as written.
  const share = compile('/:host/*rest');
  assert.deepEqual(share('/piefed.social/c/a%40b/p/42/x'), { host: 'piefed.social', rest: 'c/a%40b/p/42/x' });
  assert.equal(share('/nowhere'), null);
  assert.equal(href('/search', { q: 'a b', type: '', page: 2 }), '#/search?q=a+b&page=2');
});

test('lemmyRoute', () => {
  assert.equal(lemmyRoute('https://lemmy.world/c/linux', 'lemmy.ml'), '#/c/linux@lemmy.world');
  assert.equal(lemmyRoute('https://lemmy.ml/c/linux', 'lemmy.ml'), '#/c/linux@lemmy.ml');
  assert.equal(lemmyRoute('https://lemmy.ml/u/x', 'lemmy.ml'), '#/u/x@lemmy.ml');
  assert.equal(lemmyRoute('https://lemmy.ml/comment/9', 'lemmy.ml'), '#/comment/9');
  assert.equal(lemmyRoute('https://www.github.com/u/someone', 'lemmy.ml'), null);
  assert.equal(lemmyRoute('https://example.com/blog/post', 'lemmy.ml'), null);
  assert.equal(lemmyRoute('https://example.com/post/abc', 'lemmy.ml'), null);
  // Another instance's post or comment: its share address.
  assert.equal(lemmyRoute('https://lemmy.world/post/123', 'lemmy.ml'), '#/lemmy.world/post/123');
  assert.equal(lemmyRoute('https://lemmy.world/comment/9', 'lemmy.ml'), '#/lemmy.world/comment/9');
  // PieFed posts and Mbin threads open in Olemmy too.
  assert.equal(lemmyRoute('https://piefed.example/c/linux@fixture.test/p/42/quiet-project', 'fixture.test'), '#/piefed.example/c/linux@fixture.test/p/42/quiet-project');
  assert.equal(lemmyRoute('https://kbin.earth/m/technology/t/12345/some-title', 'lemmy.ml'), '#/kbin.earth/m/technology/t/12345/some-title');
  assert.equal(lemmyRoute('https://kbin.earth/m/technology', 'lemmy.ml'), '#/c/technology@kbin.earth');
});

test('share addresses', () => {
  assert.equal(shareRoute('https://lemmy.world/post/123'), '#/lemmy.world/post/123');
  assert.equal(shareRoute('https://Fixture.Test/comment/42'), '#/fixture.test/comment/42');
  assert.equal(shareRoute('http://localhost:8536/post/5'), '#/localhost:8536/post/5');
  // Any original address: PieFed's, Mastodon's...
  const piefed = 'https://piefed.example/c/topic@fixture.test/p/42/quiet-project';
  assert.equal(shareRoute(piefed), '#/piefed.example/c/topic@fixture.test/p/42/quiet-project');
  assert.equal(shareRoute('https://mastodon.social/@someone/113123/'), '#/mastodon.social/@someone/113123');
  // ...and back again.
  for (const u of ['https://lemmy.world/post/123', piefed, 'http://localhost:8536/comment/9']) {
    const [, host, rest] = shareRoute(u).match(/^#\/([^/]+)\/(.+)$/);
    assert.equal(shareOriginal(host, rest), u);
  }
  // A query can't go in a hash route: resolve. No path, or a login in it: nothing.
  assert.equal(shareRoute('https://lemmy.world/post/1?x=1').startsWith('#/resolve?q='), true);
  assert.equal(shareRoute('https://lemmy.world/').startsWith('#/resolve?q='), true);
  assert.equal(shareRoute('https://user:pw@lemmy.world/post/1'), null);
  assert.equal(shareRoute(''), null);
  assert.equal(shareRoute('javascript:alert(1)'), null);
  for (const h of ['lemmy.world', 'sh.itjust.works', 'localhost:8536', 'a-b.example.co.uk']) assert.ok(validHost(h), h);
  for (const h of ['post', 'lemmy', 'evil.com/x', 'a..b', '-a.com', 'x.com:999999', '1.2.3.4']) assert.ok(!validHost(h), h);
});

test('media detection, embeds, thumbnails', () => {
  assert.ok(isImageUrl('https://x.org/a.JPG'));
  assert.ok(isImageUrl('https://lemmy.ml/api/v3/image_proxy?url=https%3A%2F%2Fa.org%2Fb.png'));
  assert.ok(isVideoUrl('https://i.imgur.com/a.gifv'));
  assert.ok(!isImageUrl('https://x.org/a.mp4'));
  assert.equal(embedFor('https://www.youtube.com/watch?v=TESTVIDEO01&t=42').src, 'https://www.youtube-nocookie.com/embed/TESTVIDEO01?start=42');
  assert.equal(embedFor('https://youtu.be/TESTVIDEO01').kind, 'youtube');
  assert.equal(embedFor('https://example.com/watch'), null);
  assert.equal(thumbnailUrl('https://lemmy.ml/pictrs/image/a.png'), 'https://lemmy.ml/pictrs/image/a.png?thumbnail=140');
  assert.equal(thumbnailUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('javascript:alert(1)'), null);
});

test('client helpers', () => {
  assert.equal(baseUrl('lemmy.world/'), 'https://lemmy.world');
  assert.equal(baseUrl('http://localhost:8536'), 'http://localhost:8536');
  assert.equal(hostOf('https://lemmy.world'), 'lemmy.world');
  assert.equal(describe('incorrect_login'), 'Wrong username or password');
  assert.equal(describe('some_new_error'), 'Some new error');
});

test('votes toggle', () => {
  assert.equal(nextVote(0, 1), 1);
  assert.equal(nextVote(1, 1), 0);
  assert.equal(nextVote(1, -1), -1);
});

test('local filters', () => {
  const post = (o) => ({
    title: 'A post about Rust',
    url: 'https://news.example.com/x',
    community: { fullName: 'rust@lemmy.ml', host: 'lemmy.ml' },
    creator: { fullName: 'alice@lemmy.world', host: 'lemmy.world' },
    ...o,
  });
  filters.set({ keywords: ['rust'], domains: [], communities: [], users: [], instances: [] });
  assert.equal(postPasses(post()), false);
  assert.equal(postPasses(post({ title: 'Trusty tools' })), true, 'whole words only');
  filters.set({ keywords: ['/^a post/'], domains: ['example.com'], communities: [], users: [], instances: [] });
  assert.equal(postPasses(post({ title: 'b' })), false, 'subdomain of a filtered domain');
  filters.set({ keywords: [], domains: [], communities: ['RUST@lemmy.ml'], users: [], instances: [] });
  assert.equal(postPasses(post()), false, 'case-insensitive');
  filters.set({ keywords: [], domains: [], communities: [], users: [], instances: ['lemmy.world'] });
  assert.equal(postPasses(post()), false);
  filters.set({ keywords: [], domains: [], communities: [], users: [], instances: [] });
  assert.equal(postPasses(post()), true);
});

test('shared into Olemmy from another app: a new post', () => {
  const to = (q) => { const r = shareToSubmit(new URLSearchParams(q)); return r && Object.fromEntries(new URLSearchParams(r.split('?')[1])); };
  assert.equal(shareToSubmit(new URLSearchParams('update')), null);
  assert.deepEqual(to({ share_title: 'A page', share_url: 'https://example.com/a' }), { type: 'link', title: 'A page', url: 'https://example.com/a' });
  // The link inside the text, as Android apps often send it.
  assert.deepEqual(to({ share_text: 'Look at this https://example.com/b?x=1' }), { type: 'link', title: 'Look at this', url: 'https://example.com/b?x=1' });
  assert.deepEqual(to({ share_title: 'T', share_text: 'Some words https://example.com/c' }), { type: 'link', title: 'T', url: 'https://example.com/c', body: 'Some words' });
  // No link: a text post.
  assert.deepEqual(to({ share_text: 'Just a thought' }), { type: 'text', body: 'Just a thought' });
  // Only http(s) links count.
  assert.deepEqual(to({ share_url: 'javascript:alert(1)', share_text: 'hi' }), { type: 'text', body: 'hi' });
});

test('no app file is named like what ad and tracker blockers block', async () => {
  // A blocked file the app imports stops it from starting (a blocker's
  // "/share.js" rule did, on phones). Names only: what filter lists match.
  const { readdirSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = new URL('../../web/', import.meta.url).pathname;
  const RISKY = /(^|[-_.])(share|sharing|social|ads?|advert\w*|banners?|popups?|track(ing|er)?|analytics|beacon|pixel|sponsor\w*|affiliates?|adblock)([-_.]|$)/i;
  const bad = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== 'vendor') walk(p); continue; }
      if (RISKY.test(name.replace(/\.[a-z]+$/i, ''))) bad.push(p.slice(root.length));
    }
  };
  walk(root);
  assert.deepEqual(bad, []);
});
