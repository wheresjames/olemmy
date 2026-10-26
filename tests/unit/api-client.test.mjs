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
