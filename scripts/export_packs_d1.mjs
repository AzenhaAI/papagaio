// Offline dictionary packs straight from D1, the source of truth for glosses.
//
// export_offline_packs.mjs builds the same packs from local pipeline artifacts
// (build/, .cache/) that only exist on one machine, and it never saw the
// Russian the nightly runs wrote to D1: the 2026-09-03 pack carried Russian on
// 13% of its rows while D1 had it on all of them. This one reads D1 plus
// nothing else, so it runs anywhere wrangler does.
//
// D1 is paged by rowid (WHERE rowid > ? ORDER BY rowid LIMIT 5000): every
// page is a seek, and the whole export reads each row once — no COUNT(*), no
// scans per page. The pages are cached in build/d1/ so a re-run, or
// clean_ru_d1.mjs, costs no reads at all (--fresh to read D1 again).
//
// Output, same shapes the app reads (papagaio-app lib/data/offline_dict.dart):
//   pt.json.gz        [{t, p, g, r, e, ru?, d?}]  lex: + lexpt: rows
//                     e = English gloss (lex: trans, lexpt: trans_en)
//                     d = Portuguese definition (def_pt, lexpt: falls back to trans)
//   en.json.gz        [{t, p, r, e, pt?, ru?}]    lexen: rows
//   ru_forms.json.gz  {form: lemma}
//   manifest.json     rows + bytes per pack
// Russian goes through scripts/lib/ru_clean.mjs (stress marks, exact repeats)
// so the pack matches what clean_ru_d1.mjs writes back.
//
// Run: node scripts/export_packs_d1.mjs [--fresh] [--old path/to/old/pt.json.gz]
//      → build/packs_v2/ plus a coverage table on stderr

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanRu } from './lib/ru_clean.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, 'build', 'd1');
const out = join(root, 'build', 'packs_v2');
mkdirSync(cache, { recursive: true });
mkdirSync(out, { recursive: true });
const args = process.argv.slice(2);
const fresh = args.includes('--fresh');
const oldPack = args.includes('--old') ? args[args.indexOf('--old') + 1] : null;

let rowsRead = 0;
const ask = (sql) => {
  const txt = execFileSync('npx', ['wrangler', 'd1', 'execute', 'papagaio', '--remote', '--json', '--command', sql],
    { cwd: root, encoding: 'utf8', maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
  const res = JSON.parse(txt.slice(txt.search(/^\[/m)))[0];
  rowsRead += res.meta?.rows_read ?? 0;
  return res.results;
};

// Pages a table by rowid into build/d1/<name>.json.
const dump = (name, cols, where = '') => {
  const f = join(cache, `${name}.json`);
  if (!fresh && existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  const rows = [];
  for (let last = 0; ;) {
    const page = ask(`SELECT rowid AS _rid, ${cols} FROM ${name.split('.')[0]} WHERE rowid > ${last} ORDER BY rowid LIMIT 5000`);
    if (!page.length) break;
    last = page[page.length - 1]._rid;
    for (const r of page) if (!where || where(r)) { delete r._rid; rows.push(r); }
    process.stderr.write(`\r${name}: ${rows.length} kept, rowid ${last}, rows read ${rowsRead}   `);
  }
  process.stderr.write('\n');
  writeFileSync(f, JSON.stringify(rows));
  return rows;
};

const cards = dump('cards', 'id, term, pos, gender, freq, trans, trans_ru, def_pt, trans_en, trans_pt',
  (r) => /^lex(pt|en)?:/.test(r.id));
const forms = dump('ru_forms', 'form, lemma');

const nz = (s) => (s == null || String(s).trim() === '' ? null : String(s));
const pt = [], en = [];
for (const c of cards) {
  const ru = nz(cleanRu(c.trans_ru));
  if (c.id.startsWith('lexen:')) {
    en.push({ t: c.term, p: c.pos, r: c.freq ?? 99999, e: c.trans ?? '',
      ...(nz(c.trans_pt) ? { pt: c.trans_pt } : {}), ...(ru ? { ru } : {}) });
    continue;
  }
  const lexpt = c.id.startsWith('lexpt:');
  const e = nz(lexpt ? c.trans_en : c.trans) ?? '';
  const d = nz(c.def_pt) ?? (lexpt ? nz(c.trans) : null);
  pt.push({ t: c.term, p: c.pos, g: c.gender ?? null, r: c.freq ?? 99999, e,
    ...(ru ? { ru } : {}), ...(d ? { d } : {}) });
}
const byRank = (a, b) => a.r - b.r || (a.t < b.t ? -1 : a.t > b.t ? 1 : 0);
pt.sort(byRank);
en.sort(byRank);
const ruForms = Object.fromEntries(forms.map((f) => [f.form, f.lemma]));

const manifest = { version: 2, updated: new Date().toISOString().slice(0, 10), source: 'D1', packs: {} };
for (const [name, rows] of Object.entries({ pt, en, ru_forms: ruForms })) {
  const gz = gzipSync(JSON.stringify(rows), { level: 9 });
  writeFileSync(join(out, `${name}.json.gz`), gz);
  const n = Array.isArray(rows) ? rows.length : Object.keys(rows).length;
  manifest.packs[name] = { rows: n, bytes: gz.length };
  console.error(`${name}: ${n} rows, ${(gz.length / 1e6).toFixed(2)} MB gz`);
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// Coverage per layer and per rank band. A headword is a term; its rank is the
// best rank among its rows, and a layer counts when any of its rows has it.
const coverage = (rows) => {
  const terms = new Map();
  for (const w of rows) {
    const h = terms.get(w.t) ?? { r: Infinity, e: false, ru: false, d: false };
    h.r = Math.min(h.r, w.r); h.e ||= !!w.e; h.ru ||= !!w.ru; h.d ||= !!w.d;
    terms.set(w.t, h);
  }
  const list = [...terms.values()].sort((a, b) => a.r - b.r);
  const bands = [[0, 5000], [5000, 10000], [10000, 20000], [20000, Infinity]];
  return bands.map(([a, b]) => {
    const s = list.slice(a, b);
    const pc = (k) => (s.length ? `${(100 * s.filter((h) => h[k]).length / s.length).toFixed(1)}%` : '-');
    return { band: `${a + 1}–${b === Infinity ? list.length : b}`, headwords: s.length, en: pc('e'), ru: pc('ru'), pt_def: pc('d') };
  });
};
const report = { rows_read: rowsRead, new: coverage(pt) };
if (oldPack) report.old = coverage(JSON.parse(gunzipSync(readFileSync(oldPack))));
writeFileSync(join(out, 'coverage.json'), JSON.stringify(report, null, 2) + '\n');
console.error(`D1 rows read this run: ${rowsRead}`);
for (const k of ['old', 'new']) if (report[k]) { console.error(k); console.table(report[k]); }
