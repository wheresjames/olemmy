// The settings console: Olemmy's own preferences, generated
// from the feature descriptions, in three tabs (options, features,
// advanced) with search across all of them, export/import, and the
// "Refresh app files" button. A setting kept on the Lemmy account is
// tagged "Account" (§15 #13). Lemmy account settings are in account.js.
//
// Each row is the setting's name and description, with its control beside
// them (below them for wide controls), so it reads the same on a phone.

import { h } from '../core/h.js';
import { signal, effect } from '../core/signal.js';
import { href } from '../core/router.js';
import { allKeys, readRaw, writeRaw, PREFIX } from '../core/store.js';
import { settings, setSettings } from '../state/settings.js';
import { loggedIn } from '../state/session.js';
import { allFeatures, enabled, setEnabled, option, setOption } from '../features/registry.js';
import { PALETTES, LABEL as THEME_LABELS, setTheme } from '../features/themes.js';
import { setTitle } from '../components/common.js';
import { tabMenu } from '../components/tab-menu.js';
import { confirmAction } from '../components/dialog.js';
import { toast } from '../components/toast.js';
import { installed, label, refresh } from '../update.js';
import { SORT_LABELS } from '../util/format.js';
import { POST_SORTS, COMMENT_SORTS } from '../api/v3.js';

const TABS = [['options', 'options'], ['features', 'features'], ['filters', 'filters'], ['advanced', 'advanced']];
/** Feature categories with a tab of their own. */
const OWN_TAB = { Filtering: 'filters' };

let ids = 0;
const nextId = () => `setting-${++ids}`;

/** An on|off switch: a checkbox underneath, so keyboards and screen readers get a switch. */
function toggle(checked, onchange, labelText, id) {
  return h('span.toggle',
    h('input', { id, type: 'checkbox', role: 'switch', checked, 'aria-label': id ? undefined : labelText, onchange: (e) => onchange(e.target.checked) }),
    h('span.toggle-ui', { 'aria-hidden': 'true' }, h('span.toggle-on', 'on'), h('span.toggle-off', 'off')));
}

/**
 * One setting: [name, description] beside [control], or above it when
 * `wide`. With `id`, the name is the control's label.
 */
function row(name, control, { description = '', scope = 'browser', keywords = '', wide = false, id } = {}) {
  return h('div.setting', { class: { wide }, dataset: { search: `${name} ${description} ${keywords}`.toLowerCase() } },
    h('div.setting-text',
      h(id ? 'label.setting-name' : 'span.setting-name', id ? { for: id } : {}, name, scope === 'account' && h('span.scope', 'Account')),
      description && h('p.setting-desc', description)),
    h('div.setting-control', control));
}

function toggleRow(name, checked, onchange, opts = {}) {
  const id = nextId();
  return row(name, toggle(checked, onchange, name, id), { ...opts, id });
}

function selectRow(name, value, choices, onchange, opts = {}) {
  const id = nextId();
  return row(name, select(value, choices, onchange, id), { ...opts, id });
}

function select(value, choices, onchange, id) {
  return h('select', { id, onchange: (e) => onchange(e.target.value) },
    choices.map(([v, text]) => h('option', { value: v, selected: v === value }, text)));
}

/** A titled box of settings. */
function group(tab, title, ...rows) {
  return h('section.settings-group', { dataset: { tab } },
    h('h2.settings-group-title', title),
    h('div.settings-group-body', rows));
}

// Applied when the slider is let go: resizing the text while dragging moves
// the slider out from under the pointer.
function textSize(initial, id) {
  const shown = signal(initial);
  return h('span.range', h('input', {
    id, type: 'range', min: 80, max: 150, step: 5, value: initial,
    oninput: (e) => { shown.value = Number(e.target.value); },
    onchange: (e) => setSettings({ fontSize: Number(e.target.value) }),
  }), h('output', { for: id }, () => `${shown.value}%`));
}

