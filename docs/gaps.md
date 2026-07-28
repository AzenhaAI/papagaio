# What PapaGaio is missing

Five independent reviews — spaced-repetition power tools (Anki, SuperMemo,
Mochi), the mass-market apps (Duolingo, Babbel, Busuu, Memrise), the immersion
family (LingQ, Readlang, Language Reactor), speaking tools (Speak, ELSA,
Pimsleur, italki) and exam preparation — merged into one ranked list. Anything
that collided with the product rules was dropped and the reason recorded.

The load-bearing claims were checked against the code before this was written:
`gen_audio.mjs` really does only speak `c.term`, so no example sentence has ever
been voiced; `lapses` really is written in three places and read in none; there
really is no export path; and both add-to-deck inserts really do discard `ex_t`.

Generated 28.07.2026.

---

Ranked shortlist — merged from five reviews, grounded in the actual code at `/Users/kirillshpara/Projects/papagaio` (Worker) and `/Users/kirillshpara/Projects/papagaio_app` (Flutter, tabs: Coach / Cards / Translate / Dictionary / Progress / Settings).

Two facts that shaped the ranking. First, the deck is 471 cards (220 pt, 251 en) and every single one already has `ex_t` and `ex_trans` — at `new_per_day = 12` the Portuguese deck is exhausted in about eighteen days, so features that mine content from his own life outrank features that dress up the curated deck. Second, the delivery channel has a hard ceiling of roughly 36 push slots a day, which makes "protect a slot" worth as much as "add an exercise".

**1. Synthesise `ex_t`, then add sentence-listening and dictation — small**
The single highest-leverage line in the repo: `scripts/gen_audio.mjs:92` calls `synth(c.term, …)`, so 471 written sentences have never been spoken, and the entire listening skill is "hear one isolated word", which is not the skill that fails at a Funchal counter — connected speech is.
Where: add `audio_ex` to `cards` in `schema.sql`, loop `ex_t` through the same batch script; two new branches in the exercise picker at `src/index.js:670` — "hear the sentence, pick it from four" and "hear it, type it". Reuses `pending` and `AUDIO_BASE` untouched. Phase two of the same item covers the exam-realistic listening gap (two plays, no pause, note-completion) at no new infrastructure.

**2. Cloze gap-fill answered by typing, accent-tolerant grading — small/medium. Three reviewers converged independently.**
Blanking the term inside its own `ex_t` is the only exercise that can test what the English course actually promises (collocation, which preposition, where the word sits) and the only one that catches clitic placement and `de+o → do` in pt-PT; typing it is also the first free-recall retrieval anywhere in the product.
Where: `src/index.js:670` exercise picker for the prompt; the answer branch must intercept in the text handler *before* `handleTranslation` (`src/index.js:258` currently sends any non-slash text to the translator), keyed off the `pending` row. Grade accent-only misses as Hard (2), not Again — `está`/`esta` near-misses must not thrash the scheduler. App side: `lib/card_page.dart` plus `/api/answer`.

**3. Undo the last answer, and edit a card in place — small**
Cards arrive on a phone during a working day; mis-taps are certain, and right now one fat finger permanently books a lapse, halves stability, and is written into the event log that any future parameter fitting will train on.
Where: snapshot the pre-answer `user_cards` row (new `last_answer` table or a JSON column) inside the existing batch at `src/index.js:~520` instead of discarding it; add an "Undo" inline button with callback `u:` beside the result message. Same message gets a "fix this card" action that re-runs the Groq path from `src/entry.js`.

