// Auto / Light / Dark (docs/OLEMMY.md §6a). Auto is no data-theme
// attribute at all: CSS follows prefers-color-scheme live, with no JS.
// theme-init.js applies a forced theme before first paint; this keeps it
// applied as the setting changes (here or in another tab).

import { h, icon } from '../core/h.js';
import { effect, signal } from '../core/signal.js';
import { registerKey } from '../core/events.js';
import { settings, setSettings } from '../state/settings.js';
import { defineFeature } from './registry.js';

/** The toggle cycles the first three; the others are in the settings console. */
export const THEMES = ['auto', 'light', 'dark'];
export const PALETTES = [...THEMES, 'oled', 'contrast'];
const FORCED = { light: 'light', dark: 'dark', oled: 'dark', contrast: 'light' };
const COLORS = { light: '#dce9e2', dark: '#20322f', oled: '#000000', contrast: '#ffffff' };

const dark = matchMedia('(prefers-color-scheme: dark)');
/** The OS's current scheme, live. */
export const osDark = signal(dark.matches);
dark.addEventListener('change', () => { osDark.value = dark.matches; });

/** 'light' or 'dark': what's on screen now. */
export function effectiveTheme() {
  const t = settings.value.theme;
  return FORCED[t] || (osDark.value ? 'dark' : 'light');
}

export function setTheme(theme) { setSettings({ theme }); }

export function cycleTheme() {
  const i = THEMES.indexOf(settings.peek().theme);
  setTheme(THEMES[(i + 1) % THEMES.length]);
}

export const LABEL = { auto: 'Auto', light: 'Light', dark: 'Dark', oled: 'Black (OLED)', contrast: 'High contrast' };
export function themeLabel() {
  const t = settings.value.theme;
  return t === 'auto' ? `Auto (${effectiveTheme()})` : LABEL[t] || 'Auto';
}

/** The header's toggle: Auto → Light → Dark. */
export function themeToggle() {
  return h('button.theme-toggle.link-button', {
    type: 'button',
    onclick: cycleTheme,
    title: () => `Theme: ${themeLabel()}. Click to change (Shift+T)`,
    'aria-label': () => `Theme: ${themeLabel()}`,
  }, () => icon(`theme-${THEMES.includes(settings.value.theme) ? settings.value.theme : FORCED[settings.value.theme] || 'auto'}`), h('span.label', () => themeLabel()));
}

/** Radio group for the settings console. */
export function themeRadios() {
  return h('div.radio-group', { role: 'radiogroup', 'aria-label': 'Theme' },
    PALETTES.map((t) => h('label.radio',
      h('input', {
        type: 'radio', name: 'theme', value: t,
        checked: () => settings.value.theme === t,
        onchange: () => setTheme(t),
      }),
      ` ${t === 'auto' ? 'Auto (follow the system)' : LABEL[t]}`)));
}

export default defineFeature({
  id: 'themes',
  name: 'Themes',
  category: 'Appearance',
  description: 'Auto follows your system\'s light or dark setting and switches with it; the others always use their palette. Black suits OLED screens; High contrast has stronger text and borders.',
  alwaysOn: true,
  keywords: 'night mode dark light color scheme',
  options: {
    theme: { type: 'custom', default: 'auto', label: 'Theme', render: themeRadios },
  },
  start() {
    effect(() => {
      const t = settings.value.theme;
      const root = document.documentElement;
      if (FORCED[t]) {
        root.dataset.theme = t;
        root.style.colorScheme = FORCED[t];
      } else {
        delete root.dataset.theme;
        root.style.colorScheme = '';
      }
      for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
        const scheme = (meta.getAttribute('media') || '').includes('dark') ? 'dark' : 'light';
        meta.setAttribute('content', COLORS[FORCED[t] ? t : scheme]);
      }
    });
    registerKey('T', cycleTheme, { description: 'Change the theme (Auto, Light, Dark)', group: 'Always' });
  },
});
