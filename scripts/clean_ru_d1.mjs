// Write the mechanical Russian clean-up (scripts/lib/ru_clean.mjs: stress
// marks, exact repeats) back to D1, most frequent rows first.
//
// These edits cannot change what a gloss means, so they skip the model gate
// the parity brief asks for on every other rewrite — agreed on 2026-09-27.
// They still go through parity_writeback.mjs: guarded on the old value, and
// every old value kept in gloss_history under the run tag.
//
// D1's free tier allows ~100k rows written per day, shared with live users,
// and one change costs ~4 (history row + its index + the update). So the
// script takes a --limit and skips what already landed: run it once a day
// until it reports nothing left.
//
// Needs the page cache from export_packs_d1.mjs (build/d1/cards.json).
// Run: node scripts/clean_ru_d1.mjs [--limit 12000] [--dry]
//      → build/d1/ru_flags.json lists what needs a human or the gate

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanRu, flagRu } from './lib/ru_clean.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TAG = 'ru-mechanical-2026-09';
const args = process.argv.slice(2);
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : 12000;
const dry = args.includes('--dry');

const cards = JSON.parse(readFileSync(join(root, 'build', 'd1', 'cards.json'), 'utf8'));
const donePath = join(root, 'build', 'd1', 'ru_clean_done.json');
const done = new Set(existsSync(donePath) ? JSON.parse(readFileSync(donePath, 'utf8')) : []);

const changes = [], flags = [];
const why = (a, b) => {
  const r = [];
  if (/́/.test(a)) r.push('stress marks');
  if (a.replace(/́/g, '').split(/[;,]/).length !== b.split(/[;,]/).length) r.push('exact repeats');
  return `mechanical: ${r.join(', ') || 'spacing'}`;
};
for (const c of [...cards].sort((a, b) => (a.freq ?? 1e9) - (b.freq ?? 1e9))) {
  if (!c.trans_ru) continue;
  const next = cleanRu(c.trans_ru);
  const f = flagRu(next);
  if (f.length) flags.push({ id: c.id, freq: c.freq, ru: next, flags: f });
  if (next !== c.trans_ru && next && !done.has(c.id)) {
    changes.push({ id: c.id, layer: 'ru', old: c.trans_ru, new: next, why: why(c.trans_ru, next) });
  }
}
writeFileSync(join(root, 'build', 'd1', 'ru_flags.json'), JSON.stringify(flags, null, 1));
const batch = changes.slice(0, limit);
console.error(`pending ${changes.length} (already done ${done.size}); this run ${batch.length}; flagged for review ${flags.length}`);
if (dry || !batch.length) {
  for (const c of batch.slice(0, 15)) console.error(`${c.id}: ${c.old} → ${c.new}`);
  process.exit(0);
}

const file = join(root, 'build', 'd1', 'ru_clean_batch.json');
writeFileSync(file, JSON.stringify(batch));
execFileSync('node', [join(root, 'scripts', 'parity_writeback.mjs'), file, TAG], { cwd: root, stdio: 'inherit' });
for (const c of batch) done.add(c.id);
writeFileSync(donePath, JSON.stringify([...done]));
