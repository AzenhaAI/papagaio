// Write gated glosses back to D1, keeping every previous value in gloss_history
// so any change can be rolled back.
//
// Input is a JSON array of changes that already passed the Sonnet gate:
//   [{ "id": "lex:saída|noun", "layer": "ru" | "en" | "pt", "old": "...", "new": "...", "why": "..." }]
//
// Layer → column:
//   ru → trans_ru on every row
//   en → trans on lex: rows (the English gloss), trans_en on lexpt: rows
//   pt → def_pt on every row; on lexpt: rows the displayed trans is the same
//        definition (cut to 200), so it moves with it
// Whenever trans changes, fold (folded "term trans", what search matches) is
// recomputed — but only where the stored fold still follows that convention.
//
// Every UPDATE is guarded on the value it replaces (col IS old), so a row that
// changed since the pilot read it is left alone, and its history row is only
// written when the guard matches.
//
// Run:      node scripts/parity_writeback.mjs <changes.json> <run-tag>
// Dry run:  node scripts/parity_writeback.mjs <changes.json> <run-tag> --dry   → prints SQL
// Rollback: node scripts/parity_writeback.mjs --rollback <run-tag>

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const q = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const fold = (x) => String(x ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’`´ʼʹ]/g, '');

let rowsRead = 0, rowsWritten = 0;
const run = (sql) => {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'papagaio', '--remote', '--json', '--command', sql],
    { cwd: root, encoding: 'utf8', maxBuffer: 128 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
  const res = JSON.parse(out.slice(out.search(/^\[/m)));
  for (const r of res) { rowsRead += r.meta?.rows_read ?? 0; rowsWritten += r.meta?.rows_written ?? 0; }
  return res.flatMap((r) => r.results ?? []);
};

const SETUP = [
  `CREATE TABLE IF NOT EXISTS gloss_history (
     id      INTEGER PRIMARY KEY AUTOINCREMENT,
     card_id TEXT NOT NULL,
     col     TEXT NOT NULL,
     old     TEXT,
     new     TEXT,
     reason  TEXT,
     run     TEXT NOT NULL,
     at      TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_gloss_history_run ON gloss_history(run)`,
];

const args = process.argv.slice(2);
if (args[0] === '--rollback') {
  const tag = args[1];
  // Newest first, so a column changed twice in one run ends at its first old value.
  const hist = run(`SELECT id, card_id, col, old, new FROM gloss_history WHERE run = ${q(tag)} ORDER BY id DESC`);
  const stmts = hist.map((h) => `UPDATE cards SET ${h.col} = ${q(h.old)} WHERE id = ${q(h.card_id)} AND ${h.col} IS ${q(h.new)};`);
  for (let i = 0; i < stmts.length; i += 80) run(stmts.slice(i, i + 80).join('\n'));
  console.error(`rolled back ${hist.length} column changes of run ${tag}; rows read ${rowsRead}, written ${rowsWritten}`);
  process.exit(0);
}

const [file, tag] = args;
const dry = args.includes('--dry');
if (!file || !tag) { console.error('usage: parity_writeback.mjs <changes.json> <run-tag> [--dry]'); process.exit(1); }
const changes = JSON.parse(readFileSync(file, 'utf8'));
const at = new Date().toISOString();

// Current term/trans/fold for the touched rows, so fold can be recomputed.
const ids = [...new Set(changes.map((c) => c.id))];
const cur = new Map();
if (!dry) {
  run(SETUP.join(';\n'));
  const cols = run(`PRAGMA table_info(cards)`).map((c) => c.name);
  if (!cols.includes('trans_en')) run(`ALTER TABLE cards ADD COLUMN trans_en TEXT`);
  for (let i = 0; i < ids.length; i += 200) {
    for (const r of run(`SELECT id, term, trans, fold FROM cards WHERE id IN (${ids.slice(i, i + 200).map(q).join(',')})`)) cur.set(r.id, r);
  }
}

const stmts = [];
const set = (id, col, oldV, newV, why) => {
  const guard = `id = ${q(id)} AND ${col} IS ${q(oldV)}`;
  stmts.push(
    `INSERT INTO gloss_history (card_id, col, old, new, reason, run, at) ` +
    `SELECT id, ${q(col)}, ${col}, ${q(newV)}, ${q(why)}, ${q(tag)}, ${q(at)} FROM cards WHERE ${guard};`,
    `UPDATE cards SET ${col} = ${q(newV)} WHERE ${guard};`);
};

for (const c of changes) {
  const lexpt = c.id.startsWith('lexpt:');
  const row = cur.get(c.id);
  let newTrans = null;
  if (c.layer === 'ru') set(c.id, 'trans_ru', c.old, c.new, c.why);
  else if (c.layer === 'en' && !lexpt) { set(c.id, 'trans', c.old, c.new, c.why); newTrans = c.new; }
  else if (c.layer === 'en') set(c.id, 'trans_en', c.old, c.new, c.why);
  else if (c.layer === 'pt') {
    set(c.id, 'def_pt', c.old, c.new, c.why);
    if (lexpt && row) { set(c.id, 'trans', row.trans, c.new.slice(0, 200), c.why); newTrans = c.new.slice(0, 200); }
  }
  if (newTrans != null && row && row.fold === `${fold(row.term)} ${fold(row.trans)}`) {
    set(c.id, 'fold', row.fold, `${fold(row.term)} ${fold(newTrans)}`, 'derived from trans');
  }
}

if (dry) { console.log(stmts.join('\n')); process.exit(0); }
for (let i = 0; i < stmts.length; i += 80) run(stmts.slice(i, i + 80).join('\n'));
const landed = run(`SELECT col, COUNT(*) n FROM gloss_history WHERE run = ${q(tag)} GROUP BY col`);
console.error(`run ${tag}: ${changes.length} changes →`, Object.fromEntries(landed.map((r) => [r.col, r.n])),
  `rows read ${rowsRead}, written ${rowsWritten}`);
