// Submit (and edit) a post: link or text, community picker with
// autocomplete, image upload with a paste-a-URL fallback (§15 #2), NSFW,
// language. Crossposts arrive with ?crosspost=<post id>.

import { h } from '../core/h.js';
import { signal } from '../core/signal.js';
import { href, navigate } from '../core/router.js';
import { api, subscriptions } from '../state/session.js';
import { requireLogin } from '../state/actions.js';
import { tabMenu } from '../components/tab-menu.js';
import { spinner, errorBox, setTitle, postHref } from '../components/common.js';
import { editor, clearDraft, readDraft, saveDraft } from '../components/editor.js';
import { toastError } from '../components/toast.js';
import { languageSelect, selectedLanguage } from '../components/language-select.js';
import { runHook } from '../features/registry.js';

const TITLE_MAX = 200;

export function submitView(route, ctx) {
  const { chrome } = ctx;
  if (!requireLogin('Log in to submit a post')) return h('div');
  const editId = Number(route.query.get('edit')) || null;
  const crosspostId = Number(route.query.get('crosspost')) || null;
  const type = signal(route.query.get('type') === 'text' ? 'text' : 'link');
  setTitle(editId ? 'edit post' : 'submit');
  chrome.pageName.value = { text: editId ? 'edit post' : 'submit', href: route.hash };
  chrome.tabs.value = editId ? null : tabMenu([
    { label: 'link', href: href('/submit', { type: 'link', community: route.query.get('community') }), selected: type.peek() === 'link' },
    { label: 'text', href: href('/submit', { type: 'text', community: route.query.get('community') }), selected: type.peek() === 'text' },
  ], 'Post type');
  chrome.sidebar.value = h('div.side', h('div.side-box',
    h('h2', 'posting tips'),
    h('ul.small',
      h('li', 'Pick the community that fits best. Read its sidebar for rules.'),
      h('li', 'A link post can have text too.'),
      h('li', 'Mark anything not safe for work as NSFW.'))));

  const page = h('div.form-page.submit-page', spinner());
  (async () => {
    // title, url and body can come in the address: "Share → Olemmy" from other apps (main.js receiveShare).
    const q = (k) => route.query.get(k) || '';
    let initial = { title: q('title'), url: q('url'), body: q('body'), nsfw: false, community: q('community'), languageId: 0, altText: '' };
    try {
      if (editId) {
        const { post } = await api.peek().post(editId, { signal: ctx.signal });
        initial = { title: post.title, url: post.url || '', body: post.body, nsfw: post.nsfw, community: post.community.fullName, languageId: post.languageId, altText: post.altText };
        type.value = post.url ? 'link' : 'text';
      } else if (crosspostId) {
        const { post } = await api.peek().post(crosspostId, { signal: ctx.signal });
        const quoted = post.body ? `\n\n${post.body.split('\n').map((l) => `> ${l}`).join('\n')}` : '';
        initial = { ...initial, title: post.title, url: post.url || '', body: `cross-posted from: ${post.apId}${quoted}`, nsfw: post.nsfw };
        type.value = post.url ? 'link' : 'text';
      }
    } catch (e) {
      if (e.kind !== 'aborted') page.replaceChildren(errorBox(e));
      return;
    }
    if (!ctx.signal.aborted) page.replaceChildren(form(initial, { editId, type, ctx }));
  })();
  return page;
}

