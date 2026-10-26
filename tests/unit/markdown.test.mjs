// Markdown: markdown-it configured like Lemmy-UI, our plugins, and the
// token-to-DOM renderer's safety rules.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html, setCustomEmojis } from '../helpers/markdown.js';

test('basic inline formatting, sub and superscript', () => {
  assert.equal(html('**b** _i_ ~~s~~ H~2~O x^2^ `c`'),
    '<p><strong>b</strong> <em>i</em> <s>s</s> H<sub>2</sub>O x<sup>2</sup> <code>c</code></p>');
});

test('raw HTML is text, never markup', () => {
  const out = html('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
  assert.ok(!out.includes('<script'));
  assert.ok(!out.includes('<img'));
  assert.ok(out.includes('&lt;script&gt;'));
});

test('only http, https and mailto links', () => {
  assert.ok(!html('[x](javascript:alert(1))').includes('href'));
  assert.ok(!html('[x](data:text/html,hi)').includes('href'));
  assert.ok(!html('[x](vbscript:msgbox)').includes('href'));
  assert.match(html('[x](https://example.com)'), /href="https:\/\/example\.com\/" rel="noopener noreferrer ugc nofollow"/);
  assert.match(html('<mailto:a@b.co>'), /href="mailto:a@b.co"/);
});

test('images: http(s) only, lazy, no referrer; video files become <video>', () => {
  assert.match(html('![a](https://x.org/a.png)'), /<img class="md-img" src="https:\/\/x.org\/a.png" alt="a" loading="lazy" decoding="async" referrerpolicy="no-referrer">/);
  assert.match(html('![v](https://x.org/a.webm)'), /<video class="md-video" src="https:\/\/x.org\/a.webm" controls preload="none"/);
  assert.ok(!html('![a](javascript:x)').includes('<img'));
  assert.ok(!html('![a](data:image/png;base64,AA)').includes('<img'));
});

test('!community@instance and @user@instance link inside the app', () => {
  const out = html('see !linux@lemmy.ml and @sample_reader@fixture.test.');
  assert.match(out, /<a href="#\/c\/linux@lemmy.ml" class="md-community">!linux@lemmy.ml<\/a>/);
  assert.match(out, /<a href="#\/u\/sample_reader@fixture.test" class="md-user">@sample_reader@fixture.test<\/a>\./);
});

test('mentions need a word boundary; emails stay emails', () => {
  assert.ok(!html('me@sample_reader@fixture.test').includes('md-user'));
  assert.match(html('a@b.com'), /mailto:a@b.com/);
  assert.ok(!html('!linux').includes('<a'));
});

test('links to Lemmy instances route inside the app; known other sites do not', () => {
  assert.match(html('[c](https://lemmy.world/c/linux)'), /href="#\/c\/linux@lemmy.world" data-href="https:\/\/lemmy.world\/c\/linux"/);
  assert.match(html('[p](https://lemmy.ml/post/5)'), /href="#\/post\/5"/);
  assert.match(html('[p](https://lemmy.world/post/5)'), /href="#\/lemmy.world\/post\/5"/);
  assert.match(html('[r](https://github.com/u/someone)'), /href="https:\/\/github.com\/u\/someone"/);
});

test('spoilers become details/summary', () => {
  assert.equal(html('::: spoiler Alt text\nhidden *x*\n:::'),
    '<details class="md-spoiler"><summary>Alt text</summary><p>hidden <em>x</em></p></details>');
});

test('table alignment uses classes, not style attributes (CSP)', () => {
  const out = html('| a | b |\n|:-|-:|\n| 1 | 2 |');
  assert.ok(!out.includes('style='));
  assert.match(out, /<th class="align-left">a<\/th><th class="align-right">b<\/th>/);
});

test('footnotes get unique ids per render', () => {
  const a = html('x[^1]\n\n[^1]: note');
  const b = html('x[^1]\n\n[^1]: note');
  const id = (s) => s.match(/id="([^"]+)"/)[1];
  assert.notEqual(id(a), id(b));
  assert.match(a, /<section class="md-footnotes">/);
});

test('code blocks keep their text and a safe language class', () => {
  assert.equal(html('```js\na < b\n```'), '<pre><code class="language-js">a &lt; b\n</code></pre>');
  assert.ok(!html('```" onclick="x\nhi\n```').includes('onclick="x"'));
});

test('custom emoji from the instance', () => {
  setCustomEmojis([{ shortcode: 'party', url: 'https://lemmy.ml/pictrs/image/p.png', alt: 'party' }]);
  assert.match(html(':party: :unknown:'), /<img class="md-emoji" src="https:\/\/lemmy.ml\/pictrs\/image\/p.png" alt=":party:"[^>]*> :unknown:/);
  setCustomEmojis([]);
});
