// Feature modules (docs/OLEMMY.md §7). Each feature describes
// itself, its default, and its options; the settings console is generated
// from these descriptions. Hooks are called for enabled features only:
//
//   onPostRender(node, post, ctx)      a post row or the post on its page
//   onCommentRender(node, comment, ctx)
//   onRoute(route)                     after each route change
//   filterPost(post) -> bool           false hides the post
//   filterComment(comment) -> bool
//   start()                            once, at startup (whether enabled or not;
//                                      check enabled() inside, it can change)
//
// Options are stored in olemmy:settings under features[id].

import { reportError } from '../core/errors.js';
import { computed } from '../core/signal.js';
import { settings } from '../state/settings.js';

/**
 * @typedef {{ type: 'boolean'|'number'|'select'|'text'|'list'|'custom', default: any, label: string,
 *             description?: string, choices?: [string, string][], min?: number, max?: number, step?: number,
 *             render?: (feature: Feature) => Node }} Option
 * @typedef {{ id: string, name: string, description: string, category: string, defaultEnabled?: boolean,
 *             alwaysOn?: boolean, scope?: 'browser'|'account', options?: Record<string, Option>, keywords?: string,
 *             [hook: string]: any }} Feature
 */

/** @type {Map<string, Feature>} */
const features = new Map();

/** @param {Feature} def */
export function defineFeature(def) {
  features.set(def.id, { defaultEnabled: true, options: {}, scope: 'browser', ...def });
  return features.get(def.id);
}

export function allFeatures() { return [...features.values()]; }
export function getFeature(id) { return features.get(id); }

function stored(id) { return settings.value.features?.[id] || {}; }

/** Is feature [id] on? Reactive. */
export function enabled(id) {
  const f = features.get(id);
  if (!f) return false;
  if (f.alwaysOn) return true;
  const s = stored(id);
  return s.enabled ?? f.defaultEnabled;
}

/** Option [key] of feature [id], or its default. Reactive. */
export function option(id, key) {
  const f = features.get(id);
  const s = stored(id);
  return key in s ? s[key] : f?.options?.[key]?.default;
}

/** A computed of option [key], for components. */
export function optionSignal(id, key) { return computed(() => option(id, key)); }

export function setFeature(id, patch) {
  settings.update((s) => ({
    ...s,
    features: { ...s.features, [id]: { ...(s.features?.[id] || {}), ...patch } },
  }));
}

export const setEnabled = (id, on) => setFeature(id, { enabled: on });
export const setOption = (id, key, value) => setFeature(id, { [key]: value });

/** Call [hook] on every enabled feature that has it. */
export function runHook(hook, ...args) {
  for (const f of features.values()) {
    if (typeof f[hook] === 'function' && enabled(f.id)) {
      try { f[hook](...args); } catch (e) { reportError(e, `feature ${f.id}.${hook}`); }
    }
  }
}

/** Does every enabled filter let [item] through? [hook] 'filterPost' or 'filterComment'. */
export function passes(hook, item) {
  for (const f of features.values()) {
    if (typeof f[hook] === 'function' && enabled(f.id)) {
      try { if (f[hook](item) === false) return false; } catch (e) { reportError(e, `feature ${f.id}.${hook}`); }
    }
  }
  return true;
}

export function startFeatures() {
  for (const f of features.values()) {
    if (typeof f.start === 'function') {
      try { f.start(); } catch (e) { reportError(e, `feature ${f.id}.start`); }
    }
  }
}

const pending = new Set();

/** Hold the next view's rendering until [promise] settles (code a feature loads on demand). */
export function waitFor(promise) {
  const p = Promise.resolve(promise).catch((e) => reportError(e, 'loading a feature')).finally(() => pending.delete(p));
  pending.add(p);
  return p;
}

/** Resolves when every feature's on-demand code asked for so far has loaded. */
export function featuresReady() { return Promise.all([...pending]); }
