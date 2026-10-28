// Adds the missing function words (contractions, demonstratives, pronoun
// pairs: ao, do, na, nesta, dele, lho, cuja…) to the dictionary.
//
// A beginner searching "esta" landed on the verb estar, and "ao" or "do" —
// among the ten commonest words of the language — found nothing at all.
//
//   node scripts/add_function_words.mjs           # app pack only, prints the SQL
//   node scripts/add_function_words.mjs --d1      # also inserts into D1
//
// Source: build/dict_fixes/function_words.json [{t, p, g, r, e, ru, d}].
// The app pack gets new rows appended (a word that already has other senses
// keeps them — "nos" stays the pronoun too). D1 gets INSERT OR IGNORE rows
// with ids lex:<term>|<pos>: nothing that exists is touched, so there is
// nothing to archive.

import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const words = JSON.parse(readFileSync('build/dict_fixes/function_words.json', 'utf8'));
const packPath = '../papagaio_app/assets/packs/pt.json.gz';
const pack = JSON.parse(gunzipSync(readFileSync(packPath)).toString('utf8'));

const have = new Set(pack.map((r) => `${r.t}|${r.p}`));
let added = 0;
for (const w of words) {
  if (have.has(`${w.t}|${w.p}`)) continue;
  pack.push({ t: w.t, p: w.p, g: w.g ?? null, r: w.r, e: w.e, ru: w.ru, d: w.d });
  have.add(`${w.t}|${w.p}`);
  added++;
}
writeFileSync(packPath, gzipSync(JSON.stringify(pack)));
console.log(`app pack: ${added} rows added, ${pack.length} in all`);

const q = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);
const sql = words.map((w) =>
  `INSERT OR IGNORE INTO cards (id, course, term, trans, pos, gender, tags, freq, owner, fold, trans_ru, def_pt, trans_en) VALUES (` +
  [q(`lex:${w.t}|${w.p}`), q('pt'), q(w.t), q(w.e), q(w.p), q(w.g ?? null), q('["lexicon","function-word"]'),
    Number(w.r) || 0, q('lex'), q(fold(`${w.t} ${w.e}`)), q(w.ru), q(w.d), q(w.e)].join(', ') + ');'
).join('\n');
writeFileSync('build/dict_fixes/function_words.sql', sql + '\n');
console.log(`D1: ${words.length} INSERT OR IGNORE statements in build/dict_fixes/function_words.sql`);

if (process.argv.includes('--d1')) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'papagaio', '--remote', '--file',
    'build/dict_fixes/function_words.sql', '--yes'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const m = out.match(/"changes":\s*(\d+)/);
  console.log(`D1: ${m ? m[1] : '?'} rows written`);
}
