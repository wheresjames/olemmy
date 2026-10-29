// Phase 2: the v4 adapter's mapping, the multi merge, the v3 mod log, and
// small helpers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as V from '../../web/js/api/normalize-v4.js';
import * as N from '../../web/js/api/normalize.js';
import * as M from '../../web/js/api/normalize-mod.js';
import { postSort } from '../../web/js/api/v4.js';
import { readCursor } from '../../web/js/api/v3.js';
import { isCakeDay } from '../../web/js/util/format.js';
import { LANGUAGE_FLAGS, flagFor } from '../../web/js/features/language-flags.js';
import { existsSync } from 'node:fs';
import { createMerger, comparator, hotRank } from '../../web/js/api/merge.js';
import { contrastText } from '../../web/js/features/user-tagger.js';
import { videoThumbnail, embedFor } from '../../web/js/util/links.js';
import * as conv from '../helpers/v4.mjs';
import { html } from '../helpers/markdown.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'));

test('v4 posts normalize to the same models as v3', () => {
  for (const raw of fixture('post-list').posts.slice(0, 10)) {
    const a = N.post(raw);
    const b = V.post(conv.postView(raw));
    for (const k of ['id', 'title', 'url', 'score', 'comments', 'nsfw', 'published', 'myVote', 'saved']) assert.deepEqual(b[k], a[k], k);
    assert.equal(b.creator.fullName, a.creator.fullName);
    assert.equal(b.community.fullName, a.community.fullName);
  }
});

test('v4 votes and follow state come from *_actions', () => {
  const raw = structuredClone(fixture('post-list').posts[0]);
  raw.my_vote = -1;
  raw.saved = true;
  raw.subscribed = 'Subscribed';
  const p = V.post(conv.postView(raw));
  assert.equal(p.myVote, -1);
  assert.equal(p.saved, true);
  assert.equal(p.community.subscribed, 'Subscribed');
});

test('v4 comments keep path, depth and counts', () => {
  for (const raw of fixture('comments').comments) {
    const a = N.comment(raw);
    const b = V.comment(conv.commentView(raw));
    for (const k of ['id', 'depth', 'parentId', 'score', 'childCount', 'content']) assert.deepEqual(b[k], a[k], k);
  }
});

test('v4 site: downvotes, registration, counts', () => {
  const s = V.site(conv.site(fixture('site')), null, [{ custom_emoji: { shortcode: 'x', image_url: 'https://a/x.png', alt_text: 'x' } }]);
  assert.equal(s.host, 'fixture.test');
  assert.equal(s.enableDownvotes, true);
  assert.equal(s.registrationMode, 'RequireApplication');
  assert.equal(s.defaultListingType, 'Local');
  assert.equal(s.usersActiveMonth, 20);
  assert.equal(s.customEmojis[0].shortcode, 'x');
});

test('v4 notifications become inbox items', () => {
  const c = conv.commentView(fixture('comments').comments[0]);
  const item = V.notification({ notification: { id: 9, kind: 'reply', read: false, published_at: '2026-10-25T10:00:00Z' }, data: { type_: 'comment', ...c } });
  assert.equal(item.kind, 'reply');
  assert.equal(item.inboxId, 9);
  assert.equal(item.read, false);
  assert.equal(item.postId, c.comment.post_id);
  assert.equal(V.notification({ notification: { id: 1, kind: 'mod_action' }, data: { type_: 'mod_action' } }), null);
});

test('v4 sorts', () => {
  assert.deepEqual(postSort('Hot'), { sort: 'hot' });
  assert.deepEqual(postSort('MostComments'), { sort: 'most_comments' });
  assert.deepEqual(postSort('TopWeek'), { sort: 'top', time_range_seconds: 604800 });
  assert.deepEqual(postSort('TopAll'), { sort: 'top' });
});

test('v3 cursors: page numbers and page_cursor behind one opaque value', () => {
  assert.deepEqual(readCursor(undefined), { page: 1 });
  assert.deepEqual(readCursor('p:3'), { page: 3 });
  assert.deepEqual(readCursor('c:Pabc'), { page_cursor: 'Pabc' });
});

test('v3 mod log: every kind of action, newest first', () => {
  const entries = M.modlogV3(fixture('modlog'));
  assert.ok(entries.length > 20);
  for (let i = 1; i < entries.length; i++) assert.ok(entries[i - 1].when >= entries[i].when);
  const kinds = new Set(entries.map((e) => e.kind));
  for (const k of ['mod_remove_post', 'mod_lock_post', 'mod_ban_from_community', 'mod_remove_comment']) assert.ok(kinds.has(k), k);
  const removal = entries.find((e) => e.kind === 'mod_remove_post');
  assert.match(removal.action, /^(removed|restored) post$/);
  assert.ok(removal.post.title);
});

