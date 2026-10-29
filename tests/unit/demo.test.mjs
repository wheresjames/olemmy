// The demo (docs/demo.md), through the real v3
// client and its normalizers: every call the app makes answers, in shapes
// the app can read, and what you do sticks.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LemmyV3 } from '../../web/js/api/v3.js';
import { DEMO_BASE, DEMO_JWT, isDemoBase, demoToken, migrateTestServer } from '../../web/js/demo/index.js';
import { makeWorld } from '../../web/js/demo/world.js';
import { THREADS } from '../../web/js/demo/threads.js';
import { resetWorld, setRole, reloadWorld, takeDiscarded } from '../../web/js/demo/server.js';
import { demoChanged } from '../../web/js/demo/index.js';

const me = new LemmyV3(DEMO_BASE, () => DEMO_JWT);
const anon = new LemmyV3(DEMO_BASE);
const fresh = { fresh: true };

test('demo: addresses', () => {
  assert.equal(isDemoBase(DEMO_BASE), true);
  assert.equal(isDemoBase('https://beta.olemmy.invalid'), true);
  assert.equal(isDemoBase('https://lemmy.world'), false);
  assert.equal(isDemoBase('https://olemmy.invalid.example.com'), false);
  assert.equal(isDemoBase('https://test.olemmy.invalid'), false);   // the old test server's
});

test('demo: the world is the same every time, and sized for localStorage', () => {
  const a = makeWorld(1_700_000_000_000);
  const b = makeWorld(1_700_000_000_000);
  assert.deepEqual(a, b);
  assert.equal(a.posts.length, 181);
  assert.equal(a.communities.length, 13);
  assert.ok(JSON.stringify(a).length < 1_200_000, `world is ${JSON.stringify(a).length} bytes`);
});

test('demo: site, listings, a post and its comments', async () => {
  resetWorld();
  const site = await me.site(fresh);
  assert.equal(site.name, 'Olemmy Demo');
  assert.equal(site.myUser.person.name, 'visitor');
  assert.ok(site.myUser.follows.length >= 3);
  assert.equal((await anon.site(fresh)).myUser, null);

  const all = await me.posts({ type: 'All', sort: 'Hot', limit: 25 }, fresh);
  assert.equal(all.posts.length, 25);
  assert.ok(all.next);
  assert.ok((await me.posts({ type: 'All', sort: 'Hot', limit: 25, cursor: all.next }, fresh)).posts.length > 0);
  const subs = await me.posts({ type: 'Subscribed', sort: 'New', limit: 50 }, fresh);
  const follows = new Set(site.myUser.follows.map((c) => c.id));
  assert.ok(subs.posts.every((p) => follows.has(p.community.id)));
  const local = await me.posts({ type: 'Local', sort: 'TopAll', limit: 50 }, fresh);
  assert.ok(local.posts.every((p) => p.community.local));
  // Pinned to the instance first, then by score.
  const unpinned = local.posts.filter((x) => !x.featuredLocal);
  assert.ok(local.posts.slice(0, local.posts.length - unpinned.length).every((x) => x.featuredLocal));
  assert.ok(unpinned[0].score >= unpinned[1].score);

  const busy = all.posts.slice().sort((a, b) => b.comments - a.comments)[0];
  const { post, community, moderators } = await me.post(busy.id, fresh);
  assert.equal(post.id, busy.id);
  assert.equal(community.id, post.community.id);
  assert.ok(moderators.length >= 1);
  const tree = await me.comments({ postId: post.id, sort: 'Hot', maxDepth: 8 }, fresh);
  assert.equal(tree.length, post.comments);
  // Depth-first: every comment's parent comes before it.
  const seen = new Set();
  for (const c of tree) { if (c.parentId) assert.ok(seen.has(c.parentId)); seen.add(c.id); }
});

