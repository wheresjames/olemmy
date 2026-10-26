// markdown-it configured like Lemmy-UI: no raw HTML, linkify, typographer,
// sub/superscript (~sub~, ^sup^), footnotes, and ::: spoiler title ... :::
// blocks; plus our plugins for !community@instance, @user@instance and
// custom emoji. Only the parser is used: render.js turns tokens into DOM.

import * as vendor from '../../vendor/markdown-it.js';
import { lemmyLinks } from './plugins/lemmy-links.js';
import { customEmoji } from './plugins/custom-emoji.js';

let emojis = new Map();

/** Set the instance's custom emoji ([{ shortcode, url, alt }]). */
export function setCustomEmojis(list) {
  emojis = new Map((list || []).map((e) => [e.shortcode, e]));
}

/** A configured markdown-it; [lib] defaults to the vendored files. */
export function createMarkdown(lib = vendor) {
  const md = lib.markdownit({ html: false, linkify: true, typographer: true });
  md.use(lib.sub).use(lib.sup).use(lib.footnote);
  md.use(lib.container, 'spoiler', {
    validate: (params) => /^\s*spoiler\b/.test(params),
  });
  md.use(lemmyLinks);
  md.use(customEmoji, () => emojis);
  // Lemmy's own link filter: only these may be links or images.
  md.validateLink = (url) => /^(https?:|mailto:|#|\/)/i.test(url.trim()) || !/^[a-z][a-z0-9+.-]*:/i.test(url.trim());
  return md;
}

let instance = null;

/** The shared parser. */
export function getMarkdown() {
  instance ??= createMarkdown();
  return instance;
}

/** Parse [text] into tokens. */
export function parse(text) {
  return getMarkdown().parse(String(text ?? ''), {});
}
