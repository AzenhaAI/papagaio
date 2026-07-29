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
  if (!r.ok) throw new Error('whisper: ' + JSON.stringify(j).slice(0, 200));
  return (j.text ?? '').trim();
}

export async function chat(env, messages, { json = false, model } = {}) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.GROQ_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: model ?? env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.6,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('groq: ' + JSON.stringify(j).slice(0, 200));
  return j.choices[0].message.content;
}
