// OpenRussian (CC BY-SA 4.0) — the frequency-and-morphology layer.
//
// Three harvests from four TSVs:
//   build/or_rank.json    lemma → usage rank (row order in the dumps is
//                         frequency order: человек and быть open their files)
//   build/or_forms.json   folded form → lemma, ALL declensions + conjugations —
//                         Wiktionary gave us noun cases, this adds verb tables
//   build/or_en2ru.json   english word → russian lemmas, one more inversion
//                         source for the EN dictionary's Russian layer
//
// Stress in the source is an apostrophe after the vowel (челове'к); it becomes
// the combining acute for display and disappears for search.
//
// Run: node scripts/build_openrussian.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, '.cache', 'openrussian');

const accentify = (s) => s.replace(/([аеёиоуыэюяАЕЁИОУЫЭЮЯ])'/g, '$1́');
const bare = (s) => s.replace(/'/g, '').toLowerCase().trim();

const rank = Object.create(null);
const forms = Object.create(null);
const en2ru = Object.create(null);
let idx = 0;

for (const file of ['nouns.csv', 'verbs.csv', 'adjectives.csv', 'others.csv']) {
  const lines = readFileSync(join(dir, file), 'utf8').split('\n');
  const header = lines[0].split('\t');
  const formCols = header
    .map((h, i) => [h, i])
    .filter(([h]) => /^(sg|pl)_|^(imperative|past|presfut)_/.test(h))
    .map(([, i]) => i);
  const enCol = header.indexOf('translations_en');

  for (const line of lines.slice(1)) {
    const c = line.split('\t');
    const lemma = bare(c[0] ?? '');
    if (!lemma || /\s/.test(lemma) === false && lemma.length < 1) continue;
    if (!(lemma in rank)) rank[lemma] = ++idx;

    for (const i of formCols) {
      const f = bare(c[i] ?? '');
      // Some cells hold alternatives ("бу'ду, ста'ну") or artefacts.
      for (const part of f.split(/[,;/]/)) {
        const p = part.trim();
        if (p && p !== lemma && /^[а-яё -]+$/.test(p) && !(p in forms)) forms[p] = lemma;
      }
    }

    if (enCol >= 0 && c[enCol]) {
      // "person, people; man" — every token is a doorway back to the lemma.
      for (const t of c[enCol].split(/[,;]/)) {
        const w = t.trim().toLowerCase();
        if (w && w.length > 1 && /^[a-z' -]+$/.test(w)) {
          (en2ru[w] ??= []).push(accentify(c[1] ?? c[0]));
        }
      }
    }
  }
}

for (const k of Object.keys(en2ru)) {
  en2ru[k] = [...new Set(en2ru[k])].slice(0, 5);
}

writeFileSync(join(root, 'build', 'or_rank.json'), JSON.stringify(rank));
writeFileSync(join(root, 'build', 'or_forms.json'), JSON.stringify(forms));
writeFileSync(join(root, 'build', 'or_en2ru.json'), JSON.stringify(en2ru));
console.error(`lemmas: ${Object.keys(rank).length}, forms: ${Object.keys(forms).length}, en keys: ${Object.keys(en2ru).length}`);
