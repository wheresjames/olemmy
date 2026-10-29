// The demo's API (docs/demo.md): Lemmy v3's endpoints, as far as the app
// uses them, answered from the world (world.js) in Lemmy's JSON shapes.
// Loaded on demand by index.js's demoFetch().
//
// The world is kept in localStorage until you reset it, so what you do
// survives reloads, leaving the demo, and coming back weeks later. When
// WORLD_VERSION changes (the demo's content changed in a way old saves
// can't follow), a saved world is discarded and the demo says so.

import { makeWorld, WORLD_VERSION, LANGUAGES } from './world.js';
import { DEMO_HOST, DEMO_JWT, DEMO_USER, demoToken, markDemoChanged, rememberDemoName } from './index.js';

const KEY = 'olemmy:demo';
const ASSETS = new URL('../../assets/demo/', import.meta.url).href;
const DAY = 864e5;

// --- the world ----------------------------------------------------------------

let world = null;
/** Set when a saved world with your changes was discarded for a new version: the panel says so, once. */
let discarded = false;

function load() {
  if (world) return world;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* unreadable: start again */ }
  if (saved?.version === WORLD_VERSION) {
    world = saved;
    catchUp(world);
  } else {
    if (saved?.me?.changed) discarded = true;
    world = makeWorld();
    markDemoChanged(false);
  }
  return world;
}

/**
 * Back after a while: move the whole world's clock forward by the time away,
 * so it reads as fresh as when you left (your own posts included), in the
 * same order. Cake days move with it.
 */
function catchUp(w) {
  const away = Date.now() - (w.lastSeen || w.createdAt);
  if (away < 3600e3) return;
  const shift = (x, ...keys) => { for (const k of keys) if (x[k] != null) x[k] += away; };
  shift(w, 'createdAt');
  for (const x of w.persons) shift(x, 'published');
  for (const x of w.communities) shift(x, 'published');
  for (const x of w.posts) shift(x, 'published', 'updated');
  for (const x of w.comments) shift(x, 'published', 'updated');
  for (const x of w.messages) shift(x, 'published', 'updated');
  for (const x of w.reports) shift(x, 'published');
  for (const x of w.modlog) shift(x, 'when', 'expires');
  for (const x of w.bans) shift(x, 'expires');
  save();
}

/** Keep the world, at once: a reload right after a vote must still have it (a few ms). */
function save() {
  world.lastSeen = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(world)); } catch { /* full or blocked: keep it in memory */ }
}

/** Something you did that a reset would undo. */
function changed() {
  world.me.changed = true;
  markDemoChanged(true);
}

/** Throw the world away; the next request makes it again. */
export function resetWorld() {
  world = null;
  try { localStorage.removeItem(KEY); } catch { /* nothing kept */ }
  markDemoChanged(false);
}

/** Was a saved demo with your changes discarded for a new version? True once. */
export function takeDiscarded() {
  load();
  const was = discarded;
  discarded = false;
  return was;
}

/** Read the world from storage again on the next request (another tab changed it). */
export function reloadWorld() { world = null; }

try {
  addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) reloadWorld(); });
} catch { /* not in a page */ }

/** Your role and the communities you moderate (as one), for the panel. */
export function getRole() {
  const w = load();
  const locals = w.communities.filter((c) => c.instanceId === 1).map((c) => ({ id: c.id, name: c.name, title: c.title, moderated: w.me.moderates.includes(c.id) }));
  return { role: w.me.role, communities: locals };
}

export function setRole(role, moderates) {
  const w = load();
  if (role) w.me.role = role;
  if (moderates) w.me.moderates = moderates.map(Number);
  changed();
  save();
}

// --- helpers --------------------------------------------------------------------

class Fail extends Error {
  constructor(status, error) { super(error); this.status = status; this.error = error; }
}
const fail = (error, status = 400) => { throw new Fail(status, error); };
const notFound = (what) => fail(`couldnt_find_${what}`, 404);

const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
const asset = (name) => (name ? `${ASSETS}${name}.svg` : null);
const host = (instanceId) => world.instances.find((i) => i.id === instanceId)?.domain || DEMO_HOST;
const byId = (list, id) => list.find((x) => x.id === Number(id)) || null;
const person = (id) => byId(world.persons, id);
const community = (id) => byId(world.communities, id);
const post = (id) => byId(world.posts, id);
const comment = (id) => byId(world.comments, id);
const n = (x, d = 0) => (x == null || x === '' ? d : Number(x));
const bool = (x) => x === true || x === 'true';

/** The viewer: the demo account when the request has its token, else nobody. */
let viewer = null;
const me = () => world.me;
const isMe = (personId) => viewer != null && personId === viewer;
function needLogin() { if (viewer == null) fail('not_logged_in', 401); }

const admins = () => world.persons.filter((p) => p.admin || (p.id === world.me.id && world.me.role === 'admin'));
const isAdminId = (id) => admins().some((p) => p.id === id);
function modsOf(c) {
  const ids = [...c.mods];
  if (world.me.role === 'mod' && world.me.moderates.includes(c.id) && !ids.includes(world.me.id)) ids.push(world.me.id);
  return ids;
}
const isModOf = (c, personId) => modsOf(c).includes(personId);
/** Can the viewer moderate [c]? Its moderators, and admins on local communities. */
function canModerate(c) {
  return viewer != null && (isModOf(c, viewer) || (isAdminId(viewer) && c.instanceId === 1));
}
function needMod(c) { needLogin(); if (!canModerate(c)) fail('not_a_moderator', 403); }
const bannedFrom = (c, personId) => world.bans.some((b) => b.communityId === c.id && b.personId === personId && (!b.expires || b.expires > Date.now()));

// --- Lemmy's shapes ----------------------------------------------------------------

function personObj(p) {
  const h = host(p.instanceId);
  return {
    id: p.id, name: p.name, display_name: p.displayName || null, avatar: asset(p.avatar), banner: asset(p.banner),
    bio: p.bio || null, actor_id: `https://${h}/u/${p.name}`, local: p.instanceId === 1, deleted: p.deleted,
    bot_account: p.bot, banned: p.banned, published: iso(p.published), instance_id: p.instanceId, matrix_user_id: null,
  };
}

function personCounts(p) {
  return {
    person_id: p.id,
    post_count: world.posts.filter((x) => x.creatorId === p.id && !x.deleted).length,
    comment_count: world.comments.filter((x) => x.creatorId === p.id && !x.deleted).length,
  };
}

const personView = (p) => ({ person: personObj(p), counts: personCounts(p), is_admin: isAdminId(p.id) });

