// URL rules shared by markdown, post rows and expandos.

/**
 * [url] if it may be a link (http, https, mailto), else null. Relative
 * paths are resolved against [base] (the instance the content came from).
 */
export function safeUrl(url, base = 'https://invalid.invalid/') {
  if (!url) return null;
  let u;
  try { u = new URL(String(url).trim(), base); } catch { return null; }
  if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:') return u.href;
  return null;
}

/** [url] if it may be loaded as media (http, https only). */
export function safeMediaUrl(url) {
  const s = safeUrl(url);
  return s && /^https?:/i.test(s) ? s : null;
}

export function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

const NOT_LEMMY = /(^|\.)(github\.com|gitlab\.com|youtube\.com|twitter\.com|x\.com|medium\.com|tumblr\.com)$/i;

/**
 * The app route for a link into a Lemmy instance, or null:
 *   https://host/c/name       -> #/c/name@host
 *   https://host/u/name       -> #/u/name@host
 *   https://host/post/123     -> #/post/123 on [home], else #/resolve?q=<url>
 *   https://host/comment/123  -> the same, for comments
 *   /c/name, /u/name, /post/1 (relative, from content on [home])
 * Hosts known not to be Lemmy are left alone.
 * @param {string} url
 * @param {string} home  host of the instance in use
 */
