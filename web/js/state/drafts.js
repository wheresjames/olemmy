// Drafts of replies, posts and messages, saved as they're typed
// (olemmy:drafts, the 50 most recent), so a reload, a crash or an app
// update never loses one.

import { persisted } from '../core/store.js';

const MAX_DRAFTS = 50;
export const drafts = persisted('drafts', { version: 1, defaults: {} });

export function readDraft(key) { return drafts.peek()[key]?.text || ''; }

export function saveDraft(key, text) {
  drafts.update((all) => {
    const next = { ...all };
    delete next[key];
    if (text) next[key] = { text, time: Date.now() };
    const keys = Object.keys(next);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_DRAFTS))) delete next[k];
    return next;
  });
}

export function clearDraft(key) { saveDraft(key, ''); }

/** Editors open right now (components/editor.js registers them), so the updater can wait for unsaved text. */
export const openEditors = new Set();
export function hasOpenDraft() {
  for (const e of openEditors) if (e.dirty()) return true;
  return false;
}
