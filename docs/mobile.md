# PapaGaio mobile — API contract and app plan

The Worker at `https://papagaio.kirshp.workers.dev` is an API first; the Telegram
bot is one client of it. The app is the second client and shares the same D1, so
progress is continuous: start a card on the phone, finish it in Telegram.

The app lives in its own repo (`~/Projects/papagaio_app`, Flutter). Its
`lib/api.dart` is the Dart mirror of this document — change the two together.

## Why an app at all

The bot already works, so the app must earn its place. Three things it does that
Telegram cannot:

1. **Local notifications** — a card every 15 minutes scheduled on-device. No
   server, no push infrastructure, works in airplane mode, survives Telegram
   being muted or blocked.
2. **Offline deck** — the whole deck plus audio cached locally. Levada with no
   signal is prime study time.
3. **Real UI** — dictionary entries with conjugation tables, unit progress,
   drill screens. A chat bubble is a bad container for a grammar table.

Everything else (translation, dialog, pronunciation) stays server-side and is
shared with the bot.

## Auth

Send `/link` to the bot → it returns a UUID → user pastes it into the app once.
Store it in secure storage and send it as a header on every authenticated call:

```
x-device-token: 3f2b91c4-...
```

No accounts, no passwords, no OAuth. Losing the phone means issuing a new token
from the bot; old tokens can be revoked by deleting the row in `devices`.

## Endpoints

### Public — no token

| Method | Path | Body / query | Returns |
|---|---|---|---|
| POST | `/api/translate` | `{text, direction?}` | translation object (below) |
| POST | `/api/tts` | `{text, course}` | `audio/mpeg` bytes, cached 7 days |
| POST | `/api/read` | `{text}` | reading analysis (below) |
| GET | `/api/deck` | `?course=pt&limit=500` | `{course, count, cards[]}` |
| GET | `/api/card/:id` | — | one card |
| GET | `/api/entry/:id` | — | `{id, entry}`, written on first request |
| GET | `/api/wiki/:id` | — | `{pt, en}` summaries, or nulls |

`/api/read` accepts the device token optionally: without it every word comes
back `status: "new"`, with it words you have already met are marked. Response:

```json
{
  "text": "...",
  "words": [{"surface": "moro", "lemma": "morar", "gloss": "to live",
             "pos": "verb", "status": "known", "card_id": "pt0045", "audio": "pt0045.mp3"}],
  "counts": {"new": 15, "in_deck": 3, "known": 8}
}
```

`status` is `new` | `in_deck` | `known`. Function words are omitted entirely —
only content words come back, each distinct surface form once.

`direction` is `"en->pt"`, `"pt->en"` or omitted for auto-detect.

Translation object:

```json
{
  "source": "Quanto cista?",
  "direction": "pt->en",
  "translation": "How much does it cost?",
  "corrected_source": "Quanto custa?",
  "corrections": [{"wrong": "cista", "right": "custa", "why": "verb custar — to cost"}],
  "literal": "",
  "register": "informal",
  "br_diff": [{"pt": "autocarro", "br": "ônibus", "gloss": "bus"}],
  "note": "..."
}
```

`br_diff` is the differentiator — render it prominently. `corrections` is the
second one: never silently fix the user's input, show what was wrong and why.

### Authenticated — `x-device-token` required

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/api/next` | `?course=pt` | `{card, isNew}` or `{card: null}` |
| POST | `/api/answer` | `{card_id, grade, exercise?}` | `{ok, due}` |
| GET | `/api/progress` | — | `{learned, due_now, answers, correct}` |
| GET | `/api/units` | `?course=pt` | `{course, units[{unit, total, started, learned}]}` |
| GET | `/api/mine` | — | user-added cards |
| POST | `/api/mine` | `{term, trans, course?, note?}` | `{ok, id}` |

`grade` is FSRS: `1` again, `2` hard, `3` good, `4` easy. The app can expose all
four buttons (Anki-style) — richer than the bot's binary correct/wrong.

### Card shape

```json
{
  "id": "pt0028", "course": "pt", "term": "ser", "trans": "to be (permanent)",
  "pos": "verb", "gender": null, "note": "...", "ex_t": "...", "ex_trans": "...",
  "tags": "[\"core\",\"verbo\"]", "freq": 28, "audio": "pt0028.mp3",
  "unit": "verbos", "entry": "{...}"
}
```

`tags` and `entry` arrive as JSON **strings** — decode them client-side.
`audio` is a filename; prefix with `https://shpara.com/papagaio/audio/`.

`entry` (may be null) is the dictionary article:

```json
{
  "meanings": [{"trans": "...", "note": "..."}],
  "synonyms": ["..."],
  "collocations": [{"t": "ser de", "trans": "to be from"}],
  "grammar": "...",
  "conj": {"presente": ["sou","és","é","somos","são"], "pps": [...], "imperfeito": [...]},
  "lit": [{"text": "...", "src": "Fernando Pessoa, ..."}]
}
```

