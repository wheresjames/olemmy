// Sharing an Olemmy address: the system share sheet on phones, else the
// clipboard ("Link copied"); if both fail, the address in a toast to copy
// by hand. Every address shared is one that opens the same thing for anyone
// (common.js shareUrl, appUrl).
//
// Not called share.js: ad and tracker blockers block files by that name
// (social buttons), and this one is imported by every page, so a blocked
// copy stopped the whole app (tests/unit/core.test.mjs checks file names).

import { toast } from './toast.js';

/** The full address of route [hash] ("#/c/linux@lemmy.ml") in this copy of Olemmy. */
export const appUrl = (hash) => `${location.origin}${location.pathname}${hash}`;

/**
 * Copy [text]. The clipboard API exists only on https (and localhost); on a
 * plain http address, such as a development copy opened from a phone, the
 * older select-and-copy still works. Resolves to whether it was copied.
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* refused: try the old way */ }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.className = 'copy-buffer';
  document.body.append(area);
  area.select();
  area.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  area.remove();
  return ok;
}

/** Whether the system share sheet is there (https only). */
export const canShare = () => typeof navigator.share === 'function';

export async function shareLink(url, title = '') {
  try {
    if (canShare() && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ title, url });
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return;
  }
  if (await copyText(url)) toast('Link copied');
  else toast(url, { ms: 10000 });
}

/** Share [text] (an error report, say) with the share sheet. */
export async function shareText(text, title = '') {
  try {
    await navigator.share({ title, text });
    return true;
  } catch (e) {
    return e?.name === 'AbortError';
  }
}
