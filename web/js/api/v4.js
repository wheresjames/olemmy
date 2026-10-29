// Lemmy API v4 (Lemmy 1.x), behind the same interface as v3.js (§15 #3):
// views pass v3's sort names and get the same models back. v4 pages with
// cursors only, which the interface's `next`/`cursor` already are.
//
// Endpoints and shapes follow lemmy-js-client 1.0.0-beta.2. Lemmy 1.0 keeps
// v3 working, so this is only used when the setting asks for it and the
// instance answers /api/v4/site (state/session.js).

import { request } from './client.js';
import * as V from './normalize-v4.js';
import { POST_SORTS, COMMENT_SORTS, LISTING_TYPES } from './v3.js';

export { POST_SORTS, COMMENT_SORTS, LISTING_TYPES };

const HOUR = 3600, DAY = 86400;
const TOP_RANGE = {
  TopHour: HOUR, TopSixHour: 6 * HOUR, TopTwelveHour: 12 * HOUR, TopDay: DAY, TopWeek: 7 * DAY,
  TopMonth: 30 * DAY, TopThreeMonths: 90 * DAY, TopSixMonths: 180 * DAY, TopNineMonths: 270 * DAY, TopYear: 365 * DAY,
};

/** v3 sort name -> { sort, time_range_seconds } in v4's terms. */
export function postSort(sort = 'Hot') {
  if (sort === 'TopAll') return { sort: 'top' };
  if (TOP_RANGE[sort]) return { sort: 'top', time_range_seconds: TOP_RANGE[sort] };
  return { sort: sort.replace(/[A-Z]/g, (c, i) => (i ? '_' : '') + c.toLowerCase()) };
}

const listing = (t) => (t ? { Subscribed: 'subscribed', Local: 'local', All: 'all', ModeratorView: 'moderator_view' }[t] || 'all' : undefined);
const COMMUNITY_SORT = { TopMonth: 'active_monthly', Active: 'hot', New: 'new', TopAll: 'subscribers', Hot: 'hot', TopWeek: 'active_weekly', TopDay: 'active_daily' };
const SEARCH_TYPE = { All: 'all', Posts: 'posts', Comments: 'comments', Communities: 'communities', Users: 'users', Url: 'posts' };
const INBOX_FILTER = { all: 'all', unread: 'all', replies: 'reply', mentions: 'mention', messages: 'private_message' };

/** Drop the 'c:' a v3-style cursor may carry; v4's are opaque strings. */
const cur = (cursor) => (typeof cursor === 'string' && cursor && !cursor.startsWith('p:') ? cursor.replace(/^c:/, '') : undefined);

export class LemmyV4 {
  constructor(base, getJwt = () => null) {
    this.base = base;
    this.getJwt = getJwt;
    this.version = 4;
  }

  get(path, query, opts = {}) {
    return request(this.base, { path: `api/v4/${path}`, query, jwt: this.getJwt(), ...opts });
  }

  send(method, path, body, opts = {}) {
    return request(this.base, { method, path: `api/v4/${path}`, body, jwt: this.getJwt(), ...opts });
  }

  // --- site & account -----------------------------------------------------

  async site(opts) {
    const [s, me, emojis] = await Promise.all([
      this.get('site', null, opts),
      // An expired token: no user, and session.js notices.
      this.getJwt() ? this.get('account', null, { fresh: true }).catch((e) => { if (e.kind === 'auth') return null; throw e; }) : null,
      this.get('custom_emoji/list', null, opts).then((r) => r.custom_emojis || r.items || []).catch(() => []),
    ]);
    return V.site(s, me, emojis);
  }

  login(usernameOrEmail, password, totp) {
    return this.send('POST', 'account/auth/login', {
      username_or_email: usernameOrEmail, password, stay_logged_in: true,
      ...(totp ? { totp_2fa_token: totp } : {}),
    });
  }

  logout() { return this.send('POST', 'account/auth/logout', {}).catch(() => null); }

  async captcha() {
    const r = await this.get('account/auth/get_captcha', null, { fresh: true });
    return r.ok ? { png: r.ok.png, wav: r.ok.wav, uuid: r.ok.uuid } : null;
  }

  register(form) { return this.send('POST', 'account/auth/register', { ...form, stay_logged_in: true }); }

