# PapaGaio mobile — API contract and app plan

The Worker at `https://papagaio.kirshp.workers.dev` is an API first; the Telegram
bot is one client of it. The app is the second client and shares the same D1, so
progress is continuous: start a card on the phone, finish it in Telegram.

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
| GET | `/api/deck` | `?course=pt&limit=500` | `{course, count, cards[]}` |
| GET | `/api/card/:id` | — | one card |

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
Order for `pt`: `basics → verbos → tempo → comida → cidade → madeira`.
For `en`: `glue → work`. Show locked units greyed with a padlock, never hide them.

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

Dialog with the AI coach stays in Telegram for now: voice recording plus
streaming is a big lift and the bot already does it well.

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
