// Refresh the gloss queues from live D1 before a nightly batch run.
//
// Three queues, all frequency-first so the useful words land before the daily
// token budget runs out:
//   build/enru_need.json  en lexicon rows with no Russian gloss
//   build/ru_need.json    pt lexicon rows with no Russian gloss
//   build/enpt_need.json  en lexicon rows with no Portuguese translation
//
// Run: node scripts/gen_need_lists.mjs
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// 4000 a night: what one Groq daily budget reliably digests with headroom
// left for live users on the fallback-protected main model. The queues SHARE
// that ceiling — each takes what the ones before it left — so adding a fourth
// direction some day never doubles the nightly spend behind our backs.
let budget = 4000;

// wrangler drops a remote query every so often for no lasting reason. This is
// the one step the nightly run has no retry for, and a throw here kills the
// whole batch before a single gloss is written — so it gets three tries.
async function ask(sql) {
  for (let attempt = 1; ; attempt++) {
    try {
      return JSON.parse(execFileSync('npx', [
        'wrangler', 'd1', 'execute', 'papagaio', '--remote', '--json',
        '--command', sql,
      ], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))[0].results;
    } catch (e) {
      if (attempt === 3) throw e;
      console.error(`d1 query failed (attempt ${attempt}), retrying`);
      await new Promise((res) => setTimeout(res, 5000));
    }
  }
}

async function queue(sqlFor, file) {
  let rows = [];
  if (budget > 0) {
    rows = (await ask(sqlFor(budget))).map((r) => [r.term, r.pos]);
    budget -= rows.length;
  }
  // Always rewrite, including the empty case: a queue skipped for budget must
  // not leave yesterday's list on disk for the generator to run a second time.
  writeFileSync(join(root, 'build', file), JSON.stringify(rows));
  console.error(`${file}: ${rows.length}`);
  return rows.length;
}

// English before the Portuguese tail on purpose: the pt queue is past its
// frequency-ranked core and down to unranked rare inflections (fanfarronada
// and friends), while these are ordinary English words that the Russian mode
// shows as the answer side of a live card. Swap the two calls to flip it back.
await queue(
  (n) => `SELECT term, pos FROM cards WHERE id LIKE 'lexen:%'
     AND trans_ru IS NULL ORDER BY freq LIMIT ${n}`,
  'enru_need.json',
);
await queue(
  (n) => `SELECT term, pos FROM cards WHERE id LIKE 'lex:%' AND course='pt'
     AND trans_ru IS NULL ORDER BY freq LIMIT ${n}`,
  'ru_need.json',
);
await queue(
  (n) => `SELECT term, pos FROM cards WHERE id LIKE 'lexen:%'
     AND trans_pt IS NULL ORDER BY freq LIMIT ${n}`,
  'enpt_need.json',
);
