// Deep pass over the Russian Wiktionary dump — the second, richer inversion.
//
// The first pass (build_ru_enrich.mjs) took bare translation lists: cão →
// «собака; кобель». This one keeps what a human lexicographer would keep:
//   - the sense note that disambiguates each equivalent («кошка (самка)»)
//   - the accented spelling (ко́шка) — gold for anyone learning Russian back
//   - the full inflection table, folded, so «кошкой» can find gato one day
//
// Outputs:
//   build/ru_deep.json   { pt: {gato: [{w,a,s}...]}, en: {...} }
//   build/ru_forms.json  { "кошкой": "кошка", ... } for lemmas used in glosses
//
// Run: node scripts/build_ru_deep.mjs   (streams 1.7 GB, a few minutes)

import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DUMP = join(root, '.cache', 'ru_ruwiki.jsonl');

// Bare objects: a headword like "constructor" must be data, not a prototype hit.
const out = { pt: Object.create(null), en: Object.create(null) };
const lemmaForms = new Map(); // ru lemma -> Set of folded forms
let lines = 0, used = 0;

// Strip ONLY the combining acute (U+0301) — a blanket diacritic sweep would
// also eat the breve that makes й a different letter from и.
const strip = (s) => s.normalize('NFD').replace(/́/g, '').normalize('NFC').toLowerCase();
// A sense note is a hint, not an essay — cut at a word boundary.
const senseCut = (s) => {
  const x = String(s).trim();
  if (x.length <= 60) return x;
  const cut = x.slice(0, 60);
  return cut.slice(0, cut.lastIndexOf(' ') > 20 ? cut.lastIndexOf(' ') : 60) + '…';
};

const rl = createInterface({ input: createReadStream(DUMP), crlfDelay: Infinity });
for await (const line of rl) {
  lines++;
  if (!line.includes('"translations"')) {
    // Still worth harvesting forms if the word later shows up as a gloss?
    // No — forms are only kept for lemmas that translate something, and those
    // lines always carry a translations key. Skip early, this is the hot loop.
    continue;
  }
  let w;
  try { w = JSON.parse(line); } catch { continue; }
  if (w.lang_code !== 'ru' || !Array.isArray(w.translations)) continue;

  const trs = w.translations.filter((t) => (t.lang_code === 'pt' || t.lang_code === 'en') && t.word);
  if (!trs.length) continue;
  used++;

  // The accented nominative, if the forms table has one.
  const acc = (w.forms ?? []).find((f) => f.tags?.includes('nominative') && f.tags?.includes('singular'))?.form
    ?? (w.forms ?? [])[0]?.form ?? null;
  const accent = acc && strip(acc) === w.word.toLowerCase() ? acc : null;

  for (const t of trs) {
    const side = t.lang_code === 'pt' ? out.pt : out.en;
    const key = t.word.toLowerCase();
    (side[key] ??= []).push({
      w: w.word,
      ...(accent ? { a: accent } : {}),
      ...(t.sense ? { s: senseCut(t.sense) } : {}),
    });
  }

  if (w.forms?.length) {
    const set = lemmaForms.get(w.word) ?? new Set();
    for (const f of w.forms) {
      const folded = strip(f.form ?? '');
      if (folded && folded !== w.word.toLowerCase()) set.add(folded);
    }
    if (set.size) lemmaForms.set(w.word, set);
  }
}

// Dedup equivalents per headword, keep at most 6 — a gloss line, not a thesis.
for (const side of [out.pt, out.en]) {
  for (const key of Object.keys(side)) {
    const seen = new Set();
    side[key] = side[key].filter((x) => !seen.has(x.w) && seen.add(x.w)).slice(0, 6);
  }
}

// Forms only for lemmas that actually appear in glosses — the rest is dead weight.
const usedLemmas = new Set();
for (const side of [out.pt, out.en]) {
  for (const list of Object.values(side)) for (const x of list) usedLemmas.add(x.w);
}
const forms = Object.create(null);
let formCount = 0;
for (const [lemma, set] of lemmaForms) {
  if (!usedLemmas.has(lemma)) continue;
  for (const f of set) {
    if (!(f in forms)) { forms[f] = lemma; formCount++; }
  }
}

writeFileSync(join(root, 'build', 'ru_deep.json'), JSON.stringify(out));
writeFileSync(join(root, 'build', 'ru_forms.json'), JSON.stringify(forms));
console.error(`${lines} lines, ${used} ru entries with pt/en translations`);
console.error(`pt headwords: ${Object.keys(out.pt).length}, en: ${Object.keys(out.en).length}`);
console.error(`lemmas in glosses: ${usedLemmas.size}, form spellings: ${formCount}`);
