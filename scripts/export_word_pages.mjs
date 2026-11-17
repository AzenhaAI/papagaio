// Builds site/src/data/words.json: one record per page at /papagaio/palavra/<slug>/.
//
//   node scripts/export_word_pages.mjs [deck.json]
//
// Why the pages exist: the dictionary card is drawn in the browser from
// /api/lookup, so to a search engine every word is the same empty
// "Dictionary" page. These pages carry the same article as static HTML.
//
// Where the data comes from, and why it costs D1 nothing extra: the teaching
// deck (one request to /api/deck, edge-cached, or a saved copy passed as the
// first argument) already holds every article; conjugations, plural and
// feminine forms, CEFR levels and the Madeiran senses are the worker's own
// modules, imported here exactly as /api/lookup uses them. Deck pages leave
// out the Tatoeba lines /api/lookup adds at request time (LIKE scans in D1);
// dictionary pages take theirs from the examples pack file instead.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conjugate } from '../src/conjugate.js';
import { MADEIRA } from '../src/madeira.js';
import { FORMS } from '../src/forms.js';
import { LEVELS } from '../src/levels.js';
import { VERB_EXAMPLES } from '../src/verb_examples.js';
import { isBrazilian, bareName } from '../src/brazilian.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'site/src/data/words.json');
// Audio for pages the deck never voiced (scripts/gen_word_audio.mjs, files in
// R2 papagaio-audio next to the deck's): term -> file for lexicon words,
// id -> file for deck cards added after the last deck audio run.
const WORD_AUDIO_PATH = join(ROOT, 'build/word_audio/manifest.json');
// Only files confirmed in the bucket (upload_word_audio.sh writes uploaded.txt):
// a page must not offer a recording that failed to upload.
const UPLOADED = new Set(existsSync(join(ROOT, 'build/word_audio/uploaded.txt'))
  ? readFileSync(join(ROOT, 'build/word_audio/uploaded.txt'), 'utf8').split('\n').filter(Boolean) : []);
const WORD_AUDIO = { terms: {}, ids: {} };
if (existsSync(WORD_AUDIO_PATH)) {
  const m = JSON.parse(readFileSync(WORD_AUDIO_PATH, 'utf8'));
  for (const k of ['terms', 'ids']) for (const [key, f] of Object.entries(m[k] ?? {})) if (UPLOADED.has(f)) WORD_AUDIO[k][key] = f;
}
const DECK = 'https://azenha.ai/api/deck?course=pt&limit=2000';
// The dictionary half: the most frequent headwords of the offline pack the
// app ships (term, part of speech, gender, frequency rank, English and
// Russian meaning, Portuguese definition), and Tatoeba sentences for them.
// Both are files, not D1 reads.
const PACK = process.env.PG_PACK ?? join(ROOT, '../papagaio_app/assets/packs/pt.json.gz');
const EXAMPLES = process.env.PG_EXAMPLES ?? join(ROOT, 'packs/examples.json.gz');
const LEX_N = Number(process.env.PG_LEX ?? 10000);

