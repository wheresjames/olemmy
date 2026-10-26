// Instance picker, login (with 2FA), signup (captcha, applications,
// email verification), and #/resolve for links from other instances.

import { h, add, fill } from '../core/h.js';
import { signal } from '../core/signal.js';
import { href, navigate } from '../core/router.js';
import { instance, site, siteError, chooseInstance, login, loadSite, api, hostOrUrl, loggedIn } from '../state/session.js';
import { validHost } from '../util/links.js';
import { LemmyV3 } from '../api/v3.js';
import { baseUrl, hostOf } from '../api/client.js';
import { errorBox, setTitle, spinner, mdBlock, postHref, commentHref } from '../components/common.js';
import { toast } from '../components/toast.js';

/** A few big general-purpose instances for the picker; any other can be typed in. */
export const POPULAR = ['lemmy.world', 'lemmy.ml', 'sh.itjust.works', 'lemmy.zip', 'programming.dev', 'feddit.org', 'lemmy.ca', 'lemmy.dbzer0.com', 'sopuli.xyz', 'lemmy.today'];

function plainChrome(ctx, text) {
  ctx.chrome.pageName.value = { text, href: location.hash };
  ctx.chrome.tabs.value = null;
  ctx.chrome.sidebar.value = null;
  setTitle(text);
}

export function instanceView(route, ctx) {
  plainChrome(ctx, 'choose an instance');
  const input = h('input#instance-input', { type: 'text', required: true, placeholder: 'lemmy.world', value: instance.peek() || '', autocomplete: 'url', inputmode: 'url', autocapitalize: 'off', spellcheck: false });
  const busy = signal(false);
  const error = signal(null);
  const ret = route.query.get('return') || '#/';

  const use = async (inst) => {
    error.value = null;
    busy.value = true;
    try {
      // Check that the instance answers before switching to it.
      await new LemmyV3(baseUrl(inst)).site({ fresh: true });
      chooseInstance(inst);
      navigate(ret);
    } catch (e) {
      error.value = e;
    } finally { busy.value = false; }
  };

  // #/instance?use=lemmy.world: a link to browse an instance in Olemmy. Asked, never switched silently.
  const suggested = (route.query.get('use') || '').trim().toLowerCase();
  const current = instance.peek() ? hostOf(instance.peek()) : '';
  let offer = null;
  if (validHost(suggested)) {
    if (suggested === current) {
      queueMicrotask(() => navigate(ret, { replace: true }));
    } else {
      offer = h('div.infobar.instance-offer', { role: 'note' },
        h('p', 'You followed a link to browse ', h('strong', suggested), ' in Olemmy.',
          loggedIn.peek() ? ' You\'ll browse it logged out; your accounts stay saved, in the menu under your name.' : ''),
        h('p.field-row',
          h('button.btn.btn-primary', { type: 'button', disabled: () => busy.value, onclick: () => use(suggested) }, () => (busy.value ? 'checking…' : `browse ${suggested}`)),
          current && h('a.btn', { href: ret }, `keep using ${site.peek()?.host || current}`)));
    }
  }

  return h('div.form-page.instance-page',
    offer,
    h('h1', 'Choose your Lemmy instance'),
    h('p', 'Olemmy runs in your browser and talks straight to the Lemmy instance you choose. Pick the one where you have an account, or any instance to browse.'),
    h('form', { onsubmit: (e) => { e.preventDefault(); use(input.value.trim()); } },
      h('label', { for: 'instance-input' }, 'instance address'),
      h('div.field-row', input, h('button.btn.btn-primary', { type: 'submit', disabled: () => busy.value }, () => (busy.value ? 'checking…' : 'use this instance')))),
    () => (error.value ? errorBox(error.value) : null),
    h('h2', 'popular instances'),
    h('ul.instance-list', POPULAR.map((i) => h('li', h('button.link-button', { type: 'button', onclick: () => use(i) }, i)))),
    h('p.small', 'Find more at ', h('a', { href: 'https://join-lemmy.org/instances', target: '_blank', rel: 'noopener noreferrer' }, 'join-lemmy.org'), '.'));
}

