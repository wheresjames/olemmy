// Reactive state shared by every place a post or comment is shown: vote,
// score, saved, hidden... A vote in the listing shows on the comments page
// too, and the other way round. Kept for the most recent items only.

import { signal, batch } from '../core/signal.js';

const MAX = 2000;
const posts = new Map();
const comments = new Map();

function remember(map, id, state) {
  map.delete(id);
  map.set(id, state);
  if (map.size > MAX) map.delete(map.keys().next().value);
}

function fields(item, keys) {
  const s = {};
  for (const k of keys) s[k] = signal(item[k]);
  return s;
}

const POST_KEYS = ['myVote', 'score', 'upvotes', 'downvotes', 'saved', 'hidden', 'read', 'deleted', 'removed', 'locked', 'featuredCommunity', 'featuredLocal', 'comments', 'title', 'body', 'url', 'nsfw', 'updated'];
const COMMENT_KEYS = ['myVote', 'score', 'upvotes', 'downvotes', 'saved', 'deleted', 'removed', 'distinguished', 'content', 'updated', 'childCount'];

function sync(state, item, keys) {
  batch(() => { for (const k of keys) state[k].value = item[k]; });
}

// Keyed by id on the instance in use; content read from another instance
// (views/address.js) brings its own key ("host:id"), so the two never mix.
const keyOf = (item) => item.stateKey ?? item.id;

/** The live state of post [p]; newer data from the server updates it. */
export function postState(p) {
  const k = keyOf(p);
  let s = posts.get(k);
  if (s) sync(s, p, POST_KEYS);
  else s = fields(p, POST_KEYS);
  remember(posts, k, s);
  return s;
}

export function commentState(c) {
  const k = keyOf(c);
  let s = comments.get(k);
  if (s) sync(s, c, COMMENT_KEYS);
  else s = fields(c, COMMENT_KEYS);
  remember(comments, k, s);
  return s;
}

/** Apply a server answer for a post (after a vote, edit...). */
export function updatePost(p) { if (posts.has(p.id)) sync(posts.get(p.id), p, POST_KEYS); }
export function updateComment(c) { if (comments.has(c.id)) sync(comments.get(c.id), c, COMMENT_KEYS); }