Conjugation arrays are five persons in order: **eu, tu, ele/ela, nós, eles/elas**
(European Portuguese drops *vós* in speech).

### Units

Ordered unlock — the next unit opens once the previous is ≥70% started.
Order for `pt`: `basics → frases → numeros → verbos → tempo → comida → familia
→ casa → cidade → burocracia → madeira`. For `en`: `glue → work → meetings →
writing → social → data → money → life`. Show locked units greyed with a
padlock, never hide them.

**Grammar is not in that chain.** `unit: "gramatica"` is a parallel track that
opens once `verbos` is half started, and then takes about a quarter of the new
cards. Cards there have `pos: "drill"` and are excluded from `/api/deck`, so
the dictionary stays a dictionary.

### Exercise types

The bot runs six, graduated by how well a card is known. The app should at
minimum match the typed ones — picking from four options is recognition, and
recognition is the thing the product already over-serves.

| Type | Prompt | Answer |
|---|---|---|
| `t_ru` | the term | pick the translation |
| `ru_t` | the translation | pick the term |
| `audio` | the term spoken | pick what you heard |
| `cloze` | the example sentence with the term blanked | **type** the missing word |
| `dictation` | the whole example sentence spoken | **type** what you heard |
| `type` | the translation | **type** the term |
| `drill` | a grammar prompt | **type** the form |

Typed answers are graded with tolerance: an exact match is Good, a miss only on
diacritics is **Hard** (`está` and `esta` are different words, so it is never a
free pass), a one-character slip is Hard, anything else is Again. Say which of
the four it was — "right word, mind the accents" teaches, "wrong" does not.

Cloze is built by blanking the term inside `ex_t`; when the term does not appear
there literally, skip cloze for that card rather than inventing a gap. About 83%
of the deck supports it.

### Coach recap

`POST /api/coach {stop: true}` returns the mistakes as data, not prose:

```json
{
  "summary": "The conversation went well with a few areas for improvement.",
  "mistakes": [
    {"wrong": "Eu estou trabalhando aqui dois anos",
     "right": "Eu estou a trabalhar aqui há dois anos",
     "why": "gerund progressive is Brazilian; pt-PT uses estar a + infinitive"}
  ],
  "recap": "…the same thing flattened to one string, for older clients",
  "course": "pt"
}
```

Offer them as cards. A phrase fumbled while actually speaking is the best review
candidate there is, and the bot ships each one as a card whose `term` is the
correct version and whose `ex_t` reads "You said: …". At most four items, ranked
Brazilian-form first, then grammar, then word choice; corrections are guaranteed
to be clean European Portuguese, and typing shortcuts like a missing accent on
*cafe* never take a slot.

### Voice in a browser

`POST /api/transcribe` takes `multipart/form-data` with `audio` and `language`,
returns `{text}`. The filename extension matters — Whisper keys the container
format off it, so send `say.webm` from Chrome and `say.m4a` from Safari. Needs
the device token. 2 MB ceiling.

## Screens

1. **Card** — the home screen. Term, four options or four FSRS buttons, audio
   playback, "📖 more" opening the dictionary entry. Must be usable one-handed
   in five seconds.
2. **Translator** — same as the website, plus a "add to deck" button hitting
   `POST /api/mine`. Offline: show cached history, disable the input.
3. **Dictionary** — search, tag filters, unit grouping, conjugation tables.
   Fully offline after first sync.
4. **Progress** — unit bars, streak-free stats, upcoming review load.
5. **Settings** — pairing, notification window and interval, theme, course
   selection (pt / en / both).

Two things the bot grew that the app still lacks, both worth carrying over:

- **Undo.** Cards arrive mid-workday and a fat-finger tap should not write a
  permanent lapse. The bot replays the card's history without the mistaken
  answer rather than patching state, so nothing false is left for later FSRS
  tuning to learn from. The app needs the same, ideally as a swipe-back.
- **Export.** The review history is the only dataset in this project with no
  archive anywhere else. `/export` in the bot ships cards, progress and the full
  event log as JSON. The app should be able to do the same to Files/Drive.

## Sync strategy

- On launch: `GET /api/deck` for each active course, cache to SQLite (drift/sqflite).
- Audio: download lazily, cache to disk, keep forever — the whole deck is ~1 MB
  per 100 cards.
- Answers while offline: queue locally, replay against `POST /api/answer` when
  connectivity returns. FSRS is deterministic, so replaying in order is safe.
- Local notifications are computed on-device from cached `due` timestamps; no
  need to ask the server what to show next.

## Non-negotiables

Same as the rest of the product:

- No subscriptions, no premium tier, no ads, no analytics SDKs beyond what the
  site already uses.
- No streak shaming. Missed days are not a failure state; the UI must never
  imply otherwise.
- European Portuguese only.
- Store no credentials beyond the device token.
