// English lemmas into D1 as course='en' lexicon rows: definition as the gloss,
// Russian and Portuguese equivalents in their overlay columns — the same three
// floors the Portuguese side already has, mirrored.
// Run: node scripts/load_lexicon_en.mjs → build/en_lex.sql
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const q = (v) => (v == null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const fold = (x) => String(x ?? '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/['’`´ʼʹ]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/ +/g, ' ').trim();

// Wiktionary's English dumps tag interjections "intj" while every Portuguese
// loader here normalises them to "interj". Loading the raw tag split one part
// of speech across two names, so any filter on interjections saw half the
// dictionary. Ids embed the tag (lexen:term|pos) and the gloss jobs rebuild
// that id from the pos column, so the two must be normalised together.
const POSMAP = { intj: 'interj' };
const posOf = (w) => POSMAP[w.pos] ?? w.pos;

const lines = [`DELETE FROM cards WHERE owner = 'lex' AND course = 'en';`];
let n = 0;
for (const f of readdirSync(join(root, 'data', 'lexicon_en')).filter((x) => x.endsWith('.json')).sort()) {
  for (const w of JSON.parse(readFileSync(join(root, 'data', 'lexicon_en', f), 'utf8')).words) {
    const def = w.defs.join('; ').slice(0, 300);
    const entry = {
      meanings: w.defs.map((d) => ({ trans: d, note: '' })),
      synonyms: [], collocations: [], grammar: '', conj: {},
      source: 'English Wiktionary (CC BY-SA 4.0)',
    };
    lines.push(
      `INSERT OR REPLACE INTO cards (id, course, owner, term, trans, trans_ru, trans_pt, pos, tags, freq, entry, fold) VALUES (` +
      [q(`lexen:${w.term}|${posOf(w)}`), q('en'), q('lex'), q(w.term), q(def),
       q(w.ru.join(', ') || null), q(w.pt.join(', ') || null), q(posOf(w)),
       q('["lexicon"]'), String(w.rank), q(JSON.stringify(entry)),
       q(fold(`${w.term} ${w.ru.join(' ')} ${def}`).slice(0, 400))].join(', ') + `);`
    );
    n++;
  }
}
mkdirSync(join(root, 'build'), { recursive: true });
writeFileSync(join(root, 'build', 'en_lex.sql'), lines.join('\n') + '\n');
console.error(`${n} rows → build/en_lex.sql`);
