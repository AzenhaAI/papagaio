# Cloud task: the dictionary, Russian at parity

Brief for a Claude Code cloud session on `AzenhaAI/papagaio` (and, for part 4,
`AzenhaAI/papagaio-app`). Written 2026-09-27 from measurements, not guesses.

## Why — measured 2026-09-27

Portuguese headwords live in two D1 layers: `lex:` (63,654, from en-wiktionary;
`trans` is English) and `lexpt:` (46,479, from pt-wiktionary; `trans` is a
Portuguese definition). The app's bundled pack merges them into 101,509
headwords.

| layer | in D1 | in the bundled pack (2026-09-03) |
|---|---|---|
| Russian gloss | **100%** of both layers (110,133) | **13%** (13,598) |
| English gloss | `lex:` only — 37,855 headwords have none | 63% |
| Portuguese definition | `lexpt:` only — 33,267 headwords have none | 67% |

So Russian is a *quality and export* problem, not a quantity one: the nightly
runs filled D1 and nothing carried it into the pack. English and the
Portuguese definition are real gaps. Of the top 20,000 by rank, 4,163 lack
English and 3,437 lack a Portuguese definition.

The Russian layer was largely machine-written by cheap models and shows it:

| word | Russian now | problem |
|---|---|---|
| bricolage | хобби | means DIY / small repairs by hand |
| forçado | ви́лы | that is *forcado*; *forçado* = вынужденный |
| monitor (deck) | следить за кем-либо | verb gloss on a noun |
| totalmente | полностью; полностью согласен; полностью уверен | padding |
| choque | удар; внезапный и резкий | adjective mixed into a noun |

## Goal: three mirrored layers

Every Portuguese headword carries an English gloss, a Russian gloss and a
Portuguese definition, each passing the quality gate — the three meaning
languages the app offers, mirrored.

## Phases, in this order (stop and report after each)

0. **Pilot.** 500 headwords from the top 20k: fill whatever is missing, gate
   all three layers. Report time taken and the cloud-credit spent, and
   extrapolate to each phase below before going on.
1. **Export and pack from D1** (part 1 below). This alone lifts offline Russian
   from 13% to ~100% of headwords.
2. **Gate the top 20,000** in all three layers; rewrite what fails.
3. **Fill English** for the 37,855 headwords without it, most frequent first.
4. **Fill the Portuguese definition** for the 33,267 without it.
5. **Gate the long tail** (rank > 20,000), as far as the credit allows;
   whatever remains goes to the nightly cron lines with the same gate.

## Constraints — read before touching anything

- **D1 free tier: 5M rows read per day, shared with live users.** Export by
  keyed ranges (`WHERE rowid > ? ORDER BY rowid LIMIT 5000`), never
  `COUNT(*)`, `ORDER BY RANDOM()`, `instr()`/`LIKE '%…%'` over big tables. Measure
  with `wrangler d1 insights` before and after. Budget the whole export under
  1M rows.
- **The local pipeline artifacts (`build/`, `.cache/`) are not in git.** The
  existing `scripts/export_offline_packs.mjs` reads them and cannot run here.
  Write a new exporter that reads D1 (the source of truth for glosses) plus the
  committed `data/`. Do not delete or replace the old script.
- **Quality gate:** cheap models produced ~2/3 bad expansions before. Generate
  with whatever is fast, but every Russian gloss that is written back to D1 or
  shipped in a pack passes a review on Sonnet (or better): one sense per
  semicolon, part of speech matches the headword, no padding phrases, no
  Brazilian-only senses presented as pt-PT, stress marks removed or consistent.
- **Never overwrite good data with worse or empty.** Write-backs are UPDATEs of
  rows whose new gloss passed the gate; keep the previous value in a
  `gloss_history` table (create it) so every change can be rolled back.
- Everything in English: code comments, commits, docs.
- Do not deploy the Worker (`wrangler deploy`) from here; leave that to a local
  run. D1 reads/writes through `wrangler d1 execute --remote` are fine.

## Parts

1. **Export and pack from D1.** New `scripts/export_packs_d1.mjs`: pages through
   `cards` (lexicon rows `lex:` / `lexpt:` and the deck), produces the same
   `pt.json.gz` / `en.json.gz` / `ru_forms.json.gz` shapes the app reads (see
   `papagaio-app/lib/data/offline_dict.dart`, class `_Row`: `t p g r e ru pt d`),
   plus `manifest.json`. Report coverage per layer and per rank band.
2. **Fill and fix all three layers** per the phases above. Write passing
   glosses back to D1 with history. English goes to `trans` on `lex:` rows and
   to a new `trans_en` column on `lexpt:` rows; the Portuguese definition to
   `trans_pt`. Also the reverse
   index RU→PT: every RU gloss word should find its Portuguese headword.
3. **Publish.** Upload the packs as a new release `packs-v2` on
   `AzenhaAI/papagaio` if `gh` is authorised here; if not, commit them to a
   branch `packs-v2` under `packs/` and say so — they will be uploaded locally.
   The Worker's `/packs/*` proxy (`src/api.js` ~685) must then point at v2.
4. **App side (`papagaio-app`).**
   - Replace `assets/packs/pt.json.gz` with the new pack.
   - Ship Russian case forms and the English lexicon inside the app instead of
     as optional downloads, if the size stays reasonable (report the numbers).
   - Search index: `OfflineDict.search` scans all 101k rows per keystroke
     (~130 ms warm). Build a sorted prefix index over the folded headword and
     gloss words at load time so a lookup is a binary search; decode the pack
     in a background isolate so the first search does not freeze the UI.
   - `flutter test test/offline_dict_test.dart` must pass; add cases for RU
     coverage (e.g. «вынужденный» → forçado, «рекомендация» → recomendação).
   - Do not bump the version or build release binaries — iOS/Android builds are
     made locally.

## Done means

A short report in the PR: coverage before/after per layer and rank band, D1
rows read, number of glosses rewritten and rejected by the gate with examples,
pack sizes, search timings before/after.
