// The English dictionary layer: top-frequency English lemmas with their own
// articles — definitions, plus Russian and Portuguese equivalents lifted from
// en-Wiktionary's human-written translation sections. This is what turns
// "cat → o gato" from a bridge into a real EN entry with an RU/PT floor.
//
// Streams the 3.2 GB kaikki dump; keeps nothing in memory but the survivors.
// Run: node scripts/build_lexicon_en.mjs [maxRank=40000]

import { createInterface } from 'node:readline';
import { createReadStream, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAX = parseInt(process.argv[2] ?? '40000', 10);
const outDir = join(root, 'data', 'lexicon_en');
mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) rmSync(join(outDir, f));

const rank = new Map();
readFileSync(join(root, '.cache', 'en_50k.txt'), 'utf8').split('\n').forEach((l, i) => {
  const w = l.split(' ')[0];
  if (w && !rank.has(w)) rank.set(w, i);
});

const POS = new Set(['noun', 'verb', 'adj', 'adv', 'phrase', 'intj', 'pron', 'prep', 'conj', 'num', 'det']);
const SKIP_GLOSS = /\b(spelling of|form of|abbreviation of|initialism of|misspelling|obsolete)\b/i;

const words = new Map();
let read = 0;

const rl = createInterface({ input: createReadStream(join(root, '.cache', 'en_wiktionary.jsonl')), crlfDelay: Infinity });
for await (const line of rl) {
  read++;
  if (read % 500000 === 0) process.stderr.write(`\r${read} lines, ${words.size} kept  `);
  // Cheap pre-filter before the expensive parse. The word field is NOT always
  // early in the line — slicing to 200 bytes silently dropped 90% of the dump.
  const wi = line.indexOf('"word": "');
  if (wi < 0) continue;
  const we = line.indexOf('"', wi + 9);
  const term = line.slice(wi + 9, we);
  if (term.length > 30 || /[^a-zA-Z' -]/.test(term)) continue;
  const r = rank.get(term.toLowerCase());
  if (r === undefined || r >= MAX) continue;
  if (/^[A-Z]/.test(term)) continue;

  let e;
  try { e = JSON.parse(line); } catch { continue; }
  if (e.lang_code !== 'en' || !POS.has(e.pos)) continue;

  const defs = [];
  for (const s of e.senses ?? []) {
    if (s.form_of?.length || s.alt_of?.length) continue;
    const tags = s.tags ?? [];
    if (tags.some((t) => ['form-of', 'alt-of', 'obsolete', 'misspelling'].includes(t))) continue;
    for (const g of s.glosses ?? []) {
      const c = String(g).replace(/\s+/g, ' ').trim();
      if (c && c.length <= 200 && !SKIP_GLOSS.test(c)) defs.push(c);
    }
  }
  if (!defs.length) continue;

  const tr = { ru: new Set(), pt: new Set() };
  const pools = [e.translations ?? [], ...(e.senses ?? []).map((s) => s.translations ?? [])];
  for (const pool of pools) {
    for (const t of pool) {
      if (t.code === 'ru' && t.word && /^[ЁёА-я -]+$/.test(t.word)) tr.ru.add(t.word);
      if (t.code === 'pt' && t.word && /^[\p{Script=Latin} '-]+$/u.test(t.word)) tr.pt.add(t.word);
    }
  }

  const key = `${term.toLowerCase()}|${e.pos}`;
  const prev = words.get(key);
  if (prev) {
    prev.defs.push(...defs);
    for (const x of tr.ru) prev.ru.push(x);
    for (const x of tr.pt) prev.pt.push(x);
  } else {
    words.set(key, { term: term.toLowerCase(), pos: e.pos, rank: r, defs, ru: [...tr.ru], pt: [...tr.pt] });
  }
}

const all = [...words.values()].map((w) => ({
  ...w,
  defs: [...new Set(w.defs)].slice(0, 4),
  ru: [...new Set(w.ru)].slice(0, 4),
  pt: [...new Set(w.pt)].slice(0, 4),
})).sort((a, b) => a.rank - b.rank);

const SHARD = 4000;
for (let i = 0; i < all.length; i += SHARD) {
  const n = String(i / SHARD + 1).padStart(3, '0');
  writeFileSync(join(outDir, `en_${n}.json`), JSON.stringify({
    meta: { shard: n, source: 'English Wiktionary via kaikki.org (CC BY-SA 4.0); ranking OpenSubtitles (CC BY-SA)' },
    words: all.slice(i, i + SHARD),
  }, null, 1) + '\n');
}
const withRu = all.filter((w) => w.ru.length).length;
const withPt = all.filter((w) => w.pt.length).length;
console.error(`\nkept ${all.length} lemmas (${withRu} with ru, ${withPt} with pt) → ${outDir}`);
