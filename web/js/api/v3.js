// Lemmy API v3 (Lemmy 0.19.x; Lemmy 1.x keeps it working). Every method
// returns normalized models (normalize.js), never raw API objects.
//
// The adapter interface (shared with v4.js):
// - Sorts are given in v3's names ('Hot', 'TopDay', 'MostComments'...).
// - Lists come back with `next`, an opaque cursor for the following page
//   (null at the end). Callers pass it back as `cursor`. v3 uses Lemmy's
//   page_cursor for posts, and page numbers elsewhere, behind the cursor.

import { request } from './client.js';
import * as N from './normalize.js';

export const POST_SORTS = ['Hot', 'Active', 'Scaled', 'New', 'Old', 'Controversial', 'MostComments', 'NewComments',
  'TopHour', 'TopSixHour', 'TopTwelveHour', 'TopDay', 'TopWeek', 'TopMonth', 'TopThreeMonths', 'TopSixMonths',
  'TopNineMonths', 'TopYear', 'TopAll'];
export const COMMENT_SORTS = ['Hot', 'Top', 'New', 'Old', 'Controversial'];
export const LISTING_TYPES = ['Subscribed', 'Local', 'All'];

/** 'p:3' -> { page: 3 }; 'c:abc' -> { page_cursor: 'abc' }; none -> page 1. */
export function readCursor(cursor) {
  if (typeof cursor === 'string' && cursor.startsWith('c:')) return { page_cursor: cursor.slice(2) };
  const page = typeof cursor === 'string' && cursor.startsWith('p:') ? Number(cursor.slice(2)) : 1;
  return { page: page || 1 };
}

/** The cursor after page [page] when it came back [full]. */
const nextPage = (cursorIn, full) => (full ? `p:${(readCursor(cursorIn).page || 1) + 1}` : null);

export class LemmyV3 {
  /**
   * @param {string} base  instance base URL
   * @param {() => (string|null)} getJwt
   */
  constructor(base, getJwt = () => null) {
    this.base = base;
    this.getJwt = getJwt;
    this.version = 3;
  }

  /** @param {string} path @param {any} [opts] */
  get(path, query, opts = {}) {
    return request(this.base, { path: `api/v3/${path}`, query, jwt: this.getJwt(), ...opts });
  }

  send(method, path, body, opts = {}) {
    return request(this.base, { method, path: `api/v3/${path}`, body, jwt: this.getJwt(), ...opts });
  }

  // --- site & account -----------------------------------------------------

  async site(opts) { return N.site(await this.get('site', null, opts)); }

  /** Raw login: { jwt, registration_created, verify_email_sent }. */
  login(usernameOrEmail, password, totp) {
    return this.send('POST', 'user/login', {
      username_or_email: usernameOrEmail,
      password,
      ...(totp ? { totp_2fa_token: totp } : {}),
    });
  }

  logout() { return this.send('POST', 'user/logout', {}).catch(() => null); }

  async captcha() {
    const r = await this.get('user/get_captcha', null, { fresh: true });
    return r.ok ? { png: r.ok.png, wav: r.ok.wav, uuid: r.ok.uuid } : null;
  }

  register(form) { return this.send('POST', 'user/register', form); }

  /** [settings] in v3's field names (save_user_settings). */
  saveUserSettings(settings) { return this.send('PUT', 'user/save_user_settings', settings); }

  changePassword(oldPassword, newPassword) {
    return this.send('PUT', 'user/change_password', {
      old_password: oldPassword, new_password: newPassword, new_password_verify: newPassword,
    });
  }

  // --- posts --------------------------------------------------------------

  /**
   * @param {{ type?: string, sort?: string, community?: string, cursor?: string,
   *           limit?: number, savedOnly?: boolean, showHidden?: boolean }} q
   */
  async posts({ type, sort, community, cursor, limit = 25, savedOnly, showHidden }, opts) {
    const r = await this.get('post/list', {
      type_: community ? undefined : type,
      sort,
      community_name: community,
      ...readCursor(cursor),
      limit,
      saved_only: savedOnly || undefined,
      show_hidden: showHidden || undefined,
    }, opts);
    const posts = (r.posts || []).map(N.post);
    // 0.19 gives a page_cursor; older versions only page numbers.
    const next = posts.length < limit ? null : r.next_page ? `c:${r.next_page}` : nextPage(cursor, true);
    return { posts, next };
  }

  async post(id, opts) {
    const r = await this.get('post', { id }, opts);
    return {
      post: N.post(r.post_view),
      community: N.communityView(r.community_view),
      moderators: (r.moderators || []).map((m) => N.person(m.moderator)),
      crossPosts: (r.cross_posts || []).map(N.post),
    };
  }

