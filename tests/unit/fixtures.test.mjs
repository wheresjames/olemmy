import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../fixtures/', import.meta.url);

test('offline fixtures contain fictional hosts and media only', () => {
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.json'))) {
    const body = readFileSync(new URL(name, dir), 'utf8');
    JSON.parse(body);
    for (const match of body.matchAll(/https?:\/\/[^\s"\\]+/g)) {
      const url = new URL(match[0]);
      const fictional = url.hostname === 'fixture.test' || url.hostname.endsWith('.example');
      const sampleVideo = url.hostname === 'www.youtube.com' && url.searchParams.get('v') === 'TESTVIDEO01';
      assert.ok(fictional || sampleVideo, `${name}: unexpected URL host ${url.hostname}`);
    }
  }
});