  /** [settings] in v3's field names, translated. */
  saveUserSettings(s) {
    const out = { ...s };
    if ('default_sort_type' in s) { Object.assign(out, { default_post_sort_type: postSort(s.default_sort_type).sort }); delete out.default_sort_type; }
    if ('default_listing_type' in s) out.default_listing_type = listing(s.default_listing_type);
    if ('show_scores' in s) { out.show_score = s.show_scores; delete out.show_scores; }
    return this.send('PUT', 'account/settings/save', out);
  }

  changePassword(oldPassword, newPassword) {
    return this.send('PUT', 'account/auth/change_password', {
      old_password: oldPassword, new_password: newPassword, new_password_verify: newPassword, stay_logged_in: true,
    });
  }

  // --- posts --------------------------------------------------------------

  async posts({ type, sort, community, cursor, limit = 25, savedOnly }, opts) {
    if (savedOnly) {
      const r = await this.get('account/saved', { type_: 'posts', page_cursor: cur(cursor), limit }, opts);
      return { posts: (r.items || []).filter((i) => i.type_ === 'post').map(V.post), next: r.next_page || null };
    }
    const r = await this.get('post/list', {
      type_: community ? undefined : listing(type),
      ...postSort(sort),
      community_name: community,
      page_cursor: cur(cursor),
      limit,
    }, opts);
    const posts = (r.items || r.posts || []).map(V.post);
    return { posts, next: r.next_page || null };
  }

  async post(id, opts) {
    const r = await this.get('post', { id }, opts);
    return {
      post: V.post(r.post_view),
      community: V.communityView(r.community_view),
      moderators: (r.moderators || []).map((m) => V.person(m.moderator)),
      crossPosts: (r.cross_posts || []).map(V.post),
    };
  }

  /** [score] 1, -1 or 0 (take the vote back). */
  vote(postId, score) {
    return this.send('POST', 'post/like', { post_id: postId, is_upvote: score === 0 ? undefined : score === 1 }).then((r) => V.post(r.post_view));
  }

  save(postId, save) { return this.send('PUT', 'post/save', { post_id: postId, save }).then((r) => V.post(r.post_view)); }
  hide(postIds, hide) { return Promise.all([].concat(postIds).map((id) => this.send('POST', 'post/hide', { post_id: id, hide }))); }
  markRead(postIds, read) { return Promise.all([].concat(postIds).map((id) => this.send('POST', 'post/mark_as_read', { post_id: id, read }))); }
  reportPost(postId, reason) { return this.send('POST', 'post/report', { post_id: postId, reason }); }

  async createPost(p) {
    const r = await this.send('POST', 'post', {
      name: p.name, community_id: p.communityId, url: p.url || undefined, body: p.body || undefined,
      nsfw: !!p.nsfw, language_id: p.languageId || undefined, alt_text: p.altText || undefined,
    });
    return V.post(r.post_view);
  }

  async editPost(id, p) {
    const r = await this.send('PUT', 'post', {
      post_id: id, name: p.name, url: p.url || undefined, body: p.body ?? undefined,
      nsfw: !!p.nsfw, language_id: p.languageId || undefined, alt_text: p.altText || undefined,
    });
    return V.post(r.post_view);
  }

  deletePost(id, deleted = true) { return this.send('DELETE', 'post', { post_id: id, deleted }).then((r) => V.post(r.post_view)); }

  async siteMetadata(url) {
    const m = (await this.get('post/site_metadata', { url })).metadata || {};
    return { title: m.title || '', description: m.description || '', image: m.image || '', contentType: m.content_type || '' };
  }

  // --- comments -----------------------------------------------------------

  async commentPage({ postId, parentId, sort = 'Hot', maxDepth, limit, cursor, savedOnly }, opts) {
    if (savedOnly) {
      const r = await this.get('account/saved', { type_: 'comments', page_cursor: cur(cursor), limit }, opts);
      return { comments: (r.items || []).filter((i) => i.type_ === 'comment').map(V.comment), next: r.next_page || null };
    }
    const r = await this.get('comment/list', {
      post_id: postId, parent_id: parentId, sort: sort.toLowerCase(), max_depth: maxDepth, limit,
      page_cursor: cur(cursor), type_: 'all',
    }, opts);
    return { comments: (r.items || r.comments || []).map(V.comment), next: r.next_page || null };
  }

