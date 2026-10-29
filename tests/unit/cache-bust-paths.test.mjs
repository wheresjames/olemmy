// The development cache buster (web/js/cache-bust.js) finds the app's files
// by quoted paths that end at the extension: 'assets/icons.svg#x' would be
// missed (it was, until the sprite got its own constant in core/h.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

function* walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* walk(p); else if (p.endsWith('.js')) yield p;
  }
}

test('no file path in the code hides behind a #fragment the cache buster can\'t see', () => {
  const bad = [];
  for (const f of walk(fileURLToPath(new URL('../../web/js/', import.meta.url)))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/["'`][\w./-]+\.(?:svg|png|json|css|js)#/g)) bad.push(`${f}: ${m[0]}`);
  }
  assert.deepEqual(bad, []);
});
