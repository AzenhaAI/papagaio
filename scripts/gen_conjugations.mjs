// Full conjugation tables for every verb in the deck, written into build/conj.sql.
// The entry keeps whatever it already had (meanings, collocations, notes) — only
// conj is replaced, since the generator is now the authority on forms.
// Run: node scripts/gen_conjugations.mjs
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conjugate } from './conjugate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const deckDir = join(root, 'data', 'deck');

// Existing hand-written entries, so meanings survive the conj upgrade.
const entries = {};
try {
  for (const f of readdirSync(join(root, 'data', 'entries')).filter((x) => x.endsWith('.json'))) {
    Object.assign(entries, JSON.parse(readFileSync(join(root, 'data', 'entries', f), 'utf8')).entries);
  }
} catch { /* fine */ }

const rows = [];
let verbs = 0, skipped = 0;

for (const file of readdirSync(deckDir).filter((f) => f.endsWith('.json')).sort()) {
  const deck = JSON.parse(readFileSync(join(deckDir, file), 'utf8'));
  if (deck.meta.course !== 'pt') continue;
  for (const c of deck.cards) {
    if (c.pos !== 'verb') continue;
    const term = (c.term ?? c.pt).replace(/\s*\(.*\)$/, '').trim();
    // Reflexives and multi-word phrases conjugate on their head verb.
    const head = term.split(/[\s-]/)[0];
    const conj = conjugate(head);
    if (!conj) { skipped++; continue; }
    const entry = { ...(entries[c.id] ?? {}), conj };
    rows.push(
      `UPDATE cards SET entry = '${JSON.stringify(entry).replace(/'/g, "''")}' WHERE id = '${c.id}';`
    );
    verbs++;
  }
}

mkdirSync(join(root, 'build'), { recursive: true });
writeFileSync(join(root, 'build', 'conj.sql'), rows.join('\n') + '\n');
console.log(`${verbs} verbs conjugated across ten tenses, ${skipped} skipped → build/conj.sql`);