function communityObj(c) {
  const h = host(c.instanceId);
  return {
    id: c.id, name: c.name, title: c.title, description: c.description, icon: asset(c.icon), banner: asset(c.banner),
    nsfw: c.nsfw, local: c.instanceId === 1, actor_id: `https://${h}/c/${c.name}`, published: iso(c.published),
    removed: c.removed, deleted: c.deleted, hidden: c.hidden, posting_restricted_to_mods: c.restricted,
    instance_id: c.instanceId, visibility: 'Public',
  };
}

const subscribed = (c) => (viewer != null && world.me.follows[c.id] ? 'Subscribed' : 'NotSubscribed');

function communityView(c) {
  const posts = world.posts.filter((p) => p.communityId === c.id && !p.deleted);
  const ids = new Set(posts.map((p) => p.id));
  return {
    community: communityObj(c),
    subscribed: subscribed(c),
    blocked: viewer != null && !!world.me.blocks.community[c.id],
    banned_from_community: viewer != null && bannedFrom(c, viewer),
    counts: {
      community_id: c.id,
      subscribers: c.subscribers + (world.me.follows[c.id] ? 1 : 0),
      subscribers_local: c.instanceId === 1 ? c.subscribers : Math.round(c.subscribers / 4),
      posts: posts.length,
      comments: world.comments.filter((x) => ids.has(x.postId)).length,
      users_active_day: Math.round(c.subscribers / 40), users_active_week: Math.round(c.subscribers / 12),
      users_active_month: Math.round(c.subscribers / 5), users_active_half_year: Math.round(c.subscribers / 2),
      published: iso(c.published),
    },
  };
}

const myVote = (kind, id) => (viewer != null ? world.me.votes[kind][id] || 0 : 0);
function votes(kind, x) {
  const v = myVote(kind, x.id);
  const up = x.up + (v === 1 ? 1 : 0);
  const down = x.down + (v === -1 ? 1 : 0);
  return { up, down, score: up - down, v };
}

function postObj(p) {
  const c = community(p.communityId);
  const url = p.image ? asset(p.image) : p.url;
  return {
    id: p.id, name: p.name, url, body: p.body || null, creator_id: p.creatorId, community_id: p.communityId,
    removed: p.removed, locked: p.locked, published: iso(p.published), updated: iso(p.updated), deleted: p.deleted,
    nsfw: p.nsfw, embed_title: p.embedTitle || null, embed_description: p.embedDescription || null,
    thumbnail_url: p.image ? asset(p.image) : asset(p.thumbnail), embed_video_url: p.embedVideoUrl,
    url_content_type: p.image ? 'image/svg+xml' : (p.urlContentType || null), alt_text: p.altText || null,
    ap_id: `https://${host(c.instanceId)}/post/${p.id}`, local: c.instanceId === 1, language_id: p.languageId,
    featured_community: p.featuredCommunity, featured_local: p.featuredLocal,
  };
}

function commentCount(p) { return world.comments.filter((x) => x.postId === p.id).length; }
function newestComment(p) {
  let t = p.published;
  for (const x of world.comments) if (x.postId === p.id && x.published > t) t = x.published;
  return t;
}

function postView(p) {
  const c = community(p.communityId);
  const creator = person(p.creatorId);
  const { up, down, score, v } = votes('post', p);
  const total = commentCount(p);
  return {
    post: postObj(p), creator: personObj(creator), community: communityObj(c),
    image_details: null,
    creator_banned_from_community: bannedFrom(c, creator.id), banned_from_community: viewer != null && bannedFrom(c, viewer),
    creator_is_moderator: isModOf(c, creator.id), creator_is_admin: isAdminId(creator.id),
    counts: { post_id: p.id, comments: total, score, upvotes: up, downvotes: down, published: iso(p.published), newest_comment_time: iso(newestComment(p)) },
    subscribed: subscribed(c), saved: viewer != null && !!world.me.saved.post[p.id],
    read: viewer != null && !!world.me.read[p.id], hidden: viewer != null && !!world.me.hidden[p.id],
    creator_blocked: viewer != null && !!world.me.blocks.person[creator.id],
    my_vote: viewer != null ? v : null, unread_comments: 0,
  };
}

const descendants = (x) => world.comments.filter((o) => o.postId === x.postId && o.path.startsWith(`${x.path}.`)).length;

function commentObj(x) {
  const p = post(x.postId);
  const c = community(p.communityId);
  return {
    id: x.id, creator_id: x.creatorId, post_id: x.postId, content: x.removed ? '' : x.content,
    removed: x.removed, published: iso(x.published), updated: iso(x.updated), deleted: x.deleted,
    ap_id: `https://${host(c.instanceId)}/comment/${x.id}`, local: c.instanceId === 1, path: x.path,
    distinguished: x.distinguished, language_id: x.languageId,
  };
}

function commentView(x) {
  const p = post(x.postId);
  const c = community(p.communityId);
  const creator = person(x.creatorId);
  const { up, down, score, v } = votes('comment', x);
  return {
    comment: commentObj(x), creator: personObj(creator), post: postObj(p), community: communityObj(c),
    counts: { comment_id: x.id, score, upvotes: up, downvotes: down, published: iso(x.published), child_count: descendants(x) },
    creator_banned_from_community: bannedFrom(c, creator.id), banned_from_community: viewer != null && bannedFrom(c, viewer),
    creator_is_moderator: isModOf(c, creator.id), creator_is_admin: isAdminId(creator.id),
    subscribed: subscribed(c), saved: viewer != null && !!world.me.saved.comment[x.id],
    creator_blocked: viewer != null && !!world.me.blocks.person[creator.id], my_vote: viewer != null ? v : null,
  };
}

function messageView(m) {
  return {
    private_message: { id: m.id, creator_id: m.creatorId, recipient_id: m.recipientId, content: m.content, deleted: m.deleted, read: m.read, published: iso(m.published), updated: iso(m.updated), ap_id: `https://${DEMO_HOST}/private_message/${m.id}`, local: true },
    creator: personObj(person(m.creatorId)), recipient: personObj(person(m.recipientId)),
  };
}

// --- sorting and paging ------------------------------------------------------------

const hoursAgo = (t) => (Date.now() - t) / 36e5;
const hot = (score, t) => Math.log(Math.max(2, score + 2)) / (hoursAgo(t) + 2) ** 1.8;
const controversy = (up, down) => (up <= 0 || down <= 0 ? 0 : (up + down) ** (Math.min(up, down) / Math.max(up, down)));
const TOP = { TopHour: 1, TopSixHour: 6, TopTwelveHour: 12, TopDay: 24, TopWeek: 168, TopMonth: 720, TopThreeMonths: 2160, TopSixMonths: 4320, TopNineMonths: 6480, TopYear: 8760 };

