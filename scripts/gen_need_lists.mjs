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

// Two lanes, two ceilings — one per provider, because their budgets are
// independent and adding them is the whole point of the second lane.
//
// Groq: 8000 a night, up from 4000. The old ceiling assumed the day's token
// budget was the wall; measuring showed the real wall is the per-minute
// limit, and the day's budget was never close to spent. The English queues
// SHARE this ceiling — each takes what the ones before it left — so a new
// direction some day never doubles the nightly spend behind our backs.
let budget = 8000;

// Workers AI: the pt→ru queue's own lane (via:cf in the generator), so it no
// longer competes with the English queues at all. 6000 sits well inside the
// free daily neuron allowance even on the 70b model.
let cfBudget = 6000;

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

// [term, pos] as before, plus the row id when the query asks for one: a queue
// spanning more than one id prefix cannot have the writer rebuild the id from
// term and pos, or every gloss it generates lands on nothing.
async function queue(sqlFor, file, lane = 'groq') {
  let rows = [];
  const left = lane === 'cf' ? cfBudget : budget;
  if (left > 0) {
    rows = (await ask(sqlFor(left))).map((r) => (r.id ? [r.term, r.pos, r.id] : [r.term, r.pos]));
    if (lane === 'cf') cfBudget -= rows.length;
    else budget -= rows.length;
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
// Both Portuguese layers: the English-sourced lemmas (lex:) and the words only
// the Portuguese Wiktionary carries (lexpt:), which no queue reached before and
// which would otherwise stay without Russian however many nights we run. Equal
// freq sorts lex: first, so the shared layer drains before the pt-only tail.
await queue(
  (n) => `SELECT id, term, pos FROM cards
     WHERE (id LIKE 'lex:%' OR id LIKE 'lexpt:%') AND course='pt'
     AND trans_ru IS NULL ORDER BY freq, id LIMIT ${n}`,
  'ru_need.json',
  'cf',
);
await queue(
  (n) => `SELECT term, pos FROM cards WHERE id LIKE 'lexen:%'
     AND trans_pt IS NULL ORDER BY freq LIMIT ${n}`,
  'enpt_need.json',
);
