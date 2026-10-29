// The demo's world (docs/demo.md): instances, users, communities, posts,
// comments, an inbox and some moderation history, made from a seed with a
// small random number generator, so it comes out the same every time (only
// the times move: they're relative to when it's made).
//
// The writing is plain made-up chatter, put together from the phrases below.
// Posts and comments tagged German, French, Japanese or Spanish are written
// in that language, so the language labels show something true.
//
// Plain data, kept in localStorage as JSON: ids refer to each other, times
// are milliseconds, and pictures are asset names (resolved to addresses when
// they're served, since the page's origin isn't part of the world).

import { THREADS } from './threads.js';

export const WORLD_VERSION = 5;
const SEED = 20261029;

export const LANG = { und: 0, de: 32, en: 37, eo: 38, es: 39, fi: 44, fr: 47, it: 72, ja: 74, nl: 115, pl: 128, pt: 130, sv: 153, uk: 170 };
export const LANGUAGES = [
  [0, 'und', 'Undetermined'], [32, 'de', 'Deutsch'], [37, 'en', 'English'], [38, 'eo', 'Esperanto'], [39, 'es', 'Español'],
  [44, 'fi', 'suomi'], [47, 'fr', 'Français'], [72, 'it', 'Italiano'], [74, 'ja', '日本語'], [115, 'nl', 'Nederlands'],
  [128, 'pl', 'Polski'], [130, 'pt', 'Português'], [153, 'sv', 'Svenska'], [170, 'uk', 'Українська'],
];

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const YEAR = 365 * DAY;

/** mulberry32: a small, good-enough seeded generator. */
function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  const pick = (list) => list[Math.floor(next() * list.length)];
  const chance = (p) => next() < p;
  return { next, int, pick, chance };
}

// --- the writing ------------------------------------------------------------------

/** "{thing}" in a template takes one of FILL.thing. */
const FILL = {
  thing: ['sourdough starter', 'bike commute', 'balcony garden', 'old laptop', 'reading list', 'morning routine', 'standing desk', 'tomato plants', 'camera bag', 'notebook system', 'home network', 'herb shelf'],
  place: ['the coast', 'the old harbor', 'the hills behind town', 'a quiet lake', 'the city park', 'the train station', 'the market square', 'a forest trail'],
  tool: ['text editor', 'password manager', 'feed reader', 'static site generator', 'note-taking app', 'photo library', 'calendar', 'music library'],
  dish: ['lentil soup', 'flatbread', 'mushroom risotto', 'banana bread', 'tomato salad', 'vegetable curry', 'apple crumble', 'cold noodles'],
  plant: ['basil', 'tomatoes', 'chillies', 'strawberries', 'lavender', 'courgettes', 'mint', 'sunflowers'],
  weather: ['fog', 'golden hour light', 'the first snow', 'a summer storm', 'low clouds', 'a clear night'],
};

const TITLES = {
  general: ['What small change made your week better?', 'Finally fixed my {thing}', 'Unpopular opinion: {thing}s are overrated', 'Anyone else trying to read more this year?', 'A walk to {place} this morning', 'What are you working on this weekend?', 'Tell me about your favourite {thing}', 'I spent a month without social media. Here\'s what happened', 'Small wins thread', 'What\'s a skill you picked up recently?'],
  photography: ['{weather} over {place}', 'Morning at {place}', 'Tried long exposure for the first time', 'My grandmother\'s garden', 'Shot on an old film camera', 'Reflections after the rain', 'A quiet street at dusk', 'First attempt at astrophotography', 'Colours of autumn near {place}'],
  technology: ['Switching to a new {tool} after ten years', 'Why I self-host my own {tool}', 'A beginner\'s guide to backups', 'The case for boring technology', 'How I keep my {tool} in sync across devices', 'What\'s in your terminal setup?', 'Accessibility is a feature, not an extra', 'Small websites are good, actually', 'Lessons from a year of running my own {tool}'],
  ask: ['How do you stay motivated on long projects?', 'What\'s the best advice you got from a stranger?', 'How do you organise your {thing}?', 'Is it worth learning to cook properly?', 'What book changed how you think?', 'How do you deal with a noisy neighbour?', 'What would you tell yourself ten years ago?', 'Tips for a first trip to {place}?', 'What\'s your way of keeping a {thing} going?'],
  scary_stories: ['The house at the end of the lane', 'Footsteps in the attic', 'Something in the lake', 'The night the radio kept talking', 'A knock at three in the morning', 'The photograph that changed', 'The lighthouse keeper\'s last log'],
  announcements: ['Things to try in the demo', 'Community guidelines', 'Scheduled maintenance this weekend', 'New communities this month'],
  gardening: ['My {plant} are finally thriving', 'What\'s eating my {plant}?', 'Balcony garden, year two', 'When do you plant {plant} where you live?', 'Compost: what goes in and what doesn\'t', 'Seed swap this weekend', 'First harvest of the year'],
  recipes: ['Easy weeknight {dish}', 'My family\'s {dish}', 'How do you make {dish} not boring?', '{dish} for a crowd', 'The {dish} that won me over', 'Budget meals: {dish}', 'What goes well with {dish}?'],
};

