// Map Lemmy API responses to the app's own models, so views never see the
// API's shapes and a v4 adapter can produce the same models later.
//
// Names are cleaned of bidi control characters (an RTL override in a display
// name can make it read as someone else's), and federated objects carry the
// host they live on, from their actor id.

/** @typedef {{ id: number, name: string, displayName: string, avatar: string|null, banner: string|null, bio: string, host: string, local: boolean, actorId: string, bot: boolean, banned: boolean, deleted: boolean, admin: boolean, published: string, fullName: string, instanceId: number, postCount?: number, commentCount?: number, matrix?: string }} Person */
/** @typedef {{ id: number, name: string, title: string, description: string, icon: string|null, banner: string|null, nsfw: boolean, local: boolean, actorId: string, host: string, fullName: string, published: string, removed: boolean, deleted: boolean, hidden: boolean, postingRestrictedToMods: boolean, instanceId: number, subscribed: 'Subscribed'|'NotSubscribed'|'Pending', blocked: boolean, subscribers: number, posts: number, comments: number, usersActiveDay: number, usersActiveWeek: number, usersActiveMonth: number, bannedFromCommunity: boolean }} Community */

// LRE, RLE, PDF, LRO, RLO, LRI, RLI, FSI, PDI, and the invisible marks.
const BIDI = /[‪-‮⁦-⁩‎‏؜]/g;

export function cleanName(s) {
  return String(s ?? '').replace(BIDI, '').trim();
}

export function hostFromActor(actorId) {
  try { return new URL(actorId).host; } catch { return ''; }
}

const n = (x) => (typeof x === 'number' ? x : Number(x) || 0);

/** @returns {Person} */
export function person(p, extra = {}) {
  if (!p) return null;
  const host = hostFromActor(p.actor_id);
  const name = cleanName(p.name);
  return {
    id: p.id,
    name,
    displayName: cleanName(p.display_name) || '',
    avatar: p.avatar || null,
    banner: p.banner || null,
    bio: p.bio || '',
    host,
    local: !!p.local,
    actorId: p.actor_id || '',
    bot: !!p.bot_account,
    banned: !!p.banned,
    deleted: !!p.deleted,
    admin: !!extra.is_admin,
    published: p.published,
    fullName: host ? `${name}@${host}` : name,
    instanceId: p.instance_id,
    matrix: p.matrix_user_id || '',
  };
}

/** @returns {Community} */
export function community(c, view = {}) {
  if (!c) return null;
  const host = hostFromActor(c.actor_id);
  const name = cleanName(c.name);
  const counts = view.counts || {};
  return {
    id: c.id,
    name,
    title: cleanName(c.title) || name,
    description: c.description || '',
    icon: c.icon || null,
    banner: c.banner || null,
    nsfw: !!c.nsfw,
    local: !!c.local,
    actorId: c.actor_id || '',
    host,
    fullName: host ? `${name}@${host}` : name,
    published: c.published,
    removed: !!c.removed,
    deleted: !!c.deleted,
    hidden: !!c.hidden,
    postingRestrictedToMods: !!c.posting_restricted_to_mods,
    instanceId: c.instance_id,
    subscribed: view.subscribed || 'NotSubscribed',
    blocked: !!view.blocked,
    subscribers: n(counts.subscribers),
    /** Subscribers on the instance answering; 0 for a remote community means it isn't being followed here. */
    subscribersLocal: counts.subscribers_local == null ? null : n(counts.subscribers_local),
    posts: n(counts.posts),
    comments: n(counts.comments),
    usersActiveDay: n(counts.users_active_day),
    usersActiveWeek: n(counts.users_active_week),
    usersActiveMonth: n(counts.users_active_month),
    bannedFromCommunity: !!view.banned_from_community,
  };
}

export function communityView(v) {
  return v ? community(v.community, v) : null;
}

