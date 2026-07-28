// JSON API shared by the bot, the website and the future mobile app.
// The Worker is an API first; the Telegram bot is one client of it.

import { translate } from './translate.js';
import { schedule } from './fsrs.js';

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
const PUBLIC_DAILY_CAP = 200;

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
      return json(await translate(env, body.text));
    } catch (e) {
      return json({ error: e.message }, 502);
    }
  }

  if (path === '/api/deck' && request.method === 'GET') {
    const url = new URL(request.url);
    const course = url.searchParams.get('course') ?? 'pt';
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 500);
    const { results } = await env.DB.prepare(
      `SELECT id, course, term, trans, pos, gender, note, ex_t, ex_trans, tags, freq, audio
       FROM cards WHERE course = ? AND owner IS NULL ORDER BY freq LIMIT ?`
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

  // ---- authenticated ----

  const uid = await authUser(env, request);
  if (path.startsWith('/api/') && !uid) return json({ error: 'device token required' }, 401);

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
      `SELECT * FROM cards WHERE course = ? AND (owner IS NULL OR owner = ?1)
       AND id NOT IN (SELECT card_id FROM user_cards WHERE user_id = ?1)
       ORDER BY freq LIMIT 1`
    ).bind(course, uid).first();
    return fresh ? json({ card: fresh, isNew: true }) : json({ card: null });
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
