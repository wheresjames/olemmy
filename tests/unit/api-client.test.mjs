import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from '../../web/js/api/client.js';

test('rate-limit retries never exceed the per-instance request limit', async () => {
  const originalFetch = globalThis.fetch;
  let active = 0;
  let peak = 0;
  let calls = 0;
  globalThis.fetch = async () => {
    active++;
    peak = Math.max(peak, active);
    const call = ++calls;
    await new Promise((resolve) => setTimeout(resolve, call <= 4 ? 1 : 20));
    active--;
    if (call <= 4) return new Response('', { status: 429, headers: { 'Retry-After': '0.02' } });
    return Response.json({ ok: true });
  };

  try {
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) =>
      request('https://queue-fixture.test', { path: `api/v3/item/${i}`, fresh: true })));
    assert.ok(results.every((r) => r.ok));
    assert.equal(calls, 16);
    assert.ok(peak <= 4, `peak concurrency was ${peak}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a shared GET retrying keeps going when the first caller leaves', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => (++calls === 1 ? new Response('', { status: 503 }) : Response.json({ ok: true }));
  try {
    const leaving = new AbortController();
    const first = request('https://shared-fixture.test', { path: 'api/v3/x', signal: leaving.signal, fresh: true });
    const second = request('https://shared-fixture.test', { path: 'api/v3/x' });
    // During the retry's wait.
    setTimeout(() => leaving.abort(), 50);
    await assert.rejects(first, (e) => e.kind === 'aborted');
    assert.deepEqual(await second, { ok: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('an answer that isn\'t JSON is a readable error', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<!doctype html><title>Not Lemmy</title>', { status: 200 });
  try {
    await assert.rejects(request('https://html-fixture.test', { path: 'api/v3/site', fresh: true }),
      (e) => e.kind === 'http' && e.code === 'not_json' && /Lemmy instance/.test(e.message));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
