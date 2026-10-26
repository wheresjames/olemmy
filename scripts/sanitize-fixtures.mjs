// Replace captured API content with stable, fictional data for offline tests.
// Run with: node scripts/sanitize-fixtures.mjs
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const dir = new URL('../tests/fixtures/', import.meta.url);
const files = readdirSync(dir).filter((name) => name.endsWith('.json'));
const data = new Map(files.map((name) => [name, JSON.parse(readFileSync(new URL(name, dir), 'utf8'))]));
const mainPostId = data.get('post.json').post_view.post.id;
const videoPostId = data.get('post-list.json').posts[14].post.id;
const profileId = data.get('user.json').person_view.person.id;
const linuxId = data.get('community.json').community_view.community.id;

const kinds = ['post', 'comment', 'person', 'community', 'site', 'instance', 'log'];
const ids = new Map(kinds.map((kind) => [kind, new Set()]));
const entityKind = (parent) => {
  if (['creator', 'commenter', 'person', 'moderator', 'banned_person', 'modded_person', 'recipient'].includes(parent)) return 'person';
  if (['post', 'comment', 'community', 'site'].includes(parent)) return parent;
  if (parent.startsWith('mod_') || parent.startsWith('admin_purge_')) return 'log';
  return null;
};
const refKind = (key) => {
  if (key === 'creator_id' || key === 'recipient_id' || key === 'other_person_id' || key === 'mod_person_id' || key === 'admin_person_id' || key === 'person_id') return 'person';
  if (key === 'post_id' || key === 'comment_id' || key === 'community_id' || key === 'site_id' || key === 'instance_id') return key.slice(0, -3);
  if (key === 'local_site_id') return 'site';
  return null;
};
function visit(value, parent, fn) {
  if (Array.isArray(value)) return value.forEach((item) => visit(item, parent, fn));
  if (!value || typeof value !== 'object') return;
  fn(value, parent);
  for (const [key, child] of Object.entries(value)) if (child && typeof child === 'object') visit(child, key, fn);
}
for (const value of data.values()) visit(value, '', (obj, parent) => {
  const ownKind = entityKind(parent);
  if (ownKind && Number.isInteger(obj.id)) ids.get(ownKind).add(obj.id);
  for (const [key, value] of Object.entries(obj)) {
    const kind = refKind(key);
    if (kind && ids.has(kind) && Number.isInteger(value)) ids.get(kind).add(value);
  }
  if (parent === 'comment' && typeof obj.path === 'string') {
    for (const part of obj.path.split('.').slice(1)) if (/^\d+$/.test(part)) ids.get('comment').add(Number(part));
  }
});
const bases = { post: 100000, comment: 200000, person: 300000, community: 400000, site: 500000, instance: 600000, log: 700000 };
const maps = new Map(kinds.map((kind) => {
  const sorted = [...ids.get(kind)].sort((a, b) => a - b);
  return [kind, new Map(sorted.map((old, index) => [old, old > bases[kind] && old < bases[kind] + 100000 ? old : bases[kind] + index + 1]))];
}));
const mapped = (kind, id) => maps.get(kind)?.get(id) ?? id;
const hostMap = new Map([['lemmy.ml', 'fixture.test'], ['piefed.social', 'piefed.example']]);
function hostOf(url) {
  try {
    const host = new URL(url).host;
    if (host === 'fixture.test' || host.endsWith('.example')) return host;
    if (!hostMap.has(host)) hostMap.set(host, `remote${hostMap.size}.example`);
    return hostMap.get(host);
  } catch { return 'fixture.test'; }
}
const titles = [
  'A quiet weekend project', 'Notes from the neighborhood garden', 'A simple desk setup',
  'A useful shortcut for everyday tasks', 'A small library display', 'An afternoon walking route',
  'Ideas for organizing a shared workspace', 'A new community notice board',
  'A favorite recipe for a rainy day', 'A photo of the morning sky',
  'Tips for keeping notes tidy', 'An update from the local workshop',
  'A map of nearby walking paths', 'A question about growing herbs',
  'A collection of public domain photos', 'A calm place to read',
  'A beginner friendly craft project', 'The weekly open thread',
];
const titleFor = (id) => id === mapped('post', mainPostId) ? titles[0] : titles[1 + ((id - bases.post) % (titles.length - 1))];
const commentTexts = [
  'Thanks for sharing this. The steps are easy to follow.',
  'I tried something similar last weekend and it worked well.',
  'The extra detail in the second step is helpful.',
  'That looks like a pleasant way to spend an afternoon.',
  'I would be interested in seeing a follow-up.',
  'Good idea. I added it to my notes for later.',
];
const stamp = (kind, id, offset = 0) => {
  const day = kind === 'person' ? '2024-04-12' : kind === 'community' ? '2023-06-14' : '2026-10-25';
  const hour = kind === 'person' || kind === 'community' ? 12 : kind === 'comment' ? 19 : 17 + ((id || 1) % 2);
  const date = new Date(`${day}T${String(hour).padStart(2, '0')}:${String((id || 1) % 40).padStart(2, '0')}:00Z`);
  date.setUTCMinutes(date.getUTCMinutes() + offset * 10);
  return date.toISOString().replace('Z', '000Z');
};
const asset = (type, id) => `https://assets.example/${type}/${id}.png`;
function sanitize(obj, parent) {
  const kind = entityKind(parent);
  const oldId = obj.id;
  for (const [key, value] of Object.entries(obj)) {
    const reference = refKind(key);
    if (reference && typeof value === 'number') obj[key] = mapped(reference, value);
    else if (key === 'id' && kind && typeof value === 'number') obj[key] = mapped(kind, value);
  }
  const id = obj.id ?? obj.post_id ?? obj.comment_id ?? obj.community_id ?? obj.person_id ?? 1;
  const countKind = parent === 'counts' ? (obj.post_id ? 'post' : obj.comment_id ? 'comment' : obj.community_id ? 'community' : obj.person_id ? 'person' : obj.site_id ? 'site' : null) : null;
  const sourceHost = hostOf(obj.actor_id || obj.ap_id || 'https://fixture.test/');
  if (kind === 'person') {
    obj.name = oldId === profileId || obj.id === mapped('person', profileId) ? 'harbor_reader' : `reader_${obj.id}`;
    if ('display_name' in obj) obj.display_name = obj.name === 'harbor_reader' ? 'Harbor Reader' : `Reader ${obj.id - bases.person}`;
    if ('bio' in obj) obj.bio = 'Enjoys quiet projects, useful notes, and friendly discussion.';
    if ('matrix_user_id' in obj) obj.matrix_user_id = `@${obj.name}:chat.example`;
    if ('actor_id' in obj) obj.actor_id = `https://${sourceHost}/u/${obj.name}`;
    if ('avatar' in obj) obj.avatar = asset('avatars', obj.id);
    if ('banner' in obj) obj.banner = asset('banners', obj.id);
  } else if (kind === 'community') {
    obj.name = oldId === linuxId || obj.id === mapped('community', linuxId) ? 'linux' : `topic_${obj.id - bases.community}`;
    obj.title = obj.name === 'linux' ? 'Linux' : `Topic ${obj.id - bases.community}`;
    if ('description' in obj) obj.description = `A friendly place to share notes and questions about ${obj.title.toLowerCase()}.`;
    if ('actor_id' in obj) obj.actor_id = `https://${sourceHost}/c/${obj.name}`;
    if ('icon' in obj) obj.icon = asset('communities', obj.id);
    if ('banner' in obj) obj.banner = asset('banners', obj.id);
  } else if (kind === 'post') {
    obj.name = titleFor(obj.id);
    if ('body' in obj) obj.body = `A short, fictional note about ${obj.name.toLowerCase()}. What would you add?`;
    if ('embed_title' in obj) obj.embed_title = obj.name;
    if ('embed_description' in obj) obj.embed_description = `A brief overview of ${obj.name.toLowerCase()}.`;
    if ('alt_text' in obj) obj.alt_text = `Illustration for ${obj.name.toLowerCase()}`;
    if ('url' in obj) obj.url = obj.url_content_type?.startsWith('image/') ? asset('posts', obj.id) : `https://articles.example/posts/${obj.id}`;
    if (obj.id === mapped('post', videoPostId)) obj.url = 'https://www.youtube.com/watch?v=TESTVIDEO01';
    if ('thumbnail_url' in obj) obj.thumbnail_url = asset('posts', obj.id);
    if ('ap_id' in obj) obj.ap_id = sourceHost === 'piefed.example'
      ? `https://piefed.example/c/topic@fixture.test/p/${obj.id}/quiet-weekend-project`
      : `https://${sourceHost}/post/${obj.id}`;
  } else if (kind === 'comment') {
    obj.content = commentTexts[(obj.id - bases.comment) % commentTexts.length];
    if ('ap_id' in obj) obj.ap_id = `https://${sourceHost}/comment/${obj.id}`;
    if ('path' in obj) obj.path = obj.path.split('.').map((part, index) => index ? String(mapped('comment', Number(part))) : part).join('.');
  } else if (kind === 'site') {
    obj.name = 'Example Forum';
    if ('description' in obj) obj.description = 'A fictional discussion forum used for offline tests.';
    if ('sidebar' in obj) obj.sidebar = 'Welcome to Example Forum. Share useful notes, ask questions, and be kind to others.\n\n## Community guidelines\n1. Stay on topic.\n2. Be respectful.\n3. Keep discussions welcoming.';
    if ('actor_id' in obj) obj.actor_id = 'https://fixture.test/';
    if ('inbox_url' in obj) obj.inbox_url = 'https://fixture.test/inbox';
    if ('icon' in obj) obj.icon = asset('site', obj.id);
    if ('public_key' in obj) obj.public_key = 'Fictional test key';
  }
  if (parent === 'counts') {
    if (countKind === 'post') {
      obj.score = 5 + (id * 7) % 54;
      obj.upvotes = obj.score + 2;
      obj.downvotes = 2;
      obj.comments = id === mapped('post', mainPostId) ? data.get('comments.json').comments.length : 1 + id % 12;
    } else if (countKind === 'comment') {
      obj.score = 1 + id % 17;
      obj.upvotes = obj.score + 1;
      obj.downvotes = 1;
    } else if (countKind === 'community') {
      obj.subscribers = 40 + id % 160;
      if ('subscribers_local' in obj) obj.subscribers_local = 10 + id % 30;
      if ('posts' in obj) obj.posts = 20 + id % 80;
      if ('comments' in obj) obj.comments = 70 + id % 120;
    } else if (countKind === 'person') {
      obj.post_count = 5 + id % 12;
      obj.comment_count = 15 + id % 30;
    } else if (countKind === 'site') {
      Object.assign(obj, { users: 420, posts: 1900, comments: 3600, communities: 24,
        users_active_day: 17, users_active_week: 45, users_active_month: 101, users_active_half_year: 220 });
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value !== 'string') continue;
    if (['published', 'when_', 'last_refreshed_at'].includes(key)) obj[key] = stamp(kind || countKind || 'post', id);
    else if (['updated', 'newest_comment_time'].includes(key)) obj[key] = stamp(kind || countKind || 'post', id, 1);
    else if (['ban_expires', 'expires'].includes(key)) obj[key] = '2027-01-01T00:00:00Z';
    else if (key === 'reason') obj[key] = 'Off topic for this community';
    else if (key === 'application_question') obj[key] = 'What would you like to discuss?';
    else if (key === 'slur_filter_regex') obj[key] = 'example-filter-word';
    else if (key === 'next_page') obj[key] = 'fixture-page-2';
    else if (key === 'url' && parent === 'blocked_urls') obj[key] = `blocked-${id}.example`;
    else if (key === 'link' && parent === 'image_details') obj[key] = asset('posts', obj.post_id ?? id);
  }
}
for (const value of data.values()) visit(value, '', sanitize);
for (const [name, value] of data) writeFileSync(new URL(name, dir), `${JSON.stringify(value, null, 2)}\n`);
