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
// modules, imported here exactly as /api/lookup uses them. The Tatoeba lines
// /api/lookup adds at request time are left out: they are LIKE scans in D1.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conjugate } from '../src/conjugate.js';
import { MADEIRA } from '../src/madeira.js';
import { FORMS } from '../src/forms.js';
import { LEVELS } from '../src/levels.js';
import { VERB_EXAMPLES } from '../src/verb_examples.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'site/src/data/words.json');
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

const deck = process.argv[2]
  ? JSON.parse(readFileSync(process.argv[2], 'utf8'))
  : await (await fetch(DECK)).json();
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
    audio: c.audio ?? null, tags, unit: c.unit ?? null, rank: c.freq ?? null,
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
const FORM_ONLY = /^(?:(?:first|second|third)[- ]person|(?:feminine |masculine )?(?:singular |plural )?of\b|(?:past|present) participle of|gerund of|inflection of|alternative (?:form|spelling) of|misspelling of|plural of|feminine of)/i;
const BRAZIL = /\b(?:Brazil|Brazilian)\b/i;
const lexTerms = [...byTerm.entries()]
  .filter(([t]) => /\p{L}/u.test(t) && !/^\p{Lu}/u.test(t)) // no names
  .filter(([, rows]) => !rows.every((r) => FORM_ONLY.test(r.e ?? '') || BRAZIL.test(r.e ?? '')))
  .sort((a, b) => rankOf(a[1]) - rankOf(b[1]));

// Sentences: a word's own whole-word matches, short ones first. Tatoeba's
// Portuguese is mixed Brazilian and European, so the obvious Brazilian
// markers are left out — this is a pt-PT site.
const BR = /\b(ônibus|trem|celular|banheiro|café da manhã|geladeira|xícara|tela|time de|moça|garoto|bonde|aeromoça|você pode me|me dá|a gente vai)\b|\b(estou|está|estás|estamos|estão|estava|estavam|estive|esteve) \p{L}+(ando|endo|indo)\b/iu;
const exIndex = new Map();
// The pack the app downloads, when no local copy is given.
const examples = JSON.parse(gunzipSync(existsSync(EXAMPLES)
  ? readFileSync(EXAMPLES)
  : Buffer.from(await (await fetch('https://azenha.ai/packs/examples.json.gz')).arrayBuffer())));
examples.forEach((e, i) => {
  if (!e.s || e.s.length > 90 || BR.test(e.s)) return;
  for (const w of new Set(e.s.toLowerCase().match(/\p{L}+(?:-\p{L}+)*/gu) ?? [])) {
    if (!exIndex.has(w)) exIndex.set(w, []);
    exIndex.get(w).push(i);
  }
});
function examplesFor(term) {
  const key = term.toLowerCase();
  if (/\s/.test(key)) return [];
  const ids = (exIndex.get(key) ?? []).map((i) => examples[i]).sort((a, b) => a.s.length - b.s.length);
  const en = ids.filter((e) => e.p === 'pt-en').slice(0, 2);
  const ru = ids.filter((e) => e.p === 'pt-ru' && !en.some((x) => x.s === e.s)).slice(0, 1);
  return [...en.map((e) => ({ pt: e.s, en: e.d })), ...ru.map((e) => ({ pt: e.s, ru: e.d }))];
}

const lexPages = [];
for (const [t, rows] of lexTerms) {
  if (lexPages.length >= LEX_N) break;
  const slug = slugOf(t);
  if (!slug || seen.has(slug)) continue; // the deck's own page wins
  const r0 = rows[0];
  const isVerb = rows.some((r) => String(r.p ?? '').startsWith('verb'));
  const conj = isVerb ? conjugate(t) : null;
  const madeira = MADEIRA[fold(t)];
  const ex = examplesFor(t);
  const rec = {
    slug, id: `lex:${t}`, term: t, pos: r0.p, gender: r0.g ?? null, lex: true,
    trans: r0.e, trans_ru: r0.ru ?? null, trans_pt: r0.d ?? null,
    note: null, ex_t: ex[0]?.pt ?? null, ex_trans: ex[0]?.en ?? ex[0]?.ru ?? null,
    audio: null, tags: [], unit: null, rank: rankOf(rows),
    level: LEVELS[fold(t).toLowerCase()] ?? null,
    meanings: rows.map((r) => ({ trans: r.e, ru: r.ru ?? null, pt: r.d ?? null, ex: null, pos: r.p, g: r.g ?? null })),
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

// A dictionary page links to the words of the same part of speech either side
// of it in frequency, so every one of them is a click from another.
const byPos = new Map();
for (const p of lexPages) {
  const k = String(p.pos ?? '').split(/[ _]/)[0];
  p.topic = `lex-${k}`;
  if (!byPos.has(k)) byPos.set(k, []);
  byPos.get(k).push(p);
}
for (const list of byPos.values()) {
  list.forEach((p, i) => {
    const near = [...list.slice(Math.max(0, i - 4), i), ...list.slice(i + 1, i + 5)];
    p.related = near.map((q) => ({ s: q.slug, term: q.term, trans: q.trans }));
  });
}
pages.push(...lexPages);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ built: new Date().toISOString().slice(0, 10), count: pages.length, pages }));
const verbs = pages.filter((p) => p.conj).length;
const isl = pages.filter((p) => p.madeira).length;
console.log(`word pages: ${pages.length} (deck ${pages.length - lexPages.length}, dictionary ${lexPages.length}; verbs with tables ${verbs}, Madeiran senses ${isl}, with examples ${lexPages.filter((p) => p.ex_t).length}) -> ${OUT}`);
