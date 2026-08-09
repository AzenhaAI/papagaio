// Card audio via Edge TTS (same protocol as src/tts.js).
// Incremental: skips ids that already have an mp3 in OUT_DIR.
// Output: mp3 files + build/audio.sql with UPDATE cards SET audio=...
// Run: node scripts/gen_audio.mjs
import crypto from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// The site repo moved under ~/Projects; a stale path here silently re-synthesised
// the whole deck into an abandoned folder and reported success.
const OUT_DIR = join(process.env.HOME, 'Projects', 'shpara1', 'papagaio', 'audio');
const TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const VOICES = { pt: 'pt-PT-DuarteNeural', en: 'en-GB-RyanNeural' };
const LANGS = { pt: 'pt-PT', en: 'en-GB' };

function gecUrl() {
  let sec = Math.floor(Date.now() / 1000) + 11644473600;
  sec -= sec % 300;
  const gec = crypto.createHash('sha256').update(`${sec * 1e7}${TOKEN}`).digest('hex').toUpperCase();
  const connId = crypto.randomUUID().replace(/-/g, '');
  return {
    url: `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TOKEN}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=1-143.0.3650.75&ConnectionId=${connId}`,
    connId,
  };
}

const HEADERS = {
  Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
  Pragma: 'no-cache',
  'Cache-Control': 'no-cache',
  'Accept-Language': 'en-US,en;q=0.9',
};

const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function synth(text, course) {
  return new Promise((resolve, reject) => {
    const { url, connId } = gecUrl();
    const ws = new WebSocket(url, { headers: HEADERS });
    const chunks = [];
    const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 20000);

    ws.on('open', () => {
      const ts = new Date().toISOString();
      ws.send(`X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        JSON.stringify({ context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' }, outputFormat: 'audio-24khz-48kbitrate-mono-mp3' } } } }));
      ws.send(`X-RequestId:${connId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}\r\nPath:ssml\r\n\r\n` +
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${LANGS[course]}'><voice name='${VOICES[course]}'>${escapeXml(text)}</voice></speak>`);
    });
    ws.on('message', (data, isBinary) => {
      if (!isBinary) {
        if (data.toString().includes('Path:turn.end')) {
          clearTimeout(timer);
          ws.close();
          resolve(Buffer.concat(chunks));
        }
        return;
      }
      const buf = new Uint8Array(data);
      const headerLen = (buf[0] << 8) | buf[1];
      const header = new TextDecoder().decode(buf.slice(2, 2 + headerLen));
      if (header.includes('Path:audio')) chunks.push(Buffer.from(buf.slice(2 + headerLen)));
    });
    ws.on('unexpected-response', (_r, res) => { clearTimeout(timer); reject(new Error('HTTP ' + res.statusCode)); });
    ws.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

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
