// PapaGaio — Telegram bot for learning pt-PT and English. Cloudflare Worker + D1.

import { schedule } from './fsrs.js';
import { synthesize } from './tts.js';
import { transcribe, chat } from './groq.js';
import { translate, formatTranslation } from './translate.js';
import { handleApi } from './api.js';
import { SCENARIOS, LEVELS, coachTurn } from './coach.js';

const COURSES = {
  pt: { flag: '🇵🇹', name: 'Português' },
  en: { flag: '🇬🇧', name: 'English' },
};


// Units unlock in order: the next opens once the previous is ≥70% started.
const UNIT_ORDER = {
  pt: [
    { key: 'basics',     label: '👋 Basics' },
    { key: 'numeros',    label: '🔢 Numbers' },
    { key: 'verbos',     label: '⚙️ Core verbs' },
    { key: 'tempo',      label: '🕐 Time & dates' },
    { key: 'comida',     label: '🍽 Food & café' },
    { key: 'familia',    label: '👨‍👩‍👧 People' },
    { key: 'casa',       label: '🏠 Home' },
    { key: 'cidade',     label: '🏙 City' },
    { key: 'burocracia', label: '📋 Paperwork' },
    { key: 'madeira',    label: '🌴 Madeira' },
    { key: 'gramatica',  label: '📐 Grammar' },
  ],
  en: [
    { key: 'glue',     label: '🧩 Conversational glue' },
    { key: 'work',     label: '💼 Work' },
    { key: 'meetings', label: '🗓 Meetings & calls' },
    { key: 'writing',  label: '✍️ Written English' },
    { key: 'social',   label: '🗣 Small talk' },
    { key: 'data',     label: '📊 Data & analysis' },
    { key: 'money',    label: '💷 Money & admin' },
    { key: 'life',     label: '🏠 Living abroad' },
  ],
};


export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === `/tg/${env.WEBHOOK_SECRET}`) {
      const update = await request.json();
      try {
        await handleUpdate(update, env);
      } catch (e) {
        console.log('update error:', e.message);
      }
      return new Response('ok');
    }
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env, url.pathname);
    }
    return new Response('PapaGaio 🦜');
  },

  async scheduled(_event, env) {
    await tick(env);
  },
};

// ---------- Telegram ----------

