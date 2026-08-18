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
const enByTerm = new Map();   // lowercase term -> Map(pos -> original term)
for (const f of readdirSync(join(root, 'data', 'lexicon')).filter((x) => x.endsWith('.json'))) {
  for (const w of JSON.parse(readFileSync(join(root, 'data', 'lexicon', f), 'utf8')).words) {
    const t = w.term.toLowerCase();
    existing.add(`${t}|${w.pos}`);
    if (!enByTerm.has(t)) enByTerm.set(t, new Map());
    enByTerm.get(t).set(w.pos, w.term);
  }
}

// The two wiktionaries disagree on part of speech for the same headword often
// enough to cost thousands of definitions: pt files multiword entries under
// "phrase" where en calls them nouns, and noun/adjective pairs land either way.
// Where the disagreement is a labelling difference rather than a different
// word, the pt definition still describes the card, so attach it. Classes that
// genuinely change meaning (verb vs noun, interjection vs noun) are left alone.
const CLASSES = [
  new Set(['noun', 'adj', 'num', 'abbrev']),
  new Set(['adj', 'adv']),
  new Set(['det', 'pron', 'article']),
];
const compatible = (a, b) => a === b || a === 'phrase' || b === 'phrase'
  || CLASSES.some((c) => c.has(a) && c.has(b));

// pt term -> the parts of speech pt-wiktionary knows for it. A term it files
// under several is ambiguous: we cannot tell which sense the card wants.
const ptPosByTerm = new Map();
const shards = readdirSync(join(root, 'data', 'lexicon_ptdef')).filter((x) => x.endsWith('.json')).sort();
for (const f of shards) {
  for (const w of JSON.parse(readFileSync(join(root, 'data', 'lexicon_ptdef', f), 'utf8')).words) {
    const t = w.term.toLowerCase();
    if (!ptPosByTerm.has(t)) ptPosByTerm.set(t, new Set());
    ptPosByTerm.get(t).add(POSMAP[w.pos] ?? w.pos);
  }
}

// The card this pt entry describes under a differently-labelled part of speech,
// or null when the match is ambiguous on either side.
const crossPos = (term, pos) => {
  if ((ptPosByTerm.get(term)?.size ?? 0) !== 1) return null;
  const cands = [...(enByTerm.get(term) ?? new Map())].filter(([p]) => compatible(pos, p));
  return cands.length === 1 ? cands[0] : null;
};

const lines = [];
const posfix = [];
let updated = 0, inserted = 0, crossed = 0;

for (const f of shards) {
  for (const w of JSON.parse(readFileSync(join(root, 'data', 'lexicon_ptdef', f), 'utf8')).words) {
    const pos = POSMAP[w.pos] ?? w.pos;
    const term = w.term.toLowerCase();
    const key = `${term}|${pos}`;
    const def = w.defs.join('; ').slice(0, 400);
    const cross = existing.has(key) ? null : crossPos(term, pos);
    if (existing.has(key)) {
      lines.push(`UPDATE cards SET def_pt = ${q(def)} WHERE id = ${q(`lex:${w.term}|${pos}`)};`);
      updated++;
    } else if (cross) {
      // Attach to the card that already exists rather than minting a lexpt:
      // duplicate of a word we carry under another label.
      const [enPos, enTerm] = cross;
      const stmt = `UPDATE cards SET def_pt = ${q(def)} WHERE id = ${q(`lex:${enTerm}|${enPos}`)};`;
      lines.push(stmt);
      posfix.push(stmt);
      crossed++;
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
// The cross-labelled updates on their own. ptdef.sql rebuilds the lexpt: rows
// with INSERT OR REPLACE, which drops columns added since (trans_ru), so a
// database that has been glossed since the last full load takes this file.
writeFileSync(join(root, 'build', 'ptdef_posfix.sql'), posfix.join('\n') + '\n');
console.error(`updated ${updated} existing, ${crossed} cross-pos, inserted ${inserted} new → build/ptdef.sql (+ ptdef_posfix.sql)`);