export function loginView(route, ctx) {
  plainChrome(ctx, 'log in');
  const ret = route.query.get('return') || '#/';
  const inst = h('input#login-instance', { type: 'text', required: true, value: instance.peek() || '', placeholder: 'lemmy.world', autocapitalize: 'off', spellcheck: false, list: 'instance-options' });
  const user = h('input#login-user', { type: 'text', required: true, autocomplete: 'username', autocapitalize: 'off', spellcheck: false });
  const pass = h('input#login-pass', { type: 'password', required: true, autocomplete: 'current-password' });
  const totp = h('input#login-totp', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', pattern: '[0-9]{6}', maxlength: 6 });
  const remember = h('input#login-remember', { type: 'checkbox', checked: true });
  const needTotp = signal(false);
  const busy = signal(false);
  const error = signal(null);

  // "name@instance" in the username box fills in the instance.
  user.addEventListener('change', () => {
    const m = user.value.match(/^@?([^@\s]+)@([\w.-]+\.\w+)$/);
    if (m) { user.value = m[1]; inst.value = m[2]; }
  });

  return h('div.form-page.login-page',
    h('h1', 'log in'),
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        error.value = null;
        busy.value = true;
        try {
          await login({ instance: inst.value.trim(), username: user.value.trim(), password: pass.value, totp: totp.value.trim(), remember: remember.checked });
          toast(`Logged in as ${user.value.trim()}`, { kind: 'success' });
          navigate(ret.startsWith('#/login') ? '#/' : ret);
        } catch (err) {
          if (err.code === 'missing_totp_token') { needTotp.value = true; requestAnimationFrame(() => totp.focus()); }
          error.value = err;
        } finally { busy.value = false; }
      },
    },
    h('label', { for: 'login-instance' }, 'instance'), inst,
    h('datalist#instance-options', POPULAR.map((i) => h('option', { value: i }))),
    h('label', { for: 'login-user' }, 'username or email'), user,
    h('label', { for: 'login-pass' }, 'password'), pass,
    h('div.field', { hidden: () => !needTotp.value }, h('label', { for: 'login-totp' }, 'two-factor code'), totp),
    h('label.checkbox', remember, ' remember me'),
    h('p.small', 'With "remember me" off, you stay logged in only until you close the browser.'),
    () => (error.value ? errorBox(error.value) : null),
    h('div.form-buttons', h('button.btn.btn-primary', { type: 'submit', disabled: () => busy.value }, () => (busy.value ? 'logging in…' : 'log in')))),
    h('p', 'New here? ', h('a', { href: href('/signup') }, 'Sign up'), '. Forgot your password? Reset it on ',
      h('a', { href: () => `${baseUrl(inst.value || instance.peek())}/login_reset`, target: '_blank', rel: 'noopener noreferrer' }, 'your instance\'s site'), '.'));
}