const SENTENCES = {
  general: ['I keep coming back to this idea.', 'It took a while, but it was worth it.', 'Honestly it was easier than I expected.', 'I wrote down what I did each day, which helped more than I thought.', 'My neighbour gave me the idea.', 'It\'s not for everyone, but it worked for me.', 'The hardest part was the first week.', 'I\'d love to hear how other people do it.'],
  photography: ['Shot handheld, no edits apart from a slight crop.', 'I waited about an hour for the light to change.', 'The fog lifted ten minutes later.', 'Taken with a fifty millimetre lens.', 'This is my favourite spot in town.', 'I\'m still learning, so feedback is welcome.'],
  technology: ['It\'s been running for a year without a hiccup.', 'The setup took an afternoon.', 'I wish I\'d done it sooner.', 'The documentation was better than I expected.', 'Plain text files have outlived every app I\'ve used.', 'The main thing is having a backup you\'ve actually tested.', 'Keep it simple and it keeps working.'],
  ask: ['I\'m asking because I\'ve been stuck for a while.', 'Any advice welcome, big or small.', 'I\'ve tried a few things and nothing has stuck yet.', 'Curious what works for other people.', 'No wrong answers here.'],
  scary_stories: ['Nobody had lived there for years.', 'The lights flickered once, then went out.', 'I told myself it was the wind.', 'When I looked again, it was gone.', 'We never went back after that night.', 'The dog wouldn\'t go near the door.'],
  announcements: ['Everything here is made up, and it stays in your browser.', 'Try voting, replying, saving and subscribing.', 'Use the DEMO button to become a moderator or an admin.', 'Reset puts everything back the way it was.'],
  gardening: ['They get about six hours of sun a day.', 'I water every other morning.', 'Last year I planted them far too early.', 'Coffee grounds went into the soil this time.', 'The slugs found them first.', 'Next year I\'ll start them indoors.'],
  recipes: ['It takes about thirty minutes, most of it hands-off.', 'A squeeze of lemon at the end makes all the difference.', 'It keeps well for a few days in the fridge.', 'I use whatever vegetables are left at the end of the week.', 'Toast the spices first.', 'Leftovers are even better the next day.'],
};

const COMMENT = {
  open: ['Great post!', 'This is so true.', 'Thanks for sharing this.', 'I had the same experience.', 'Interesting point.', 'Not sure I agree, but', 'Ha, this made my day.', 'Came here to say this.', 'Good question.', 'Love this.', 'Hmm,', 'Same here.', ''],
  middle: ['I tried something similar last year and it worked better than I expected.', 'The part about starting small is what made it click for me.', 'Do you have a link where I can read more?', 'My experience was the opposite, oddly enough.', 'I think it depends a lot on where you live.', 'This is the kind of thing I come here for.', 'I\'ve been meaning to try this for ages.', 'It took me a few attempts to get right.', 'Saving this for later.', 'The second photo is my favourite.', 'My grandfather used to say the same thing.', 'That\'s a really good way to put it.', 'I\'d add one thing: be patient with it.', 'Can confirm, it really does help.', 'I disagree a little, but I see where you\'re coming from.', 'What would you do differently next time?', 'This deserves more upvotes.', 'I did this once and never looked back.', 'Honestly, the simple version is usually the best one.', 'That\'s fair, I hadn\'t thought of it that way.'],
  close: ['Thanks!', 'Would love to hear how it goes.', 'Just my two cents.', 'Keep it up.', 'Good luck!', '', '', ''],
};

