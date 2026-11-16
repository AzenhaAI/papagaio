// sitemap.xml: the hand-kept section pages plus one URL per word page.
// Replaces the static public/sitemap.xml so new word pages are never missing.
import data from '../data/words.json';
import { shelfOf } from '../lib/letters.js';
import { LANGS, LOCALIZED, pageUrl } from '../lib/locales.js';

const STATIC = [
  // /papagaio/ opens the translator, so the translator is the page search
  // engines index as the front door: first, and at the top priority.
  ['https://azenha.ai/papagaio/translate/', '1.0'],
  ['https://azenha.ai/papagaio/', '0.9'],
  ['https://azenha.ai/papagaio/practice/', '0.9'],
  ['https://azenha.ai/papagaio/coach/', '0.9'],
  ['https://azenha.ai/papagaio/read/', '0.9'],
  ['https://azenha.ai/papagaio/dictionary/', '0.8'],
  ['https://azenha.ai/papagaio/phrasebook/', '0.8'],
  ['https://azenha.ai/papagaio/verbs/', '0.8'],
  ['https://azenha.ai/papagaio/madeirense/', '0.7'],
  ['https://azenha.ai/papagaio/features/', '0.8'],
  ['https://azenha.ai/papagaio/news/', '0.9'],
  ['https://azenha.ai/papagaio/apps/', '0.6'],
  ['https://azenha.ai/papagaio/progress/', '0.5'],
  ['https://azenha.ai/papagaio/about/', '0.7'],
  ['https://azenha.ai/papagaio/support/', '0.5'],
  ['https://azenha.ai/papagaio/privacy/', '0.3'],
];

export function GET() {
  const enc = (s) => encodeURI(s).replace(/&/g, '&amp;');
  const words = data.pages.map((p) => [`https://azenha.ai/papagaio/palavra/${p.slug}/`,
    p.lex ? '0.4' : p.rank && p.rank <= 300 ? '0.6' : '0.5']);
  const letters = [...new Set(data.pages.map((p) => shelfOf(p.term)).filter(Boolean))]
    .sort()
    .map((l) => [`https://azenha.ai/papagaio/palavras/${l}/`, '0.5']);
  // Language versions at the priority of their English page.
  const prio = Object.fromEntries(STATIC);
  const langs = LANGS.filter((l) => l !== 'en').flatMap((l) =>
    LOCALIZED.map((s) => [pageUrl(l, s), prio[pageUrl('en', s)] ?? '0.5']));
  const all = [...STATIC, ...langs, ['https://azenha.ai/papagaio/palavra/', '0.7'], ...letters, ...words];
  const body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    all.map(([u, pr]) => `  <url><loc>${enc(u)}</loc><lastmod>${data.built}</lastmod><priority>${pr}</priority></url>`).join('\n') +
    '\n</urlset>\n';
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
}
