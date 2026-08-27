// Phrase translation with a European Portuguese guarantee.
// The whole point of this feature: Google and DeepL default to Brazilian
// Portuguese. We never do, and we flag every word where the two diverge —
// that gap is exactly what gets you blank stares in a Funchal bakery.

import { chat } from './groq.js';

// The European Portuguese guarantee, shared with the photo translator in
// vision.js so the two can never drift into different dialects.
export const PT_RULES = `Hard rules:
- Portuguese output is ALWAYS European Portuguese. Never Brazilian.
- Use pt-PT vocabulary: autocarro (not ônibus), comboio (not trem), telemóvel (not celular), casa de banho (not banheiro), pequeno-almoço (not café da manhã), fixe (not legal), rapariga (girl — harmless in Portugal).
- Two pairs are NOT dialect splits, and calling them one teaches a mistake:
  * perceber vs entender — both are European Portuguese. perceber is the everyday "catch what was said"; entender is deeper, grasping the sense ("percebi, mas não quero entender"). Prefer perceber for plain understanding, never label entender as Brazilian.
  * por favor vs se faz favor — both are European Portuguese. por favor is the neutral please and the default inside a request ("pode repetir, por favor?"); se faz favor is firmer, for calling attention or urging ("a conta, se faz favor" when time is short). Defaulting to se faz favor everywhere sounds pushy.
- Use pt-PT grammar: "estou a fazer" for the progressive, never "estou fazendo". Prefer clitic placement as used in Portugal (diz-me, não me digas).
- Detect the input language and translate into the other one. If the input is in neither expected language, translate into European Portuguese.
- In br_diff list every word in YOUR Portuguese output that a Brazilian would say differently. This is the learner's main value — be thorough but only include real divergences.
- Keep register natural for the situation: a café order is not a formal letter.
- "translation" is ONLY the translated phrase. Never commentary, never advice, never two alternatives joined by a comma, never a sentence about what you would prefer to say. If several renderings are natural, put the best one in "translation" and mention the others in "note".
- Fixed social formulas translate to the formula the other language actually uses, not word for word: "how do you do?" is "tudo bem?", not a discussion of formality.
- If the INPUT is a single word or a short phrase (up to three words), fill "senses": its distinct meanings, most common first, at most four. Each sense carries a short gloss in the helper language, the part of speech, and the synonyms and antonyms OF THE TRANSLATION, in the language you are translating into — a learner uses them to say the same thing another way, so they must be words they can actually use. For anything longer than three words, "senses" is an empty list: a sentence has no dictionary entry.
- "literal" is the word-for-word rendering of the INPUT, or an empty string. It is never a fragment of your answer.`;

// The second language defaults to English; a learner who set their interface
// to another language gets the same product with that language in England's
// place. The pt-PT guarantee does not move.
const SYSTEM = (other) => `You translate between ${other.name} and EUROPEAN Portuguese (pt-PT) as spoken in Portugal and Madeira.

${PT_RULES.replaceAll('English', other.name)}

- If the INPUT contains spelling or grammar mistakes, still translate the intended meaning, but list every fix in "corrections" and give the fully corrected input in "corrected_source". This is a learning tool — never fix silently.
- "gloss" fields, "why" explanations and "note" are written in ${'${other.name}'}.

Answer strictly as JSON:
{
  "direction": "${'${other.code}'}->pt" or "pt->${'${other.code}'}",
  "translation": "the translation",
  "corrected_source": "the input with mistakes fixed, or empty string if the input was already correct",
  "corrections": [{"wrong": "cista", "right": "custa", "why": "verb custar — to cost"}],
  "literal": "a more word-for-word rendering, or empty string if it matches the translation",
  "register": "neutral" or "formal" or "informal",
  "br_diff": [{"pt": "autocarro", "br": "ônibus", "gloss": "bus"}],
  "note": "one short usage note if something is worth knowing, else empty string",
  "senses": [{"gloss": "renowned, widely admired", "pos": "adjective", "synonyms": ["famoso", "célebre"], "antonyms": ["desconhecido"]}]
}`;

