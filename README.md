# PapaGaio 🦜

A no-subscription language tutor that lives in Telegram. European Portuguese
(pt-PT) and English, spaced repetition, and a voice AI coach — built on free
infrastructure because language drills should not cost a monthly fee.

Born out of frustration: three years of language schools, every flashcard app
paywalls the useful parts, and half of the "Portuguese" content out there is
Brazilian — which gets you blank stares at a Funchal bakery.

## What it does

- **A card every 15 minutes** during working hours (09:00–18:00, Europe/Lisbon).
  One message, one tap, back to work. Ignore three in a row and the bot goes
  quiet until tomorrow — no streak shaming, ever.
- **FSRS scheduling** — misses come back the same day, hits stretch out over
  growing intervals.
- **Exercise mix**: term → translation, translation → term, listening
  (native-quality audio, no text shown), and pronunciation — you say the word,
  Whisper checks what you actually said.
- **AI voice coach** (`/talk`): scenario roleplay — café, bus, bank, doctor,
  neighbour for pt-PT; work chat, small talk, interview for English. The coach
  speaks with a natural voice, hears your voice replies, corrects gently inline,
  and knows your deck — it prefers words you have already learned. `/stop` ends
  the session with an error recap.
- **Two courses**: pt-PT from A1 (survival first, Madeira vocabulary included),
  English from B1–B2 (conversational glue and work vocabulary, false friends
  flagged).

## Stack

| Piece | Tech | Cost |
|---|---|---|
| Bot + scheduler | Cloudflare Worker + Cron Trigger | free |
| Storage | Cloudflare D1 (SQLite) | free |
| Card audio | Edge TTS, batch-generated to static mp3 | free |
| Coach voice | Edge TTS over WebSocket, at runtime in the Worker | free |
| Speech-to-text | Groq Whisper (whisper-large-v3-turbo) | free tier |
| Dialog brain | Groq LLM | free tier |

No servers, no subscriptions, no premium tier. The whole thing runs on
free plans indefinitely for personal use.

## Anti-features (by design)

- No monetisation hooks, no locked content.
- No streak guilt: ignored cards auto-pause the bot, politely.
- No Brazilian Portuguese mixed in — pt-PT only, checked card by card.
- No song lyrics scraping: the fado/poetry module uses public-domain texts only.

## Layout

```
src/            Worker: bot, API, FSRS, coach, translator, reader, TTS, Groq
site/           The website (Astro), built into ~/Projects/shpara1/papagaio/
schema.sql      D1 schema
data/deck/      Card decks (JSON), one file per batch
data/entries/   Dictionary articles keyed by card id
scripts/        Deck seeding, audio generation, diagnostics, webhook setup
docs/           API contract for the app, competitor gap analysis
build/          Generated SQL — rebuilt from data/, never committed
```

Useful scripts:

```bash
npm run seed       # data/deck/*.json  -> build/seed.sql
npm run audio      # synthesize missing card audio, incrementally
npm run grammar    # regenerate the grammar drill deck
npm run check:tts  # is the Edge TTS version gate still open?
```

Card format:

```json
{
  "id": "pt0007",
  "pt": "se faz favor",
  "trans": "please (request)",
  "pos": "phrase",
  "note": "distinctly European Portuguese; Brazilians say por favor",
  "ex_t": "A conta, se faz favor.",
  "ex_trans": "The bill, please.",
  "tags": ["core", "cortesia", "pt-pt"],
  "freq": 7
}
```

`note` is filled only when there is a catch: a pt-PT/Brazilian split, an
unexpected gender, a false friend. An empty note beats an obvious one.

## Deploy

```bash
npm install
npx wrangler d1 create papagaio          # put the id into wrangler.toml
npx wrangler d1 execute papagaio --remote --file schema.sql
node scripts/load_deck.mjs
npx wrangler d1 execute papagaio --remote --file build/seed.sql
npx wrangler deploy
bash scripts/setup_webhook.sh            # asks for the BotFather token
npx wrangler secret put GROQ_API_KEY     # enables voice features
node scripts/gen_audio.mjs               # card audio → static hosting
npx wrangler d1 execute papagaio --remote --file build/audio.sql
```

## License

MIT
