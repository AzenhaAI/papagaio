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

// Groq retires models on its own schedule, and a hardcoded name is a dead
// man's switch: llama-3.3-70b-versatile vanished overnight and took the
// translator, the coach, the reader and the course with it, because a name in
// the source cannot notice that it stopped existing.
//
// So the name is not the source of truth — the live model list is. These are
// preferences, tried in order against what the account can actually reach, and
// anything unknown to us still works as long as Groq lists it.
const BIG_PREFERENCE = [
  'llama-3.3-70b-versatile',
  'moonshotai/kimi-k2-instruct',
  'openai/gpt-oss-120b',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'qwen/qwen3-32b',
];
const SMALL_PREFERENCE = [
  'llama-3.1-8b-instant',
  'openai/gpt-oss-20b',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'qwen/qwen3-32b',
];

// Cached per isolate: one extra request when a Worker wakes up, never per call.
let AVAILABLE = null;

/** Chat-capable model ids the key can use, or null if the list is unreachable. */
export async function availableModels(env, { fresh = false } = {}) {
  if (AVAILABLE && !fresh) return AVAILABLE;
  try {
    const r = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { authorization: `Bearer ${env.GROQ_API_KEY}` },
    });
    if (!r.ok) return null;
    const j = await r.json();
    const ids = (j.data ?? [])
      .map((m) => m.id)
      .filter((id) => typeof id === 'string')
      // Whisper, the speech synths and the moderation guards live on other
      // endpoints; picking one here would answer a translation with audio.
      .filter((id) => !/whisper|tts|orpheus|playai|guard|embed|rerank/i.test(id));
    AVAILABLE = ids.length ? ids : null;
    return AVAILABLE;
  } catch {
    return null;
  }
}

/** First preference the account can actually reach; the list wins over hope. */
async function pick(env, preference, wanted) {
  const ids = await availableModels(env);
  if (!ids) return wanted ?? preference[0];
  if (wanted && ids.includes(wanted)) return wanted;
  // Nothing preferred is left: take whatever chat model the account has, and
  // prefer the bigger-sounding ones — but never a name we filtered out above.
  return preference.find((m) => ids.includes(m)) ?? ids[0] ?? preference[0];
}

export async function chat(env, messages, { json = false, model, noFallback = false, small = false } = {}) {
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

  const preference = small ? SMALL_PREFERENCE : BIG_PREFERENCE;
  const primary = await pick(env, preference, model ?? env.GROQ_MODEL);
  let { r, j } = await call(primary);

  // A model that no longer exists is not a transient failure — the cached list
  // is simply stale. Refresh it and try whatever is actually there, once.
  if (!r.ok && j?.error?.code === 'model_not_found') {
    AVAILABLE = null;
    await availableModels(env, { fresh: true });
    const retry = await pick(env, preference, null);
    if (retry !== primary) ({ r, j } = await call(retry));
  }

  // Free-tier quotas are PER MODEL, so a second model is a second budget: when
  // the big one runs dry, live users fall through to the small one. Batch jobs
  // pass noFallback so they can never drain the backup budget too.
  if (r.status === 429 && !noFallback) {
    const small = await pick(env, SMALL_PREFERENCE, null);
    if (small !== primary) ({ r, j } = await call(small));
  }

  if (r.status === 429) throw new Error('the translator is catching its breath — try again in a few seconds');
  if (!r.ok) throw new Error('groq: ' + JSON.stringify(j).slice(0, 200));
  return j.choices[0].message.content;
}