/** Titles, body sentences and comments in the other languages the demo tags. */
const FOREIGN = {
  [LANG.de]: {
    titles: ['Endlich wieder Sonne', 'Mein erster Sauerteig', 'Was lest ihr gerade?', 'Tipps für den Balkongarten?', 'Ein Spaziergang am Hafen'],
    sentences: ['Das hat besser geklappt als gedacht.', 'Ich probiere das seit ein paar Wochen.', 'Hat jemand ähnliche Erfahrungen?', 'Danke fürs Teilen!', 'Das sehe ich genauso.', 'Gute Frage, die habe ich mir auch schon gestellt.', 'Bei mir war es genau umgekehrt.', 'Sehr schön geworden!', 'Das muss ich auch mal ausprobieren.', 'Kommt ganz darauf an, finde ich.'],
  },
  [LANG.fr]: {
    titles: ['Une belle journée au bord du lac', 'Ma recette de soupe préférée', 'Vous lisez quoi en ce moment ?', 'Premier potager sur le balcon'],
    sentences: ['C\'était plus simple que prévu.', 'Merci pour le partage !', 'Je suis tout à fait d\'accord.', 'Quelqu\'un a déjà essayé ?', 'Très belle photo.'],
  },
  [LANG.ja]: {
    titles: ['今朝の散歩', '初めてのパン作り', 'おすすめの本はありますか？', 'ベランダ菜園を始めました'],
    sentences: ['思ったより簡単でした。', '共有してくれてありがとう！', '私も同じ経験があります。', 'とても素敵な写真ですね。', '試してみます。'],
  },
  [LANG.es]: {
    titles: ['Un paseo por el puerto', 'Mi receta favorita de lentejas', '¿Qué estáis leyendo?', 'Mi primer huerto en el balcón'],
    sentences: ['Fue más fácil de lo que pensaba.', '¡Gracias por compartir!', 'Estoy totalmente de acuerdo.', '¿Alguien lo ha probado?', 'Qué foto tan bonita.'],
  },
};

function writer(r) {
  const fill = (s) => s.replace(/\{(\w+)\}/g, (_, k) => r.pick(FILL[k]));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const title = (topic, lang) => (FOREIGN[lang] ? r.pick(FOREIGN[lang].titles) : fill(r.pick(TITLES[topic])));
  const sentences = (topic, lang, k) => {
    const pool = FOREIGN[lang]?.sentences || [...SENTENCES[topic], ...SENTENCES.general];
    return Array.from({ length: k }, () => r.pick(pool)).filter((s, i, all) => all.indexOf(s) === i).join(' ');
  };
  /** A post's text: a paragraph or a few, now and then a list, a quote, code, a link or a spoiler. */
  const body = (topic, lang, paragraphs) => {
    if (FOREIGN[lang]) return sentences(topic, lang, r.int(2, 4));
    const out = [];
    for (let i = 0; i < paragraphs; i++) {
      const roll = r.next();
      if (roll < 0.1) out.push(Array.from({ length: r.int(2, 4) }, () => `- ${r.pick(SENTENCES[topic])}`).filter((s, j, all) => all.indexOf(s) === j).join('\n'));
      else if (roll < 0.16) out.push(`> ${r.pick(SENTENCES.general)}`);
      else if (roll < 0.2 && topic === 'technology') out.push('```\nrsync -av --delete ~/notes/ backup:/notes/\n```');
      else if (roll < 0.24) out.push(`${r.pick(SENTENCES[topic])} There's more about it [on this page](https://example.com/${topic}).`);
      else if (roll < 0.27) out.push(`::: spoiler How it ended\n${r.pick(SENTENCES[topic])}\n:::`);
      else if (roll < 0.33) out.push(`**Update:** ${r.pick(SENTENCES[topic])}`);
      else out.push(sentences(topic, lang, r.int(2, 4)));
    }
    return out.join('\n\n');
  };
  const comment = (lang) => {
    if (FOREIGN[lang]) return Array.from({ length: r.int(1, 2) }, () => r.pick(FOREIGN[lang].sentences)).filter((s, i, all) => all.indexOf(s) === i).join(' ');
    const parts = [r.pick(COMMENT.open), r.pick(COMMENT.middle)];
    if (r.chance(0.35)) parts.push(r.pick(COMMENT.middle));
    parts.push(r.pick(COMMENT.close));
    const s = parts.filter(Boolean).filter((p, i, all) => all.indexOf(p) === i).join(' ').replace(/^(Not sure I agree, but|Hmm,) (.)/, (_, a, b) => `${a} ${b.toLowerCase()}`);
    return cap(s);
  };
  return { title, body, comment, sentences };
}

/** A language tag: mostly English, some others, some undetermined (written in English). */
function language(r) {
  const x = r.next();
  if (x < 0.62) return LANG.en;
  if (x < 0.7) return LANG.de;
  if (x < 0.74) return LANG.fr;
  if (x < 0.77) return LANG.ja;
  if (x < 0.8) return LANG.es;
  return LANG.und;
}

