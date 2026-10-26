// Olemmy: bootstrap. Waits for the updater's check, then mounts the
// header, starts the session and features, and renders a view per route.
// Every module of the app is reached from here by static imports, so the
// development cache buster (cache-bust.js) can find them all.

import { updated, watchForUpdates, applyPendingUpdate, updatePending, watchCopyright, refresh } from './update.js';
import { h, fill } from './core/h.js';
import { effect, root, untrack, getOwner, setFallbackOwner } from './core/signal.js';
import { route, start, beforeNavigate, navigate, href } from './core/router.js';
import { storageFailed } from './core/store.js';
import { registerKey } from './core/events.js';
import { settings } from './state/settings.js';
import { api, site, siteError, loginExpired, startSession, loadSite, account } from './state/session.js';
import { setCustomEmojis } from './markdown/md.js';
import { mountHeader, chrome } from './components/header.js';
import { banner, removeBanner } from './components/toast.js';
import { spinner, errorBox, setTitle } from './components/common.js';
import { hasOpenDraft } from './state/drafts.js';
import { installMenus } from './components/menus.js';
import { reportError, ignorable } from './core/errors.js';
import { shareToSubmit } from './util/links.js';
import { startFeatures, runHook, featuresReady } from './features/index.js';
// Views load when first visited (§10: only what the page needs). The
// cache buster still finds them: it follows import() too.
const lazy = (load, name) => () => load().then((m) => m[name]);
const listingView = lazy(() => import('./views/listing.js'), 'listingView');
const postView = lazy(() => import('./views/post.js'), 'postView');
const commentRedirectView = lazy(() => import('./views/post.js'), 'commentRedirectView');
const userView = lazy(() => import('./views/user.js'), 'userView');
const inboxView = lazy(() => import('./views/inbox.js'), 'inboxView');
const composeView = lazy(() => import('./views/inbox.js'), 'composeView');
const submitView = lazy(() => import('./views/submit.js'), 'submitView');
const searchView = lazy(() => import('./views/search.js'), 'searchView');
const communitiesView = lazy(() => import('./views/search.js'), 'communitiesView');
const settingsView = lazy(() => import('./views/settings.js'), 'settingsView');
const accountView = lazy(() => import('./views/account.js'), 'accountView');
const instanceView = lazy(() => import('./views/auth.js'), 'instanceView');
const loginView = lazy(() => import('./views/auth.js'), 'loginView');
const signupView = lazy(() => import('./views/auth.js'), 'signupView');
const resolveView = lazy(() => import('./views/auth.js'), 'resolveView');
const favoritesView = lazy(() => import('./views/favorites.js'), 'favoritesView');
const multiView = lazy(() => import('./views/favorites.js'), 'multiView');
const favoritesSharedView = lazy(() => import('./views/favorites.js'), 'favoritesSharedView');
const subscriptionsView = lazy(() => import('./views/subscriptions.js'), 'subscriptionsView');
const modlogView = lazy(() => import('./views/mod.js'), 'modlogView');
const reportsView = lazy(() => import('./views/mod.js'), 'reportsView');
const aboutView = lazy(() => import('./views/about.js'), 'aboutView');
const shareView = lazy(() => import('./views/address.js'), 'shareView');
const errorsView = lazy(() => import('./views/errors.js'), 'errorsView');

const ROUTES = [
  { name: 'front', path: '/', view: listingView },
  { name: 'all', path: '/all', view: listingView },
  { name: 'local', path: '/local', view: listingView },
  { name: 'community', path: '/c/:name', view: listingView },
  { name: 'post', path: '/post/:id', view: postView },
  { name: 'postComment', path: '/post/:id/comment/:cid', view: postView },
  { name: 'comment', path: '/comment/:id', view: commentRedirectView },
  { name: 'user', path: '/u/:name', view: userView },
  { name: 'userTab', path: '/u/:name/:tab', view: userView },
  { name: 'inbox', path: '/inbox', view: inboxView },
  { name: 'compose', path: '/message/compose', view: composeView },
  { name: 'submit', path: '/submit', view: submitView },
  { name: 'search', path: '/search', view: searchView },
  { name: 'communities', path: '/communities', view: communitiesView },
  { name: 'favorites', path: '/favorites', view: favoritesView },
  { name: 'favoritesShared', path: '/favorites/view', view: favoritesSharedView },
  { name: 'multi', path: '/m/:name', view: multiView },
  { name: 'subscriptions', path: '/subscriptions', view: subscriptionsView },
  { name: 'modlog', path: '/modlog', view: modlogView },
  { name: 'reports', path: '/reports', view: reportsView },
  { name: 'settings', path: '/settings', view: settingsView },
  { name: 'account', path: '/account', view: accountView },
  { name: 'instance', path: '/instance', view: instanceView, noInstance: true },
  { name: 'login', path: '/login', view: loginView, noInstance: true },
  { name: 'about', path: '/about', view: aboutView, noInstance: true },
  { name: 'errors', path: '/errors', view: errorsView, noInstance: true },
  { name: 'signup', path: '/signup', view: signupView },
  { name: 'resolve', path: '/resolve', view: resolveView },
  // Share addresses, #/<host>/<original path> (views/address.js): last, so the
  // routes above win; none of them has a dot in its first part.
  { name: 'share', path: '/:host/*rest', view: shareView, noInstance: true },
];
const VIEWS = new Map(ROUTES.map((r) => [r.name, r]));