function optionsTab() {
  const s = settings.peek();
  const set = (key) => (v) => setSettings({ [key]: v });
  const sizeId = nextId();
  return [
    group('options', 'Appearance',
      themeRow(),
      selectRow('Density', s.density, [['compact', 'compact'], ['normal', 'normal'], ['comfortable', 'comfortable']], set('density'),
        { description: 'How much space there is between things.', keywords: 'spacing compact' }),
      row('Text size', textSize(s.fontSize, sizeId), { id: sizeId, keywords: 'font zoom' }),
      selectRow('Maximum page width', String(s.maxWidth), [['0', 'none'], ['1200', '1200px'], ['1440', '1440px'], ['1600', '1600px'], ['1920', '1920px']], (v) => setSettings({ maxWidth: Number(v) }),
        { description: 'Keeps lines from getting too long on very wide screens.' }),
      selectRow('Display', s.displayMode, [['normal', 'normal'], ['compact', 'compact'], ['text', 'text only']], set('displayMode'),
        { description: 'Compact fits more posts on screen. Text only shows images and video as links.', keywords: 'compact text-only mode images' }),
      toggleRow('Show thumbnails', s.showThumbnails, set('showThumbnails'), { description: 'In listings.', keywords: 'thumbnail' }),
      toggleRow('Hide NSFW thumbnails', s.hideNsfwThumbnails, set('hideNsfwThumbnails'), { description: 'Entirely, rather than blurred.', keywords: 'nsfw thumbnail' }),
      toggleRow('Show scores', s.showScores, set('showScores'), { keywords: 'votes points' }),
      toggleRow('Open links in a new tab', s.openLinksInNewTab, set('openLinksInNewTab'), { description: 'Links to other sites.' })),
    group('options', 'Content',
      () => (loggedIn.value
        ? row('NSFW', h('a', { href: href('/account') }, 'account settings »'), { scope: 'account', description: 'Set by your Lemmy account.', keywords: 'nsfw blur' })
        : [
          toggleRow('Show NSFW posts', settings.peek().showNsfw, set('showNsfw'), { description: 'While logged out. Logged in, your account decides.', keywords: 'nsfw adult' }),
          toggleRow('Blur NSFW images', settings.peek().blurNsfw, set('blurNsfw'), { description: 'Until clicked.', keywords: 'nsfw blur' }),
        ])),
    group('options', 'Defaults',
      selectRow('Post sort', s.defaultSort, [['', 'account or instance default'], ...POST_SORTS.map((x) => [x, SORT_LABELS[x] || x])], set('defaultSort')),
      selectRow('Front page when logged out', s.defaultListing, [['', 'instance default'], ['Local', 'Local'], ['All', 'All']], set('defaultListing')),
      selectRow('Comment sort', s.commentSort, COMMENT_SORTS.map((x) => [x, x.toLowerCase()]), set('commentSort'))),
  ];
}

// The theme can't be turned off, so it's here rather than among the features.
// Reactive, since the header's theme button changes it too.
function themeRow() {
  const id = nextId();
  return row('Theme', h('select', { id, onchange: (e) => setTheme(e.target.value) },
    PALETTES.map((t) => h('option', { value: t, selected: () => settings.value.theme === t }, t === 'auto' ? 'Auto (follow the system)' : THEME_LABELS[t]))),
  { id, description: 'Black suits OLED screens; High contrast has stronger text and borders.', keywords: 'dark light oled contrast palette colors' });
}

function optionControl(f, key, o) {
  const value = option(f.id, key);
  const id = nextId();
  const line = (control) => h('div.option-row', h('label.option-name', { for: id }, o.label), control);
  switch (o.type) {
    case 'boolean': return line(toggle(!!value, (v) => setOption(f.id, key, v), o.label, id));
    case 'number': return line(h('input', {
      id, type: 'number', inputmode: 'numeric', min: o.min, max: o.max, step: o.step || 1, value,
      onchange: (e) => setOption(f.id, key, Number(e.target.value) || 0),
    }));
    case 'select': return line(select(value, o.choices, (v) => setOption(f.id, key, v), id));
    case 'text': return h('div.option-row.wide', h('label.option-name', { for: id }, o.label),
      h('input', { id, type: 'text', value, onchange: (e) => setOption(f.id, key, e.target.value) }));
    case 'custom': return h('div.custom-option', o.label && h('p.option-label', o.label), o.render(f));
    default: return null;
  }
}