test('merge: streams interleave in sort order, refilling as they run dry', async () => {
  const mk = (name, times) => times.map((t, i) => ({ id: `${name}${i}`, published: new Date(Date.UTC(2026, 9, 25, t)).toISOString(), score: t }));
  const data = { a: mk('a', [23, 20, 10, 2]), b: mk('b', [22, 21, 5]), c: [] };
  const calls = [];
  const merger = createMerger({
    names: ['a', 'b', 'c'],
    compare: comparator('New'),
    fetch: async (name, cursor) => {
      calls.push(`${name}:${cursor ?? 0}`);
      const at = Number(cursor || 0);
      const posts = data[name].slice(at, at + 2);
      return { posts, next: at + 2 < data[name].length ? String(at + 2) : null };
    },
  });
  const first = await merger.next(4);
  assert.deepEqual(first.posts.map((p) => p.id), ['a0', 'b0', 'b1', 'a1']);
  assert.equal(first.done, false);
  const rest = await merger.next(10);
  assert.deepEqual(rest.posts.map((p) => p.id), ['a2', 'b2', 'a3']);
  assert.equal(rest.done, true);
  // Each page of each community was fetched once.
  assert.deepEqual(calls.sort(), ['a:0', 'a:2', 'b:0', 'b:2', 'c:0']);
});

test('merge: a failing community is reported, the rest still merge', async () => {
  const merger = createMerger({
    names: ['ok', 'gone'],
    compare: comparator('TopDay'),
    fetch: async (name) => {
      if (name === 'gone') throw Object.assign(new Error('nope'), { kind: 'http' });
      return { posts: [{ id: 1, score: 5, published: '2026-10-25T00:00:00Z' }], next: null };
    },
  });
  const r = await merger.next(5);
  assert.equal(r.posts.length, 1);
  assert.deepEqual(merger.errors().map((e) => e.name), ['gone']);
});

test('hot rank: newer and higher-scored come first', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  const p = (hoursAgo, score) => ({ score, published: new Date(now - hoursAgo * 3600000).toISOString() });
  assert.ok(hotRank(p(1, 10), now) > hotRank(p(10, 10), now));
  assert.ok(hotRank(p(2, 100), now) > hotRank(p(2, 5), now));
});

test('tag colors get readable text', () => {
  assert.equal(contrastText('#ffffff'), '#000');
  assert.equal(contrastText('#222222'), '#fff');
  assert.equal(contrastText('#f1c40f'), '#000');
});

test('text-only mode renders images as links', () => {
  const out = html('![cat](https://x.org/cat.png)', { textOnly: true });
  assert.match(out, /<a class="md-media-link" href="https:\/\/x.org\/cat.png"[^>]*>\[image: cat\]<\/a>/);
  assert.ok(!out.includes('<img'));
});

test('video stills: YouTube from its video ID, imgur from its file name', () => {
  const still = 'https://i.ytimg.com/vi/TESTVIDEO01/mqdefault.jpg';
  for (const u of ['https://www.youtube.com/watch?v=TESTVIDEO01&t=30', 'https://youtu.be/TESTVIDEO01', 'https://m.youtube.com/shorts/TESTVIDEO01', 'https://www.youtube.com/live/TESTVIDEO01']) {
    assert.equal(videoThumbnail(u), still, u);
  }
  assert.equal(videoThumbnail('https://youtu.be/TESTVIDEO01', { youtube: false }), null);
  assert.equal(videoThumbnail('https://i.imgur.com/AbC123x.gifv'), 'https://i.imgur.com/AbC123xb.jpg');
  assert.equal(videoThumbnail('https://i.imgur.com/AbC123x.mp4', { youtube: false }), 'https://i.imgur.com/AbC123xb.jpg');
  for (const u of ['https://vimeo.com/123456', 'https://example.com/v.mp4', 'https://www.youtube.com/watch?v=bad id', 'not a url']) assert.equal(videoThumbnail(u), null, u);
  // The player still gets the same video.
  assert.equal(embedFor('https://youtu.be/TESTVIDEO01?t=90').src, 'https://www.youtube-nocookie.com/embed/TESTVIDEO01?start=90');
});

test('cake day: the account\'s anniversary, not the day it was made', () => {
  const at = (y, m, d) => new Date(y, m - 1, d, 12);
  const made = at(2024, 4, 12).toISOString();
  assert.equal(isCakeDay(made, at(2025, 4, 12)), true);
  assert.equal(isCakeDay(made, at(2025, 4, 13)), false);
  assert.equal(isCakeDay(made, at(2024, 4, 12)), false);
  const leap = at(2024, 2, 29).toISOString();
  assert.equal(isCakeDay(leap, at(2025, 2, 28)), true);
  assert.equal(isCakeDay(leap, at(2028, 2, 28)), false);
  assert.equal(isCakeDay(leap, at(2028, 2, 29)), true);
  assert.equal(isCakeDay(null), false);
});

test('language flags: every flag the map names is vendored', () => {
  for (const [lang, country] of Object.entries(LANGUAGE_FLAGS)) {
    assert.ok(existsSync(new URL(`../../web/${flagFor(lang)}`, import.meta.url)), `${lang} -> ${country}.svg`);
  }
  assert.equal(flagFor('DE'), 'vendor/flag-icons@7.5.0/flags/4x3/de.svg');
  assert.equal(flagFor('eo'), null);
  assert.equal(flagFor(undefined), null);
});
