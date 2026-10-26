// The 70×70 thumbnail beside a post title (§15 #15), or one of our own
// placeholder icons: self, link, image, video, nsfw.

import { h, icon } from '../core/h.js';
import { thumbnailUrl, isImageUrl, isVideoUrl, safeMediaUrl, embedFor, videoThumbnail } from '../util/links.js';
import { settings } from '../state/settings.js';
import { me } from '../state/session.js';
import { option } from '../features/registry.js';

/** Should [post]'s media be blurred? The account decides when logged in (§15 #13). */
export function nsfwBlurred(post) {
  if (!post.nsfw) return false;
  const account = me.peek()?.settings;
  return account ? account.blurNsfw : settings.peek().blurNsfw;
}

function placeholder(post) {
  if (post.nsfw) return 'nsfw';
  if (!post.url) return 'self';
  if (isVideoUrl(post.url, post.urlContentType) || embedFor(post.url) || (post.embedVideoUrl && embedFor(post.embedVideoUrl))) return 'video';
  if (isImageUrl(post.url, post.urlContentType)) return 'image';
  return 'link';
}

/** A still for a video post without a thumbnail (YouTube's only if the setting allows). */
function videoStill(post) {
  const youtube = option('expandos', 'youtubeThumbnails') !== false;
  for (const url of [post.url, post.embedVideoUrl]) {
    const still = url && safeMediaUrl(url) && videoThumbnail(url, { youtube });
    if (still) return still;
  }
  return null;
}

/** @param {{ href: string, onclick?: Function }} link  where the thumbnail goes */
export function thumbnail(post, link) {
  const s = settings.peek();
  if (s.showThumbnails === false || s.displayMode === 'text') return null;
  if (post.nsfw && s.hideNsfwThumbnails) return null;
  const src = thumbnailUrl(post.thumbnail || (isImageUrl(post.url || '', post.urlContentType) ? safeMediaUrl(post.url) : null))
    || videoStill(post);
  const blur = nsfwBlurred(post);
  const kind = placeholder(post);
  const a = h('a.thumbnail', {
    href: link.href,
    tabIndex: -1,
    'aria-hidden': 'true',
    rel: link.external ? 'noopener noreferrer' : undefined,
    target: link.target,
    class: { [`thumb-${kind}`]: true, 'nsfw-blur': blur && !!src },
    onclick: link.onclick,
  });
  if (src && !(blur && post.nsfw && settings.peek().blurNsfw === 'hide')) {
    const img = h('img', { src, alt: '', width: 70, height: 70, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    // A broken thumbnail falls back to the placeholder.
    img.addEventListener('error', () => img.replaceWith(icon(`thumb-${kind}`)), { once: true });
    a.append(img);
  } else {
    a.append(icon(`thumb-${kind}`));
  }
  return a;
}