  vote(postId, score) { return this.send('POST', 'post/like', { post_id: postId, score }).then((r) => N.post(r.post_view)); }
  save(postId, save) { return this.send('PUT', 'post/save', { post_id: postId, save }).then((r) => N.post(r.post_view)); }
  hide(postIds, hide) { return this.send('POST', 'post/hide', { post_ids: [].concat(postIds), hide }); }
  markRead(postIds, read) { return this.send('POST', 'post/mark_as_read', { post_ids: [].concat(postIds), post_id: [].concat(postIds)[0], read }); }
  reportPost(postId, reason) { return this.send('POST', 'post/report', { post_id: postId, reason }); }

  /** @param {{ name: string, communityId: number, url?: string, body?: string, nsfw?: boolean, languageId?: number, altText?: string }} p */
  async createPost(p) {
    const r = await this.send('POST', 'post', {
      name: p.name, community_id: p.communityId, url: p.url || undefined, body: p.body || undefined,
      nsfw: !!p.nsfw, language_id: p.languageId || undefined, alt_text: p.altText || undefined,
    });
    return N.post(r.post_view);
  }

  async editPost(id, p) {
    const r = await this.send('PUT', 'post', {
      post_id: id, name: p.name, url: p.url || undefined, body: p.body ?? undefined,
      nsfw: !!p.nsfw, language_id: p.languageId || undefined, alt_text: p.altText || undefined,
    });
    return N.post(r.post_view);
  }

  deletePost(id, deleted = true) { return this.send('POST', 'post/delete', { post_id: id, deleted }).then((r) => N.post(r.post_view)); }

  async siteMetadata(url) {
    const r = await this.get('post/site_metadata', { url });
    const m = r.metadata || {};
    return { title: m.title || '', description: m.description || '', image: m.image || '', contentType: m.content_type || '' };
  }

  // --- comments -----------------------------------------------------------

  /**
   * With maxDepth, Lemmy returns the whole tree to that depth (up to its own
   * cap of about 300) and ignores limit; the cursor then pages through
   * top-level comments.
   * @param {{ postId?: number, parentId?: number, sort?: string, maxDepth?: number, limit?: number, cursor?: string, savedOnly?: boolean }} q
   * @returns {Promise<{ comments: any[], next: string|null }>}
   */
  async commentPage({ postId, parentId, sort = 'Hot', maxDepth, limit, cursor, savedOnly }, opts) {
    const r = await this.get('comment/list', {
      post_id: postId, parent_id: parentId, sort, max_depth: maxDepth, limit, ...readCursor(cursor),
      type_: 'All', saved_only: savedOnly || undefined,
    }, opts);
    const comments = (r.comments || []).map(N.comment);
    return { comments, next: nextPage(cursor, comments.length >= (limit || 300)) };
  }

  async comments(q, opts) { return (await this.commentPage(q, opts)).comments; }

  async comment(id, opts) { return N.comment((await this.get('comment', { id }, opts)).comment_view); }

  async createComment(postId, content, parentId, languageId) {
    const r = await this.send('POST', 'comment', {
      post_id: postId, content, parent_id: parentId || undefined, language_id: languageId || undefined,
    });
    return N.comment(r.comment_view);
  }

  async editComment(id, content, languageId) { return N.comment((await this.send('PUT', 'comment', { comment_id: id, content, language_id: languageId || undefined })).comment_view); }
  async deleteComment(id, deleted = true) { return N.comment((await this.send('POST', 'comment/delete', { comment_id: id, deleted })).comment_view); }
  async voteComment(id, score) { return N.comment((await this.send('POST', 'comment/like', { comment_id: id, score })).comment_view); }
  async saveComment(id, save) { return N.comment((await this.send('PUT', 'comment/save', { comment_id: id, save })).comment_view); }
  reportComment(id, reason) { return this.send('POST', 'comment/report', { comment_id: id, reason }); }

  // --- communities --------------------------------------------------------

  async community(name, opts) {
    const r = await this.get('community', { name }, opts);
    return {
      community: N.communityView(r.community_view),
      moderators: (r.moderators || []).map((m) => N.person(m.moderator)),
    };
  }

  /** @returns {Promise<{ communities: any[], next: string|null }>} */
  async communities({ type = 'All', sort = 'TopMonth', cursor, limit = 50, showNsfw } = {}, opts) {
    const r = await this.get('community/list', { type_: type, sort, ...readCursor(cursor), limit, show_nsfw: showNsfw || undefined }, opts);
    const communities = (r.communities || []).map(N.communityView);
    return { communities, next: nextPage(cursor, communities.length >= limit) };
  }

