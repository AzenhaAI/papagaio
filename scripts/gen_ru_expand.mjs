// Upgrade model one-worders into Multitran-style rows for the words people
// actually meet: «кот» → «кот (самец); кошка (о животном)».
//
// Only plain single-word model glosses qualify — anything with «;», «,», «(»
// or a stress mark came from Wiktionary/OpenRussian hands and is left alone.
// Frequency-first, 2000 a night, third in line after the fill queues.
//
// Some words genuinely have one equivalent and come back thin however often we
// ask. Those stay plain, so a naive queue re-asks the same words every night,
// forever, at the head of the frequency order — residue that compounds until it
// fills all 2000 slots. build/ru_expand_skip.json remembers them. Delete the
// file to give the whole pool another pass on a better model.
//
// Run: node scripts/gen_ru_expand.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://papagaio.azenha.ai/api/gloss';
const KEY = readFileSync(join(root, '.batch_key'), 'utf8').trim();

const skipPath = join(root, 'build', 'ru_expand_skip.json');
let skipSet = new Set();
try { skipSet = new Set(JSON.parse(readFileSync(skipPath, 'utf8'))); } catch { /* first run */ }

// Over-fetch by the skip count so the night still gets a full 2000 to chew on.
const listOut = execFileSync('npx', [
  'wrangler', 'd1', 'execute', 'papagaio', '--remote', '--json', '--command',
  `SELECT term, pos FROM cards WHERE id LIKE 'lex:%' AND course='pt'
     AND trans_ru IS NOT NULL AND trans_ru NOT LIKE '%;%'
     AND trans_ru NOT LIKE '%,%' AND trans_ru NOT LIKE '%(%'
     AND trans_ru NOT LIKE '%́%'
   ORDER BY freq LIMIT ${2000 + skipSet.size}`,
], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const need = JSON.parse(listOut)[0].results
  .map((r) => [r.term, r.pos])
  .filter(([t, p]) => !skipSet.has(`${t}|${p}`))
  .slice(0, 2000);
console.error(`expand queue: ${need.length} (skipping ${skipSet.size} known-thin)`);

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const out = join(root, 'build', 'ru_expand.sql');
writeFileSync(out, '');
let ok = 0, bad = 0, thin = 0, dryStreak = 0;

for (let i = 0; i < need.length; i += 20) {
  const batch = need.slice(i, i + 20);
  let d = {};
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-batch-key': KEY },
        body: JSON.stringify({ terms: batch.map(([t]) => t), to: 'ru', from: 'pt', rich: true }),
      });
      d = await r.json();
      if (Array.isArray(d.glosses) && d.glosses.length === batch.length) break;
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 5000));
  }
  if (Array.isArray(d.glosses) && d.glosses.length === batch.length) {
    dryStreak = 0;
    const lines = [];
    const declined = [];
    batch.forEach(([t, p], k) => {
      const g = String(d.glosses[k] ?? '').trim().slice(0, 240);
      // A rich row has structure; a bare echo of what we had is not an upgrade.
      if (!g || !/[;(]/.test(g)) { declined.push(`${t}|${p}`); return; }
      lines.push(`UPDATE cards SET trans_ru = ${q(g)} WHERE id = ${q(`lex:${t}|${p}`)};`);
    });
    if (lines.length) appendFileSync(out, lines.join('\n') + '\n');
    ok += lines.length;
    // Persist per batch, not at the end: a run that dies on budget still keeps
    // what it learned, instead of re-asking the same thin words tomorrow.
    if (declined.length) {
      thin += declined.length;
      for (const k of declined) skipSet.add(k);
      writeFileSync(skipPath, JSON.stringify([...skipSet]));
    }
  } else {
    bad += batch.length;
    // Five failed batches in a row means the budget is gone for the day —
    // marching on just hammers the rate limiter for nothing.
    if (++dryStreak >= 5) { console.error('budget dry — stopping this run'); break; }
  }
  if (i % 400 === 0) console.error(`${i}/${need.length} (ok ${ok}, thin ${thin}, failed ${bad})`);
  await new Promise((res) => setTimeout(res, 2400));
}
console.error(`done: ${ok} rich rows, ${thin} came back thin, ${bad} failed → build/ru_expand.sql`);
