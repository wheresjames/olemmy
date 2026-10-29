// A language picker for the post, reply and edit forms: the languages your
// account writes in (or the site's, logged out), and "undetermined", which
// leaves the choice to the server (see Lemmy's default post language).

import { h } from '../core/h.js';
import { site, me } from '../state/session.js';

/** The languages offered, "undetermined" (id 0) first. */
export function languageChoices() {
  const s = site.peek();
  const mine = me.peek()?.discussionLanguages;
  const allowed = new Set(mine?.length ? mine : s?.discussionLanguages || []);
  return (s?.languages || []).filter((l) => l.id === 0 || !allowed.size || allowed.has(l.id));
}

/** A <select> of [languageChoices], with [selected] chosen when it's offered. */
export function languageSelect({ id, selected = 0, cls = '' } = {}) {
  const choices = languageChoices();
  const pick = choices.some((l) => l.id === selected) ? selected : 0;
  return h(`select${id ? `#${id}` : ''}${cls ? `.${cls}` : ''}`,
    choices.map((l) => h('option', { value: l.id, selected: l.id === pick }, l.id === 0 ? 'undetermined' : l.name)));
}

/** The chosen language's id, or undefined for "undetermined" (the server picks). */
export function selectedLanguage(select) { return Number(select.value) || undefined; }
