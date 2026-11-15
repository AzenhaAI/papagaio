// Card audio via Azure AI Speech, through src/tts.js itself.
// Needs AZURE_SPEECH_KEY (and AZURE_SPEECH_REGION if not westeurope) in the env.
// Each character counts against the Speech resource's monthly quota.
// Incremental: skips ids that already have an mp3 in OUT_DIR.
// Output: mp3 files + build/audio.sql with UPDATE cards SET audio=...
// Run: node scripts/gen_audio.mjs
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configureTts, synthesize } from '../src/tts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// The site moved again, this time to the azenha.ai repo, and this path did not
// follow — the same failure its previous note warned about: synthesis succeeds,
// files land in an abandoned checkout, and nothing reaches production. The audio
// directory now lives with the site that actually serves it, and AUDIO_BASE in
// wrangler.toml points at that host.
const OUT_DIR = join(process.env.HOME, 'Projects', 'azenha', 'papagaio', 'audio');
configureTts(process.env);
const synth = async (text, course) => Buffer.from(await synthesize(text, course));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT_DIR, { recursive: true });
const deckDir = join(root, 'data', 'deck');
const cards = [];
for (const file of readdirSync(deckDir).filter((f) => f.endsWith('.json')).sort()) {
  const deck = JSON.parse(readFileSync(join(deckDir, file), 'utf8'));
  for (const c of deck.cards) cards.push({
    id: c.id,
    // 'say' overrides what the voice reads — siglas are letter names, and
    // GNR sounded out as one syllable helps nobody.
    term: c.say ?? c.term ?? c.pt ?? c.en,
    // The example sentence gets its own mp3: connected speech is the skill
    // the isolated word never trains.
    ex: c.ex_t ?? null,
    course: deck.meta.course,
  });
}

let done = 0, skipped = 0, failed = 0;
const sql = [];
const jobs = [];
for (const c of cards) {
  jobs.push({ file: `${c.id}.mp3`, text: c.term, course: c.course, col: 'audio', id: c.id });
  if (c.ex) jobs.push({ file: `${c.id}_ex.mp3`, text: c.ex, course: c.course, col: 'audio_ex', id: c.id });
}
for (const j of jobs) {
  const out = join(OUT_DIR, j.file);
  if (existsSync(out) && statSync(out).size > 1000) {
    skipped++;
    sql.push(`UPDATE cards SET ${j.col} = '${j.file}' WHERE id = '${j.id}';`);
    continue;
  }
  try {
    const audio = await synth(j.text, j.course);
    if (audio.length < 1000) throw new Error('empty audio');
    writeFileSync(out, audio);
    sql.push(`UPDATE cards SET ${j.col} = '${j.file}' WHERE id = '${j.id}';`);
    done++;
    process.stdout.write(`\r${done + skipped}/${jobs.length} ${j.file}          `);
    await sleep(300); // be gentle with the free endpoint
  } catch (e) {
    failed++;
    console.error(`\n${j.file}: ${e.message}`);
    await sleep(2000);
  }
}

mkdirSync(join(root, 'build'), { recursive: true });
writeFileSync(join(root, 'build', 'audio.sql'), sql.join('\n') + '\n');
console.log(`\ndone: ${done} new, ${skipped} existing, ${failed} failed → ${OUT_DIR}`);
console.log(`SQL: build/audio.sql (${sql.length} cards with audio)`);
