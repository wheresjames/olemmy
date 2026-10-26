// Favorites pages: the rules in favorites-model.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../../web/js/features/favorites-model.js';

const names = (n, p = 'c') => Array.from({ length: n }, (_, i) => `${p}${i}@x.org`);
const page = (communities, name = '') => ({ name, communities });

test('add: to the last page with room, else a new page; never twice', () => {
  let r = F.add([], 'a@x.org');
  assert.deepEqual(r.pages, [page(['a@x.org'])]);
  assert.equal(F.add(r.pages, 'A@x.org').error, 'already');
  r = F.add([page(names(10))], 'z@x.org');
  assert.equal(r.page, 1);
  assert.deepEqual(r.pages[1].communities, ['z@x.org']);
  assert.equal(F.add([page(names(10))], 'z@x.org', 0).error, 'page-full');
});

test('add: at most MAX_PAGES pages', () => {
  const full = Array.from({ length: F.MAX_PAGES }, (_, i) => page(names(F.PER_PAGE, `p${i}-`)));
  assert.equal(F.add(full, 'z@x.org').error, 'full');
});

test('move: within a page, across pages, onto a new page; empty pages go', () => {
  const pages = [page(['a', 'b', 'c']), page(['d'])];
  assert.deepEqual(F.move(pages, 'c', 0, 0).pages, [page(['c', 'a', 'b']), page(['d'])]);
  assert.deepEqual(F.move(pages, 'a', 1, 0).pages, [page(['b', 'c']), page(['a', 'd'])]);
  const r = F.move(pages, 'd', 2);
  assert.deepEqual(r.pages, [page(['a', 'b', 'c']), page(['d'])], 'the only one on its page: the empty page goes');
  const s = F.move(pages, 'b', 2);
  assert.deepEqual(s.pages, [page(['a', 'c']), page(['d']), page(['b'])]);
  assert.equal(s.page, 2);
});

test('move: a full page takes nothing new, but can reorder itself', () => {
  const pages = [page(names(10)), page(['z'])];
  assert.equal(F.move(pages, 'z', 0).error, 'page-full');
  assert.deepEqual(F.move(pages, 'c9@x.org', 0, 0).pages[0].communities.slice(0, 2), ['c9@x.org', 'c0@x.org']);
});

test('tidy: repeats dropped, overfull pages spill, names cleaned', () => {
  const t = F.tidy([page([...names(12), 'c0@x.org'], 'My Stuff!'), page([])]);
  assert.equal(t.length, 2);
  assert.equal(t[0].name, 'my-stuff');
  assert.equal(t[0].communities.length, 10);
  assert.deepEqual(t[1], page(['c10@x.org', 'c11@x.org']));
});

test('pages: rename (names unique), reorder, delete; multis become pages', () => {
  const pages = [page(['a'], 'news'), page(['b'])];
  assert.equal(F.rename(pages, 1, 'News').error, 'taken');
  assert.equal(F.rename(pages, 1, 'Linux Stuff').pages[1].name, 'linux-stuff');
  assert.deepEqual(F.movePage(pages, 1, -1).pages.map((p) => p.communities[0]), ['b', 'a']);
  assert.equal(F.movePage(pages, 0, -1).error, 'edge');
  assert.deepEqual(F.deletePage(pages, 0), [page(['b'])]);
  const merged = F.fromMultis(pages, [{ name: 'tech', communities: ['a', 'c'] }]);
  assert.deepEqual(merged[2], page(['c'], 'tech'), 'a community already favorited stays where it was');
  assert.equal(F.pageNamed(merged, 'TECH'), 2);
  assert.equal(F.pageLabel(merged, 0), 'page 1 · news');
});

test('a shared page: added as a new page, without what you have already', () => {
  const pages = [page(['a@x.org'], 'tech')];
  const r = F.addPage(pages, 'tech', ['a@x.org', 'b@x.org', 'b@x.org']);
  assert.deepEqual(r.pages[1], page(['b@x.org']), 'name taken: unnamed; a@x.org stays where it was');
  assert.equal(r.page, 1);
  assert.equal(F.addPage(pages, 'news', ['a@x.org']).error, 'already');
  assert.equal(F.addPage(pages, 'News!', ['c@x.org']).pages[1].name, 'news');
});
