// Phrasebook phrases by the words they contain, for the "Phrases with this
// word" links on word pages (src/pages/palavra/[slug].astro): every word page
// a phrase uses points to that phrase, and the phrase page back to the
// phrasebook. Built once per build from the deck in src/data/words.json.
import data from '../data/words.json';

const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const words = (s) => fold(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2);
const ARTICLE = /^([oa]s? |um |uma )/i;

export const PHRASES = data.pages.filter((p) => !p.lex && (p.tags ?? []).includes('frase'));

const byWord = new Map();
for (const p of PHRASES) {
  for (const w of new Set(words(p.term))) {
    if (!byWord.has(w)) byWord.set(w, []);
    byWord.get(w).push(p);
  }
}

/** Up to `max` phrasebook phrases holding the page's headword, commonest first. */
export function phrasesWith(page, max = 6) {
  const head = fold(String(page.term).replace(ARTICLE, '').trim());
  if (!head || head.includes(' ')) return [];
  return (byWord.get(head) ?? [])
    .filter((p) => p.slug !== page.slug)
    .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9))
    .slice(0, max);
}

export const isPhrase = (page) => !page.lex && (page.tags ?? []).includes('frase');
