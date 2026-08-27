// Give a real frequency rank to the rows that only ever had a sentinel.
//
// build_lexicon.mjs ranks against the OpenSubtitles top-50k list and parks
// everything it does not find at 900000; load_lexicon_ptdef.mjs never ranked at
// all and parks its whole layer at 950000. Between them that is 94296 of the
// 110133 Portuguese rows — 86% — sharing two values.
//
// Nothing reads that as "unranked". Every nightly job orders by `freq, id`, so
// across those two sentinels the tie-break is the id, and "frequency order"
// silently becomes alphabetical order. That is why the expansion queue kept
// surfacing 's-Hertogenbosch and &c while ordinary words waited.
//
// The same source has a full list, 770227 words against the top 50k, which
// reaches 27% of the lexpt: layer and 46% of the lex: tail. Rows it does not
// know keep their sentinel and stay at the back, where they belong.
//
// Run: node scripts/rank_tail.mjs → build/rank_tail.sql
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FREQ = join(root, '.cache', 'pt_full.txt');

// Position in the list is the rank. Keep the first sighting: the file is
// already ordered by count, and a word can repeat across casings.
const rank = new Map();
readFileSync(FREQ, 'utf8').split('\n').forEach((line, i) => {
  const w = line.split(' ')[0].trim().toLowerCase();
  if (w && !rank.has(w)) rank.set(w, i);
});
console.error(`frequency list: ${rank.size} words`);

const rows = JSON.parse(execFileSync('npx', [
  'wrangler', 'd1', 'execute', 'papagaio', '--remote', '--json', '--command',
  `SELECT id, term FROM cards
     WHERE id LIKE 'lexpt:%' OR (id LIKE 'lex:%' AND freq = 900000)`,
], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }))[0].results;
console.error(`sentinel rows: ${rows.length}`);

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const out = join(root, 'build', 'rank_tail.sql');
writeFileSync(out, '');

let ranked = 0, left = 0, buf = [];
for (const r of rows) {
  const p = rank.get(String(r.term ?? '').toLowerCase());
  if (p === undefined) { left++; continue; }
  // The head of the full list IS the top-50k list, so a word common enough to
  // sit there gets the same number the already-ranked rows carry and sorts
  // among them rather than behind them.
  buf.push(`UPDATE cards SET freq = ${p} WHERE id = ${q(r.id)};`);
  ranked++;
  if (buf.length >= 2000) { appendFileSync(out, buf.join('\n') + '\n'); buf = []; }
}
if (buf.length) appendFileSync(out, buf.join('\n') + '\n');
console.error(`done: ${ranked} rows ranked, ${left} keep their sentinel → build/rank_tail.sql`);
