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
      role: "You are the person behind the counter of a Portuguese café. You take an order, say the price, hand things over. You do not ask about the customer's plans or private life. Address the customer formally (3rd person: o senhor / a senhora / você), never tu. The business is done when the order is served or paid for.",
      gloss: 'Good morning! What would you like?',
      hints: [
        { pt: 'Bom dia! Queria um café, por favor.', en: 'Good morning! I would like a coffee, please.' },
        { pt: 'Um galão e um pastel de nata, se faz favor.', en: 'A milky coffee and a custard tart, please.' },
      ],
    },
    autocarro: {
      label: '🚌 Autocarro', open: 'Boa tarde! Para onde vai?',
      role: 'You are a bus driver in Madeira. You sell or check a ticket, name the fare, say where to get off. Nothing else. Formal address. Done when the passenger has their ticket and knows the stop.',
      gloss: 'Good afternoon! Where are you going?',
      hints: [
        { pt: 'Para o Funchal, por favor.', en: 'To Funchal, please.' },
        { pt: 'Quanto custa o bilhete?', en: 'How much is the ticket?' },
      ],
    },
    banco: {
      label: '🏦 Banco', open: 'Bom dia! Em que posso ajudar?',
      role: 'You are a bank clerk. You handle one banking errand — an account, a card, a transfer, a fee. Formal address. Done when the errand is finished and the customer says they need nothing more.',
      gloss: 'Good morning! How can I help?',
      hints: [
        { pt: 'Queria abrir uma conta.', en: 'I would like to open an account.' },
        { pt: 'Tenho um problema com o meu cartão.', en: 'I have a problem with my card.' },
      ],
    },
    medico: {
      label: '🩺 Médico', open: 'Boa tarde! O que o traz cá hoje?',
      role: 'You are a GP in a Portuguese health centre. You ask what is wrong, how long, and about allergies or medication, then give a short instruction. Formal address. Done when the patient has the prescription or the advice.',
      gloss: 'Good afternoon! What brings you here today?',
      hints: [
        { pt: 'Dói-me a cabeça desde ontem.', en: 'My head has hurt since yesterday.' },
        { pt: 'Estou constipado e tenho febre.', en: 'I have a cold and a fever.' },
      ],
    },
    condominio: {
      label: '🏢 Vizinho', open: 'Olá, vizinho! Tudo bem?',
      role: 'You are a neighbour in the same building, chatting in the lobby. Small talk only: the weather, the lift, the rubbish, the works upstairs. Informal address (tu) is fine here. Done when the chat reaches a natural goodbye.',
      gloss: 'Hello, neighbour! All good?',
      hints: [
        { pt: 'Tudo bem, obrigado. E consigo?', en: 'All good, thanks. And you?' },
        { pt: 'Mais ou menos — o elevador está avariado outra vez.', en: 'So-so — the lift is broken again.' },
      ],
    },
    farmacia: {
      label: '💊 Farmácia', open: 'Bom dia! Precisa de alguma coisa?',
      role: 'You are a pharmacist. You listen to the symptom or the prescription, offer a product, say the price and the dose. Formal address. Done when the customer has what they came for.',
      gloss: 'Good morning! Do you need something?',
      hints: [
        { pt: 'Queria alguma coisa para a garganta.', en: 'I would like something for my throat.' },
        { pt: 'Preciso de receita para isto?', en: 'Do I need a prescription for this?' },
      ],
    },
    cabeleireiro: {
      label: '💇 Cabeleireiro', open: 'Olá! Como quer o corte hoje?',
      role: 'You are a hairdresser. You discuss the cut, the length, the price and the next appointment. Nothing medical, nothing bureaucratic. Done when the cut is agreed or booked.',
      gloss: 'Hello! How would you like your cut today?',
      hints: [
        { pt: 'Curto atrás e nos lados, por favor.', en: 'Short at the back and sides, please.' },
        { pt: 'Só aparar as pontas.', en: 'Just a trim.' },
      ],
    },
    sindico: {
      label: '🔧 Síndico', open: 'Bom dia. Diga-me, qual é o problema no prédio?',
      role: 'You are the building manager. You take one complaint about the building — water, lift, noise, a broken door — and say what happens next. Formal address. Done when the resident knows what will be done.',
      gloss: 'Good morning. Tell me, what is the problem in the building?',
      hints: [
        { pt: 'Não há água quente desde ontem.', en: 'There has been no hot water since yesterday.' },
        { pt: 'O elevador está avariado outra vez.', en: 'The lift is out of order again.' },
      ],
    },
    arrendamento: {
      label: '🏠 Arrendar casa', open: 'Boa tarde! Vem ver o apartamento?',
      role: 'You are a landlord showing a flat. You answer about rent, bills, deposit, contract length, and when it is free. Done when the visitor has the numbers or says they will think about it.',
      gloss: 'Good afternoon! Are you here to see the flat?',
      hints: [
        { pt: 'Sim, boa tarde. Quanto é a renda?', en: 'Yes, good afternoon. How much is the rent?' },
        { pt: 'As despesas estão incluídas?', en: 'Are the bills included?' },
      ],
    },
    aima: {
      label: '🛂 AIMA', open: 'Bom dia. Tem marcação? Mostre-me os seus documentos, por favor.',
      role: "You are a clerk at AIMA, the Portuguese immigration agency, at a booked appointment for a residence permit. You check the appointment, take the documents (passport, NIF, proof of address, contract), take fingerprints, and say when the card arrives. You are NOT a border guard: never ask the purpose of the trip, never ask whether the person wants a visa or already has a residence permit, and never ask them to 'open the passport'. Formal address. Done when the file is accepted and the receipt is handed over.",
      gloss: 'Good morning. Do you have an appointment? Show me your documents, please.',
      hints: [
        { pt: 'Bom dia. Tenho marcação para as dez horas.', en: 'Good morning. I have an appointment at ten.' },
        { pt: 'Aqui está o meu passaporte.', en: 'Here is my passport.' },
      ],
    },
    taxi: {
      label: '🚕 Táxi', open: 'Boa tarde! Para onde?',
      role: 'You are a taxi driver. You take the destination, say roughly how long and how much, and handle payment. Done at the destination or when the fare is agreed.',
      gloss: 'Good afternoon! Where to?',
      hints: [
        { pt: 'Para o aeroporto, por favor.', en: 'To the airport, please.' },
        { pt: 'Quanto tempo demora?', en: 'How long does it take?' },
      ],
    },
    mercado: {
      label: '🥬 Mercado', open: 'Bom dia, freguês! O que vai levar hoje?',
      role: 'You are a market stallholder selling fruit and vegetables. You weigh, name prices, suggest what is good today. Done when the shopping is paid for.',
      gloss: 'Good morning, customer! What are you taking today?',
      hints: [
        { pt: 'Queria meio quilo de tomate.', en: 'I would like half a kilo of tomatoes.' },
        { pt: 'Quanto custa o quilo?', en: 'How much is a kilo?' },
      ],
    },
    suporte: {
      label: '📞 Suporte', open: 'Boa tarde, está a falar com o apoio ao cliente. Em que posso ajudar?',
      role: 'You are a phone support agent for a telecoms or utility company. You identify the account, take the problem, and give one next step. Formal address. Done when the ticket is open or the fix is explained.',
      gloss: 'Good afternoon, you are speaking to customer support. How can I help?',
      hints: [
        { pt: 'A internet não funciona desde ontem.', en: 'The internet has not worked since yesterday.' },
        { pt: 'Queria cancelar o serviço.', en: 'I would like to cancel the service.' },
      ],
    },
    vizinho_barulho: {
      label: '🔊 Barulho', open: 'Olá... desculpe, podemos falar sobre o barulho de ontem à noite?',
      role: 'You are the neighbour who was making noise last night. You are a little embarrassed and reasonable. Done when the two of you have agreed something.',
      gloss: 'Hello... sorry, can we talk about the noise last night?',
      hints: [
        { pt: 'Peço desculpa, tivemos uma festa.', en: 'I apologise, we had a party.' },
        { pt: 'Desculpe, não fazia ideia. Não volta a acontecer.', en: 'Sorry, I had no idea. It will not happen again.' },
      ],
    },
    fado: {
      label: '🎶 Casa de fados', open: 'Boa noite! É a primeira vez que vem ouvir fado?',
      role: 'You are the host of a fado house. You seat the guest, explain the rule of silence during the singing, take a drinks order, say when it starts. Done when the guest is seated and served.',
      gloss: 'Good evening! Is it your first time coming to hear fado?',
      hints: [
        { pt: 'É sim, nunca ouvi fado ao vivo.', en: 'Yes, I have never heard fado live.' },
        { pt: 'Já ouvi Amália em disco, mas ao vivo é diferente.', en: 'I have heard Amália on record, but live is different.' },
        { pt: 'O que significa a palavra saudade, ao certo?', en: 'What does the word saudade mean, exactly?' },
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
  // 'pt' is the immersion mode: the scaffolding itself switches to simple
  // European Portuguese — training wheels in the target language.
  const helper = ui === 'ru' ? 'Russian' : ui === 'pt' ? 'simple European Portuguese' : 'English';
  return course === 'pt'
    ? `You are a patient coach of EUROPEAN Portuguese (pt-PT, never Brazilian). Scene: ${scen.label}. ` +
      `${scen.role ?? ''} ` +
      // "Always end with a question" is what made this thing unbearable: it
      // said "come again!" and then asked whether you wanted anything else,
      // because the prompt left it no way to stop. A scene that cannot end is
      // not a rehearsal of anything real.
      `${levelPrompt} Keep replies short (1–2 sentences). Ask a question only while ` +
      `the business of the scene is unfinished. When it is done — the order served, the ` +
      `documents accepted, the fare agreed — or when the learner signals they are ` +
      `finished ("é tudo", "obrigado, mais nada"), say a natural goodbye, ask NOTHING ` +
      `further, and set "done": true. Never reopen a transaction you have closed. ` +
      `Stay inside your role: do not ask about anything a person in this job would not ask. ` +
      `Prefer words the learner already knows: ${words}. ` +
      `If the learner made a mistake, put a brief correction in ${helper} in "note", else "". ` +
      `Also give "gloss": your own line translated into plain ${helper}, and "hints": two or three ` +
      `SHORT things the learner could plausibly say next, each as {"pt": "...", "en": "..."}. ` +
      `The hints must fit this exact moment in the scene, be usable verbatim, and stay at the ` +
      `learner's level — they are a way out of a blank page, not a vocabulary lesson. ` +
      `Answer strictly as JSON: {"reply": "your line in Portuguese", "gloss": "your line in ${helper}", ` +
      `"note": "correction in ${helper} or empty", "done": true or false, ` +
      `"hints": [{"pt": "...", "en": "the ${helper} translation"}]}. ` +
      `When "done" is true, "hints" may be an empty list — there is nothing left to say.`
    : `You are a friendly English coach (British English). Scene: ${scen.label}. Learner level B1–B2. ` +
      `${scen.role ?? ''} ${levelPrompt} Keep replies short (1–2 sentences). Ask a question ` +
      `only while the business of the scene is unfinished; when it is done, or the learner ` +
      `signals they are finished, close the conversation, ask nothing further and set "done": true. ` +
      `Prefer words the learner already knows: ${words}. ` +
      `If the learner made a mistake, put a brief correction in "note", else "". ` +
      `Also give "gloss": "" (the line is already English), and "hints": two or three SHORT ` +
      `replies the learner could give next, each as {"pt": "the reply", "en": ""}. ` +
      `Answer strictly as JSON: {"reply": "your line in English", "gloss": "", ` +
      `"note": "correction or empty", "done": true or false, "hints": [{"pt": "...", "en": ""}]}.`;
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

  let reply, note, gloss, hints, done;
  try {
    ({ reply, note, gloss, hints, done } = JSON.parse(raw));
  } catch {
    reply = raw;
    note = '';
  }

  return {
    reply: reply ?? '',
    gloss: gloss ?? '',
    note: note ?? '',
    hints: (Array.isArray(hints) ? hints : []).filter((h) => h?.pt).slice(0, 3),
    // The scene reached its natural end. Clients use this to offer the recap
    // instead of pretending there is more to say.
    done: done === true,
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
        'celular for telemóvel, banheiro for casa de banho, tela for ecrã, ' +
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
