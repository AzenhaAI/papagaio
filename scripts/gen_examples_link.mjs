// Give lexicon cards an example sentence from the bank we already have.
//
// The examples table holds 226k aligned sentence pairs, but nothing joins it to
// the deck: examples.fold is a folded SENTENCE while cards.fold is a folded
// "term + translation", so the two are different namespaces and a join on fold
// returns nothing. The link that does exist is plain containment — a sentence is
// an example for a card when it actually contains the card's headword.
//
// Matching runs here rather than in SQL on purpose: a LIKE join of 136k
// sentences against 137k cards is a cross product D1 has no business chewing on,
// while a word index built once in memory answers every card in a single pass.
//
// Run: node scripts/gen_examples_link.mjs [limit] → build/ex_link.sql
import { execFileSync } from 'node:child_process';
import { writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIMIT = Number(process.argv[2] ?? 0);          // 0 = every card that needs one
const PAGE = 10000;

// Same folding the loaders use, so a card's term and a sentence's words are
// normalised identically — otherwise "olá" never meets "ola".
const fold = (x) => String(x ?? '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/['’`´ʼʹ]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/ +/g, ' ').trim();

const ask = (sql) => JSON.parse(execFileSync('npx', [
  'wrangler', 'd1', 'execute', 'papagaio', '--remote', '--json', '--command', sql,
], { cwd: root, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 }))[0].results;

const page = (sqlFor, label) => {
  const all = [];
  for (let off = 0; ; off += PAGE) {
    const rows = ask(sqlFor(PAGE, off));
    all.push(...rows);
    console.error(`${label}: ${all.length}`);
    if (rows.length < PAGE) break;
  }
  return all;
};

// A learner meets a word best in a short, whole sentence. Very short fragments
// carry no context and long ones bury the word, so the bank is filtered to a
// usable band before anything is indexed.
const MIN_W = 3, MAX_W = 12;
const banks = {};
for (const pair of ['pt-ru', 'en-ru']) {
  const rows = page((n, o) =>
    `SELECT src, dst, fold FROM examples WHERE pair='${pair}' LIMIT ${n} OFFSET ${o}`, `examples ${pair}`);
  const kept = rows.filter((r) => {
    const w = String(r.fold ?? '').split(' ').filter(Boolean).length;
    return w >= MIN_W && w <= MAX_W && r.src && r.dst;
  });
  // Index by every word the sentence contains. Cap the postings per word: the
  // commonest words appear in tens of thousands of sentences and keeping them
  // all costs memory to no purpose — the first handful is already more choice
  // than one card needs.
  const idx = new Map();
  kept.forEach((r, i) => {
    for (const w of new Set(String(r.fold).split(' ').filter(Boolean))) {
      const post = idx.get(w);
      if (!post) idx.set(w, [i]);
      else if (post.length < 12) post.push(i);
    }
  });
  // Shortest first, so the clearest sentence is picked before the wordiest.
  for (const post of idx.values()) post.sort((a, b) => kept[a].fold.length - kept[b].fold.length);
  banks[pair] = { rows: kept, idx };
  console.error(`bank ${pair}: ${kept.length} usable of ${rows.length}`);
}

// Cards with no example yet, commonest first.
const cards = page((n, o) =>
  `SELECT id, term, freq FROM cards
    WHERE (id LIKE 'lex:%' OR id LIKE 'lexpt:%' OR id LIKE 'lexen:%')
      AND (ex_t IS NULL OR ex_t = '')
    ORDER BY freq, id LIMIT ${n} OFFSET ${o}`, 'cards needing an example');

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const out = join(root, 'build', 'ex_link.sql');
writeFileSync(out, '');

// One sentence should not become the example for a dozen different cards, or
// the deck reads as the same line over and over. Reuse is capped instead of
// forbidden: for a rare word the only sentence that contains it may already be
// spoken for, and a repeated sentence still beats no example at all.
const MAX_REUSE = 3;
const used = new Map();

// Cards are keyed term|pos, so a homograph has one row per part of speech — and
// containment cannot tell them apart: every sense of "you" is spelled the same,
// so the first matching sentence would be filed under all of them. "I miss you."
// is a fine example for the pronoun and a misleading one for the noun (the
// letter U) and the verb (to address someone as "you"). One row per term gets
// the sentence; the rest keep an honest blank until something knows the sense.
const claimed = new Set();
let done = 0, missed = 0, ambiguous = 0, lines = [];

for (const c of cards) {
  if (LIMIT && done >= LIMIT) break;
  const bank = banks[c.id.startsWith('lexen:') ? 'en-ru' : 'pt-ru'];
  const t = fold(c.term);
  if (!t) { missed++; continue; }
  // Cards arrive commonest-first, so the row that claims the sentence is the
  // sense a learner is most likely to meet.
  const claim = `${c.id.slice(0, c.id.indexOf(':'))}:${t}`;
  if (claimed.has(claim)) { ambiguous++; continue; }
  const words = t.split(' ');
  const post = bank.idx.get(words[0]);
  if (!post) { missed++; continue; }
  // Single words are settled by the index alone; a phrase still has to appear
  // whole, so it is checked against the padded sentence.
  const hit = post.find((i) => {
    const key = `${c.id.startsWith('lexen:') ? 'en' : 'pt'}:${i}`;
    if ((used.get(key) ?? 0) >= MAX_REUSE) return false;
    return words.length === 1 || ` ${bank.rows[i].fold} `.includes(` ${t} `);
  });
  if (hit === undefined) { missed++; continue; }
  const key = `${c.id.startsWith('lexen:') ? 'en' : 'pt'}:${hit}`;
  used.set(key, (used.get(key) ?? 0) + 1);
  claimed.add(claim);
  const r = bank.rows[hit];
  // Only ever fills a hole — an example already on the card wins, whoever put
  // it there.
  lines.push(`UPDATE cards SET ex_t = ${q(r.src)}, ex_trans = ${q(r.dst)} ` +
             `WHERE id = ${q(c.id)} AND (ex_t IS NULL OR ex_t = '');`);
  done++;
  if (lines.length >= 2000) { appendFileSync(out, lines.join('\n') + '\n'); lines = []; }
}
if (lines.length) appendFileSync(out, lines.join('\n') + '\n');
console.error(`done: ${done} cards matched, ${missed} had no sentence, ` +
  `${ambiguous} skipped as another sense of a word already taken → build/ex_link.sql`);