**4. Every mined card keeps the sentence it was met in — small**
The cheapest item on the list and currently a silent data-loss bug: both insert paths (`src/api.js:377` and the bot's add-to-deck at `src/index.js:~494`) write term, trans, note and hardcode `freq = 100000`, so a word captured from a real Finanças letter arrives stripped of the one thing that made it memorable — and of the sentence that would make item 2 work on it.
Where: add `ex_t`, `ex_trans` and a `source` to both inserts and to the `tr_last` table; the vision path already has the transcription in hand at the moment it throws it away.

**5. `/api/export` — small**
Every trace of this learner's year sits in one free-tier D1 with no export path anywhere in `src/api.js`, which makes the language app the sole exception to the rule he applies to every other dataset he owns: never zero archives.
Where: one handler before the 404 at `src/api.js:~415` returning `cards` + `user_cards` + `events` as JSON and Anki-importable TSV; a "Export my data" row in `lib/settings_page.dart`; no new UI beyond that.

**6. "I already know this" at first exposure, plus a one-off English triage — small**
Cards are introduced in `freq` order and `src/index.js:672` pushes every new one into FSRS as `t_ru` regardless — for a B2 English speaker that means burning scarce slots and buying a permanent review obligation on words he owns cold, with no way to say "retire this" that is not a lie to the scheduler.
Where: a third button on the new-card message writing a suspended or very-high-stability `user_cards` row; a bulk sweep over the 251 English cards from the Cards tab.

**7. Interval fuzz, a daily load cap, and "I was away, spread it" — small**
`intervalFor()` in `src/fsrs.js:25` rounds deterministically and twelve cards enter on the same Monday, so they return on the same day together for months — harmless in Anki, expensive here where the ceiling is 36 pushes and overflow just silently slips.
Where: ±5% fuzz in `fsrs.js`; a due-count check in the push loop before `pickNewCard`; an explicit backlog-spread command that rewrites `due` across the coming week. This is also the no-shaming rule expressed as code: a backlog gets smoothed by the scheduler, not survived by the learner.

**8. Make `lapses` load-bearing: leech pause, then a mistakes ledger — small, then medium. Three reviewers converged.**
`lapses` is incremented at `src/fsrs.js:101` and read by nothing, anywhere; meanwhile `coach.js` emits a correction on every dialog turn and the translator explains every error, and all of it dies with the `dialog` row at `/stop` — three error streams, zero retention, for a self-taught adult whose recurring mistakes *are* the syllabus.
Where: phase one, at 6 lapses pause the card and offer a Groq-written narrower replacement (the message is "this card is badly made", never "you are failing") — reuses the `entry.js` generation path. Phase two, a `mistakes` table (source, course, wrong form, right form, ts) with write hooks in `src/coach.js` and `src/translate.js`, and a nightly promotion of anything seen three times into a real card. This matters more than it looks given the deck runs dry in under three weeks.

**9. Real statistics: per-course true retention, 30-day forecast, exam readiness — medium. Two reviewers, plus the exam-planner reviewer, converged.**
`/stats` (`src/index.js:225`) and `/api/progress` (`src/api.js:220`) report four counters, none of which answers the only question that matters — whether measured retention matches the 0.9 the scheduler is targeting — and he is a data analyst who asks for a CIPLE readiness forecast, which is exactly this data extrapolated from the `stability` values already stored.
Where: SQL-only over `events`, surfaced in `lib/progress_page.dart`; report pt and en separately (one blended number hides both decks); forward load charted against 36 slots. Once retention is measured, set `DESIRED_R` per course at `src/fsrs.js:11` — 0.9 for Portuguese, 0.85 for the English refinement band — which is a two-line change with real slot savings. No calendar heatmap: a grid of green squares is a streak counter in a different hat.

**10. Grammar as transform drills on the same scheduler — medium**
The app holds conjugation tables inside cached `entry` JSON and serves them reactively, but nothing ever asks him to conjugate anything, and the blockers that pin an adult at B1 in European Portuguese are a short enumerable list — perfeito vs imperfeito, ser/estar/ficar, clitic placement, the personal infinitive, the contractions — that no volume of vocabulary cards reaches.
Where: a grammar card is just a card whose prompt is a transformation, so it rides `pending`, `user_cards` and `events` with zero new scheduling logic; tag them in `cards.tags` and add one exercise branch. Same trick for English: perfect aspect, hedging modals, article use.

**11. Say the whole sentence, keep the recording, hear it beside the native — medium. Two reviewers.**
All four current exercises end in a tap or a single lexeme, so nothing trains retrieving a whole clause and getting it out of your mouth in two seconds; and voice bytes are currently transcribed and dropped, throwing away the one honest progress signal a product with no streaks and no badges has left.
Where: prompt with `ex_trans`, he speaks, an LLM grades presence of the target word and structure rather than string-matching, then the card's mp3 plays as the model answer. Store Telegram `file_id` plus card and date in a small table — no binary in D1. Coach tab and the `voice` branch at `src/index.js:~680`.

**12. Open-topic mode and an uncooperative interlocutor — small**
All 22 scenarios run under one "patient coach, corrects gently" prompt (`src/coach.js:55`) with speed as the only variable, so the two situations that actually break him — a Madeiran who does not repeat, and a work call where someone interrupts and changes the subject — cannot occur.
Where: a second axis beside `LEVELS` (repeats willingly / repeats once / does not repeat), plus an "open" scenario seeded from his real life, in `src/coach.js` and `/api/coach/scenarios`. Prompt-level only. Add the naturalness pass here too — "understood, but nobody here phrases it that way" — as the in-rules substitute for the peer-review feature that was correctly rejected.

**13. Generated graded reading at his own coverage — medium. Two reviewers.**
Nothing in PapaGaio is longer than one sentence, and reading at 95-98% known-word coverage is the best-evidenced route from recognition to fluent access; PapaGaio can do this better than any mass-market app because `src/coach.js:46` already runs the exact query needed (known terms ordered by stability) and Duolingo does not know his deck.
Where: a `/api/read` endpoint following the `entry.js` pattern — generate on demand, cache forever in D1; pass `PT_RULES` from `src/translate.js` into the prompt or the model will slip Brazilian forms in; treat the output as disposable. Surface it in the Coach tab rather than a new tab. Copyright-clean by construction.

**14. Written production with word limits and a communicative checklist — medium**
Nothing ever asks him to produce original Portuguese prose, and written production sits inside the 45% reading-writing block where the 25% component floor most often bites — his risk is not grammar, it is not knowing that a Portuguese note has to state why you are writing.
Where: `/api/write` POST, Groq-graded against genre moves and the word limit, marked "grammatically fine, but you never said why you were writing, and you are 22 words over" — Coach tab. Failed items become cards, which is the loop no commercial CIPLE tool can build.

**15. Low-capacity mode, playback speed, transcripts — small**
0.75x-then-1.0x is the standard listening scaffold and the app cannot do it; and a one-tap "heavy day, review-only at half rate" is the accessibility feature that fits this product's ethics precisely because there is no streak to break by using it.
Where: a `mode` column on `users` (the `interval_min` / `hour_start` / `hour_end` machinery already exists, so this is a preset), Settings tab; playback rate via SSML rate or client-side; transcripts printed under every audio item, which also turns a failed listening card into a readable diagnosis.

**16. Split recognition from production scheduling — medium, and last on purpose**
The argument is right — `src/index.js:671` picks randomly between four different memories sharing one FSRS state, and a 25% blind guess on a four-option tap graded Good inflates stability for the production direction he cannot actually perform — but the fix multiplies the due load in a channel that is already slot-constrained, so it belongs *after* items 2 and 7 exist, and as two tracks (recognition, production) rather than four.
Where: a `track` column in the `user_cards` primary key, migration in `schema.sql`, and the picker at `src/index.js:670` selecting by track rather than by dice.

---

**Dropped on the rules, not on merit:** official CAPLE past papers and the Netflix/Language Reactor subtitle miner (copyrighted text, no self-hosting exemption); incremental reading and a general article/epub importer (same, and the useful sources are exactly the infringing ones); peer review and a weekly native tutor (needs a second human — one breaks the single-user architecture, the other is a subscription); percentile benchmarking (needs a cohort). The salvageable core of the import/reader family survives in a narrow form only: keep the text of documents he is himself a party to — the condominium notice, the Finanças letter the vision path already transcribes and discards — and never persist a published one.

**Already covered well enough that a new feature would be noise:** the CEFR can-do coverage map, since `cards.unit`, `/api/units` and the unit bars in `/stats` already give the coarse version and the rest is bookkeeping; more coach scenarios, since 22 is plenty and the deficiency is the interlocutor's behaviour, not the scene list; a general known-word ledger with Portuguese lemmatisation, which is a large build whose payoff is mostly a reader that does not exist yet; sentence-synced karaoke highlighting (the `wordBoundaryEnabled: 'false'` at `src/tts.js:58` is genuinely one boolean, but the payoff needs a text surface first); shadowing rhythm analysis and phoneme-level diagnosis, where the honest cheap move is to stop `pronunciationCheck` (`src/index.js:331`) feeding its substring match into FSRS as a 3 or a 1 at all, rather than building an accent engine; and personal FSRS weights, which cannot be fitted honestly until the log stops mixing four exercise types into one state and has a few thousand clean reviews in it.

**What I would build first:** items 1 and 2 together, in one sitting — pointing the audio script at `ex_t` and adding a typed-cloze branch is the same change to the same `pending` flow, and it converts 471 already-written sentences from decoration into three new exercise types, including the first free recall and the first connected-speech listening in the product. Alongside them, item 3, because every day without undo writes noise into the schedule and into the only training data any future tuning will have. Then items 4 through 7 in a second pass — they are all afternoons, and together they stop the slot leak. **What I would refuse to build:** the full CIPLE simulator as an early project (large, and its two valuable organs, writing tasks and exam-format listening, are cheaper and better as items 14 and 1); the phoneme diagnosis engine; anything that persists a news article, a subtitle line or a CAPLE paper; anything needing a second user or a paid tier; and any progress surface with a day grid, a streak, or copy that treats a missed day as a failure — the forecast moves, and that is all that happens.
