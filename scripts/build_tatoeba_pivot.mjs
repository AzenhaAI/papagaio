// Pivoted pt↔ru example pairs: Tatoeba's Portuguese sentences rarely carry a
// direct Russian translation (31k), but both sides translate English heavily.
// Chain pt→en→ru through the shared English sentence and the pt-ru corpus
// roughly doubles. Chained pairs are honestly second-class — the `via` column
// marks them so every surface can whisper "via English" next to the sentence.
//
// Run: node scripts/build_tatoeba_pivot.mjs → build/examples_pivot.sql

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const C = join(root, '.cache');

const readTsv = (bz2) => {
  const plain = bz2.replace(/\.bz2$/, '');
  if (!existsSync(join(C, plain))) execSync(`bunzip2 -k ${join(C, bz2)}`);
  return readFileSync(join(C, plain), 'utf8').split('\n');
};

const fold = (x) => String(x ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/['’`´ʼʹ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/ +/g, ' ').trim();
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;

const pt = new Map(), ru = new Map();
for (const l of readTsv('por_sentences.tsv.bz2')) {
  const [id, , text] = l.split('\t');
  if (id && text && text.length <= 110) pt.set(id, text);
}
for (const l of readTsv('rus_sentences.tsv.bz2')) {
  const [id, , text] = l.split('\t');
  if (id && text && text.length <= 110) ru.set(id, text);
}

// Direct pt-ru links: the pairs we must NOT duplicate.
const direct = new Set();
for (const l of readTsv('por-rus_links.tsv.bz2')) {
  const [a, b] = l.split('\t');
  if (a && b) direct.add(`${a}|${b}`);
}

// eng sentence id → portuguese ids that translate it.
const engToPt = new Map();
for (const l of readTsv('por-eng_links.tsv.bz2')) {
  const [p, e] = l.split('\t');
  if (p && e && pt.has(p)) (engToPt.get(e) ?? engToPt.set(e, []).get(e)).push(p);
}

const seen = new Set();
const pairs = [];
for (const l of readTsv('eng-rus_links.tsv.bz2')) {
  const [e, r] = l.split('\t');
  if (!e || !r || !ru.has(r)) continue;
  for (const p of engToPt.get(e) ?? []) {
    if (direct.has(`${p}|${r}`)) continue;
    const src = pt.get(p), dst = ru.get(r);
    const key = `${fold(src)}|${dst}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push([src, dst]);
  }
}

// Shortest sentences teach best — and cap the flood.
pairs.sort((a, b) => a[0].length - b[0].length);
const keep = pairs.slice(0, 45000);

const lines = [`ALTER TABLE examples ADD COLUMN via TEXT;`];
for (const [src, dst] of keep) {
  lines.push(
    `INSERT INTO examples (pair, src, dst, fold, via) VALUES ('pt-ru', ${q(src)}, ${q(dst)}, ${q(fold(src))}, 'en');`
  );
}
writeFileSync(join(root, 'build', 'examples_pivot.sql'), lines.join('\n') + '\n');
console.error(`pivoted pairs: ${pairs.length}, kept ${keep.length} → build/examples_pivot.sql`);