/** Browsers older than §15 #21's list get a message instead of a broken app. */
function supported() {
  try {
    return typeof structuredClone === 'function'
      && typeof AbortSignal.timeout === 'function'
      && CSS.supports('container-type', 'inline-size')
      && CSS.supports('selector(:has(*))')
      && typeof HTMLDialogElement === 'function';
  } catch { return false; }
}

// --- appearance -----------------------------------------------------------------

function applyAppearance() {
  effect(() => {
    const s = settings.value;
    const html = document.documentElement;
    html.dataset.density = s.density;
    html.dataset.display = s.displayMode || 'normal';
    html.style.setProperty('--font-scale', String((Number(s.fontSize) || 100) / 100));
    html.style.setProperty('--max-page-width', s.maxWidth ? `${s.maxWidth}px` : 'none');
    html.classList.toggle('no-thumbnails', s.showThumbnails === false);
  });
}

// --- views -------------------------------------------------------------------------

const main = () => document.getElementById('main');
let disposeView = null;
let abort = null;
let firstRender = true;

async function render(r) {
  disposeView?.();
  abort?.abort();
  abort = new AbortController();
  const signal = abort.signal;
  chrome.drawerOpen.value = false;
  chrome.pageName.value = null;
  chrome.tabs.value = null;
  chrome.sidebar.value = null;
  const def = VIEWS.get(r.name);
  const el = main();

  if (!def) {
    setTitle('not found');
    el.replaceChildren(h('div.error-box', h('h1', 'Page not found'), h('p', h('a', { href: '#/' }, 'Go to the front page'))));
    return;
  }
  // No instance chosen yet: everything starts at the picker.
  if (!api.peek() && !def.noInstance) {
    navigate(href('/instance', { return: r.hash }), { replace: true });
    return;
  }
  // Views read /site (downvotes, defaults...): wait for it once per instance.
  if (api.peek() && !site.peek() && !siteError.peek() && !def.noInstance) {
    el.replaceChildren(spinner(`Connecting to ${api.peek().base.replace(/^https?:\/\//, '')}…`));
    await loadSite();
    if (signal.aborted) return;
  }
  if (siteError.peek() && !def.noInstance) {
    el.replaceChildren(h('div.form-page',
      h('h1', 'Can\'t reach your instance'),
      errorBox(siteError.peek(), () => { loadSite().then(() => render(route.peek())); }),
      h('p', h('a', { href: href('/instance') }, 'Choose another instance'))));
    return;
  }

  let viewFn;
  try {
    // A feature may still be loading code this view's rows use (mod tools).
    [viewFn] = await Promise.all([def.view(), featuresReady()]);
  } catch (e) {
    // Old and new files mixed: theme-init.js fetches them all again (once a session).
    window.olemmyStale?.(String(e?.message || e));
    reportError(e, 'loading a page');
    el.replaceChildren(errorBox(new Error('Part of the app couldn\'t be loaded. Check your connection and try again.'), () => render(route.peek())));
    return;
  }
  if (signal.aborted) return;

  root((dispose) => {
    const owner = getOwner();
    setFallbackOwner(owner);
    disposeView = () => {
      setFallbackOwner(null);
      dispose();
    };
    let node;
    try {
      node = untrack(() => viewFn(r, { signal, chrome }));
    } catch (e) {
      reportError(e, `page ${r.name}`);
      node = errorBox(e);
    }
    el.replaceChildren(node);
  });
  runHook('onRoute', r);
  // Focus follows navigation, so screen readers and keyboards start at the content.
  if (!firstRender) main().focus({ preventScroll: true });
  firstRender = false;
}

// --- chrome: sidebar drawer, banners, footer -----------------------------------------

function mountSidebar() {
  const aside = document.getElementById('sidebar');
  effect(() => {
    const node = chrome.sidebar.value;
    aside.replaceChildren(...(node ? [node] : []));
    document.body.classList.toggle('has-sidebar', !!node);
  });
  effect(() => {
    const open = chrome.drawerOpen.value;
    document.body.classList.toggle('drawer-open', open);
    if (open) aside.focus({ preventScroll: true });
  });
  document.getElementById('drawer-backdrop').addEventListener('click', () => { chrome.drawerOpen.value = false; });
  registerKey('Escape', () => { chrome.drawerOpen.value = false; }, { group: 'Always', when: () => chrome.drawerOpen.peek() });
}

