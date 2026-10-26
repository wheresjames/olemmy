// markdown-it tokens -> DOM nodes. Never innerHTML: every piece of remote
// text goes in as a text node, every attribute through an allowlist.
//
//   renderMarkdown(text, { home: 'lemmy.world' }) -> DocumentFragment
//
// Links: only http(s) and mailto (safeUrl); links into Lemmy instances are
// routed inside the app (lemmyRoute), keeping the original as data-href.
// Images: http(s) only, lazy, no referrer; video file links in image syntax
// become <video> (as Lemmy's html5-embed plugin does).

import { parse } from './md.js';
import { safeUrl, safeMediaUrl, lemmyRoute, isVideoUrl, videoSource } from '../util/links.js';

/**
 * @typedef {{ home?: string, newTab?: boolean, doc?: Document, tokens?: any[], textOnly?: boolean }} RenderOptions
 */

/** Tags the block/inline tokens map straight onto. */
const SIMPLE = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'strong', 'em',
  's', 'sub', 'sup', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'dl', 'dt', 'dd']);

/**
 * @param {string} text
 * @param {RenderOptions} [opts]
 */
export function renderMarkdown(text, opts = {}) {
  const doc = opts.doc || document;
  const tokens = opts.tokens || parse(text);
  const root = doc.createDocumentFragment();
  // Footnote ids must be unique on a page holding many comments.
  renderTokens(tokens, root, { ...opts, doc, prefix: `${++renders}-` });
  return root;
}

let renders = 0;

function renderTokens(tokens, root, opts) {
  const { doc } = opts;
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const open = (el) => { top().appendChild(el); stack.push(el); };
  const close = () => { if (stack.length > 1) stack.pop(); };

  for (const t of tokens) {
    if (t.type === 'inline') {
      renderTokens(t.children || [], top(), opts);
      continue;
    }
    // Tight lists mark their paragraphs hidden: no <p> around the text.
    if ((t.type === 'paragraph_open' || t.type === 'paragraph_close') && t.hidden) continue;

    if (t.nesting === 1) {
      open(openTag(t, opts) || doc.createElement('span'));
      continue;
    }
    if (t.nesting === -1) {
      close();
      continue;
    }
    const node = leaf(t, opts);
    if (node) top().appendChild(node);
  }
}

/** The element for an opening token. */
function openTag(t, opts) {
  const { doc } = opts;
  const tag = t.tag;
  switch (t.type) {
    case 'link_open': return link(t, opts);
    case 'container_spoiler_open': {
      const details = doc.createElement('details');
      details.className = 'md-spoiler';
      const summary = doc.createElement('summary');
      const title = t.info.trim().replace(/^spoiler\s*/, '');
      summary.appendChild(doc.createTextNode(title || 'Spoiler'));
      details.appendChild(summary);
      return details;
    }
    case 'ordered_list_open': {
      const ol = doc.createElement('ol');
      const start = Number(t.attrGet && t.attrGet('start'));
      if (start && start !== 1) ol.setAttribute('start', String(start));
      return ol;
    }
    case 'th_open':
    case 'td_open': {
      const cell = doc.createElement(tag);
      // markdown-it gives alignment as a style attribute; the CSP forbids those.
      const style = (t.attrGet && t.attrGet('style')) || '';
      const align = style.match(/text-align:\s*(left|right|center)/);
      if (align) cell.className = `align-${align[1]}`;
      return cell;
    }
    case 'table_open': {
      // Tables scroll inside their own box (§6).
      return doc.createElement('table');
    }
    case 'footnote_block_open': {
      const section = doc.createElement('section');
      section.className = 'md-footnotes';
      section.appendChild(doc.createElement('hr'));
      const ol = doc.createElement('ol');
      section.appendChild(ol);
      // Children go into the list.
      return Object.assign(section, { appendChild: (c) => ol.appendChild(c) });
    }
    case 'footnote_open': {
      const li = doc.createElement('li');
      li.id = `fn-${opts.prefix || ''}${t.meta.id + 1}`;
      return li;
    }
    default:
      if (SIMPLE.has(tag)) return doc.createElement(tag);
      return null;
  }
}