async function tg(env, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

// ---------- Incoming updates ----------

async function handleUpdate(update, env) {
  if (update.callback_query) return handleCallback(update.callback_query, env);

  const msg = update.message;
  if (!msg) return;
  // A round video note is voice too — the audio track transcribes the same way.
  if (msg.video_note) {
    msg.voice = { file_id: msg.video_note.file_id, duration: msg.video_note.duration };
    return handleVoice(msg, env);
  }
  if (msg.voice) return handleVoice(msg, env);
  if (!msg.text) return;
  const text = msg.text.trim();
  const uid = msg.from.id;
  const chat = msg.chat.id;

  if (text.startsWith('/start')) {
    await env.DB.prepare(
      `INSERT INTO users (id, chat_id, name, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET chat_id = excluded.chat_id, active = 1`
    ).bind(uid, chat, msg.from.first_name ?? '', now()).run();
    await tg(env, 'setMyCommands', {
      commands: [
        { command: 'talk',   description: '🎭 Voice dialog with the AI coach' },
        { command: 'stop',   description: '🏁 End the dialog + error recap' },
        { command: 'now',    description: 'A card right now' },
        { command: 'undo',   description: '↩️ Take back the last answer' },
        { command: 'export', description: '💾 Download everything as JSON' },
        { command: 'stats',  description: '📊 Statistics' },
        { command: 'lang',   description: 'Languages: PT / EN / both' },
        { command: 'pause',  description: 'Pause' },
        { command: 'resume', description: 'Resume' },
      ],
    });
    await tg(env, 'sendMessage', {
      chat_id: chat,
      text:
        '🦜 *PapaGaio*\n\nOne card every 15 minutes during working hours (09:00–18:00). ' +
        'One tap — and back to work.\n\n' +
        'Send me any phrase and I translate it — always *European* Portuguese, ' +
        'with a warning wherever Brazilian differs. One tap adds it to your deck.\n\n' +
        'Which languages are we learning?',
      parse_mode: 'Markdown',
      reply_markup: courseKeyboard(),
    });
    return;
  }

  if (text.startsWith('/lang')) {
    await tg(env, 'sendMessage', {
      chat_id: chat, text: 'Which languages are we learning?', reply_markup: courseKeyboard(),
    });
    return;
  }

  if (text.startsWith('/now')) {
    const user = await getUser(env, uid);
    if (user) {
      const sent = await sendExercise(env, user);
      if (!sent) await tg(env, 'sendMessage', { chat_id: chat, text: 'Nothing to review right now — all done for today 🎉' });
    }
    return;
  }

  if (text.startsWith('/export')) {
    // Your review history is the one dataset here with no archive anywhere else.
    const [cards, ucards, events] = await Promise.all([
      env.DB.prepare(`SELECT * FROM cards WHERE owner IS NULL OR owner = ?`).bind(uid).all(),
      env.DB.prepare(`SELECT * FROM user_cards WHERE user_id = ?`).bind(uid).all(),
      env.DB.prepare(`SELECT * FROM events WHERE user_id = ? ORDER BY id`).bind(uid).all(),
    ]);
    const dump = JSON.stringify({
      exported_at: now(),
      user_id: uid,
      cards: cards.results,
      user_cards: ucards.results,
      events: events.results,
    }, null, 1);

    const fd = new FormData();
    fd.append('chat_id', String(chat));
    fd.append('caption',
      `💾 ${cards.results.length} cards, ${ucards.results.length} in progress, ${events.results.length} events.\n` +
      `Plain JSON — re-importable, and yours to keep.`);
    fd.append('document', new Blob([dump], { type: 'application/json' }),
      `papagaio-${now().slice(0, 10)}.json`);
    await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendDocument`, { method: 'POST', body: fd });
    return;
  }

  if (text.startsWith('/undo')) {
    // Cards arrive mid-workday; a fat-finger tap must not write a permanent
    // lapse into the history that FSRS tuning will later learn from.
    const last = await env.DB.prepare(
      `SELECT * FROM events WHERE user_id = ? AND kind = 'answer' ORDER BY id DESC LIMIT 1`
    ).bind(uid).first();
    if (!last) {
      await tg(env, 'sendMessage', { chat_id: chat, text: 'Nothing to undo yet.' });
      return;
    }
    const prev = await env.DB.prepare(
      `SELECT * FROM events WHERE user_id = ?1 AND card_id = ?2 AND kind = 'answer' AND id < ?3
       ORDER BY id DESC LIMIT 1`
    ).bind(uid, last.card_id, last.id).first();
    const card = await env.DB.prepare(`SELECT term, trans FROM cards WHERE id = ?`).bind(last.card_id).first();

    // Replay the card's history without the mistaken answer.
    const { results: history } = await env.DB.prepare(
      `SELECT rating, created_at FROM events
       WHERE user_id = ?1 AND card_id = ?2 AND kind = 'answer' AND id <> ?3 ORDER BY id`
    ).bind(uid, last.card_id, last.id).all();

    let state = null;
    for (const h of history) state = schedule(state, h.rating ?? 3, new Date(h.created_at));

    await env.DB.batch([
      env.DB.prepare(`DELETE FROM events WHERE id = ?`).bind(last.id),
      state
        ? env.DB.prepare(
            `UPDATE user_cards SET stability=?, difficulty=?, reps=?, lapses=?, state=?, due=?, last_review=?
             WHERE user_id=? AND card_id=?`
          ).bind(state.stability, state.difficulty, state.reps, state.lapses, state.state,
                 state.due, state.last_review, uid, last.card_id)
        : env.DB.prepare(`DELETE FROM user_cards WHERE user_id = ? AND card_id = ?`).bind(uid, last.card_id),
    ]);

    await tg(env, 'sendMessage', {
      chat_id: chat,
      text: `↩️ *Undone* — ${card?.term ?? last.card_id}\n\n` +
            (state
              ? `Back to where it was ${prev ? 'before that answer' : 'when introduced'}, due ${state.due.slice(0, 10)}.`
              : `The card is new again.`),
      parse_mode: 'Markdown',
    });
    return;
  }

  if (text.startsWith('/pause')) {
    await env.DB.prepare(`UPDATE users SET active = 0 WHERE id = ?`).bind(uid).run();
    await tg(env, 'sendMessage', { chat_id: chat, text: 'Paused. Come back with /resume.' });
    return;
  }

  if (text.startsWith('/resume')) {
    await env.DB.prepare(
      `UPDATE users SET active = 1, paused_until = NULL, miss_streak = 0 WHERE id = ?`
    ).bind(uid).run();
    await tg(env, 'sendMessage', { chat_id: chat, text: 'Back on track 🦜' });
    return;
  }

  if (text.startsWith('/talk')) {
    if (!env.GROQ_API_KEY) {
      await tg(env, 'sendMessage', { chat_id: chat, text: 'The voice coach is not connected yet: GROQ_API_KEY is missing.' });
      return;
    }
    const active = await env.DB.prepare(`SELECT * FROM dialog WHERE user_id = ?`).bind(uid).first();
    if (active) {
      await tg(env, 'sendMessage', { chat_id: chat, text: 'A dialog is already running — reply with a voice message. End it with /stop.' });
      return;
    }
    const user = await getUser(env, uid);
    const rows = [];
    for (const c of (user?.courses ?? 'pt').split(',').filter((c) => SCENARIOS[c])) {
      const buttons = Object.entries(SCENARIOS[c]).map(([key, s]) => ({
        text: `${COURSES[c].flag} ${s.label}`, callback_data: `t:${c}:${key}`,
      }));
      for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
    }
    await tg(env, 'sendMessage', {
      chat_id: chat, text: '🎭 Pick a scene — then we talk in voice messages:',
      reply_markup: { inline_keyboard: rows },
    });
    return;
  }

  if (text.startsWith('/stop')) {
    const session = await env.DB.prepare(`SELECT * FROM dialog WHERE user_id = ?`).bind(uid).first();
    if (!session) {
      await tg(env, 'sendMessage', { chat_id: chat, text: 'No active dialog. Start one with /talk.' });
      return;
    }
    await env.DB.prepare(`DELETE FROM dialog WHERE user_id = ?`).bind(uid).run();
    const history = JSON.parse(session.messages);
    if (history.filter((m) => m.role === 'user').length === 0) {
      await tg(env, 'sendMessage', { chat_id: chat, text: 'Dialog closed.' });
      return;
    }
    try {
      const summary = await chat(env, [
        {
          role: 'system',
          content:
            'You are a language teacher. Below is a dialog with a learner. Give a short recap in English: ' +
            'the 2–4 main mistakes the learner made and better phrasings. If there were no mistakes, praise in one line. No fluff.',
        },
        { role: 'user', content: history.map((m) => `${m.role === 'user' ? 'Learner' : 'Coach'}: ${m.content}`).join('\n') },
      ]);
      await tg(env, 'sendMessage', { chat_id: chat, text: '🏁 Recap:\n\n' + summary });
    } catch (e) {
      await tg(env, 'sendMessage', { chat_id: chat, text: 'Dialog closed (recap failed: ' + e.message.slice(0, 80) + ')' });
    }
    return;
  }

  if (text.startsWith('/link')) {
    // Pairing code for the mobile app: same D1, same progress.
    const token = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO devices (token, user_id, label, created_at) VALUES (?, ?, 'mobile', ?)`
    ).bind(token, uid, now()).run();
    await tg(env, 'sendMessage', {
      chat_id: chat,
      text: `📱 *Pair your app*\n\nPaste this into PapaGaio mobile:\n\n\`${token}\`\n\n` +
            `_Your progress stays in sync: start a card on the phone, finish it here._\n` +
            `Anyone with this code can read your deck — keep it to yourself.`,
      parse_mode: 'Markdown',
    });
    return;
  }

  if (text.startsWith('/stats')) {
    const s = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM user_cards WHERE user_id = ?1 AND reps > 0) AS learned,
         (SELECT COUNT(*) FROM user_cards WHERE user_id = ?1 AND due <= ?2) AS due_now,
         (SELECT COUNT(*) FROM events WHERE user_id = ?1 AND kind = 'answer' AND date(created_at) = date('now')) AS today,
         (SELECT COUNT(*) FROM events WHERE user_id = ?1 AND kind = 'answer' AND correct = 1 AND date(created_at) = date('now')) AS today_ok`
    ).bind(uid, now()).first();
    const acc = s.today ? Math.round((100 * s.today_ok) / s.today) : 0;
    // Unit progress bars per active course.
    const user = await getUser(env, uid);
    let units = '';
    for (const c of (user?.courses ?? 'pt').split(',').filter((c) => COURSES[c])) {
      const stats = await unitStats(env, uid, c);
      if (!stats.length) continue;
      units += `\n\n${COURSES[c].flag}`;
      let locked = false;
      for (let i = 0; i < stats.length; i++) {
        if (i > 0 && stats[i - 1].started / stats[i - 1].total < 0.7) locked = true;
        const filled = Math.round((8 * stats[i].started) / stats[i].total);
        units += `\n${locked ? '🔒' : ''}${stats[i].label} ${'▰'.repeat(filled)}${'▱'.repeat(8 - filled)} ${stats[i].started}/${stats[i].total}`;
      }
    }
    await tg(env, 'sendMessage', {
      chat_id: chat,
      text: `📊 In progress: ${s.learned}\nDue now: ${s.due_now}\nAnswered today: ${s.today} (${acc}% correct)${units}`,
    });
    return;
  }

  if (text.startsWith('/')) return; // unknown command — stay quiet

  // A card waiting for a typed answer claims the message before the translator does.
  const typing = await env.DB.prepare(`SELECT * FROM pending WHERE user_id = ?`).bind(uid).first();
  if (['type', 'dictation', 'cloze', 'drill'].includes(typing?.exercise)) {
    return checkTyped(env, msg, typing);
  }

  // Anything else is a translation request. This is the point of the product:
  // a translator that never slips into Brazilian, wired straight into the deck.
  await handleTranslation(env, uid, chat, text);
}

async function handleTranslation(env, uid, chatId, text) {
  if (!env.GROQ_API_KEY) {
    await tg(env, 'sendMessage', { chat_id: chatId, text: 'The translator needs GROQ_API_KEY to be set.' });
    return;
  }
  await tg(env, 'sendChatAction', { chat_id: chatId, action: 'typing' });

  let t;
  try {
    t = await translate(env, text);
  } catch (e) {
    await tg(env, 'sendMessage', { chat_id: chatId, text: 'Translation failed: ' + e.message.slice(0, 120) });
    return;
  }

  // The learner's target is always the non-English side.
  const term = t.direction === 'en->pt' ? t.translation : t.source;
  const trans = t.direction === 'en->pt' ? t.source : t.translation;

  await env.DB.prepare(
    `INSERT INTO tr_last (user_id, course, term, trans, note, created_at) VALUES (?, 'pt', ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET term = excluded.term, trans = excluded.trans,
       note = excluded.note, created_at = excluded.created_at`
  ).bind(uid, term, trans, t.note ?? '', now()).run();

  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: formatTranslation(t),
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '➕ Add to deck', callback_data: 'add' }, { text: '🔊 Listen', callback_data: 'say' }]] },
  });
}

function courseKeyboard() {
  return {
    inline_keyboard: [[
      { text: '🇵🇹 Português', callback_data: 'c:pt' },
      { text: '🇬🇧 English', callback_data: 'c:en' },
      { text: '🦜 Both', callback_data: 'c:pt,en' },
    ]],
  };
}

// ---------- Voice messages ----------

async function handleVoice(msg, env) {
  const uid = msg.from.id;
  const chatId = msg.chat.id;
  if (!env.GROQ_API_KEY) {
    await tg(env, 'sendMessage', { chat_id: chatId, text: 'Speech recognition is not connected yet: GROQ_API_KEY is missing.' });
    return;
  }
  if ((msg.voice.duration ?? 0) > 60) {
    await tg(env, 'sendMessage', { chat_id: chatId, text: 'Too long — up to 60 seconds, se faz favor 🦜' });
    return;
  }

  const session = await env.DB.prepare(`SELECT * FROM dialog WHERE user_id = ?`).bind(uid).first();
  if (session) return dialogTurn(env, msg, session);

  const pending = await env.DB.prepare(`SELECT * FROM pending WHERE user_id = ?`).bind(uid).first();
  if (pending?.exercise === 'voice') return pronunciationCheck(env, msg, pending);

  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: 'I listen to voice messages in a dialog (/talk) or when I ask you to pronounce a word.',
  });
}

async function pronunciationCheck(env, msg, pending) {
  const uid = msg.from.id;
  const card = await env.DB.prepare(`SELECT * FROM cards WHERE id = ?`).bind(pending.card_id).first();
  const bytes = await tgFile(env, msg.voice.file_id);
  const heard = await transcribe(env, bytes, card.course);

  const norm = (s) => s.toLowerCase().replace(/[.,!?;:¿¡"'«»…-]/g, ' ').replace(/\s+/g, ' ').trim();
  const ok = norm(heard) === norm(card.term) || norm(heard).includes(norm(card.term));
  const grade = ok ? 3 : 1;

  const uc = await env.DB.prepare(`SELECT * FROM user_cards WHERE user_id = ? AND card_id = ?`).bind(uid, card.id).first();
  const ns = schedule(uc, grade);
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE user_cards SET stability=?, difficulty=?, reps=?, lapses=?, state=?, due=?, last_review=? WHERE user_id=? AND card_id=?`
    ).bind(ns.stability, ns.difficulty, ns.reps, ns.lapses, ns.state, ns.due, ns.last_review, uid, card.id),
    env.DB.prepare(
      `INSERT INTO events (user_id, card_id, kind, exercise, rating, correct, created_at) VALUES (?, ?, 'answer', 'voice', ?, ?, ?)`
    ).bind(uid, card.id, grade, ok ? 1 : 0, now()),
    env.DB.prepare(`DELETE FROM pending WHERE user_id = ?`).bind(uid),
    env.DB.prepare(`UPDATE users SET miss_streak = 0 WHERE id = ?`).bind(uid),
  ]);

  const text = ok
    ? `✅ Clean! I heard: "${heard}"`
    : `🤏 I heard: "${heard}"\nTarget: *${card.term}*\nThe word comes back today — let's try again.`;
  await tg(env, 'sendMessage', { chat_id: msg.chat.id, text, parse_mode: 'Markdown' });
}

