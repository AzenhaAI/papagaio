// sitemap.xml: the hand-kept section pages plus one URL per word page.
// Replaces the static public/sitemap.xml so new word pages are never missing.
import data from '../data/words.json';

const STATIC = [
  ['https://azenha.ai/papagaio/', '1.0'],
  ['https://azenha.ai/papagaio/translate/', '0.9'],
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
  const words = data.pages.map((p) => [`https://azenha.ai/papagaio/palavra/${p.slug}/`, p.rank && p.rank <= 300 ? '0.6' : '0.5']);
  const all = [...STATIC, ['https://azenha.ai/papagaio/palavra/', '0.7'], ...words];
  const body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    all.map(([u, pr]) => `  <url><loc>${enc(u)}</loc><lastmod>${data.built}</lastmod><priority>${pr}</priority></url>`).join('\n') +
    '\n</urlset>\n';
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
}
