// Dictionary articles on demand.
//
// The handwritten entries in data/entries cover the core verbs; everything else
// arrives empty. Rather than leave a card saying "no article yet", we write one
// the first time somebody opens it and keep it in D1 forever — so a word costs
// one model call in its whole life, and the app can read it offline after.
//
// What this deliberately does NOT do is quote literature. A model asked for a
// line of Pessoa will produce one, correctly formatted, correctly attributed,
// and invented. Flagging it "unverified" does not help: a learner reads the
// quote, not the badge. So generated articles carry no `lit` at all — the
// quotes in the app are the handwritten ones in data/entries, checked by a
// human against a real edition.

import { chat } from './groq.js';

const SYSTEM = `You write dictionary articles for a EUROPEAN Portuguese (pt-PT) learning app.

Hard rules:
- European Portuguese as spoken in Portugal and Madeira. NEVER Brazilian forms.
- Conjugation arrays are exactly five persons in this order: eu, tu, ele/ela, nós, eles/elas. European Portuguese drops vós in speech — never include it.
- Only give "conj" for verbs. For anything else omit the field.
- Explanations and glosses are in English. The learner is an English speaker learning Portuguese.
- NEVER quote literature, songs, proverbs, or any named source. You cannot verify a quotation and an invented one is worse than none. Nothing in your answer may be presented as somebody's words.
- Examples you write yourself are fine and expected — they are plainly yours, not a quotation.
- Be concise. Two to four meanings, a handful of collocations.

Answer strictly as JSON:
{
  "meanings": [{"trans": "sense in English", "note": "short pt-PT example showing it, or empty string"}],
  "synonyms": ["pt-PT synonyms, may be empty"],
  "collocations": [{"t": "the Portuguese phrase", "trans": "what it means in English"}],
  "grammar": "one or two sentences on how the word behaves, or empty string",
  "conj": {"presente": ["...","...","...","...","..."], "pps": [...], "imperfeito": [...]}
}`;

/** Five slots, strings only — anything else is a model slip, not a form. */
const conjForms = (v) =>
  Array.isArray(v) && v.length >= 4 && v.length <= 6
    ? v.slice(0, 5).map((x) => String(x ?? '').trim()).filter(Boolean)
    : null;

function clean(out, isVerb) {
  const list = (v) => (Array.isArray(v) ? v : []);

  const conj = {};
  if (isVerb && out.conj && typeof out.conj === 'object') {
    for (const [tense, forms] of Object.entries(out.conj)) {
      const f = conjForms(forms);
      if (f && f.length === 5) conj[tense] = f;
    }
  }

  return {
    meanings: list(out.meanings)
      .filter((m) => m?.trans)
      .slice(0, 6)
      .map((m) => ({ trans: String(m.trans), note: String(m.note ?? '') })),
    synonyms: list(out.synonyms).map(String).filter(Boolean).slice(0, 8),
    collocations: list(out.collocations)
      .filter((c) => c?.t && c?.trans)
      .slice(0, 8)
      .map((c) => ({ t: String(c.t), trans: String(c.trans) })),
    grammar: String(out.grammar ?? ''),
    conj,
    // No `lit`: see the note at the top. A model's quotation is a fabrication
    // with a citation attached, so it is dropped rather than shown.
  };
}

const isEmpty = (e) =>
  !e.meanings.length &&
  !e.synonyms.length &&
  !e.collocations.length &&
  !e.grammar &&
  !Object.keys(e.conj).length;

/**
 * Returns the card's article, writing one first if it doesn't have one.
 * Never throws for a missing model — callers fall back to showing the card bare.
 */