/** A self-contained token. */
function leaf(t, opts) {
  const { doc } = opts;
  switch (t.type) {
    case 'text': return doc.createTextNode(t.content);
    case 'softbreak': return doc.createTextNode('\n');
    case 'hardbreak': return doc.createElement('br');
    case 'hr': return doc.createElement('hr');
    case 'code_inline': {
      const code = doc.createElement('code');
      code.appendChild(doc.createTextNode(t.content));
      return code;
    }
    case 'code_block':
    case 'fence': {
      const pre = doc.createElement('pre');
      const code = doc.createElement('code');
      const lang = (t.info || '').trim().split(/\s+/)[0];
      if (lang && /^[\w+#.-]+$/.test(lang)) code.className = `language-${lang}`;
      code.appendChild(doc.createTextNode(t.content));
      pre.appendChild(code);
      return pre;
    }
    case 'image': return image(t, opts);
    case 'custom_emoji': {
      const src = safeMediaUrl(t.meta.url);
      if (!src) return doc.createTextNode(`:${t.meta.shortcode}:`);
      const img = doc.createElement('img');
      img.className = 'md-emoji';
      img.setAttribute('src', src);
      img.setAttribute('alt', `:${t.meta.shortcode}:`);
      img.setAttribute('title', t.meta.alt);
      img.setAttribute('loading', 'lazy');
      img.setAttribute('referrerpolicy', 'no-referrer');
      return img;
    }
    case 'footnote_ref': {
      const sup = doc.createElement('sup');
      sup.className = 'md-footnote-ref';
      const a = doc.createElement('a');
      const n = t.meta.id + 1;
      a.setAttribute('href', `#fn-${opts.prefix || ''}${n}`);
      a.dataset.footnote = 'true';
      a.appendChild(doc.createTextNode(`[${n}${t.meta.subId > 0 ? `:${t.meta.subId}` : ''}]`));
      sup.appendChild(a);
      return sup;
    }
    case 'footnote_anchor': return null;
    case 'html_block':
    case 'html_inline':
      // html: false means these don't occur; if they did, show them as text.
      return doc.createTextNode(t.content);
    default:
      return t.content ? doc.createTextNode(t.content) : null;
  }
}

function link(t, opts) {
  const { doc } = opts;
  const raw = (t.attrGet && t.attrGet('href')) || '';
  // Our own !community@host / @user@host links.
  if (t.meta?.lemmy) {
    const a = doc.createElement('a');
    a.setAttribute('href', raw);
    a.className = t.meta.lemmy === 'c' ? 'md-community' : 'md-user';
    return a;
  }
  const href = safeUrl(raw, opts.home ? `https://${opts.home}/` : undefined);
  if (!href) return doc.createElement('span');
  const a = doc.createElement('a');
  const route = lemmyRoute(href, opts.home);
  if (route) {
    a.setAttribute('href', route);
    a.dataset.href = href;
    a.setAttribute('title', href);
    return a;
  }
  a.setAttribute('href', href);
  a.setAttribute('rel', 'noopener noreferrer ugc nofollow');
  if (opts.newTab) a.setAttribute('target', '_blank');
  const title = t.attrGet && t.attrGet('title');
  if (title) a.setAttribute('title', title);
  return a;
}

function image(t, opts) {
  const { doc } = opts;
  const src = safeMediaUrl(t.attrGet && t.attrGet('src'));
  const alt = (t.children || []).map((c) => c.content || '').join('') || t.content || '';
  if (!src) return doc.createTextNode(alt);
  // Text-only mode: a link to the image instead of the image.
  if (opts.textOnly) {
    const a = doc.createElement('a');
    a.className = 'md-media-link';
    a.setAttribute('href', src);
    a.setAttribute('rel', 'noopener noreferrer ugc nofollow');
    a.appendChild(doc.createTextNode(`[${isVideoUrl(src) ? 'video' : 'image'}${alt ? `: ${alt}` : ''}]`));
    return a;
  }
  if (isVideoUrl(src)) {
    const video = doc.createElement('video');
    video.className = 'md-video';
    video.setAttribute('src', videoSource(src));
    video.setAttribute('controls', '');
    video.setAttribute('preload', 'none');
    video.setAttribute('playsinline', '');
    if (alt) video.setAttribute('aria-label', alt);
    return video;
  }
  const img = doc.createElement('img');
  img.className = 'md-img';
  img.setAttribute('src', src);
  img.setAttribute('alt', alt);
  const title = t.attrGet && t.attrGet('title');
  if (title) img.setAttribute('title', title);
  img.setAttribute('loading', 'lazy');
  img.setAttribute('decoding', 'async');
  img.setAttribute('referrerpolicy', 'no-referrer');
  return img;
}
