// The language a post or comment was written in, from its language tag
// (named by the instance's language list), at the end of its tagline: as
// its name ("Deutsch"), its code ("DE"), or a flag (the code where there's
// no fair flag). Untagged ("undetermined") items get nothing.

import { h } from '../core/h.js';
import { site } from '../state/session.js';
import { defineFeature, enabled, option } from './registry.js';
import { flagFor } from './language-flags.js';

/** The browser's languages, as primary codes: "en", "de". */
function browserLanguages() {
  const list = navigator.languages?.length ? navigator.languages : [navigator.language || ''];
  return new Set(list.map((l) => l.toLowerCase().split('-')[0]).filter(Boolean));
}

/** Language [id] from the instance's list ({ id, code, name }), or null for none or undetermined. */
export function languageOf(id) {
  if (!id) return null;
  const lang = site.peek()?.languages?.find((l) => l.id === id);
  return lang && lang.code !== 'und' ? lang : null;
}

/** A flag (where there's a fair one) and the name, for profiles. */
export function languageWithFlag(lang, title = lang.name) {
  const src = flagFor(lang.code);
  const img = src && h('img.lang-flag', { src, alt: '', width: 20, height: 15, decoding: 'async' });
  img?.addEventListener('error', () => img.remove(), { once: true });
  return h('span.lang-with-flag', { lang: lang.code, title }, img, lang.name);
}

function label(languageId) {
  const lang = languageOf(languageId);
  if (!lang) return null;
  if (option('languageLabels', 'hideMine') && browserLanguages().has(lang.code.toLowerCase())) return null;
  const title = `Written in ${lang.name}`;
  const code = () => h('span.lang-label.lang-code', { lang: lang.code, title }, lang.code.toUpperCase());
  const style = option('languageLabels', 'style');
  if (style === 'code') return code();
  const flag = style === 'flag' && flagFor(lang.code);
  if (flag) {
    const img = h('img.lang-flag', { src: flag, alt: lang.code.toUpperCase(), title, width: 20, height: 15, decoding: 'async' });
    img.addEventListener('error', () => img.replaceWith(code()), { once: true });
    return img;
  }
  return h('span.lang-label', { lang: lang.code, title }, lang.name);
}

const COMMENT_TAGLINE = ':scope > .comment-inner .tagline';

function decorate(node, item, own) {
  const tagline = node.querySelector(own);
  const el = tagline && label(item.languageId);
  if (el) tagline.append(' ', el);
}

/** Redo comment [node]'s label after its language changed (an edit). */
export function relabel(node, comment) {
  node.querySelector(COMMENT_TAGLINE)?.querySelectorAll(':scope > .lang-label, :scope > .lang-flag').forEach((el) => el.remove());
  if (enabled('languageLabels')) decorate(node, comment, COMMENT_TAGLINE);
}

export default defineFeature({
  id: 'languageLabels',
  name: 'Language labels',
  category: 'Browsing',
  description: 'Show the language a post or comment is tagged with, like "Deutsch", in its tagline.',
  keywords: 'language translation tag german locale',
  options: {
    style: { type: 'select', default: 'code', label: 'Show it as', choices: [['name', 'its name (Deutsch)'], ['code', 'its code (DE)'], ['flag', 'a flag (the code where there isn\'t one)']] },
    hideMine: { type: 'boolean', default: false, label: 'Not for the languages your browser uses' },
  },
  onPostRender(node, post) { decorate(node, post, '.tagline'); },
  onCommentRender(node, comment) { decorate(node, comment, COMMENT_TAGLINE); },
});
