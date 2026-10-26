// Merging several communities' listings into one (client-side multis,
// §15 #5). Each community is a stream fetched a page at a time; a merged
// page takes the best head of all streams, repeatedly, refilling a stream
// when its buffer runs dry. Every stream that might still have posts must
// have one buffered before choosing, or the order would be wrong.

import { parseTime } from '../util/format.js';

/** Lemmy's hot rank, which v3 doesn't send: log of the score over time. */
export function hotRank(post, now = Date.now()) {
  const hours = Math.max(0, (now - parseTime(post.published)) / 3600000);
  return (10000 * Math.log10(Math.max(1, 3 + post.score))) / (hours + 2) ** 1.8;
}

/** The sorts multis can do, and how they compare posts (negative: a first). */
export const MERGE_SORTS = {
  Hot: (now) => (a, b) => hotRank(b, now) - hotRank(a, now),
  New: () => (a, b) => parseTime(b.published) - parseTime(a.published),
  Old: () => (a, b) => parseTime(a.published) - parseTime(b.published),
  // Every Top range compares by score; each community is asked for that range.
  Top: () => (a, b) => b.score - a.score || parseTime(b.published) - parseTime(a.published),
};

export function comparator(sort, now = Date.now()) {
  return (sort.startsWith('Top') ? MERGE_SORTS.Top : MERGE_SORTS[sort] || MERGE_SORTS.Hot)(now);
}

/**
 * @param {{ names: string[], fetch: (name: string, cursor?: string) => Promise<{ posts: any[], next: string|null }>,
 *           compare: (a: any, b: any) => number }} o
 */
export function createMerger({ names, fetch, compare }) {
  const streams = names.map((name) => ({ name, buffer: [], cursor: undefined, ended: false, error: null }));
  const seen = new Set();

  async function refill() {
    const dry = streams.filter((s) => !s.ended && !s.buffer.length);
    await Promise.all(dry.map(async (s) => {
      try {
        const r = await fetch(s.name, s.cursor);
        s.buffer.push(...r.posts.filter((p) => !seen.has(p.id)));
        s.cursor = r.next || undefined;
        if (!r.next || !r.posts.length) s.ended = true;
      } catch (e) {
        if (e?.kind === 'aborted') throw e;
        s.error = e;
        s.ended = true;
      }
    }));
  }

  return {
    streams,
    /** The next [count] posts in merged order; [done] when every stream is used up. */
    async next(count) {
      const out = [];
      while (out.length < count) {
        await refill();
        let best = null;
        for (const s of streams) if (s.buffer.length && (!best || compare(s.buffer[0], best.buffer[0]) < 0)) best = s;
        if (!best) break;
        const post = best.buffer.shift();
        if (seen.has(post.id)) continue;
        seen.add(post.id);
        out.push(post);
      }
      return { posts: out, done: streams.every((s) => s.ended && !s.buffer.length) };
    },
    errors() { return streams.filter((s) => s.error).map((s) => ({ name: s.name, error: s.error })); },
  };
}
