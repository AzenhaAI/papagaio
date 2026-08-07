// Turn build/ru_deep.json into SQL: rich Russian glosses onto lexicon rows,
// and the inflection map into its own table for form-aware Russian search.
//
// The deep glosses REPLACE whatever trans_ru holds — they come from the same
// human source as the first pass but keep accents and sense notes, and they
// outrank a model's one-worder by construction.
//
// Run: node scripts/merge_ru_deep.mjs
//      npx wrangler d1 execute papagaio --remote --file build/ru_deep.sql (chunked)
//      npx wrangler d1 execute papagaio --remote --file build/ru_forms.sql (chunked)

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const deep = JSON.parse(readFileSync(join(root, 'build', 'ru_deep.json'), 'utf8'));
const forms = JSON.parse(readFileSync(join(root, 'build', 'ru_forms.json'), 'utf8'));

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;

// «ко́шка (домашняя кошка); кот» — accents kept, senses in brackets, короткая строка.
const glossLine = (list) => {
  const parts = [];
  for (const x of list.slice(0, 4)) {
    parts.push(x.s ? `${x.a ?? x.w} (${x.s})` : (x.a ?? x.w));
  }
  return parts.join('; ').slice(0, 240);
};

const lines = [`CREATE INDEX IF NOT EXISTS idx_cards_term ON cards(term);`];
for (const [course, side] of [['pt', deep.pt], ['en', deep.en]]) {
  for (const [term, list] of Object.entries(side)) {
    lines.push(
      `UPDATE cards SET trans_ru = ${q(glossLine(list))} ` +
      `WHERE owner = 'lex' AND course = ${q(course)} AND term = ${q(term)};`
    );
  }
}
writeFileSync(join(root, 'build', 'ru_deep.sql'), lines.join('\n') + '\n');
console.error(`${lines.length - 1} gloss updates → build/ru_deep.sql`);

const fl = [
  `CREATE TABLE IF NOT EXISTS ru_forms (form TEXT PRIMARY KEY, lemma TEXT NOT NULL);`,
  `DELETE FROM ru_forms;`,
];
const entries = Object.entries(forms);
for (let i = 0; i < entries.length; i += 500) {
  const vals = entries.slice(i, i + 500).map(([f, l]) => `(${q(f)}, ${q(l)})`).join(',');
  fl.push(`INSERT OR IGNORE INTO ru_forms (form, lemma) VALUES ${vals};`);
}
writeFileSync(join(root, 'build', 'ru_forms.sql'), fl.join('\n') + '\n');
console.error(`${entries.length} forms in ${fl.length - 2} statements → build/ru_forms.sql`);
