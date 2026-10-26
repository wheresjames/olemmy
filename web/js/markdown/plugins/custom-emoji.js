// Inline rule: :shortcode: becomes the instance's custom emoji image, when
// the instance has one by that name. [getEmojis] returns a Map of
// shortcode -> { url, alt }, read at parse time so it follows the instance.

export function customEmoji(md, getEmojis) {
  md.inline.ruler.after('emphasis', 'custom_emoji', (state, silent) => {
    const { src, pos } = state;
    if (src[pos] !== ':') return false;
    const m = src.slice(pos).match(/^:([\w-]{1,64}):/);
    if (!m) return false;
    const emoji = getEmojis().get(m[1]);
    if (!emoji) return false;
    if (!silent) {
      const t = state.push('custom_emoji', 'img', 0);
      t.meta = { shortcode: m[1], url: emoji.url, alt: emoji.alt || m[1] };
    }
    state.pos += m[0].length;
    return true;
  });
}
