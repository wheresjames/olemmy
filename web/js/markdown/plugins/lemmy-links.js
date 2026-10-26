// Inline rule: !community@instance and @user@instance become links to the
// app's own routes (#/c/name@host, #/u/name@host). A bare !community or
// @user (no host) is left alone, as Lemmy-UI does.

const NAME = /^[A-Za-z0-9_]{1,64}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;

/** Can a mention start at [pos]: not in the middle of a word or an email address. */
function boundary(src, pos) {
  if (pos === 0) return true;
  return !/[\w@./:!-]/.test(src[pos - 1]);
}

export function lemmyLinks(md) {
  md.inline.ruler.before('emphasis', 'lemmy_links', (state, silent) => {
    const { src, pos } = state;
    const sigil = src[pos];
    if (sigil !== '!' && sigil !== '@') return false;
    if (state.linkLevel > 0 || !boundary(src, pos)) return false;
    const m = src.slice(pos + 1).match(NAME);
    if (!m) return false;
    // Don't swallow a trailing dot from the end of a sentence.
    let name = m[0];
    while (name.endsWith('.') || name.endsWith('-')) name = name.slice(0, -1);
    if (!silent) {
      const kind = sigil === '!' ? 'c' : 'u';
      const open = state.push('link_open', 'a', 1);
      open.attrs = [['href', `#/${kind}/${name}`]];
      open.meta = { lemmy: kind };
      const text = state.push('text', '', 0);
      text.content = sigil + name;
      state.push('link_close', 'a', -1);
    }
    state.pos += 1 + name.length;
    return true;
  });
}
