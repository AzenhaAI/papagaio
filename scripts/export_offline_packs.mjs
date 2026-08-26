// Offline dictionary packs — the Lingvo idea: the dictionary is a file you
// own, not a server you hope is up.
//
// Everything is assembled from local pipeline artifacts (nothing is pulled
// from D1), gzipped, and shipped as GitHub release assets so neither the git
// repo nor the Cloudflare Pages 25 MiB limit ever feels them:
//
//   pt.json.gz        Portuguese lexicon: term, pos, gender, rank, EN gloss,
//                     RU gloss where the ru-wiktionary inversion or the model
//                     batches produced one
//   en.json.gz        English lexicon: term, pos, rank, EN definition,
//                     PT + RU translations
//   examples.json.gz  Tatoeba sentence pairs (pt-en, pt-ru, en-ru)
//   manifest.json     row counts + byte sizes, what the app's download UI shows
//
// Run: node scripts/export_offline_packs.mjs   → build/packs/
// Ship: gh release upload packs-v1 build/packs/* --repo Azenhaai/papagaio --clobber

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'build', 'packs');
mkdirSync(out, { recursive: true });

const readWords = (dir) =>
  readdirSync(join(root, 'data', dir)).filter((f) => f.endsWith('.json')).sort()
    .flatMap((f) => JSON.parse(readFileSync(join(root, 'data', dir, f), 'utf8')).words);

// --- Russian glosses: the deep pass (accents + sense notes) beats the flat
// inversion, which beats a model one-worder. All three sources merge here.
const deep = existsSync(join(root, 'build', 'ru_deep.json'))
  ? JSON.parse(readFileSync(join(root, 'build', 'ru_deep.json'), 'utf8'))
  : { pt: {}, en: {} };
const deepLine = (list) => list?.slice(0, 4)
  .map((x) => (x.s ? `${x.a ?? x.w} (${x.s})` : (x.a ?? x.w))).join('; ').slice(0, 240);
const enrich = JSON.parse(readFileSync(join(root, 'build', 'ru_enrich.json'), 'utf8'));
const modelRu = new Map();
const modelFiles = [
  join(root, 'build', 'ru_model.sql'),
  join(homedir(), 'Documents', 'papagaio_archive', '2026-08-07', 'ru_model.sql'),
  join(homedir(), 'Documents', 'papagaio_archive', '2026-08-07', 'ru_model_run2.sql'),
];
for (const f of modelFiles) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^UPDATE cards SET trans_ru = '((?:[^']|'')*)' WHERE id = 'lex:((?:[^']|'')*)\|/);
    if (m) modelRu.set(m[2].replace(/''/g, "'"), m[1].replace(/''/g, "'"));
  }
}

// --- pt pack: the bilingual layer, with the monolingual layer folded in ---
// Words the EN layer knows get their Portuguese definition attached (`d`);
// words only the pt-wiktionary knows become their own rows, ranked last so
// translated entries always surface first.
const ptDefs = new Map();
for (const w of readWords('lexicon_ptdef')) {
  if (!ptDefs.has(w.term)) ptDefs.set(w.term, (w.defs ?? []).slice(0, 2).join(' | ').slice(0, 220));
}
const pt = readWords('lexicon').map((w) => {
  const ru = deepLine(deep.pt[w.term.toLowerCase()])
    ?? enrich.pt[w.term]?.slice(0, 5).join(', ')
    ?? modelRu.get(w.term) ?? null;
  const d = ptDefs.get(w.term);
  ptDefs.delete(w.term);
  return {
    t: w.term, p: w.pos, g: w.gender ?? null, r: w.rank,
    e: w.senses.slice(0, 3).map((s) => s.trans).join('; ').slice(0, 300),
    ...(ru ? { ru } : {}),
    ...(d ? { d } : {}),
  };
});
let tail = 90000;
for (const [term, d] of ptDefs) {
  if (d) pt.push({ t: term, p: null, g: null, r: tail++, e: '', d });
}

// --- en pack ---
const en = readWords('lexicon_en').map((w) => {
  const ru = deepLine(deep.en[w.term.toLowerCase()])
    ?? (w.ru?.length ? w.ru.slice(0, 5).join(', ') : null);
  return {
    t: w.term, p: w.pos, r: w.rank,
    e: (w.defs ?? []).slice(0, 2).join(' | ').slice(0, 300),
    ...(w.pt?.length ? { pt: w.pt.slice(0, 4).join(', ') } : {}),
    ...(ru ? { ru } : {}),
  };
});

// --- examples pack, recovered from the generated SQL (direct + pivoted) ---
const examples = [];
for (const line of readFileSync(join(root, 'build', 'examples.sql'), 'utf8').split('\n')) {
  const m = line.match(/^INSERT INTO examples .* VALUES \('(pt-ru|pt-en|en-ru)', '((?:[^']|'')*)', '((?:[^']|'')*)', '(?:[^']|'')*'\);$/);
  if (m) examples.push({ p: m[1], s: m[2].replace(/''/g, "'"), d: m[3].replace(/''/g, "'") });
}
if (existsSync(join(root, 'build', 'examples_pivot.sql'))) {
  for (const line of readFileSync(join(root, 'build', 'examples_pivot.sql'), 'utf8').split('\n')) {
    const m = line.match(/^INSERT INTO examples .* VALUES \('pt-ru', '((?:[^']|'')*)', '((?:[^']|'')*)', '(?:[^']|'')*', 'en'\);$/);
    if (m) examples.push({ p: 'pt-ru', s: m[1].replace(/''/g, "'"), d: m[2].replace(/''/g, "'"), v: 'en' });
  }
}

// --- Russian inflection map: «кошкой» → «кошка», for offline Russian search ---
const ruForms = existsSync(join(root, 'build', 'ru_forms.json'))
  ? JSON.parse(readFileSync(join(root, 'build', 'ru_forms.json'), 'utf8'))
  : {};

const packs = { pt, en, examples, ru_forms: ruForms };
const manifest = { version: 1, updated: '2026-08-07', packs: {} };
for (const [name, rows] of Object.entries(packs)) {
  const gz = gzipSync(JSON.stringify(rows), { level: 9 });
  writeFileSync(join(out, `${name}.json.gz`), gz);
  const n = Array.isArray(rows) ? rows.length : Object.keys(rows).length;
  manifest.packs[name] = { rows: n, bytes: gz.length };
  console.error(`${name}: ${n} rows, ${(gz.length / 1e6).toFixed(1)} MB gz`);
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.error('→ build/packs/');
