// v3's mod log and reports -> the app's models. Its own module: only
// moderators and the mod log page need it.

import { person, community, cleanName } from './normalize.js';

/**
 * v3's modlog comes as one array per kind of action. Each entry becomes
 * { id, kind, action, when, reason, moderator, post?, comment?, community?, person?, expires? },
 * where [action] reads after the moderator's name ("removed post").
 */
const MODLOG_V3 = [
  ['removed_posts', 'mod_remove_post', (e) => (e.removed ? 'removed post' : 'restored post')],
  ['locked_posts', 'mod_lock_post', (e) => (e.locked ? 'locked post' : 'unlocked post')],
  ['featured_posts', 'mod_feature_post', (e) => `${e.featured ? 'pinned' : 'unpinned'} post${e.is_featured_community ? '' : ' on the instance'}`],
  ['removed_comments', 'mod_remove_comment', (e) => (e.removed ? 'removed comment' : 'restored comment')],
  ['removed_communities', 'mod_remove_community', (e) => (e.removed ? 'removed community' : 'restored community')],
  ['banned_from_community', 'mod_ban_from_community', (e) => (e.banned ? 'banned from community' : 'unbanned from community')],
  ['banned', 'mod_ban', (e) => (e.banned ? 'banned from the instance' : 'unbanned from the instance')],
  ['added_to_community', 'mod_add_community', (e) => (e.removed ? 'removed as moderator' : 'added as moderator')],
  ['transferred_to_community', 'mod_transfer_community', () => 'transferred community'],
  ['added', 'mod_add', (e) => (e.removed ? 'removed as admin' : 'added as admin')],
  ['admin_purged_persons', 'admin_purge_person', () => 'purged a person'],
  ['admin_purged_communities', 'admin_purge_community', () => 'purged a community'],
  ['admin_purged_posts', 'admin_purge_post', () => 'purged a post'],
  ['admin_purged_comments', 'admin_purge_comment', () => 'purged a comment'],
  ['hidden_communities', 'mod_hide_community', (e) => (e.hidden ? 'hid community' : 'unhid community')],
];

export function modlogV3(r) {
  const out = [];
  for (const [list, key, action] of MODLOG_V3) {
    for (const v of r[list] || []) {
      const e = v[key] || {};
      const target = v.banned_person || v.modded_person || v.commenter || null;
      out.push({
        id: `${key}:${e.id}`,
        kind: key,
        action: action(e),
        when: e.when_,
        reason: e.reason || '',
        expires: e.expires || null,
        moderator: person(v.moderator || v.admin),
        post: v.post ? { id: v.post.id, title: cleanName(v.post.name), apId: v.post.ap_id || '' } : null,
        comment: v.comment ? { id: v.comment.id, postId: v.comment.post_id, content: v.comment.content, apId: v.comment.ap_id || '' } : null,
        community: v.community ? community(v.community) : null,
        person: person(target),
      });
    }
  }
  return out.sort((a, b) => String(b.when).localeCompare(String(a.when)));
}

export function postReportV3(v) {
  const r = v.post_report;
  return {
    id: r.id, kind: 'post', reason: r.reason, resolved: !!r.resolved, published: r.published,
    reporter: person(v.creator), resolver: person(v.resolver),
    community: community(v.community),
    post: { id: v.post.id, title: cleanName(v.post.name), body: v.post.body || '', url: v.post.url || null, removed: !!v.post.removed, locked: !!v.post.locked, apId: v.post.ap_id || '' },
    original: { title: r.original_post_name, body: r.original_post_body || '', url: r.original_post_url || null },
    author: person(v.post_creator),
  };
}

export function commentReportV3(v) {
  const r = v.comment_report;
  return {
    id: r.id, kind: 'comment', reason: r.reason, resolved: !!r.resolved, published: r.published,
    reporter: person(v.creator), resolver: person(v.resolver),
    community: community(v.community),
    post: { id: v.post.id, title: cleanName(v.post.name), apId: v.post.ap_id || '' },
    comment: { id: v.comment.id, postId: v.comment.post_id, content: v.comment.content, removed: !!v.comment.removed, apId: v.comment.ap_id || '' },
    original: { content: r.original_comment_text },
    author: person(v.comment_creator),
  };
}