function featureRow(f, open) {
  const id = `feature-toggle-${f.id}`;
  const opts = Object.entries(f.options || {});
  const editors = opts.filter(([, o]) => o.type === 'custom');
  const tweaks = opts.filter(([, o]) => o.type !== 'custom');
  const off = () => !f.alwaysOn && !enabled(f.id);
  return h('div.setting.feature', {
    id: `feature-${f.id}`,
    dataset: { search: `${f.name} ${f.description} ${f.keywords || ''} ${f.category} ${opts.map(([, o]) => o.label || '').join(' ')}`.toLowerCase() },
  },
  h('div.setting-text',
    h(f.alwaysOn ? 'span.setting-name' : 'label.setting-name', f.alwaysOn ? {} : { for: id }, f.name),
    h('p.setting-desc', f.description)),
  h('div.setting-control', !f.alwaysOn && toggle(enabled(f.id), (v) => setEnabled(f.id, v), f.name, id)),
  // Lists and editors (filters, custom CSS, accounts...) are what the feature
  // is for: shown. Small tweaks fold away. Both only while the feature is on.
  editors.length > 0 && h('div.feature-options.feature-editors', { hidden: off },
    h('div.feature-options-body', editors.map(([key, o]) => optionControl(f, key, o)))),
  tweaks.length > 0 && h('details.feature-options', { open: open || f.alwaysOn, hidden: off },
    h('summary', `${tweaks.length} more ${tweaks.length === 1 ? 'setting' : 'settings'}`),
    h('div.feature-options-body', tweaks.map(([key, o]) => optionControl(f, key, o)))));
}

/** Which tab feature [f] is on. */
const tabOf = (f) => OWN_TAB[f.category] || 'features';

function featuresTab(focus) {
  const categories = new Map();
  for (const f of allFeatures()) {
    if (f.id === 'themes') continue; // in the options tab (themeRow)
    if (!categories.has(f.category)) categories.set(f.category, []);
    categories.get(f.category).push(f);
  }
  return [...categories].map(([cat, list]) => group(OWN_TAB[cat] || 'features', cat,
    OWN_TAB[cat] === 'filters' && h('p.settings-group-intro', '"more ▾" on any post or comment adds to these lists ("hide … here"), and its "edit filters…" brings you back here.'),
    list.map((f) => featureRow(f, f.id === focus))));
}

function backupGroup() {
  const includeTokens = signal(false);
  const fileInput = h('input#import-file', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: importFile });
  return group('advanced', 'Backup',
    row('Export', h('button.btn', { type: 'button', onclick: () => exportSettings(includeTokens.peek()) }, 'export…'),
      { description: 'Saves preferences, filters, shortcuts, drafts and visit history to a file. Use it to move to another browser or device.', keywords: 'backup sync transfer json' }),
    toggleRow('Include login tokens', false, (v) => { includeTokens.value = v; }, { description: 'In the export.', keywords: 'backup export' }),
    () => (includeTokens.value ? h('p.setting-warning.warning', 'Anyone with this file can use your accounts until you log out. Keep it private.') : null),
    row('Import', h('span', fileInput, h('label.btn', { for: 'import-file' }, 'import…')),
      { description: 'Replaces the settings in this browser with the file\'s.', keywords: 'restore json' }));
}

export function exportData(includeTokens) {
  const data = {};
  for (const key of allKeys()) {
    if (key === `${PREFIX}deployment` || key === `${PREFIX}update-lock`) continue;
    let value;
    try { value = JSON.parse(readRaw(key)); } catch { continue; }
    if (key === `${PREFIX}accounts` && !includeTokens && value?.data?.list) {
      value = { ...value, data: { ...value.data, list: value.data.list.map((a) => ({ ...a, jwt: null, remember: false })) } };
    }
    data[key] = value;
  }
  return { app: 'olemmy', exported: new Date().toISOString(), data };
}

