// Turn the fictional v3 fixtures into API v4 shapes (lemmy-js-client
// 1.0.0-beta.2's types), so the v4 adapter can be tested without a Lemmy
// 1.x server. These only check our reading of the types; a real 1.x
// instance is the final word (docs/compat.md).

const person = (p) => p && {
  id: p.id, name: p.name, display_name: p.display_name, avatar: p.avatar, published_at: p.published,
  ap_id: p.actor_id, bio: p.bio, local: p.local, banner: p.banner, deleted: p.deleted,
  bot_account: p.bot_account, instance_id: p.instance_id, post_count: 3, comment_count: 7,
};

const community = (c, counts = {}) => c && {
  id: c.id, name: c.name, title: c.title, sidebar: c.description, removed: c.removed, published_at: c.published,
  deleted: c.deleted, nsfw: c.nsfw, ap_id: c.actor_id, local: c.local, icon: c.icon, banner: c.banner,
  posting_restricted_to_mods: c.posting_restricted_to_mods, instance_id: c.instance_id, visibility: 'public',
  subscribers: counts.subscribers || 0, posts: counts.posts || 0, comments: counts.comments || 0,
  users_active_day: counts.users_active_day || 0, users_active_week: counts.users_active_week || 0,
  users_active_month: counts.users_active_month || 0,
};

const vote = (v) => (v === 1 ? true : v === -1 ? false : undefined);

export function postView(v) {
  const p = v.post;
  return {
    post: {
      id: p.id, name: p.name, url: p.url, body: p.body, creator_id: p.creator_id, community_id: p.community_id,
      removed: p.removed, locked: p.locked, published_at: p.published, updated_at: p.updated, deleted: p.deleted,
      nsfw: p.nsfw, thumbnail_url: p.thumbnail_url, ap_id: p.ap_id, local: p.local, language_id: p.language_id,
      featured_community: p.featured_community, featured_local: p.featured_local, url_content_type: p.url_content_type,
      comments: v.counts.comments, score: v.counts.score, upvotes: v.counts.upvotes, downvotes: v.counts.downvotes,
      newest_comment_time_at: v.counts.newest_comment_time,
    },
    creator: person(v.creator),
    community: community(v.community),
    community_actions: v.subscribed === 'Subscribed' ? { followed_at: '2026-01-01T00:00:00Z', follow_state: 'accepted' } : undefined,
    post_actions: v.my_vote || v.saved ? { vote_is_upvote: vote(v.my_vote), saved_at: v.saved ? '2026-01-01T00:00:00Z' : undefined } : undefined,
    creator_is_admin: v.creator_is_admin, creator_is_moderator: v.creator_is_moderator,
    creator_banned_from_community: v.creator_banned_from_community, can_mod: false, tags: [],
  };
}

export function commentView(v) {
  const c = v.comment;
  return {
    comment: {
      id: c.id, creator_id: c.creator_id, post_id: c.post_id, content: c.content, removed: c.removed,
      published_at: c.published, updated_at: c.updated, deleted: c.deleted, ap_id: c.ap_id, local: c.local,
      path: c.path, distinguished: c.distinguished, language_id: c.language_id,
      score: v.counts.score, upvotes: v.counts.upvotes, downvotes: v.counts.downvotes, child_count: v.counts.child_count,
    },
    creator: person(v.creator),
    post: { id: v.post.id, name: v.post.name, creator_id: v.post.creator_id, locked: v.post.locked },
    community: community(v.community),
    comment_actions: v.my_vote ? { vote_is_upvote: vote(v.my_vote) } : undefined,
    creator_is_admin: v.creator_is_admin, creator_is_moderator: v.creator_is_moderator, can_mod: false, tags: [],
  };
}

export function site(s) {
  const ls = s.site_view.local_site;
  return {
    site_view: {
      site: { ...s.site_view.site, ap_id: s.site_view.site.actor_id, summary: s.site_view.site.description, published_at: s.site_view.site.published },
      local_site: {
        ...ls, post_downvotes: ls.enable_downvotes ? 'all' : 'disable', nsfw_content_disallowed: !ls.enable_nsfw,
        default_post_listing_type: 'local', default_post_sort_type: 'active', registration_mode: 'require_application',
        users: 100, posts: 200, comments: 300, communities: 40, users_active_day: 5, users_active_week: 9, users_active_month: 20,
      },
    },
    admins: (s.admins || []).map((a) => ({ person: person(a.person), is_admin: true, banned: false })),
    version: '1.0.0',
    all_languages: s.all_languages,
    discussion_languages: s.discussion_languages,
    captcha_enabled: false,
  };
}

export const paged = (items, next = 'cursor-2') => ({ items, next_page: next });
