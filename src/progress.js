// Per-unit progress and random distractors, done without reading the deck.
//
// Both used to be the two most expensive things the service did — 78% of all
// rows read in a week, measured: every card the bot sent shuffled the whole
// deck with ORDER BY RANDOM() (111,517 rows for three wrong answers), and
// every progress screen joined every card in the course against one user's
// rows (111,395 for a dozen numbers). Neither needed to. The deck's size per
// unit is the same for everyone and changes when content is added; a user's
// own rows are dozens, indexed by user. Random picks land on the deck index at
// a random rank and read the row they land on.

/** Cards per unit for a course — computed at most once a day, kept in stats. */
export async function unitTotals(env, course) {
  const key = `units_${course}`;
  const saved = await env.DB.prepare(`SELECT v, at FROM stats WHERE k = ?1`)
    .bind(key).first().catch(() => null);
  const age = saved?.at ? Date.now() - Date.parse(saved.at.replace(' ', 'T') + 'Z') : Infinity;
  if (saved?.v && age < 86_400_000) return JSON.parse(saved.v);

  // The count is 32,425 rows, which is fine once a day and ruinous in a loop.
  // On the day the read allowance ran out it became exactly that loop: the
  // count failed, nothing was stored, and the next request tried again — the
  // recovery competing with itself for what was left. So a failure is recorded
  // like a success, and the stale answer is served until the hour is up.
  let totals;
  try {
    const { results } = await env.DB.prepare(
      `SELECT unit, COUNT(*) AS total FROM cards
        WHERE course = ?1 AND owner IS NULL GROUP BY unit`
    ).bind(course).all();
    totals = Object.fromEntries(results.map((r) => [r.unit, r.total]));
  } catch (e) {
    if (saved?.v) {
      await env.DB.prepare(
        `UPDATE stats SET at = datetime('now', '-23 hours') WHERE k = ?1`
      ).bind(key).run().catch(() => {});
      return JSON.parse(saved.v);
    }
    throw e;
  }
  await env.DB.prepare(
    `INSERT INTO stats (k, v, at) VALUES (?1, ?2, datetime('now'))
       ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at`
  ).bind(key, JSON.stringify(totals)).run().catch(() => {});
  return totals;
}

/** [{unit, total, started, learned}] for one user, reading only that user's rows. */
export async function unitProgress(env, userId, course) {
  const totals = await unitTotals(env, course);
  const { results } = await env.DB.prepare(
    `SELECT c.unit AS unit, COUNT(*) AS started,
            SUM(CASE WHEN uc.reps > 0 THEN 1 ELSE 0 END) AS learned
       FROM user_cards uc JOIN cards c ON c.id = uc.card_id
      WHERE uc.user_id = ?1 AND c.course = ?2 AND c.owner IS NULL
      GROUP BY c.unit`
  ).bind(userId, course).all();
  const mine = Object.fromEntries(results.map((r) => [r.unit, r]));
  return Object.entries(totals).map(([unit, total]) => ({
    unit, total,
    started: mine[unit]?.started ?? 0,
    learned: mine[unit]?.learned ?? 0,
  }));
}

/**
 * `n` distinct values of `col` from the shared deck, none from `excludeId`.
 * Each pick lands on idx_cards_deck at a random rank and walks a step; a
 * landing past the end wraps to the start.
 */
export async function randomDistractors(env, course, excludeId, col, n = 3) {
  const allowed = new Set(['term', 'trans', 'ex_trans']);
  if (!allowed.has(col)) throw new Error(`bad column ${col}`);
  const span = await env.DB.prepare(
    `SELECT MAX(freq) AS hi FROM cards
      WHERE course = ?1 AND owner IS NULL AND pos IS NOT 'drill'`
  ).bind(course).first();
  const hi = Math.max(1, span?.hi ?? 1);
  const out = [];
  const seen = new Set();
  for (let tries = 0; out.length < n && tries < n * 4; tries++) {
    const at = Math.floor(Math.random() * hi);
    const row = await env.DB.prepare(
      `SELECT ${col} AS v FROM cards
        WHERE course = ?1 AND owner IS NULL AND pos IS NOT 'drill'
          AND freq >= ?2 AND id != ?3 AND ${col} IS NOT NULL
        ORDER BY freq LIMIT 1`
    ).bind(course, at, excludeId).first();
    const v = row?.v;
    if (v && !seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
}