async function dialogTurn(env, msg, session) {
  const chatId = msg.chat.id;
  const course = session.course;
  const bytes = await tgFile(env, msg.voice.file_id);
  const heard = await transcribe(env, bytes, course);
  if (!heard) {
    await tg(env, 'sendMessage', { chat_id: chatId, text: "Didn't catch that — say it again?" });
    return;
  }

  const { reply, note, history } = await coachTurn(env, {
    userId: session.user_id,
    course,
    scenario: session.scenario,
    level: session.level,
    history: JSON.parse(session.messages),
    said: heard,
  });

  await env.DB.batch([
    env.DB.prepare(`UPDATE dialog SET messages = ? WHERE user_id = ?`)
      .bind(JSON.stringify(history), session.user_id),
    env.DB.prepare(`INSERT INTO events (user_id, kind, exercise, created_at) VALUES (?, 'voice', 'talk', ?)`)
      .bind(session.user_id, now()),
  ]);

  let caption = `🗣 ${reply}`;
  if (note) caption += `\n\n✏️ ${note}`;
  try {
    const audio = await synthesize(reply, course);
    await tgVoice(env, chatId, audio, caption);
  } catch (e) {
    console.log('tts fallback:', e.message);
    await tg(env, 'sendMessage', { chat_id: chatId, text: caption });
  }
}