// --- who and where ----------------------------------------------------------------

const PEOPLE = [
  // name, display name, instance, extras
  ['visitor', 'Visitor', 1, { bio: 'This is you, in the demo. Change your role with the DEMO button.', avatar: 'avatar-8' }],
  ['site_admin', 'Site Admin', 1, { bio: 'Keeps the lights on.', avatar: 'avatar-3', banner: 'cover-2', admin: true }],
  ['alba', 'Alba', 1, { avatar: 'avatar-1', bio: 'Photos, mostly. Film when I can afford it.' }],
  ['brightfern', 'Bright Fern', 1, { avatar: 'avatar-2', banner: 'cover-1', bio: 'Gardener, reader, slow cyclist.' }],
  ['cobalt_owl', '', 1, { bio: 'Self-hosting everything I can.' }],
  ['dune_walker', 'Dune Walker', 1, { avatar: 'avatar-4', bio: 'Walks. Writes about walking.' }],
  ['ember', 'Ember', 1, { avatar: 'avatar-5', bio: 'Tells stories after dark.' }],
  ['fjord', '', 1, {}],
  ['grove_keeper', 'Grove Keeper', 1, { avatar: 'avatar-6', banner: 'cover-3', bio: 'Moderator of a few places. Be kind.' }],
  ['harbor_light', 'Harbor Light', 1, { bio: 'Lives by the sea, posts about it.' }],
  ['iris', 'Iris', 1, { avatar: 'avatar-7', bio: 'Asks too many questions.' }],
  ['juniper', '', 1, { cakeToday: true, bio: 'It might be my cake day.' }],
  ['kestrel', 'Kestrel', 1, { avatar: 'avatar-1' }],
  ['lumen', 'Lumen', 1, {}],
  ['maple_drift', 'Maple Drift', 1, { avatar: 'avatar-2', bio: 'Bakes bread, mostly successfully.' }],
  ['digest_bot', 'Weekly Digest', 1, { bot: true, bio: 'I post the weekly thread.' }],
  ['quill', 'Quill', 2, { avatar: 'avatar-4', bio: 'Gardening on beta.' }],
  ['rook', '', 2, {}],
  ['sorrel', 'Sorrel', 3, { avatar: 'avatar-5', bio: 'Cooks for a big family.' }],
  ['tidepool', 'Tidepool', 3, {}],
  // The regulars of the showcase threads (threads.js).
  ['euler_fan', 'Euler Fan', 1, { avatar: 'avatar-6', bio: 'Proofs, puzzles and too much coffee.' }],
  ['prime_suspect', 'Prime Suspect', 1, { avatar: 'avatar-3', bio: 'Number theory and bad puns.' }],
  ['riddler', 'The Riddler', 1, { avatar: 'avatar-7', banner: 'cover-3', bio: 'Ask me a question and I\'ll answer with a riddle.' }],
  ['lab_coat', 'Lab Coat', 1, { avatar: 'avatar-2', bio: 'Physics teacher. Says "but why?" for a living.' }],
  ['archivist', 'The Archivist', 2, { avatar: 'avatar-5', bio: 'History of science, footnotes included.' }],
  ['byte_wrangler', 'Byte Wrangler', 1, { avatar: 'avatar-4', bio: 'Programmer. Has opinions about units.' }],
];