function mountBanners() {
  effect(() => {
    if (storageFailed.value) {
      banner('storage', 'This browser won\'t let Olemmy save settings (private mode or blocked site data). Changes last until you close the tab.', { kind: 'warning' });
    }
  });
  effect(() => {
    if (loginExpired.value && account.value) {
      banner('expired', ['Your login has expired. ', h('a', { href: href('/login') }, 'Log in again'), '.'], { kind: 'warning' });
    } else {
      removeBanner('expired');
    }
  });
  watchForUpdates(() => {
    banner('update', ['A new version of Olemmy is available. ',
      h('button.link-button', { type: 'button', onclick: () => applyPendingUpdate() }, 'Reload')]);
  });
  // At the next route change with nothing unsaved, install it (§10a).
  beforeNavigate(() => {
    if (updatePending() && !hasOpenDraft()) applyPendingUpdate();
    return true;
  });
}

function mountFooter() {
  const footer = document.getElementById('footer');
  fill(footer,
    h('ul.footer-links',
      h('li', h('a', { href: href('/about') }, 'about')),
      h('li', h('a', { href: href('/settings') }, 'preferences')),
      h('li', h('a', { href: href('/instance') }, 'change instance')),
      h('li', h('a', { href: href('/communities') }, 'communities')),
      h('li', h('button.link-button', { type: 'button', onclick: () => document.dispatchEvent(new KeyboardEvent('keydown', { key: '?' })) }, 'keyboard shortcuts')),
      // A plain page of its own (reset.html), for when the app misbehaves.
      h('li', h('a', { href: 'reset.html' }, 'app not working? reset'))),
    h('p#copyright', '© 2026 Olemmy'),
    h('p.small', 'Olemmy is not affiliated with Lemmy. Content belongs to its authors and their instances.'));
  watchCopyright(document.getElementById('copyright'));
}

/** Footnote links and in-page anchors mustn't go through the hash router. */
function interceptAnchors() {
  document.addEventListener('click', (e) => {
    // Images in posts and comments: click for full size, again to shrink.
    const img = /** @type {HTMLElement} */ (e.target)?.closest?.('.md .md-img');
    if (img && !img.closest('a')) { img.classList.toggle('full'); return; }
    const a = /** @type {HTMLElement} */ (e.target)?.closest?.('a[href^="#"]');
    if (!a) return;
    const target = a.getAttribute('href').slice(1);
    if (target.startsWith('/')) return;
    e.preventDefault();
    const el = document.getElementById(target);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
    }
  });
}

// --- start ---------------------------------------------------------------------

/**
 * Unexpected errors from now on go to the error log (core/errors.js), shown
 * at #/errors; the header's warning icon says when there are new ones.
 */
function catchErrors() {
  // Caught before start-up by theme-init.js, but not enough to stop it.
  for (const m of window.olemmyErrors || []) if (!/^failed to load/.test(m)) reportError(new Error(m), 'start-up');
  window.addEventListener('error', (e) => {
    if (e.target && e.target !== window) return;   // a picture that didn't load
    if (ignorable(e.error, e.message || '', e.filename || '')) return;
    reportError(e.error || new Error(e.message), 'uncaught');
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    if (ignorable(r, String(r?.message || r || ''))) return;
    reportError(r instanceof Error ? r : Object.assign(new Error(String(r?.message || r)), r?.kind ? { kind: r.kind } : {}), 'unhandled');
  });
}

/** "Share → Olemmy" from another app: open a new post with what was shared (links.js shareToSubmit). */
function receiveShare() {
  const to = shareToSubmit(new URLSearchParams(location.search));
  if (to) history.replaceState(null, '', `${location.pathname}${to}`);
}

async function boot() {
  if (!supported()) {
    document.getElementById('main').replaceChildren(h('div.error-box',
      h('h1', 'Please update your browser'),
      h('p', 'Olemmy needs a recent version of Firefox, Chrome, Edge or Safari.')));
    return;
  }
  // An update found at startup reloads the page before the app appears.
  await updated;
  applyAppearance();
  mountHeader(document.getElementById('header'));
  mountSidebar();
  mountBanners();
  mountFooter();
  installMenus();
  catchErrors();
  interceptAnchors();
  startSession();
  startFeatures();
  effect(() => setCustomEmojis(site.value?.customEmojis));

  receiveShare();
  start(ROUTES);
  effect(() => {
    const r = route.value;
    if (r) render(r);
  });
  // Logging in or out, or switching instance, changes what every view shows.
  let lastApi = api.peek();
  effect(() => {
    const a = api.value;
    if (a === lastApi) return;
    lastApi = a;
    const r = route.peek();
    if (r) render(r);
  });
}

// For the Settings › Advanced button and debugging from the console.
window.olemmy = { refresh };
boot();