test('demo: votes, saves, replies, edits and deletes stick', async () => {
  resetWorld();
  const p = (await me.posts({ type: 'All', sort: 'New', limit: 20 }, fresh)).posts.find((x) => !x.locked && !x.community.postingRestrictedToMods);
  const up = await me.vote(p.id, 1);
  assert.equal(up.myVote, 1);
  assert.equal(up.score, p.score - p.myVote + 1);
  assert.equal((await me.vote(p.id, -1)).score, p.score - p.myVote - 1);
  assert.equal((await me.save(p.id, true)).saved, true);
  assert.ok((await me.posts({ type: 'All', savedOnly: true, limit: 50 }, fresh)).posts.some((x) => x.id === p.id));

  const c = await me.createComment(p.id, 'Hello *there*', null, 32);
  assert.equal(c.languageId, 32);
  assert.equal(c.myVote, 1);
  const reply = await me.createComment(p.id, 'A reply', c.id);
  assert.equal(reply.parentId, c.id);
  assert.equal((await me.editComment(reply.id, 'Edited', 37)).content, 'Edited');
  assert.equal((await me.deleteComment(reply.id, true)).deleted, true);
  assert.equal((await me.post(p.id, fresh)).post.comments, p.comments + 2);

  const made = await me.createPost({ name: 'A test post', communityId: p.community.id, body: 'Body', languageId: 37 });
  assert.equal(made.creator.name, 'visitor');
  assert.equal((await me.user({ name: 'visitor', view: 'submitted' }, fresh)).posts.some((x) => x.id === made.id), true);
});

test('demo: logged out, writes are refused', async () => {
  resetWorld();
  const p = (await anon.posts({ type: 'All', limit: 1 }, fresh)).posts[0];
  await assert.rejects(anon.vote(p.id, 1), (e) => e.kind === 'auth');
  await assert.rejects(anon.createComment(p.id, 'x'), (e) => e.kind === 'auth');
});

test('demo: inbox, search, communities, users, resolve', async () => {
  resetWorld();
  const unread = await me.unreadCount();
  assert.ok(unread.replies >= 1 && unread.mentions >= 1 && unread.messages >= 1, JSON.stringify(unread));
  const inbox = await me.inbox({ filter: 'all' });
  assert.ok(inbox.items.some((i) => i.kind === 'reply') && inbox.items.some((i) => i.kind === 'mention') && inbox.items.some((i) => i.kind === 'message'));
  await me.markAllRead();
  assert.equal((await me.unreadCount()).total, 0);
  const sent = await me.sendMessage(inbox.items.find((i) => i.kind === 'message').creator.id, 'Hi back');
  assert.equal(sent.content, 'Hi back');

  const s = await me.search({ q: 'garden', type: 'All', limit: 20 }, fresh);
  assert.ok(s.posts.length + s.comments.length + s.communities.length > 0);
  const { communities } = await me.communities({ type: 'All', limit: 50 }, fresh);
  assert.equal(communities.length, 12);  // the NSFW one is left out
  const remote = communities.find((c) => !c.local);
  assert.ok(remote.fullName.endsWith('.olemmy.invalid'));
  const { community } = await me.community(remote.fullName, fresh);
  assert.equal(community.id, remote.id);
  assert.equal((await me.follow(remote.id, false)).subscribed, 'NotSubscribed');
  const u = await me.user({ name: 'alba' }, fresh);
  assert.equal(u.person.name, 'alba');
  assert.ok(u.posts.length + u.comments.length > 0);
  assert.equal((await me.resolve(`!${remote.fullName}`)).community.id, remote.id);
  assert.equal(await me.resolve('!nothing@nowhere.example').catch((e) => e.code), 'couldnt_find_object');
});

