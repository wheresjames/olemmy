// Lemmy API v4 (Lemmy 1.x) responses -> the same models as normalize.js, so
// views can't tell the two APIs apart. v4 merges counts into the objects,
// keeps "my" state in *_actions (vote_is_upvote, saved_at...), and names
// timestamps *_at. Shapes follow lemmy-js-client 1.0.0-beta.2.

import * as N from './normalize.js';

const num = (x) => Number(x) || 0;
const vote = (a) => (a?.vote_is_upvote === true ? 1 : a?.vote_is_upvote === false ? -1 : 0);

/** A v4 object with v3's field names, for the v3 normalizers' shared parts. */
function personV3(p) {
  return p && { ...p, published: p.published_at, actor_id: p.ap_id };
}

export function person(p, extra) { return N.person(personV3(p), extra); }

function followState(actions) {
  const s = actions?.follow_state;
  if (s === 'accepted' || (!s && actions?.followed_at)) return 'Subscribed';
  if (s === 'pending' || s === 'approval_required') return 'Pending';
  return 'NotSubscribed';
}

export function community(c, actions) {
  if (!c) return null;
  return N.community({ ...c, published: c.published_at, actor_id: c.ap_id, description: c.sidebar || c.summary || '' }, {
    subscribed: followState(actions),
    blocked: !!actions?.blocked_at,
    banned_from_community: !!actions?.received_ban_at,
    counts: c,
  });
}

export function communityView(v) { return v ? community(v.community, v.community_actions) : null; }

export function post(v) {
  const p = v.post;
  const a = v.post_actions;
  return {
    ...N.post({
      post: { ...p, published: p.published_at, updated: p.updated_at },
      creator: personV3(v.creator),
      community: { ...v.community, actor_id: v.community.ap_id, published: v.community.published_at },
      counts: { score: p.score, upvotes: p.upvotes, downvotes: p.downvotes, comments: p.comments, newest_comment_time: p.newest_comment_time_at },
      creator_is_moderator: v.creator_is_moderator,
      creator_is_admin: v.creator_is_admin,
      creator_banned_from_community: v.creator_banned_from_community,
      creator_blocked: !!v.person_actions?.blocked_at,
      subscribed: followState(v.community_actions),
      saved: !!a?.saved_at,
      read: !!a?.read_at,
      hidden: !!a?.hidden_at,
      my_vote: vote(a),
      unread_comments: a?.read_comments_at ? Math.max(0, p.comments - num(a.read_comments_amount)) : 0,
    }),
    canMod: !!v.can_mod,
  };
}

export function comment(v) {
  const c = v.comment;
  return {
    ...N.comment({
      comment: { ...c, published: c.published_at, updated: c.updated_at },
      creator: personV3(v.creator),
      post: v.post && { ...v.post },
      community: v.community && { ...v.community, actor_id: v.community.ap_id, published: v.community.published_at },
      counts: { score: c.score, upvotes: c.upvotes, downvotes: c.downvotes, child_count: c.child_count },
      creator_is_moderator: v.creator_is_moderator,
      creator_is_admin: v.creator_is_admin,
      creator_banned_from_community: v.creator_banned_from_community,
      creator_blocked: !!v.person_actions?.blocked_at,
      saved: !!v.comment_actions?.saved_at,
      my_vote: vote(v.comment_actions),
    }),
    canMod: !!v.can_mod,
  };
}

export function personView(v) {
  if (!v) return null;
  const p = person(v.person, { is_admin: v.is_admin });
  p.postCount = num(v.person.post_count);
  p.commentCount = num(v.person.comment_count);
  p.banned = !!v.banned;
  return p;
}

const LISTING = { all: 'All', local: 'Local', subscribed: 'Subscribed', moderator_view: 'ModeratorView', suggested: 'Local' };
const SORT = { hot: 'Hot', active: 'Active', scaled: 'Scaled', new: 'New', old: 'Old', controversial: 'Controversial', most_comments: 'MostComments', new_comments: 'NewComments', top: 'TopDay' };

