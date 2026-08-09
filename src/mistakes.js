// The mistakes ledger. Three streams of corrections — the coach, the
// translator, the recap — used to evaporate the moment they scrolled away.
// Now every one lands here, and the recurring ones graduate into cards:
// for a self-taught adult, the errors that keep coming back ARE the syllabus.

const now = () => new Date().toISOString();

/** Upsert a batch of corrections for a user. list: [{wrong, right, why?}] */
export async function recordMistakes(env, uid, list, source, course = 'pt') {
  const rows = (list ?? []).filter((m) => m?.wrong && m?.right && m.wrong !== m.right).slice(0, 6);
  if (!rows.length) return;
  await env.DB.batch(rows.map((m) =>
    env.DB.prepare(
      `INSERT INTO mistakes (user_id, course, wrong, right, why, source, n, last_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(user_id, wrong, right) DO UPDATE SET
         n = n + 1, last_at = excluded.last_at,
         why = COALESCE(excluded.why, mistakes.why)`
    ).bind(uid, course, String(m.wrong).slice(0, 120), String(m.right).slice(0, 120),
           m.why ? String(m.why).slice(0, 200) : null, source, now())
  ));
}

/**
 * A mistake seen three times becomes a card — phrased as "this is the form",
 * never "you failed again". Runs from the cron once a day.
 */
export async function promoteMistakes(env) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM mistakes WHERE n >= 3 AND promoted = 0 LIMIT 20`
  ).all();
  for (const m of (results ?? [])) {
    const id = `mk${m.user_id.toString(36)}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO cards (id, course, term, trans, note, tags, freq, owner, unit)
         VALUES (?, ?, ?, ?, ?, '["mine","mistake"]', 100000, ?, 'mine')`
      ).bind(id, m.course, m.right, `not “${m.wrong}”`, m.why ?? '', m.user_id),
      env.DB.prepare(
        `INSERT INTO user_cards (user_id, card_id, due) VALUES (?, ?, ?)`
      ).bind(m.user_id, id, now()),
      env.DB.prepare(
        `UPDATE mistakes SET promoted = 1 WHERE user_id = ? AND wrong = ? AND right = ?`
      ).bind(m.user_id, m.wrong, m.right),
    ]);
  }
  return results?.length ?? 0;
}