export function signupView(route, ctx) {
  plainChrome(ctx, 'sign up');
  const page = h('div.form-page.signup-page');
  const s = site.value;
  if (!s) {
    page.append(siteError.peek() ? errorBox(siteError.peek()) : spinner());
    loadSite().then(() => navigate(route.hash, { replace: true }));
    return page;
  }
  if (s.registrationMode === 'Closed') {
    page.append(h('h1', 'sign up'), h('p', `${s.host} is closed to new registrations. `, h('a', { href: href('/instance', { return: '#/signup' }) }, 'Choose another instance'), '.'));
    return page;
  }
  const user = h('input#su-user', { type: 'text', required: true, autocomplete: 'username', pattern: '[A-Za-z0-9_]{3,20}', autocapitalize: 'off', spellcheck: false });
  const email = h('input#su-email', { type: 'email', required: s.requireEmailVerification, autocomplete: 'email' });
  const pass = h('input#su-pass', { type: 'password', required: true, minlength: 10, maxlength: 60, autocomplete: 'new-password' });
  const pass2 = h('input#su-pass2', { type: 'password', required: true, minlength: 10, maxlength: 60, autocomplete: 'new-password' });
  const nsfw = h('input#su-nsfw', { type: 'checkbox' });
  const answer = h('textarea#su-answer', { rows: 5, required: s.registrationMode === 'RequireApplication' });
  // A field people can't see: bots fill it in, Lemmy then refuses.
  const honeypot = h('input.honeypot', { type: 'text', tabIndex: -1, autocomplete: 'off', 'aria-hidden': 'true', name: 'website' });
  const captchaAnswer = h('input#su-captcha', { type: 'text', autocomplete: 'off', autocapitalize: 'off' });
  const captcha = signal(null);
  const busy = signal(false);
  const error = signal(null);
  const done = signal('');

  const loadCaptcha = async () => {
    try { captcha.value = await api.peek().captcha(); } catch (e) { error.value = e; }
  };
  if (s.captchaEnabled) loadCaptcha();

  add(page,
    h('h1', `sign up on ${s.host}`),
    () => (done.value ? h('div.infobar', done.value) : null),
    h('form', {
      hidden: () => !!done.value,
      onsubmit: async (e) => {
        e.preventDefault();
        error.value = null;
        if (pass.value !== pass2.value) { error.value = new Error("The passwords don't match"); return; }
        busy.value = true;
        try {
          const r = await api.peek().register({
            username: user.value.trim(), password: pass.value, password_verify: pass2.value,
            email: email.value.trim() || undefined, show_nsfw: nsfw.checked,
            captcha_uuid: captcha.peek()?.uuid, captcha_answer: captchaAnswer.value.trim() || undefined,
            honeypot: honeypot.value || undefined, answer: answer.value.trim() || undefined,
          });
          if (r.jwt) {
            await login({ instance: hostOrUrl(instance.peek()), username: user.value.trim(), password: pass.value, remember: true }).catch(() => null);
            navigate('#/');
          } else {
            done.value = r.verify_email_sent ? 'Almost there: check your email for a link to verify your address, then log in.'
              : r.registration_created ? 'Your application was sent. You can log in once an admin approves it.'
                : 'Your account was created. You can log in now.';
          }
        } catch (err) {
          error.value = err;
          if (s.captchaEnabled) loadCaptcha();
        } finally { busy.value = false; }
      },
    },
    h('label', { for: 'su-user' }, 'username'), user,
    h('label', { for: 'su-email' }, s.requireEmailVerification ? 'email' : 'email (optional, for password resets)'), email,
    h('label', { for: 'su-pass' }, 'password (10 to 60 characters)'), pass,
    h('label', { for: 'su-pass2' }, 'password again'), pass2,
    s.registrationMode === 'RequireApplication' && [
      h('div.application-question', mdBlock(s.applicationQuestion || 'Tell the admins why you want to join.')),
      h('label', { for: 'su-answer' }, 'your answer'), answer,
    ],
    s.captchaEnabled && h('div.captcha', () => (captcha.value
      ? [h('img', { src: `data:image/png;base64,${captcha.value.png}`, alt: 'Captcha: type the characters you see' }),
        captcha.value.wav && h('audio', { controls: true, src: `data:audio/wav;base64,${captcha.value.wav}` }),
        h('button.link-button', { type: 'button', onclick: loadCaptcha }, 'new captcha')]
      : spinner()), h('label', { for: 'su-captcha' }, 'captcha'), captchaAnswer),
    honeypot,
    h('label.checkbox', nsfw, ' show NSFW content'),
    () => (error.value ? errorBox(error.value) : null),
    h('div.form-buttons', h('button.btn.btn-primary', { type: 'submit', disabled: () => busy.value }, () => (busy.value ? 'signing up…' : 'sign up')))),
    h('p.small', 'Signing up on another instance? ', h('a', { href: href('/instance', { return: '#/signup' }) }, 'Choose it first'), '.'));
  return page;
}

/**
 * #/resolve?q=<url or !name@host>: find a remote object through the home
 * instance and go to its local page (§15 #4).
 */
export function resolveView(route, ctx) {
  plainChrome(ctx, 'opening…');
  const q = route.query.get('q') || '';
  const box = h('div.form-page', spinner(`Looking up ${q} on ${hostOf(instance.peek())}…`));
  api.peek().resolve(q).then((r) => {
    if (r?.post) navigate(postHref(r.post), { replace: true });
    else if (r?.comment) navigate(commentHref(r.comment), { replace: true });
    else if (r?.community) navigate(href(`/c/${r.community.fullName}`), { replace: true });
    else if (r?.person) navigate(href(`/u/${r.person.fullName}`), { replace: true });
    else throw Object.assign(new Error('Not found'), { code: 'couldnt_find_object' });
  }).catch((e) => {
    if (e.kind === 'aborted') return;
    fill(box,
      h('h1', 'Not found here yet'),
      h('p', `${hostOf(instance.peek())} doesn't know this yet${e.kind === 'auth' || e.code === 'not_logged_in' ? ' (looking up remote content needs you to be logged in)' : ''}.`),
      /^https?:/.test(q) && h('p', h('a', { href: q, rel: 'noopener noreferrer', target: '_blank' }, 'Open it on its own instance'), '.'));
  });
  return box;
}
