// Local filters: hide posts by keyword, domain,
// community, user or instance, in this browser only. Lemmy's own blocks
// are on the account; the "more" menu offers both (§7). Local filters can
// only hide more than the account does (§15 #13).
//
// Keywords match whole words, case-insensitively; /a regex/ is used as is.

import { h } from '../core/h.js';
import { persisted } from '../core/store.js';
import { defineFeature, option } from './registry.js';
import { toast } from '../components/toast.js';

export const filters = persisted('filters', {
  version: 1,
  defaults: { keywords: [], domains: [], communities: [], users: [], instances: [] },
});

const LISTS = {
  keywords: { label: 'Keywords in titles', hint: 'one per line; /regex/ allowed' },
  domains: { label: 'Link domains', hint: 'example.com also hides its subdomains' },
  communities: { label: 'Communities', hint: 'name@instance' },
  users: { label: 'Users', hint: 'name@instance' },
  instances: { label: 'Instances', hint: 'hides communities and users from these instances' },
};
const TYPE_LIST = { keyword: 'keywords', domain: 'domains', community: 'communities', user: 'users', instance: 'instances' };

/** Add [value] to the [type] filter ('keyword', 'domain', 'community', 'user', 'instance'). */
export function addFilter(type, value) {
  const list = TYPE_LIST[type];
  const v = String(value || '').trim();
  if (!list || !v) return;
  const before = filters.peek();
  if (before[list].some((x) => x.toLowerCase() === v.toLowerCase())) return;
  filters.set({ ...before, [list]: [...before[list], v] });
  toast(`Hiding ${type} ${v} in this browser`, { action: { label: 'Undo', run: () => filters.set(before) } });
}

// Compiled matchers, rebuilt when the lists change.
let compiled = null;
let compiledFrom = null;

function matcher() {
  const f = filters.value;
  if (compiledFrom === f) return compiled;
  const lower = (xs) => new Set(xs.map((x) => x.toLowerCase()));
  const keywords = f.keywords.map((k) => {
    const re = k.match(/^\/(.+)\/([a-z]*)$/);
    try {
      if (re) {
        // g and y make test() carry on from the last match: every other post would slip through.
        const flags = re[2].replace(/[gy]/g, '');
        return new RegExp(re[1], flags.includes('i') ? flags : `${flags}i`);
      }
      // A whole word in any script: \W would count é or я as a word's edge.
      return new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}_])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{M}\\p{N}_])`, 'iu');
    } catch { return null; }
  }).filter(Boolean);
  compiled = {
    keywords,
    domains: f.domains.map((d) => d.toLowerCase().replace(/^www\./, '')),
    communities: lower(f.communities),
    users: lower(f.users),
    instances: lower(f.instances),
  };
  compiledFrom = f;
  return compiled;
}

function domainBlocked(m, url) {
  if (!url || !m.domains.length) return false;
  let host;
  try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return false; }
  return m.domains.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Should [post] be shown? */
export function postPasses(post) {
  const m = matcher();
  if (m.keywords.some((re) => re.test(post.title))) return false;
  if (domainBlocked(m, post.url)) return false;
  if (post.community && m.communities.has(post.community.fullName.toLowerCase())) return false;
  if (post.creator && m.users.has(post.creator.fullName.toLowerCase())) return false;
  if (m.instances.has(post.community?.host) || m.instances.has(post.creator?.host)) return false;
  return true;
}

export function commentPasses(comment) {
  const m = matcher();
  if (comment.creator && m.users.has(comment.creator.fullName.toLowerCase())) return false;
  if (m.instances.has(comment.creator?.host)) return false;
  if (option('filters', 'commentKeywords') && m.keywords.some((re) => re.test(comment.content))) return false;
  return true;
}

function listEditor(list) {
  return () => h('label.filter-list',
    h('span.filter-label', LISTS[list].label, h('span.small', ` (${LISTS[list].hint})`)),
    h('textarea', {
      rows: 3,
      value: filters.value[list].join('\n'),
      onchange: (e) => {
        const values = e.target.value.split('\n').map((x) => x.trim()).filter(Boolean);
        filters.set({ ...filters.peek(), [list]: [...new Set(values)] });
      },
    }));
}

export default defineFeature({
  id: 'filters',
  name: 'Filters',
  category: 'Filtering',
  description: 'Hide posts by keyword, domain, community, user or instance, in this browser only. To block on your account instead, use "block" in a post\'s "more" menu.',
  keywords: 'filter hide block mute',
  options: {
    keywords: { type: 'custom', default: null, label: '', render: () => listEditor('keywords') },
    domains: { type: 'custom', default: null, label: '', render: () => listEditor('domains') },
    communities: { type: 'custom', default: null, label: '', render: () => listEditor('communities') },
    users: { type: 'custom', default: null, label: '', render: () => listEditor('users') },
    instances: { type: 'custom', default: null, label: '', render: () => listEditor('instances') },
    commentKeywords: { type: 'boolean', default: false, label: 'Also hide comments containing the keywords' },
  },
  filterPost: postPasses,
  filterComment: commentPasses,
});