export function post(v) {
  const p = v.post;
  const counts = v.counts || {};
  return {
    id: p.id,
    title: cleanName(p.name),
    url: p.url || null,
    body: p.body || '',
    nsfw: !!p.nsfw || !!v.community?.nsfw,
    locked: !!p.locked,
    removed: !!p.removed,
    deleted: !!p.deleted,
    featuredCommunity: !!p.featured_community,
    featuredLocal: !!p.featured_local,
    published: p.published,
    updated: p.updated || null,
    thumbnail: p.thumbnail_url || null,
    embedTitle: p.embed_title || '',
    embedDescription: p.embed_description || '',
    embedVideoUrl: p.embed_video_url || null,
    urlContentType: p.url_content_type || '',
    altText: p.alt_text || '',
    apId: p.ap_id || '',
    local: !!p.local,
    languageId: p.language_id || 0,
    creator: person(v.creator, { is_admin: v.creator_is_admin }),
    community: community(v.community, { subscribed: v.subscribed, banned_from_community: v.banned_from_community }),
    creatorIsMod: !!v.creator_is_moderator,
    creatorIsAdmin: !!v.creator_is_admin,
    creatorBanned: !!v.creator_banned_from_community,
    creatorBlocked: !!v.creator_blocked,
    score: n(counts.score),
    upvotes: n(counts.upvotes),
    downvotes: n(counts.downvotes),
    comments: n(counts.comments),
    newestCommentTime: counts.newest_comment_time || null,
    myVote: n(v.my_vote),
    saved: !!v.saved,
    read: !!v.read,
    hidden: !!v.hidden,
    unreadComments: n(v.unread_comments),
  };
}

export function comment(v) {
  const c = v.comment;
  const counts = v.counts || {};
  const path = String(c.path || `0.${c.id}`).split('.').map(Number);
  // "0.12.34": 0 is the root, 34 this comment, 12 its parent.
  const ancestors = path.slice(1, -1);
  return {
    id: c.id,
    postId: c.post_id,
    content: c.content || '',
    path: c.path,
    ancestors,
    parentId: ancestors.length ? ancestors[ancestors.length - 1] : null,
    depth: ancestors.length,
    published: c.published,
    updated: c.updated || null,
    removed: !!c.removed,
    deleted: !!c.deleted,
    distinguished: !!c.distinguished,
    apId: c.ap_id || '',
    languageId: c.language_id || 0,
    creator: person(v.creator, { is_admin: v.creator_is_admin }),
    community: v.community ? community(v.community, { subscribed: v.subscribed }) : null,
    post: v.post ? { id: v.post.id, title: cleanName(v.post.name), creatorId: v.post.creator_id, locked: !!v.post.locked, apId: v.post.ap_id || '' } : null,
    creatorIsMod: !!v.creator_is_moderator,
    creatorIsAdmin: !!v.creator_is_admin,
    creatorBanned: !!v.creator_banned_from_community,
    creatorBlocked: !!v.creator_blocked,
    score: n(counts.score),
    upvotes: n(counts.upvotes),
    downvotes: n(counts.downvotes),
    childCount: n(counts.child_count),
    myVote: n(v.my_vote),
    saved: !!v.saved,
  };
}

/**
 * Comments in a flat list -> a forest. Each node gets `children`; comments
 * whose parent isn't in the list become roots (with `orphan` set), which is
 * what a "continue this thread" page wants.
 */
export function commentTree(list) {
  const byId = new Map();
  for (const c of list) byId.set(c.id, { ...c, children: [] });
  const roots = [];
  for (const c of byId.values()) {
    const parent = c.parentId != null ? byId.get(c.parentId) : null;
    if (parent) parent.children.push(c);
    else { if (c.parentId != null) c.orphan = true; roots.push(c); }
  }
  return roots;
}

export function personView(v) {
  if (!v) return null;
  const p = person(v.person, { is_admin: v.is_admin });
  p.postCount = n(v.counts?.post_count);
  p.commentCount = n(v.counts?.comment_count);
  return p;
}

