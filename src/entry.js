// Dictionary articles on demand.
//
// The handwritten entries in data/entries cover the core verbs; everything else
// arrives empty. Rather than leave a card saying "no article yet", we write one
// the first time somebody opens it and keep it in D1 forever — so a word costs
// one model call in its whole life, and the app can read it offline after.
//
// Quotes are the risky part: a model asked for literature will happily invent a
// line and attribute it to Pessoa. The prompt therefore prefers proverbs, which
// are anonymous and traditional, and demands the model drop the field entirely
// rather than guess. Anything it does return is flagged unverified in the UI.

import { chat } from './groq.js';

const SYSTEM = `You write dictionary articles for a EUROPEAN Portuguese (pt-PT) learning app.

Hard rules:
- European Portuguese as spoken in Portugal and Madeira. NEVER Brazilian forms.
- Conjugation arrays are exactly five persons in this order: eu, tu, ele/ela, nós, eles/elas. European Portuguese drops vós in speech — never include it.
- Only give "conj" for verbs. For anything else omit the field.
- Explanations and glosses are in English. The learner is an English speaker learning Portuguese.
- "lit" is for PUBLIC DOMAIN material only: traditional proverbs (ditados populares), or literature published before 1936 (Camões, Pessoa's early work, Florbel Espanca, Eça de Queirós). Never song lyrics, never anything modern.
- If you are not certain a quote is real and public domain, return "lit": []. An empty list is correct; an invented attribution is not.
- Be concise. Two to four meanings, a handful of collocations.

Answer strictly as JSON:
{
  "meanings": [{"trans": "sense in English", "note": "short pt-PT example showing it, or empty string"}],
  "synonyms": ["pt-PT synonyms, may be empty"],
  "collocations": [{"t": "the Portuguese phrase", "trans": "what it means in English"}],
  "grammar": "one or two sentences on how the word behaves, or empty string",
  "conj": {"presente": ["...","...","...","...","..."], "pps": [...], "imperfeito": [...]},
  "lit": [{"text": "the quote in Portuguese", "src": "Author, Work (year)"}]
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
    lit: list(out.lit)
      .filter((q) => q?.text && q?.src)
      .slice(0, 3)
      .map((q) => ({ text: String(q.text), src: String(q.src), unverified: true })),
  };
}

const isEmpty = (e) =>
  !e.meanings.length &&
  !e.synonyms.length &&
  !e.collocations.length &&
  !e.grammar &&
  !Object.keys(e.conj).length &&
  !e.lit.length;

/**
 * Returns the card's article, writing one first if it doesn't have one.
 * Never throws for a missing model — callers fall back to showing the card bare.
 */
export async function ensureEntry(env, card) {
  if (card.entry) {
    try {
      return JSON.parse(card.entry);
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

  const raw = await chat(
    env,
    [
      { role: 'system', content: SYSTEM },
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

  await env.DB.prepare(`UPDATE cards SET entry = ? WHERE id = ?`)
    .bind(JSON.stringify(entry), card.id)
    .run();

  return entry;
}
