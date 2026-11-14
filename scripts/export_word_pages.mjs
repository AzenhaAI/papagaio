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
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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

// Links between pages: a synonym or collocation that has its own page becomes
// a link; every page also gets a handful of neighbours from its topic, so no
// page is reachable only from the sitemap.
const bySlug = new Map(pages.map((p) => [p.slug, p]));
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

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ built: new Date().toISOString().slice(0, 10), count: pages.length, pages }));
const verbs = pages.filter((p) => p.conj).length;
const isl = pages.filter((p) => p.madeira).length;
console.log(`word pages: ${pages.length} (verbs with tables ${verbs}, Madeiran senses ${isl}) -> ${OUT}`);
