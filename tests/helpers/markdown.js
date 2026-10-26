// Load the vendored markdown-it UMD files into globals, as index.html does,
// then the app's markdown modules.

import { readdirSync, readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';

const vendor = new URL('../../web/vendor/', import.meta.url);
const dir = (name) => readdirSync(vendor).find((d) => d.startsWith(`${name}@`));

// As classic scripts, like the browser: each UMD file sets its global
// (markdownit, markdownitSub...). With no module or define in scope, that's
// the branch they take.
for (const name of ['markdown-it', 'markdown-it-sub', 'markdown-it-sup', 'markdown-it-footnote', 'markdown-it-container']) {
  const file = new URL(`${dir(name)}/${name}.min.js`, vendor);
  runInThisContext(readFileSync(file, 'utf8'), { filename: file.pathname });
}

const { renderMarkdown } = await import('../../web/js/markdown/render.js');
const { setCustomEmojis } = await import('../../web/js/markdown/md.js');
const { fakeDocument, toHTML } = await import('./fake-dom.js');

/** Markdown -> HTML string through the real renderer. */
export function html(text, opts = {}) {
  return toHTML(renderMarkdown(text, { doc: fakeDocument, home: 'lemmy.ml', ...opts }));
}

export { setCustomEmojis };
