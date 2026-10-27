// #/about: what Olemmy is, the disclaimer, and the privacy policy. Works
// before an instance is chosen. Keep the storage list in step with the app
// (every olemmy: key) and docs/security.md.

import { h } from '../core/h.js';
import { href } from '../core/router.js';
import { setTitle } from '../components/common.js';

export const CONTACT = 'olemmy@wheresjames.com';
const EFFECTIVE = 'October 27, 2026';

const section = (id, title, ...body) => h('section.doc-section', { 'aria-labelledby': id },
  h('h2.doc-section-title', { id }, title),
  h('div.doc-section-body', body));

const mail = () => h('a', { href: `mailto:${CONTACT}` }, CONTACT);

export function aboutView(route, { chrome }) {
  setTitle('about');
  chrome.pageName.value = { text: 'about', href: href('/about') };
  chrome.tabs.value = null;
  chrome.sidebar.value = null;

  return h('div.doc-page',
    h('h1', 'About Olemmy'),
    h('p.doc-intro', 'Olemmy is an old-school, information-dense web client for Lemmy: compact listings, nested comments, keyboard navigation, inline images, user tags and filters. It runs entirely in your browser and talks straight to the Lemmy instance you choose. There is no Olemmy account and no Olemmy server between you and your instance.'),

    section('about-disclaimer', 'disclaimer',
      h('p', 'Olemmy is not affiliated with Lemmy, its developers, or any Lemmy instance.'),
      h('p', 'Olemmy only displays what your instance sends it. Posts, comments, images and communities belong to their authors and the instances that host them. Olemmy doesn\'t host, review or moderate any of it. To report content, use "report" on it, which goes to that community\'s moderators and the instance\'s admins.'),
      h('p', 'Your Lemmy account, and everything you post, vote on or send, is held by your instance under its own rules and privacy policy.'),
      h('p', 'Olemmy is open-source software under the MIT License, provided "as is", without warranty of any kind. To the fullest extent permitted by law, Olemmy and its authors are not liable for any loss or damage arising from use of, or inability to use, this site. Links to other websites are provided for convenience; we don\'t control and aren\'t responsible for their content, availability or privacy practices.')),

    section('about-privacy', 'privacy policy',
      h('p', 'This policy covers this website and the Olemmy app that runs in your browser here.'),
      h('h3', 'Information we collect'),
      h('p', 'Olemmy doesn\'t collect, store or sell personal information. It has no sign-up of its own, no advertising, no trackers and no analytics. The server that delivers Olemmy\'s files may keep the standard logs web servers keep (address, time and file requested).'),
      h('h3', 'What goes to your instance'),
      h('p', 'Olemmy connects your browser directly to the Lemmy instance you choose. When you log in, browse, vote, post or send messages, that goes to your instance, as it would on the instance\'s own website, and never passes through us. Your instance\'s privacy policy covers it.'),
      h('h3', 'The instance list'),
      h('p', 'The "choose an instance" page loads its list of instances from Lemmyverse (lemmyverse.net), an independent directory, and each instance\'s icon from that instance. They can see your address, as with any web page, but not which page you were on. It\'s only loaded on that page.'),
      h('h3', 'Images, video and links'),
      h('p', 'Images and video in posts load from the sites that host them, which can see your address, as with any web page that shows their images. Olemmy asks your browser not to tell them which page you were on. Video players from other sites (YouTube, Vimeo and others) only load when you click them. For YouTube posts without a thumbnail, Olemmy shows YouTube\'s own still image, which loads from YouTube; you can turn that off under preferences › features › media.'),
      h('h3', 'Cookies and storage in your browser'),
      h('p', 'Olemmy doesn\'t use cookies. Your browser keeps these in its local storage, on your device:'),
      h('ul',
        h('li', 'your preferences, which instance you use, and the instances you star;'),
        h('li', 'your login for each account you add: a token from your instance, kept until you log out, or only until you close the browser if you turn off "remember me";'),
        h('li', 'your favorites, filters, community shortcuts, user tags, saved searches and unsent drafts;'),
        h('li', 'which threads you\'ve visited and which comments you collapsed, to highlight new comments and keep your place;'),
        h('li', 'for the open tab only, which posts and comments you\'ve seen, so their links open without asking your instance again;'),
        h('li', 'a log of unexpected errors (the latest 50), shown at Olemmy\'s errors page; it leaves your browser only if you copy or share it;'),
        h('li', 'a copy of the app\'s own files, so it can update itself and open without a connection.')),
      h('p', 'These stay in your browser and are never sent to us. "Export settings" saves them to a file you keep; it leaves your logins out unless you choose to include them. Logging out or clearing your browser\'s site data removes them.'),
      h('h3', 'Notifications'),
      h('p', 'If you turn on browser notifications, Olemmy shows them itself, from your instance\'s inbox. No notification service is involved.'),
      h('h3', 'Children'),
      h('p', 'Olemmy isn\'t made for children. Each Lemmy instance sets its own age requirements.'),
      h('h3', 'Contacting us'),
      h('p', 'If you email us, your email provider sends the information you choose to include. We use it only to read and reply to your message, and don\'t sell it or use it for marketing.'),
      h('h3', 'Changes to this policy'),
      h('p', 'We may update this page if Olemmy or its privacy practices change. Any revision will be posted here with a new effective date.'),
      h('p', 'Questions about this policy can be sent to ', mail(), '.'),
      h('p.doc-date', `Effective ${EFFECTIVE}`)),

    h('p.doc-links', h('a', { href: href('/settings') }, 'preferences'), ' · ', mail()));
}
