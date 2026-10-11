// The live lane: what a learner waits for — the translator and the coach.
//
// Groq alone used to carry it, and when its per-minute budget for the big
// model ran dry the request fell straight to an 8B model, or to "catching its
// breath". Workers AI runs on this Worker's own account with a budget of its
// own, so it now stands between the two: Groq's big model, then the same
// Llama 3.3 70B on Workers AI, then Groq's small models.
//
// Measured on 11 Oct 2026 with the real translator prompt: Groq answered in
// 2.3 s and got pt-PT right ("Preciso de comprar"); Llama 3.3 70B on Workers
// AI took 3-4 s; Gemma 4 26B — 24/24 in the Model Lab benchmark — took 27-39 s
// per answer, which rules it out for anything a person waits on. The free
// Workers AI allowance covers roughly a hundred such answers a day, which is
// what a spare is for.
//
// A JSON request only counts as answered when the text parses: an object
// wrapped in prose or a code fence is unwrapped, and a model that cannot
// produce JSON passes the request on.
import { chat as groqChat } from './groq.js';

const SPARE_MODELS = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast'];

/** The JSON object inside a model's answer, as text, or null. */
export function jsonText(text) {
  const s = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { JSON.parse(s); return s; } catch { /* look inside */ }
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) {
    const inner = s.slice(a, b + 1);
    try { JSON.parse(inner); return inner; } catch { /* not JSON */ }
  }
  return null;
}

async function workersAI(env, messages, json, maxTokens) {
  if (!env.AI) return null;
  for (const model of SPARE_MODELS) {
    try {
      const out = await env.AI.run(model, {
        messages,
        max_tokens: maxTokens,
        temperature: 0.6,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      });
      const resp = out?.response ?? out?.choices?.[0]?.message?.content ?? '';
      const text = typeof resp === 'object' ? JSON.stringify(resp) : String(resp).trim();
      if (!text) continue;
      if (!json) return text;
      const body = jsonText(text);
      if (body) return body;
    } catch (e) {
      // Out of neurons, a model retired, a timeout: the next engine answers.
      console.log(`live lane: ${model} failed: ${String(e?.message ?? e).slice(0, 120)}`);
    }
  }
  return null;
}

export async function chatLive(env, messages, { json = false, maxTokens = 1200 } = {}) {
  try {
    return await groqChat(env, messages, { json, noFallback: true });
  } catch (e) {
    console.log(`live lane: groq big failed: ${String(e?.message ?? e).slice(0, 120)}`);
  }
  const spare = await workersAI(env, messages, json, maxTokens);
  if (spare) return spare;
  return groqChat(env, messages, { json, small: true });
}
