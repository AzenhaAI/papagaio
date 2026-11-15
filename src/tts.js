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
// "northeurope", the region the Speech resource was created in).
//
// Google Cloud Text-to-Speech is the spare: when Azure refuses (its monthly
// free characters used up, a rate limit, an outage, a rejected key) the same
// text goes to Google, so a learner hears a voice rather than nothing.
// Secret: GOOGLE_TTS_KEY (an API key restricted to the Text-to-Speech API).
// Variables: GOOGLE_TTS_VOICE_PT / GOOGLE_TTS_VOICE_EN override the voices.

export const VOICES = {
  pt: 'pt-PT-DuarteNeural',
  en: 'en-GB-RyanNeural',
};
// Male voices, as Duarte and Ryan are, so a fallback does not swap the
// speaker's sex mid-lesson.
export const GOOGLE_VOICES = {
  pt: 'pt-PT-Wavenet-F',
  en: 'en-GB-Neural2-B',
};

// synthesize() is called from many places that do not carry env, so the entry
// points hand the settings over once per request instead.
let config = { key: '', region: '', googleKey: '', googleVoices: GOOGLE_VOICES, force: '' };

/** Called by the Worker's fetch/scheduled handlers with their env. */
export function configureTts(env) {
  config = {
    key: env?.AZURE_SPEECH_KEY || '',
    region: env?.AZURE_SPEECH_REGION || 'northeurope',
    googleKey: env?.GOOGLE_TTS_KEY || '',
    googleVoices: {
      pt: env?.GOOGLE_TTS_VOICE_PT || GOOGLE_VOICES.pt,
      en: env?.GOOGLE_TTS_VOICE_EN || GOOGLE_VOICES.en,
    },
    // Only ever set from the command line for a test (wrangler dev --var
    // TTS_FORCE:google); never in wrangler.toml.
    force: env?.TTS_FORCE || '',
  };
}

const escapeXml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Synthesizes text to mp3 (Uint8Array). course: 'pt' | 'en'.
 *  Azure first, Google when Azure fails. */
export async function synthesize(text, course) {
  if (config.force === 'google') return synthesizeGoogle(text, course);
  try {
    return await synthesizeAzure(text, course);
  } catch (azureError) {
    if (!config.googleKey) throw azureError;
    try {
      const audio = await synthesizeGoogle(text, course);
      console.log('tts: Azure failed, Google answered —', azureError.message);
      return audio;
    } catch (googleError) {
      throw new Error(`${azureError.message}; ${googleError.message}`);
    }
  }
}

async function synthesizeAzure(text, course) {
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
  const audio = new Uint8Array(await resp.arrayBuffer());
  // Azure answers 200 with no bytes for text it cannot pronounce; an empty
  // mp3 is a failure, not an answer (it was cached and sent to Telegram).
  if (!audio.byteLength) throw new Error('tts: empty audio');
  return audio;
}

async function synthesizeGoogle(text, course) {
  if (!config.googleKey) throw new Error('tts: GOOGLE_TTS_KEY is not set');
  const name = config.googleVoices[course] ?? config.googleVoices.pt;
  const resp = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(config.googleKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: name.slice(0, 5), name },
        audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 24000 },
      }),
      signal: AbortSignal.timeout(20000),
    }
  );
  if (!resp.ok) {
    const why = (await resp.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
    throw new Error(`google tts: HTTP ${resp.status} ${why}`.trim());
  }
  const b64 = (await resp.json()).audioContent ?? '';
  const audio = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (!audio.byteLength) throw new Error('google tts: empty audio');
  return audio;
}

/** The Google voices available for a language (for choosing GOOGLE_VOICES). */
export async function googleVoiceList(languageCode) {
  if (!config.googleKey) throw new Error('tts: GOOGLE_TTS_KEY is not set');
  const r = await fetch(
    `https://texttospeech.googleapis.com/v1/voices?languageCode=${encodeURIComponent(languageCode)}&key=${encodeURIComponent(config.googleKey)}`
  );
  if (!r.ok) throw new Error(`google voices: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
  return (await r.json()).voices ?? [];
}
