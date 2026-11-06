// Speech through Azure AI Speech — Microsoft's official text-to-speech API.
//
// Until November 2026 this talked to the read-aloud endpoint the Edge browser
// uses, the way the edge-tts package does. That endpoint is not a public API:
// Microsoft gates it on a token scheme it changes without notice, and when it
// changed, every synthesis started failing with "websocket upgrade failed".
// Azure serves the very same neural voices from a documented REST endpoint with
// a key, so the voices people know stay and nothing breaks behind our back.
//
// Free tier (F0): 0.5 million characters a month of neural voices. AI-coach
// replies and the odd card are far below that; the course audio is
// pre-generated and served from AUDIO_BASE, not synthesised here.
//
// Worker secrets: AZURE_SPEECH_KEY. Variable: AZURE_SPEECH_REGION (e.g.
// "westeurope", the region the Speech resource was created in).

export const VOICES = {
  pt: 'pt-PT-DuarteNeural',
  en: 'en-GB-RyanNeural',
};

// synthesize() is called from many places that do not carry env, so the entry
// points hand the settings over once per request instead.
let config = { key: '', region: '' };

/** Called by the Worker's fetch/scheduled handlers with their env. */
export function configureTts(env) {
  config = {
    key: env?.AZURE_SPEECH_KEY || '',
    region: env?.AZURE_SPEECH_REGION || 'westeurope',
  };
}

const escapeXml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Synthesizes text to mp3 (Uint8Array). course: 'pt' | 'en'. */
export async function synthesize(text, course) {
  if (!config.key) throw new Error('tts: AZURE_SPEECH_KEY is not set');
  const voice = VOICES[course] ?? VOICES.pt;
  const lang = course === 'en' ? 'en-GB' : 'pt-PT';

  const resp = await fetch(
    `https://${config.region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': config.key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'papagaio',
      },
      body:
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>` +
        `<voice name='${voice}'>${escapeXml(text)}</voice></speak>`,
      signal: AbortSignal.timeout(20000),
    }
  );
  if (!resp.ok) {
    const why = resp.status === 401 ? 'key rejected'
      : resp.status === 429 ? 'free quota or rate limit reached'
      : (await resp.text().catch(() => '')).slice(0, 120);
    throw new Error(`tts: HTTP ${resp.status} ${why}`.trim());
  }
  return new Uint8Array(await resp.arrayBuffer());
}