const COMMUNITIES = [
  // name, title, instance, icon, cover, extras
  ['general', 'General Chat', 1, 'icon-1', 'cover-1', { subscribers: 1840, kind: 'mixed', mods: ['grove_keeper'], about: 'Anything goes, within reason. Introduce yourself, share something small, ask a question.' }],
  ['photography', 'Photography', 1, 'icon-2', 'cover-2', { subscribers: 960, kind: 'photos', mods: ['alba'], about: 'Photos you took yourself, and talk about taking them.' }],
  ['technology', 'Technology', 1, 'icon-3', null, { subscribers: 1320, kind: 'links', mods: ['cobalt_owl'], about: 'Software, hardware and the web, without the hype.' }],
  ['ask', 'Ask the Community', 1, 'icon-4', 'cover-3', { subscribers: 610, kind: 'text', mods: ['grove_keeper', 'iris'], about: 'Ask anything. Answer kindly.' }],
  ['scary_stories', 'Scary Stories', 1, 'icon-5', null, { subscribers: 230, kind: 'text', nsfw: true, mods: ['ember'], about: 'Marked NSFW so you can try Olemmy\'s NSFW settings. The stories are mild.' }],
  ['announcements', 'Announcements', 1, 'icon-6', null, { subscribers: 2400, kind: 'text', restricted: true, mods: ['site_admin'], about: 'News about this instance. Only moderators can post here.' }],
  ['gardening', 'Gardening', 2, 'icon-7', 'cover-1', { subscribers: 540, kind: 'mixed', mods: ['quill'], about: 'Gardens of every size, from window boxes up. On another instance, to show how remote communities look.' }],
  ['recipes', 'Recipes', 3, 'icon-8', null, { subscribers: 780, kind: 'text', mods: ['sorrel'], about: 'Food you actually cook. On another instance too.' }],
  // The showcase communities: their posts are the hand-written threads.
  ['math', 'Math Puzzles', 1, 'icon-3', 'cover-2', { subscribers: 2150, kind: 'showcase', mods: ['euler_fan'], about: 'Classic and curious maths problems. Show your working, and put full solutions in spoilers.' }],
  ['riddles', 'Riddles', 1, 'icon-8', 'cover-3', { subscribers: 1670, kind: 'showcase', mods: ['riddler'], about: 'Riddles and logic puzzles. Answers in spoilers, always: `::: spoiler answer` … `:::`.' }],
  ['history_of_science', 'History of Science', 2, 'icon-6', 'cover-1', { subscribers: 1290, kind: 'showcase', mods: ['archivist'], about: 'How we found things out. Sources welcome, myths debunked. On another instance, to show remote communities.' }],
  ['ask_science', 'Ask a Scientist', 1, 'icon-2', null, { subscribers: 1980, kind: 'showcase', mods: ['lab_coat'], about: 'Ask a question about how the world works. Answers should explain, not just assert.' }],
  ['programming', 'Programming', 1, 'icon-7', 'cover-2', { subscribers: 2310, kind: 'showcase', mods: ['byte_wrangler', 'cobalt_owl'], about: 'Code, bugs, and the stories behind them. Explain like you\'re helping a colleague.' }],
];

const YOUTUBE = ['aqz-KE-bpKQ', 'YE7VzlLtp-4', 'eRsGyueVLvQ', 'TLkA0RELQ1g'];
const SITES = ['example.com', 'example.org', 'example.net'];

// --- the world -------------------------------------------------------------------------

