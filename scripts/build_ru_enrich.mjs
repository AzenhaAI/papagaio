// The richness pass: the Russian Wiktionary's RUSSIAN section carries
// translation tables on its lemmas — собака → cão, cachorro, cadela. Inverted,
// that becomes multiple Russian equivalents per Portuguese and English word:
// the Multitran effect, from the biggest legally-free source there is.
// Output: build/ru_enrich.json  { pt: {word: [ru...]}, en: {word: [ru...]} }
import { createInterface } from 'node:readline';
import { createReadStream, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pt = new Map(), en = new Map();
let read = 0;

const ok = (w) => w && w.length <= 40 && !/[̀-ͯ]/.test(w);
const add = (map, key, ru) => {
  const k = key.toLowerCase().trim();
  if (!k) return;
  let s = map.get(k);
  if (!s) map.set(k, s = new Set());
  if (s.size < 8) s.add(ru);
};

const rl = createInterface({ input: createReadStream(join(root, '.cache', 'ru_ruwiki.jsonl')), crlfDelay: Infinity });
for await (const line of rl) {
  read++;
  if (read % 500000 === 0) process.stderr.write(`\r${read}  pt:${pt.size} en:${en.size}  `);
  if (!line.includes('"translations"')) continue;
  let e;
  try { e = JSON.parse(line); } catch { continue; }
  const ru = String(e.word ?? '').trim();
  // Lemma sanity: cyrillic, no spaces-only junk; forms rarely carry tables anyway.
  if (!/^[ЁёА-я -]+$/.test(ru) || ru.length > 30) continue;
  for (const t of e.translations ?? []) {
    const code = t.code ?? t.lang_code;
    const w = String(t.word ?? '').trim();
    if (!ok(w)) continue;
    if (code === 'pt') add(pt, w, ru);
    else if (code === 'en') add(en, w, ru);
  }
}

const dump = (m) => Object.fromEntries([...m].map(([k, v]) => [k, [...v]]));
writeFileSync(join(root, 'build', 'ru_enrich.json'),
  JSON.stringify({ pt: dump(pt), en: dump(en) }));
console.error(`\npt words with ru equivalents: ${pt.size}, en words: ${en.size}`);