/** /site plus, when logged in, /account (my user) and /custom_emoji/list. */
export function site(s, me, emojis) {
  const local = s.site_view?.local_site || {};
  const info = s.site_view?.site || {};
  return {
    name: N.cleanName(info.name),
    description: info.summary || '',
    sidebar: info.sidebar || '',
    icon: info.icon || null,
    banner: info.banner || null,
    actorId: info.ap_id || '',
    host: N.hostFromActor(info.ap_id),
    version: s.version || '',
    enableDownvotes: (local.post_downvotes || 'all') !== 'disable',
    enableNsfw: !local.nsfw_content_disallowed,
    registrationMode: { closed: 'Closed', require_application: 'RequireApplication', require_invitation: 'Closed', open: 'Open' }[local.registration_mode] || 'Open',
    applicationQuestion: local.application_question || '',
    captchaEnabled: !!s.captcha_enabled,
    requireEmailVerification: !!local.email_verification_required,
    privateInstance: !!local.private_instance,
    defaultListingType: LISTING[local.default_post_listing_type] || 'Local',
    defaultSortType: SORT[local.default_post_sort_type] || 'Active',
    legal: local.legal_information || '',
    communityCreationAdminOnly: !!local.community_creation_admin_only,
    users: num(local.users),
    posts: num(local.posts),
    comments: num(local.comments),
    communities: num(local.communities),
    usersActiveDay: num(local.users_active_day),
    usersActiveWeek: num(local.users_active_week),
    usersActiveMonth: num(local.users_active_month),
    admins: (s.admins || []).map(personView),
    taglines: s.tagline ? [s.tagline.content] : [],
    languages: (s.all_languages || []).map((l) => ({ id: l.id, code: l.code, name: l.name })),
    discussionLanguages: s.discussion_languages || [],
    customEmojis: (emojis || []).map((e) => ({ shortcode: e.custom_emoji?.shortcode, url: e.custom_emoji?.image_url, alt: e.custom_emoji?.alt_text })).filter((e) => e.shortcode && e.url),
    myUser: myUser(me),
  };
}

export function myUser(m) {
  if (!m) return null;
  const lu = m.local_user_view || {};
  const s = lu.local_user || {};
  const me = personView({ person: lu.person, is_admin: s.admin, banned: lu.banned });
  return {
    person: me,
    settings: {
      email: s.email || '',
      showNsfw: !!s.show_nsfw,
      blurNsfw: s.blur_nsfw !== false,
      showScores: s.show_score !== false,
      showAvatars: s.show_avatars !== false,
      showBotAccounts: s.show_bot_accounts !== false,
      showReadPosts: s.show_read_posts !== false,
      defaultSortType: SORT[s.default_post_sort_type] || 'Active',
      defaultListingType: LISTING[s.default_listing_type] || 'Local',
      sendNotificationsToEmail: !!s.send_notifications_to_email,
      totp2faEnabled: !!s.totp_2fa_enabled,
      admin: !!s.admin,
      autoExpand: false,
      openLinksInNewTab: !!s.open_links_in_new_tab,
    },
    follows: (m.follows || []).map((f) => community(f.community, { follow_state: 'accepted' })),
    moderates: (m.moderates || []).map((x) => community(x.community)),
    communityBlocks: (m.community_blocks || []).map((c) => community(c)),
    personBlocks: (m.person_blocks || []).map((p) => person(p)),
    instanceBlocks: [...(m.instance_communities_blocks || []), ...(m.instance_persons_blocks || [])]
      .filter((i, k, all) => all.findIndex((j) => j.id === i.id) === k)
      .map((i) => ({ id: i.id, domain: i.domain })),
    discussionLanguages: m.discussion_languages || [],
  };
}

export function privateMessage(v) {
  const m = v.private_message;
  return {
    kind: 'message', id: m.id, inboxId: m.id, content: m.content || '', read: false,
    deleted: !!m.deleted, published: m.published_at, updated: m.updated_at || null,
    creator: person(v.creator), recipient: person(v.recipient),
  };
}

