// Merge the inverted ru-wiktionary equivalents into trans_ru across both
// dictionaries. Human wiktionary glosses stay first, model glosses survive,
// the inverted equivalents append — deduped, capped, Multitran-flavoured.
// Run: node scripts/merge_ru_enrich.mjs → build/enrich.sql
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const enrich = JSON.parse(readFileSync(join(root, 'build', 'ru_enrich.json'), 'utf8'));

// Current trans_ru state, reconstructed from the load files.
const existing = new Map();
const eat = (file, re) => {
  let txt = '';
  try { txt = readFileSync(join(root, 'build', file), 'utf8'); } catch { return; }
  for (const line of txt.split('\n')) {
    const m = re.exec(line);
    if (m && !existing.has(m[2])) existing.set(m[2], m[1]);
  }
};
// ru.sql: UPDATE cards SET trans_ru = '...' WHERE id = 'lex:...'
eat('ru.sql', /SET trans_ru = '((?:[^']|'')*)' WHERE id = '((?:[^']|'')*)'/);
eat('ru_model.sql', /SET trans_ru = '((?:[^']|'')*)' WHERE id = '((?:[^']|'')*)'/);

// term → all ids across the three shard families.
const ids = new Map(); // key `${course}|${term}` → [ids]
const addIds = (dir, prefix, course, getTerm, getPos) => {
  for (const f of readdirSync(join(root, 'data', dir)).filter((x) => x.endsWith('.json')).sort()) {
    for (const w of JSON.parse(readFileSync(join(root, 'data', dir, f), 'utf8')).words) {
      const k = `${course}|${getTerm(w).toLowerCase()}`;
      (ids.get(k) ?? ids.set(k, []).get(k)).push(`${prefix}:${getTerm(w)}|${getPos(w)}`);
    }
  }
};
addIds('lexicon', 'lex', 'pt', (w) => w.term, (w) => w.pos);
addIds('lexicon_ptdef', 'lexpt', 'pt', (w) => w.term, (w) => { const m = { intj: 'interj' }; return m[w.pos] ?? w.pos; });
addIds('lexicon_en', 'lexen', 'en', (w) => w.term, (w) => w.pos);

const norm = (x) => x.toLowerCase().replace(/[.,;()]+/g, ' ').trim();
const lines = [];
let touched = 0;

for (const [course, table] of [['pt', enrich.pt], ['en', enrich.en]]) {
  for (const [word, rus] of Object.entries(table)) {
    const rowIds = ids.get(`${course}|${word}`);
    if (!rowIds) continue;
    for (const id of rowIds) {
      const parts = [];
      const seen = new Set();
      const push = (x) => {
        const t = x.trim();
        if (!t || seen.has(norm(t))) return;
        seen.add(norm(t));
        parts.push(t);
      };
      for (const p of (existing.get(id) ?? '').split('; ')) if (p) push(p);
      for (const r of rus) push(r);
      if (!parts.length) continue;
      const merged = parts.slice(0, 8).join('; ').slice(0, 300);
      if (merged === existing.get(id)) continue;
      lines.push(`UPDATE cards SET trans_ru = ${q(merged)} WHERE id = ${q(id)};`);
      touched++;
    }
  }
}
writeFileSync(join(root, 'build', 'enrich.sql'), lines.join('\n') + '\n');
console.error(`${touched} rows enriched → build/enrich.sql`);
