// Up/down arrows with the score between them (the "midcol").
// The downvote arrow is left out when the instance disables downvotes.

import { h, icon } from '../core/h.js';
import { site } from '../state/session.js';
import { settings } from '../state/settings.js';
import { compact } from '../util/format.js';

/**
 * @param {{ myVote: any, score: any, upvotes: any, downvotes: any }} state  signals
 * @param {(dir: 1|-1) => void} onVote
 * @param {{ layout?: 'stacked'|'inline', label?: string, disabled?: string }} [opts]  [disabled]: why voting is off
 */
export function voteArrows(state, onVote, { layout = 'stacked', label = 'post', disabled = '' } = {}) {
  const showScore = () => settings.value.showScores !== false;
  const tooltip = () => `${compact(state.upvotes.value)} up, ${compact(state.downvotes.value)} down`;
  return h(`div.midcol.vote-${layout}`, {
    class: { likes: () => state.myVote.value === 1, dislikes: () => state.myVote.value === -1 },
  },
  h('button.arrow.up', {
    type: 'button',
    'aria-label': `Upvote ${label}`,
    'aria-pressed': () => String(state.myVote.value === 1),
    disabled: !!disabled,
    title: disabled || undefined,
    onclick: () => onVote(1),
    dataset: { vote: 'up' },
  }, icon('up')),
  h('div.score', { title: tooltip, hidden: () => !showScore() }, () => compact(state.score.value)),
  () => (site.value?.enableDownvotes === false ? null : h('button.arrow.down', {
    type: 'button',
    'aria-label': `Downvote ${label}`,
    'aria-pressed': () => String(state.myVote.value === -1),
    disabled: !!disabled,
    title: disabled || undefined,
    onclick: () => onVote(-1),
    dataset: { vote: 'down' },
  }, icon('down'))));
}
