// The dictionary's wide search as files instead of a table scan.
//
// The wide branch of /api/search (a word in the middle of a gloss, Russian
// input) cannot use an index: `fold LIKE '% s %'` and a LIKE over trans_ru
// read the whole lexicon, 67–112k rows a query, and on the free plan a few
// dozen such queries empty D1's daily allowance of 5M reads (it ran out on
// 15.11.2026). D1's own FTS would need ~110k writes to build, more than the
// daily write allowance. So the index is built here, once per lexicon
// change, and shipped with the Worker as static assets:
//
//   token -> [[card id, freq], ...]   the commonest 300 cards per token
//
// split into SHARDS files per course by a hash of the token's first three
// characters, so one query reads one small file and then fetches ~25 rows
// from D1 by primary key. src/search_index.js does the lookup.
//
// Tokens: the card's fold column (headword + English gloss, accent-free) and
// its Russian gloss (lower case, stress marks dropped), split on anything
// that is not a letter or digit; shorter than 3 characters is skipped — the
// wide search does not run under 3 characters.
//
// Input: build/d1/search_rows.json [{id, course, fold, trans_ru, freq}] —
// written by `node scripts/build_search_index.mjs --dump` (reads D1 once,
// ~140k rows, about 3% of a day's allowance). Without it the older
// build/d1/cards.json is used and fold is rebuilt the way the loaders did;
// good for development, not for upload.
//
// Output: build/search_index/<course>/<n>.json and manifest.json.
// Deploy: wrangler.toml [assets] points at build/search_index, so `wrangler deploy` uploads the
// changed files with the code. Rebuild before deploying whenever the lexicon or examples change.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHARDS, CAP, shardOf, tokens, ruNorm, EX_SHARDS, EX_CAP, exTokens, exShardOf } from '../src/search_index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'build', 'd1', 'search_rows.json');
const out = join(root, 'build', 'search_index');

