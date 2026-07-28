// Phrase translation with a European Portuguese guarantee.
// The whole point of this feature: Google and DeepL default to Brazilian
// Portuguese. We never do, and we flag every word where the two diverge —
// that gap is exactly what gets you blank stares in a Funchal bakery.

import { chat } from './groq.js';

const SYSTEM = `You translate between English and EUROPEAN Portuguese (pt-PT) as spoken in Portugal and Madeira.

Hard rules:
- Portuguese output is ALWAYS European Portuguese. Never Brazilian.
- Use pt-PT vocabulary: autocarro (not ônibus), comboio (not trem), telemóvel (not celular), casa de banho (not banheiro), pequeno-almoço (not café da manhã), perceber (not entender), se faz favor, fixe (not legal), casa de banho, rapariga (girl — harmless in Portugal).
- Use pt-PT grammar: "estou a fazer" for the progressive, never "estou fazendo". Prefer clitic placement as used in Portugal (diz-me, não me digas).
- Detect the input language and translate into the other one. If the input is neither English nor Portuguese, translate into European Portuguese.
- In br_diff list every word in YOUR Portuguese output that a Brazilian would say differently. This is the learner's main value — be thorough but only include real divergences.
- Keep register natural for the situation: a café order is not a formal letter.

Answer strictly as JSON:
{
  "direction": "en->pt" or "pt->en",
  "translation": "the translation",
  "literal": "a more word-for-word rendering, or empty string if it matches the translation",
  "register": "neutral" or "formal" or "informal",
  "br_diff": [{"pt": "autocarro", "br": "ônibus", "gloss": "bus"}],
  "note": "one short usage note if something is worth knowing, else empty string"
}`;

const MAX_LEN = 600;

export async function translate(env, text) {
  const input = String(text ?? '').trim().slice(0, MAX_LEN);
  if (!input) throw new Error('empty input');

  const raw = await chat(
    env,
    [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: input },
    ],
    { json: true }
  );

  let out;
  try {
    out = JSON.parse(raw);
  } catch {
    // The model ignored the schema — still better than failing the request.
    out = { direction: 'en->pt', translation: raw, literal: '', register: 'neutral', br_diff: [], note: '' };
  }

  return {
    source: input,
    direction: out.direction ?? 'en->pt',
    translation: out.translation ?? '',
    literal: out.literal || '',
    register: out.register || 'neutral',
    br_diff: Array.isArray(out.br_diff) ? out.br_diff.filter((d) => d?.pt && d?.br) : [],
    note: out.note || '',
  };
}

/** Renders a translation for Telegram (Markdown). */
export function formatTranslation(t) {
  const targetIsPt = t.direction === 'en->pt';
  let s = `${targetIsPt ? '🇵🇹' : '🇬🇧'} *${t.translation}*`;

  if (t.literal && t.literal !== t.translation) s += `\n📐 _${t.literal}_`;
  if (t.register !== 'neutral') s += `\n🎩 ${t.register}`;

  if (t.br_diff.length) {
    s += '\n\n⚠️ *Not Brazilian:*';
    for (const d of t.br_diff) {
      s += `\n• \`${d.pt}\` — in Brazil \`${d.br}\`${d.gloss ? ` (${d.gloss})` : ''}`;
    }
  }
  if (t.note) s += `\n\nℹ️ ${t.note}`;
  return s;
}