// ---------- Button answers ----------

async function handleCallback(cb, env) {
  const uid = cb.from.id;
  const data = cb.data ?? '';

  if (data.startsWith('c:')) {
    const courses = data.slice(2);
    await env.DB.prepare(`UPDATE users SET courses = ? WHERE id = ?`).bind(courses, uid).run();
    const names = courses.split(',').map((c) => COURSES[c].flag + ' ' + COURSES[c].name).join(' + ');
    await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id });
    await tg(env, 'editMessageText', {
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      text: `Learning: ${names}.\nThe first card arrives at the next slot, or hit /now.`,
    });
    return;
  }

  // Scenario picked → offer difficulty levels.
  if (data.startsWith('t:')) {
    const [, course, key] = data.split(':');
    const scen = SCENARIOS[course]?.[key];
    if (!scen) return;
    await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id });
    await tg(env, 'editMessageText', {
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      text: `🎭 ${COURSES[course].flag} ${scen.label}\nHow should the coach speak?`,
      reply_markup: {
        inline_keyboard: Object.entries(LEVELS).map(([lk, l]) => [
          { text: l.label, callback_data: `l:${course}:${key}:${lk}` },
        ]),
      },
    });
    return;
  }

  // Level picked → start the dialog.
  if (data.startsWith('l:')) {
    const [, course, key, level] = data.split(':');
    const scen = SCENARIOS[course]?.[key];
    if (!scen || !LEVELS[level]) return;
    await env.DB.prepare(
      `INSERT INTO dialog (user_id, course, scenario, level, messages, started_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET course = excluded.course, scenario = excluded.scenario,
         level = excluded.level, messages = excluded.messages, started_at = excluded.started_at`
    ).bind(uid, course, key, level, JSON.stringify([{ role: 'assistant', content: scen.open }]), now()).run();
    await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id });
    await tg(env, 'editMessageText', {
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      text: `🎭 ${COURSES[course].flag} ${scen.label} · ${LEVELS[level].label}\nReply with voice messages. End + get a recap: /stop`,
    });
    try {
      const audio = await synthesize(scen.open, course);
      await tgVoice(env, cb.message.chat.id, audio, `🗣 ${scen.open}`);
    } catch {
      await tg(env, 'sendMessage', { chat_id: cb.message.chat.id, text: `🗣 ${scen.open}` });
    }
    return;
  }

  // Full dictionary entry under a card.
  if (data.startsWith('d:')) {
    const card = await env.DB.prepare(`SELECT * FROM cards WHERE id = ?`).bind(data.slice(2)).first();
    await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id });
    if (card?.entry) {
      await tg(env, 'sendMessage', {
        chat_id: cb.message.chat.id,
        text: formatEntry(card, JSON.parse(card.entry)),
        parse_mode: 'Markdown',
      });
    }
    return;
  }

  if (data === 'add' || data === 'say') {
    const last = await env.DB.prepare(`SELECT * FROM tr_last WHERE user_id = ?`).bind(uid).first();
    if (!last) {
      await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Nothing to add' });
      return;
    }
    if (data === 'say') {
      await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id });
      try {
        const audio = await synthesize(last.term, last.course);
        await tgVoice(env, cb.message.chat.id, audio, `🔊 ${last.term}`);
      } catch (e) {
        await tg(env, 'sendMessage', { chat_id: cb.message.chat.id, text: 'Audio failed: ' + e.message.slice(0, 80) });
      }
      return;
    }
    // User cards live in the same table, tagged with owner so they stay private
    // and sort after the frequency deck.
    const id = `u${uid.toString(36)}-${Date.now().toString(36)}`;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO cards (id, course, term, trans, note, tags, freq, owner)
         VALUES (?, ?, ?, ?, ?, '["mine"]', 100000, ?)`
      ).bind(id, last.course, last.term, last.trans, last.note ?? '', uid),
      env.DB.prepare(
        `INSERT INTO user_cards (user_id, card_id, due) VALUES (?, ?, ?)`
      ).bind(uid, id, now()),
      env.DB.prepare(
        `INSERT INTO events (user_id, card_id, kind, created_at) VALUES (?, ?, 'add', ?)`
      ).bind(uid, id, now()),
    ]);
    await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: '➕ Added — it will come back as a card' });
    return;
  }

  if (!data.startsWith('a:')) return;
  const chosen = parseInt(data.slice(2), 10);

  const pending = await env.DB.prepare(`SELECT * FROM pending WHERE user_id = ?`).bind(uid).first();
  if (!pending || pending.message_id !== cb.message.message_id) {
    await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'This card is no longer active' });
    return;
  }

  const card = await env.DB.prepare(`SELECT * FROM cards WHERE id = ?`).bind(pending.card_id).first();
  const correct = chosen === pending.correct_idx;
  const grade = correct ? 3 : 1;
  const latency = Date.now() - new Date(pending.sent_at).getTime();

  const uc = await env.DB.prepare(
    `SELECT * FROM user_cards WHERE user_id = ? AND card_id = ?`
  ).bind(uid, card.id).first();
  const ns = schedule(uc, grade);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO user_cards (user_id, card_id, stability, difficulty, reps, lapses, state, due, last_review)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, card_id) DO UPDATE SET
         stability = excluded.stability, difficulty = excluded.difficulty,
         reps = excluded.reps, lapses = excluded.lapses, state = excluded.state,
         due = excluded.due, last_review = excluded.last_review`
    ).bind(uid, card.id, ns.stability, ns.difficulty, ns.reps, ns.lapses, ns.state, ns.due, ns.last_review),
    env.DB.prepare(
      `INSERT INTO events (user_id, card_id, kind, exercise, rating, correct, latency_ms, created_at)
       VALUES (?, ?, 'answer', ?, ?, ?, ?, ?)`
    ).bind(uid, card.id, pending.exercise, grade, correct ? 1 : 0, latency, now()),
    env.DB.prepare(`DELETE FROM pending WHERE user_id = ?`).bind(uid),
    env.DB.prepare(`UPDATE users SET miss_streak = 0 WHERE id = ?`).bind(uid),
  ]);

  await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: correct ? '✅' : '❌' });

  const flag = COURSES[card.course].flag;
  // Say plainly whether they were right, then the answer — not just a mark.
  let result = correct
    ? `✅ *Correct*\n\n${flag} *${card.term}* — ${card.trans}`
    : `❌ *Not quite. The answer is:*\n\n${flag} *${card.term}* — ${card.trans}`;
  if (card.ex_t) result += `\n\n💬 _${card.ex_t}_`;
  if (card.note) result += `\nℹ️ ${card.note}`;
  if (!correct) result += `\n\n_You'll see this one again soon._`;

  const editMethod = pending.exercise === 'audio' ? 'editMessageCaption' : 'editMessageText';
  const textField = pending.exercise === 'audio' ? 'caption' : 'text';
  await tg(env, editMethod, {
    chat_id: cb.message.chat.id,
    message_id: cb.message.message_id,
    [textField]: result,
    parse_mode: 'Markdown',
    // Rich dictionary entry available → offer it.
    ...(card.entry ? { reply_markup: { inline_keyboard: [[{ text: '📖 More', callback_data: `d:${card.id}` }]] } } : {}),
  });
}

