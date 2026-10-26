// Inbox: all / unread / comment replies / mentions / messages, and the
// compose form (#/message/compose?to=name@host).

import { h, fill } from '../core/h.js';
import { signal } from '../core/signal.js';
import { href, navigate } from '../core/router.js';
import { api, unread, refreshUnread } from '../state/session.js';
import { requireLogin } from '../state/actions.js';
import { tabMenu } from '../components/tab-menu.js';
import { spinner, errorBox, empty, setTitle, mdBlock, userLink, timeEl, postHref, commentHref, communityLink, cursorPager } from '../components/common.js';
import { replyForm } from '../components/comment.js';
import { editor, clearDraft } from '../components/editor.js';
import { toast, toastError } from '../components/toast.js';

const TABS = [['all', 'all'], ['unread', 'unread'], ['replies', 'comment replies'], ['mentions', 'username mentions'], ['messages', 'messages']];

export function inboxView(route, ctx) {
  const { chrome } = ctx;
  if (!requireLogin('Log in to see your inbox')) return h('div');
  const tab = route.query.get('tab') || 'all';
  setTitle('inbox');
  chrome.pageName.value = { text: 'messages', href: href('/inbox') };
  chrome.tabs.value = tabMenu(TABS.map(([t, label]) => ({ label, href: href('/inbox', { tab: t === 'all' ? '' : t }), selected: tab === t })), 'Inbox');
  chrome.sidebar.value = h('div.side',
    h('a.submit-button', { href: href('/message/compose') }, 'Send a private message'),
    h('button.btn', { type: 'button', onclick: markAll }, 'mark all as read'));

  const list = h('div.inbox-list', spinner());
  api.peek().inbox({ filter: tab, cursor: route.query.get('after') || undefined, limit: 20 }).then(({ items, next }) => {
    if (ctx.signal.aborted) return;
    fill(list, items.length ? items.map(inboxItem) : empty(tab === 'unread' ? 'No unread messages.' : 'Nothing here yet.'), cursorPager(route, next));
  }).catch((e) => { if (e.kind !== 'aborted') list.replaceChildren(errorBox(e)); });
  return h('div.inbox-page', list);
}

async function markAll() {
  try {
    await api.peek().markAllRead();
    unread.value = { total: 0, replies: 0, mentions: 0, messages: 0 };
    document.querySelectorAll('.inbox-item.unread').forEach((el) => el.classList.remove('unread'));
    toast('All marked as read');
  } catch (e) { toastError(e); }
}

function inboxItem(item) {
  const read = signal(item.read);
  const replying = signal(false);
  const setRead = async (on) => {
    read.value = on;
    try {
      await api.peek().markInboxRead(item, on);
      refreshUnread();
    } catch (e) { read.value = !on; toastError(e); }
  };

  const isMessage = item.kind === 'message';
  const title = isMessage ? 'private message'
    : item.kind === 'reply' ? 'comment reply' : 'username mention';
  return h('div.inbox-item.thing', {
    tabIndex: -1,
    class: { unread: () => !read.value, [`inbox-${item.kind}`]: true },
    dataset: { kind: item.kind, id: item.id },
  },
  h('p.subject',
    h('strong', title),
    !isMessage && [' on ', h('a', { href: postHref(item.post || item.postId) }, item.postTitle || 'a post')],
    !isMessage && item.community && [' in ', communityLink(item.community)]),
  h('p.tagline', 'from ', userLink(item.creator), ' ', isMessage ? 'sent ' : '', timeEl(item.published)),
  item.deleted ? h('div.md.gone', '[deleted]') : mdBlock(item.content),
  h('ul.flat-list.buttons',
    !isMessage && h('li.first', h('a', { href: commentHref(item, { context: true }), dataset: { parent: item.parentId ?? undefined } }, 'context')),
    !isMessage && h('li', h('a', { href: postHref(item.post || item.postId) }, 'full comments')),
    h('li', h('button.link-button', { type: 'button', onclick: () => { replying.value = !replying.value; if (!read.peek()) setRead(true); } }, 'reply')),
    h('li', h('button.link-button', { type: 'button', onclick: () => setRead(!read.peek()) }, () => (read.value ? 'mark unread' : 'mark read')))),
  () => {
    if (!replying.value) return null;
    if (isMessage) return messageForm(item.creator, () => { replying.value = false; });
    return replyForm(item.postId, item.id, { postId: item.postId }, () => {
      replying.value = false;
      toast('Reply sent', { kind: 'success' });
    }, () => { replying.value = false; });
  });
}

/** A private message form to [person] (or to a name typed in). */
function messageForm(person, onSent) {
  const key = `message:${person ? person.fullName : 'new'}`;
  const ed = editor({ draftKey: key, label: 'Message', rows: 5, required: true });
  const busy = signal(false);
  return h('form.reply-form', {
    onsubmit: async (e) => {
      e.preventDefault();
      busy.value = true;
      try {
        await api.peek().sendMessage(person.id, ed.value());
        clearDraft(key);
        toast('Message sent', { kind: 'success' });
        onSent();
      } catch (err) { toastError(err); } finally { busy.value = false; }
    },
  }, ed.el, h('div.form-buttons', h('button.btn.btn-primary', { type: 'submit', disabled: () => busy.value }, 'send')));
}

export function composeView(route, ctx) {
  const { chrome } = ctx;
  if (!requireLogin('Log in to send messages')) return h('div');
  setTitle('send a message');
  chrome.pageName.value = { text: 'messages', href: href('/inbox') };
  chrome.tabs.value = null;
  chrome.sidebar.value = null;
  const to = h('input#compose-to', { type: 'text', required: true, value: route.query.get('to') || '', placeholder: 'name@instance', autocomplete: 'off' });
  const key = 'message:compose';
  const ed = editor({ draftKey: key, label: 'Message', rows: 8, required: true, id: 'compose-body' });
  const busy = signal(false);
  return h('form.compose-form.form-page', {
    onsubmit: async (e) => {
      e.preventDefault();
      busy.value = true;
      const client = api.peek();
      try {
        const { person } = await client.user({ name: to.value.trim().replace(/^@/, ''), limit: 1 }, { signal: ctx.signal });
        if (ctx.signal.aborted || api.peek() !== client) return;
        await client.sendMessage(person.id, ed.value());
        if (ctx.signal.aborted || api.peek() !== client) return;
        clearDraft(key);
        toast(`Message sent to ${person.fullName}`, { kind: 'success' });
        navigate(href('/inbox', { tab: 'messages' }));
      } catch (err) { if (!ctx.signal.aborted) toastError(err); } finally { busy.value = false; }
    },
  },
  h('h1', 'send a private message'),
  h('label', { for: 'compose-to' }, 'to (username, or name@instance)'), to,
  h('label', { for: 'compose-body' }, 'message'), ed.el,
  h('p.small', 'Private messages on Lemmy are not end-to-end encrypted: the admins of both instances can read them.'),
  h('div.form-buttons', h('button.btn.btn-primary', { type: 'submit', disabled: () => busy.value }, () => (busy.value ? 'sending…' : 'send'))));
}
