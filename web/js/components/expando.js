// Inline viewers ("expandos"): images, direct video, allowlisted embeds
// (click to load, sandboxed, §15 #14), and self-post text.

import { h, icon } from '../core/h.js';
import { signal } from '../core/signal.js';
import { isImageUrl, isVideoUrl, videoSource, embedFor, safeMediaUrl, domainOf } from '../util/links.js';
import { mdBlock } from './common.js';
import { option } from '../features/registry.js';
import { nsfwBlurred } from './thumbnail.js';
import { settings } from '../state/settings.js';

/** What kind of expando [post] gets: 'image' | 'video' | 'embed' | 'text' | 'card' | null. */
export function expandoKind(post) {
  const url = post.url && safeMediaUrl(post.url);
  // Text-only mode: no media, just the text.
  if (settings.peek().displayMode === 'text') return post.body ? 'text' : null;
  if (url) {
    if (isVideoUrl(url, post.urlContentType)) return 'video';
    if (isImageUrl(url, post.urlContentType)) return 'image';
    if (embedFor(url) || (post.embedVideoUrl && (embedFor(post.embedVideoUrl) || isVideoUrl(post.embedVideoUrl)))) return 'embed';
  }
  if (post.body) return 'text';
  if (url && (post.embedDescription || post.embedTitle)) return 'card';
  return null;
}

const BUTTON_ICON = { image: 'image', video: 'play', embed: 'play', text: 'text', card: 'text' };
const BUTTON_LABEL = { image: 'image', video: 'video', embed: 'video', text: 'text', card: 'link preview' };

/** The toggle button; [open] is a signal. */
export function expandoButton(kind, open) {
  return h(`button.expando-button.for-${kind}`, {
    type: 'button',
    'aria-expanded': () => String(open.value),
    'aria-label': () => `${open.value ? 'Hide' : 'Show'} ${BUTTON_LABEL[kind]}`,
    title: () => `${open.value ? 'Hide' : 'Show'} ${BUTTON_LABEL[kind]}`,
    onclick: () => { open.value = !open.value; },
    dataset: { expando: kind },
  }, icon(open.peek() ? 'collapse' : BUTTON_ICON[kind]));
}

/** The expanded content for [post] of [kind]. */
export function expandoContent(post, kind, { blurred } = {}) {
  const maxWidth = option('expandos', 'maxWidth');
  const maxHeight = option('expandos', 'maxHeight');
  const box = h(`div.expando.expando-${kind}`, {
    style: {
      '--expando-max-w': maxWidth ? `${maxWidth}px` : null,
      '--expando-max-h': maxHeight ? `${maxHeight}px` : null,
    },
  });
  const url = post.url && safeMediaUrl(post.url);
  const blur = blurred ?? nsfwBlurred(post);

  if (kind === 'image') {
    const img = h('img.expando-img', {
      src: url, alt: post.altText || post.title, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer',
      onclick: () => img.classList.toggle('full'),
    });
    box.append(h('a.expando-media', { href: url, rel: 'noopener noreferrer', target: '_blank', onclick: (e) => e.preventDefault() }, img));
  } else if (kind === 'video') {
    box.append(h('video.expando-video', {
      src: videoSource(url), controls: true, preload: 'metadata', playsinline: true, loop: /\.gifv/i.test(url),
      'aria-label': post.altText || post.title,
    }));
  } else if (kind === 'embed') {
    const embed = embedFor(url) || (post.embedVideoUrl && embedFor(post.embedVideoUrl));
    const direct = !embed && post.embedVideoUrl && isVideoUrl(post.embedVideoUrl) && safeMediaUrl(post.embedVideoUrl);
    if (direct) {
      box.append(h('video.expando-video', { src: direct, controls: true, preload: 'metadata', playsinline: true }));
    } else if (embed) {
      box.append(clickToLoad(embed));
    }
  } else if (kind === 'text') {
    box.append(mdBlock(post.body, 'usertext-body'));
  } else if (kind === 'card') {
    box.append(h('div.link-card',
      post.embedTitle && h('strong', post.embedTitle),
      post.embedDescription && h('p', post.embedDescription)));
  }
  if (blur && (kind === 'image' || kind === 'video' || kind === 'embed')) {
    box.classList.add('nsfw-blur');
    box.append(h('button.nsfw-reveal', {
      type: 'button',
      onclick: (e) => { box.classList.remove('nsfw-blur'); e.currentTarget.remove(); },
    }, 'NSFW: click to show'));
  }
  return box;
}

/** A placeholder that becomes the sandboxed embed when clicked (privacy). */
function clickToLoad(embed) {
  const holder = h('div.embed-holder');
  const button = h('button.embed-load', {
    type: 'button',
    onclick: () => {
      const frame = h('iframe.embed-frame', {
        src: embed.src,
        title: embed.title,
        sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups',
        allow: 'fullscreen; picture-in-picture; encrypted-media',
        allowfullscreen: true,
        referrerpolicy: 'strict-origin-when-cross-origin',
        loading: 'lazy',
      });
      holder.replaceChildren(frame);
    },
  }, icon('play'), h('span', `Load ${embed.title} from ${domainOf(embed.src)}`));
  holder.append(button);
  return holder;
}

/**
 * An expando for [post] that a row can use: { button, content, open }.
 * The content is made the first time it opens.
 */
export function makeExpando(post, initiallyOpen = false) {
  const kind = expandoKind(post);
  if (!kind) return null;
  const open = signal(initiallyOpen);
  const button = expandoButton(kind, open);
  const slot = h('div.expando-slot');
  let content = null;
  // The button's icon follows the state.
  const sync = () => {
    button.replaceChildren(icon(open.peek() ? 'collapse' : BUTTON_ICON[kind]));
    if (open.peek()) {
      content ??= expandoContent(post, kind);
      if (!content.isConnected) slot.append(content);
      slot.hidden = false;
    } else {
      slot.hidden = true;
      // Stop video and embeds when closed.
      content?.querySelectorAll('video').forEach((v) => v.pause());
      if (content?.querySelector('iframe')) { content.remove(); content = null; }
    }
  };
  button.addEventListener('click', sync);
  sync();
  return {
    kind, button, content: slot, open,
    toggle(on = !open.peek()) { open.value = on; sync(); },
  };
}
