// True retention vs the scheduler's target — the number FSRS tuning starts
// from. The scheduler aims at DESIRED_R = 0.9; if measured recall at review
// time drifts from it, DESIRED_R (or the weights) should move.
//
// Honest by design: below 300 graded answers per course it refuses to
// recommend anything — 41 reviews fit noise, not memory.
//
// Run: node scripts/fit_fsrs.mjs   (read-only; prints, changes nothing)

import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const q = (sql) => JSON.parse(execFileSync('npx', [
  'wrangler', 'd1', 'execute', 'papagaio', '--remote', '--json', '--command', sql,
], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }))[0].results;

// A review event = an answer on a card that was NOT new (rating present).
// correct = rating >= 3 (Good/Easy); Again/Hard means the memory failed or
// nearly failed at the moment the scheduler predicted 90% recall.
const rows = q(`SELECT c.course,
         COUNT(*) AS reviews,
         SUM(CASE WHEN e.rating >= 3 THEN 1 ELSE 0 END) AS recalled,
         SUM(CASE WHEN e.rating = 1 THEN 1 ELSE 0 END) AS again
  FROM events e JOIN cards c ON c.id = e.card_id
  WHERE e.kind = 'answer' AND e.rating IS NOT NULL
  GROUP BY c.course`);

console.log('course  reviews  true-retention  again-rate');
let enough = false;
for (const r of rows) {
  const ret = r.reviews ? (r.recalled / r.reviews) : 0;
  console.log(
    `${r.course.padEnd(7)} ${String(r.reviews).padEnd(8)} ` +
    `${(ret * 100).toFixed(1)}%          ${((r.again / r.reviews) * 100).toFixed(1)}%`);
  if (r.reviews >= 300) {
    enough = true;
    const target = 0.9;
    if (ret > target + 0.04) {
      console.log(`  → ${r.course}: retention is comfortably above target — ` +
        `DESIRED_R could drop (0.87–0.88) to spend fewer slots on what already holds.`);
    } else if (ret < target - 0.04) {
      console.log(`  → ${r.course}: retention is under target — ` +
        `raise DESIRED_R to 0.92 or slow new cards until it recovers.`);
    } else {
      console.log(`  → ${r.course}: on target, leave DESIRED_R at 0.9.`);
    }
  }
}
if (!enough) {
  console.log('\nNot enough graded reviews for tuning yet (need 300+ per course).');
  console.log('Rerun in a few weeks — the data accumulates by itself.');
}
