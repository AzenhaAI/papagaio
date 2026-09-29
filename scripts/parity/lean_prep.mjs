// Parity pipeline step — run from build/parity/ (paths are relative to it).
// Headwords [from,to) by rank → N compact batches, frequency order preserved. Run: node lean_prep.mjs <from> <to> <dir> <nBatches>
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { cleanRu } from '../../scripts/lib/ru_clean.mjs';
const [from, to, dir, nb] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4], Number(process.argv[5])];
mkdirSync(dir, { recursive: true });
const cards = JSON.parse(readFileSync('../d1/cards.json', 'utf8')).filter((c) => /^lex(pt)?:/.test(c.id));
const done = new Set(existsSync('../d1/ru_clean_done.json') ? JSON.parse(readFileSync('../d1/ru_clean_done.json')) : []);
const skip = new Set([...JSON.parse(readFileSync('pilot_rows.json')).map((r) => r.id), ...JSON.parse(readFileSync('top_0_2000/rows.json')).map((r) => r.id)]);
const best = new Map();
for (const c of cards) best.set(c.term, Math.min(best.get(c.term) ?? Infinity, c.freq ?? 1e9));
const order = [...best].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).map((x) => x[0]);
const rankOf = new Map(order.map((t, i) => [t, i]));
const cut = (s) => s ?? null;
const rows = cards.filter((c) => { const r = rankOf.get(c.term); return r >= from && r < to && !skip.has(c.id); })
  .sort((a, b) => rankOf.get(a.term) - rankOf.get(b.term) || a.id.localeCompare(b.id));
const d1 = {};
const items = rows.map((c) => {
  const lexpt = c.id.startsWith('lexpt:');
  const ru = done.has(c.id) ? cleanRu(c.trans_ru) : c.trans_ru;
  d1[c.id] = { ru, en: lexpt ? c.trans_en : c.trans, pt: c.def_pt, trans: c.trans, term: c.term, pos: c.pos };
  return { id: c.id, t: c.term, p: c.pos, en: cut(lexpt ? c.trans_en : c.trans, 160), pt: cut(c.def_pt || (lexpt ? c.trans : null), 160), ru };
});
writeFileSync(`${dir}/d1.json`, JSON.stringify(d1));
const per = Math.ceil(items.length / nb);
for (let i = 0; i < nb; i++) writeFileSync(`${dir}/in_${i}.json`, JSON.stringify(items.slice(i * per, (i + 1) * per)));
console.log(`headwords ${from}-${to}: rows ${items.length}, ${nb} batches of ~${per}, en missing ${items.filter((x) => !x.en).length}`);
