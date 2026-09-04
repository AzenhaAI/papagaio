import { unitProgress } from './progress.js';
// Everything the progress screens need, in one query pass.
//
// Deliberately no streaks: a missed day is not a failure state, and a grid of
// green squares is a streak wearing a different hat.

// A2 is commonly put at around 1000 words of active vocabulary. The number is a
// convention, not a measurement, so the readiness figure it feeds is labelled a
// proxy everywhere it appears.
const A2_VOCAB_TARGET = 1000;

export async function buildStats(env, uid) {
  const nowIso = new Date().toISOString();

  // The first three used to be counted here, per learner, per screen open —
  // and pos='drill' has no index, so opening the stats tab scanned all 190k
  // cards. They are the same three numbers for everybody and they move once a
  // day, so they come from the parked row that /api/admin/recount fills.
  const parked = await env.DB.prepare(
    `SELECT v FROM stats WHERE k = 'counts'`
  ).first().catch(() => null);
  const shared = parked?.v ? JSON.parse(parked.v) : {};

  const totals = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM user_cards WHERE user_id = ?1) AS seen,
       (SELECT COUNT(*) FROM user_cards WHERE user_id = ?1 AND reps > 0) AS learned,
       (SELECT COUNT(*) FROM user_cards WHERE user_id = ?1 AND due <= ?2) AS due_now,
       (SELECT COUNT(*) FROM events WHERE user_id = ?1 AND kind='answer') AS answers`
  ).bind(uid, nowIso).first();

  // Fourteen days of scheduled load. Knowing Thursday is heavy is actionable;
  // knowing you studied 41 days running is not.
  const { results: forecast } = await env.DB.prepare(
    `SELECT date(due) AS day, COUNT(*) AS n FROM user_cards
     WHERE user_id = ?1 AND due IS NOT NULL
       AND date(due) BETWEEN date('now') AND date('now', '+13 days')
     GROUP BY date(due) ORDER BY day`
  ).bind(uid).all();

  const { results: byExercise } = await env.DB.prepare(
    `SELECT exercise, COUNT(*) AS n, SUM(correct) AS ok FROM events
     WHERE user_id = ?1 AND kind='answer' AND exercise IS NOT NULL
     GROUP BY exercise ORDER BY n DESC`
  ).bind(uid).all();

  const { results: daily } = await env.DB.prepare(
    `SELECT date(created_at) AS day, COUNT(*) AS n, SUM(correct) AS ok FROM events
     WHERE user_id = ?1 AND kind='answer' AND created_at >= date('now','-29 days')
     GROUP BY date(created_at) ORDER BY day`
  ).bind(uid).all();

  // Both courses, from the per-user rows rather than a join over every card.
  const units = (await Promise.all(['pt', 'en'].map(async (course) =>
    (await unitProgress(env, uid, course)).map((u) => ({ ...u, course }))))).flat();

  // Leeches: cards you keep failing. Anki suspends these; the least we can do
  // is name them, because they quietly eat the queue.
  const { results: weakest } = await env.DB.prepare(
    `SELECT c.id, c.term, c.trans, c.course, uc.lapses, uc.reps
     FROM user_cards uc JOIN cards c ON c.id = uc.card_id
     WHERE uc.user_id = ?1 AND uc.lapses > 0
     ORDER BY uc.lapses DESC, uc.reps ASC LIMIT 10`
  ).bind(uid).all();

  const pct = (ok, n) => (n ? Math.round((100 * ok) / n) : null);
  const acc = (kinds) => {
    const rows = byExercise.filter((r) => kinds.includes(r.exercise));
    const n = rows.reduce((a, r) => a + r.n, 0);
    const ok = rows.reduce((a, r) => a + (r.ok ?? 0), 0);
    return pct(ok, n);
  };

  const ptLearned = units
    .filter((u) => u.course === 'pt' && u.unit !== 'gramatica')
    .reduce((a, u) => a + u.learned, 0);

  const ciple = {
    vocabulary: Math.min(100, Math.round((100 * ptLearned) / A2_VOCAB_TARGET)),
    grammar: acc(['drill']),
    listening: acc(['audio', 'dictation']),
    production: acc(['type', 'cloze', 'drill', 'voice']),
    words_learned: ptLearned,
    words_target: A2_VOCAB_TARGET,
  };
  const parts = [ciple.vocabulary, ciple.grammar, ciple.listening, ciple.production]
    .filter((v) => v !== null);
  ciple.overall = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : 0;

  return {
    totals: {
      pt_words: shared.pt_cards ?? null,
      en_words: shared.en_cards ?? null,
      drills: shared.pt_drills ?? null,
      ...totals,
    },
    forecast,
    by_exercise: byExercise.map((r) => ({ ...r, pct: pct(r.ok, r.n) })),
    daily: daily.map((r) => ({ ...r, pct: pct(r.ok, r.n) })),
    units,
    weakest,
    retention_30d: pct(
      daily.reduce((a, r) => a + (r.ok ?? 0), 0),
      daily.reduce((a, r) => a + r.n, 0)
    ),
    ciple,
  };
}