/** The ranking sorts a front page opens with: the showcase threads (threads.js) come first in these. */
const RANKED = new Set(['Hot', 'Active', 'Scaled']);

function sortPosts(list, sort) {
  const sorted = sortPostsBy(list, sort);
  if (!RANKED.has(sort)) return sorted;
  return [...sorted.filter((p) => p.showcase), ...sorted.filter((p) => !p.showcase)];
}

function sortPostsBy(list, sort) {
  const key = new Map(list.map((p) => [p.id, votes('post', p)]));
  const by = {
    New: (a, b) => b.published - a.published,
    Old: (a, b) => a.published - b.published,
    MostComments: (a, b) => commentCount(b) - commentCount(a),
    NewComments: (a, b) => newestComment(b) - newestComment(a),
    Controversial: (a, b) => controversy(key.get(b.id).up, key.get(b.id).down) - controversy(key.get(a.id).up, key.get(a.id).down),
    Active: (a, b) => hot(key.get(b.id).score, newestComment(b)) - hot(key.get(a.id).score, newestComment(a)),
  };
  if (sort === 'TopAll' || TOP[sort]) {
    const since = TOP[sort] ? Date.now() - TOP[sort] * 36e5 : 0;
    return list.filter((p) => p.published >= since).sort((a, b) => key.get(b.id).score - key.get(a.id).score);
  }
  return list.slice().sort(by[sort] || ((a, b) => hot(key.get(b.id).score, b.published) - hot(key.get(a.id).score, a.published)));
}

function sortComments(list, sort) {
  const key = new Map(list.map((x) => [x.id, votes('comment', x)]));
  const by = {
    New: (a, b) => b.published - a.published,
    Old: (a, b) => a.published - b.published,
    Top: (a, b) => key.get(b.id).score - key.get(a.id).score,
    Controversial: (a, b) => controversy(key.get(b.id).up, key.get(b.id).down) - controversy(key.get(a.id).up, key.get(a.id).down),
  };
  return list.slice().sort(by[sort] || ((a, b) => hot(key.get(b.id).score, b.published) - hot(key.get(a.id).score, a.published)));
}

function page(list, q, limit = 20) {
  const size = Math.min(n(q.limit, limit), 50);
  const start = (Math.max(1, n(q.page, 1)) - 1) * size;
  return list.slice(start, start + size);
}

/** Posts the viewer may see in listings: not deleted, removed (unless a mod), blocked or hidden. */
function visiblePost(p) {
  const c = community(p.communityId);
  if (p.deleted || c.removed) return false;
  if (p.removed && !canModerate(c)) return false;
  if (viewer != null) {
    if (world.me.blocks.community[c.id] || world.me.blocks.person[p.creatorId] || world.me.blocks.instance[c.instanceId]) return false;
  }
  return true;
}

const findPerson = (name) => {
  const [user, h] = String(name || '').toLowerCase().split('@');
  return world.persons.find((p) => p.name.toLowerCase() === user && (!h || host(p.instanceId) === h)) || null;
};
const findCommunity = (name) => {
  const [c, h] = String(name || '').toLowerCase().split('@');
  return world.communities.find((x) => x.name.toLowerCase() === c && (!h || host(x.instanceId) === h)) || null;
};

// --- site ----------------------------------------------------------------------------

function site() {
  const w = world;
  const s = {
    site_view: {
      site: {
        id: 1, name: 'Olemmy Demo', sidebar: 'A pretend Lemmy instance inside Olemmy, so you can try it out. The people, posts and comments are made up, and nothing you do here leaves your browser.\n\nUse the **DEMO** button in the corner to become a moderator or an admin, or to start over. **Leave the demo** at the top of the page takes you to the real instances.',
        description: 'Made-up posts and people, for trying Olemmy out', icon: asset('icon-1'), banner: asset('cover-2'),
        actor_id: `https://${DEMO_HOST}/`, published: iso(w.createdAt - 900 * DAY), instance_id: 1,
      },
      local_site: {
        id: 1, site_id: 1, site_setup: true, enable_downvotes: true, enable_nsfw: true, community_creation_admin_only: false,
        require_email_verification: false, application_question: null, private_instance: false, default_theme: 'browser',
        default_post_listing_type: 'Local', legal_information: null, registration_mode: 'Closed', captcha_enabled: false,
        federation_enabled: true, default_sort_type: 'Active',
      },
      counts: { site_id: 1, users: w.persons.filter((p) => p.instanceId === 1).length, posts: w.posts.length, comments: w.comments.length, communities: w.communities.filter((c) => c.instanceId === 1).length, users_active_day: 9, users_active_week: 14, users_active_month: 16, users_active_half_year: 18 },
    },
    admins: admins().map(personView),
    version: '0.19.5-olemmy-demo',
    all_languages: LANGUAGES.map(([id, code, name]) => ({ id, code, name })),
    discussion_languages: LANGUAGES.map(([id]) => id),
    taglines: [{ id: 1, content: 'Nothing here is real, and it stays in your browser.' }],
    custom_emojis: [],
    blocked_urls: [],
  };
  if (viewer != null) s.my_user = myUser();
  return s;
}

function myUser() {
  const w = world;
  const mePerson = person(w.me.id);
  return {
    local_user_view: {
      local_user: { id: 1, person_id: w.me.id, admin: w.me.role === 'admin', totp_2fa_enabled: false, interface_language: 'browser', ...w.me.settings },
      person: personObj(mePerson), counts: personCounts(mePerson),
    },
    follows: w.communities.filter((c) => w.me.follows[c.id]).map((c) => ({ community: communityObj(c), follower: personObj(mePerson) })),
    moderates: w.communities.filter((c) => isModOf(c, w.me.id)).map((c) => ({ community: communityObj(c), moderator: personObj(mePerson) })),
    community_blocks: w.communities.filter((c) => w.me.blocks.community[c.id]).map((c) => ({ person: personObj(mePerson), community: communityObj(c) })),
    person_blocks: w.persons.filter((p) => w.me.blocks.person[p.id]).map((p) => ({ person: personObj(mePerson), target: personObj(p) })),
    instance_blocks: w.instances.filter((i) => w.me.blocks.instance[i.id]).map((i) => ({ person: personObj(mePerson), instance: { id: i.id, domain: i.domain } })),
    discussion_languages: w.me.discussionLanguages,
  };
}