test('demo: roles, moderation, reports and the mod log', async () => {
  resetWorld();
  const site = await me.site(fresh);
  assert.equal(site.myUser.moderates.length, 0);
  const p = (await me.posts({ type: 'Local', sort: 'New', limit: 50 }, fresh)).posts[0];
  await assert.rejects(me.lockPost(p.id, true), (e) => e.code === 'not_a_moderator');
  assert.equal(await me.reportCount(), 0);

  setRole('mod');
  const mod = await me.site(fresh);
  assert.equal(mod.myUser.moderates.length, 2);
  const mine = mod.myUser.moderates[0];
  assert.ok(await me.reportCount() > 0);
  const { reports } = await me.reports();
  assert.ok(reports.length > 0);
  await me.resolveReport(reports[0], true);
  assert.equal((await me.reports()).reports.length, reports.length - 1);
  const inMine = (await me.posts({ community: mine.fullName, sort: 'New', limit: 5 }, fresh)).posts[0];
  assert.equal((await me.lockPost(inMine.id, true)).locked, true);
  assert.equal((await me.removePost(inMine.id, true, 'Testing')).removed, true);
  await assert.rejects(me.featurePost(inMine.id, true, 'local'), (e) => e.code === 'not_an_admin');
  const log = await me.modlog({ communityId: mine.id }, fresh);
  assert.ok(log.entries.some((e) => e.kind === 'mod_lock_post' && e.post.id === inMine.id));

  setRole('admin');
  const admin = await me.site(fresh);
  assert.equal(admin.myUser.person.admin, true);
  assert.equal((await me.featurePost(p.id, true, 'local')).featuredLocal, true);
  setRole('user');
});

test('demo: unknown endpoints say so', async () => {
  await assert.rejects(me.get('no/such/thing', null, fresh), (e) => e.status === 404 && e.code === 'not_found');
});

test('demo: any username and password log in, as that name', async () => {
  resetWorld();
  const r = await anon.login('Bob', 'anything at all');
  assert.equal(r.jwt, demoToken('bob'));
  const bob = new LemmyV3(DEMO_BASE, () => r.jwt);
  const site = await bob.site(fresh);
  assert.equal(site.myUser.person.name, 'bob');
  assert.equal((await bob.user({ name: 'bob' }, fresh)).person.name, 'bob');
  // Mentions of you follow the new name.
  assert.ok((await bob.unreadCount()).mentions >= 1);
  assert.equal((await anon.login('bob@example.com', 'x')).jwt, demoToken('bob'));
  await assert.rejects(anon.login('alba', 'x'), (e) => e.code === 'username_already_exists');
  await assert.rejects(anon.login('no spaces', 'x'), (e) => e.code === 'invalid_username');
});

test('demo: the showcase threads are all there, by people who exist, with their replies in order', async () => {
  resetWorld();
  const w = makeWorld(1_700_000_000_000);
  const names = new Set(w.persons.map((p) => p.name));
  const count = (list) => list.reduce((n, x) => n + 1 + count(x.replies), 0);
  const authors = (list) => list.flatMap((x) => [x.by, ...authors(x.replies)]);
  for (const t of THREADS) {
    assert.ok(w.communities.some((c) => c.name === t.community), t.community);
    for (const by of [t.by, ...authors(t.comments)]) assert.ok(names.has(by), `${t.title}: ${by}`);
    // Spoilers open and close.
    const texts = (list) => list.flatMap((x) => [x.text, ...texts(x.replies)]);
    for (const text of [t.body, ...texts(t.comments)]) {
      assert.equal((text.match(/::: spoiler/g) || []).length, (text.match(/\n:::(\n|$)/g) || []).length, `${t.title}: spoiler`);
    }
    const p = w.posts.find((x) => x.name === t.title);
    assert.ok(p, t.title);
    assert.equal(w.comments.filter((x) => x.postId === p.id).length, count(t.comments), t.title);
  }
  // Your wrong Monty Hall answer has a new reply in the inbox.
  const replies = (await me.inbox({ filter: 'replies' })).items;
  assert.ok(replies.some((i) => !i.read && /nothing the host does can change that/.test(i.content)));
});

