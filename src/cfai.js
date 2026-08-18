// Workers AI: the second glossing lane.
//
// Groq's free budgets are per model AND per minute, and the per-minute one is
// what the nightly batch actually hits — measured, not guessed: a quarter of
// the batches came back 429 while the day's token budget was nowhere near
// spent. A bigger nightly ceiling alone therefore buys nothing; a second
// provider does, because its quota is entirely its own.
//
// Workers AI runs on the same Cloudflare account as this Worker, so there is
// no extra credential to keep, and a queue moved here stops competing with the
// live translator altogether.

// Names are preferences, not truths — the same lesson Groq taught this project
// when llama-3.3-70b-versatile vanished overnight. Anything that answers wins.
const MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-3.1-8b-instruct',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
  '@cf/google/gemma-3-12b-it',
];

/**
 * One chat completion on Workers AI. Returns the raw text; parsing is the
 * caller's business, exactly as with the Groq path.
 */
export async function chatCF(env, messages, { maxTokens = 900 } = {}) {
  if (!env.AI) throw new Error('workers ai not configured');
  // The FIRST refusal is the one worth reporting. When the day's neurons run
  // out every model fails alike, and keeping the last error meant the lane
  // blamed whichever name happened to sit at the end of the list — a
  // deprecation notice from a model we would never have reached on a good day,
  // hiding the real answer, which is simply "no budget left".
  let firstError;
  for (const model of MODELS) {
    try {
      const out = await env.AI.run(model, { messages, max_tokens: maxTokens });
      // Some models hand back an already-parsed object when the answer is
      // JSON; the caller expects text, so serialize it back rather than let
      // String() flatten it into "[object Object]".
      const resp = out?.response ?? '';
      const text = typeof resp === 'object' ? JSON.stringify(resp) : String(resp).trim();
      if (text) return { text, model };
    } catch (e) {
      // A model the account cannot reach is not a failure of the request —
      // try the next name before giving up on the whole lane.
      firstError ??= e;
    }
  }
  throw new Error('workers ai: ' + String(firstError?.message ?? 'empty answer').slice(0, 140));
}