const MAX_LEN = 600;

// Languages the translator speaks. Any pair works — the Lingvo-style switcher
// sends explicit directions like ru->en; 'auto' keeps the old detect-and-flip
// behaviour against Portuguese.
const LANGS = {
  pt: 'European Portuguese (pt-PT, never Brazilian)',
  en: 'English',
  ru: 'Russian',
};
const OTHER = {
  en: { code: 'en', name: 'English' },
  ru: { code: 'ru', name: 'Russian' },
};

/** System prompt for one explicit pair. The pt-PT guarantee rides along the
 *  moment Portuguese is on either side. */
const PAIR_SYSTEM = (from, to, helper) => `You translate from ${LANGS[from]} into ${LANGS[to]}.

${from === 'pt' || to === 'pt' ? PT_RULES.replaceAll('English', helper) + '\n' : ''}
- If the INPUT contains spelling or grammar mistakes, still translate the intended meaning, but list every fix in "corrections" and give the fully corrected input in "corrected_source". This is a learning tool — never fix silently.
- "gloss" fields, "why" explanations and "note" are written in ${helper}.
- "br_diff" is ${to === 'pt' ? 'the list of words a Brazilian would say differently' : 'always an empty list'}.

Answer strictly as JSON:
{
  "direction": "${from}->${to}",
  "translation": "the translation",
  "corrected_source": "the input with mistakes fixed, or empty string",
  "corrections": [{"wrong": "...", "right": "...", "why": "..."}],
  "literal": "a more word-for-word rendering, or empty string",
  "register": "neutral" or "formal" or "informal",
  "br_diff": [{"pt": "...", "br": "...", "gloss": "..."}],
  "note": "one short usage note, else empty string",
  "senses": [{"gloss": "...", "pos": "...", "synonyms": ["..."], "antonyms": ["..."]}]
}`;

/** Auto mode the way Yandex does it: "auto" describes the INPUT only, never
 *  the output. The target stays whatever the switcher shows, and the detected
 *  language comes back so the UI can say which one it heard. */
const AUTO_SYSTEM = (to, helper) => {
  // Typing in the target language is not an error — it means the user wants it
  // the other way round. Portuguese goes to the helper language, anything else
  // goes to Portuguese: this is a pt-PT product before it is a translator.
  const fallback = to === 'pt' ? (helper === 'Russian' ? 'ru' : 'en') : 'pt';
  return `You translate into ${LANGS[to]}.

First DETECT the language of the INPUT: Portuguese ("pt"), English ("en") or Russian ("ru"). Put that code in "detected" — it is the language of the input, never of your answer.
- Normally translate the input into ${LANGS[to]}, and set "direction" to "<detected>->${to}".
- If the input is ALREADY in ${LANGS[to]}, translate it into ${LANGS[fallback]} instead and set "direction" to "${to}->${fallback}".
- Judge the language by the words themselves. A single word is enough: "grift" is English, "engano" is Portuguese, "обман" is Russian.

${PT_RULES.replaceAll('English', helper).split('\n').filter((l) => !l.startsWith('- Detect the input language')).join('\n')}
- If the INPUT contains spelling or grammar mistakes, still translate the intended meaning, but list every fix in "corrections" and give the fully corrected input in "corrected_source". This is a learning tool — never fix silently.
- "gloss" fields, "why" explanations and "note" are written in ${helper}.
- "br_diff" is only ever filled when YOUR OUTPUT is Portuguese; otherwise it is an empty list.

Answer strictly as JSON:
{
  "detected": "pt" or "en" or "ru",
  "direction": "<detected>-><target>",
  "translation": "the translation",
  "corrected_source": "the input with mistakes fixed, or empty string",
  "corrections": [{"wrong": "...", "right": "...", "why": "..."}],
  "literal": "a more word-for-word rendering, or empty string",
  "register": "neutral" or "formal" or "informal",
  "br_diff": [{"pt": "...", "br": "...", "gloss": "..."}],
  "note": "one short usage note, else empty string",
  "senses": [{"gloss": "...", "pos": "...", "synonyms": ["..."], "antonyms": ["..."]}]
}`;
};