  async comments(q, opts) { return (await this.commentPage(q, opts)).comments; }
  async comment(id, opts) { return V.comment((await this.get('comment', { id }, opts)).comment_view); }

  async createComment(postId, content, parentId, languageId) {
    const r = await this.send('POST', 'comment', { post_id: postId, content, parent_id: parentId || undefined, language_id: languageId || undefined });
    return V.comment(r.comment_view);
  }

  async editComment(id, content, languageId) { return V.comment((await this.send('PUT', 'comment', { comment_id: id, content, language_id: languageId || undefined })).comment_view); }
  async deleteComment(id, deleted = true) { return V.comment((await this.send('DELETE', 'comment', { comment_id: id, deleted })).comment_view); }
  async voteComment(id, score) { return V.comment((await this.send('POST', 'comment/like', { comment_id: id, is_upvote: score === 0 ? undefined : score === 1 })).comment_view); }
  async saveComment(id, save) { return V.comment((await this.send('PUT', 'comment/save', { comment_id: id, save })).comment_view); }
  reportComment(id, reason) { return this.send('POST', 'comment/report', { comment_id: id, reason }); }

  // --- communities --------------------------------------------------------

  async community(name, opts) {
    const r = await this.get('community', { name }, opts);
    return { community: V.communityView(r.community_view), moderators: (r.moderators || []).map((m) => V.person(m.moderator)) };
  }

  async communities({ type = 'All', sort = 'TopMonth', cursor, limit = 50, showNsfw } = {}, opts) {
    const r = await this.get('community/list', {
      type_: listing(type), sort: COMMUNITY_SORT[sort] || 'active_monthly', page_cursor: cur(cursor), limit, show_nsfw: showNsfw || undefined,
    }, opts);
    return { communities: (r.items || r.communities || []).map(V.communityView), next: r.next_page || null };
  }

  async follow(communityId, follow) { return V.communityView((await this.send('POST', 'community/follow', { community_id: communityId, follow })).community_view); }

  async blockCommunity(communityId, block) {
    const r = await this.send('POST', 'account/block/community', { community_id: communityId, block });
    return r.community_view ? V.communityView(r.community_view) : null;
  }

  // --- users --------------------------------------------------------------

  async user({ name, cursor, limit = 20, view = 'overview' }, opts) {
    const type = view === 'comments' ? 'comments' : view === 'submitted' ? 'posts' : 'all';
    const [details, content] = await Promise.all([
      this.get('person', { username: name }, opts),
      view === 'saved'
        ? this.get('account/saved', { type_: 'all', page_cursor: cur(cursor), limit }, opts)
        : this.get('person/content', { username: name, type_: type, page_cursor: cur(cursor), limit }, opts),
    ]);
    const items = content.items || [];
    return {
      person: V.personView(details.person_view),
      posts: items.filter((i) => i.type_ === 'post').map(V.post),
      comments: items.filter((i) => i.type_ === 'comment').map(V.comment),
      moderates: (details.moderates || []).map((m) => V.community(m.community)),
      next: content.next_page || null,
    };
  }

  blockPerson(personId, block) { return this.send('POST', 'account/block/person', { person_id: personId, block }); }

  /** Block an instance's communities and users both, as v3's one block did. */
  blockInstance(instanceId, block) {
    return Promise.all([
      this.send('POST', 'account/block/instance/communities', { instance_id: instanceId, block }),
      this.send('POST', 'account/block/instance/persons', { instance_id: instanceId, block }),
    ]);
  }

  // --- inbox (v4: one notification list) ------------------------------------------

  async unreadCount() {
    const r = await this.get('account/unread_counts', null, { fresh: true });
    // v4 counts notifications as one: the header shows the total.
    return { total: Number(r.notification_count) || 0, replies: null, mentions: null, messages: null, reports: Number(r.report_count) || 0 };
  }

  async inbox({ filter = 'all', cursor, limit = 20 } = {}) {
    const r = await this.get('account/notification/list', {
      type_: INBOX_FILTER[filter] || 'all', unread_only: filter === 'unread' || undefined, page_cursor: cur(cursor), limit,
    }, { fresh: true });
    return { items: (r.items || []).map(V.notification).filter(Boolean), next: r.next_page || null };
  }

