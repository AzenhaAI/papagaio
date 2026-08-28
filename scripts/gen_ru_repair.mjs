// Repair rows whose Russian gloss was written without knowing which sense the
// row is for. Cards are keyed term|pos, so a homograph asks once per part of
// speech; the batch used to send the bare word, so every ask came back the same
// and one merged line was written to all of that word's rows — the conjunction,
// determiner, adverb and pronoun entries for one word became identical, each
// carrying senses belonging to the others.
//
// The expansion queue cannot reach these: it only picks flat one-worders, and a
// merged line is anything but flat. So they need their own pass.
//
// Detection is structural, not a guess: a term whose rows in one layer all
// share a single trans_ru while their English `trans` differs is by definition
// a collapsed group. Sense-specific material already sits on the row — pos and
// the English gloss — so the repair just asks again with it attached.
//
// Run: node scripts/gen_ru_repair.mjs → build/ru_repair.sql
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://azenha.ai/api/gloss';
const KEY = readFileSync(join(root, '.batch_key'), 'utf8').trim();
const LIMIT = Number(process.argv[2] ?? 2000);

const skipPath = join(root, 'build', 'ru_repair_skip.json');
let skipSet = new Set();
try { skipSet = new Set(JSON.parse(readFileSync(skipPath, 'utf8'))); } catch { /* first run */ }

// Note the ELSE: it names everything that is not lex:/lexpt: as lexen:, which
// is only true once the query is also restricted to the three lexicon layers.
// Without that restriction the first smoke run pulled a hand-made core card
// (en0001) into the repair queue.
const LAYER = `CASE WHEN id LIKE 'lex:%' THEN 'lex' WHEN id LIKE 'lexpt:%' THEN 'lexpt' ELSE 'lexen' END`;
const ask = (sql) => JSON.parse(execFileSync('npx', [
  'wrangler', 'd1', 'execute', 'papagaio', '--remote', '--json', '--command', sql,
], { cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }))[0].results;

// Frequency order, so the words people actually meet are repaired first.
const rows = ask(
  `SELECT c.id, c.term, c.pos, c.trans, c.trans_ru, ${LAYER.replace(/id/g, 'c.id')} lay
     FROM cards c
     JOIN (SELECT term, ${LAYER} lay FROM cards
            WHERE id LIKE 'lex:%' OR id LIKE 'lexpt:%' OR id LIKE 'lexen:%'
            GROUP BY term, ${LAYER}
           HAVING COUNT(*) > 1 AND COUNT(DISTINCT trans_ru) = 1
              AND COUNT(DISTINCT trans) > 1) d
       ON d.term = c.term AND d.lay = ${LAYER.replace(/id/g, 'c.id')}
    WHERE c.id LIKE 'lex:%' OR c.id LIKE 'lexpt:%' OR c.id LIKE 'lexen:%'
    ORDER BY c.freq, c.id
    LIMIT ${LIMIT + skipSet.size}`);

const need = rows.filter((r) => !skipSet.has(r.id)).slice(0, LIMIT);
console.error(`repair queue: ${need.length} (skipping ${skipSet.size} known-stubborn)`);

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;

// Asking for one sense means handing the model the term, its tag and an English
// gloss — and sometimes it hands the whole line back with the translation tacked
// on the end: "que [adv] - how (preceding adjectives) - какой; как". Written as
// is, that puts English prompt scaffolding into a Russian dictionary field.
// Strip any echoed prefix, then insist on a real answer: a repaired Russian
// gloss has Cyrillic in it, and anything still carrying the bracketed tag is
// scaffolding rather than a translation.
const clean = (raw, row) => {
  let g = String(raw ?? '').trim();
  const parts = g.split(/\s+\u2014\s+/);
  if (parts.length > 1 && parts[0].trim().toLowerCase().startsWith(String(row.term ?? '').toLowerCase())) {
    g = parts[parts.length - 1].trim();
  }
  if (/\[[a-z]+\]/i.test(g)) return '';
  if (!/[\u0400-\u04FF]/.test(g)) return '';
  return g.slice(0, 240);
};
const out = join(root, 'build', 'ru_repair.sql');
writeFileSync(out, '');
let ok = 0, bad = 0, thin = 0, dryStreak = 0;

// Same wall as the expansion job: a per-minute token ceiling, not a daily
// budget. Pace off the refusals rather than a fixed sleep.
const PAUSE_MIN = 15000, PAUSE_MAX = 60000;
let pause = PAUSE_MIN;
// Smaller than the expansion job's ten, and for a measurable reason: every entry
// here also carries an English sense, so the same count of terms is a
// noticeably heavier request against the 8000 tok/min window. At ten, a
// measured run refused 280 of 445 Portuguese items — most of the wall clock
// spent waiting rather than glossing.
const BATCH = 6;

// A batch must be homogeneous in source language: lexen: rows are English
// headwords, the two Portuguese layers are not. Group first, then slice.
const groups = [['pt', need.filter((r) => r.lay !== 'lexen')], ['en', need.filter((r) => r.lay === 'lexen')]];

for (const [from, list] of groups) {
  for (let i = 0; i < list.length; i += BATCH) {
    const batch = list.slice(i, i + BATCH);
    let d = {};
    let limited = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await fetch(API, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-batch-key': KEY },
          body: JSON.stringify({
            terms: batch.map((b) => ({ t: b.term, pos: b.pos ?? '', sense: b.trans ?? '' })),
            to: 'ru', from, rich: true,
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
        // Unlike expansion, a one-word answer is a fine result here: a sense
        // that genuinely has one equivalent should read as one word, not be
        // padded back into a row. What is NOT progress is the same merged line
        // coming back unchanged.
        if (!g || g === String(b.trans_ru ?? '').trim()) { declined.push(b.id); return; }
        lines.push(`UPDATE cards SET trans_ru = ${q(g)} WHERE id = ${q(b.id)};`);
      });
      if (lines.length) appendFileSync(out, lines.join('\n') + '\n');
      ok += lines.length;
      if (declined.length) {
        thin += declined.length;
        for (const k of declined) skipSet.add(k);
        writeFileSync(skipPath, JSON.stringify([...skipSet]));
      }
    } else {
      bad += batch.length;
      if (limited) {
        pause = Math.min(PAUSE_MAX, Math.max(PAUSE_MIN, pause * 2));
        dryStreak = 0;
        console.error(`rate-limited at ${from} ${i} — pause now ${pause}ms`);
      } else if (++dryStreak >= 5) {
        console.error('five non-limit failures in a row — stopping this run');
        break;
      }
    }
    if (i % 400 === 0) console.error(`${from} ${i}/${list.length} (ok ${ok}, unchanged ${thin}, failed ${bad})`);
    await new Promise((res) => setTimeout(res, pause));
  }
}
console.error(`done: ${ok} repaired, ${thin} came back unchanged, ${bad} failed → build/ru_repair.sql`);