// --- inbox -----------------------------------------------------------------------------

function replyItems() {
  return world.comments.filter((x) => {
    if (x.creatorId === world.me.id || x.deleted) return false;
    const ids = x.path.split('.').map(Number);
    const parent = ids.length > 2 ? comment(ids[ids.length - 2]) : null;
    return parent ? parent.creatorId === world.me.id : post(x.postId).creatorId === world.me.id;
  });
}
const mentionItems = () => {
  const name = person(world.me.id).name;
  return world.comments.filter((x) => x.creatorId !== world.me.id && !x.deleted && x.content.toLowerCase().includes(`@${name}@${DEMO_HOST}`));
};
const myMessages = () => world.messages.filter((m) => (m.recipientId === world.me.id || m.creatorId === world.me.id) && !m.deleted);

// --- moderation ------------------------------------------------------------------------

function modlogEntry(kind, fields) {
  world.modlog.push({ id: ++world.seq.modlog, kind, when: Date.now(), reason: '', moderatorId: viewer, ...fields });
}

function modlog(q) {
  const cid = q.community_id ? Number(q.community_id) : null;
  const entries = world.modlog.slice().sort((a, b) => b.when - a.when).filter((e) => {
    if (!cid) return true;
    const c = e.communityId ?? (e.postId ? post(e.postId)?.communityId : null) ?? (e.commentId ? post(comment(e.commentId)?.postId)?.communityId : null);
    return c === cid;
  });
  const out = { removed_posts: [], locked_posts: [], featured_posts: [], removed_comments: [], removed_communities: [], banned_from_community: [], banned: [], added_to_community: [], transferred_to_community: [], added: [], admin_purged_persons: [], admin_purged_communities: [], admin_purged_posts: [], admin_purged_comments: [], hidden_communities: [] };
  for (const e of page(entries, q)) {
    const base = { id: e.id, mod_person_id: e.moderatorId, reason: e.reason || null, when_: iso(e.when) };
    const moderator = personObj(person(e.moderatorId));
    if (e.kind === 'mod_remove_post' || e.kind === 'mod_lock_post' || e.kind === 'mod_feature_post') {
      const p = post(e.postId);
      if (!p) continue;
      const entry = { moderator, post: postObj(p), community: communityObj(community(p.communityId)) };
      if (e.kind === 'mod_remove_post') out.removed_posts.push({ ...entry, mod_remove_post: { ...base, post_id: p.id, removed: e.removed } });
      if (e.kind === 'mod_lock_post') out.locked_posts.push({ ...entry, mod_lock_post: { ...base, post_id: p.id, locked: e.locked } });
      if (e.kind === 'mod_feature_post') out.featured_posts.push({ ...entry, mod_feature_post: { ...base, post_id: p.id, featured: e.featured, is_featured_community: e.community !== false } });
    } else if (e.kind === 'mod_remove_comment') {
      const x = comment(e.commentId);
      if (!x) continue;
      const p = post(x.postId);
      out.removed_comments.push({ moderator, comment: commentObj(x), commenter: personObj(person(x.creatorId)), post: postObj(p), community: communityObj(community(p.communityId)), mod_remove_comment: { ...base, comment_id: x.id, removed: e.removed } });
    } else if (e.kind === 'mod_ban_from_community') {
      out.banned_from_community.push({ moderator, community: communityObj(community(e.communityId)), banned_person: personObj(person(e.personId)), mod_ban_from_community: { ...base, other_person_id: e.personId, community_id: e.communityId, banned: e.banned, expires: iso(e.expires) } });
    }
  }
  return out;
}

/** Reports the viewer can handle: in communities they moderate (admins: local ones too). */
function myReports(kind, q) {
  const unresolved = q.unresolved_only == null || bool(q.unresolved_only);
  const cid = q.community_id ? Number(q.community_id) : null;
  return world.reports.filter((r) => {
    if (r.kind !== kind || (unresolved && r.resolved)) return false;
    const p = kind === 'post' ? post(r.targetId) : post(comment(r.targetId)?.postId);
    const c = p && community(p.communityId);
    return c && canModerate(c) && (!cid || c.id === cid);
  }).sort((a, b) => b.published - a.published);
}

function reportView(r) {
  const base = { id: r.id, creator_id: r.creatorId, reason: r.reason, resolved: r.resolved, resolver_id: r.resolverId, published: iso(r.published), updated: null };
  const resolver = r.resolverId ? personObj(person(r.resolverId)) : null;
  if (r.kind === 'post') {
    const p = post(r.targetId);
    return {
      post_report: { ...base, post_id: p.id, original_post_name: r.original.name, original_post_url: r.original.url, original_post_body: r.original.body || null },
      post: postObj(p), community: communityObj(community(p.communityId)), creator: personObj(person(r.creatorId)),
      post_creator: personObj(person(p.creatorId)), creator_banned_from_community: false, my_vote: null,
      counts: postView(p).counts, resolver,
    };
  }
  const x = comment(r.targetId);
  const p = post(x.postId);
  return {
    comment_report: { ...base, comment_id: x.id, original_comment_text: r.original.content },
    comment: commentObj(x), post: postObj(p), community: communityObj(community(p.communityId)),
    creator: personObj(person(r.creatorId)), comment_creator: personObj(person(x.creatorId)),
    counts: commentView(x).counts, creator_banned_from_community: false, my_vote: null, resolver,
  };
}

// --- who you are -----------------------------------------------------------------------------

/** A username from what was typed at login: Lemmy's letters, digits and _, up to 20; an email's local part. */
function demoName(typed) {
  const name = String(typed || '').trim().toLowerCase().replace(/@.*$/, '');
  return /^[a-z0-9_]{1,20}$/.test(name) ? name : null;
}

/** Be [name] (the login token's): rename the demo account, and its mentions with it. */
function becomeName(name) {
  const me = person(world.me.id);
  if (me.name === name || world.persons.some((p) => p.id !== me.id && p.name === name)) return;
  for (const x of world.comments) x.content = x.content.split(`@${me.name}@${DEMO_HOST}`).join(`@${name}@${DEMO_HOST}`);
  if (me.displayName === 'Visitor' || me.displayName === me.name) me.displayName = name === DEMO_USER ? 'Visitor' : '';
  me.name = name;
  rememberDemoName(name);
  save();
}

// --- the endpoints -------------------------------------------------------------------------

const ok = { success: true };