/** A notification -> an inbox item (reply, mention or message), or null for kinds the inbox doesn't show. */
export function notification(v) {
  const n = v.notification;
  const d = v.data || {};
  let item = null;
  if (d.type_ === 'comment') {
    item = { ...comment(d), kind: n.kind === 'mention' ? 'mention' : 'reply', postTitle: N.cleanName(d.post?.name) };
  } else if (d.type_ === 'private_message') {
    item = privateMessage(d);
  } else if (d.type_ === 'post') {
    const p = post(d);
    item = { ...p, kind: 'mention', postId: p.id, postTitle: p.title, content: p.body, published: p.published };
  }
  if (!item) return null;
  return { ...item, inboxId: n.id, read: !!n.read, published: item.published || n.published_at };
}

const MODLOG = {
  admin_add: (r) => (r ? 'removed as admin' : 'added as admin'),
  admin_ban: (r) => (r ? 'unbanned from the instance' : 'banned from the instance'),
  admin_allow_instance: (r) => (r ? 'disallowed an instance' : 'allowed an instance'),
  admin_block_instance: (r) => (r ? 'unblocked an instance' : 'blocked an instance'),
  admin_purge_comment: () => 'purged a comment',
  admin_purge_community: () => 'purged a community',
  admin_purge_person: () => 'purged a person',
  admin_purge_post: () => 'purged a post',
  mod_add_to_community: (r) => (r ? 'removed as moderator' : 'added as moderator'),
  mod_ban_from_community: (r) => (r ? 'unbanned from community' : 'banned from community'),
  admin_feature_post_site: (r) => (r ? 'unpinned post on the instance' : 'pinned post on the instance'),
  mod_feature_post_community: (r) => (r ? 'unpinned post' : 'pinned post'),
  mod_change_community_visibility: () => 'changed community visibility',
  mod_lock_post: (r) => (r ? 'unlocked post' : 'locked post'),
  mod_remove_comment: (r) => (r ? 'restored comment' : 'removed comment'),
  admin_remove_community: (r) => (r ? 'restored community' : 'removed community'),
  mod_remove_post: (r) => (r ? 'restored post' : 'removed post'),
  mod_transfer_community: () => 'transferred community',
  mod_lock_comment: (r) => (r ? 'unlocked comment' : 'locked comment'),
  mod_warn_comment: () => 'warned about a comment',
  mod_warn_post: () => 'warned about a post',
};

export function modlogEntry(v) {
  const m = v.modlog;
  return {
    id: `v4:${m.id}`,
    kind: m.kind,
    action: (MODLOG[m.kind] || (() => m.kind.replace(/_/g, ' ')))(m.is_revert),
    when: m.published_at,
    reason: m.reason || '',
    expires: m.expires_at || null,
    moderator: person(v.moderator),
    post: v.target_post ? { id: v.target_post.id, title: N.cleanName(v.target_post.name), apId: v.target_post.ap_id || '' } : null,
    comment: v.target_comment ? { id: v.target_comment.id, postId: v.target_comment.post_id, content: v.target_comment.content, apId: v.target_comment.ap_id || '' } : null,
    community: v.target_community ? community(v.target_community) : null,
    person: person(v.target_person),
  };
}

export function report(v) {
  if (v.type_ === 'post') {
    const r = v.post_report;
    return {
      id: r.id, kind: 'post', reason: r.reason, resolved: !!r.resolved, published: r.published_at,
      reporter: person(v.creator), resolver: person(v.resolver), community: community(v.community),
      post: { id: v.post.id, title: N.cleanName(v.post.name), body: v.post.body || '', url: v.post.url || null, removed: !!v.post.removed, locked: !!v.post.locked, apId: v.post.ap_id || '' },
      original: { title: r.original_post_name, body: r.original_post_body || '', url: r.original_post_url || null },
      author: person(v.post_creator),
    };
  }
  if (v.type_ === 'comment') {
    const r = v.comment_report;
    return {
      id: r.id, kind: 'comment', reason: r.reason, resolved: !!r.resolved, published: r.published_at,
      reporter: person(v.creator), resolver: person(v.resolver), community: community(v.community),
      post: { id: v.post.id, title: N.cleanName(v.post.name), apId: v.post.ap_id || '' },
      comment: { id: v.comment.id, postId: v.comment.post_id, content: v.comment.content, removed: !!v.comment.removed, apId: v.comment.ap_id || '' },
      original: { content: r.original_comment_text },
      author: person(v.comment_creator),
    };
  }
  return null;
}
