// The tab menu (hot · new · top...), and the "links from: past
// day ▾" style select for Top's time ranges. On narrow screens the strip
// scrolls sideways with faded edges (layout.css), never wrapping the header.

import { h } from '../core/h.js';
import { navigate } from '../core/router.js';

/**
 * @param {{ label: string, href: string, selected?: boolean, title?: string }[]} tabs
 */
export function tabMenu(tabs, label = 'Sort') {
  return h('nav.tabmenu-wrap', { 'aria-label': label },
    h('ul.tabmenu', tabs.map((t) => h('li', { class: { selected: !!t.selected } },
      h('a.choice', { href: t.href, title: t.title, 'aria-current': t.selected ? 'page' : undefined }, t.label)))));
}

/** A labeled select that navigates on change: [options] [[value, label, href]]. */
export function navSelect(label, options, current) {
  const select = h('select.nav-select', {
    'aria-label': label,
    onchange: () => {
      const o = options.find(([v]) => v === select.value);
      if (o) navigate(o[2]);
    },
  }, options.map(([v, text]) => h('option', { value: v, selected: v === current }, text)));
  return h('label.nav-select-label', h('span', `${label}: `), select);
}
