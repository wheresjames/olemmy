// The instance directory: the rules in api/directory.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../web/js/api/directory.js';

const raw = (baseurl, extra = {}) => ({
  baseurl, name: baseurl.split('.')[0], desc: '', icon: `https://${baseurl}/icon.png`, reg_mode: 2, langs: ['all'], tags: [],
  counts: { users: 10, users_active_month: 1 }, published: 1, score: 1, isSuspicious: false, ...extra,
});

test('normalize: keeps what the picker shows, and drops bad addresses and links', () => {
  const i = D.normalize(raw('Lemmy.Example', { desc: '  A  place\n to talk ', icon: 'javascript:alert(1)', reg_mode: 1, langs: ['en', 'de'] }));
  assert.equal(i.host, 'lemmy.example');
  assert.equal(i.desc, 'A place to talk');
  assert.equal(i.icon, null);
  assert.equal(i.signup, 'application');
  assert.deepEqual(i.langs, ['en', 'de']);
  assert.deepEqual(D.normalize(raw('x.example', { langs: ['und', 'en'] })).langs, []);
  assert.equal(D.normalize(raw('not a host')), null);
  assert.equal(D.normalize(null), null);
});

test('parse: a list, once per host; anything else is an error', () => {
  assert.deepEqual(D.parse([raw('a.example'), raw('a.example'), raw('b.example')]).map((i) => i.host), ['a.example', 'b.example']);
  assert.throws(() => D.parse({}));
});

test('search: words, sign-ups, language and sort; suspicious ones left out', () => {
  const list = D.parse([
    raw('big.example', { score: 9, counts: { users: 900, users_active_month: 50 }, tags: ['general purpose'] }),
    raw('busy.example', { score: 5, counts: { users: 100, users_active_month: 80 }, desc: 'Games and tech', langs: ['de'] }),
    raw('closed.example', { score: 3, reg_mode: 0, published: 5 }),
    raw('fake.example', { score: 99, isSuspicious: true }),
  ]);
  const hosts = (o) => D.search(list, o).map((i) => i.host);
  assert.deepEqual(hosts(), ['big.example', 'busy.example', 'closed.example']);
  assert.deepEqual(hosts({ sort: 'active' }), ['busy.example', 'big.example', 'closed.example']);
  assert.deepEqual(hosts({ sort: 'newest' })[0], 'closed.example');
  assert.deepEqual(hosts({ q: 'GENERAL' }), ['big.example']);
  assert.deepEqual(hosts({ q: 'games tech' }), ['busy.example']);
  assert.deepEqual(hosts({ signups: true }), ['big.example', 'busy.example']);
  assert.deepEqual(hosts({ lang: 'fr' }), ['big.example', 'closed.example']);
  assert.deepEqual(D.languages(list), ['de']);
});