const PERSONS = ['eu', 'tu', 'ele/ela', 'nós', 'eles/elas'];
const TENSES = { presente: 'Presente', pps: 'Pretérito perfeito', imperfeito: 'Imperfeito' };

/** Renders a dictionary entry as a Telegram message. */
function formatEntry(card, e) {
  let s = `📖 *${card.term}*${card.gender ? ` (${card.gender})` : ''}\n`;

  if (e.meanings?.length) {
    s += '\n' + e.meanings.map((m, i) =>
      `${i + 1}. ${m.trans}${m.note ? ` — _${m.note}_` : ''}`).join('\n');
  }
  if (e.conj) {
    for (const [tense, name] of Object.entries(TENSES)) {
      if (!e.conj[tense]) continue;
      s += `\n\n*${name}*`;
      e.conj[tense].forEach((f, i) => { s += `\n${PERSONS[i]} — \`${f}\``; });
    }
  }
  if (e.collocations?.length) {
    s += '\n\n*Collocations*';
    for (const c of e.collocations) s += `\n• \`${c.t}\` — ${c.trans}`;
  }
  if (e.synonyms?.length) s += `\n\n≈ ${e.synonyms.join(', ')}`;
  if (e.grammar) s += `\n\nℹ️ ${e.grammar}`;
  if (e.lit?.length) {
    s += '\n';
    for (const l of e.lit) s += `\n💬 _${l.text}_\n   — ${l.src}`;
  }
  return s.slice(0, 4000);
}

// ---------- Cron ----------

async function tick(env) {
  const nowDate = new Date();
  // chat_id < 0 marks an app-only account created through POST /api/device —
  // there is no Telegram chat to push into, and the app schedules its own
  // reminders on the phone anyway.
  const { results: users } = await env.DB.prepare(
    `SELECT * FROM users WHERE active = 1 AND chat_id > 0`
  ).all();

  for (const user of users ?? []) {
    if (user.paused_until && new Date(user.paused_until) > nowDate) continue;

    const hour = localHour(user.tz, nowDate);
    if (hour < user.hour_start || hour >= user.hour_end) continue;

    if (user.last_push_at &&
        nowDate - new Date(user.last_push_at) < user.interval_min * 60000) continue;

    // The previous card was ignored.
    const pending = await env.DB.prepare(`SELECT * FROM pending WHERE user_id = ?`).bind(user.id).first();
    if (pending) {
      const miss = user.miss_streak + 1;
      if (miss >= 3) {
        // Go quiet until tomorrow's window — no shaming.
        const hoursToStart = ((24 - hour + user.hour_start) % 24) || 24;
        const until = new Date(nowDate.getTime() + hoursToStart * 3600000).toISOString();
        await env.DB.batch([
          env.DB.prepare(`UPDATE users SET miss_streak = 0, paused_until = ? WHERE id = ?`).bind(until, user.id),
          env.DB.prepare(`DELETE FROM pending WHERE user_id = ?`).bind(user.id),
          env.DB.prepare(`INSERT INTO events (user_id, kind, created_at) VALUES (?, 'miss', ?)`).bind(user.id, now()),
        ]);
        await tg(env, 'sendMessage', {
          chat_id: user.chat_id,
          text: "Looks like now isn't the time for cards — going quiet until tomorrow. Bring me back sooner: /now 🦜",
        });
        continue;
      }
      await env.DB.prepare(`UPDATE users SET miss_streak = ? WHERE id = ?`).bind(miss, user.id).run();
    }

    await sendExercise(env, user);
  }
}