function exportSettings(includeTokens) {
  const blob = new Blob([JSON.stringify(exportData(includeTokens), null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `olemmy-settings-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/** Write an export's keys back. Only olemmy: keys are accepted. */
export function importData(json) {
  if (json?.app !== 'olemmy' || typeof json.data !== 'object') throw new Error("That isn't an Olemmy settings file");
  let n = 0;
  for (const [key, value] of Object.entries(json.data)) {
    if (!key.startsWith(PREFIX) || key === `${PREFIX}deployment`) continue;
    writeRaw(key, JSON.stringify(value));
    n++;
  }
  return n;
}

async function importFile(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const json = JSON.parse(await file.text());
    if (!await confirmAction('Import settings?', 'This replaces the settings in this browser, then reloads.', 'Import')) return;
    importData(json);
    location.reload();
  } catch (err) {
    toast(`Couldn't import: ${err.message}`, { kind: 'error' });
  }
}


function advancedGroups() {
  const d = installed();
  return [
    backupGroup(),
    group('advanced', 'Advanced',
      selectRow('Lemmy API version', settings.peek().apiVersion, [['v3', 'v3'], ['auto', 'v4 where available']], (v) => { setSettings({ apiVersion: v }); },
        { description: 'v3 works on Lemmy 0.19 and 1.x. v4 (experimental) is used on Lemmy 1.x instances and gets their new features first.', keywords: 'api v4 version lemmy 1.0' }),
      row('Refresh app files', h('button.btn', { type: 'button', onclick: () => refresh('full') }, 'refresh'),
        { description: 'Fetches every file of the app again and restarts it. Your settings and logins are kept. If Olemmy won\'t start at all, open its address with /?reset on the end (or reset.html) instead.', keywords: 'cache update reload reset broken blank' })),
    group('advanced', 'About',
      h('div.settings-about', { dataset: { search: 'about version build license' } },
        h('p', 'Olemmy: an old-school, information-dense web client for Lemmy. ', h('a', { href: href('/about') }, 'About, disclaimer and privacy »')),
        h('p.small', d ? `${label(d)} (build ${d.build})` : 'Development version (not built)'),
        h('p.small', 'Licensed under the MIT License. Markdown by markdown-it (MIT).'))),
  ];
}

export function settingsView(route, ctx) {
  const { chrome } = ctx;
  const focus = route.query.get('feature');
  const focused = focus && allFeatures().find((f) => f.id === focus);
  const tab = TABS.some(([id]) => id === route.query.get('tab')) ? route.query.get('tab') : (focused ? tabOf(focused) : 'options');
  setTitle('preferences');
  chrome.pageName.value = { text: 'preferences', href: href('/settings') };
  chrome.tabs.value = tabMenu(TABS.map(([id, text]) => ({ label: text, href: href('/settings', { tab: id === 'options' ? '' : id }), selected: id === tab })), 'Settings sections');
  chrome.sidebar.value = null;

  const query = signal('');
  const search = h('input.settings-search', { type: 'search', placeholder: 'search all settings', 'aria-label': 'Search settings', oninput: (e) => { query.value = e.target.value.trim().toLowerCase(); } });
  const empty = h('p.settings-empty', { hidden: true }, 'No settings match.');
  const body = h('div.settings-body', optionsTab(), featuresTab(focus), advancedGroups());

  // The current tab's groups; while searching, matches from every tab.
  effect(() => {
    const q = query.value;
    for (const el of body.querySelectorAll('[data-search]')) el.hidden = !!q && !el.dataset.search.includes(q);
    let shown = 0;
    for (const g of body.querySelectorAll('.settings-group')) {
      g.hidden = q ? !g.querySelector('[data-search]:not([hidden])') : g.dataset.tab !== tab;
      if (!g.hidden) shown++;
    }
    empty.hidden = shown > 0;
  });

  if (focus) {
    requestAnimationFrame(() => {
      const el = document.getElementById(`feature-${focus}`);
      if (!el) return;
      el.scrollIntoView({ block: 'start' });
      el.classList.add('flash');
    });
  }
  return h('div.settings-page',
    h('h1', 'Olemmy preferences'),
    h('p.settings-intro', 'Saved in this browser. For settings saved on your Lemmy account, see ', h('a', { href: href('/account') }, 'account settings'), '.'),
    search,
    empty,
    body);
}
