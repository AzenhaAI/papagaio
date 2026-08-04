// Loads data/lexicon into D1 as owner='lex' rows.
//
// They live in the same table as the deck but are never taught: every deck query
// filters on `owner IS NULL`. What they give us is a dictionary that answers
// instantly, from a human-written source, instead of asking a model and hoping.
//
// Run:  node scripts/load_lexicon.mjs > build/lexicon.sql
//       npx wrangler d1 execute papagaio --remote --file build/lexicon.sql

import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'data', 'lexicon');

const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

const lines = [`DELETE FROM cards WHERE owner = 'lex';`];
let n = 0;

for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  for (const w of JSON.parse(readFileSync(join(dir, f), 'utf8')).words) {
    // A gloss list, not an essay: the first three senses are what a learner
    // reads before deciding whether this is the word they met.
    const trans = w.senses.slice(0, 3).map((s) => s.trans).join('; ').slice(0, 300);
    const entry = {
      meanings: w.senses.map((s) => ({
        trans: s.trans,
        note: [s.tags?.length ? s.tags.join(', ') : '', s.ex ?? ''].filter(Boolean).join(' · '),
      })),
      synonyms: [],
      collocations: [],
      // Credit travels with the data, not just with the page that shows it.
      grammar: '',
      conj: {},
      source: 'Wiktionary (CC BY-SA 4.0)',
    };
    lines.push(
      `INSERT OR REPLACE INTO cards (id, course, owner, term, trans, pos, gender, note, ex_t, ex_trans, tags, unit, freq, audio, entry) VALUES (` +
      [
        q(`lex:${w.term}|${w.pos}`), q('pt'), q('lex'), q(w.term), q(trans), q(w.pos), q(w.gender),
        'NULL', q(w.senses.find((s) => s.ex)?.ex ?? null), 'NULL', q('["lexicon"]'), 'NULL',
        String(w.rank), 'NULL', q(JSON.stringify(entry)),
      ].join(', ') + `);`
    );
    n++;
  }
}

mkdirSync(join(root, 'build'), { recursive: true });
writeFileSync(join(root, 'build', 'lexicon.sql'), lines.join('\n') + '\n');
process.stderr.write(`${n} rows → build/lexicon.sql\n`);
