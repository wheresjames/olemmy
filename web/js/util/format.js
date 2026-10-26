// Dates, numbers and words.

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'always', style: 'long' });
const UNITS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "3 hours ago". Lemmy's timestamps are UTC, sometimes without a zone. */
export function timeAgo(iso, now = Date.now()) {
  const t = parseTime(iso);
  if (!t) return '';
  const secs = Math.round((t - now) / 1000);
  if (Math.abs(secs) < 60) return 'just now';
  for (const [unit, size] of UNITS) {
    if (Math.abs(secs) >= size) return rtf.format(Math.trunc(secs / size), unit);
  }
  return 'just now';
}

export function parseTime(iso) {
  if (!iso) return 0;
  const s = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

const full = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'long' });
/** The exact time, for a tooltip. */
export function fullDate(iso) {
  const t = parseTime(iso);
  return t ? full.format(t) : '';
}

const short = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
export function shortDate(iso) {
  const t = parseTime(iso);
  return t ? short.format(t) : '';
}

/** Account age, "2 years". */
export function age(iso, now = Date.now()) {
  const t = parseTime(iso);
  if (!t) return '';
  const secs = (now - t) / 1000;
  for (const [unit, size] of UNITS) {
    if (secs >= size) {
      const count = Math.floor(secs / size);
      return `${count} ${unit}${count === 1 ? '' : 's'}`;
    }
  }
  return 'less than a minute';
}

const compactFmt = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const plainFmt = new Intl.NumberFormat();
/** 12345 -> "12.3K" (score bubbles), exact below 10000. */
export function compact(n) {
  return Math.abs(n) < 10000 ? plainFmt.format(n) : compactFmt.format(n);
}
export function number(n) { return plainFmt.format(n); }

/** "1 comment", "3 comments". */
export function plural(n, one, many = `${one}s`) {
  return `${number(n)} ${n === 1 ? one : many}`;
}

/** Sort names as shown to people. */
export const SORT_LABELS = {
  Hot: 'hot', Active: 'active', Scaled: 'scaled', New: 'new', Old: 'old', Controversial: 'controversial',
  MostComments: 'most comments', NewComments: 'new comments',
  TopHour: 'past hour', TopSixHour: 'past 6 hours', TopTwelveHour: 'past 12 hours', TopDay: 'past day',
  TopWeek: 'past week', TopMonth: 'past month', TopThreeMonths: 'past 3 months', TopSixMonths: 'past 6 months',
  TopNineMonths: 'past 9 months', TopYear: 'past year', TopAll: 'all time',
};

/** Clip [text] to [max] characters at a word boundary. */
export function clip(text, max) {
  const s = String(text || '');
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20))}…`;
}
