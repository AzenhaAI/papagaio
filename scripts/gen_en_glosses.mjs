// Hidden translation layers for the English deck: every EN term gets a pt-PT
// gloss (shown to everyone) and a Russian one (shown in the Russian mode).
// Glossing runs through the worker's /api/gloss so the model key never leaves
// Cloudflare. Output: build/en_gloss.sql
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://azenha.ai/api/gloss';

const cards = [];
for (const f of readdirSync(join(root, 'data', 'deck')).filter((x) => x.startsWith('en_core'))) {
  cards.push(...JSON.parse(readFileSync(join(root, 'data', 'deck', f), 'utf8')).cards);
}
console.error(`${cards.length} EN cards`);

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const lines = [];

for (const to of ['pt', 'ru']) {
  for (let i = 0; i < cards.length; i += 20) {
    const batch = cards.slice(i, i + 20);
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ terms: batch.map((c) => c.term), to }),
    });
    // Cloudflare occasionally answers a burst with an HTML error page; treat
    // any non-JSON as a retryable miss instead of dying mid-run.
    let d;
    try {
      d = await r.json();
    } catch {
      console.error(`batch ${to}/${i}: HTTP ${r.status}, retrying once`);
      await new Promise((res) => setTimeout(res, 3000));
      const r2 = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ terms: batch.map((c) => c.term), to }),
      });
      d = await r2.json().catch(() => ({}));
    }
    if (!Array.isArray(d.glosses) || d.glosses.length !== batch.length) {
      console.error(`batch ${to}/${i}: bad answer, skipping`, d.error ?? '');
      continue;
    }
    batch.forEach((c, k) => {
      const g = d.glosses[k]?.trim();
      if (g) lines.push(`UPDATE cards SET trans_${to} = ${q(g)} WHERE id = ${q(c.id)};`);
    });
    process.stderr.write(`\r${to} ${Math.min(i + 20, cards.length)}/${cards.length}   `);
    await new Promise((res) => setTimeout(res, 400));
  }
  console.error('');
}

mkdirSync(join(root, 'build'), { recursive: true });
writeFileSync(join(root, 'build', 'en_gloss.sql'), lines.join('\n') + '\n');
console.error(`${lines.length} updates → build/en_gloss.sql`);