export function site(s) {
  const local = s.site_view?.local_site || {};
  const info = s.site_view?.site || {};
  const counts = s.site_view?.counts || {};
  return {
    name: cleanName(info.name),
    description: info.description || '',
    sidebar: info.sidebar || '',
    icon: info.icon || null,
    banner: info.banner || null,
    actorId: info.actor_id || '',
    host: hostFromActor(info.actor_id),
    version: s.version || '',
    enableDownvotes: local.enable_downvotes !== false,
    enableNsfw: !!local.enable_nsfw,
    registrationMode: local.registration_mode || 'Open',
    applicationQuestion: local.application_question || '',
    captchaEnabled: !!local.captcha_enabled,
    requireEmailVerification: !!local.require_email_verification,
    privateInstance: !!local.private_instance,
    defaultListingType: local.default_post_listing_type || 'Local',
    defaultSortType: local.default_sort_type || 'Active',
    legal: local.legal_information || '',
    communityCreationAdminOnly: !!local.community_creation_admin_only,
    users: n(counts.users),
    posts: n(counts.posts),
    comments: n(counts.comments),
    communities: n(counts.communities),
    usersActiveDay: n(counts.users_active_day),
    usersActiveWeek: n(counts.users_active_week),
    usersActiveMonth: n(counts.users_active_month),
    admins: (s.admins || []).map((a) => personView(a)),
    taglines: (s.taglines || []).map((t) => t.content).filter(Boolean),
    languages: (s.all_languages || []).map((l) => ({ id: l.id, code: l.code, name: l.name })),
    discussionLanguages: s.discussion_languages || [],
    customEmojis: (s.custom_emojis || []).map((e) => ({
      shortcode: e.custom_emoji?.shortcode,
      url: e.custom_emoji?.image_url,
      alt: e.custom_emoji?.alt_text || e.custom_emoji?.shortcode,
    })).filter((e) => e.shortcode && e.url),
    myUser: myUser(s.my_user),
  };
}

/** The logged-in user's own data from /site, or null. */
export function myUser(m) {
  if (!m) return null;
  const lu = m.local_user_view || {};
  const settings = lu.local_user || {};
  return {
    person: personView({ person: lu.person, counts: lu.counts, is_admin: settings.admin }),
    settings: {
      email: settings.email || '',
      showNsfw: !!settings.show_nsfw,
      blurNsfw: settings.blur_nsfw !== false,
      showScores: settings.show_scores !== false,
      showAvatars: settings.show_avatars !== false,
      showBotAccounts: settings.show_bot_accounts !== false,
      showReadPosts: settings.show_read_posts !== false,
      defaultSortType: settings.default_sort_type || 'Active',
      defaultListingType: settings.default_listing_type || 'Local',
      sendNotificationsToEmail: !!settings.send_notifications_to_email,
      totp2faEnabled: !!settings.totp_2fa_enabled,
      admin: !!settings.admin,
      autoExpand: !!settings.auto_expand,
      openLinksInNewTab: !!settings.open_links_in_new_tab,
    },
    follows: (m.follows || []).map((f) => community(f.community, { subscribed: 'Subscribed' })),
    moderates: (m.moderates || []).map((x) => community(x.community)),
    communityBlocks: (m.community_blocks || []).map((b) => community(b.community)),
    personBlocks: (m.person_blocks || []).map((b) => person(b.target)),
    instanceBlocks: (m.instance_blocks || []).map((b) => ({ id: b.instance?.id, domain: b.instance?.domain })),
    discussionLanguages: m.discussion_languages || [],
  };
}

export function reply(v) {
  const c = comment(v);
  return { ...c, kind: 'reply', inboxId: v.comment_reply.id, read: !!v.comment_reply.read, postTitle: cleanName(v.post?.name) };
}

export function mention(v) {
  const c = comment(v);
  return { ...c, kind: 'mention', inboxId: v.person_mention.id, read: !!v.person_mention.read, postTitle: cleanName(v.post?.name) };
}

export function privateMessage(v) {
  const m = v.private_message;
  return {
    kind: 'message',
    id: m.id,
    inboxId: m.id,
    content: m.content || '',
    read: !!m.read,
    deleted: !!m.deleted,
    published: m.published,
    updated: m.updated || null,
    creator: person(v.creator),
    recipient: person(v.recipient),
  };
}