  async follow(communityId, follow) { return N.communityView((await this.send('POST', 'community/follow', { community_id: communityId, follow })).community_view); }
  async blockCommunity(communityId, block) { return N.communityView((await this.send('POST', 'community/block', { community_id: communityId, block })).community_view); }

  // --- users --------------------------------------------------------------

  /**
   * A user and a page of what they wrote. [view]: 'overview' | 'comments' |
   * 'submitted' | 'saved' (your own).
   * @param {{ name: string, sort?: string, cursor?: string, limit?: number, view?: string }} q
   */
  async user({ name, sort = 'New', cursor, limit = 20, view = 'overview' }, opts) {
    const r = await this.get('user', { username: name, sort, ...readCursor(cursor), limit, saved_only: view === 'saved' || undefined }, opts);
    const posts = view === 'comments' ? [] : (r.posts || []).map(N.post);
    const comments = view === 'submitted' ? [] : (r.comments || []).map(N.comment);
    const full = (r.posts || []).length >= limit || (r.comments || []).length >= limit;
    return {
      person: N.personView(r.person_view),
      posts, comments,
      moderates: (r.moderates || []).map((m) => N.community(m.community)),
      next: nextPage(cursor, full),
    };
  }

  blockPerson(personId, block) { return this.send('POST', 'user/block', { person_id: personId, block }); }
  blockInstance(instanceId, block) { return this.send('POST', 'site/block', { instance_id: instanceId, block }); }

  // --- inbox --------------------------------------------------------------

  async unreadCount() {
    const r = await this.get('user/unread_count', null, { fresh: true });
    const c = { replies: n(r.replies), mentions: n(r.mentions), messages: n(r.private_messages) };
    return { ...c, total: c.replies + c.mentions + c.messages };
  }

  /**
   * Inbox items, newest first. [filter]: 'all' | 'unread' | 'replies' |
   * 'mentions' | 'messages'.
   * @returns {Promise<{ items: any[], next: string|null }>}
   */
  async inbox({ filter = 'all', cursor, limit = 20 } = {}) {
    const unreadOnly = filter === 'unread';
    const want = (t) => filter === 'all' || filter === 'unread' || filter === t;
    const { page } = readCursor(cursor);
    const q = { sort: 'New', unread_only: unreadOnly, page, limit };
    const [replies, mentions, messages] = await Promise.all([
      want('replies') ? this.get('user/replies', q, { fresh: true }).then((r) => (r.replies || []).map(N.reply)) : [],
      want('mentions') ? this.get('user/mention', q, { fresh: true }).then((r) => (r.mentions || []).map(N.mention)) : [],
      want('messages') ? this.get('private_message/list', { unread_only: unreadOnly, page, limit }, { fresh: true }).then((r) => (r.private_messages || []).map(N.privateMessage)) : [],
    ]);
    const items = [...replies, ...mentions, ...messages].sort((a, b) => String(b.published).localeCompare(String(a.published)));
    const full = replies.length >= limit || mentions.length >= limit || messages.length >= limit;
    return { items, next: nextPage(cursor, full) };
  }

  /** Mark an inbox [item] (from inbox()) read or unread. */
  markInboxRead(item, read = true) {
    if (item.kind === 'reply') return this.send('POST', 'comment/mark_as_read', { comment_reply_id: item.inboxId, read });
    if (item.kind === 'mention') return this.send('POST', 'user/mention/mark_as_read', { person_mention_id: item.inboxId, read });
    return this.send('POST', 'private_message/mark_as_read', { private_message_id: item.inboxId, read });
  }

  markAllRead() { return this.send('POST', 'user/mark_all_as_read', {}); }
  async sendMessage(recipientId, content) { return N.privateMessage((await this.send('POST', 'private_message', { recipient_id: recipientId, content })).private_message_view); }

  // --- search & resolve ---------------------------------------------------

  /** @param {{ q: string, type?: string, sort?: string, listingType?: string, community?: string, cursor?: string, limit?: number }} s */
  async search({ q, type = 'All', sort = 'TopAll', listingType = 'All', community, cursor, limit = 20 }, opts) {
    const r = await this.get('search', {
      q, type_: type, sort, listing_type: listingType, community_name: community, ...readCursor(cursor), limit,
    }, opts);
    const out = {
      posts: (r.posts || []).map(N.post),
      comments: (r.comments || []).map(N.comment),
      communities: (r.communities || []).map(N.communityView),
      users: (r.users || []).map(N.personView),
    };
    const count = out.posts.length + out.comments.length + out.communities.length + out.users.length;
    return { ...out, next: nextPage(cursor, count >= limit) };
  }

