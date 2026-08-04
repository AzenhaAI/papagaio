// The course: modules of lessons, each a scene with a goal the coach checks.
//
// Free conversation is where a learner ends up, not where they start. The rung
// that was missing is knowing what you are trying to achieve and being told
// when you achieved it — so every lesson states a goal, lists what must be
// covered, and the coach reports which parts are done after each turn.

import course from '../data/course.json';
import { SCENARIOS, LEVELS } from './coach.js';
import { chat } from './groq.js';

export const COURSE = course;

/** Flat lesson list in teaching order, each carrying its module. */
export function lessons() {
  return COURSE.modules.flatMap((m) =>
    m.lessons.map((l) => ({ ...l, module: m.key, moduleTitle: m.title }))
  );
}

export const lessonById = (id) => lessons().find((l) => l.id === id) ?? null;

/**
 * The course map with the learner's state on it.
 * A lesson opens once the one before it is done — one rung at a time, so the
 * next thing to do is never a choice between twenty scenes.
 */
export async function courseMap(env, uid) {
  const { results } = await env.DB.prepare(
    `SELECT lesson_id, completed_at, attempts FROM course_progress WHERE user_id = ?`
  ).bind(uid).all();
  const done = new Map(results.map((r) => [r.lesson_id, r]));

  let unlockedIndex = 0;
  const flat = lessons();
  for (let i = 0; i < flat.length; i++) {
    if (done.has(flat[i].id)) unlockedIndex = i + 1;
  }

  const modules = COURSE.modules.map((m) => ({
    key: m.key,
    title: m.title,
    blurb: m.blurb,
    lessons: m.lessons.map((l) => {
      const i = flat.findIndex((x) => x.id === l.id);
      const record = done.get(l.id);
      return {
        id: l.id,
        title: l.title,
        goal: l.goal,
        scenario: l.scenario,
        level: l.level,
        phrases: l.phrases ?? [],
        state: record ? 'done' : i <= unlockedIndex ? 'open' : 'locked',
        completedAt: record?.completed_at ?? null,
      };
    }),
  }));

  const total = flat.length;
  return { title: COURSE.meta.title, modules, done: done.size, total,
           next: flat[unlockedIndex]?.id ?? null };
}

/** Marks a lesson finished; attempts count every session that opened it. */
export async function completeLesson(env, uid, lessonId) {
  await env.DB.prepare(
    `INSERT INTO course_progress (user_id, lesson_id, completed_at, attempts)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(user_id, lesson_id) DO UPDATE SET
       completed_at = COALESCE(course_progress.completed_at, excluded.completed_at),
       attempts = course_progress.attempts + 1`
  ).bind(uid, lessonId, new Date().toISOString()).run();
}

/**
 * Judges the transcript against the lesson's checklist.
 *
 * Deliberately separate from the coach's own turn: a persona in the middle of
 * playing a barista is a poor judge of whether the exercise is finished, and
 * asking it to do both in one call made it either break character to announce
 * success or forget to check at all.
 */
export async function checkGoal(env, lesson, history) {
  const said = history.filter((m) => m.role === 'user');
  if (!said.length) return { met: [], done: false };

  const raw = await chat(env, [
    {
      role: 'system',
      content:
        'You are marking a language exercise. The learner had to cover several points ' +
        'in a roleplay. Decide which points they actually covered — in their own words, ' +
        'not necessarily the suggested phrasing, and imperfect Portuguese still counts as ' +
        'covered if the meaning came across. Do not require politeness formulas unless the ' +
        'point names one.\\n' +
        `GOAL: ${lesson.goal}\\n` +
        `POINTS: ${lesson.must.map((m, i) => `${i}. ${m}`).join('; ')}\\n` +
        'Answer strictly as JSON: {"met": [indices of covered points], "done": true if all covered}',
    },
    {
      role: 'user',
      content: history
        .map((m) => `${m.role === 'user' ? 'Learner' : 'Coach'}: ${m.content}`)
        .join('\\n'),
    },
  ], { json: true });

  try {
    const out = JSON.parse(raw);
    const met = (Array.isArray(out.met) ? out.met : [])
      .map(Number)
      .filter((i) => Number.isInteger(i) && i >= 0 && i < lesson.must.length);
    return { met, done: met.length >= lesson.must.length };
  } catch {
    return { met: [], done: false };
  }
}

/** The scene behind a lesson, with the lesson's own opening if it has one. */
export function lessonScene(lesson) {
  const scen = SCENARIOS.pt?.[lesson.scenario];
  if (!scen) return null;
  return { ...scen, level: LEVELS[lesson.level] ? lesson.level : 'normal' };
}