if (process.argv.includes('--dump')) {
  const rows = [];
  let read = 0;
  for (let last = 0; ;) {
    const txt = execFileSync('npx', ['wrangler', 'd1', 'execute', 'papagaio', '--remote', '--json', '--command',
      `SELECT rowid AS _rid, id, course, fold, trans_ru, freq FROM cards WHERE rowid > ${last} AND owner = 'lex' ORDER BY rowid LIMIT 5000`],
      { cwd: root, encoding: 'utf8', maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
    const res = JSON.parse(txt.slice(txt.search(/^\[/m)))[0];
    read += res.meta?.rows_read ?? 0;
    if (!res.results.length) break;
    last = res.results[res.results.length - 1]._rid;
    for (const r of res.results) { delete r._rid; rows.push(r); }
    process.stderr.write(`\r${rows.length} rows, ${read} read   `);
  }
  process.stderr.write('\n');
  writeFileSync(src, JSON.stringify(rows));
}

let rows;
if (existsSync(src)) {
  rows = JSON.parse(readFileSync(src, 'utf8'));
} else {
  console.error('no build/d1/search_rows.json: rebuilding fold from build/d1/cards.json (dev only)');
  const f = (x) => String(x ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  rows = JSON.parse(readFileSync(join(root, 'build', 'd1', 'cards.json'), 'utf8')).map((c) => {
    const en = c.id.startsWith('lexen:');
    const pt = c.id.startsWith('lexpt:');
    return {
      id: c.id, course: en ? 'en' : 'pt', freq: c.freq, trans_ru: c.trans_ru,
      fold: en ? f(`${c.term} ${c.trans_ru ?? ''} ${c.trans ?? ''}`) : pt ? f(`${c.term} ${c.def_pt ?? c.trans ?? ''}`) : f(`${c.term} ${c.trans ?? ''}`),
    };
  });
}

rmSync(out, { recursive: true, force: true });
const manifest = { built: new Date().toISOString(), source: existsSync(src) ? 'D1' : 'cards.json', shards: SHARDS, cap: CAP, courses: {} };
for (const course of ['pt', 'en']) {
  const idx = new Map();
  for (const r of rows) {
    if (r.course !== course) continue;
    const seen = new Set([...tokens(r.fold), ...tokens(ruNorm(r.trans_ru))]);
    for (const t of seen) {
      let a = idx.get(t);
      if (!a) idx.set(t, (a = []));
      a.push([r.id, r.freq ?? 999999]);
    }
  }
  const shards = Array.from({ length: SHARDS }, () => ({}));
  let postings = 0;
  for (const [t, a] of idx) {
    a.sort((x, y) => x[1] - y[1]);
    const kept = a.slice(0, CAP);
    postings += kept.length;
    shards[shardOf(t)][t] = kept;
  }
  mkdirSync(join(out, course), { recursive: true });
  const sizes = shards.map((s, i) => {
    const body = JSON.stringify(s);
    writeFileSync(join(out, course, `${i}.json`), body);
    return body.length;
  });
  sizes.sort((a, b) => a - b);
  manifest.courses[course] = {
    rows: rows.filter((r) => r.course === course).length, tokens: idx.size, postings,
    bytes: sizes.reduce((a, b) => a + b, 0), median: sizes[sizes.length >> 1], max: sizes[sizes.length - 1],
  };
  console.error(course, manifest.courses[course]);
}
// Example sentences: build/d1/examples_rows.json [{r: rowid, p: pair, f: fold, n: length(src), v: via}],
// written by --dump-examples (one pass over the table, ~226k rows read).
const exSrc = join(root, 'build', 'd1', 'examples_rows.json');
if (process.argv.includes('--dump-examples')) {
  const rows = [];
  for (let last = 0; ;) {
    const txt = execFileSync('npx', ['wrangler', 'd1', 'execute', 'papagaio', '--remote', '--json', '--command',
      `SELECT rowid AS r, pair AS p, fold AS f, length(src) AS n, via AS v FROM examples WHERE rowid > ${last} ORDER BY rowid LIMIT 5000`],
      { cwd: root, encoding: 'utf8', maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
    const res = JSON.parse(txt.slice(txt.search(/^\[/m)))[0];
    if (!res.results.length) break;
    last = res.results[res.results.length - 1].r;
    rows.push(...res.results);
    process.stderr.write(`\r${rows.length} example rows   `);
  }
  process.stderr.write('\n');
  writeFileSync(exSrc, JSON.stringify(rows));
}
if (existsSync(exSrc)) {
  const ex = JSON.parse(readFileSync(exSrc, 'utf8'));
  manifest.examples = { shards: EX_SHARDS, cap: EX_CAP, pairs: {} };
  for (const pair of [...new Set(ex.map((r) => r.p))]) {
    const idx = new Map();
    for (const r of ex) {
      if (r.p !== pair) continue;
      const rank = (r.v ? 1e6 : 0) + (r.n ?? 0);
      for (const t of new Set(exTokens(r.f))) {
        let a = idx.get(t);
        if (!a) idx.set(t, (a = []));
        a.push([r.r, rank]);
      }
    }
    const shards = Array.from({ length: EX_SHARDS }, () => ({}));
    for (const [t, a] of idx) shards[exShardOf(t)][t] = a.sort((x, y) => x[1] - y[1] || x[0] - y[0]).slice(0, EX_CAP);
    mkdirSync(join(out, `ex-${pair}`), { recursive: true });
    const sizes = shards.map((s, i) => { const b = JSON.stringify(s); writeFileSync(join(out, `ex-${pair}`, `${i}.json`), b); return b.length; }).sort((a, b) => a - b);
    manifest.examples.pairs[pair] = { rows: ex.filter((r) => r.p === pair).length, tokens: idx.size, bytes: sizes.reduce((a, b) => a + b, 0), median: sizes[sizes.length >> 1], max: sizes[sizes.length - 1] };
    console.error(`ex-${pair}`, manifest.examples.pairs[pair]);
  }
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