function postList(q) {
  const cname = q.community_name;
  const c = cname ? findCommunity(cname) : null;
  if (cname && !c) notFound('community');
  const type = q.type_ || (viewer != null ? world.me.settings.default_listing_type : 'Local');
  let list = world.posts.filter(visiblePost);
  if (c) list = list.filter((p) => p.communityId === c.id);
  else if (type === 'Subscribed') list = viewer != null ? list.filter((p) => world.me.follows[p.communityId]) : [];
  else if (type === 'Local') list = list.filter((p) => community(p.communityId).instanceId === 1);
  if (bool(q.saved_only)) list = list.filter((p) => world.me.saved.post[p.id]);
  if (!bool(q.show_hidden)) list = list.filter((p) => !world.me.hidden[p.id]);
  const nsfw = viewer != null ? world.me.settings.show_nsfw : false;
  if (!nsfw && !c?.nsfw) list = list.filter((p) => !p.nsfw);
  const sorted = sortPosts(list, q.sort || 'Active');
  // Pinned posts first: to the community on its page, to the instance elsewhere.
  const pinned = (p) => (c ? p.featuredCommunity : p.featuredLocal);
  const ordered = [...sorted.filter(pinned), ...sorted.filter((p) => !pinned(p))];
  return { posts: page(ordered, q, 10).map(postView) };
}

function commentList(q) {
  if (bool(q.saved_only)) {
    const list = sortComments(world.comments.filter((x) => world.me.saved.comment[x.id]), 'New');
    return { comments: page(list, q, 10).map(commentView) };
  }
  const p = q.post_id ? post(q.post_id) : null;
  const parent = q.parent_id ? comment(q.parent_id) : null;
  if (q.post_id && !p) notFound('post');
  const postId = p?.id ?? parent?.postId;
  let list = world.comments.filter((x) => x.postId === postId);
  const sort = q.sort || 'Hot';
  if (q.max_depth == null) {
    if (parent) list = list.filter((x) => x.path.startsWith(`${parent.path}.`));
    return { comments: page(sortComments(list, sort), q, 10).map(commentView) };
  }
  // A tree to [max_depth]: depth-first, siblings in [sort]'s order.
  const maxDepth = n(q.max_depth, 8);
  const top = parent ? parent.depth : 0;
  if (parent) list = list.filter((x) => x.id === parent.id || x.path.startsWith(`${parent.path}.`));
  list = list.filter((x) => x.depth - top <= maxDepth);
  const children = new Map();
  for (const x of list) {
    const ids = x.path.split('.');
    const pid = x === parent || ids.length <= 2 ? 0 : Number(ids[ids.length - 2]);
    if (!children.has(pid)) children.set(pid, []);
    children.get(pid).push(x);
  }
  const walk = (x, out) => { out.push(x); for (const ch of sortComments(children.get(x.id) || [], sort)) walk(ch, out); return out; };
  const roots = parent ? [parent] : sortComments(children.get(0) || [], sort);
  // Pages of whole threads, each filled to at least Lemmy's 300.
  const pages = [[]];
  for (const root of roots) {
    const last = pages[pages.length - 1];
    if (last.length >= 300) pages.push([]);
    walk(root, pages[pages.length - 1]);
  }
  return { comments: (pages[n(q.page, 1) - 1] || []).map(commentView) };
}

function createPost(b) {
  needLogin();
  const c = community(b.community_id) || notFound('community');
  if (bannedFrom(c, viewer)) fail('banned_from_community', 403);
  if (c.restricted && !canModerate(c)) fail('only_mods_can_post_in_community', 403);
  if (!b.name?.trim()) fail('invalid_post_title');
  const image = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(b.url || '');
  const p = {
    id: ++world.seq.post, communityId: c.id, creatorId: viewer, name: b.name.trim(), body: b.body || '',
    url: b.url || null, image: null, thumbnail: null, urlContentType: image ? 'image/png' : '',
    embedTitle: '', embedDescription: '', embedVideoUrl: null, altText: b.alt_text || '',
    published: Date.now(), updated: null, languageId: n(b.language_id), nsfw: !!b.nsfw || c.nsfw,
    locked: false, removed: false, deleted: false, featuredCommunity: false, featuredLocal: false, up: 0, down: 0,
  };
  world.posts.push(p);
  world.me.votes.post[p.id] = 1;
  return { post_view: postView(p) };
}

function editPost(b) {
  needLogin();
  const p = post(b.post_id) || notFound('post');
  if (p.creatorId !== viewer) fail('no_post_edit_allowed', 403);
  Object.assign(p, {
    name: b.name ?? p.name, body: b.body ?? p.body, url: b.url ?? p.url, nsfw: b.nsfw ?? p.nsfw,
    languageId: b.language_id != null ? n(b.language_id) : p.languageId, altText: b.alt_text ?? p.altText, updated: Date.now(),
  });
  return { post_view: postView(p) };
}

function createComment(b) {
  needLogin();
  const p = post(b.post_id) || notFound('post');
  const c = community(p.communityId);
  if (bannedFrom(c, viewer)) fail('banned_from_community', 403);
  if (p.locked && !canModerate(c)) fail('locked', 403);
  if (!b.content?.trim()) fail('couldnt_create_comment');
  const parent = b.parent_id ? comment(b.parent_id) || notFound('comment') : null;
  const id = ++world.seq.comment;
  const x = {
    id, postId: p.id, creatorId: viewer, path: parent ? `${parent.path}.${id}` : `0.${id}`, depth: parent ? parent.depth + 1 : 0,
    content: b.content, published: Date.now(), updated: null, languageId: n(b.language_id, p.languageId),
    removed: false, deleted: false, distinguished: false, up: 0, down: 0,
  };
  world.comments.push(x);
  world.me.votes.comment[id] = 1;
  return { comment_view: commentView(x) };
}

function editComment(b) {
  needLogin();
  const x = comment(b.comment_id) || notFound('comment');
  if (x.creatorId !== viewer) fail('no_comment_edit_allowed', 403);
  if (b.content != null) x.content = b.content;
  if (b.language_id != null) x.languageId = n(b.language_id);
  x.updated = Date.now();
  return { comment_view: commentView(x) };
}

function vote(kind, id, score) {
  needLogin();
  const s = Math.max(-1, Math.min(1, n(score)));
  if (s) world.me.votes[kind][id] = s; else delete world.me.votes[kind][id];
}