function form(initial, { editId, type, ctx }) {
  const draftKey = editId ? `edit-post:${editId}` : 'submit';
  const titleDraft = !editId && readDraft(`${draftKey}:title`);
  const title = h('input#post-title', {
    type: 'text', required: true, maxlength: TITLE_MAX, value: titleDraft || initial.title,
    oninput: () => saveDraft(`${draftKey}:title`, title.value),
  });
  const url = h('input#post-url', { type: 'url', value: initial.url, placeholder: 'https://', inputmode: 'url' });
  const altText = h('input#post-alt', { type: 'text', value: initial.altText, maxlength: 1500 });
  const body = editor({ draftKey: `${draftKey}:body`, initial: initial.body, label: 'Text', rows: 8, id: 'post-body' });
  const community = h('input#post-community', {
    type: 'text', required: true, value: initial.community, list: 'community-options', autocomplete: 'off',
    placeholder: 'name or name@instance', disabled: !!editId,
    oninput: () => suggest(community.value),
  });
  const options = h('datalist#community-options', subscriptions.peek().map((c) => h('option', { value: c.fullName }, c.title)));
  const nsfw = h('input#post-nsfw', { type: 'checkbox', checked: initial.nsfw });
  const language = languageSelect({ id: 'post-language', selected: initial.languageId });
  const busy = signal(false);
  const uploadNote = signal('');
  const error = signal(null);

  let timer = 0;
  function suggest(q) {
    clearTimeout(timer);
    if (q.trim().length < 2) return;
    timer = setTimeout(async () => {
      try {
        const r = await api.peek().search({ q: q.replace(/@.*/, ''), type: 'Communities', sort: 'TopAll', limit: 10 });
        const seen = new Set();
        options.replaceChildren(...[...subscriptions.peek(), ...r.communities]
          .filter((c) => !seen.has(c.fullName) && seen.add(c.fullName))
          .map((c) => h('option', { value: c.fullName }, `${c.title} · ${c.subscribers} subscribers`)));
      } catch { /* suggestions are optional */ }
    }, 300);
  }

  const file = h('input#post-image', {
    type: 'file', accept: 'image/*,video/mp4,video/webm',
    onchange: async () => {
      const f = file.files?.[0];
      if (!f) return;
      uploadNote.value = `Uploading ${f.name}…`;
      try {
        const { url: uploaded } = await api.peek().upload(f);
        url.value = uploaded;
        uploadNote.value = 'Uploaded.';
      } catch (e) {
        uploadNote.value = e.kind === 'cors'
          ? 'This instance doesn\'t accept uploads from other web apps. Upload the image somewhere else and paste its URL above.'
          : `The upload failed: ${e.message}. You can paste an image URL above instead.`;
      } finally { file.value = ''; }
    },
  });

  const suggestTitle = async () => {
    if (!url.value) return;
    try {
      const m = await api.peek().siteMetadata(url.value);
      if (m.title && !title.value) title.value = m.title.slice(0, TITLE_MAX);
    } catch (e) { toastError(e); }
  };

  return h('form.submit-form', {
    onsubmit: async (e) => {
      e.preventDefault();
      error.value = null;
      busy.value = true;
      const client = api.peek();
      try {
        const data = {
          name: title.value.trim(),
          url: type.peek() === 'link' ? url.value.trim() : '',
          body: body.value(),
          nsfw: nsfw.checked,
          languageId: selectedLanguage(language),
          altText: altText.value.trim(),
        };
        let post;
        if (editId) {
          post = await client.editPost(editId, data);
        } else {
          const { community: c } = await client.community(community.value.trim().replace(/^!/, ''), { signal: ctx.signal });
          if (ctx.signal.aborted || api.peek() !== client) return;
          post = await client.createPost({ ...data, communityId: c.id });
        }
        if (ctx.signal.aborted || api.peek() !== client) return;
        if (!editId) runHook('onVote', post.creator, 0, post.myVote);
        clearDraft(`${draftKey}:title`);
        clearDraft(`${draftKey}:body`);
        navigate(postHref(post));
      } catch (err) {
        if (!ctx.signal.aborted) error.value = err;
      } finally { busy.value = false; }
    },
  },
  h('h1', editId ? 'edit your post' : 'submit to Lemmy'),
  () => (error.value ? errorBox(error.value) : null),
  h('div.field', { hidden: () => type.value !== 'link' },
    h('label', { for: 'post-url' }, 'url'), url,
    h('div.field-row',
      h('label.btn.btn-small.upload-label', { for: 'post-image' }, 'upload an image'), file,
      h('button.btn.btn-small', { type: 'button', onclick: suggestTitle }, 'suggest title')),
    () => (uploadNote.value ? h('p.small.upload-note', { role: 'status' }, uploadNote.value) : null),
    h('label', { for: 'post-alt' }, 'image description (alt text)'), altText),
  h('div.field', h('label', { for: 'post-title' }, 'title'), title),
  h('div.field', h('label', { for: 'post-body' }, type.peek() === 'text' ? 'text' : 'text (optional)'), body.el),
  h('div.field', h('label', { for: 'post-community' }, 'community'), community, options),
  h('div.field-row',
    h('label.checkbox', nsfw, ' NSFW'),
    h('label', { for: 'post-language' }, 'language '), language),
  h('div.form-buttons', h('button.btn.btn-primary', { type: 'submit', disabled: () => busy.value }, () => (busy.value ? 'submitting…' : editId ? 'save' : 'submit'))));
}