test('demo: the showcase threads come first on the front page, after pinned posts', async () => {
  resetWorld();
  const titles = new Set(THREADS.map((t) => t.title));
  for (const sort of ['Active', 'Hot', 'Scaled']) {
    const { posts } = await me.posts({ type: 'All', sort, limit: 25 }, fresh);
    const unpinned = posts.filter((p) => !p.featuredLocal);
    assert.ok(unpinned.slice(0, THREADS.length).every((p) => titles.has(p.title)), sort);
  }
  // Other sorts stay as they are.
  const top = (await me.posts({ type: 'All', sort: 'TopAll', limit: 25 }, fresh)).posts.filter((p) => !p.featuredLocal);
  assert.ok(top[0].score >= top[1].score);
});

test('demo: kept until reset, marked changed only by what a reset would undo, and caught up after time away', async () => {
  // A localStorage of our own, for this test.
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  try {
    resetWorld();
    const first = (await me.posts({ type: 'All', sort: 'New', limit: 1 }, fresh)).posts[0];
    await me.post(first.id, fresh);   // reading isn't a change
    assert.equal(demoChanged.peek(), false);
    await me.vote(first.id, 1);
    assert.equal(demoChanged.peek(), true);
    assert.equal(store.get('olemmy:demo-changed'), '1');

    // Thirty days away: the world reads as fresh as it was, the vote still there.
    const saved = JSON.parse(store.get('olemmy:demo'));
    saved.lastSeen -= 30 * 864e5;
    store.set('olemmy:demo', JSON.stringify(saved));
    reloadWorld();
    const again = (await me.post(first.id, fresh)).post;
    assert.equal(again.myVote, 1);
    assert.ok(Math.abs(Date.parse(again.published) - Date.parse(first.published) - 30 * 864e5) < 60e3);

    // A new demo version throws an old one away, and says so once.
    const old = JSON.parse(store.get('olemmy:demo'));
    old.version = 0;
    store.set('olemmy:demo', JSON.stringify(old));
    reloadWorld();
    assert.equal(takeDiscarded(), true);
    assert.equal(takeDiscarded(), false);
    assert.equal(demoChanged.peek(), false);

    // Reset clears it all.
    await me.vote(first.id, 1);
    resetWorld();
    assert.equal(demoChanged.peek(), false);
    assert.equal(store.has('olemmy:demo'), false);
  } finally {
    delete globalThis.localStorage;
    resetWorld();
  }
});

test('demo: the old test server\'s accounts and instance move to the demo, logged in', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  store.set('olemmy:testserver', '{}');
  store.set('olemmy:accounts', JSON.stringify({ v: 1, data: { active: 1, list: [
    { instance: 'lemmy.world', username: 'me', jwt: 'real', remember: true },
    { instance: 'test.olemmy.invalid', username: 'tester', jwt: 'olemmy-test-server-token', remember: true },
  ] } }));
  store.set('olemmy:settings', JSON.stringify({ v: 1, data: { instance: 'test.olemmy.invalid', theme: 'dark' } }));
  migrateTestServer(storage);
  const { data } = JSON.parse(store.get('olemmy:accounts'));
  assert.deepEqual(data.list[0], { instance: 'lemmy.world', username: 'me', jwt: 'real', remember: true });
  assert.deepEqual(data.list[1], { instance: 'demo.olemmy.invalid', username: 'tester', jwt: demoToken('tester'), remember: true });
  assert.equal(data.active, 1);
  assert.deepEqual(JSON.parse(store.get('olemmy:settings')).data, { instance: 'demo.olemmy.invalid', theme: 'dark' });
  assert.equal(store.has('olemmy:testserver'), false);
  // Nothing to move: nothing touched.
  const before = store.get('olemmy:accounts');
  migrateTestServer(storage);
  assert.equal(store.get('olemmy:accounts'), before);
});
