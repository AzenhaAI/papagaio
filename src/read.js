// Reading mode: paste real text, get it back with every content word glossed
// and marked against your own deck.
//
// The hard part is lemmas. A reader meets "moro", "fomos", "às" — none of which
// match a deck entry by string. A model pass gives the dictionary form for each
// surface word, which is what makes the deck lookup work at all.

import { chat } from './groq.js';

const MAX_LEN = 4000;

const SYSTEM = `You analyse a European Portuguese text for a learner.

For every CONTENT word (nouns, verbs, adjectives, adverbs) return an entry.
Skip function words entirely: articles, prepositions, conjunctions, pronouns,
and contractions of them (o, a, de, em, que, se, do, na, pelo...).

For each entry give:
- surface: the word exactly as it appears in the text, same case
- lemma: the dictionary form (verbs → infinitive, nouns → singular, adjectives → masculine singular)
- gloss: a short English translation, 1-4 words
- pos: noun | verb | adj | adv

List each distinct surface form once, in order of first appearance.
If the text is not Portuguese, return an empty list.

Answer strictly as JSON: {"words": [{"surface": "...", "lemma": "...", "gloss": "...", "pos": "..."}]}`;

/**
 * Glosses a text and marks each word against the learner's deck.
 * uid may be null — then nothing is "known" and it still works as a reader.
 */
export async function analyse(env, text, uid) {
  const input = String(text ?? '').trim().slice(0, MAX_LEN);
  if (!input) throw new Error('empty text');

  const raw = await chat(env, [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: input },
  ], { json: true });

  let words = [];
  try {
    words = JSON.parse(raw).words ?? [];
  } catch {
    words = [];
  }
  words = words.filter((w) => w?.surface && w?.lemma);

  // Match lemmas against the deck. Cards carry articles ("a conta"), so compare
  // on the bare noun too.
  const lemmas = [...new Set(words.map((w) => w.lemma.toLowerCase()))];
  const known = new Map();
  if (lemmas.length) {
    const marks = lemmas.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT c.id, c.term, c.trans, c.audio,
              COALESCE(uc.reps, 0) AS reps
       FROM cards c
       LEFT JOIN user_cards uc ON uc.card_id = c.id AND uc.user_id = ?1
       WHERE c.course = 'pt' AND c.pos IS NOT 'drill'
         -- The lexicon lives in this table too, all 141k rows of it. Without
         -- this line every word ever written in Portuguese counted as "in your
         -- deck", the reader never marked anything new, and the one thing it
         -- promised — showing what you do not know yet — quietly stopped
         -- working the day the dictionary was loaded.
         AND (c.owner IS NULL OR c.owner = ?1)
         AND (LOWER(c.term) IN (${marks})
              OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(c.term, 'o ', ''), 'a ', ''), 'os ', ''), 'as ', '')) IN (${marks}))`
    ).bind(uid ?? 0, ...lemmas, ...lemmas).all();
    for (const r of results) {
      const key = r.term.toLowerCase().replace(/^(o|a|os|as|um|uma) /, '');
      if (!known.has(key) || r.reps > known.get(key).reps) known.set(key, r);
    }
  }

  const out = words.map((w) => {
    const hit = known.get(w.lemma.toLowerCase());
    return {
      ...w,
      status: !hit ? 'new' : hit.reps > 0 ? 'known' : 'in_deck',
      card_id: hit?.id ?? null,
      audio: hit?.audio ?? null,
    };
  });

  const counts = out.reduce((a, w) => ({ ...a, [w.status]: (a[w.status] ?? 0) + 1 }), {});
  return { text: input, words: out, counts };
}
