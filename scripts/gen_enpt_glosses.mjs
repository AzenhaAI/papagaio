// Model-generated pt-PT glosses for English lexicon lemmas the en-wiktionary
// translation sections do not cover. Same provenance rule as the Russian
// batch: they land only where trans_pt is NULL, never over a human gloss.
// Run: node scripts/gen_need_lists.mjs && node scripts/gen_enpt_glosses.mjs
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://papagaio.shpara.com/api/gloss';
const KEY = readFileSync(join(root, '.batch_key'), 'utf8').trim();
const need = JSON.parse(readFileSync(join(root, 'build', 'enpt_need.json'), 'utf8'));

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const out = join(root, 'build', 'enpt_model.sql');
writeFileSync(out, '');
let ok = 0, bad = 0, dryStreak = 0;

for (let i = 0; i < need.length; i += 20) {
  const batch = need.slice(i, i + 20);
  let d = {};
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-batch-key': KEY },
        body: JSON.stringify({ terms: batch.map(([t]) => t), to: 'pt', from: 'en' }),
      });
      d = await r.json();
      if (Array.isArray(d.glosses) && d.glosses.length === batch.length) break;
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 5000));
  }
  if (Array.isArray(d.glosses) && d.glosses.length === batch.length) {
    dryStreak = 0;
    const lines = batch.map(([t, p], k) => {
      const g = String(d.glosses[k] ?? '').trim().slice(0, 200);
      if (!g) return null;
      return `UPDATE cards SET trans_pt = ${q(g)} WHERE id = ${q(`lexen:${t}|${p}`)} AND trans_pt IS NULL;`;
    }).filter(Boolean);
    appendFileSync(out, lines.join('\n') + '\n');
    ok += lines.length;
  } else {
    bad += batch.length;
    // Five failed batches in a row means the budget is gone for the day —
    // marching on just hammers the rate limiter for nothing.
    if (++dryStreak >= 5) { console.error('budget dry — stopping this run'); break; }
  }
  if (i % 400 === 0) console.error(`${i}/${need.length} (ok ${ok}, failed ${bad})`);
  await new Promise((res) => setTimeout(res, 2400)); // 30 RPM ceiling, politely under
}
console.error(`done: ${ok} glosses, ${bad} failed → build/enpt_model.sql`);
