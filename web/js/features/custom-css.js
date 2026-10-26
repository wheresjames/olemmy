// Custom CSS (Tier 3): your own styles on top of Olemmy's, for you alone,
// in this browser. Applied as a constructed
// stylesheet (document.adoptedStyleSheets), which the CSP's
// style-src 'self' allows where a <style> tag would be blocked.
// Theme tokens can be overridden: :root { --header-bg: #fde; }

import { h } from '../core/h.js';
import { effect } from '../core/signal.js';
import { defineFeature, enabled, option, setOption } from './registry.js';

let sheet = null;

function editor() {
  return () => h('label.custom-css',
    h('span.small', 'Applied to every page in this browser. Only paste CSS you understand: styles can load images from other sites.'),
    h('textarea', {
      rows: 10, spellcheck: false, value: option('customCss', 'css') || '', placeholder: ':root { --header-bg: #ffe9d6; }\n.thing .title { font-size: 1.1em; }',
      onchange: (e) => setOption('customCss', 'css', e.target.value),
    }));
}

export default defineFeature({
  id: 'customCss',
  name: 'Custom CSS',
  category: 'Appearance',
  description: 'Your own styles on top of Olemmy\'s. The theme colors are CSS variables you can override.',
  defaultEnabled: true,
  keywords: 'css style stylesheet theme custom',
  options: { css: { type: 'custom', default: '', label: '', render: editor } },
  start() {
    effect(() => {
      const css = enabled('customCss') ? option('customCss', 'css') || '' : '';
      if (!css && !sheet) return;
      sheet ??= new CSSStyleSheet();
      try { sheet.replaceSync(css); } catch { /* invalid CSS: the old rules stay */ }
      if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    });
  },
});
