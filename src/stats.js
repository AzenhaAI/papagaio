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

  const totals = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM cards WHERE course='pt' AND owner IS NULL AND pos IS NOT 'drill') AS pt_words,
       (SELECT COUNT(*) FROM cards WHERE course='en' AND owner IS NULL) AS en_words,
       (SELECT COUNT(*) FROM cards WHERE pos = 'drill') AS drills,
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

  const { results: units } = await env.DB.prepare(
    `SELECT c.unit, c.course, COUNT(*) AS total,
       SUM(CASE WHEN uc.card_id IS NOT NULL THEN 1 ELSE 0 END) AS started,
       SUM(CASE WHEN uc.reps > 0 THEN 1 ELSE 0 END) AS learned
     FROM cards c LEFT JOIN user_cards uc ON uc.card_id = c.id AND uc.user_id = ?1
     WHERE c.owner IS NULL GROUP BY c.unit, c.course`
  ).bind(uid).all();

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
    totals,
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