  /** Look up a URL or !name@host on this instance: { post|comment|community|person } or null. */
  async resolve(q, opts = {}) {
    const r = await this.get('resolve_object', { q }, { fresh: true, ...opts });
    if (r.post) return { post: N.post(r.post) };
    if (r.comment) return { comment: N.comment(r.comment) };
    if (r.community) return { community: N.communityView(r.community) };
    if (r.person) return { person: N.personView(r.person) };
    return null;
  }

  // --- moderation -----------------------------------------------------------

  removePost(id, removed, reason) { return this.send('POST', 'post/remove', { post_id: id, removed, reason }).then((r) => N.post(r.post_view)); }
  lockPost(id, locked) { return this.send('POST', 'post/lock', { post_id: id, locked }).then((r) => N.post(r.post_view)); }
  /** [where] 'community' or 'local' (instance-wide, admins only). */
  featurePost(id, featured, where = 'community') {
    return this.send('POST', 'post/feature', { post_id: id, featured, feature_type: where === 'local' ? 'Local' : 'Community' }).then((r) => N.post(r.post_view));
  }
  removeComment(id, removed, reason) { return this.send('POST', 'comment/remove', { comment_id: id, removed, reason }).then((r) => N.comment(r.comment_view)); }
  distinguishComment(id, distinguished) { return this.send('POST', 'comment/distinguish', { comment_id: id, distinguished }).then((r) => N.comment(r.comment_view)); }

  /** @param {{ communityId: number, personId: number, ban: boolean, reason?: string, days?: number, removeData?: boolean }} b */
  banFromCommunity({ communityId, personId, ban, reason, days, removeData }) {
    return this.send('POST', 'community/ban_user', {
      community_id: communityId, person_id: personId, ban, reason: reason || undefined,
      remove_data: removeData || undefined,
      expires: days ? Math.floor(Date.now() / 1000) + days * 86400 : undefined,
    });
  }

  /** @returns {Promise<{ entries: any[], next: string|null }>} */
  async modlog({ communityId, cursor, limit = 20 } = {}, opts) {
    const r = await this.get('modlog', { community_id: communityId, ...readCursor(cursor), limit }, opts);
    const entries = (await import('./normalize-mod.js')).modlogV3(r);
    // Each kind has its own list of [limit]: there's more while any is full.
    const full = Object.values(r).some((list) => Array.isArray(list) && list.length >= limit);
    return { entries, next: nextPage(cursor, full) };
  }

  /** Open (or all) post and comment reports in the communities you moderate. */
  async reports({ unresolvedOnly = true, communityId, cursor, limit = 20 } = {}) {
    const q = { unresolved_only: unresolvedOnly, community_id: communityId, ...readCursor(cursor), limit };
    const [posts, comments] = await Promise.all([
      this.get('post/report/list', q, { fresh: true }),
      this.get('comment/report/list', q, { fresh: true }),
    ]);
    const M = await import('./normalize-mod.js');
    const reports = [...(posts.post_reports || []).map(M.postReportV3), ...(comments.comment_reports || []).map(M.commentReportV3)]
      .sort((a, b) => String(b.published).localeCompare(String(a.published)));
    const full = (posts.post_reports || []).length >= limit || (comments.comment_reports || []).length >= limit;
    return { reports, next: nextPage(cursor, full) };
  }

  resolveReport(report, resolved = true) {
    return this.send('PUT', `${report.kind}/report/resolve`, { report_id: report.id, resolved });
  }

  async reportCount(communityId) {
    const r = await this.get('user/report_count', { community_id: communityId }, { fresh: true });
    return n(r.post_reports) + n(r.comment_reports);
  }

  // --- images -------------------------------------------------------------

  /** Upload an image file; resolves to its URL on the instance. */
  async upload(file, opts = {}) {
    const form = new FormData();
    form.append('images[]', file, file.name || 'image');
    const r = await request(this.base, { method: 'POST', path: 'pictrs/image', form, jwt: this.getJwt(), ...opts });
    const f = r.files?.[0];
    if (r.msg !== 'ok' || !f) throw new Error(r.msg || 'The upload failed');
    // 0.19.4 and later say where the image is; before, it's under pictrs/image.
    return { url: r.url || `${this.base}/pictrs/image/${f.file}`, deleteToken: f.delete_token };
  }
}

const n = (x) => Number(x) || 0;
