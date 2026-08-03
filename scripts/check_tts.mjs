// Diagnostic for the Edge TTS gate.
//
// Microsoft gates the free readaloud endpoint on a Chromium version string. When
// they move it, every synthesis call starts returning 403 and nothing else in the
// stack changes — so the failure looks like a broken worker rather than an
// expired constant. This script isolates that: it talks to the endpoint directly
// and tells you whether the gate or something else is at fault.
//
// If it reports 403, bump EDGE_VERSION here and in src/tts.js to the current
// Chromium version the edge-tts Python package uses, and redeploy.
//
// Run: node scripts/check_tts.mjs
import crypto from 'node:crypto';
import WebSocket from 'ws';

const TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const EDGE_VERSION = '1-143.0.3650.75';
const CHROME = EDGE_VERSION.slice(2).split('.')[0];

const VOICES = { pt: 'pt-PT-DuarteNeural', en: 'en-GB-RyanNeural' };
const LANGS = { pt: 'pt-PT', en: 'en-GB' };

const course = process.argv[2] === 'en' ? 'en' : 'pt';
const text = process.argv[3] ?? (course === 'en' ? 'Good morning.' : 'Bom dia, tudo bem?');

// Ticks since the Windows epoch, rounded to five minutes, hashed with the token.
let sec = Math.floor(Date.now() / 1000) + 11644473600;
sec -= sec % 300;
const gec = crypto.createHash('sha256').update(`${sec * 1e7}${TOKEN}`).digest('hex').toUpperCase();
const connId = crypto.randomUUID().replace(/-/g, '');

const ws = new WebSocket(
  `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` +
  `?TrustedClientToken=${TOKEN}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=${EDGE_VERSION}&ConnectionId=${connId}`,
  {
    headers: {
      Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      'User-Agent':
        `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ` +
        `Chrome/${CHROME}.0.0.0 Safari/537.36 Edg/${CHROME}.0.0.0`,
      Pragma: 'no-cache',
      'Cache-Control': 'no-cache',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  }
);

let bytes = 0;
const timer = setTimeout(() => {
  console.error('TIMEOUT — connected but no audio came back within 15s');
  process.exit(2);
}, 15000);

ws.on('open', () => {
  const ts = new Date().toISOString();
  ws.send(
    `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
    JSON.stringify({ context: { synthesis: { audio: {
      metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' },
      outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
    } } } })
  );
  ws.send(
    `X-RequestId:${connId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}\r\nPath:ssml\r\n\r\n` +
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${LANGS[course]}'>` +
    `<voice name='${VOICES[course]}'>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</voice></speak>`
  );
});

ws.on('message', (data, isBinary) => {
  if (!isBinary) {
    if (data.toString().includes('Path:turn.end')) {
      clearTimeout(timer);
      ws.close();
      if (bytes > 1000) {
        console.log(`OK — ${VOICES[course]} returned ${bytes} bytes for "${text}"`);
        process.exit(0);
      }
      console.error(`EMPTY — the gate let us in but no audio arrived (${bytes} bytes)`);
      process.exit(3);
    }
    return;
  }
  const buf = new Uint8Array(data);
  const headerLen = (buf[0] << 8) | buf[1];
  if (new TextDecoder().decode(buf.slice(2, 2 + headerLen)).includes('Path:audio')) {
    bytes += buf.length - 2 - headerLen;
  }
});

ws.on('unexpected-response', (_req, res) => {
  clearTimeout(timer);
  console.error(
    `HTTP ${res.statusCode} — the version gate rejected us.\n` +
    `Sec-MS-GEC-Version is ${EDGE_VERSION}. Check what the edge-tts package uses now\n` +
    `and update it here and in src/tts.js.`
  );
  process.exit(1);
});

ws.on('error', (e) => {
  clearTimeout(timer);
  console.error('WS ERROR —', e.message);
  process.exit(1);
});
