// Parity pipeline step — run from build/parity/ (paths are relative to it); gate rules: docs/parity/gate-rules.md, copied to build/parity/RULES.md.
// Select headwords [from, to) of the top list (by best freq) from the D1 page cache and split into edit batches.
// Run: node top_prep.mjs <from> <to> <runDir> [rowsPerBatch]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { cleanRu } from '../../scripts/lib/ru_clean.mjs';
const [from, to, dir, per = 100] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4], Number(process.argv[5] ?? 100)];
mkdirSync(dir, { recursive: true });
const cards = JSON.parse(readFileSync('../d1/cards.json', 'utf8')).filter((c) => /^lex(pt)?:/.test(c.id));
const done = new Set(existsSync('../d1/ru_clean_done.json') ? JSON.parse(readFileSync('../d1/ru_clean_done.json')) : []);
const pilot = new Set(JSON.parse(readFileSync('pilot_rows.json')).map((r) => r.id));
const best = new Map();
for (const c of cards) best.set(c.term, Math.min(best.get(c.term) ?? Infinity, c.freq ?? 1e9));
const order = [...best].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).map((x) => x[0]);
const pick = new Set(order.slice(from, to));
const rows = cards.filter((c) => pick.has(c.term) && !pilot.has(c.id)).map((c) => {
  const lexpt = c.id.startsWith('lexpt:');
  const ru = done.has(c.id) ? cleanRu(c.trans_ru) : c.trans_ru;
  return { id: c.id, term: c.term, pos: c.pos, gender: c.gender, en: (lexpt ? c.trans_en : c.trans) || null, ru: ru || null,
    pt: c.def_pt || (lexpt ? c.trans : null) || null, _d1: { trans: c.trans, trans_ru: ru, def_pt: c.def_pt, trans_en: c.trans_en } };
});
rows.sort((a, b) => a.term.localeCompare(b.term, 'pt') || a.id.localeCompare(b.id));
writeFileSync(`${dir}/rows.json`, JSON.stringify(rows));
let b = 0, cur = [];
const flush = () => { if (cur.length) writeFileSync(`${dir}/edit_in_${b++}.json`, JSON.stringify(cur.map(({ _d1, ...r }) => r), null, 1)); cur = []; };
rows.forEach((r, i) => { cur.push(r); if (cur.length >= per && rows[i + 1]?.term !== r.term) flush(); });
flush();
console.log(`headwords ${from}–${to}: ${pick.size}, rows ${rows.length} (pilot rows skipped), batches ${b}`);