/** A new world, with times relative to [now]. */
export function makeWorld(now = Date.now()) {
  const r = rng(SEED);
  const W = writer(r);
  const w = {
    version: WORLD_VERSION,
    createdAt: now,
    seq: { post: 1000, comment: 20000, message: 500, report: 300, modlog: 700 },
    instances: [
      { id: 1, domain: 'demo.olemmy.invalid' },
      { id: 2, domain: 'beta.olemmy.invalid' },
      { id: 3, domain: 'gamma.olemmy.invalid' },
    ],
    persons: [], communities: [], posts: [], comments: [], messages: [], reports: [], modlog: [], bans: [],
    me: {
      id: 1, role: 'user', moderates: [],
      votes: { post: {}, comment: {} }, saved: { post: {}, comment: {} }, hidden: {}, read: {},
      follows: {}, blocks: { community: {}, person: {}, instance: {} },
      inboxRead: { reply: {}, mention: {} },
      settings: { show_nsfw: false, blur_nsfw: true, show_scores: true, show_avatars: true, show_bot_accounts: true, show_read_posts: true, default_sort_type: 'Active', default_listing_type: 'Local', auto_expand: false, open_links_in_new_tab: false, send_notifications_to_email: false, email: 'visitor@example.invalid' },
      discussionLanguages: [],
    },
  };

  // --- people ---
  PEOPLE.forEach(([name, displayName, instance, x], i) => {
    let published = now - r.int(30, 5 * 365) * DAY - r.int(0, 23) * HOUR;
    if (x.cakeToday) published = now - 3 * YEAR - DAY / 4;  // its anniversary is today (or very nearly)
    if (name === 'visitor') published = now - 2 * YEAR - 40 * DAY;
    w.persons.push({
      id: i + 1, name, displayName, instanceId: instance, published, bio: x.bio || '',
      avatar: x.avatar || null, banner: x.banner || null,
      bot: !!x.bot, admin: !!x.admin, banned: false, deleted: false,
    });
  });
  const personId = (name) => w.persons.find((p) => p.name === name).id;
  const others = w.persons.filter((p) => p.id !== 1 && !p.bot);

  // --- communities ---
  COMMUNITIES.forEach(([name, title, instance, icon, cover, x], i) => {
    w.communities.push({
      id: 100 + i, name, title, instanceId: instance, icon, banner: cover,
      description: `${x.about}\n\n**Rules**\n\n1. Be kind.\n2. Stay on topic.\n3. No spam or self-promotion.`,
      nsfw: !!x.nsfw, restricted: !!x.restricted, kind: x.kind,
      published: now - r.int(200, 900) * DAY, subscribers: x.subscribers,
      mods: x.mods.map(personId),
      removed: false, deleted: false, hidden: false,
    });
  });
  const community = (name) => w.communities.find((c) => c.name === name);
  for (const n of ['general', 'technology', 'gardening', 'announcements', 'math', 'riddles', 'history_of_science', 'ask_science', 'programming']) w.me.follows[community(n).id] = true;
  w.me.moderates = [community('ask').id, community('photography').id];

  // --- posts ---
  const weights = { general: 30, photography: 22, technology: 26, ask: 22, scary_stories: 8, announcements: 3, gardening: 18, recipes: 16 };
  const bag = Object.entries(weights).flatMap(([n, k]) => Array(k).fill(n));
  for (let i = 0; i < 150; i++) {
    const c = community(r.pick(bag));
    const topic = c.name;
    const creator = c.restricted ? personId('site_admin') : (r.chance(0.02) ? 1 : r.pick(others).id);
    const age = Math.floor((r.next() ** 1.8) * 21 * DAY);
    const kind = c.kind === 'mixed' ? r.pick(['text', 'link', 'photos', 'video', 'text']) : c.kind;
    const languageId = c.restricted ? LANG.en : language(r);
    const p = {
      id: ++w.seq.post, communityId: c.id, creatorId: creator,
      // A picture gets a picture's title, wherever it's posted.
      name: W.title(kind === 'photos' ? 'photography' : topic, languageId), body: '', url: null, image: null, thumbnail: null, urlContentType: '',
      embedTitle: '', embedDescription: '', embedVideoUrl: null, altText: '',
      published: now - age, updated: r.chance(0.1) ? now - age + r.int(1, 120) * 60e3 : null,
      languageId, nsfw: c.nsfw, locked: false, removed: false, deleted: false,
      featuredCommunity: false, featuredLocal: false,
      up: Math.max(1, Math.floor((r.next() ** 2.2) * 420)), down: 0,
    };
    p.down = Math.floor(p.up * r.next() * 0.25);
    if (kind === 'photos' || (kind === 'links' && r.chance(0.15))) {
      p.image = `photo-${r.int(1, 8)}`;
      p.altText = r.chance(0.6) ? 'A landscape: hills under a pale sky, with the sun low' : '';
      if (r.chance(0.3)) p.body = W.sentences(topic === 'technology' ? 'photography' : topic, languageId, r.int(1, 2));
    } else if (kind === 'links') {
      const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'article';
      p.url = `https://${r.pick(SITES)}/${r.pick(['articles', 'blog', 'notes'])}/${slug}`;
      p.thumbnail = r.chance(0.7) ? `photo-${r.int(1, 8)}` : null;
      p.embedTitle = p.name;
      p.embedDescription = W.sentences(topic, languageId, 2);
      if (r.chance(0.3)) p.body = W.sentences(topic, languageId, r.int(1, 3));
    } else if (kind === 'video') {
      const id = r.pick(YOUTUBE);
      p.url = `https://www.youtube.com/watch?v=${id}`;
      p.embedTitle = p.name;
      p.embedVideoUrl = `https://www.youtube.com/embed/${id}`;
    } else {
      p.body = W.body(topic, languageId, r.int(1, 3));
    }
    w.posts.push(p);
  }
  // The welcome post, the weekly thread, a locked post, and one of yours.
  const inCommunity = (name) => w.posts.filter((p) => p.communityId === community(name).id);
  const ann = inCommunity('announcements')[0];
  if (ann) {
    Object.assign(ann, {
      name: 'Welcome to the Olemmy demo', featuredLocal: true, featuredCommunity: true, image: null, url: null, thumbnail: null,
      body: 'This is a pretend Lemmy instance that runs inside Olemmy, in your browser. The people, posts and comments are all made up, and nothing you do here is sent anywhere.\n\nSome things to try:\n\n- Vote, reply, save and subscribe\n- Open a post and collapse a thread\n- Try **gallery** and **videos** above a listing\n- Hover over a name to see the user\'s card\n- Use the **DEMO** button to become a moderator or an admin, and look at the reports queue\n\nWhen you\'re done, **leave the demo** at the top of the page to choose a real instance.',
    });
  }
  const general = inCommunity('general');
  if (general[0]) Object.assign(general[0], { featuredCommunity: true, creatorId: personId('digest_bot'), name: 'Weekly open thread', languageId: LANG.en, image: null, url: null, thumbnail: null, body: 'Talk about anything here. What have you been up to this week?' });
  if (general[3]) general[3].locked = true;
  const mineFirst = w.posts.find((p) => p.creatorId === 1);
  if (mineFirst) Object.assign(mineFirst, { name: 'My first post here', languageId: LANG.en });

  // --- comments ---
  const byPost = new Map();
  for (const p of w.posts) {
    const n = p.featuredCommunity && p.creatorId === personId('digest_bot') ? 130 : Math.floor((r.next() ** 2.4) * 40);
    const list = [];
    for (let i = 0; i < n; i++) {
      const parent = list.length && r.chance(0.62) ? r.pick(list.filter((c) => c.depth < 8)) : null;
      const after = parent ? parent.published : p.published;
      const published = Math.min(now - 60e3, after + Math.floor((r.next() ** 2) * Math.max(60e3, (now - after) * 0.6)));
      const languageId = r.chance(0.85) ? p.languageId : language(r);
      const c = {
        id: ++w.seq.comment, postId: p.id, creatorId: r.chance(0.015) ? 1 : r.pick(others).id,
        path: parent ? `${parent.path}.${w.seq.comment}` : `0.${w.seq.comment}`, depth: parent ? parent.depth + 1 : 0,
        content: W.comment(languageId),
        published, updated: r.chance(0.06) ? published + r.int(1, 90) * 60e3 : null,
        languageId, removed: r.chance(0.012), deleted: r.chance(0.02), distinguished: false,
        up: Math.max(1, Math.floor((r.next() ** 2.5) * 120)), down: 0,
      };
      c.down = Math.floor(c.up * r.next() * 0.3);
      list.push(c);
    }
    byPost.set(p.id, list);
    w.comments.push(...list);
  }
  // A distinguished moderator comment.
  const top = (byPost.get(general[0]?.id) || []).find((c) => c.depth === 0);
  if (top) Object.assign(top, { creatorId: personId('grove_keeper'), distinguished: true, content: 'Mod note: keep it friendly, and have a good week, everyone.', languageId: LANG.en, removed: false, deleted: false });

  // Replies the seed made by chance are old news: read. Only the few below are new.
  const myPosts = new Set(w.posts.filter((p) => p.creatorId === 1).map((p) => p.id));
  const mineIds = new Set(w.comments.filter((c) => c.creatorId === 1).map((c) => c.id));
  for (const c of w.comments) {
    if (c.creatorId === 1) continue;
    const ids = c.path.split('.').map(Number);
    if (ids.length > 2 ? mineIds.has(ids[ids.length - 2]) : myPosts.has(c.postId)) w.me.inboxRead.reply[c.id] = true;
  }
  const mine = w.comments.filter((c) => c.creatorId === 1 && !c.deleted && !c.removed);
  const REPLIES = ['Good point, I hadn\'t thought of that.', 'I disagree a little, but thanks for explaining.', 'Thanks, this really helped!', 'Could you say a bit more about that?', 'Same thing happened to me last month.'];
  mine.slice(0, 5).forEach((m, i) => {
    const id = ++w.seq.comment;
    w.comments.push({
      id, postId: m.postId, creatorId: r.pick(others).id, path: `${m.path}.${id}`, depth: m.depth + 1,
      content: REPLIES[i], published: now - (i + 1) * 3 * HOUR, updated: null, languageId: LANG.en,
      removed: false, deleted: false, distinguished: false, up: r.int(1, 20), down: 0,
    });
    if (i >= 2) w.me.inboxRead.reply[id] = true;   // a couple already read
  });
  ['What do you think, @visitor@demo.olemmy.invalid?', 'I think @visitor@demo.olemmy.invalid asked about this last week.'].forEach((content, i) => {
    const p = r.pick(w.posts.filter((x) => !x.nsfw));
    const id = ++w.seq.comment;
    w.comments.push({
      id, postId: p.id, creatorId: r.pick(others).id, path: `0.${id}`, depth: 0,
      content, published: now - (i + 1) * 5 * HOUR, updated: null, languageId: LANG.en,
      removed: false, deleted: false, distinguished: false, up: r.int(1, 15), down: 0,
    });
  });

  // --- the showcase threads ---
  // Hand-written (threads.js): authors by name, times in hours before now,
  // and votes from their scores. A reply to your comment there is new in your inbox.
  for (const t of THREADS) {
    const languageId = LANG[t.lang || 'en'];
    const p = {
      id: ++w.seq.post, communityId: community(t.community).id, creatorId: personId(t.by),
      name: t.title, body: t.body, url: null, image: null, thumbnail: null, urlContentType: '',
      embedTitle: '', embedDescription: '', embedVideoUrl: null, altText: '',
      published: now - t.hours * HOUR, updated: null, languageId, nsfw: false,
      locked: false, removed: false, deleted: false, featuredCommunity: false, featuredLocal: false,
      up: t.score + Math.round(t.score * 0.06), down: Math.round(t.score * 0.06),
      showcase: true,   // ranked ahead of the filler (server.js sortPosts)
    };
    w.posts.push(p);
    const place = (x, parent, after) => {
      const id = ++w.seq.comment;
      const published = Math.min(now - 60e3, after + r.int(4, 90) * 60e3);
      const up = x.score >= 0 ? x.score + r.int(0, 3) : r.int(1, 3);
      w.comments.push({
        id, postId: p.id, creatorId: personId(x.by), path: parent ? `${parent.path}.${id}` : `0.${id}`, depth: parent ? parent.depth + 1 : 0,
        content: x.text, published, updated: null, languageId,
        removed: false, deleted: false, distinguished: false, up, down: up - x.score,
      });
      const made = w.comments[w.comments.length - 1];
      for (const reply of x.replies) place(reply, made, published);
    };
    for (const x of t.comments) place(x, null, p.published);
  }

  // --- private messages ---
  const msg = (from, to, content, ago, read) => w.messages.push({ id: ++w.seq.message, creatorId: from, recipientId: to, content, published: now - ago, updated: null, read, deleted: false });
  msg(personId('iris'), 1, 'Hi! Welcome to the demo. If you\'d like to see the moderator tools, use the **DEMO** button and become a moderator of **Ask the Community**.', 2 * HOUR, false);
  msg(1, personId('iris'), 'Thanks, will do.', HOUR, true);
  msg(personId('quill'), 1, 'Saw your comment in Gardening. If you want seeds, I have far too many basil seeds this year.', 3 * DAY, true);

  // --- reports, bans and the mod log ---
  const report = (kind, target, reason, ago) => target && w.reports.push({ id: ++w.seq.report, kind, targetId: target.id, creatorId: r.pick(others).id, reason, published: now - ago, resolved: false, resolverId: null, original: kind === 'post' ? { name: target.name, body: target.body, url: target.url } : { content: target.content } });
  const postsIn = (name) => w.posts.filter((p) => p.communityId === community(name).id);
  const commentsIn = (name) => { const ids = new Set(postsIn(name).map((p) => p.id)); return w.comments.filter((c) => ids.has(c.postId) && !c.removed && !c.deleted); };
  report('post', postsIn('ask')[2], 'Off topic', 5 * HOUR);
  report('post', postsIn('photography')[1], 'Not their own photo', DAY);
  report('post', postsIn('general')[5], 'Spam', 2 * HOUR);
  report('comment', commentsIn('ask')[4], 'Rude', 3 * HOUR);
  report('comment', commentsIn('photography')[2], 'Harassment', 9 * HOUR);
  report('comment', commentsIn('general')[7], 'Misinformation', 30 * 60e3);

  const removed = w.comments.find((c) => c.removed);
  const restoredPost = postsIn('ask')[0];
  const log = (kind, fields, ago) => w.modlog.push({ id: ++w.seq.modlog, kind, when: now - ago, reason: '', ...fields });
  if (removed) log('mod_remove_comment', { moderatorId: personId('grove_keeper'), commentId: removed.id, removed: true, reason: 'Rule 1: be kind' }, 2 * DAY);
  if (general[3]) log('mod_lock_post', { moderatorId: personId('grove_keeper'), postId: general[3].id, locked: true }, DAY);
  if (ann) log('mod_feature_post', { moderatorId: personId('site_admin'), postId: ann.id, featured: true, community: false }, 6 * DAY);
  const banned = personId('rook');
  w.bans.push({ communityId: community('ask').id, personId: banned, expires: now + 7 * DAY });
  log('mod_ban_from_community', { moderatorId: personId('iris'), communityId: community('ask').id, personId: banned, banned: true, reason: 'Repeatedly unkind', expires: now + 7 * DAY }, 3 * DAY);
  if (restoredPost) log('mod_remove_post', { moderatorId: personId('iris'), postId: restoredPost.id, removed: false, reason: 'Restored after appeal' }, 4 * DAY);

  return w;
}