export function lemmyRoute(url, home) {
  let u;
  try { u = new URL(url, `https://${home || 'invalid.invalid'}/`); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || NOT_LEMMY.test(u.hostname)) return null;
  // PieFed posts (/c/<community>/p/<id>/<slug>) and Mbin threads
  // (/m/<magazine>/t/<id>/<slug>): their share addresses (views/address.js).
  if (/^\/(c\/[^/]+\/p|m\/[^/]+\/t)\/\d+(\/[^/]*)?\/?$/.test(u.pathname)) return shareRoute(u.href);
  const m = u.pathname.match(/^\/(c|u|m|post|comment)\/([^/?#]+)\/?$/);
  if (!m) return null;
  const [, kind, raw] = m;
  let id;
  try { id = decodeURIComponent(raw); } catch { return null; }
  const host = u.host;
  const isHome = !home || host === home;
  if (kind === 'c' || kind === 'm' || kind === 'u') {
    if (!/^[\w]+(@[\w.-]+)?$/.test(id)) return null;
    const route = kind === 'u' ? 'u' : 'c';
    // Always name@instance: an address that means the same thing everywhere.
    return `#/${route}/${id.includes('@') ? id : `${id}@${host}`}`;
  }
  if (!/^\d+$/.test(id)) return null;
  if (isHome) return kind === 'post' ? `#/post/${id}` : `#/comment/${id}`;
  return shareRoute(u.href);
}

/** A host fit for an address: a name with a dot (or localhost), and maybe a port. */
export function validHost(host) {
  return /^(?=.{1,253}(:|$))([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9](:\d{1,5})?$/i.test(host)
    || /^localhost(:\d{1,5})?$/i.test(host);
}

/**
 * The address anyone can open for content whose original address is
 * [apId]: that address without its "https:/", so #/lemmy.world/post/123,
 * #/piefed.social/c/linux@lemmy.ml/p/42/a-title (views/address.js). Olemmy's
 * own routes never have a dot in their first part, so the two can't mix.
 * #/resolve?q=<apId> when it has a query; null without an address.
 */
export function shareRoute(apId) {
  let u;
  try { u = new URL(apId); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  if (u.pathname.length > 1 && !u.search && validHost(u.host)) return `#/${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}`;
  return `#/resolve?q=${encodeURIComponent(u.href)}`;
}

/** The original address a share route's [host] and [rest] (after the host) stand for. */
export function shareOriginal(host, rest) {
  return `${/^localhost(:|$)/i.test(host) ? 'http' : 'https'}://${host.toLowerCase()}/${rest}`;
}

const IMAGE = /\.(jpe?g|png|gif|webp|avif|bmp)$/i;
const VIDEO = /\.(mp4|webm|mov|m4v|ogv|gifv)$/i;

/** Path of [url], looking through Lemmy's image proxy. */
function realPath(url) {
  try {
    const u = new URL(url);
    if (u.pathname.endsWith('/api/v3/image_proxy')) {
      const inner = u.searchParams.get('url');
      if (inner) return new URL(inner).pathname;
    }
    return u.pathname;
  } catch { return ''; }
}

export function isVideoUrl(url, contentType = '') {
  if (/^video\//.test(contentType)) return true;
  return VIDEO.test(realPath(url));
}

export function isImageUrl(url, contentType = '') {
  if (/^image\//.test(contentType)) return true;
  if (isVideoUrl(url, contentType)) return false;
  return IMAGE.test(realPath(url)) || /\/pictrs\/image\//.test(url) || /^i\.imgur\.com$/.test(domainOf(url));
}

/** imgur .gifv is an mp4. */
export function videoSource(url) {
  return url.replace(/\.gifv(\?|$)/i, '.mp4$1');
}

/**
 * Allowlisted embeds (§15 #14): { kind, src, title } for a sandboxed,
 * click-to-load iframe, or null. YouTube goes through youtube-nocookie.
 */
export function embedFor(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^(www|m)\./, '');
  let m;
  const yt = youtubeId(u);
  if (yt) return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${yt}${startParam(u)}`, title: 'YouTube video' };
  if (host === 'vimeo.com' && (m = u.pathname.match(/^\/(\d+)/))) {
    return { kind: 'vimeo', src: `https://player.vimeo.com/video/${m[1]}?dnt=1`, title: 'Vimeo video' };
  }
  if (host === 'streamable.com' && (m = u.pathname.match(/^\/(?:e\/)?(\w+)/))) {
    return { kind: 'streamable', src: `https://streamable.com/e/${m[1]}`, title: 'Streamable video' };
  }
  // PeerTube: /w/<short id> or /videos/watch/<uuid>, on any host.
  if ((m = u.pathname.match(/^\/(?:w|videos\/watch)\/([\w-]{8,})$/))) {
    return { kind: 'peertube', src: `${u.origin}/videos/embed/${m[1]}`, title: 'PeerTube video' };
  }
  return null;
}

/** The video ID in a YouTube address (watch, shorts, embed, live, youtu.be), or null. */
function youtubeId(u) {
  const host = u.hostname.replace(/^(www|m)\./, '');
  let id = null;
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/);
    id = u.searchParams.get('v') || (m && m[1]);
  } else if (host === 'youtu.be') {
    id = u.pathname.match(/^\/([\w-]{6,})/)?.[1] || null;
  }
  return id && /^[\w-]+$/.test(id) ? id : null;
}

/**
 * A still for a video post that Lemmy has no thumbnail for: YouTube's own
 * (only with [youtube], since it loads from Google), or imgur's for its
 * .mp4 / .gifv. Neither needs a request beyond the image itself.
 */
export function videoThumbnail(url, { youtube = true } = {}) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const yt = youtube && youtubeId(u);
  if (yt) return `https://i.ytimg.com/vi/${yt}/mqdefault.jpg`;
  const m = u.hostname === 'i.imgur.com' && u.pathname.match(/^\/(\w{5,})\.(?:mp4|gifv|webm)$/i);
  if (m) return `https://i.imgur.com/${m[1]}b.jpg`;
  return null;
}

function startParam(u) {
  const t = u.searchParams.get('t') || u.searchParams.get('start');
  const secs = t && Number(String(t).replace(/s$/, ''));
  return secs ? `?start=${Math.floor(secs)}` : '';
}

/** A smaller copy of a pict-rs image (§15 #15), for thumbnails. */
export function thumbnailUrl(url, size = 140) {
  const safe = safeMediaUrl(url);
  if (!safe) return null;
  const u = new URL(safe);
  if (/\/pictrs\/image\//.test(u.pathname) || u.pathname.endsWith('/api/v3/image_proxy')) {
    u.searchParams.set('thumbnail', String(size));
  }
  return u.href;
}

/**
 * "Share → Olemmy" from another app (the manifest's share_target) opens
 * /?share_title=&share_text=&share_url=: turn it into a new post, the link
 * filled in. Apps often put the link in the text, so it's looked for there.
 */
export function shareToSubmit(params) {
  const get = (k) => (params.get(k) || '').trim();
  if (!['share_title', 'share_text', 'share_url'].some((k) => get(k))) return null;
  let text = get('share_text');
  let url = get('share_url');
  if (!/^https?:\/\//i.test(url)) {
    url = (text.match(/https?:\/\/\S+/i) || [''])[0];
    text = text.replace(url, '').trim();
  }
  const title = (get('share_title') || (url ? text : '')).slice(0, 200);
  const body = url ? (title === text ? '' : text) : text;
  const q = new URLSearchParams(Object.entries({ type: url ? 'link' : 'text', title, url, body }).filter(([, v]) => v));
  return `#/submit?${q}`;
}
