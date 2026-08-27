// Fill the Portuguese monolingual definition for lex: rows that never got one.
//
// def_pt comes from the Portuguese Wiktionary dump, while the lex: layer comes
// from the Portuguese section of the English one. Words present in the second
// but not the first simply have no definition, and no amount of reloading the
// source will produce them: checked against all 77622 ptdef entries, not one of
// the 2273 gaps matches on term+pos. (588 match on the bare term — a different
// part of speech of the same spelling. Copying those in is the sense collapse
// this codebase just finished undoing, so they are left alone.)
//
// Scope is the ranked band on purpose. Everything past freq 900000 sits at a
// sentinel, so "frequency order" there is really alphabetical order, and the
// tail is not worth model tokens until the vocabulary carries a real rank.
//
// Run: node scripts/gen_ptdef_fill.mjs [limit] → build/ptdef_fill.sql
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://azenha.ai/api/gloss';
const KEY = readFileSync(join(root, '.batch_key'), 'utf8').trim();
const LIMIT = Number(process.argv[2] ?? 0);

const skipPath = join(root, 'build', 'ptdef_skip.json');
let skipSet = new Set();
try { skipSet = new Set(JSON.parse(readFileSync(skipPath, 'utf8'))); } catch { /* first run */ }

const rows = JSON.parse(execFileSync('npx', [
  'wrangler', 'd1', 'execute', 'papagaio', '--remote', '--json', '--command',
  `SELECT id, term, pos, trans FROM cards
     WHERE id LIKE 'lex:%' AND freq < 900000 AND (def_pt IS NULL OR def_pt = '')
     ORDER BY freq, id`,
], { cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }))[0].results;

const need = rows.filter((r) => !skipSet.has(r.id)).slice(0, LIMIT || rows.length);
console.error(`ptdef queue: ${need.length} (skipping ${skipSet.size} known-bad)`);

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;

// The head of this queue is function words, which is exactly where a model
// stops defining and starts giving examples: "que" first came back as "qual
// livro qual livro". Reject the shapes that are not definitions rather than
// trusting the prompt alone.
const clean = (raw, row) => {
  let g = String(raw ?? '').trim();
  const parts = g.split(/\s+—\s+/);
  if (parts.length > 1 && parts[0].trim().toLowerCase().startsWith(String(row.term ?? '').toLowerCase())) {
    g = parts[parts.length - 1].trim();
  }
  g = g.replace(/\s*[.;]+\s*$/, '').trim();
  if (/\[[a-z]+\]/i.test(g)) return '';
  const w = g.toLowerCase().split(/\s+/).filter(Boolean);
  if (w.length < 2 || w.length > 20) return '';
  // A definition that repeats a pair of words is padding, not a definition.
  const seen = new Set();
  for (let i = 0; i + 1 < w.length; i++) {
    const bg = `${w[i]} ${w[i + 1]}`;
    if (seen.has(bg)) return '';
    seen.add(bg);
  }
  // Defining a word with itself says nothing.
  if (w.includes(String(row.term ?? '').toLowerCase())) return '';
  return (g.charAt(0).toLowerCase() + g.slice(1)).slice(0, 240);
};

const out = join(root, 'build', 'ptdef_fill.sql');
writeFileSync(out, '');
let ok = 0, bad = 0, rejected = 0, dryStreak = 0;
const PAUSE_MIN = 15000, PAUSE_MAX = 60000;
let pause = PAUSE_MIN;
const BATCH = 10;

for (let i = 0; i < need.length; i += BATCH) {
  const batch = need.slice(i, i + BATCH);
  let d = {};
  let limited = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-batch-key': KEY },
        body: JSON.stringify({
          terms: batch.map((b) => ({ t: b.term, pos: b.pos ?? '', sense: b.trans ?? '' })),
          to: 'pt', from: 'pt', define: true,
        }),
      });
      limited = r.status === 429 || r.status >= 500;
      d = await r.json().catch(() => ({}));
      if (Array.isArray(d.glosses) && d.glosses.length === batch.length) break;
    } catch { limited = true; }
    await new Promise((res) => setTimeout(res, Math.min(5000 * 2 ** attempt, 60000)));
  }
  if (Array.isArray(d.glosses) && d.glosses.length === batch.length) {
    dryStreak = 0;
    pause = Math.max(PAUSE_MIN, Math.round(pause * 0.95));
    const lines = [];
    const declined = [];
    batch.forEach((b, k) => {
      const g = clean(d.glosses[k], b);
      if (!g) { declined.push(b.id); return; }
      lines.push(`UPDATE cards SET def_pt = ${q(g)} WHERE id = ${q(b.id)} AND (def_pt IS NULL OR def_pt = '');`);
    });
    if (lines.length) appendFileSync(out, lines.join('\n') + '\n');
    ok += lines.length;
    if (declined.length) {
      rejected += declined.length;
      for (const k of declined) skipSet.add(k);
      writeFileSync(skipPath, JSON.stringify([...skipSet]));
    }
  } else {
    bad += batch.length;
    if (limited) {
      pause = Math.min(PAUSE_MAX, Math.max(PAUSE_MIN, pause * 2));
      dryStreak = 0;
      console.error(`rate-limited at ${i} — pause now ${pause}ms`);
    } else if (++dryStreak >= 5) {
      console.error('five non-limit failures in a row — stopping this run');
      break;
    }
  }
  if (i % 400 === 0) console.error(`${i}/${need.length} (ok ${ok}, rejected ${rejected}, failed ${bad})`);
  await new Promise((res) => setTimeout(res, pause));
}
console.error(`done: ${ok} definitions, ${rejected} rejected as non-definitions, ${bad} failed → build/ptdef_fill.sql`);
