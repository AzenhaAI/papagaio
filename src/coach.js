// The conversation coach, shared by the bot and the app.
//
// The bot drives it with voice (Whisper in, TTS out); the app drives it with
// text and asks /api/tts for the audio when it wants to hear the line. Both go
// through coachTurn, so the personality, the level and the "prefer words the
// learner already knows" rule can never diverge between the two clients.

import { chat } from './groq.js';

export const SCENARIOS = {
  pt: {
    cafe:       { label: '☕ Café',        open: 'Bom dia! O que deseja?' },
    autocarro:  { label: '🚌 Autocarro',   open: 'Boa tarde! Para onde vai?' },
    banco:      { label: '🏦 Banco',       open: 'Bom dia! Em que posso ajudar?' },
    medico:     { label: '🩺 Médico',      open: 'Boa tarde! O que o traz cá hoje?' },
    condominio: { label: '🏢 Vizinho',     open: 'Olá, vizinho! Tudo bem?' },
    farmacia:   { label: '💊 Farmácia',    open: 'Bom dia! Precisa de alguma coisa?' },
    cabeleireiro: { label: '💇 Cabeleireiro', open: 'Olá! Como quer o corte hoje?' },
    sindico:    { label: '🔧 Síndico',     open: 'Bom dia. Diga-me, qual é o problema no prédio?' },
    arrendamento: { label: '🏠 Arrendar casa', open: 'Boa tarde! Vem ver o apartamento?' },
    aima:       { label: '🛂 AIMA',        open: 'Bom dia. Tem marcação? Mostre-me os seus documentos, se faz favor.' },
    taxi:       { label: '🚕 Táxi',        open: 'Boa tarde! Para onde?' },
    mercado:    { label: '🥬 Mercado',     open: 'Bom dia, freguês! O que vai levar hoje?' },
    suporte:    { label: '📞 Suporte',     open: 'Boa tarde, está a falar com o apoio ao cliente. Em que posso ajudar?' },
    vizinho_barulho: { label: '🔊 Barulho', open: 'Olá... desculpe, podemos falar sobre o barulho de ontem à noite?' },
  },
  en: {
    work:       { label: '💼 Work chat',    open: 'Hi! Got a minute to talk about the project?' },
    smalltalk:  { label: '🗣 Small talk',   open: "Hey! How's your day going so far?" },
    interview:  { label: '📊 Interview',    open: 'Thanks for coming in. Tell me a bit about yourself.' },
    negotiation:{ label: '🤝 Negotiation',  open: "So, let's talk numbers. What did you have in mind?" },
    present:    { label: '📈 Present data', open: 'The floor is yours — walk us through the findings.' },
    conflict:   { label: '⚡ Team conflict', open: "Look, I have to be honest — I'm not happy with how the sprint went." },
    networking: { label: '🎪 Networking',   open: "Hi there! I don't think we've met — are you enjoying the conference?" },
    client:     { label: '☎️ Client call',  open: 'Hi, thanks for taking the call. We have a few concerns about the report.' },
  },
};

export const LEVELS = {
  slow:   { label: '🐢 Slow & simple', prompt: 'Speak very simply, short sentences, common words only. Be patient like with a beginner.' },
  normal: { label: '🚶 Normal',        prompt: 'Speak naturally but clearly, at a measured pace.' },
  street: { label: '🏃 Street',        prompt: 'Speak like a real local: contractions, fillers, colloquialisms, natural speed. Do not simplify.' },
};

/** The 30 words this learner holds best — the coach leans on them on purpose. */
async function knownWords(env, userId, course) {
  const { results } = await env.DB.prepare(
    `SELECT c.term FROM user_cards uc JOIN cards c ON c.id = uc.card_id
     WHERE uc.user_id = ? AND c.course = ? AND uc.reps >= 1
     ORDER BY uc.stability DESC LIMIT 30`
  ).bind(userId, course).all();
  return (results ?? []).map((k) => k.term);
}

function systemPrompt(course, scen, level, known) {
  const levelPrompt = LEVELS[level]?.prompt ?? LEVELS.normal.prompt;
  const words = known.join(', ') || '—';
  return course === 'pt'
    ? `You are a patient coach of EUROPEAN Portuguese (pt-PT, never Brazilian). Scene: ${scen.label}. ` +
      `${levelPrompt} Keep replies short (1–2 sentences), always end with a question. ` +
      `Prefer words the learner already knows: ${words}. ` +
      `If the learner made a mistake, put a brief correction in English in "note", else "". ` +
      `Answer strictly as JSON: {"reply": "your line in Portuguese", "note": "correction in English or empty"}.`
    : `You are a friendly English coach (British English). Scene: ${scen.label}. Learner level B1–B2. ` +
      `${levelPrompt} Keep replies short (1–2 sentences), always end with a question. ` +
      `Prefer words the learner already knows: ${words}. ` +
      `If the learner made a mistake, put a brief correction in "note", else "". ` +
      `Answer strictly as JSON: {"reply": "your line in English", "note": "correction or empty"}.`;
}

