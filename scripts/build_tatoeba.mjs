// Real sentence pairs from Tatoeba (CC-BY): the examples block Yandex has and
// dictionaries live by. Short sentences preferred — an example you can read at
// a glance teaches; a paragraph is homework.
// Run: node scripts/build_tatoeba.mjs → build/examples.sql
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

const sentence = new Map(); // id → text
for (const f of ['por_sentences.tsv', 'rus_sentences.tsv']) {
  for (const l of readTsv(f + '.bz2')) {
    const [id, , text] = l.split('\t');
    if (id && text && text.length <= 110) sentence.set(id, text);
  }
}
// eng detailed has extra columns; text is still third.
for (const l of readTsv('eng_sentences_detailed.tsv.bz2')) {
  const [id, , text] = l.split('\t');
  if (id && text && text.length <= 110) sentence.set(id, text);
}

const fold = (x) => String(x ?? '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/['’`´ʼʹ]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/ +/g, ' ').trim();
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;

const lines = [
  `CREATE TABLE IF NOT EXISTS examples (pair TEXT, src TEXT, dst TEXT, fold TEXT);`,
  `DELETE FROM examples;`,
];
const CAP = { 'pt-ru': 60000, 'pt-en': 90000, 'en-ru': 60000 };
const seen = new Set();

for (const [file, pair] of [['por-rus_links.tsv', 'pt-ru'], ['por-eng_links.tsv', 'pt-en'], ['eng-rus_links.tsv', 'en-ru']]) {
  let n = 0;
  for (const l of readTsv(file + '.bz2')) {
    if (n >= CAP[pair]) break;
    const [a, b] = l.split('\t');
    const src = sentence.get(a), dst = sentence.get(b);
    if (!src || !dst) continue;
    const k = `${pair}|${src}`;
    if (seen.has(k)) continue; // one translation per source sentence is plenty
    seen.add(k);
    lines.push(`INSERT INTO examples (pair, src, dst, fold) VALUES (${q(pair)}, ${q(src)}, ${q(dst)}, ${q(fold(src).slice(0, 200))});`);
    n++;
  }
  console.error(`${pair}: ${n} pairs`);
}
writeFileSync(join(root, 'build', 'examples.sql'), lines.join('\n') + '\n');
console.error(`total ${lines.length - 2} rows → build/examples.sql`);
