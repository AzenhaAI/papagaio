// Audio for the dictionary's word pages that have none: the 10,000 lexicon
// words (built after the deck, never voiced) and deck cards added after the
// last gen_audio.mjs run (the Madeirense set). Same voice and code path as the
// deck audio (src/tts.js, Azure only: no Google key is handed over, so a
// refusal is an error, not a different speaker).
//
// Key: AZURE_SPEECH_KEY from the environment, else from the macOS keychain
// item "papagaio-azure-speech" (security add-generic-password -a azenha
// -s papagaio-azure-speech -w), so it never has to be typed into a command.
//
// Files: build/word_audio/<name>.mp3 — deck cards keep their id (md0001.mp3,
// what gen_audio.mjs would have written), lexicon words get lx-<hash>.mp3, a
// stable name from the spelling (accents and spaces stay out of URLs).
// build/word_audio/manifest.json maps term -> file and id -> file; the word
// page export reads it. Upload: scripts/upload_word_audio.sh (R2 papagaio-audio).
// Incremental: a file already on disk is not synthesised again.
//
// Run: node scripts/gen_word_audio.mjs [--limit N]
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configureTts, synthesize } from '../src/tts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'build', 'word_audio');
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;

let key = process.env.AZURE_SPEECH_KEY;
if (!key) {
  try {
    key = execFileSync('security', ['find-generic-password', '-s', 'papagaio-azure-speech', '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { /* reported below */ }
}
if (!key) {
  console.error('no Azure key: set AZURE_SPEECH_KEY or add the keychain item papagaio-azure-speech');
  process.exit(1);
}
configureTts({ AZURE_SPEECH_KEY: key, AZURE_SPEECH_REGION: process.env.AZURE_SPEECH_REGION || 'northeurope' });

const lexFile = (term) => `lx-${createHash('sha1').update(term.normalize('NFC')).digest('hex').slice(0, 12)}.mp3`;

const pages = JSON.parse(readFileSync(join(root, 'site', 'src', 'data', 'words.json'), 'utf8')).pages;
const jobs = pages.filter((p) => !p.audio && /\p{Script=Latin}/u.test(p.term)).map((p) => ({
  term: p.term, id: p.lex ? null : p.id, file: p.lex ? lexFile(p.term) : `${p.id}.mp3`,
}));

mkdirSync(OUT, { recursive: true });
const manifestPath = join(OUT, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { terms: {}, ids: {} };
const save = () => writeFileSync(manifestPath, JSON.stringify(manifest));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let done = 0, skipped = 0, failed = 0;
for (const j of jobs) {
  if (done >= LIMIT) break;
  const out = join(OUT, j.file);
  if (!(existsSync(out) && statSync(out).size > 1000)) {
    let ok = false;
    for (let attempt = 0; attempt < 5 && !ok; attempt++) {
      try {
        const audio = Buffer.from(await synthesize(j.term, 'pt'));
        if (audio.length < 1000) throw new Error('empty audio');
        writeFileSync(out, audio);
        ok = true;
      } catch (e) {
        // The free tier allows ~20 requests a minute; a 429 waits it out.
        const wait = /429|rate limit/.test(e.message) ? 30000 * (attempt + 1) : 2000;
        console.error(`\n${j.term}: ${e.message} — retry in ${wait / 1000}s`);
        await sleep(wait);
      }
    }
    if (!ok) { failed++; continue; }
    done++;
    await sleep(300);
  } else skipped++;
  if (j.id) manifest.ids[j.id] = j.file; else manifest.terms[j.term] = j.file;
  if ((done + skipped) % 100 === 0) save();
  process.stdout.write(`\r${done + skipped}/${jobs.length} new ${done} failed ${failed}   `);
}
save();
console.log(`\ndone: ${done} new, ${skipped} existing, ${failed} failed -> ${OUT}`);
