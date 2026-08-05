// The conversation coach, shared by the bot and the app.
//
// The bot drives it with voice (Whisper in, TTS out); the app drives it with
// text and asks /api/tts for the audio when it wants to hear the line. Both go
// through coachTurn, so the personality, the level and the "prefer words the
// learner already knows" rule can never diverge between the two clients.

import { chat } from './groq.js';

// Each scene ships its opening line, that line in English, and two things you
// could say back. The opening turn makes no model call, so without these a
// beginner meets a Portuguese sentence, a Portuguese placeholder and no way in.
export const SCENARIOS = {
  pt: {
    cafe: {
      label: '☕ Café', open: 'Bom dia! O que deseja?',
      gloss: 'Good morning! What would you like?',
      hints: [
        { pt: 'Bom dia! Queria um café, se faz favor.', en: 'Good morning! I would like a coffee, please.' },
        { pt: 'Um galão e um pastel de nata, se faz favor.', en: 'A milky coffee and a custard tart, please.' },
      ],
    },
    autocarro: {
      label: '🚌 Autocarro', open: 'Boa tarde! Para onde vai?',
      gloss: 'Good afternoon! Where are you going?',
      hints: [
        { pt: 'Para o Funchal, se faz favor.', en: 'To Funchal, please.' },
        { pt: 'Quanto custa o bilhete?', en: 'How much is the ticket?' },
      ],
    },
    banco: {
      label: '🏦 Banco', open: 'Bom dia! Em que posso ajudar?',
      gloss: 'Good morning! How can I help?',
      hints: [
        { pt: 'Queria abrir uma conta.', en: 'I would like to open an account.' },
        { pt: 'Tenho um problema com o meu cartão.', en: 'I have a problem with my card.' },
      ],
    },
    medico: {
      label: '🩺 Médico', open: 'Boa tarde! O que o traz cá hoje?',
      gloss: 'Good afternoon! What brings you here today?',
      hints: [
        { pt: 'Dói-me a cabeça desde ontem.', en: 'My head has hurt since yesterday.' },
        { pt: 'Estou constipado e tenho febre.', en: 'I have a cold and a fever.' },
      ],
    },
    condominio: {
      label: '🏢 Vizinho', open: 'Olá, vizinho! Tudo bem?',
      gloss: 'Hello, neighbour! All good?',
      hints: [
        { pt: 'Tudo bem, obrigado. E consigo?', en: 'All good, thanks. And you?' },
        { pt: 'Mais ou menos — o elevador está avariado outra vez.', en: 'So-so — the lift is broken again.' },
      ],
    },
    farmacia: {
      label: '💊 Farmácia', open: 'Bom dia! Precisa de alguma coisa?',
      gloss: 'Good morning! Do you need something?',
      hints: [
        { pt: 'Queria alguma coisa para a garganta.', en: 'I would like something for my throat.' },
        { pt: 'Preciso de receita para isto?', en: 'Do I need a prescription for this?' },
      ],
    },
    cabeleireiro: {
      label: '💇 Cabeleireiro', open: 'Olá! Como quer o corte hoje?',
      gloss: 'Hello! How would you like your cut today?',
      hints: [
        { pt: 'Curto atrás e nos lados, se faz favor.', en: 'Short at the back and sides, please.' },
        { pt: 'Só aparar as pontas.', en: 'Just a trim.' },
      ],
    },
    sindico: {
      label: '🔧 Síndico', open: 'Bom dia. Diga-me, qual é o problema no prédio?',
      gloss: 'Good morning. Tell me, what is the problem in the building?',
      hints: [
        { pt: 'Não há água quente desde ontem.', en: 'There has been no hot water since yesterday.' },
        { pt: 'O elevador está avariado outra vez.', en: 'The lift is out of order again.' },
      ],
    },
    arrendamento: {
      label: '🏠 Arrendar casa', open: 'Boa tarde! Vem ver o apartamento?',
      gloss: 'Good afternoon! Are you here to see the flat?',
      hints: [
        { pt: 'Sim, boa tarde. Quanto é a renda?', en: 'Yes, good afternoon. How much is the rent?' },
        { pt: 'As despesas estão incluídas?', en: 'Are the bills included?' },
      ],
    },
    aima: {
      label: '🛂 AIMA', open: 'Bom dia. Tem marcação? Mostre-me os seus documentos, se faz favor.',
      gloss: 'Good morning. Do you have an appointment? Show me your documents, please.',
      hints: [
        { pt: 'Bom dia. Tenho marcação para as dez horas.', en: 'Good morning. I have an appointment at ten.' },
        { pt: 'Aqui está o meu passaporte.', en: 'Here is my passport.' },
      ],
    },
    taxi: {
      label: '🚕 Táxi', open: 'Boa tarde! Para onde?',
      gloss: 'Good afternoon! Where to?',
      hints: [
        { pt: 'Para o aeroporto, se faz favor.', en: 'To the airport, please.' },
        { pt: 'Quanto tempo demora?', en: 'How long does it take?' },
      ],
    },
    mercado: {
      label: '🥬 Mercado', open: 'Bom dia, freguês! O que vai levar hoje?',
      gloss: 'Good morning, customer! What are you taking today?',
      hints: [
        { pt: 'Queria meio quilo de tomate.', en: 'I would like half a kilo of tomatoes.' },
        { pt: 'Quanto custa o quilo?', en: 'How much is a kilo?' },
      ],
    },
    suporte: {
      label: '📞 Suporte', open: 'Boa tarde, está a falar com o apoio ao cliente. Em que posso ajudar?',
      gloss: 'Good afternoon, you are speaking to customer support. How can I help?',
      hints: [
        { pt: 'A internet não funciona desde ontem.', en: 'The internet has not worked since yesterday.' },
        { pt: 'Queria cancelar o serviço.', en: 'I would like to cancel the service.' },
      ],
    },
    vizinho_barulho: {
      label: '🔊 Barulho', open: 'Olá... desculpe, podemos falar sobre o barulho de ontem à noite?',
      gloss: 'Hello... sorry, can we talk about the noise last night?',
      hints: [
        { pt: 'Peço desculpa, tivemos uma festa.', en: 'I apologise, we had a party.' },
        { pt: 'Desculpe, não fazia ideia. Não volta a acontecer.', en: 'Sorry, I had no idea. It will not happen again.' },
      ],
    },
  },
  en: {
    work: {
      label: '💼 Work chat', open: 'Hi! Got a minute to talk about the project?',
      gloss: '',
      hints: [
        { pt: 'Sure, what is on your mind?', en: '' },
        { pt: 'Can we do it after lunch? I am in the middle of something.', en: '' },
      ],
    },
    smalltalk: {
      label: '🗣 Small talk', open: "Hey! How's your day going so far?",
      gloss: '',
      hints: [
        { pt: 'Pretty good, thanks — busy morning though.', en: '' },
        { pt: 'Not bad. How about you?', en: '' },
      ],
    },
    interview: {
      label: '📊 Interview', open: 'Thanks for coming in. Tell me a bit about yourself.',
      gloss: '',
      hints: [
        { pt: 'I am a data analyst — mostly survey and market data.', en: '' },
        { pt: 'I have been working with data for about ten years.', en: '' },
      ],
    },
    negotiation: {
      label: '🤝 Negotiation', open: "So, let's talk numbers. What did you have in mind?",
      gloss: '',
      hints: [
        { pt: 'It depends on the scope — can we go through it first?', en: '' },
        { pt: 'I was thinking somewhere in the region of...', en: '' },
      ],
    },
    present: {
      label: '📈 Present data', open: 'The floor is yours — walk us through the findings.',
      gloss: '',
      hints: [
        { pt: 'In a nutshell, sales are up and margins are down.', en: '' },
        { pt: 'Let me start with the headline number.', en: '' },
      ],
    },
    conflict: {
      label: '⚡ Team conflict', open: "Look, I have to be honest — I'm not happy with how the sprint went.",
      gloss: '',
      hints: [
        { pt: 'That is fair. What went wrong from your side?', en: '' },
        { pt: 'To be fair, we had very little time.', en: '' },
      ],
    },
    networking: {
      label: '🎪 Networking', open: "Hi there! I don't think we've met — are you enjoying the conference?",
      gloss: '',
      hints: [
        { pt: 'Yes, the morning session was excellent. What do you do?', en: '' },
        { pt: 'First time here, actually. Are you a regular?', en: '' },
      ],
    },
    client: {
      label: '☎️ Client call', open: 'Hi, thanks for taking the call. We have a few concerns about the report.',
      gloss: '',
      hints: [
        { pt: 'Of course — which part would you like to start with?', en: '' },
        { pt: 'Happy to go through it. What is the main worry?', en: '' },
      ],
    },
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

function systemPrompt(course, scen, level, known, ui) {
  const levelPrompt = LEVELS[level]?.prompt ?? LEVELS.normal.prompt;
  const words = known.join(', ') || '—';
  // The learner's helper language. The scene itself never changes: Portuguese
  // is Portuguese; only the scaffolding (gloss, note, hint translations) moves.
  const helper = ui === 'ru' ? 'Russian' : 'English';
  return course === 'pt'
    ? `You are a patient coach of EUROPEAN Portuguese (pt-PT, never Brazilian). Scene: ${scen.label}. ` +
      `${levelPrompt} Keep replies short (1–2 sentences), always end with a question. ` +
      `Prefer words the learner already knows: ${words}. ` +
      `If the learner made a mistake, put a brief correction in ${helper} in "note", else "". ` +
      `Also give "gloss": your own line translated into plain ${helper}, and "hints": two or three ` +
      `SHORT things the learner could plausibly say next, each as {"pt": "...", "en": "..."}. ` +
      `The hints must fit this exact moment in the scene, be usable verbatim, and stay at the ` +
      `learner's level — they are a way out of a blank page, not a vocabulary lesson. ` +
      `Answer strictly as JSON: {"reply": "your line in Portuguese", "gloss": "your line in ${helper}", ` +
      `"note": "correction in ${helper} or empty", "hints": [{"pt": "...", "en": "the ${helper} translation"}]}.`
    : `You are a friendly English coach (British English). Scene: ${scen.label}. Learner level B1–B2. ` +
      `${levelPrompt} Keep replies short (1–2 sentences), always end with a question. ` +
      `Prefer words the learner already knows: ${words}. ` +
      `If the learner made a mistake, put a brief correction in "note", else "". ` +
      `Also give "gloss": "" (the line is already English), and "hints": two or three SHORT ` +
      `replies the learner could give next, each as {"pt": "the reply", "en": ""}. ` +
      `Answer strictly as JSON: {"reply": "your line in English", "gloss": "", ` +
      `"note": "correction or empty", "hints": [{"pt": "...", "en": ""}]}.`;
}

/**
 * One exchange. `history` is the running transcript; the caller owns storing it.
 * Returns { reply, note, history } with the new turn already appended.
 */
export async function coachTurn(env, { userId, course, scenario, level, history, said, ui }) {
  const scen = SCENARIOS[course]?.[scenario];
  if (!scen) throw new Error('unknown scenario');

  const known = await knownWords(env, userId, course);
  const turns = [...history, { role: 'user', content: said }];

  const raw = await chat(
    env,
    [
      { role: 'system', content: systemPrompt(course, scen, level, known, ui) },
      ...turns.slice(-12),
    ],
    { json: true }
  );

  let reply, note, gloss, hints;
  try {
    ({ reply, note, gloss, hints } = JSON.parse(raw));
  } catch {
    reply = raw;
    note = '';
  }

  return {
    reply: reply ?? '',
    gloss: gloss ?? '',
    note: note ?? '',
    hints: (Array.isArray(hints) ? hints : []).filter((h) => h?.pt).slice(0, 3),
    history: [...turns, { role: 'assistant', content: reply ?? '' }].slice(-16),
  };
}

/** Scenario list for a course, in a shape a client can render directly. */
export const scenarioList = (course) =>
  Object.entries(SCENARIOS[course] ?? {}).map(([key, s]) => ({
    key,
    label: s.label,
    open: s.open,
    gloss: s.gloss ?? '',
    hints: s.hints ?? [],
  }));

/**
 * Ends a session and reads the learner's mistakes out of it.
 *
 * The recap used to be prose you read once and forgot. Returning the mistakes
 * as data lets them become cards: the thing you got wrong while actually
 * speaking is the single best candidate for review.
 */
export async function coachRecap(env, history, ui) {
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
        `- Write "summary" and every "why" in ${ui === 'ru' ? 'RUSSIAN' : 'ENGLISH'}. Only "wrong" and "right" hold Portuguese.\n` +
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
