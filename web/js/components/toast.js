// Short messages at the bottom of the screen, and persistent banners at the top.

import { h } from '../core/h.js';

let region = null;

function host() {
  if (!region) {
    region = h('div.toasts', { role: 'status', 'aria-live': 'polite' });
    document.body.append(region);
  }
  return region;
}

/**
 * Show [message] for a few seconds. [kind] 'info' | 'error' | 'success'.
 * [action] is an optional { label, run } button.
 */
export function toast(message, { kind = 'info', ms = 4000, action } = {}) {
  const el = h(`div.toast.toast-${kind}`,
    h('span', message),
    action && h('button.toast-action', { type: 'button', onclick: () => { action.run(); el.remove(); } }, action.label),
    h('button.toast-close', { type: 'button', 'aria-label': 'Dismiss', onclick: () => el.remove() }, '×'));
  host().append(el);
  if (ms) setTimeout(() => el.remove(), ms);
  return el;
}

export function toastError(e, prefix = '') {
  if (e?.kind === 'aborted') return null;
  const msg = e?.message || String(e);
  return toast(prefix ? `${prefix}: ${msg}` : msg, { kind: 'error', ms: 7000 });
}

const banners = new Map();

/** A banner under the header, one per [id], until dismissed or removed. */
export function banner(id, content, { kind = 'info', dismissible = true } = {}) {
  removeBanner(id);
  const area = document.getElementById('banners');
  if (!area) return null;
  const el = h(`div.banner.banner-${kind}`, { role: kind === 'error' ? 'alert' : 'status' },
    h('div.banner-text', content),
    dismissible && h('button.banner-close', { type: 'button', 'aria-label': 'Dismiss', onclick: () => removeBanner(id) }, '×'));
  banners.set(id, el);
  area.append(el);
  return el;
}

export function removeBanner(id) {
  banners.get(id)?.remove();
  banners.delete(id);
}
