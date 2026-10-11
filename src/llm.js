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

// The coach: Claude Haiku first, when ANTHROPIC_API_KEY is set.
//
// The coach is where quality shows: it corrects the learner's own sentence,
// and a Brazilian construction offered as the fix ("Preciso comprar" for pt-PT
// "Preciso de comprar") teaches the wrong language. Its traffic is a few
// hundred turns a day, small enough to pay for. The key lives in its own
// Anthropic workspace with a monthly limit: a spent balance, an expired key or
// a timeout is not an error the learner sees — the turn goes to the free lane.
export const COACH_MODEL = 'claude-haiku-5-5';

/** OpenAI-style messages → Anthropic's system + alternating user/assistant. */
export function toAnthropic(messages) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const turns = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const content = String(m.content ?? '');
    if (turns.length && turns[turns.length - 1].role === role) turns[turns.length - 1].content += `\n${content}`;
    else turns.push({ role, content });
  }
  // The scene opens with the coach's line; the API wants the learner first.
  if (!turns.length || turns[0].role !== 'user') turns.unshift({ role: 'user', content: '(The scene begins.)' });
  return { system, messages: turns };
}

async function chatClaude(env, messages, { json, maxTokens }) {
  const { system, messages: turns } = toAnthropic(messages);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: env.COACH_MODEL || COACH_MODEL, max_tokens: maxTokens, system, messages: turns }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`claude ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const out = await res.json();
  const text = (out.content ?? []).filter((c) => c?.type === 'text').map((c) => c.text).join('').trim();
  if (!json) return text || null;
  return jsonText(text);
}

export async function chatCoach(env, messages, { json = false, maxTokens = 1200 } = {}) {
  if (env.ANTHROPIC_API_KEY && env.COACH_LANE !== 'free') {
    try {
      const text = await chatClaude(env, messages, { json, maxTokens });
      if (text) return text;
      console.log('coach: claude gave no usable answer');
    } catch (e) {
      // Why Claude did not answer, never what the learner said.
      console.log(`coach: claude skipped: ${String(e?.message ?? e).slice(0, 160)}`);
    }
  }
  return chatLive(env, messages, { json, maxTokens });
}
