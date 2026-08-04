// Builds the lookup lexicon: every reasonably common Portuguese word, with an
// English gloss, so the dictionary can answer for "gato" without asking a model.
//
// Two open sources, both credited in the app:
//   · English Wiktionary via kaikki.org — headwords, part of speech, gender,
//     glosses. CC BY-SA 4.0.
//   · OpenSubtitles 2018 frequency list (hermitdave/FrequencyWords) — the
//     ranking, so the commonest words come first and the tail can be cut.
//     CC BY-SA 4.0.
//
// Why not just ask the model: a generated gloss is right most of the time and
// silently wrong the rest, and a learner cannot tell which. Wiktionary is
// human-written and checkable. The model stays for the long tail this misses.
//
// Deliberately dropped: Brazilian-only senses are kept but labelled, inflected
// forms ("form of" entries) are dropped — the conjugator generates those, and a
// dictionary full of "abandonava" is a dictionary you cannot browse.
//
// Run:  node scripts/build_lexicon.mjs [maxWords]
// Out:  data/lexicon/lex_NNN.json  (sharded, so no single file is unreadable)

import { createWriteStream, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const work = join(root, '.cache');
const outDir = join(root, 'data', 'lexicon');
const MAX = parseInt(process.argv[2] ?? '12000', 10);

const FREQ_URL = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/pt/pt_50k.txt';
const WIKT_URL = 'https://kaikki.org/dictionary/Portuguese/kaikki.org-dictionary-Portuguese.jsonl';

mkdirSync(work, { recursive: true });
mkdirSync(outDir, { recursive: true });
// A shorter run must not leave the tail of a longer one behind: stale shards
// would be loaded as if they were current.
for (const f of readdirSync(outDir).filter((x) => x.startsWith('lex_'))) rmSync(join(outDir, f));

async function fetchTo(url, file) {
  if (existsSync(file)) return file;
  process.stderr.write(`downloading ${url}\n`);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(file));
  return file;
}

const freqFile = await fetchTo(FREQ_URL, join(work, 'pt_50k.txt'));
const wiktFile = await fetchTo(WIKT_URL, join(work, 'pt_wiktionary.jsonl'));

// Rank: word → position. Everything past MAX is tail we do not carry.
const rank = new Map();
readFileSync(freqFile, 'utf8').split('\n').forEach((line, i) => {
  const w = line.split(' ')[0];
  if (w && !rank.has(w) && rank.size < MAX * 4) rank.set(w, i);
});

const POS = {
  noun: 'noun', verb: 'verb', adj: 'adj', adv: 'adv', pron: 'pron',
  prep: 'prep', conj: 'conj', num: 'num', intj: 'interj', phrase: 'phrase',
  article: 'det', det: 'det', particle: 'particle',
  // No proper names: "Olga" is not vocabulary, and its Wiktionary entry is a
  // transliteration note in scripts this app never shows.
};

// Wiktionary glosses sometimes carry the source spelling of a borrowing. The
// app is English-and-Portuguese only, so anything in another script is dropped
// rather than shown to a learner as if it were part of the definition.
const stripOther = (t) => t
  .replace(/\([^()]*[^\x00-\u024f][^()]*\)/g, '')
  .replace(/\s{2,}/g, ' ')
  .trim();

// Wiktionary marks inflections with form_of; the conjugator owns those. Note
// that "feminine" and "plural" on a *sense* are gender marking, not inflection
// — dropping those took half the feminine nouns out, saudade included.
const isInflection = (sense) =>
  (sense.form_of?.length ?? 0) > 0 ||
  (sense.tags ?? []).some((t) => ['form-of', 'participle'].includes(t));

const words = new Map();

const rl = createInterface({ input: createReadStream(wiktFile), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line) continue;
  let e;
  try { e = JSON.parse(line); } catch { continue; }
  if (e.lang_code !== 'pt') continue;

  const term = String(e.word ?? '').trim();
  if (!term || term.length > 32) continue;
  const r = rank.get(term.toLowerCase());
  if (r === undefined || r >= MAX) continue;

  const pos = POS[e.pos];
  if (!pos) continue;

  const senses = (e.senses ?? [])
    .filter((s) => !isInflection(s) && (s.glosses?.length ?? 0) > 0)
    .map((s) => ({
      trans: stripOther(String(s.glosses[s.glosses.length - 1]).trim()),
      // Regional labels matter for us more than for a general dictionary: this
      // is how a pt-PT learner is told a sense is Brazilian.
      tags: (s.tags ?? []).filter((t) =>
        ['Brazil', 'Portugal', 'colloquial', 'slang', 'archaic', 'informal', 'vulgar'].includes(t)),
      // Examples are dropped whole if they contain a character outside Latin —
      // usually a Cyrillic homoglyph typo'd into the Wiktionary source, which
      // would look like Portuguese and be unsearchable.
      ex: (s.examples ?? []).map((x) => x.text).filter(Boolean)
        .filter((t) => !/[^\x00-\u024f\u2000-\u206f]/.test(t))
        .slice(0, 1)[0] ?? '',
    }))
    .slice(0, 6);
  if (!senses.length) continue;

  // Wiktionary writes gender into the headword line ("gato m (plural gatos)"),
  // and into forms tags. The headword line is the reliable one.
  const head = (e.head_templates ?? []).map((h) => h.expansion ?? '').join(' ');
  const senseTags = new Set((e.senses ?? []).flatMap((s) => s.tags ?? []));
  const gender = pos !== 'noun' ? null
    : /\bm or f\b|\bmf\b/.test(head) ? 'm/f'
    : /\bf\b/.test(head) || senseTags.has('feminine') ? 'f'
    : /\bm\b/.test(head) || senseTags.has('masculine') ? 'm'
    : null;

  const key = `${term}|${pos}`;
  if (words.has(key)) {
    words.get(key).senses.push(...senses);
    continue;
  }
  words.set(key, { term, pos, gender, rank: r, senses });
}

const all = [...words.values()]
  .map((w) => ({ ...w, senses: w.senses.slice(0, 6) }))
  .sort((a, b) => a.rank - b.rank || a.term.localeCompare(b.term));

// Sharded at a thousand apiece: reviewable in an editor, and a bad batch can be
// regenerated without touching the rest.
const SHARD = 1000;
for (let i = 0; i < all.length; i += SHARD) {
  const n = String(i / SHARD + 1).padStart(3, '0');
  writeFileSync(join(outDir, `lex_${n}.json`), JSON.stringify({
    meta: {
      shard: n,
      source: 'English Wiktionary via kaikki.org (CC BY-SA 4.0); ranking from OpenSubtitles 2018 frequency list (CC BY-SA 4.0)',
      note: 'Lookup lexicon, not the teaching deck. Inflected forms are dropped — the conjugator generates them.',
    },
    words: all.slice(i, i + SHARD),
  }, null, 1) + '\n');
}

process.stderr.write(`${all.length} words → ${outDir}\n`);