export async function translate(env, text, direction, ui) {
  const input = String(text ?? '').trim().slice(0, MAX_LEN);
  if (!input) throw new Error('empty input');

  const other = OTHER[ui] ?? OTHER.en;
  const helper = ui === 'ru' ? 'Russian' : 'English';

  // Explicit pair from the switcher: any of pt/en/ru on either side.
  const m = /^(pt|en|ru)->(pt|en|ru)$/.exec(direction ?? '');
  // "auto->ru": detect the source, keep the chosen target. The switcher sends
  // this whenever its left chip says Auto.
  const a = /^auto->(pt|en|ru)$/.exec(direction ?? '');
  let system;
  let forcedDirection = null;
  if (m && m[1] !== m[2]) {
    system = PAIR_SYSTEM(m[1], m[2], helper);
    forcedDirection = direction;
  } else if (a) {
    system = AUTO_SYSTEM(a[1], helper);
  } else {
    const forced =
      direction === `${other.code}->pt` || direction === 'en->pt'
        ? '\nThe user explicitly requests: translate INTO European Portuguese.'
      : direction === `pt->${other.code}` || direction === 'pt->en'
        ? `\nThe user explicitly requests: translate INTO ${other.name}.`
      : '';
    system = SYSTEM(other) + forced;
  }

  const raw = await chat(
    env,
    [
      { role: 'system', content: system },
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

  const dir = forcedDirection ?? out.direction ?? 'en->pt';
  return {
    source: input,
    direction: dir,
    // What the input turned out to be — the UI shows it next to "Auto".
    // The model's own field wins; the direction's left half is the fallback.
    detected: /^(pt|en|ru)$/.test(out.detected ?? '')
      ? out.detected
      : (/^(pt|en|ru)->/.exec(dir)?.[1] ?? null),
    translation: out.translation ?? '',
    corrected_source: out.corrected_source || '',
    corrections: Array.isArray(out.corrections) ? out.corrections.filter((c) => c?.wrong && c?.right) : [],
    literal: out.literal || '',
    register: out.register || 'neutral',
    br_diff: Array.isArray(out.br_diff) ? out.br_diff.filter((d) => d?.pt && d?.br) : [],
    note: out.note || '',
    // The dictionary half of the answer: what else this word means, and how
    // else to say it. Only ever filled for a word or a short phrase.
    senses: Array.isArray(out.senses)
      ? out.senses
          .filter((x) => x?.gloss)
          .slice(0, 4)
          .map((x) => ({
            gloss: String(x.gloss),
            pos: x.pos ? String(x.pos) : '',
            synonyms: Array.isArray(x.synonyms) ? x.synonyms.filter(Boolean).slice(0, 6).map(String) : [],
            antonyms: Array.isArray(x.antonyms) ? x.antonyms.filter(Boolean).slice(0, 4).map(String) : [],
          }))
      : [],
  };
}

const FLAG = { pt: '🇵🇹', en: '🇬🇧', ru: '🇷🇺' };

/** Renders a translation for Telegram (Markdown), self-explanatory card. */
export function formatTranslation(t) {
  // Read the flags off the direction itself: hardcoding en->pt drew a Union
  // Jack over Russian input the moment auto learned a third language.
  const [from, to] = String(t.direction ?? 'en->pt').split('->');
  // Direction header makes the scenario obvious at a glance.
  let s = `${FLAG[from] ?? '🏳️'} → ${FLAG[to] ?? '🏳️'}\n*${t.translation}*`;

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
