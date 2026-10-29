// A fake Lemmy instance for the E2E tests: https://fixture.test answers
// from the fictional responses in tests/fixtures, every other remote host is
// refused (no network), and the clock is fixed so "3 hours ago" and the
// screenshots stay the same from run to run.

import { readFileSync } from 'node:fs';
import { test as base, expect } from '@playwright/test';
import * as v4 from '../helpers/v4.mjs';

export const INSTANCE = 'fixture.test';
const ORIGIN = `https://${INSTANCE}`;
export const NOW = new Date('2026-10-25T20:00:00Z');
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const COLORS = [['#dae8e5', '#74a59b'], ['#eee3d5', '#c6976c'], ['#e2e4f1', '#8798c5'], ['#e8e5db', '#9b9c78']];
function thumbnail(url) {
  const id = Number(url.pathname.match(/\/posts\/(\d+)/)?.[1] || 0);
  const [background, foreground] = COLORS[id % COLORS.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140" viewBox="0 0 140 140"><rect width="140" height="140" fill="${background}"/><circle cx="105" cy="35" r="16" fill="${foreground}" opacity=".55"/><path d="M0 112 40 67 66 95 89 77 140 126v14H0Z" fill="${foreground}"/><path d="M0 125 30 96 62 124 85 105 123 140H0Z" fill="${foreground}" opacity=".58"/></svg>`;
}

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'));

function myUser({ moderator = false } = {}) {
  const person = fixture('user').person_view;
  const modOf = fixture('post').community_view.community;
  return {
    local_user_view: {
      local_user: { show_nsfw: false, blur_nsfw: true, show_scores: true, show_avatars: true, show_bot_accounts: true, show_read_posts: true, default_sort_type: 'Hot', default_listing_type: 'Subscribed', admin: false },
      person: { ...person.person, name: 'tester', display_name: 'Tester', actor_id: `${ORIGIN}/u/tester`, local: true },
      counts: person.counts,
    },
    follows: [{ community: fixture('community').community_view.community }],
    moderates: moderator ? [{ community: modOf, moderator: person.person }] : [],
    community_blocks: [], instance_blocks: [], person_blocks: [], discussion_languages: [],
  };
}

/** API v4 answers, made from the same fixtures (tests/helpers/v4.mjs). */
function v4Answer(path, req, authed) {
  switch (path) {
    case 'site': return v4.site(fixture('site'));
    case 'account': return authed ? { ...myUser(), local_user_view: { ...myUser().local_user_view, person: { ...myUser().local_user_view.person, post_count: 1, comment_count: 2, published_at: '2024-01-01T00:00:00Z', ap_id: `${ORIGIN}/u/tester` } } } : null;
    case 'custom_emoji/list': return { custom_emojis: [] };
    case 'post/list': return v4.paged(fixture('post-list').posts.map(v4.postView));
    case 'post': {
      const f = fixture('post');
      return { post_view: v4.postView(f.post_view), community_view: { community: v4.postView(f.post_view).community }, moderators: [], cross_posts: [] };
    }
    case 'comment/list': return v4.paged(fixture('comments').comments.map(v4.commentView), null);
    case 'post/like': {
      const body = req.postDataJSON();
      const raw = structuredClone(fixture('post-list').posts.find((p) => p.post.id === body.post_id));
      raw.my_vote = body.is_upvote === true ? 1 : body.is_upvote === false ? -1 : 0;
      return { post_view: v4.postView(raw) };
    }
    case 'account/unread_counts': return { notification_count: 2 };
    default: return undefined;
  }
}

/** The picker's instance list (Lemmyverse's format), with the fake instance in it. */
const directoryEntry = (baseurl, name, extra) => ({
  baseurl, name, desc: '', icon: `https://${baseurl}/icon.png`, reg_mode: 2, private: false, langs: ['all'], tags: [],
  counts: { users: 100, users_active_month: 10 }, published: 1688335167000, score: 1, isSuspicious: false, ...extra,
});
export const DIRECTORY = [
  directoryEntry('big.example', 'Big Place', { desc: 'A general purpose instance for everyone.', score: 90, counts: { users: 50000, users_active_month: 3000 }, tags: ['general purpose'] }),
  directoryEntry(INSTANCE, 'Fixture', { desc: 'The test instance.', score: 50, langs: ['en'] }),
  directoryEntry('quiet.example', 'Quiet Corner', { desc: 'Small, about gardening.', score: 5, reg_mode: 0, langs: ['de'] }),
  directoryEntry('spam.example', 'Spam Farm', { score: 999, isSuspicious: true }),
];

/**
 * Serve the fake instance on [page]. Returns the requests it got, for
 * tests to check what the app sent.
 */
export async function fakeInstance(page, { loggedIn = false, siteFails = false, moderator = false, api4 = false } = {}) {
  const calls = [];
  await page.route((url) => url.hostname !== 'localhost', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname === 'data.lemmyverse.net') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(DIRECTORY), headers: { 'access-control-allow-origin': '*' } });
    }
    if (url.origin !== ORIGIN) {
      // Fictional post thumbnails; other remote images are a pixel. No network.
      if (req.resourceType() === 'image' && url.hostname === 'assets.example' && url.pathname.startsWith('/posts/')) {
        return route.fulfill({ body: thumbnail(url), contentType: 'image/svg+xml' });
      }
      return req.resourceType() === 'image' ? route.fulfill({ body: PIXEL, contentType: 'image/png' }) : route.abort();
    }
    const version = url.pathname.startsWith('/api/v4/') ? 4 : 3;
    const path = url.pathname.replace(/^\/api\/v[34]\//, '');
    const auth = req.headers().authorization;
    calls.push({ version, method: req.method(), path, query: Object.fromEntries(url.searchParams), body: req.postDataJSON?.() ?? null, auth });
    const json = (body, status = 200) => route.fulfill({
      status, contentType: 'application/json', body: JSON.stringify(body),
      headers: { 'access-control-allow-origin': '*' },
    });
    if (siteFails) return route.abort();
    const authed = loggedIn || auth === 'Bearer test-jwt';
    if (version === 4) {
      if (!api4) return json({ error: 'not_found' }, 404);
      const answer = v4Answer(path, req, authed);
      return answer === undefined ? json({ error: 'not_found_in_fixtures' }, 404) : answer === null ? json({ error: 'not_logged_in' }, 401) : json(answer);
    }
    switch (path) {
      case 'site': return json({ ...fixture('site'), my_user: authed ? myUser({ moderator }) : undefined });
      case 'modlog': return json(fixture('modlog'));
      case 'user/report_count': return json({ post_reports: 1, comment_reports: 0 });
      case 'post/report/list': {
        const v = fixture('post').post_view;
        return json({ post_reports: [{ post_report: { id: 5, creator_id: 1, post_id: v.post.id, original_post_name: v.post.name, reason: 'spam?', resolved: false, published: '2026-10-25T19:00:00Z' }, post: v.post, community: v.community, creator: v.creator, post_creator: v.creator, counts: v.counts }] });
      }
      case 'comment/report/list': return json({ comment_reports: [] });
      case 'post/report/resolve': return json({ post_report_view: {} });
      case 'post/remove': {
        const v = structuredClone(fixture('post').post_view);
        v.post.removed = req.postDataJSON().removed;
        return json({ post_view: v });
      }
      case 'post/list': return json(fixture('post-list'));
      case 'post': return json(fixture('post'));
      case 'comment/list': return json(fixture('comments'));
      case 'community': return json(fixture('community'));
      case 'community/list': return json(fixture('community-list'));
      case 'user': return json(fixture('user'));
      case 'search': return json(fixture('search'));
      case 'user/unread_count': return json({ replies: 1, mentions: 0, private_messages: 0 });
      case 'user/login': {
        const body = req.postDataJSON();
        if (body.password !== 'correct horse') return json({ error: 'incorrect_login' }, 400);
        return json({ jwt: 'test-jwt', registration_created: false, verify_email_sent: false });
      }
      case 'post/like': {
        const view = structuredClone(fixture('post-list').posts.find((p) => p.post.id === req.postDataJSON().post_id));
        view.my_vote = req.postDataJSON().score;
        view.counts.score += view.my_vote;
        return json({ post_view: view });
      }
      case 'post/mark_as_read': return json({ success: true });
      case 'user/replies': {
        const c = fixture('comments').comments[0];
        return json({ replies: [{ ...c, comment_reply: { id: 1, recipient_id: 1, comment_id: c.comment.id, read: false, published: c.comment.published }, recipient: c.creator }] });
      }
      case 'user/mention': return json({ mentions: [] });
      case 'comment': {
        if (req.method() !== 'POST') return json({ error: 'not_found_in_fixtures' }, 404);
        const body = req.postDataJSON();
        const view = structuredClone(fixture('comments').comments[0]);
        Object.assign(view.comment, { id: 999, content: body.content, language_id: body.language_id ?? 0, path: body.parent_id ? `0.${body.parent_id}.999` : '0.999', published: '2026-10-25T20:00:00Z' });
        view.creator = { ...view.creator, id: 424242, name: 'tester', actor_id: `${ORIGIN}/u/tester`, local: true };
        view.counts = { ...view.counts, score: 1, child_count: 0 };
        return json({ comment_view: view });
      }
      case 'private_message/list': {
        const p = fixture('user').person_view.person;
        return json({ private_messages: [{ private_message: { id: 7, creator_id: p.id, recipient_id: 1, content: 'Hello **there**', deleted: false, read: false, published: '2026-10-25T18:00:00Z', ap_id: '', local: true }, creator: p, recipient: p }] });
      }
      case 'user/get_captcha': return json({ ok: { png: PIXEL.toString('base64'), uuid: 'u1' } });
      default: return json({ error: 'not_found_in_fixtures' }, 404);
    }
  });
  return calls;
}

/** A page set up with the fake instance chosen, the clock fixed, and console errors collected. */
export const test = base.extend({
  instanceOptions: [{}, { option: true }],
  errors: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      // The unbuilt site has no deployment.json: its 404 is expected.
      if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text());
    });
    await use(errors);
  },
  // Automatic, so every test gets the fake instance; { noInstance: true }
  // leaves the instance unchosen (a first run).
  calls: [async ({ page, instanceOptions }, use) => {
    await page.clock.setFixedTime(NOW);
    if (!instanceOptions.noInstance) {
      await page.addInitScript((instance) => {
        if (!localStorage.getItem('olemmy:settings')) {
          localStorage.setItem('olemmy:settings', JSON.stringify({ v: 1, data: { instance } }));
        }
      }, INSTANCE);
    }
    // No updates mid-test (the built site has a real deployment.json); the
    // updater tests route it themselves, and later routes win.
    await page.route(/\/deployment\.json/, (r) => r.fulfill({ status: 404, body: '' }));
    await use(await fakeInstance(page, instanceOptions));
  }, { auto: true }],
});

export { expect };
