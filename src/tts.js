// Edge TTS over WebSocket — the same free synthesis the edge-tts package uses,
// but straight from the Worker: AI-coach replies cannot be pre-generated.

const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

export const VOICES = {
  pt: 'pt-PT-DuarteNeural',
  en: 'en-GB-RyanNeural',
};

// Sec-MS-GEC: SHA-256 of (windows ticks rounded to 5 minutes + token).
async function secMsGec() {
  let sec = Math.floor(Date.now() / 1000) + 11644473600;
  sec -= sec % 300;
  const data = new TextEncoder().encode(`${sec * 1e7}${TRUSTED_TOKEN}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

const escapeXml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Synthesizes text to mp3 (Uint8Array). course: 'pt' | 'en'. */
export async function synthesize(text, course) {
  const voice = VOICES[course] ?? VOICES.pt;
  const lang = course === 'en' ? 'en-GB' : 'pt-PT';
  const gec = await secMsGec();
  const connId = crypto.randomUUID().replace(/-/g, '');
  const url =
    `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` +
    `?TrustedClientToken=${TRUSTED_TOKEN}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=1-143.0.3650.75&ConnectionId=${connId}`;

  const resp = await fetch(url, {
    headers: {
      Upgrade: 'websocket',
      Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
      Pragma: 'no-cache',
      'Cache-Control': 'no-cache',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  const ws = resp.webSocket;
  if (!ws) throw new Error('tts: websocket upgrade failed');
  ws.accept();

  const ts = new Date().toISOString();
  ws.send(
    `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
    JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' },
            outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
          },
        },
      },
    })
  );
  ws.send(
    `X-RequestId:${connId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}\r\nPath:ssml\r\n\r\n` +
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>` +
    `<voice name='${voice}'>${escapeXml(text)}</voice></speak>`
  );

  // In Workers binary frames arrive as Blob (not ArrayBuffer) — read them async
  // and, on turn.end, wait for any chunks still being read.
  const chunkPromises = [];
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('tts: timeout'));
    }, 20000);

    ws.addEventListener('message', (ev) => {
      if (typeof ev.data === 'string') {
        if (ev.data.includes('Path:turn.end')) {
          clearTimeout(timer);
          ws.close();
          resolve(
            Promise.all(chunkPromises).then((parts) => {
              const chunks = parts.filter(Boolean);
              const total = chunks.reduce((n, c) => n + c.length, 0);
              const out = new Uint8Array(total);
              let off = 0;
              for (const c of chunks) { out.set(c, off); off += c.length; }
              return out;
            })
          );
        }
        return;
      }
      // Binary frame: [2-byte header length][header][audio].
      chunkPromises.push(
        (async () => {
          const raw = ev.data instanceof ArrayBuffer ? ev.data : await ev.data.arrayBuffer();
          const buf = new Uint8Array(raw);
          const headerLen = (buf[0] << 8) | buf[1];
          const header = new TextDecoder().decode(buf.slice(2, 2 + headerLen));
          return header.includes('Path:audio') ? buf.slice(2 + headerLen) : null;
        })()
      );
    });

    ws.addEventListener('error', (e) => {
      clearTimeout(timer);
      reject(new Error('tts: ' + (e.message ?? 'ws error')));
    });
  });
}
