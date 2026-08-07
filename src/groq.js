// Groq: Whisper for voice transcription + LLM for dialogs. Free tier.

export async function transcribe(env, bytes, language, filename = 'voice.ogg', mime = 'audio/ogg') {
  // Whisper keys the container format off the filename extension, so browser
  // recordings (webm in Chrome, mp4 in Safari) must arrive under their own name.
  const fd = new FormData();
  fd.append('file', new Blob([bytes], { type: mime }), filename);
  fd.append('model', 'whisper-large-v3-turbo');
  fd.append('language', language);
  fd.append('response_format', 'json');
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: fd,
  });
  const j = await r.json();
  if (r.status === 429) throw new Error('the ear is catching its breath — try again in a few seconds');
  if (!r.ok) throw new Error('whisper: ' + JSON.stringify(j).slice(0, 200));
  return (j.text ?? '').trim();
}

// Groq's free-tier quotas are PER MODEL, so a second model is a second budget.
// When the main model runs dry (batch jobs can eat a whole day of tokens), live
// users fall through to the smaller model instead of hitting a wall.
const FALLBACK_MODEL = 'llama-3.1-8b-instant';

export async function chat(env, messages, { json = false, model, noFallback = false } = {}) {
  const call = async (m) => {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.GROQ_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: m,
        messages,
        temperature: 0.6,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    const j = await r.json();
    return { r, j };
  };
  const primary = model ?? env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';
  let { r, j } = await call(primary);
  // The fallback is reserved for interactive traffic: batch jobs (glosses)
  // pass noFallback so they can never drain the backup budget too.
  if (r.status === 429 && !noFallback && primary !== FALLBACK_MODEL) {
    ({ r, j } = await call(FALLBACK_MODEL));
  }
  if (r.status === 429) throw new Error('the translator is catching its breath — try again in a few seconds');
  if (!r.ok) throw new Error('groq: ' + JSON.stringify(j).slice(0, 200));
  return j.choices[0].message.content;
}
