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
