// Upgrade model one-worders into Multitran-style rows for the words people
// actually meet: «кот» → «кот (самец); кошка (о животном)».
//
// Only plain single-word model glosses qualify — anything with «;», «,», «(»
// or a stress mark came from Wiktionary/OpenRussian hands and is left alone.
// Frequency-first, 2000 a night, third in line after the fill queues.
//
// Run: node scripts/gen_ru_expand.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://papagaio.kirshp.workers.dev/api/gloss';
const KEY = readFileSync(join(root, '.batch_key'), 'utf8').trim();

const listOut = execFileSync('npx', [
  'wrangler', 'd1', 'execute', 'papagaio', '--remote', '--json', '--command',
  `SELECT term, pos FROM cards WHERE id LIKE 'lex:%' AND course='pt'
     AND trans_ru IS NOT NULL AND trans_ru NOT LIKE '%;%'
     AND trans_ru NOT LIKE '%,%' AND trans_ru NOT LIKE '%(%'
     AND trans_ru NOT LIKE '%́%'
   ORDER BY freq LIMIT 2000`,
], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const need = JSON.parse(listOut)[0].results.map((r) => [r.term, r.pos]);
console.error(`expand queue: ${need.length}`);

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const out = join(root, 'build', 'ru_expand.sql');
writeFileSync(out, '');
let ok = 0, bad = 0;

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
    const lines = batch.map(([t, p], k) => {
      const g = String(d.glosses[k] ?? '').trim().slice(0, 240);
      // A rich row has structure; a bare echo of what we had is not an upgrade.
      if (!g || !/[;(]/.test(g)) return null;
      return `UPDATE cards SET trans_ru = ${q(g)} WHERE id = ${q(`lex:${t}|${p}`)};`;
    }).filter(Boolean);
    appendFileSync(out, lines.join('\n') + '\n');
    ok += lines.length;
  } else {
    bad += batch.length;
  }
  if (i % 400 === 0) console.error(`${i}/${need.length} (ok ${ok}, failed ${bad})`);
  await new Promise((res) => setTimeout(res, 2400));
}
console.error(`done: ${ok} rich rows, ${bad} failed → build/ru_expand.sql`);
