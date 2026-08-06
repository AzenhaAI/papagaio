// Loads the monolingual layer into D1.
//
// Two moves: lemmas we already carry (English-glossed rows) get their
// Portuguese definition alongside in def_pt; lemmas only the Portuguese
// Wiktionary knows become new rows of their own, defined in Portuguese and
// tagged def-pt so clients can label them. Together this is the explanatory
// dictionary — the layer where the language explains itself.
//
// Run: node scripts/load_lexicon_ptdef.mjs  → build/ptdef.sql

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const q = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const fold = (x) => String(x ?? '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/['’`´ʼʹ]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/ +/g, ' ').trim();

// The English-Wiktionary layer aligned ids on term|pos with these pos names.
const POSMAP = { intj: 'interj' };

const existing = new Set();
for (const f of readdirSync(join(root, 'data', 'lexicon')).filter((x) => x.endsWith('.json'))) {
  for (const w of JSON.parse(readFileSync(join(root, 'data', 'lexicon', f), 'utf8')).words) {
    existing.add(`${w.term.toLowerCase()}|${w.pos}`);
  }
}

const lines = [];
let updated = 0, inserted = 0;

for (const f of readdirSync(join(root, 'data', 'lexicon_ptdef')).filter((x) => x.endsWith('.json')).sort()) {
  for (const w of JSON.parse(readFileSync(join(root, 'data', 'lexicon_ptdef', f), 'utf8')).words) {
    const pos = POSMAP[w.pos] ?? w.pos;
    const key = `${w.term.toLowerCase()}|${pos}`;
    const def = w.defs.join('; ').slice(0, 400);
    if (existing.has(key)) {
      lines.push(`UPDATE cards SET def_pt = ${q(def)} WHERE id = ${q(`lex:${w.term}|${pos}`)};`);
      updated++;
    } else {
      const entry = {
        meanings: w.defs.map((d) => ({ trans: d, note: 'definição em português' })),
        synonyms: [], collocations: [], grammar: '', conj: {},
        source: 'Wikcionário (CC BY-SA)',
      };
      const note = w.labels.length ? w.labels.join(', ') : null;
      lines.push(
        `INSERT OR REPLACE INTO cards (id, course, owner, term, trans, pos, gender, note, tags, freq, entry, fold, def_pt) VALUES (` +
        [q(`lexpt:${w.term}|${pos}`), q('pt'), q('lex'), q(w.term), q(def.slice(0, 200)), q(pos), 'NULL',
         q(note), q('["lexicon","def-pt"]'), '950000', q(JSON.stringify(entry)),
         q(fold(`${w.term} ${def}`).slice(0, 400)), q(def)].join(', ') + `);`
      );
      inserted++;
    }
  }
}

mkdirSync(join(root, 'build'), { recursive: true });
writeFileSync(join(root, 'build', 'ptdef.sql'), lines.join('\n') + '\n');
console.error(`updated ${updated} existing, inserted ${inserted} new → build/ptdef.sql`);
