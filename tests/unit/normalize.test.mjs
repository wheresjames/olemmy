// normalize.js against fictional API responses (tests/fixtures).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as N from '../../web/js/api/normalize.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'));

test('site', () => {
  const s = N.site(fixture('site'));
  assert.equal(s.host, 'fixture.test');
  assert.equal(typeof s.enableDownvotes, 'boolean');
  assert.ok(s.version.startsWith('0.19'));
  assert.ok(s.languages.length > 10);
  assert.equal(s.myUser, null);
});

test('posts carry their community and creator hosts', () => {
  const posts = fixture('post-list').posts.map(N.post);
  assert.equal(posts.length, 25);
  for (const p of posts) {
    assert.ok(p.id && p.title);
    assert.ok(p.community.host && p.community.fullName.endsWith(`@${p.community.host}`));
    assert.ok(p.creator.fullName.includes('@'));
    assert.equal(typeof p.score, 'number');
  }
});

test('bidi controls are stripped from names', () => {
  assert.equal(N.cleanName('m_‮f'), 'm_f');
  assert.equal(N.cleanName('a⁦b⁩‏'), 'ab');
  const raw = fixture('post-list').posts.find((p) => /[‪-‮]/.test(p.creator.display_name || ''));
  if (raw) assert.ok(!/[‪-‮]/.test(N.post(raw).creator.displayName));
});

test('comments: depth and parent from the path; tree building', () => {
  const list = fixture('comments').comments.map(N.comment);
  for (const c of list) {
    assert.equal(c.depth, c.path.split('.').length - 2);
    if (c.depth) assert.equal(c.parentId, Number(c.path.split('.').at(-2)));
  }
  const roots = N.commentTree(list);
  const count = (ns) => ns.reduce((n, c) => n + 1 + count(c.children), 0);
  assert.equal(count(roots), list.length);
  assert.ok(roots.every((r) => r.depth === 0));
});

test('a subtree without its ancestors makes orphan roots', () => {
  const list = fixture('comments').comments.map(N.comment).filter((c) => c.depth >= 1);
  const roots = N.commentTree(list);
  assert.ok(roots.length > 0 && roots.every((r) => r.orphan));
});

test('community, user and search', () => {
  const c = fixture('community');
  const community = N.communityView(c.community_view);
  assert.equal(community.fullName, 'linux@fixture.test');
  assert.ok(community.subscribers > 0);
  const u = N.personView(fixture('user').person_view);
  assert.equal(u.fullName, 'harbor_reader@fixture.test');
  assert.ok(u.postCount > 0 && u.admin);
  const s = fixture('search');
  assert.ok(s.posts.map(N.post).length + s.communities.map(N.communityView).length > 0);
});
