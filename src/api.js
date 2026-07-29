// JSON API shared by the bot, the website and the future mobile app.
// The Worker is an API first; the Telegram bot is one client of it.

import { translate } from './translate.js';
import { schedule } from './fsrs.js';
import { ensureEntry } from './entry.js';
import { SCENARIOS, LEVELS, coachTurn, scenarioList } from './coach.js';
import { chat } from './groq.js';
import { readAndTranslate } from './vision.js';
import { lookupWiki } from './wiki.js';
import { synthesize } from './tts.js';
import { analyse } from './read.js';
import { buildStats } from './stats.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, x-device-token',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
  });

// Public translate endpoint powers the website, so it needs a cheap abuse guard.
// Live-translate fires on typing pauses, so the cap is per-request, not per-phrase.
const PUBLIC_DAILY_CAP = 500;

async function underPublicCap(env, request) {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const day = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare(
    `INSERT INTO api_usage (day, ip, n) VALUES (?, ?, 1)
     ON CONFLICT(day, ip) DO UPDATE SET n = n + 1
     RETURNING n`
  ).bind(day, ip).first();
  return (row?.n ?? 0) <= PUBLIC_DAILY_CAP;
}

/** Resolves x-device-token to a user id, or null. */
async function authUser(env, request) {
  const token = request.headers.get('x-device-token');
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT user_id FROM devices WHERE token = ?`
  ).bind(token).first();
  return row?.user_id ?? null;
}

export async function handleApi(request, env, path) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  // ---- public ----

  if (path === '/api/translate' && request.method === 'POST') {
    if (!env.GROQ_API_KEY) return json({ error: 'translator not configured' }, 503);
    if (!(await underPublicCap(env, request))) return json({ error: 'daily limit reached' }, 429);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid json' }, 400);
    }
    if (!body?.text?.trim()) return json({ error: 'text is required' }, 400);
    try {
      return json(await translate(env, body.text, body.direction));
    } catch (e) {
      return json({ error: e.message }, 502);
    }
  }

  if (path === '/api/tts' && request.method === 'POST') {
    if (!(await underPublicCap(env, request))) return json({ error: 'daily limit reached' }, 429);
    const body = await request.json().catch(() => null);
    const text = String(body?.text ?? '').trim().slice(0, 300);
    if (!text) return json({ error: 'text is required' }, 400);
    const course = body?.course === 'en' ? 'en' : 'pt';

    // Same phrase → same audio; cache it at the edge for a week.
    const cache = caches.default;
    const key = new Request(
      `https://papagaio.cache/tts/${course}/${encodeURIComponent(text)}`
    );
    const hit = await cache.match(key);
    if (hit) return hit;

    try {
      const audio = await synthesize(text, course);
      const resp = new Response(audio, {
        headers: {
          'content-type': 'audio/mpeg',
          'cache-control': 'public, max-age=604800',
          ...CORS,
        },
      });
      await cache.put(key, resp.clone());
      return resp;
    } catch (e) {
      return json({ error: 'tts failed: ' + e.message }, 502);
    }
  }

  if (path === '/api/deck' && request.method === 'GET') {
    const url = new URL(request.url);
    const course = url.searchParams.get('course') ?? 'pt';
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 500);
    const { results } = await env.DB.prepare(
      `SELECT id, course, term, trans, pos, gender, note, ex_t, ex_trans, tags, freq, audio, unit, entry
       FROM cards WHERE course = ? AND owner IS NULL AND pos IS NOT 'drill'
       ORDER BY freq LIMIT ?`
    ).bind(course, limit).all();
    return json({ course, count: results.length, cards: results });
  }

  if (path.startsWith('/api/card/') && request.method === 'GET') {
    const id = decodeURIComponent(path.slice('/api/card/'.length));
    const card = await env.DB.prepare(
      `SELECT * FROM cards WHERE id = ? AND owner IS NULL`
    ).bind(id).first();
    return card ? json(card) : json({ error: 'not found' }, 404);
  }

  // Reading mode. Public, but a device token turns it from a glossing tool into
  // a progress-aware reader: words you already know stop being highlighted.
  if (path === '/api/read' && request.method === 'POST') {
    if (!env.GROQ_API_KEY) return json({ error: 'reader not configured' }, 503);
    if (!(await underPublicCap(env, request))) return json({ error: 'daily limit reached' }, 429);
    const body = await request.json().catch(() => null);
    if (!body?.text?.trim()) return json({ error: 'text is required' }, 400);
    try {
      return json(await analyse(env, body.text, await authUser(env, request)));
    } catch (e) {
      return json({ error: e.message }, 502);
    }
  }

  // Photo in, phrase out. One round trip does the reading and the translation,
  // which is why this is not on-device OCR.
  if (path === '/api/vision' && request.method === 'POST') {
    if (!env.GROQ_API_KEY) return json({ error: 'translator not configured' }, 503);
    if (!(await underPublicCap(env, request))) return json({ error: 'daily limit reached' }, 429);
    const body = await request.json().catch(() => null);
    const image = String(body?.image ?? '');
    if (!image) return json({ error: 'image is required' }, 400);
    try {
      const out = await readAndTranslate(env, image, body?.direction);
      if (!out.source) return json({ error: 'no text found in that picture' }, 422);
      return json(out);
    } catch (e) {
      return json({ error: e.message }, 502);
    }
  }

  // An account without Telegram. The bot is one way in, not the only one: the
  // app can create its own user and token, and everything except the chat
  // works the same. Ids are negative so they can never collide with a Telegram
  // user id, and chat_id < 0 is what keeps the cron push away from them.
  if (path === '/api/device' && request.method === 'POST') {
    if (!(await underPublicCap(env, request))) return json({ error: 'daily limit reached' }, 429);
    const body = await request.json().catch(() => ({}));
    const courses = body?.courses === 'en' || body?.courses === 'pt,en' ? body.courses : 'pt';

    const row = await env.DB.prepare(
      `SELECT MIN(id) AS lo FROM users WHERE id < 0`
    ).first();
    const id = Math.min(-1, (row?.lo ?? 0) - 1);

    const token = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users (id, chat_id, name, courses, created_at) VALUES (?, ?, 'app', ?, ?)`
      ).bind(id, id, courses, new Date().toISOString()),
      env.DB.prepare(
        `INSERT INTO devices (token, user_id, label, created_at) VALUES (?, ?, 'app', ?)`
      ).bind(token, id, new Date().toISOString()),
    ]);
    return json({ token, courses });
  }

  // The dictionary article, written on first request and kept forever, so a
  // word costs one model call in its whole life. Public like /api/translate —
  // the cap is what stops it being a free LLM endpoint for the internet.
  if (path.startsWith('/api/entry/') && request.method === 'GET') {
    const id = decodeURIComponent(path.slice('/api/entry/'.length));
    const card = await env.DB.prepare(`SELECT * FROM cards WHERE id = ?`).bind(id).first();
    if (!card) return json({ error: 'not found' }, 404);
    if (!card.entry && !(await underPublicCap(env, request))) {
      return json({ error: 'daily limit reached' }, 429);
    }
    try {
      return json({ id, entry: await ensureEntry(env, card) });
    } catch (e) {
      return json({ error: e.message }, 502);
    }
  }

  // What Wikipedia has on the word, in both languages. Not every word has an
  // encyclopedia behind it — "levada" does, "obrigado" does not — so an empty
  // answer is a normal answer. Cached at the edge for a day: the summaries
  // barely move and this is somebody else's server.
  if (path.startsWith('/api/wiki/') && request.method === 'GET') {
    const id = decodeURIComponent(path.slice('/api/wiki/'.length));
    const card = await env.DB.prepare(
      `SELECT term, trans, pos FROM cards WHERE id = ?`
    ).bind(id).first();
    if (!card) return json({ error: 'not found' }, 404);

    const cache = caches.default;
    // Version in the key: bumping it retires every cached answer at once.
    const key = new Request(`https://papagaio.cache/wiki/v4/${encodeURIComponent(id)}`);
    const hit = await cache.match(key);
    if (hit) return hit;

    try {
      const found = await lookupWiki(card.term, card.trans, card.pos);
      const resp = new Response(JSON.stringify({ id, ...found }), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'public, max-age=86400',
          ...CORS,
        },
      });
      await cache.put(key, resp.clone());
      return resp;
    } catch (e) {
      return json({ error: e.message }, 502);
    }
  }

  if (path === '/api/coach/scenarios' && request.method === 'GET') {
    const course = new URL(request.url).searchParams.get('course') ?? 'pt';
    return json({
      course,
      scenarios: scenarioList(course),
      levels: Object.entries(LEVELS).map(([key, l]) => ({ key, label: l.label })),
    });
  }

  // ---- authenticated ----

  const uid = await authUser(env, request);
  if (path.startsWith('/api/') && !uid) return json({ error: 'device token required' }, 401);

  if (path === '/api/stats' && request.method === 'GET') {
    return json(await buildStats(env, uid));
  }

  if (path === '/api/progress' && request.method === 'GET') {
    const s = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM user_cards WHERE user_id = ?1 AND reps > 0) AS learned,
         (SELECT COUNT(*) FROM user_cards WHERE user_id = ?1 AND due <= ?2) AS due_now,
         (SELECT COUNT(*) FROM events WHERE user_id = ?1 AND kind = 'answer') AS answers,
         (SELECT COUNT(*) FROM events WHERE user_id = ?1 AND kind = 'answer' AND correct = 1) AS correct`
    ).bind(uid, new Date().toISOString()).first();
    return json(s);
  }

  if (path === '/api/next' && request.method === 'GET') {
    const url = new URL(request.url);
    const course = url.searchParams.get('course') ?? 'pt';
    const card = await env.DB.prepare(
      `SELECT c.* FROM user_cards uc JOIN cards c ON c.id = uc.card_id
       WHERE uc.user_id = ? AND uc.due <= ? AND c.course = ?
       ORDER BY uc.due LIMIT 1`
    ).bind(uid, new Date().toISOString(), course).first();
    if (card) return json({ card, isNew: false });
    const fresh = await env.DB.prepare(
      // Numbered placeholders throughout: mixing `?` with `?1` made D1 throw,
      // which only ever showed up for a user with no cards yet — the very
      // first card of a fresh account.
      `SELECT * FROM cards WHERE course = ?1 AND (owner IS NULL OR owner = ?2)
       AND id NOT IN (SELECT card_id FROM user_cards WHERE user_id = ?2)
       ORDER BY freq LIMIT 1`
    ).bind(course, uid).first();
    return fresh ? json({ card: fresh, isNew: true }) : json({ card: null });
  }

  if (path === '/api/units' && request.method === 'GET') {
    const course = new URL(request.url).searchParams.get('course') ?? 'pt';
    const { results } = await env.DB.prepare(
      `SELECT c.unit AS unit, COUNT(*) AS total,
         SUM(CASE WHEN uc.card_id IS NOT NULL THEN 1 ELSE 0 END) AS started,
         SUM(CASE WHEN uc.reps > 0 THEN 1 ELSE 0 END) AS learned
       FROM cards c LEFT JOIN user_cards uc ON uc.card_id = c.id AND uc.user_id = ?1
       WHERE c.course = ?2 AND c.owner IS NULL GROUP BY c.unit`
    ).bind(uid, course).all();
    return json({ course, units: results });
  }

  // ---- coach ----
  //
  // The bot talks to it in voice; the app talks in text and asks /api/tts when
  // it wants to hear the line. Both go through coachTurn, so there is one
  // personality, not two. The session lives in `dialog`, one row per user, so a
  // conversation started in the app can be continued in Telegram.

  if (path === '/api/coach' && request.method === 'GET') {
    const s = await env.DB.prepare(`SELECT * FROM dialog WHERE user_id = ?`).bind(uid).first();
    if (!s) return json({ session: null });
    return json({
      session: {
        course: s.course,
        scenario: s.scenario,
        level: s.level,
        messages: JSON.parse(s.messages ?? '[]'),
      },
    });
  }

  if (path === '/api/coach' && request.method === 'POST') {
    if (!env.GROQ_API_KEY) return json({ error: 'coach not configured' }, 503);
    const body = await request.json().catch(() => null);

    // Leaving the scene: close the session and hand back the error recap.
    if (body?.stop) {
      const s = await env.DB.prepare(`SELECT * FROM dialog WHERE user_id = ?`).bind(uid).first();
      await env.DB.prepare(`DELETE FROM dialog WHERE user_id = ?`).bind(uid).run();
      const history = JSON.parse(s?.messages ?? '[]');
      if (!history.some((m) => m.role === 'user')) return json({ recap: '' });
      try {
        const recap = await chat(env, [
          {
            role: 'system',
            content:
              'You are a language teacher. Below is a dialog with a learner. Give a short recap in English: ' +
              'the 2–4 main mistakes the learner made and better phrasings. If there were no mistakes, praise in one line. No fluff.',
          },
          {
            role: 'user',
            content: history
              .map((m) => `${m.role === 'user' ? 'Learner' : 'Coach'}: ${m.content}`)
              .join('\n'),
          },
        ]);
        return json({ recap });
      } catch (e) {
        return json({ recap: '', error: e.message });
      }
    }

    const course = body?.course === 'en' ? 'en' : 'pt';
    const scenario = String(body?.scenario ?? '');
    const level = LEVELS[body?.level] ? body.level : 'normal';
    const scen = SCENARIOS[course]?.[scenario];
    if (!scen) return json({ error: 'unknown scenario' }, 400);

    // Opening the scene: no model call, just the scripted first line.
    if (body?.start) {
      const opening = [{ role: 'assistant', content: scen.open }];
      await env.DB.prepare(
        `INSERT INTO dialog (user_id, course, scenario, level, messages, started_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET course = excluded.course, scenario = excluded.scenario,
           level = excluded.level, messages = excluded.messages, started_at = excluded.started_at`
      ).bind(uid, course, scenario, level, JSON.stringify(opening), new Date().toISOString()).run();
      return json({ reply: scen.open, note: '', messages: opening });
    }

    const said = String(body?.message ?? '').trim().slice(0, 600);
    if (!said) return json({ error: 'message is required' }, 400);

    const s = await env.DB.prepare(`SELECT * FROM dialog WHERE user_id = ?`).bind(uid).first();
    const history = JSON.parse(s?.messages ?? '[]');

    try {
      const turn = await coachTurn(env, {
        userId: uid,
        course,
        scenario,
        level,
        history,
        said,
      });
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO dialog (user_id, course, scenario, level, messages, started_at) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET messages = excluded.messages`
        ).bind(uid, course, scenario, level, JSON.stringify(turn.history), new Date().toISOString()),
        env.DB.prepare(
          `INSERT INTO events (user_id, kind, exercise, created_at) VALUES (?, 'coach', 'app_talk', ?)`
        ).bind(uid, new Date().toISOString()),
      ]);
      return json({ reply: turn.reply, note: turn.note, messages: turn.history });
    } catch (e) {
      return json({ error: e.message }, 502);
    }
  }

  if (path === '/api/mine' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM cards WHERE owner = ? ORDER BY id DESC LIMIT 200`
    ).bind(uid).all();
    return json({ cards: results });
  }

  if (path === '/api/mine' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body?.term || !body?.trans) return json({ error: 'term and trans are required' }, 400);
    const id = `u${uid.toString(36)}-${Date.now().toString(36)}`;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO cards (id, course, term, trans, note, tags, freq, owner, unit)
         VALUES (?, ?, ?, ?, ?, '["mine"]', 100000, ?, 'mine')`
      ).bind(id, body.course ?? 'pt', body.term, body.trans, body.note ?? '', uid),
      env.DB.prepare(`INSERT INTO user_cards (user_id, card_id, due) VALUES (?, ?, ?)`)
        .bind(uid, id, new Date().toISOString()),
    ]);
    return json({ ok: true, id });
  }

  if (path === '/api/answer' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body?.card_id || !body?.grade) return json({ error: 'card_id and grade are required' }, 400);
    const uc = await env.DB.prepare(
      `SELECT * FROM user_cards WHERE user_id = ? AND card_id = ?`
    ).bind(uid, body.card_id).first();
    const ns = schedule(uc, body.grade);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO user_cards (user_id, card_id, stability, difficulty, reps, lapses, state, due, last_review)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, card_id) DO UPDATE SET
           stability = excluded.stability, difficulty = excluded.difficulty,
           reps = excluded.reps, lapses = excluded.lapses, state = excluded.state,
           due = excluded.due, last_review = excluded.last_review`
      ).bind(uid, body.card_id, ns.stability, ns.difficulty, ns.reps, ns.lapses, ns.state, ns.due, ns.last_review),
      env.DB.prepare(
        `INSERT INTO events (user_id, card_id, kind, exercise, rating, correct, created_at)
         VALUES (?, ?, 'answer', ?, ?, ?, ?)`
      ).bind(uid, body.card_id, body.exercise ?? 'app', body.grade, body.grade > 1 ? 1 : 0, new Date().toISOString()),
    ]);
    return json({ ok: true, due: ns.due });
  }

  return json({ error: 'unknown endpoint' }, 404);
}
