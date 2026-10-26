// What the buttons do: votes, saves, hides, subscriptions, blocks. Each
// updates the screen at once (optimistically), then the instance; on
// failure the change is undone and the reason shown.

import { batch } from '../core/signal.js';
import { navigate, href } from '../core/router.js';
import { api, loggedIn, site, refreshSite } from './session.js';
import { postState, commentState, updatePost, updateComment } from './entities.js';
import { toast, toastError } from '../components/toast.js';
import { runHook } from '../features/registry.js';

/** True when logged in; otherwise sends the user to log in and returns false. */
export function requireLogin(why = 'Log in to do that') {
  if (loggedIn.peek()) return true;
  toast(why);
  navigate(href('/login', { return: location.hash || '#/' }));
  return false;
}

export function downvotesEnabled() {
  return site.peek()?.enableDownvotes !== false;
}

/** The score a vote changes to. Clicking the same arrow again takes it back. */
export function nextVote(current, dir) {
  return current === dir ? 0 : dir;
}

/** The latest change asked of each state: answers to earlier ones don't overwrite it. */
const latest = new WeakMap();

async function optimistic(state, patch, call, onResult) {
  const before = {};
  for (const k of Object.keys(patch)) before[k] = state[k].peek();
  batch(() => { for (const [k, v] of Object.entries(patch)) state[k].value = v; });
  // Two quick clicks: their answers can come back in either order.
  const mine = (latest.get(state) || 0) + 1;
  latest.set(state, mine);
  const newest = () => latest.get(state) === mine;
  try {
    const result = await call();
    // [onResult](result, newest): only the newest answer should update the screen.
    if (result && onResult) onResult(result, newest());
    return result;
  } catch (e) {
    // A newer change is on screen now, and it was made from this one's.
    if (newest()) batch(() => { for (const [k, v] of Object.entries(before)) state[k].value = v; });
    toastError(e);
    return null;
  }
}

function voteDelta(state, score) {
  const old = state.myVote.peek();
  return {
    myVote: score,
    score: state.score.peek() - old + score,
    upvotes: state.upvotes.peek() - (old === 1 ? 1 : 0) + (score === 1 ? 1 : 0),
    downvotes: state.downvotes.peek() - (old === -1 ? 1 : 0) + (score === -1 ? 1 : 0),
  };
}

export function votePost(post, dir) {
  if (!requireLogin('Log in to vote')) return;
  if (dir === -1 && !downvotesEnabled()) return;
  const s = postState(post);
  const before = s.myVote.peek();
  const score = nextVote(before, dir);
  return optimistic(s, voteDelta(s, score), () => api.peek().vote(post.id, score), (p, newest) => {
    if (newest) updatePost(p);
    runHook('onVote', post.creator, before, score);
  });
}

export function voteComment(comment, dir) {
  if (!requireLogin('Log in to vote')) return;
  if (dir === -1 && !downvotesEnabled()) return;
  const s = commentState(comment);
  const before = s.myVote.peek();
  const score = nextVote(before, dir);
  return optimistic(s, voteDelta(s, score), () => api.peek().voteComment(comment.id, score), (c, newest) => {
    if (newest) updateComment(c);
    runHook('onVote', comment.creator, before, score);
  });
}

export function savePost(post) {
  if (!requireLogin('Log in to save posts')) return;
  const s = postState(post);
  const save = !s.saved.peek();
  return optimistic(s, { saved: save }, () => api.peek().save(post.id, save), (p, newest) => newest && updatePost(p));
}

export function saveComment(comment) {
  if (!requireLogin('Log in to save comments')) return;
  const s = commentState(comment);
  const save = !s.saved.peek();
  return optimistic(s, { saved: save }, () => api.peek().saveComment(comment.id, save), (c, newest) => newest && updateComment(c));
}

/** Hide on the account (server-side). Local hiding is the filters feature. */
export function hidePost(post) {
  if (!requireLogin('Log in to hide posts')) return;
  const s = postState(post);
  const hide = !s.hidden.peek();
  return optimistic(s, { hidden: hide }, async () => {
    await api.peek().hide(post.id, hide);
    if (hide) toast('Post hidden', { action: { label: 'Undo', run: () => hidePost(post) } });
    return null;
  });
}

export function markPostRead(post) {
  if (!loggedIn.peek()) return;
  const s = postState(post);
  if (s.read.peek()) return;
  s.read.value = true;
  api.peek().markRead(post.id, true).catch(() => { /* not worth a message */ });
}

/** Subscribe or unsubscribe; resolves to the community's new state. */
export async function follow(community, on) {
  if (!requireLogin('Log in to subscribe')) return null;
  try {
    const c = await api.peek().follow(community.id, on);
    refreshSite();
    toast(on ? (c.subscribed === 'Pending' ? `Subscription to ${community.name} pending` : `Subscribed to ${community.name}`) : `Unsubscribed from ${community.name}`, { kind: 'success' });
    return c;
  } catch (e) { toastError(e); return null; }
}

export async function blockCommunity(community, on = true) {
  if (!requireLogin()) return false;
  try {
    await api.peek().blockCommunity(community.id, on);
    refreshSite();
    toast(on ? `Blocked ${community.fullName} on your account` : `Unblocked ${community.fullName}`, { kind: 'success' });
    return true;
  } catch (e) { toastError(e); return false; }
}

export async function blockPerson(person, on = true) {
  if (!requireLogin()) return false;
  try {
    await api.peek().blockPerson(person.id, on);
    refreshSite();
    toast(on ? `Blocked ${person.fullName} on your account` : `Unblocked ${person.fullName}`, { kind: 'success' });
    return true;
  } catch (e) { toastError(e); return false; }
}

export async function blockInstance(instanceId, domain, on = true) {
  if (!requireLogin()) return false;
  try {
    await api.peek().blockInstance(instanceId, on);
    refreshSite();
    toast(on ? `Blocked ${domain} on your account` : `Unblocked ${domain}`, { kind: 'success' });
    return true;
  } catch (e) { toastError(e); return false; }
}

export async function report(kind, item, reason) {
  if (!requireLogin('Log in to report')) return false;
  try {
    if (kind === 'post') await api.peek().reportPost(item.id, reason);
    else await api.peek().reportComment(item.id, reason);
    toast('Reported. Thanks!', { kind: 'success' });
    return true;
  } catch (e) { toastError(e); return false; }
}
