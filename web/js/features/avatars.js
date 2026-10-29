// Avatars beside names in post and comment taglines. Off by default: each
// one is another image request, often to the user's own instance.

import { h } from '../core/h.js';
import { me } from '../state/session.js';
import { avatar } from '../components/common.js';
import { defineFeature } from './registry.js';

function decorate(node, item, own) {
  const wrap = node.querySelector(own);
  // The account's own "show avatars" setting wins (avatar() checks this browser's).
  if (!wrap || !item.creator || me.peek()?.settings.showAvatars === false) return;
  const img = avatar(item.creator.avatar, '', 'avatar.tagline-avatar');
  if (!img) return;
  // Gone (a dead instance, a deleted picture): no gap where it would be.
  img.addEventListener('error', () => img.remove(), { once: true });
  wrap.prepend(img);
}

export default defineFeature({
  id: 'avatars',
  name: 'Avatars beside names',
  category: 'Users',
  description: 'Show users\' avatars beside their names on posts and comments. Each avatar is another image to load, from the user\'s instance or yours.',
  defaultEnabled: false,
  keywords: 'avatar picture icon profile image',
  onPostRender(node, post) { decorate(node, post, '.tagline .author-wrap'); },
  onCommentRender(node, comment) { decorate(node, comment, ':scope > .comment-inner .tagline .author-wrap'); },
});