// ---------- Exercises ----------

async function sendExercise(env, user) {
  const course = pickCourse(user);

  // Due reviews come first.
  let card = await env.DB.prepare(
    `SELECT c.*, uc.reps AS learner_reps FROM user_cards uc JOIN cards c ON c.id = uc.card_id
     WHERE uc.user_id = ? AND uc.due <= ? AND c.course = ?
     ORDER BY uc.due LIMIT 1`
  ).bind(user.id, now(), course).first();

  let isNew = false;
  if (!card) {
    const intro = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM events e JOIN cards c ON c.id = e.card_id
       WHERE e.user_id = ? AND e.kind = 'intro' AND c.course = ? AND date(e.created_at) = date('now')`
    ).bind(user.id, course).first();
    if (intro.n >= user.new_per_day) return false;

    card = await pickNewCard(env, user, course);
    isNew = true;
  }
  if (!card) return false;

  // Exercise type. Difficulty is graduated by how well the card is known:
  // recognition first, production only once the word has stuck a couple of times.
  let exercise;
  const cloze = clozeFrom(card);
  if (card.pos === 'drill') {
    // A grammar drill is a production exercise by definition — picking the right
    // contraction out of four teaches nothing about producing it.
    exercise = 'drill';
  } else if (isNew) {
    exercise = 't_ru';
  } else {
    const reps = card.learner_reps ?? 0;
    const pool = ['t_ru', 'ru_t'];
    if (cloze) pool.push('cloze');
    if (card.audio) pool.push('audio');
    if (reps >= 2) pool.push('type');
    if (reps >= 2 && card.ex_t) pool.push('dictation');
    if (env.GROQ_API_KEY && reps >= 3) pool.push('voice');
    exercise = pool[Math.floor(Math.random() * pool.length)];
  }

  // A new card supersedes the previous one — kill its buttons so the chat
  // never shows two live cards at once.
  await expirePending(env, user);

  // Pronunciation: no answer options, we wait for a voice message.
  if (exercise === 'voice') {
    const sent = await tg(env, 'sendMessage', {
      chat_id: user.chat_id,
      text: `🎤 *Say it out loud*\n\n${COURSES[card.course].flag} *${card.term}* — ${card.trans}\n\n` +
            `_Hold the 🎤 button at the bottom right and say the word. I'll tell you what I heard._`,
      parse_mode: 'Markdown',
    });
    if (!sent?.ok) return false;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO pending (user_id, card_id, exercise, correct_idx, message_id, sent_at)
         VALUES (?, ?, 'voice', NULL, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET card_id = excluded.card_id, exercise = excluded.exercise,
           correct_idx = NULL, message_id = excluded.message_id, sent_at = excluded.sent_at`
      ).bind(user.id, card.id, sent.result.message_id, now()),
      env.DB.prepare(`UPDATE users SET last_push_at = ? WHERE id = ?`).bind(now(), user.id),
      env.DB.prepare(
        `INSERT INTO events (user_id, card_id, kind, exercise, created_at) VALUES (?, ?, 'push', 'voice', ?)`
      ).bind(user.id, card.id, now()),
    ]);
    return true;
  }

  // Typed production: no options, we wait for text. Dictation hears a whole
  // sentence — connected speech is the thing single words never teach.
  if (exercise === 'type' || exercise === 'dictation' || exercise === 'cloze' || exercise === 'drill') {
    let sent;
    if (exercise === 'drill') {
      const hint = card.trans === 'ser or estar?'
        ? '_ser or estar?_'
        : `_${card.trans}_`;
      sent = await tg(env, 'sendMessage', {
        chat_id: user.chat_id,
        text: `📐 *Grammar*\n\n🇵🇹 ${card.ex_t}\n\n${hint}\n\n_Type the missing form._`,
        parse_mode: 'Markdown',
      });
    } else if (exercise === 'cloze') {
      sent = await tg(env, 'sendMessage', {
        chat_id: user.chat_id,
        text: `🧩 *Fill the gap*\n\n${COURSES[card.course].flag} ${cloze.sentence}\n\n` +
              (card.ex_trans ? `_${card.ex_trans}_\n\n` : '') +
              `_Type the missing word. Accents optional._`,
        parse_mode: 'Markdown',
      });
    } else if (exercise === 'dictation') {
      try {
        const audio = await synthesize(card.ex_t, card.course);
        sent = await tgVoice(env, user.chat_id, audio,
          `✍️ Dictation — type what you hear. Accents optional, spelling counts.`);
      } catch {
        return false; // no audio, no dictation
      }
    } else {
      sent = await tg(env, 'sendMessage', {
        chat_id: user.chat_id,
        text: `⌨️ *Write it in ${COURSES[card.course].name}*\n\n💬 ${card.trans}\n\n` +
              `_Type your answer as a message. Accents optional._`,
        parse_mode: 'Markdown',
      });
    }
    if (!sent?.ok) return false;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO pending (user_id, card_id, exercise, correct_idx, message_id, sent_at)
         VALUES (?, ?, ?, NULL, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET card_id = excluded.card_id, exercise = excluded.exercise,
           correct_idx = NULL, message_id = excluded.message_id, sent_at = excluded.sent_at`
      ).bind(user.id, card.id, exercise, sent.result.message_id, now()),
      env.DB.prepare(`UPDATE users SET last_push_at = ? WHERE id = ?`).bind(now(), user.id),
      env.DB.prepare(
        `INSERT INTO events (user_id, card_id, kind, exercise, created_at) VALUES (?, ?, 'push', ?, ?)`
      ).bind(user.id, card.id, exercise, now()),
    ]);
    return true;
  }

  // Options are translations, except when the answer is the term itself.
  const askTrans = exercise === 't_ru' || exercise === 'audio';
  const { results: distractors } = await env.DB.prepare(
    `SELECT ${askTrans ? 'trans' : 'term'} AS v FROM cards
     WHERE course = ? AND id != ? AND owner IS NULL AND pos IS NOT 'drill'
     ORDER BY RANDOM() LIMIT 3`
  ).bind(course, card.id).all();

  const options = distractors.map((d) => d.v);
  const correctIdx = Math.floor(Math.random() * 4);
  options.splice(correctIdx, 0, askTrans ? card.trans : card.term);

  const keyboard = {
    inline_keyboard: options.map((o, i) => [{ text: o, callback_data: `a:${i}` }]),
  };

  const flag = COURSES[card.course].flag;
  const lang = COURSES[card.course].name;
  let sent;
  if (exercise === 'audio') {
    sent = await tg(env, 'sendVoice', {
      chat_id: user.chat_id,
      voice: env.AUDIO_BASE + card.audio,
      caption: `🔊 *Listen* — which word is it?\n_Tap the ${lang} word you heard._`,
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  } else {
    // Every card says what to do — a bare word with four buttons is a riddle.
    const question = exercise === 't_ru'
        ? (isNew
            ? `🆕 *New word*\n\n${flag} *${card.term}*\n\n_What does it mean? Tap your guess — the answer follows._`
            : `${flag} *${card.term}*\n\n_What does it mean?_`)
        : `💬 *${card.trans}*\n\n_How do you say it in ${lang}?_`;
    sent = await tg(env, 'sendMessage', {
      chat_id: user.chat_id,
      text: question,
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  }
  if (!sent?.ok) return false;

  const batch = [
    env.DB.prepare(
      `INSERT INTO pending (user_id, card_id, exercise, correct_idx, message_id, sent_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         card_id = excluded.card_id, exercise = excluded.exercise,
         correct_idx = excluded.correct_idx, message_id = excluded.message_id,
         sent_at = excluded.sent_at`
    ).bind(user.id, card.id, exercise, correctIdx, sent.result.message_id, now()),
    env.DB.prepare(`UPDATE users SET last_push_at = ? WHERE id = ?`).bind(now(), user.id),
    env.DB.prepare(
      `INSERT INTO events (user_id, card_id, kind, exercise, created_at) VALUES (?, ?, 'push', ?, ?)`
    ).bind(user.id, card.id, exercise, now()),
  ];
  if (isNew) {
    batch.push(
      env.DB.prepare(
        `INSERT INTO events (user_id, card_id, kind, created_at) VALUES (?, ?, 'intro', ?)`
      ).bind(user.id, card.id, now())
    );
  }
  await env.DB.batch(batch);
  return true;
}

// ---------- Typed answers ----------

const ARTICLES = ['o ', 'a ', 'os ', 'as ', 'um ', 'uma ', 'the ', 'to '];

/** Punctuation and case out; accents kept. */
const norm = (s) =>
  String(s ?? '').toLowerCase().replace(/[.,!?;:¿¡"'«»…()\-]/g, ' ').replace(/\s+/g, ' ').trim();

/** Same, with diacritics folded away — for "right word, wrong accent". */
const bare = (s) => norm(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function levenshtein(a, b) {
  const m = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      m[i][j] = b[i - 1] === a[j - 1]
        ? m[i - 1][j - 1]
        : 1 + Math.min(m[i - 1][j - 1], m[i][j - 1], m[i - 1][j]);
    }
  }
  return m[b.length][a.length];
}

/**
 * Builds a fill-the-gap prompt from the card's example sentence.
 * Returns null when the term does not literally appear in it — a wrong gap
 * teaches nothing, so we simply skip cloze for that card.
 */
function clozeFrom(card) {
  if (!card.ex_t || !card.term) return null;
  const candidates = [card.term];
  for (const art of ARTICLES) {
    if (card.term.toLowerCase().startsWith(art)) candidates.push(card.term.slice(art.length));
  }
  for (const cand of candidates) {
    if (cand.length < 2) continue;
    const idx = card.ex_t.toLowerCase().indexOf(cand.toLowerCase());
    if (idx === -1) continue;
    const found = card.ex_t.slice(idx, idx + cand.length);
    return {
      sentence: card.ex_t.slice(0, idx) + '_'.repeat(Math.max(found.length, 4)) + card.ex_t.slice(idx + cand.length),
      answer: found,
    };
  }
  return null;
}

/** Grades a typed answer for the 'type' and 'dictation' exercises. */
async function checkTyped(env, msg, pending) {
  const uid = msg.from.id;
  const card = await env.DB.prepare(`SELECT * FROM cards WHERE id = ?`).bind(pending.card_id).first();
  if (!card) return;
  const expected =
    pending.exercise === 'dictation' ? card.ex_t
    : pending.exercise === 'cloze' ? (clozeFrom(card)?.answer ?? card.term)
    : card.term; // 'type' and 'drill' both want the term itself
  const given = msg.text.trim();

  const exact = norm(given) === norm(expected);
  const accentsOnly = !exact && bare(given) === bare(expected);
  const dist = levenshtein(bare(given), bare(expected));
  const close = !exact && !accentsOnly && dist <= Math.max(1, Math.floor(bare(expected).length / 6));

  // Accents are not decoration in Portuguese — está and esta are different
  // words — so a diacritic miss is Hard, never a free pass.
  const grade = exact ? 3 : accentsOnly ? 2 : close ? 2 : 1;

  const uc = await env.DB.prepare(
    `SELECT * FROM user_cards WHERE user_id = ? AND card_id = ?`
  ).bind(uid, card.id).first();
  const ns = schedule(uc, grade);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO user_cards (user_id, card_id, stability, difficulty, reps, lapses, state, due, last_review)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, card_id) DO UPDATE SET
         stability = excluded.stability, difficulty = excluded.difficulty,
         reps = excluded.reps, lapses = excluded.lapses, state = excluded.state,
         due = excluded.due, last_review = excluded.last_review`
    ).bind(uid, card.id, ns.stability, ns.difficulty, ns.reps, ns.lapses, ns.state, ns.due, ns.last_review),
    env.DB.prepare(
      `INSERT INTO events (user_id, card_id, kind, exercise, rating, correct, created_at)
       VALUES (?, ?, 'answer', ?, ?, ?, ?)`
    ).bind(uid, card.id, pending.exercise, grade, grade > 1 ? 1 : 0, now()),
    env.DB.prepare(`DELETE FROM pending WHERE user_id = ?`).bind(uid),
    env.DB.prepare(`UPDATE users SET miss_streak = 0 WHERE id = ?`).bind(uid),
  ]);

  let text;
  if (exact) {
    text = `✅ *Exactly right*\n\n${expected}`;
  } else if (accentsOnly) {
    text = `✅ *Right word* — mind the accents:\n\n${expected}\n_You wrote: ${given}_`;
  } else if (close) {
    text = `🤏 *Almost* — a slip of the finger.\n\nCorrect: *${expected}*\nYou wrote: ${given}`;
  } else {
    text = `❌ *Not quite. The answer is:*\n\n${expected}`;
    if (pending.exercise === 'dictation') text += `\n_${card.ex_trans || card.trans}_`;
    text += `\n\n_You'll see this one again soon._`;
  }
  // A drill without the rule behind it is just a fact to memorise.
  if (pending.exercise === 'drill') {
    if (card.ex_t) text += `\n\n🇵🇹 ${card.ex_t.replace('___', `*${expected}*`)}`;
    if (card.ex_trans) text += `\n_${card.ex_trans}_`;
    if (card.note) text += `\n\nℹ️ ${card.note}`;
  }
  await tg(env, 'sendMessage', { chat_id: msg.chat.id, text, parse_mode: 'Markdown' });
}

/** Strips buttons off the previous unanswered card so only one is ever live. */
async function expirePending(env, user) {
  const prev = await env.DB.prepare(`SELECT * FROM pending WHERE user_id = ?`).bind(user.id).first();
  if (!prev?.message_id) return;
  const voiceBased = prev.exercise === 'audio' || prev.exercise === 'dictation';
  const method = voiceBased ? 'editMessageCaption' : 'editMessageText';
  const field = voiceBased ? 'caption' : 'text';
  const card = await env.DB.prepare(`SELECT term, trans FROM cards WHERE id = ?`).bind(prev.card_id).first();
  await tg(env, method, {
    chat_id: user.chat_id,
    message_id: prev.message_id,
    [field]: card ? `⏭ _Skipped_ — ${card.term} — ${card.trans}` : '⏭ _Skipped_',
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [] },
  });
}

/** Per-unit progress for a user: [{unit, total, started}] in course order. */
async function unitStats(env, userId, course) {
  const { results } = await env.DB.prepare(
    `SELECT c.unit AS unit, COUNT(*) AS total,
       SUM(CASE WHEN uc.card_id IS NOT NULL THEN 1 ELSE 0 END) AS started
     FROM cards c LEFT JOIN user_cards uc ON uc.card_id = c.id AND uc.user_id = ?1
     WHERE c.course = ?2 AND c.owner IS NULL GROUP BY c.unit`
  ).bind(userId, course).all();
  const map = Object.fromEntries(results.map((s) => [s.unit, s]));
  return (UNIT_ORDER[course] ?? []).filter((u) => map[u.key]).map((u) => ({ ...u, ...map[u.key] }));
}

/**
 * Next new card. Vocabulary units unlock in sequence, but grammar is a parallel
 * track: constructions are needed alongside words, not after all of them, so
 * drills open once the core verbs are underway and then take a quarter of the
 * new-card budget.
 */
async function pickNewCard(env, user, course) {
  const units = await unitStats(env, user.id, course);
  const byKey = Object.fromEntries(units.map((u) => [u.key, u]));

  const verbs = byKey.verbos;
  const gram = byKey.gramatica;
  const grammarOpen = course === 'pt' && verbs && verbs.started / verbs.total >= 0.5;
  if (grammarOpen && gram && gram.started < gram.total && Math.random() < 0.25) {
    const drill = await nextInUnit(env, user, course, 'gramatica');
    if (drill) return drill;
  }

  let target = null;
  for (const u of units) {
    if (u.key === 'gramatica') continue; // not part of the sequential chain
    if (target === null && u.started < u.total) { target = u.key; break; }
    if (u.started / u.total < 0.7) break; // gate the rest behind this one
  }
  return target ? nextInUnit(env, user, course, target) : null;
}

function nextInUnit(env, user, course, unit) {
  return env.DB.prepare(
    `SELECT * FROM cards WHERE course = ?1 AND unit = ?2 AND owner IS NULL
     AND id NOT IN (SELECT card_id FROM user_cards WHERE user_id = ?3)
     ORDER BY freq LIMIT 1`
  ).bind(course, unit, user.id).first();
}

// ---------- Helpers ----------

async function getUser(env, id) {
  return env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first();
}

async function tgFile(env, fileId) {
  const info = await tg(env, 'getFile', { file_id: fileId });
  if (!info.ok) throw new Error('getFile failed');
  const r = await fetch(`https://api.telegram.org/file/bot${env.TG_TOKEN}/${info.result.file_path}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function tgVoice(env, chatId, bytes, caption) {
  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  fd.append('caption', caption.slice(0, 1024));
  fd.append('voice', new Blob([bytes], { type: 'audio/mpeg' }), 'reply.mp3');
  const r = await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendVoice`, {
    method: 'POST',
    body: fd,
  });
  const j = await r.json();
  if (!j.ok) console.log('sendVoice failed:', JSON.stringify(j).slice(0, 200));
  return j;
}

function pickCourse(user) {
  const list = user.courses.split(',').filter((c) => COURSES[c]);
  if (list.length === 0) return 'pt';
  return list[Math.floor(Math.random() * list.length)];
}

function localHour(tz, date) {
  return parseInt(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: tz }).format(date),
    10
  );
}

function now() {
  return new Date().toISOString();
}
