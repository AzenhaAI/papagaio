// Upgrade model one-worders into Multitran-style rows for the words people
// actually meet: «кот» → «кот (самец); кошка (о животном)».
//
// Only plain single-word model glosses qualify — anything with «;», «,», «(»
// or a stress mark came from Wiktionary/OpenRussian hands and is left alone.
// Frequency-first, 2000 a night, third in line after the fill queues.
//
// Some words genuinely have one equivalent and come back thin however often we
// ask. Those stay plain, so a naive queue re-asks the same words every night,
// forever, at the head of the frequency order — residue that compounds until it
// fills all 2000 slots. build/ru_expand_skip.json remembers them. Delete the
// file to give the whole pool another pass on a better model.
//
// Run: node scripts/gen_ru_expand.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://azenha.ai/api/gloss';
const KEY = readFileSync(join(root, '.batch_key'), 'utf8').trim();

// Keys are row ids. They used to be `term|pos`, which stopped being unique once
// the lexpt: layer joined the queue — the same word can sit in both layers with
// different glosses. Legacy entries are all lex:, so they migrate by prefix.
const skipPath = join(root, 'build', 'ru_expand_skip.json');
let skipSet = new Set();
try {
  skipSet = new Set(JSON.parse(readFileSync(skipPath, 'utf8'))
    .map((k) => (k.startsWith('lex:') || k.startsWith('lexpt:') ? k : `lex:${k}`)));
} catch { /* first run */ }

// Both Portuguese layers, same as the fill queue: lex: is the layer shared with
// English, lexpt: the pt-only words. Selecting lex: alone left the whole lexpt:
// half — larger than lex: by now — permanently invisible to this queue.
// Over-fetch by the skip count so the night still gets a full 2000 to chew on.
const listOut = execFileSync('npx', [
  'wrangler', 'd1', 'execute', 'papagaio', '--remote', '--json', '--command',
  `SELECT id, term, pos, trans FROM cards
     WHERE (id LIKE 'lex:%' OR id LIKE 'lexpt:%') AND course='pt'
     AND trans_ru IS NOT NULL AND trans_ru NOT LIKE '%;%'
     AND trans_ru NOT LIKE '%,%' AND trans_ru NOT LIKE '%(%'
     AND trans_ru NOT LIKE '%́%'
   ORDER BY freq, id LIMIT ${2000 + skipSet.size}`,
], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const need = JSON.parse(listOut)[0].results
  .map((r) => [r.term, r.pos, r.id, r.trans])
  .filter(([, , id]) => !skipSet.has(id))
  .slice(0, 2000);
console.error(`expand queue: ${need.length} (skipping ${skipSet.size} known-thin)`);

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const out = join(root, 'build', 'ru_expand.sql');
writeFileSync(out, '');
let ok = 0, bad = 0, thin = 0, dryStreak = 0;

// The wall here is the per-minute TOKEN ceiling, not a daily budget: measured
// 20.08, a run that quit on "budget dry" still had 961/1000 requests free and
// its tokens back 36s later. A fixed 2.4s pause fires ~25 batches a minute into
// an 8000 tok/min window, so most get refused and the run gives up on a limit
// that was never spent. Pace off the refusals instead: back off when they come,
// creep back down when they stop.
// Floor measured, not guessed: a rich batch of 20 costs enough of the 8000
// tok/min window that ~4 batches a minute is the sustainable rate. Starting at
// 2.4s just bought one good batch and then a refusal every time. The decay is
// deliberately lazy (0.95, not 0.8) — dropping fast after one success walks
// straight back into the wall.
const PAUSE_MIN = 15000, PAUSE_MAX = 60000;
let pause = PAUSE_MIN;
// Batch size is the real lever, not the pause. A rich row is several times the
// tokens of a one-worder, so twenty of them sit right on the 8000 tok/min
// ceiling: measured 20.08, batches of 8 and 16 went through while 12 was
// refused a minute later — the edge is fuzzy because it depends on how much of
// the window is free at that second, and no pause makes an over-sized request
// fit. Ten keeps us clear of it. The fill queues still use twenty; their
// one-word output is a fraction of the cost.
const BATCH = 10;

for (let i = 0; i < need.length; i += BATCH) {
  const batch = need.slice(i, i + BATCH);
  let d = {};
  let limited = false;
  // Four tries with growing waits (5/10/20/40s): a token window refills in
  // under a minute. Beyond that the outer pace-down is the better lever —
  // burning three minutes on one doomed batch just starves the rest.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-batch-key': KEY },
        // Send the row's own sense, not the bare word. Rows are keyed term|pos, so
        // a word with four parts of speech asks four times; glossing the bare
        // word answered all four identically and filed a cattle adjective under
        // the conjunction "que". The English `trans` is already sense-specific
        // on these rows, which makes it the cheapest disambiguator available.
        body: JSON.stringify({
          terms: batch.map(([t, p, , sense]) => ({ t, pos: p ?? '', sense: sense ?? '' })),
          to: 'ru', from: 'pt', rich: true,
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
    batch.forEach(([t, p, id], k) => {
      const g = String(d.glosses[k] ?? '').trim().slice(0, 240);
      // A rich row has structure; a bare echo of what we had is not an upgrade.
      if (!g || !/[;(]/.test(g)) { declined.push(id); return; }
      lines.push(`UPDATE cards SET trans_ru = ${q(g)} WHERE id = ${q(id)};`);
    });
    if (lines.length) appendFileSync(out, lines.join('\n') + '\n');
    ok += lines.length;
    // Persist per batch, not at the end: a run that dies on budget still keeps
    // what it learned, instead of re-asking the same thin words tomorrow.
    if (declined.length) {
      thin += declined.length;
      for (const k of declined) skipSet.add(k);
      writeFileSync(skipPath, JSON.stringify([...skipSet]));
    }
  } else {
    bad += batch.length;
    if (limited) {
      // Refused for pace, not for a spent budget. Slow down and keep going —
      // quitting here is what capped the night at a fraction of the queue.
      pause = Math.min(PAUSE_MAX, Math.max(PAUSE_MIN, pause * 2));
      dryStreak = 0;
      console.error(`rate-limited at ${i} — pause now ${pause}ms`);
    } else if (++dryStreak >= 5) {
      // Five non-limit failures running is a real fault (bad key, dead API):
      // marching on would just log the same error 300 times.
      console.error('five non-limit failures in a row — stopping this run');
      break;
    }
  }
  if (i % 400 === 0) console.error(`${i}/${need.length} (ok ${ok}, thin ${thin}, failed ${bad})`);
  await new Promise((res) => setTimeout(res, pause));
}
console.error(`done: ${ok} rich rows, ${thin} came back thin, ${bad} failed → build/ru_expand.sql`);
