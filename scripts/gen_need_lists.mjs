// Refresh the gloss queues from live D1 before a nightly batch run.
//
// Two queues, both frequency-first so the useful words land before the daily
// token budget runs out:
//   build/ru_need.json    pt lexicon rows with no Russian gloss
//   build/enpt_need.json  en lexicon rows with no Portuguese translation
//
// Run: node scripts/gen_need_lists.mjs
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function queue(sql, file) {
  const out = execFileSync('npx', [
    'wrangler', 'd1', 'execute', 'papagaio', '--remote', '--json', '--command', sql,
  ], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const rows = JSON.parse(out)[0].results.map((r) => [r.term, r.pos]);
  writeFileSync(join(root, 'build', file), JSON.stringify(rows));
  console.error(`${file}: ${rows.length}`);
  return rows.length;
}

// 4000 a night: what one Groq daily budget reliably digests with headroom
// left for live users on the fallback-protected main model.
queue(
  `SELECT term, pos FROM cards WHERE id LIKE 'lex:%' AND course='pt'
     AND trans_ru IS NULL ORDER BY freq LIMIT 4000`,
  'ru_need.json',
);
queue(
  `SELECT term, pos FROM cards WHERE id LIKE 'lexen:%'
     AND trans_pt IS NULL ORDER BY freq LIMIT 4000`,
  'enpt_need.json',
);
