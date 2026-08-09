// FSRS 4.5 — spaced-repetition scheduler.
// Grades: 1 Again, 2 Hard, 3 Good, 4 Easy.

const W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474,
  0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
];

const DECAY = -0.5;
const FACTOR = 19 / 81;
const DESIRED_R = 0.9;
const MAX_INTERVAL = 365;

const clampD = (d) => Math.min(Math.max(d, 1), 10);

/** Probability of recall after t days at stability s. */
export function retrievability(t, s) {
  if (s <= 0) return 0;
  return Math.pow(1 + FACTOR * (t / s), DECAY);
}

/** Interval in days until retrievability drops to DESIRED_R. */
function intervalFor(s) {
  const days = (s / FACTOR) * (Math.pow(DESIRED_R, 1 / DECAY) - 1);
  // ±5% fuzz: twelve cards introduced the same Monday must not return as one
  // Monday battalion for months. Harmless in Anki; expensive at 36 push slots.
  const fuzzed = days * (0.95 + Math.random() * 0.1);
  return Math.min(Math.max(Math.round(fuzzed), 1), MAX_INTERVAL);
}

function initialDifficulty(g) {
  return clampD(W[4] - (g - 3) * W[5]);
}

function nextDifficulty(d, g) {
  const next = d - W[6] * (g - 3);
  // Mean reversion: otherwise difficulty drifts to the edge and sticks there.
  return clampD(W[7] * initialDifficulty(4) + (1 - W[7]) * next);
}

function stabilityAfterRecall(d, s, r, g) {
  const hard = g === 2 ? W[15] : 1;
  const easy = g === 4 ? W[16] : 1;
  const growth =
    Math.exp(W[8]) *
    (11 - d) *
    Math.pow(s, -W[9]) *
    (Math.exp(W[10] * (1 - r)) - 1) *
    hard *
    easy;
  return s * (1 + growth);
}

function stabilityAfterLapse(d, s, r) {
  return (
    W[11] *
    Math.pow(d, -W[12]) *
    (Math.pow(s + 1, W[13]) - 1) *
    Math.exp(W[14] * (1 - r))
  );
}

/**
 * Computes the card's next state.
 * @param {object|null} card — current state, or null for a new card
 * @param {number} grade — 1..4
 * @param {Date} now
 */
export function schedule(card, grade, now = new Date()) {
  const g = Math.min(Math.max(grade, 1), 4);

  // A new card.
  if (!card || !card.reps || card.state === 0) {
    const stability = Math.max(W[g - 1], 0.1);
    const difficulty = initialDifficulty(g);
    return {
      stability,
      difficulty,
      reps: 1,
      lapses: g === 1 ? 1 : 0,
      state: g === 1 ? 1 : 2,
      due: addDays(now, g === 1 ? 0 : intervalFor(stability)),
      last_review: now.toISOString(),
    };
  }

  const elapsed = card.last_review
    ? Math.max((now - new Date(card.last_review)) / 86400000, 0)
    : 0;
  const r = retrievability(elapsed, card.stability);
  const difficulty = nextDifficulty(card.difficulty, g);

  const stability =
    g === 1
      ? stabilityAfterLapse(card.difficulty, card.stability, r)
      : stabilityAfterRecall(card.difficulty, card.stability, r, g);

  const safeStability = Math.max(stability, 0.1);

  return {
    stability: safeStability,
    difficulty,
    reps: card.reps + 1,
    lapses: card.lapses + (g === 1 ? 1 : 0),
    state: g === 1 ? 3 : 2,
    // A lapse comes back the same day, not after a full interval.
    due: addDays(now, g === 1 ? 0 : intervalFor(safeStability)),
    last_review: now.toISOString(),
  };
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000).toISOString();
}