function search(q) {
  const term = String(q.q || '').toLowerCase().trim();
  const type = q.type_ || 'All';
  const c = q.community_name ? findCommunity(q.community_name) : null;
  const has = (s) => !!s && s.toLowerCase().includes(term);
  const want = (t) => type === 'All' || type === t;
  let posts = want('Posts') || want('Url') ? world.posts.filter((p) => visiblePost(p) && (type === 'Url' ? has(p.url) : has(p.name) || has(p.body) || has(p.url))) : [];
  let comments = want('Comments') ? world.comments.filter((x) => !x.deleted && !x.removed && has(x.content)) : [];
  if (c) { posts = posts.filter((p) => p.communityId === c.id); comments = comments.filter((x) => post(x.postId).communityId === c.id); }
  if (q.listing_type === 'Local') posts = posts.filter((p) => community(p.communityId).instanceId === 1);
  const communities = want('Communities') && !c ? world.communities.filter((x) => has(x.name) || has(x.title)) : [];
  const users = want('Users') && !c ? world.persons.filter((p) => has(p.name) || has(p.displayName)) : [];
  return {
    type_: type,
    posts: page(sortPosts(posts, q.sort === 'New' ? 'New' : 'TopAll'), q).map(postView),
    comments: page(sortComments(comments, q.sort === 'New' ? 'New' : 'Top'), q).map(commentView),
    communities: page(communities, q).map(communityView),
    users: page(users, q).map(personView),
  };
}

function resolveObject(q) {
  const s = String(q.q || '').trim();
  let m;
  if ((m = s.match(/^!([^@\s]+(@[^\s]+)?)$/))) { const c = findCommunity(m[1]); if (c) return { community: communityView(c) }; }
  if ((m = s.match(/^@([^@\s]+(@[^\s]+)?)$/))) { const p = findPerson(m[1]); if (p) return { person: personView(p) }; }
  let u = null;
  try { u = new URL(s); } catch { /* not an address */ }
  if (u && /\.olemmy\.invalid$/.test(u.hostname)) {
    if ((m = u.pathname.match(/^\/post\/(\d+)/)) && post(m[1])) return { post: postView(post(m[1])) };
    if ((m = u.pathname.match(/^\/comment\/(\d+)/)) && comment(m[1])) return { comment: commentView(comment(m[1])) };
    if ((m = u.pathname.match(/^\/c\/([^/]+)/)) && findCommunity(`${m[1]}@${u.hostname}`)) return { community: communityView(findCommunity(`${m[1]}@${u.hostname}`)) };
    if ((m = u.pathname.match(/^\/u\/([^/]+)/)) && findPerson(`${m[1]}@${u.hostname}`)) return { person: personView(findPerson(`${m[1]}@${u.hostname}`)) };
  }
  return notFound('object');
}

function userDetails(q) {
  const p = (q.person_id ? person(q.person_id) : findPerson(q.username)) || notFound('person');
  const saved = bool(q.saved_only);
  if (saved && !isMe(p.id)) fail('not_logged_in', 401);
  const sort = q.sort || 'New';
  const posts = world.posts.filter((x) => (saved ? world.me.saved.post[x.id] : x.creatorId === p.id) && !x.deleted && (!x.removed || isMe(x.creatorId)));
  const comments = world.comments.filter((x) => (saved ? world.me.saved.comment[x.id] : x.creatorId === p.id) && !x.deleted);
  return {
    person_view: personView(p),
    posts: page(sortPosts(posts, sort === 'Old' ? 'Old' : sort === 'TopAll' ? 'TopAll' : sort === 'Hot' ? 'Hot' : 'New'), q).map(postView),
    comments: page(sortComments(comments, sort === 'Old' ? 'Old' : sort === 'TopAll' ? 'Top' : sort === 'Hot' ? 'Hot' : 'New'), q).map(commentView),
    moderates: world.communities.filter((c) => isModOf(c, p.id)).map((c) => ({ community: communityObj(c), moderator: personObj(p) })),
  };
}

function communityList(q) {
  let list = world.communities.filter((c) => !c.removed && !c.deleted);
  if (q.type_ === 'Local') list = list.filter((c) => c.instanceId === 1);
  if (q.type_ === 'Subscribed') list = list.filter((c) => world.me.follows[c.id]);
  if (!bool(q.show_nsfw)) list = list.filter((c) => !c.nsfw);
  const sort = q.sort || 'TopMonth';
  list = list.slice().sort(sort === 'New' ? (a, b) => b.published - a.published : sort === 'Old' ? (a, b) => a.published - b.published : (a, b) => b.subscribers - a.subscribers);
  return { communities: page(list, q, 50).map(communityView) };
}