/**
 * One exchange. `history` is the running transcript; the caller owns storing it.
 * Returns { reply, note, history } with the new turn already appended.
 */
export async function coachTurn(env, { userId, course, scenario, level, history, said }) {
  const scen = SCENARIOS[course]?.[scenario];
  if (!scen) throw new Error('unknown scenario');

  const known = await knownWords(env, userId, course);
  const turns = [...history, { role: 'user', content: said }];

  const raw = await chat(
    env,
    [
      { role: 'system', content: systemPrompt(course, scen, level, known) },
      ...turns.slice(-12),
    ],
    { json: true }
  );

  let reply;
  let note;
  try {
    ({ reply, note } = JSON.parse(raw));
  } catch {
    reply = raw;
    note = '';
  }

  return {
    reply: reply ?? '',
    note: note ?? '',
    history: [...turns, { role: 'assistant', content: reply ?? '' }].slice(-16),
  };
}

/** Scenario list for a course, in a shape a client can render directly. */
export const scenarioList = (course) =>
  Object.entries(SCENARIOS[course] ?? {}).map(([key, s]) => ({
    key,
    label: s.label,
    open: s.open,
  }));

/**
 * Ends a session and reads the learner's mistakes out of it.
 *
 * The recap used to be prose you read once and forgot. Returning the mistakes
 * as data lets them become cards: the thing you got wrong while actually
 * speaking is the single best candidate for review.
 */
export async function coachRecap(env, history) {
  const said = history.filter((m) => m.role === 'user');
  if (!said.length) return { summary: '', mistakes: [] };

  const raw = await chat(env, [
    {
      role: 'system',
      content:
        'You are a teacher of EUROPEAN Portuguese (pt-PT) reviewing a roleplay with a learner.\n' +
        'List what the LEARNER got wrong, most important first, in this priority order:\n' +
        '1. BRAZILIAN forms where European Portuguese was wanted. This matters most. ' +
        'The giveaways: "estou fazendo" instead of "estou a fazer" (the gerund progressive is ' +
        'Brazilian — pt-PT uses estar a + infinitive), pegar for apanhar, ônibus for autocarro, ' +
        'celular for telemóvel, banheiro for casa de banho, tela for ecrã, entender for perceber, ' +
        'você where tu belongs, clitics before the verb in a plain statement (me diz for diz-me).\n' +
        '2. Grammar: wrong person, wrong gender or article, ser/estar mixed up, missing "há" ' +
        'for elapsed time, wrong preposition or a missing contraction.\n' +
        '3. Word choice that a Portuguese speaker would not use.\n' +
        'HARD RULES:\n' +
        '- Your "right" version must itself be flawless European Portuguese. Never hand back a ' +
        'correction that still contains a Brazilian form — fix every problem in that line at once.\n' +
        '- Write "summary" and every "why" in ENGLISH. Only "wrong" and "right" hold Portuguese.\n' +
        '- One entry per distinct mistake. If two lines share the same error, keep the clearer ' +
        'one and drop the other; do not restate it with a longer quote.\n' +
        '- The learner types without a Portuguese keyboard, so missing accents are usually just ' +
        'that. Mention one ONLY when the accent changes the word (esta/está, e/é, avo/avô). ' +
        'Never spend a slot on cafe/café, bancaria/bancária and the like.\n' +
        '- At most 4 items, and fewer is better. If the only issues were typing shortcuts, ' +
        'return an empty list and say the conversation went well.\n' +
        'Finish with one honest, encouraging sentence about the conversation overall.\n' +
        'Answer strictly as JSON: {"summary": "one sentence", "mistakes": ' +
        '[{"wrong": "...", "right": "...", "why": "short reason"}]}',
    },
    {
      role: 'user',
      content: history.map((m) => `${m.role === 'user' ? 'Learner' : 'Coach'}: ${m.content}`).join('\n'),
    },
  ], { json: true });

  try {
    const out = JSON.parse(raw);
    return {
      summary: out.summary ?? '',
      mistakes: (Array.isArray(out.mistakes) ? out.mistakes : [])
        .filter((m) => m?.wrong && m?.right)
        .slice(0, 4),
    };
  } catch {
    return { summary: raw, mistakes: [] };
  }
}
