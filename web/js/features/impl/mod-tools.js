// The moderator tools themselves (features/mod-tools.js loads them for
// moderators and admins only).

import { h } from '../../core/h.js';
import { href } from '../../core/router.js';
import { api, canModerate, isAdmin, me } from '../../state/session.js';
import { postState, commentState, updatePost, updateComment } from '../../state/entities.js';
import { openDialog, ask } from '../../components/dialog.js';
import { toast, toastError } from '../../components/toast.js';
import { postModHooks, commentModHooks } from '../../views/hooks.js';
import { enabled } from '../registry.js';

async function run(label, fn) {
  try {
    const r = await fn();
    toast(label, { kind: 'success' });
    return r;
  } catch (e) { toastError(e); return null; }
}

/** Ask for a reason (required by Lemmy 1.x, optional in 0.19). */
const reason = (title) => ask(title, { label: 'Reason (shown in the mod log)', submit: 'OK', required: false });

/** Ban [person] from [community]: reason, length, and whether to remove their content. */
export async function banDialog(person, community) {
  const result = await openDialog((close) => {
    const why = h('textarea#ban-reason', { rows: 3 });
    const days = h('input#ban-days', { type: 'number', min: 1, max: 3650, placeholder: 'permanent' });
    const remove = h('input#ban-remove', { type: 'checkbox' });
    return h('form.dialog-body', {
      onsubmit: (e) => { e.preventDefault(); close({ reason: why.value.trim(), days: Number(days.value) || 0, removeData: remove.checked }); },
    },
    h('h2', `Ban ${person.fullName} from ${community.name}`),
    h('label', { for: 'ban-reason' }, 'reason'), why,
    h('label', { for: 'ban-days' }, 'days (empty for a permanent ban)'), days,
    h('label.checkbox', remove, ' also remove their posts and comments here'),
    h('div.dialog-buttons',
      h('button.btn', { type: 'button', onclick: () => close(null) }, 'cancel'),
      h('button.btn.btn-primary', { type: 'submit' }, 'ban')));
  }, { label: 'Ban user' });
  if (!result) return;
  await run(`Banned ${person.name} from ${community.name}`, () => api.peek().banFromCommunity({
    communityId: community.id, personId: person.id, ban: true, ...result,
  }));
}

function menu(items) {
  return h('details.more-menu.mod-menu',
    h('summary', { title: 'Moderator tools' }, 'mod'),
    h('ul.menu', items.filter(Boolean).map((i) => h('li', i))));
}

const button = (label, onclick) => h('button.link-button', { type: 'button', onclick }, label);

function postMenu(post) {
  if (!enabled('modTools') || !(post.canMod || canModerate(post.community))) return null;
  const s = postState(post);
  const a = () => api.peek();
  return h('li.mod', menu([
    () => button(s.removed.value ? 'restore post' : 'remove post', async () => {
      const removing = !s.removed.peek();
      const why = removing ? await reason('Remove post') : '';
      if (why === null) return;
      const p = await run(removing ? 'Post removed' : 'Post restored', () => a().removePost(post.id, removing, why));
      if (p) updatePost(p);
    }),
    () => button(s.locked.value ? 'unlock' : 'lock comments', async () => {
      const p = await run(s.locked.peek() ? 'Unlocked' : 'Locked', () => a().lockPost(post.id, !s.locked.peek(), ''));
      if (p) updatePost(p);
    }),
    () => button(s.featuredCommunity.value ? 'unpin in community' : 'pin in community', async () => {
      const p = await run(s.featuredCommunity.peek() ? 'Unpinned' : 'Pinned', () => a().featurePost(post.id, !s.featuredCommunity.peek(), 'community'));
      if (p) updatePost(p);
    }),
    isAdmin.peek() && (() => button(s.featuredLocal.value ? 'unpin on instance' : 'pin on instance', async () => {
      const p = await run(s.featuredLocal.peek() ? 'Unpinned' : 'Pinned', () => a().featurePost(post.id, !s.featuredLocal.peek(), 'local'));
      if (p) updatePost(p);
    })),
    post.creator && me.peek()?.person?.id !== post.creator.id && button(`ban ${post.creator.name}`, () => banDialog(post.creator, post.community)),
    h('a', { href: href('/modlog', { community: post.community.fullName }) }, 'mod log'),
    h('a', { href: href('/reports', { community: post.community.fullName }) }, 'reports'),
  ]));
}

function commentMenu(comment) {
  if (!enabled('modTools') || !comment.community || !(comment.canMod || canModerate(comment.community))) return null;
  const s = commentState(comment);
  const mine = me.peek()?.person?.id === comment.creator?.id;
  return h('li.mod', menu([
    () => button(s.removed.value ? 'restore' : 'remove', async () => {
      const removing = !s.removed.peek();
      const why = removing ? await reason('Remove comment') : '';
      if (why === null) return;
      const c = await run(removing ? 'Comment removed' : 'Comment restored', () => api.peek().removeComment(comment.id, removing, why));
      if (c) updateComment(c);
    }),
    // Lemmy lets moderators mark only their own comments as speaking as a mod.
    mine && (() => button(s.distinguished.value ? 'undistinguish' : 'distinguish', async () => {
      const c = await run('Done', () => api.peek().distinguishComment(comment.id, !s.distinguished.peek()));
      if (c) updateComment(c);
    })),
    !mine && comment.creator && button(`ban ${comment.creator.name}`, () => banDialog(comment.creator, comment.community)),
  ]));
}

let installed = false;

/** Add the mod menus to posts and comments (once). */
export function install() {
  if (installed) return;
  installed = true;
  postModHooks.push(postMenu);
  commentModHooks.push(commentMenu);
}
