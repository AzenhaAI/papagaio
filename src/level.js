// Where a learner starts.
//
// A tester who already speaks some Portuguese had to sit through "olá" and
// "obrigado" to reach anything she actually needed, and gave up before the
// cards became useful. Nothing on a card says A1 or B2 — but the deck is
// ordered by frequency rank, and that ordering IS the level: the first few
// hundred words of a language are the first few hundred words of it.
//
// Shared by the bot and the app on purpose. Two copies of this table would
// drift, and then the same person would be placed differently depending on
// which door they came through.

export const START_LEVELS = [
  { key: 'a1', label: 'A1', upTo: 0,   hint: 'from the very beginning' },
  { key: 'a2', label: 'A2', upTo: 150, hint: 'I know the basics' },
  { key: 'b1', label: 'B1', upTo: 400, hint: 'I get by day to day' },
  { key: 'b2', label: 'B2', upTo: 700, hint: 'I just want the gaps' },
];

/**
 * Books everything below the level's rank as known, and returns how many words
 * that was. Skipped words are not deleted: they come back over the following
 * weeks, spread out, so a claimed level still gets checked — and so the whole
 * block cannot land on one morning.
 */
export async function applyLevel(env, userId, course, key) {
  const level = START_LEVELS.find((l) => l.key === key);
  if (!level) throw new Error('unknown level');
  if (!level.upTo) return { level: level.key, label: level.label, known: 0 };

  // One statement, not a batch: this touches several hundred rows and D1
  // caps how many statements a batch may carry.
  const r = await env.DB.prepare(
    `INSERT INTO user_cards (user_id, card_id, stability, difficulty, reps, lapses, state, due, last_review)
     SELECT ?1, c.id, 30, 4, 1, 0, 2,
            datetime('now', '+' || (20 + abs(random()) % 25) || ' days'), ?2
       FROM cards c
      WHERE c.course = ?3 AND c.owner IS NULL AND c.freq <= ?4
        AND (c.pos IS NULL OR c.pos != 'drill')
        AND c.id NOT IN (SELECT card_id FROM user_cards WHERE user_id = ?1)`
  ).bind(userId, new Date().toISOString(), course, level.upTo).run();

  return { level: level.key, label: level.label, known: r.meta?.changes ?? 0 };
}
