// Phrase translation with a European Portuguese guarantee.
// The whole point of this feature: Google and DeepL default to Brazilian
// Portuguese. We never do, and we flag every word where the two diverge —
// that gap is exactly what gets you blank stares in a Funchal bakery.

import { chat } from './groq.js';

// The European Portuguese guarantee, shared with the photo translator in
// vision.js so the two can never drift into different dialects.
export const PT_RULES = `Hard rules:
- Portuguese output is ALWAYS European Portuguese. Never Brazilian.
- Use pt-PT vocabulary: autocarro (not ônibus), comboio (not trem), telemóvel (not celular), casa de banho (not banheiro), pequeno-almoço (not café da manhã), perceber (not entender), se faz favor, fixe (not legal), casa de banho, rapariga (girl — harmless in Portugal).
- Use pt-PT grammar: "estou a fazer" for the progressive, never "estou fazendo". Prefer clitic placement as used in Portugal (diz-me, não me digas).
- Detect the input language and translate into the other one. If the input is neither English nor Portuguese, translate into European Portuguese.
- In br_diff list every word in YOUR Portuguese output that a Brazilian would say differently. This is the learner's main value — be thorough but only include real divergences.
- Keep register natural for the situation: a café order is not a formal letter.`;

const SYSTEM = `You translate between English and EUROPEAN Portuguese (pt-PT) as spoken in Portugal and Madeira.

${PT_RULES}

- If the INPUT contains spelling or grammar mistakes, still translate the intended meaning, but list every fix in "corrections" and give the fully corrected input in "corrected_source". This is a learning tool — never fix silently.

Answer strictly as JSON:
{
  "direction": "en->pt" or "pt->en",
  "translation": "the translation",
  "corrected_source": "the input with mistakes fixed, or empty string if the input was already correct",
  "corrections": [{"wrong": "cista", "right": "custa", "why": "verb custar — to cost"}],
  "literal": "a more word-for-word rendering, or empty string if it matches the translation",
  "register": "neutral" or "formal" or "informal",
  "br_diff": [{"pt": "autocarro", "br": "ônibus", "gloss": "bus"}],
  "note": "one short usage note if something is worth knowing, else empty string"
}`;

const MAX_LEN = 600;

export async function translate(env, text, direction) {
  const input = String(text ?? '').trim().slice(0, MAX_LEN);
  if (!input) throw new Error('empty input');

  // Direction is normally auto-detected; the site can force it.
  const forced =
    direction === 'en->pt' ? '\nThe user explicitly requests: translate INTO European Portuguese.'
    : direction === 'pt->en' ? '\nThe user explicitly requests: translate INTO English.'
    : '';

  const raw = await chat(
    env,
    [
      { role: 'system', content: SYSTEM + forced },
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
    corrected_source: out.corrected_source || '',
    corrections: Array.isArray(out.corrections) ? out.corrections.filter((c) => c?.wrong && c?.right) : [],
    literal: out.literal || '',
    register: out.register || 'neutral',
    br_diff: Array.isArray(out.br_diff) ? out.br_diff.filter((d) => d?.pt && d?.br) : [],
    note: out.note || '',
  };
}

/** Renders a translation for Telegram (Markdown), self-explanatory card. */
export function formatTranslation(t) {
  const targetIsPt = t.direction === 'en->pt';
  // Direction header makes the scenario obvious at a glance.
  let s = `${targetIsPt ? '🇬🇧 → 🇵🇹' : '🇵🇹 → 🇬🇧'}\n*${t.translation}*`;

  if (t.corrections.length) {
    s += `\n\n✏️ *Your text had a slip:*`;
    for (const c of t.corrections) {
      s += `\n• \`${c.wrong}\` → \`${c.right}\`${c.why ? ` — ${c.why}` : ''}`;
    }
    if (t.corrected_source) s += `\nCorrect version: _${t.corrected_source}_`;
  }

  if (t.literal && t.literal !== t.translation) s += `\n📐 literally: _${t.literal}_`;
  if (t.register !== 'neutral') s += `\n🗣 register: ${t.register}`;

  if (t.br_diff.length) {
    s += `\n\n⚠️ *pt-PT, not Brazilian:*`;
    for (const d of t.br_diff) {
      s += `\n• \`${d.pt}\` — in Brazil they say \`${d.br}\`${d.gloss ? ` (${d.gloss})` : ''}`;
    }
  }
  if (t.note) s += `\n\nℹ️ ${t.note}`;
  return s;
}