const ARTICLE = /^([oa]s? |um |uma )/i;
const bare = (t) => String(t ?? '').replace(ARTICLE, '').trim();
const fold = (t) => bare(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// The address keeps its accents (olá, cão, pão): that is what people type and
// what Google shows. NFC, so the same word never gets two addresses.
export function slugOf(term) {
  return bare(term).normalize('NFC').toLowerCase()
    .replace(/\.\.\.|…/g, ' ')
    .replace(/[?!¿¡.,;:"«»()\[\]/\\]+/g, ' ')
    .replace(/['’`´]/g, '')
    .trim().replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// The deck from the API, saved to packs/deck-pt.json every time it comes back
// whole; when the API refuses (the D1 day's allowance spent), that saved copy
// is used instead. Without it the build stops: on 15 Nov 2026 a 503 here was
// read as an empty deck and 1,088 pages silently disappeared.
const DECK_COPY = join(ROOT, 'packs/deck-pt.json');
async function loadDeck() {
  if (process.argv[2]) return JSON.parse(readFileSync(process.argv[2], 'utf8'));
  try {
    const r = await fetch(DECK);
    const d = r.ok ? await r.json() : null;
    if ((d?.cards?.length ?? 0) > 500) {
      writeFileSync(DECK_COPY, JSON.stringify(d));
      return d;
    }
    console.warn(`deck API: HTTP ${r.status}, ${d?.cards?.length ?? 0} cards — using the saved copy`);
  } catch (e) {
    console.warn(`deck API unreachable (${e.message}) — using the saved copy`);
  }
  if (!existsSync(DECK_COPY)) throw new Error('no deck: the API refused and packs/deck-pt.json does not exist yet');
  return JSON.parse(readFileSync(DECK_COPY, 'utf8'));
}
const deck = await loadDeck();
const cards = (deck.cards ?? []).filter((c) => c.pos !== 'ref' && c.pos !== 'drill' && c.entry);

const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const pages = [];
const seen = new Map();
for (const c of cards.sort((a, b) => (a.freq ?? 1e9) - (b.freq ?? 1e9))) {
  const slug = slugOf(c.term);
  if (!slug || seen.has(slug)) continue; // the more frequent card of a pair (mau/mau) wins
  const e = parse(c.entry) ?? {};
  const tags = parse(c.tags) ?? [];
  const isVerb = String(c.pos ?? '').startsWith('verb');
  const conj = isVerb ? conjugate(bare(c.term)) : null;
  const madeira = MADEIRA[fold(c.term)];
  const rec = {
    slug, id: c.id, term: c.term, pos: c.pos, gender: c.gender ?? null,
    trans: c.trans, trans_ru: c.trans_ru ?? null, trans_pt: c.trans_pt ?? null,
    note: c.note ?? null, ex_t: c.ex_t ?? null, ex_trans: c.ex_trans ?? null,
    audio: c.audio ?? WORD_AUDIO.ids[c.id] ?? null, tags, unit: c.unit ?? null, rank: c.freq ?? null,
    level: LEVELS[fold(c.term).toLowerCase()] ?? null,
    meanings: (e.meanings ?? []).map((m) => ({ trans: m.trans, ru: m.trans_ru ?? null, pt: m.trans_pt ?? null, ex: m.note ?? null })),
    collocations: (e.collocations ?? []).map((x) => ({ t: x.t, trans: x.trans, ru: x.trans_ru ?? null })),
    synonyms: e.synonyms ?? [], antonyms: e.antonyms ?? [],
    grammar: e.grammar ?? null, grammar_ru: e.grammar_ru ?? null,
    forms: FORMS[bare(c.term)] ?? null,
    conj: conj && Object.keys(conj).length ? conj : null,
    conjEx: isVerb ? VERB_EXAMPLES[bare(c.term)] ?? null : null,
    madeira: Array.isArray(madeira) ? madeira.slice(0, 3).map((m) => ({ t: m.t, e: m.e, ru: m.ru ?? null, d: m.d ?? null, lo: !!m.lo })) : null,
  };
  seen.set(slug, rec);
  pages.push(rec);
}

// ---- Dictionary pages: the next LEX_N headwords by frequency ----
const pack = JSON.parse(gunzipSync(readFileSync(PACK)));
const byTerm = new Map();
for (const r of pack) {
  if (!r.t || r.r == null || r.r >= 900000) continue; // 9xxxxx are layers, not ranks
  if (!byTerm.has(r.t)) byTerm.set(r.t, []);
  byTerm.get(r.t).push(r);
}
const rankOf = (rows) => Math.min(...rows.map((r) => r.r));
// A page that only says "third-person plural of assassinar" or "Brazilian
// spelling of" has nothing of its own; the headword it points to has one.
// The qualifier before "of" is required: "of, from" is the meaning of de, and
// an optional one dropped de, do, da and dos from the site.
const FORM_ONLY = /^(?:(?:first|second|third)[- ]person|(?:(?:feminine|masculine)(?: singular| plural)?|singular|plural) of\b|(?:past|present) participle of|gerund of|inflection of|alternative (?:form|spelling) of|misspelling of)/i;
const BRAZIL = /\b(?:Brazil|Brazilian)\b/i;
// Brazilian only when every sense says so: "you (Brazil: informal)" still
// leaves você a word a Portuguese learner meets every day.
const brazilOnly = (e) => {
  const senses = String(e ?? '').split(';').map((x) => x.trim()).filter(Boolean);
  return senses.length > 0 && senses.every((x) => BRAZIL.test(x));
};
// Vulgar and slur entries get no page, and so never turn up as a "related
// word" on an innocent one (infiltrar showed mamar "to give a blowjob").
const VULGAR = /\b(?:vulgar|offensive|obscene|derogatory|slur|pejorative|taboo)\b/i;
const VULGAR_RU = /(?:хуй|хуя|хуё|ебат|ебл|ебу|пизд|бляд|залуп|мудак|сучк)/i;
const isVulgar = (r) => VULGAR.test(r.e ?? '') || VULGAR_RU.test(r.ru ?? '');
// Not Portuguese headwords: digits (3d), cross-references ("see bigue"),
// calendar names of other languages (ab "Av (Hebrew month)").
const junk = (t, rows) => /\d/.test(t) || rows.every((r) => /^(?:see |Hebrew |Hindu |Islamic )/i.test(r.e ?? ''));
const lexTerms = [...byTerm.entries()]
  .filter(([t]) => /\p{L}/u.test(t) && !/^\p{Lu}/u.test(t)) // no names
  .filter(([t, rows]) => !rows.some(isVulgar) && !junk(t, rows))
  .filter(([, rows]) => !rows.every((r) => FORM_ONLY.test(r.e ?? '') || brazilOnly(r.e)))
  .sort((a, b) => rankOf(a[1]) - rankOf(b[1]));

// Sentences: a word's own whole-word matches, short ones first. Tatoeba's
// Portuguese is mixed Brazilian and European; src/brazilian.js says which is
// which, the same test the app and the bot use.
const exIndex = new Map();
// The pack the app downloads, when no local copy is given.
const examples = JSON.parse(gunzipSync(existsSync(EXAMPLES)
  ? readFileSync(EXAMPLES)
  : Buffer.from(await (await fetch('https://azenha.ai/packs/examples.json.gz')).arrayBuffer())));
examples.forEach((e, i) => {
  if (!e.s || e.s.length > 90 || isBrazilian(e.s)) return;
  for (const w of new Set(e.s.toLowerCase().match(/\p{L}+(?:-\p{L}+)*/gu) ?? [])) {
    if (!exIndex.has(w)) exIndex.set(w, []);
    exIndex.get(w).push(i);
  }
});
function examplesFor(term) {
  const key = term.toLowerCase();
  if (/\s/.test(key)) return [];
  const ids = (exIndex.get(key) ?? []).map((i) => examples[i])
    .sort((a, b) => bareName(a.s) - bareName(b.s) || a.s.length - b.s.length);
  const en = ids.filter((e) => e.p === 'pt-en').slice(0, 2);
  const ru = ids.filter((e) => e.p === 'pt-ru' && !en.some((x) => x.s === e.s)).slice(0, 1);
  return [...en.map((e) => ({ pt: e.s, en: e.d })), ...ru.map((e) => ({ pt: e.s, ru: e.d }))];
}

const DET = new Set(['a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'da', 'do', 'das', 'dos', 'na', 'no',
  'nas', 'nos', 'à', 'ao', 'às', 'aos', 'pela', 'pelo', 'de', 'em', 'esta', 'este', 'essa', 'esse', 'aquela',
  'aquele', 'minha', 'meu', 'sua', 'seu', 'tua', 'teu', 'nossa', 'nosso', 'cada', 'toda', 'todo', 'outra', 'outro']);
/** Share of the word's Tatoeba sentences where an article or preposition
 *  stands right before it; null when there are fewer than four sentences. */
function detRate(term) {
  const key = term.toLowerCase();
  const ids = exIndex.get(key) ?? [];
  if (ids.length < 4) return null;
  let det = 0;
  for (const i of ids.slice(0, 200)) {
    const words = examples[i].s.toLowerCase().match(/\p{L}+(?:-\p{L}+)*/gu) ?? [];
    const at = words.indexOf(key);
    if (at > 0 && DET.has(words[at - 1])) det++;
  }
  return det / Math.min(ids.length, 200);
}

// Forms of the frequent verbs. The pack files é, foi, tinha and fez under
// their rarest senses ("the letter E", "ringworm", "a fez") while their rank
// comes from the verb: the page then led with the curiosity and showed
// examples of the verb under it. A form of one of the 300 most frequent verbs
// now leads with that; a form of the next 2,700 gets it as a further meaning.
const TENSE_NAME = {
  presente: ['present', 'настоящее время'], pps: ['preterite', 'прошедшее время'],
  imperfeito: ['imperfect', 'имперфект'], presente_conj: ['present subjunctive', 'сослагательное наклонение'],
  imperfeito_conj: ['imperfect subjunctive', 'сослагательное наклонение'], futuro: ['future', 'будущее время'],
  condicional: ['conditional', 'условное наклонение'], futuro_conj: ['future subjunctive', 'сослагательное наклонение'],
  imperativo: ['imperative', 'повелительное наклонение'], mais_que_perfeito: ['pluperfect', 'плюсквамперфект'],
  participio: ['past participle', 'причастие'], gerundio: ['gerund', 'деепричастие'],
};
const verbFirst = new Map();
for (const r of [...pack].sort((a, b) => (a.r ?? 1e9) - (b.r ?? 1e9))) {
  if (String(r.p ?? '').startsWith('verb') && r.r != null && r.r < 900000 && !verbFirst.has(r.t)) verbFirst.set(r.t, r);
}
const topVerbs = [...verbFirst.keys()].slice(0, 3000);
const formOf = new Map();
topVerbs.forEach((inf, idx) => {
  const c = conjugate(inf);
  for (const [k, v] of Object.entries(c ?? {})) {
    if (!TENSE_NAME[k]) continue;
    for (const f of Array.isArray(v) ? v : [v]) {
      const w = String(f ?? '').trim().toLowerCase();
      if (!w || w === inf || /[\s—–]/.test(w)) continue;
      if (!formOf.has(w)) formOf.set(w, []);
      const list = formOf.get(w);
      if (!list.some((x) => x.inf === inf)) list.push({ inf, idx, tense: k });
    }
  }
});
const firstSense = (s) => String(s ?? '').split(/[;(]/)[0].trim();
function formMeanings(term) {
  return (formOf.get(term.toLowerCase()) ?? []).slice(0, 2).map(({ inf, idx, tense }) => {
    const v = verbFirst.get(inf);
    const [en, ru] = TENSE_NAME[tense];
    return {
      trans: `${en} of ${inf}${v?.e ? ` (${firstSense(v.e)})` : ''}`,
      ru: `${ru}, глагол ${inf}${v?.ru ? ` (${firstSense(v.ru)})` : ''}`,
      pt: `forma do verbo ${inf}`, ex: null, pos: 'verb form', g: null, verb: inf, top: idx < 300,
    };
  });
}

const lexPages = [];
for (const [t, rows] of lexTerms) {
  if (lexPages.length >= LEX_N) break;
  const slug = slugOf(t);
  if (!slug || seen.has(slug)) continue; // the deck's own page wins
  const r0 = rows[0];
  const isVerb = rows.some((r) => String(r.p ?? '').startsWith('verb'));
  // perderam, sofreram: a verb row whose term is a form of another verb, not
  // an infinitive. Its infinitive has the page; this one would only repeat it.
  if (isVerb && !/(?:ar|er|ir|or|ôr)(?:-se)?$/.test(t) && formOf.has(t.toLowerCase())) continue;
  const conj = isVerb ? conjugate(t) : null;
  const madeira = MADEIRA[fold(t)];
  const ex = examplesFor(t);
  const own = rows.map((r) => ({ trans: r.e, ru: r.ru ?? null, pt: r.d ?? null, ex: null, pos: r.p, g: r.g ?? null }));
  const forms = isVerb ? [] : formMeanings(t);
  // Which reading leads: the verb form when the sentences use the word as a
  // verb. A noun follows an article or a preposition (a parte, de volta, uma
  // volta); "tinha", "cabe" and "é" almost never do. Without enough sentences,
  // a form of one of the 300 most frequent verbs leads.
  // The verb form leads only when the spelling's own senses are minor (a
  // letter's name, an interjection) or when nothing in them is a function
  // word and the corpus says the word behaves like a verb. "para" is "for"
  // before it is a form of parar, "sobre" is "about" before sobrar; "é" has
  // only the letter E of its own, so "is" leads there.
  const FUNCTION = /^(prep|conj|pron|adv|art|article|det|num|contraction)/;
  const minor = (m) => m.pos === 'interj' || /^(the |an? )?(arabic |greek |hebrew |latin )?letter\b/i.test(m.trans ?? '');
  const verbLeads = (() => {
    if (!forms.length) return false;
    if (!own.length || own.every(minor)) return true;
    if (own.some((m) => FUNCTION.test(m.pos ?? ''))) return false;
    const det = detRate(t);
    return det == null ? forms.some((m) => m.top) : det < 0.3;
  })();
  const meanings = verbLeads ? [...forms, ...own] : [...own, ...forms];
  const m0 = meanings[0];
  const rec = {
    slug, id: `lex:${t}`, term: t, pos: m0.pos, gender: m0.g ?? null, lex: true,
    trans: m0.trans, trans_ru: m0.ru ?? null, trans_pt: m0.pt ?? null,
    note: null, ex_t: ex[0]?.pt ?? null, ex_trans: ex[0]?.en ?? ex[0]?.ru ?? null,
    ex_lang: ex[0]?.en ? 'en' : ex[0]?.ru ? 'ru' : null,
    audio: WORD_AUDIO.terms[t] ?? null, tags: [], unit: null, rank: rankOf(rows),
    level: LEVELS[fold(t).toLowerCase()] ?? null,
    meanings,
    examples: ex.slice(1),
    collocations: [], synonyms: [], antonyms: [], grammar: null, grammar_ru: null,
    forms: FORMS[t] ?? null,
    conj: conj && Object.keys(conj).length ? conj : null,
    conjEx: isVerb ? VERB_EXAMPLES[t] ?? null : null,
    madeira: Array.isArray(madeira) ? madeira.slice(0, 3).map((m) => ({ t: m.t, e: m.e, ru: m.ru ?? null, d: m.d ?? null, lo: !!m.lo })) : null,
  };
  seen.set(slug, rec);
  lexPages.push(rec);
}

// Links between pages: a synonym or collocation that has its own page becomes
// a link; every page also gets a handful of neighbours from its topic, so no
// page is reachable only from the sitemap.
const bySlug = new Map([...pages, ...lexPages].map((p) => [p.slug, p]));
const TOPIC_SKIP = new Set(['core', 'pt-pt', 'frase', 'verbo', 'adjetivo', 'minpair', 'som']);
const byTopic = new Map();
for (const p of pages) {
  const t = p.tags.find((x) => !TOPIC_SKIP.has(x)) ?? p.tags[0] ?? p.unit ?? 'core';
  p.topic = t;
  if (!byTopic.has(t)) byTopic.set(t, []);
  byTopic.get(t).push(p.slug);
}
for (const p of pages) {
  const link = (w) => (bySlug.has(slugOf(w)) && slugOf(w) !== p.slug ? slugOf(w) : null);
  p.synonyms = p.synonyms.map((w) => ({ w, s: link(w) }));
  p.antonyms = p.antonyms.map((w) => ({ w, s: link(w) }));
  p.collocations = p.collocations.map((x) => ({ ...x, s: link(x.t) }));
  const near = byTopic.get(p.topic) ?? [];
  const i = near.indexOf(p.slug);
  p.related = [...near.slice(i + 1), ...near.slice(0, i)].slice(0, 8)
    .map((s) => ({ s, term: bySlug.get(s).term, trans: bySlug.get(s).trans }));
}

// A "form of ir" meaning links to the verb's own page when there is one.
for (const p of lexPages) {
  for (const m of p.meanings) if (m.verb) m.s = bySlug.has(slugOf(m.verb)) ? slugOf(m.verb) : null;
}

// Related words for a dictionary page: words whose English meaning shares a
// content word with this one (escândalo → scandal, outrage…), then the words
// of the same part of speech nearest in frequency to fill up to eight. Plain
// frequency neighbours alone read as random (infiltrar → reinar, hackear).
const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'something', 'someone',
  'somebody', 'thing', 'one', 'make', 'made', 'have', 'used', 'being', 'very', 'more', 'other', 'which',
  'form', 'kind', 'type', 'part', 'person', 'people', 'without', 'about', 'over', 'under', 'act', 'state']);
const gloss = (p) => [...new Set((String(p.trans).toLowerCase().match(/[a-z]{4,}/g) ?? [])
  .map((w) => w.replace(/(?:ing|ed|es|s)$/, '')).filter((w) => w.length > 3 && !STOP.has(w)))];
const byWord = new Map();
for (const p of lexPages) for (const w of gloss(p)) {
  if (!byWord.has(w)) byWord.set(w, []);
  byWord.get(w).push(p);
}
const byPos = new Map();
for (const p of lexPages) {
  const k = String(p.pos ?? '').split(/[ _]/)[0];
  p.topic = `lex-${k}`;
  if (!byPos.has(k)) byPos.set(k, []);
  byPos.get(k).push(p);
}
for (const list of byPos.values()) {
  list.forEach((p, i) => {
    const score = new Map();
    for (const w of gloss(p)) {
      const peers = byWord.get(w) ?? [];
      if (peers.length > 60) continue; // "good", "make": too common to mean anything
      for (const q of peers) if (q !== p) score.set(q, (score.get(q) ?? 0) + 1);
    }
    const near = [...list.slice(Math.max(0, i - 4), i), ...list.slice(i + 1, i + 5)];
    const ranked = [...score.entries()].sort((x, y) => y[1] - x[1] || x[0].rank - y[0].rank).map(([q]) => q);
    const picked = [...new Set([...ranked, ...near])].slice(0, 8);
    p.related = picked.map((q) => ({ s: q.slug, term: q.term, trans: q.trans }));
  });
}
pages.push(...lexPages);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ built: new Date().toISOString().slice(0, 10), count: pages.length, pages }));
const verbs = pages.filter((p) => p.conj).length;
const isl = pages.filter((p) => p.madeira).length;
console.log(`word pages: ${pages.length} (deck ${pages.length - lexPages.length}, dictionary ${lexPages.length}; verbs with tables ${verbs}, Madeiran senses ${isl}, with examples ${lexPages.filter((p) => p.ex_t).length}) -> ${OUT}`);