/** [method, path] -> handler(query, body). */
const ROUTES = {
  'GET site': () => site(),
  'POST user/login': (q, b) => {
    // Any name and password: you become that name (an email: the part before the @).
    const name = demoName(b.username_or_email);
    if (!name) fail('invalid_username');
    if (world.persons.some((p) => p.id !== world.me.id && p.name === name)) fail('username_already_exists');
    return { jwt: demoToken(name), registration_created: false, verify_email_sent: false };
  },
  'POST user/logout': () => ok,
  'GET user/get_captcha': () => ({}),
  'POST user/register': () => fail('registration_closed'),
  'PUT user/save_user_settings': (q, b) => {
    needLogin();
    const p = person(world.me.id);
    if (b.display_name !== undefined) p.displayName = b.display_name || '';
    if (b.bio !== undefined) p.bio = b.bio || '';
    if (Array.isArray(b.discussion_languages)) world.me.discussionLanguages = b.discussion_languages.map(Number);
    for (const k of Object.keys(world.me.settings)) if (b[k] !== undefined) world.me.settings[k] = b[k];
    return ok;
  },
  'PUT user/change_password': () => { needLogin(); return { jwt: demoToken(person(world.me.id).name) }; },

  'GET post/list': (q) => postList(q),
  'GET post': (q) => {
    const p = post(q.id) || notFound('post');
    if (p.deleted && !isMe(p.creatorId)) notFound('post');
    const c = community(p.communityId);
    if (viewer != null) world.me.read[p.id] = true;
    return { post_view: postView(p), community_view: communityView(c), moderators: modsOf(c).map((id) => ({ community: communityObj(c), moderator: personObj(person(id)) })), cross_posts: [] };
  },
  'POST post': (q, b) => createPost(b),
  'PUT post': (q, b) => editPost(b),
  'POST post/like': (q, b) => { const p = post(b.post_id) || notFound('post'); vote('post', p.id, b.score); return { post_view: postView(p) }; },
  'PUT post/save': (q, b) => { needLogin(); const p = post(b.post_id) || notFound('post'); if (b.save) world.me.saved.post[p.id] = true; else delete world.me.saved.post[p.id]; return { post_view: postView(p) }; },
  'POST post/hide': (q, b) => { needLogin(); for (const id of b.post_ids || []) { if (b.hide) world.me.hidden[id] = true; else delete world.me.hidden[id]; } return ok; },
  'POST post/mark_as_read': (q, b) => { needLogin(); for (const id of b.post_ids || [b.post_id]) { if (b.read) world.me.read[id] = true; else delete world.me.read[id]; } return ok; },
  'POST post/delete': (q, b) => { needLogin(); const p = post(b.post_id) || notFound('post'); if (p.creatorId !== viewer) fail('no_post_edit_allowed', 403); p.deleted = !!b.deleted; return { post_view: postView(p) }; },
  'POST post/report': (q, b) => {
    needLogin();
    const p = post(b.post_id) || notFound('post');
    const r = { id: ++world.seq.report, kind: 'post', targetId: p.id, creatorId: viewer, reason: b.reason || '', published: Date.now(), resolved: false, resolverId: null, original: { name: p.name, body: p.body, url: p.url } };
    world.reports.push(r);
    return { post_report_view: reportView(r) };
  },
  'GET post/site_metadata': (q) => {
    let u;
    try { u = new URL(q.url); } catch { fail('invalid_url'); }
    const words = decodeURIComponent(u.pathname).split(/[/_.-]+/).filter(Boolean);
    return { metadata: { title: words.length ? words.join(' ').replace(/^./, (s) => s.toUpperCase()) : u.hostname, description: `A page on ${u.hostname}.`, image: null, content_type: /\.(png|jpe?g|gif|webp|svg)$/i.test(u.pathname) ? 'image/png' : 'text/html' } };
  },
  'POST post/remove': (q, b) => { const p = post(b.post_id) || notFound('post'); needMod(community(p.communityId)); p.removed = !!b.removed; modlogEntry('mod_remove_post', { postId: p.id, removed: p.removed, reason: b.reason || '' }); return { post_view: postView(p) }; },
  'POST post/lock': (q, b) => { const p = post(b.post_id) || notFound('post'); needMod(community(p.communityId)); p.locked = !!b.locked; modlogEntry('mod_lock_post', { postId: p.id, locked: p.locked }); return { post_view: postView(p) }; },
  'POST post/feature': (q, b) => {
    const p = post(b.post_id) || notFound('post');
    needMod(community(p.communityId));
    if (b.feature_type === 'Local') { if (!isAdminId(viewer)) fail('not_an_admin', 403); p.featuredLocal = !!b.featured; } else p.featuredCommunity = !!b.featured;
    modlogEntry('mod_feature_post', { postId: p.id, featured: !!b.featured, community: b.feature_type !== 'Local' });
    return { post_view: postView(p) };
  },

  'GET comment/list': (q) => commentList(q),
  'GET comment': (q) => ({ comment_view: commentView(comment(q.id) || notFound('comment')) }),
  'POST comment': (q, b) => createComment(b),
  'PUT comment': (q, b) => editComment(b),
  'POST comment/delete': (q, b) => { needLogin(); const x = comment(b.comment_id) || notFound('comment'); if (x.creatorId !== viewer) fail('no_comment_edit_allowed', 403); x.deleted = !!b.deleted; return { comment_view: commentView(x) }; },
  'POST comment/like': (q, b) => { const x = comment(b.comment_id) || notFound('comment'); vote('comment', x.id, b.score); return { comment_view: commentView(x) }; },
  'PUT comment/save': (q, b) => { needLogin(); const x = comment(b.comment_id) || notFound('comment'); if (b.save) world.me.saved.comment[x.id] = true; else delete world.me.saved.comment[x.id]; return { comment_view: commentView(x) }; },
  'POST comment/report': (q, b) => {
    needLogin();
    const x = comment(b.comment_id) || notFound('comment');
    const r = { id: ++world.seq.report, kind: 'comment', targetId: x.id, creatorId: viewer, reason: b.reason || '', published: Date.now(), resolved: false, resolverId: null, original: { content: x.content } };
    world.reports.push(r);
    return { comment_report_view: reportView(r) };
  },
  'POST comment/remove': (q, b) => { const x = comment(b.comment_id) || notFound('comment'); needMod(community(post(x.postId).communityId)); x.removed = !!b.removed; modlogEntry('mod_remove_comment', { commentId: x.id, removed: x.removed, reason: b.reason || '' }); return { comment_view: commentView(x) }; },
  'POST comment/distinguish': (q, b) => {
    const x = comment(b.comment_id) || notFound('comment');
    needMod(community(post(x.postId).communityId));
    if (x.creatorId !== viewer) fail('no_comment_edit_allowed', 403);
    x.distinguished = !!b.distinguished;
    return { comment_view: commentView(x) };
  },

  'GET community': (q) => {
    const c = (q.id ? community(q.id) : findCommunity(q.name)) || notFound('community');
    return { community_view: communityView(c), moderators: modsOf(c).map((id) => ({ community: communityObj(c), moderator: personObj(person(id)) })), discussion_languages: [] };
  },
  'GET community/list': (q) => communityList(q),
  'POST community/follow': (q, b) => { needLogin(); const c = community(b.community_id) || notFound('community'); if (b.follow) world.me.follows[c.id] = true; else delete world.me.follows[c.id]; return { community_view: communityView(c), discussion_languages: [] }; },
  'POST community/block': (q, b) => { needLogin(); const c = community(b.community_id) || notFound('community'); if (b.block) world.me.blocks.community[c.id] = true; else delete world.me.blocks.community[c.id]; return { community_view: communityView(c), blocked: !!b.block }; },
  'POST community/ban_user': (q, b) => {
    const c = community(b.community_id) || notFound('community');
    needMod(c);
    const p = person(b.person_id) || notFound('person');
    world.bans = world.bans.filter((x) => !(x.communityId === c.id && x.personId === p.id));
    const expires = b.expires ? b.expires * 1000 : null;
    if (b.ban) world.bans.push({ communityId: c.id, personId: p.id, expires });
    if (b.ban && b.remove_data) {
      for (const x of world.posts) if (x.creatorId === p.id && x.communityId === c.id) x.removed = true;
      for (const x of world.comments) if (x.creatorId === p.id && post(x.postId).communityId === c.id) x.removed = true;
    }
    modlogEntry('mod_ban_from_community', { communityId: c.id, personId: p.id, banned: !!b.ban, reason: b.reason || '', expires });
    return { person_view: personView(p), banned: !!b.ban };
  },

  'GET user': (q) => userDetails(q),
  'POST user/block': (q, b) => { needLogin(); const p = person(b.person_id) || notFound('person'); if (b.block) world.me.blocks.person[p.id] = true; else delete world.me.blocks.person[p.id]; return { person_view: personView(p), blocked: !!b.block }; },
  'POST site/block': (q, b) => { needLogin(); if (b.block) world.me.blocks.instance[b.instance_id] = true; else delete world.me.blocks.instance[b.instance_id]; return { blocked: !!b.block }; },

  'GET user/unread_count': () => {
    needLogin();
    return {
      replies: replyItems().filter((x) => !world.me.inboxRead.reply[x.id]).length,
      mentions: mentionItems().filter((x) => !world.me.inboxRead.mention[x.id]).length,
      private_messages: world.messages.filter((m) => m.recipientId === world.me.id && !m.read && !m.deleted).length,
    };
  },
  'GET user/replies': (q) => {
    needLogin();
    const list = sortComments(replyItems().filter((x) => !bool(q.unread_only) || !world.me.inboxRead.reply[x.id]), 'New');
    return { replies: page(list, q).map((x) => ({ ...commentView(x), comment_reply: { id: x.id, recipient_id: world.me.id, comment_id: x.id, read: !!world.me.inboxRead.reply[x.id], published: iso(x.published) }, recipient: personObj(person(world.me.id)) })) };
  },
  'GET user/mention': (q) => {
    needLogin();
    const list = sortComments(mentionItems().filter((x) => !bool(q.unread_only) || !world.me.inboxRead.mention[x.id]), 'New');
    return { mentions: page(list, q).map((x) => ({ ...commentView(x), person_mention: { id: x.id, recipient_id: world.me.id, comment_id: x.id, read: !!world.me.inboxRead.mention[x.id], published: iso(x.published) }, recipient: personObj(person(world.me.id)) })) };
  },
  'GET private_message/list': (q) => {
    needLogin();
    const list = myMessages().filter((m) => !bool(q.unread_only) || (!m.read && m.recipientId === world.me.id)).sort((a, b) => b.published - a.published);
    return { private_messages: page(list, q).map(messageView) };
  },
  'POST private_message': (q, b) => {
    needLogin();
    const to = person(b.recipient_id) || notFound('person');
    if (!b.content?.trim()) fail('couldnt_create_private_message');
    const m = { id: ++world.seq.message, creatorId: viewer, recipientId: to.id, content: b.content, published: Date.now(), updated: null, read: false, deleted: false };
    world.messages.push(m);
    return { private_message_view: messageView(m) };
  },
  'POST comment/mark_as_read': (q, b) => { needLogin(); if (b.read) world.me.inboxRead.reply[b.comment_reply_id] = true; else delete world.me.inboxRead.reply[b.comment_reply_id]; return ok; },
  'POST user/mention/mark_as_read': (q, b) => { needLogin(); if (b.read) world.me.inboxRead.mention[b.person_mention_id] = true; else delete world.me.inboxRead.mention[b.person_mention_id]; return ok; },
  'POST private_message/mark_as_read': (q, b) => { needLogin(); const m = byId(world.messages, b.private_message_id) || notFound('private_message'); if (m.recipientId === viewer) m.read = !!b.read; return { private_message_view: messageView(m) }; },
  'POST user/mark_all_as_read': () => {
    needLogin();
    for (const x of replyItems()) world.me.inboxRead.reply[x.id] = true;
    for (const x of mentionItems()) world.me.inboxRead.mention[x.id] = true;
    for (const m of world.messages) if (m.recipientId === world.me.id) m.read = true;
    return { replies: [] };
  },

  'GET search': (q) => search(q),
  'GET resolve_object': (q) => resolveObject(q),

  'GET modlog': (q) => modlog(q),
  'GET post/report/list': (q) => { needLogin(); return { post_reports: page(myReports('post', q), q).map(reportView) }; },
  'GET comment/report/list': (q) => { needLogin(); return { comment_reports: page(myReports('comment', q), q).map(reportView) }; },
  'PUT post/report/resolve': (q, b) => resolveReport('post', b),
  'PUT comment/report/resolve': (q, b) => resolveReport('comment', b),
  'GET user/report_count': (q) => { needLogin(); return { post_reports: myReports('post', q).length, comment_reports: myReports('comment', q).length }; },
};

