// Model-generated Russian glosses for lexicon words the Russian Wiktionary
// does not know. Provenance kept honest: these land only where trans_ru is
// NULL, so a human-written gloss is never overwritten by a model's.
// Run: node scripts/gen_ru_model_glosses.mjs
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://papagaio.azenha.ai/api/gloss';
const KEY = readFileSync(join(root, '.batch_key'), 'utf8').trim();
const need = JSON.parse(readFileSync(join(root, 'build', 'ru_need.json'), 'utf8'));

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const out = join(root, 'build', 'ru_model.sql');
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
        // via:cf — this queue runs on the Workers AI lane. It is the biggest
        // queue by far, and moving it off Groq means the two providers' daily
        // budgets add up instead of being divided between three queues.
        body: JSON.stringify({ terms: batch.map(([t]) => t), to: 'ru', from: 'pt', via: 'cf' }),
      });
      d = await r.json();
      if (Array.isArray(d.glosses) && d.glosses.length === batch.length) break;
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 5000));
  }
  if (Array.isArray(d.glosses) && d.glosses.length === batch.length) {
    dryStreak = 0;
    const lines = batch.map(([t, p, id], k) => {
      const g = String(d.glosses[k] ?? '').trim().slice(0, 200);
      if (!g) return null;
      // The queue carries the id since it spans lex: and lexpt: alike; older
      // lists without one are all lex:, the prefix this rebuilt before.
      return `UPDATE cards SET trans_ru = ${q(g)} WHERE id = ${q(id ?? `lex:${t}|${p}`)} AND trans_ru IS NULL;`;
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
  // Workers AI throttles per request, not 30 RPM like Groq — a shorter pause
  // is polite enough, and the retry loop above absorbs the occasional slap.
  await new Promise((res) => setTimeout(res, 1200));
}
console.error(`done: ${ok} glosses, ${bad} failed → build/ru_model.sql`);
