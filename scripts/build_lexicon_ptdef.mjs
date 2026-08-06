// The explanatory layer: Portuguese words defined IN Portuguese, from the
// Portuguese-language Wiktionary via kaikki (CC BY-SA). This is what turns the
// lookup index into a monolingual dictionary a native would recognise — and
// reading definitions in the target language is a study method in itself.
//
// Inflected forms are dropped (the conjugator owns them); what remains are
// lemmas with human-written pt definitions. Output: data/lexicon_ptdef/ shards
// of { term, pos, defs: [...], labels: [...] }.
//
// Run: node scripts/build_lexicon_ptdef.mjs

import { createInterface } from 'node:readline';
import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, '.cache', 'pt_ptwiki.jsonl');
const outDir = join(root, 'data', 'lexicon_ptdef');
if (!existsSync(src)) {
  console.error('download the ptwiktionary jsonl into .cache first');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) rmSync(join(outDir, f));

const POS = new Set(['noun', 'verb', 'adj', 'adv', 'phrase', 'intj', 'pron',
  'num', 'abbrev', 'contraction', 'prep', 'conj', 'det', 'article']);

// pt-wiktionary marks inflections both structurally (form_of) and in prose.
const FORM_GLOSS = /^(plural|feminino|masculino|diminutivo|aumentativo|superlativo|grafia|forma|flexão|variante|contração)\b|pessoa d[oa] (singular|plural)|\bdo verbo\b|ortografia (antiga|anterior)/i;

const clean = (g) => String(g)
  .replace(/\{\{[^}]*\}\}/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const words = new Map();
let read = 0;

const rl = createInterface({ input: createReadStream(src), crlfDelay: Infinity });
for await (const line of rl) {
  let e;
  try { e = JSON.parse(line); } catch { continue; }
  read++;
  const term = String(e.word ?? '').trim();
  if (!term || term.length > 40 || !POS.has(e.pos)) continue;
  // Latin letters only — pt-wiktionary also documents loans in other scripts.
  if (/[^\x00-ɏ -⁯ .'-]/.test(term)) continue;
  // Proper names out: capitalised headwords are people and places, not vocabulary.
  if (/^[A-ZÁÂÃÀÉÊÍÓÔÕÚÇ]/.test(term) && e.pos !== 'abbrev') continue;

  const defs = [];
  const labels = new Set();
  for (const s of e.senses ?? []) {
    if (s.form_of?.length) continue;
    const tags = s.tags ?? [];
    if (tags.includes('form-of')) continue;
    for (const t of tags) {
      if (['Brazilian', 'Brazil', 'Portugal', 'archaic', 'informal', 'popular', 'figuratively'].includes(t)) labels.add(t);
    }
    for (const g of s.glosses ?? []) {
      const c = clean(g);
      if (!c || c.length > 220 || FORM_GLOSS.test(c)) continue;
      if (/[Ѐ-ӿ]/.test(c)) continue;
      defs.push(c);
    }
  }
  if (!defs.length) continue;

  const key = `${term.toLowerCase()}|${e.pos}`;
  const prev = words.get(key);
  if (prev) {
    prev.defs.push(...defs);
    for (const l of labels) prev.labels.push(l);
  } else {
    words.set(key, { term, pos: e.pos, defs, labels: [...labels] });
  }
}

const all = [...words.values()].map((w) => ({
  ...w,
  defs: [...new Set(w.defs)].slice(0, 4),
  labels: [...new Set(w.labels)],
})).sort((a, b) => a.term.localeCompare(b.term, 'pt'));

const SHARD = 4000;
for (let i = 0; i < all.length; i += SHARD) {
  const n = String(i / SHARD + 1).padStart(3, '0');
  writeFileSync(join(outDir, `ptdef_${n}.json`), JSON.stringify({
    meta: {
      shard: n,
      source: 'Portuguese Wiktionary via kaikki.org (CC BY-SA)',
      note: 'Monolingual definitions. Inflected forms dropped — the conjugator generates those.',
    },
    words: all.slice(i, i + SHARD),
  }, null, 1) + '\n');
}
console.error(`read ${read}, kept ${all.length} lemmas → ${outDir}`);