function resolveReport(kind, b) {
  needLogin();
  const r = world.reports.find((x) => x.id === Number(b.report_id) && x.kind === kind) || notFound('report');
  const p = kind === 'post' ? post(r.targetId) : post(comment(r.targetId).postId);
  needMod(community(p.communityId));
  r.resolved = !!b.resolved;
  r.resolverId = r.resolved ? viewer : null;
  return { [`${kind}_report_view`]: reportView(r) };
}

// --- the entry point -------------------------------------------------------------------------

const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

/** Answer a request to the demo as the network would: a Response. */
export async function handle(url, init = {}) {
  load();
  const u = new URL(url);
  const method = (init.method || 'GET').toUpperCase();
  const auth = (init.headers && (init.headers.Authorization || init.headers.authorization)) || '';
  viewer = null;
  const token = auth.startsWith(`Bearer ${DEMO_JWT}`) && u.hostname === DEMO_HOST ? auth.slice(7) : null;
  if (token) {
    viewer = world.me.id;
    becomeName(demoName(token.slice(DEMO_JWT.length + 1)) || DEMO_USER);
  }
  // A little delay, so loading states show (and races aren't hidden).
  await new Promise((resolve) => setTimeout(resolve, 60 + Math.random() * 120));
  if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  if (method === 'POST' && u.pathname === '/pictrs/image') {
    if (viewer == null) return json(401, { error: 'not_logged_in' });
    return json(200, { msg: 'ok', files: [{ file: 'upload.svg', delete_token: 'test' }], url: asset('upload') });
  }
  const path = u.pathname.replace(/^\/api\/v3\//, '');
  if (path === u.pathname) return json(404, { error: 'not_found' });
  const handler = ROUTES[`${method} ${path}`];
  if (!handler) return json(404, { error: 'not_found' });

  const query = Object.fromEntries(u.searchParams);
  let body = {};
  if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { return json(400, { error: 'invalid_body' }); } }
  try {
    const data = handler(query, body);
    // Logging in or out changes nothing a reset would undo; opening a post only marks it read.
    if (method !== 'GET' && !/^user\/log(in|out)$/.test(path)) changed();
    if (method !== 'GET' || path === 'post') save();
    return json(200, data);
  } catch (e) {
    if (e instanceof Fail) return json(e.status, { error: e.error });
    console.error('demo', method, path, e);
    return json(500, { error: 'demo_error' });
  }
}
