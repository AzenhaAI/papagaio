// The daily bulletin: what happened on the island, at the level you read.
//
// Everything else in this product waits for the learner to show up. This
// arrives at them, and it carries news they actually need — a strike, a road
// closed, a levada shut, an immigration rule changed. That is the whole reason
// it exists: a reason to open the app on a day when studying is the last thing
// you feel like.
//
// The feed is the one already gathered for the island's other site, so no new
// scraping and no second source to keep alive. We never republish their text:
// the bulletin is written from the headlines in our own words, at a level the
// original never had, and every item keeps a link back to who reported it.

import { chat } from './groq.js';

const FEED = 'https://azenha.ai/ativa/news_feed.json';

export const LEVELS = {
  a2: {
    label: 'A2',
    how: 'Very short sentences, present tense, the thousand most common words. ' +
         'Explain any place or institution the first time it appears.',
  },
  b1: {
    label: 'B1',
    how: 'Everyday sentences, past and future allowed, some subordinate clauses. ' +
         'Ordinary vocabulary, no jargon left unexplained.',
  },
  b2: {
    label: 'B2',
    how: 'Natural adult prose, the way a newsreader would say it, including ' +
         'the conjuntivo where it belongs. Do not simplify the grammar.',
  },
};

/** Today's items, newest first, deduplicated by title. */
export async function fetchItems(env, limit = 8) {
  const r = await fetch(FEED, { cf: { cacheTtl: 1800, cacheEverything: true } });
  if (!r.ok) throw new Error('news feed unreachable');
  const j = await r.json();
  const items = Array.isArray(j?.items) ? j.items : [];
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const title = String(it?.title ?? '').trim();
    if (!title || seen.has(title)) continue;
    seen.add(title);
    out.push({
      title,
      snippet: String(it?.snippet ?? '').trim().slice(0, 400),
      link: String(it?.link ?? ''),
      date: String(it?.date ?? ''),
    });
    if (out.length >= limit) break;
  }
  if (!out.length) throw new Error('news feed empty');
  return out;
}

const SYSTEM = (level, helper) => `You write a short daily news bulletin in EUROPEAN Portuguese (pt-PT) for someone learning the language while living in Madeira.

Level: ${LEVELS[level].label}. ${LEVELS[level].how}

Hard rules:
- European Portuguese only. Never Brazilian: autocarro not ônibus, comboio not trem, "estou a fazer" not "estou fazendo".
- Write FROM the headlines, in your own words. Never copy a sentence from the source.
- Three to five items, one short paragraph each, most important first. Aim for what a person would read aloud in about three minutes.
- Say what it means for someone living here when that is the point of the story: a road shut, a strike, a rule changed, a festival on.
- No opinions and no invented facts. If a headline is unclear, leave it out rather than guess.
- Start with the date in words, as a newsreader would.
- "words" lists the eight or so words in YOUR text that an ${LEVELS[level].label} learner would not know, each glossed in ${helper}. Real words from your bulletin, in the form you used them.

Answer strictly as JSON:
{
  "text": "the bulletin, plain prose with blank lines between items",
  "words": [{"pt": "a paragem", "gloss": "the bus stop"}]
}`;

/**
 * Builds and stores one day's bulletin at one level. Stored per day so the
 * model runs three times a morning for everybody, not once per reader.
 */
export async function buildBulletin(env, { level = 'b1', helper = 'English', day } = {}) {
  const today = day ?? new Date().toISOString().slice(0, 10);
  const items = await fetchItems(env);

  const raw = await chat(
    env,
    [
      { role: 'system', content: SYSTEM(level, helper) },
      {
        role: 'user',
        content: items
          .map((i, n) => `${n + 1}. ${i.title}\n${i.snippet}`)
          .join('\n\n'),
      },
    ],
    { json: true }
  );

  let out;
  try {
    out = JSON.parse(raw);
  } catch {
    out = { text: raw, words: [] };
  }

  const record = {
    day: today,
    level,
    text: String(out.text ?? '').trim(),
    words: (Array.isArray(out.words) ? out.words : [])
      .filter((w) => w?.pt)
      .slice(0, 12)
      .map((w) => ({ pt: String(w.pt), gloss: String(w.gloss ?? '') })),
    sources: items.map((i) => ({ title: i.title, link: i.link })),
  };
  if (!record.text) throw new Error('empty bulletin');

  await env.DB.prepare(
    `INSERT INTO bulletins (day, level, course, text, words, sources, created_at)
     VALUES (?1, ?2, 'pt', ?3, ?4, ?5, ?6)
     ON CONFLICT(day, level, course) DO UPDATE SET
       text = excluded.text, words = excluded.words,
       sources = excluded.sources, created_at = excluded.created_at`
  ).bind(
    today, level, record.text,
    JSON.stringify(record.words), JSON.stringify(record.sources),
    new Date().toISOString()
  ).run();

  return record;
}

/** The stored bulletin, building it on the spot if the morning job has not. */
export async function getBulletin(env, { level = 'b1', helper = 'English' } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare(
    `SELECT * FROM bulletins WHERE day = ?1 AND level = ?2 AND course = 'pt'`
  ).bind(today, level).first();
  if (row) {
    return {
      day: row.day,
      level: row.level,
      text: row.text,
      words: JSON.parse(row.words || '[]'),
      sources: JSON.parse(row.sources || '[]'),
    };
  }
  return buildBulletin(env, { level, helper });
}
