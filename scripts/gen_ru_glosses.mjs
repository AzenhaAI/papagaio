// Russian glosses as a quiet overlay for learners who set the interface to
// Russian: explanation only — the deck, the audio and the product stay exactly
// as they are, and nothing Cyrillic enters the repository (build/ is
// gitignored; the source download lives in .cache/).
//
// Source: Russian Wiktionary via kaikki.org (CC BY-SA). Human-written glosses;
// words it lacks simply keep their English gloss in the app.
//
// Run:  node scripts/gen_ru_glosses.mjs
//       npx wrangler d1 execute papagaio --remote --file build/ru.sql

import { createInterface } from 'node:readline';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, '.cache', 'pt_ruwiki.jsonl');
if (!existsSync(src)) {
  console.error('download first: curl -o .cache/pt_ruwiki.jsonl <kaikki ruwiktionary Portuguese jsonl>');
  process.exit(1);
}

// term(+pos) → glosses. Multiple Wiktionary entries per word merge; the first
// few senses are the useful ones.
const ru = new Map();
const clean = (g) => g
  .replace(/\{\{[^}]*\}\}/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const rl = createInterface({ input: createReadStream(src), crlfDelay: Infinity });
for await (const line of rl) {
  let e;
  try { e = JSON.parse(line); } catch { continue; }
  const term = String(e.word ?? '').trim().toLowerCase();
  if (!term) continue;
  const glosses = (e.senses ?? [])
    .flatMap((s) => s.glosses ?? [])
    .map(clean)
    .filter((g) => g && !/тан脚本|Шаблон|\?/.test(g) && g.length < 120);
  if (!glosses.length) continue;
  const key = `${term}|${e.pos ?? ''}`;
  ru.set(key, [...(ru.get(key) ?? []), ...glosses]);
  // Also keyed bare, for rows whose pos disagrees with ru-wiktionary's.
  ru.set(term, [...(ru.get(term) ?? []), ...glosses]);
}

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const strip = (t) => t.toLowerCase().replace(/^([oa]s?|um|uma) /, '').trim();
const pick = (key, bare) => {
  const g = ru.get(key) ?? ru.get(bare);
  if (!g) return null;
  return [...new Set(g)].slice(0, 3).join('; ').slice(0, 220);
};

const lines = [];
let hits = 0, misses = 0;

// The lexicon: id encodes term|pos already.
const enKeys = new Set();
for (const f of readdirSync(join(root, 'data', 'lexicon')).filter((x) => x.endsWith('.json')).sort()) {
  for (const w of JSON.parse(readFileSync(join(root, 'data', 'lexicon', f), 'utf8')).words) {
    enKeys.add(`${w.term.toLowerCase()}|${w.pos}`);
    const g = pick(`${w.term.toLowerCase()}|${w.pos}`, w.term.toLowerCase());
    if (!g) { misses++; continue; }
    hits++;
    lines.push(`UPDATE cards SET trans_ru = ${q(g)} WHERE id = ${q(`lex:${w.term}|${w.pos}`)};`);
  }
}

// The teaching deck: terms carry articles, ids are the card ids.
for (const f of readdirSync(join(root, 'data', 'deck')).filter((x) => x.endsWith('.json')).sort()) {
  const deck = JSON.parse(readFileSync(join(root, 'data', 'deck', f), 'utf8'));
  if (deck.meta.course !== 'pt') continue;
  for (const c of deck.cards) {
    if (c.pos === 'drill') continue;
    const term = strip(c.term ?? c.pt ?? '');
    const g = pick(`${term}|${c.pos}`, term);
    if (!g) { misses++; continue; }
    hits++;
    lines.push(`UPDATE cards SET trans_ru = ${q(g)} WHERE id = ${q(c.id)};`);
  }
}

// The monolingual layer (lexpt: rows, words only the Portuguese Wiktionary
// carries) is a separate population this pass never reached, so its Russian was
// left entirely to the nightly model batches. Where ru-wiktionary knows the
// word, a human-written gloss beats a generated one and costs no quota.
// Written apart from ru.sql: these rows are being glossed by the model in
// parallel, and the guard keeps this from overwriting what it produced.
const lexptLines = [];
let lexptHits = 0;
const POSMAP = { intj: 'interj' };
for (const f of readdirSync(join(root, 'data', 'lexicon_ptdef')).filter((x) => x.endsWith('.json')).sort()) {
  for (const w of JSON.parse(readFileSync(join(root, 'data', 'lexicon_ptdef', f), 'utf8')).words) {
    const pos = POSMAP[w.pos] ?? w.pos;
    // Entries the English layer already carries were merged into a lex: card;
    // no lexpt: row was ever minted for them.
    if (enKeys.has(`${w.term.toLowerCase()}|${pos}`)) continue;
    const g = pick(`${w.term.toLowerCase()}|${pos}`, w.term.toLowerCase());
    if (!g) continue;
    lexptHits++;
    lexptLines.push(`UPDATE cards SET trans_ru = ${q(g)} WHERE id = ${q(`lexpt:${w.term}|${pos}`)} AND trans_ru IS NULL;`);
  }
}

mkdirSync(join(root, 'build'), { recursive: true });
writeFileSync(join(root, 'build', 'ru.sql'), lines.join('\n') + '\n');
writeFileSync(join(root, 'build', 'ru_lexpt.sql'), lexptLines.join('\n') + '\n');
console.error(`glosses: ${hits} matched, ${misses} without Russian — those stay English`);
console.error(`lexpt layer: ${lexptHits} matched → build/ru_lexpt.sql`);