  markInboxRead(item, read = true) { return this.send('POST', 'account/notification/mark_as_read', { notification_id: item.inboxId, read }); }
  markAllRead() { return this.send('POST', 'account/notification/mark_as_read/all', {}); }
  async sendMessage(recipientId, content) { return V.privateMessage((await this.send('POST', 'private_message', { recipient_id: recipientId, content })).private_message_view); }

  // --- search & resolve ---------------------------------------------------

  async search({ q, type = 'All', sort, listingType = 'All', community, cursor, limit = 20 }, opts) {
    const r = await this.get('search', {
      search_term: q, type_: SEARCH_TYPE[type] || 'all', post_url_only: type === 'Url' || undefined,
      time_range_seconds: TOP_RANGE[sort], listing_type: listing(listingType), community_name: community,
      page_cursor: cur(cursor), limit,
    }, opts);
    return {
      posts: (r.posts || []).map(V.post),
      comments: (r.comments || []).map(V.comment),
      communities: (r.communities || []).map(V.communityView),
      users: (r.persons || []).map(V.personView),
      next: r.next_page || null,
    };
  }

  async resolve(q, opts = {}) {
    const r = await this.get('resolve_object', { q }, { fresh: true, ...opts });
    const v = r?.resolve || r;
    if (v?.type_ === 'post') return { post: V.post(v) };
    if (v?.type_ === 'comment') return { comment: V.comment(v) };
    if (v?.type_ === 'community') return { community: V.communityView(v) };
    if (v?.type_ === 'person') return { person: V.personView(v) };
    return null;
  }

  // --- moderation -----------------------------------------------------------

  removePost(id, removed, reason) { return this.send('POST', 'post/remove', { post_id: id, removed, reason: reason || '' }).then((r) => V.post(r.post_view)); }
  lockPost(id, locked, reason) { return this.send('POST', 'post/lock', { post_id: id, locked, reason: reason || '' }).then((r) => V.post(r.post_view)); }
  featurePost(id, featured, where = 'community') { return this.send('POST', 'post/feature', { post_id: id, featured, feature_type: where }).then((r) => V.post(r.post_view)); }
  removeComment(id, removed, reason) { return this.send('POST', 'comment/remove', { comment_id: id, removed, reason: reason || '' }).then((r) => V.comment(r.comment_view)); }
  distinguishComment(id, distinguished) { return this.send('POST', 'comment/distinguish', { comment_id: id, distinguished }).then((r) => V.comment(r.comment_view)); }

  banFromCommunity({ communityId, personId, ban, reason, days, removeData }) {
    return this.send('POST', 'community/ban_user', {
      community_id: communityId, person_id: personId, ban, reason: reason || '',
      remove_or_restore_data: removeData || undefined,
      expires_at: days ? Math.floor(Date.now() / 1000) + days * DAY : undefined,
    });
  }

  async modlog({ communityId, cursor, limit = 20 } = {}, opts) {
    const r = await this.get('modlog', { community_id: communityId, page_cursor: cur(cursor), limit }, opts);
    return { entries: (r.items || []).map(V.modlogEntry), next: r.next_page || null };
  }

  async reports({ unresolvedOnly = true, communityId, cursor, limit = 20 } = {}) {
    const r = await this.get('report/list', { unresolved_only: unresolvedOnly, community_id: communityId, page_cursor: cur(cursor), limit }, { fresh: true });
    return { reports: (r.items || []).map(V.report).filter(Boolean), next: r.next_page || null };
  }

  resolveReport(report, resolved = true) { return this.send('PUT', `${report.kind}/report/resolve`, { report_id: report.id, resolved }); }

  async reportCount() { return (await this.unreadCount()).reports; }

  // --- images -------------------------------------------------------------

  async upload(file, opts = {}) {
    const form = new FormData();
    form.append('images[]', file, file.name || 'image');
    const r = await request(this.base, { method: 'POST', path: 'api/v4/image', form, jwt: this.getJwt(), ...opts });
    if (!r.image_url) throw new Error('The upload failed');
    return { url: r.image_url, deleteToken: null };
  }
}