export async function ensureEntry(env, card, lang = 'en') {
  // Russian articles live in their own column: they are an overlay for one
  // audience, and must never overwrite the English article everyone else gets.
  const col = lang === 'ru' ? 'entry_ru' : 'entry';
  if (card[col]) {
    try {
      return JSON.parse(card[col]);
    } catch {
      // Corrupt row — fall through and write a fresh one.
    }
  }
  if (!env.GROQ_API_KEY) return null;

  const isVerb = (card.pos ?? '').toLowerCase().startsWith('verb');
  const ask =
    `Word: ${card.term}\n` +
    `Known meaning: ${card.trans}\n` +
    (card.pos ? `Part of speech: ${card.pos}\n` : '') +
    (card.gender ? `Gender: ${card.gender}\n` : '') +
    (card.note ? `Note already on the card: ${card.note}\n` : '');

  const langRule = lang === 'ru'
    ? '\nOVERRIDE: explanations, glosses, meaning translations and grammar notes are in RUSSIAN, not English. The learner speaks Russian. Portuguese stays Portuguese.'
    : '';

  const raw = await chat(
    env,
    [
      { role: 'system', content: SYSTEM + langRule },
      { role: 'user', content: ask },
    ],
    { json: true }
  );

  let out;
  try {
    out = JSON.parse(raw);
  } catch {
    return null;
  }

  const entry = clean(out, isVerb);
  if (isEmpty(entry)) return null;

  await env.DB.prepare(`UPDATE cards SET ${col} = ? WHERE id = ?`)
    .bind(JSON.stringify(entry), card.id)
    .run();

  return entry;
}

const HEAD_SYSTEM = `You identify EUROPEAN Portuguese (pt-PT) words for a dictionary.

Given one word or short phrase in Portuguese, English or Russian, answer as JSON:
{
  "term": "the pt-PT headword, with its article for nouns (o gato, a casa); the infinitive for verbs",
  "trans": "short English gloss, two or three senses at most, separated by semicolons",
  "pos": "noun | verb | adj | adv | phrase | interj | prep | conj | num | pron",
  "gender": "m or f for nouns, otherwise empty string",
  "note": "one short usage note if it earns its place, otherwise empty string",
  "ex_t": "one natural pt-PT example sentence using the word",
  "ex_trans": "the example in English"
}

Hard rules:
- European Portuguese only. Never Brazilian vocabulary, spelling or grammar.
- If the input is English or Russian, answer with the European Portuguese word for it.
- British English spelling in every gloss and example: neighbour, colour, organise.
- If the input is not a word in either language, set "term" to an empty string.`;

/**
 * A dictionary must answer for any word, not only the ones in the deck. Looks up
 * whatever the learner typed, in either direction, and keeps the result in the
 * cards table under owner 'lookup' — invisible to the deck (which filters on
 * owner IS NULL), but never paid for twice, and ready to be promoted into
 * somebody's own cards.
 */
export async function lookupWord(env, query) {
  const q = String(query ?? '').trim().slice(0, 60);
  if (!q) return null;

  const id = `lk:${q.toLowerCase()}`;
  const cached = await env.DB.prepare(
    `SELECT * FROM cards WHERE id = ? AND owner = 'lookup'`
  ).bind(id).first();
  if (cached) return { ...cached, entry: await ensureEntry(env, cached) };

  if (!env.GROQ_API_KEY) return null;

  const raw = await chat(
    env,
    [{ role: 'system', content: HEAD_SYSTEM }, { role: 'user', content: q }],
    { json: true }
  );

  let head;
  try {
    head = JSON.parse(raw);
  } catch {
    return null;
  }
  const term = String(head.term ?? '').trim();
  if (!term) return null;

  const card = {
    id,
    course: 'pt',
    owner: 'lookup',
    term,
    trans: String(head.trans ?? '').trim(),
    pos: String(head.pos ?? '').trim() || null,
    gender: String(head.gender ?? '').trim() || null,
    note: String(head.note ?? '').trim() || null,
    ex_t: String(head.ex_t ?? '').trim() || null,
    ex_trans: String(head.ex_trans ?? '').trim() || null,
    tags: '["lookup"]',
    unit: null,
    freq: null,
    audio: null,
    entry: null,
  };

  await env.DB.prepare(
    `INSERT OR REPLACE INTO cards
       (id, course, owner, term, trans, pos, gender, note, ex_t, ex_trans, tags, unit, freq, audio, entry)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    card.id, card.course, card.owner, card.term, card.trans, card.pos, card.gender,
    card.note, card.ex_t, card.ex_trans, card.tags, card.unit, card.freq, card.audio, card.entry
  ).run();

  return { ...card, entry: await ensureEntry(env, card) };
}
