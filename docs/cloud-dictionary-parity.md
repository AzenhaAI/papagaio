# Cloud task: the dictionary, Russian at parity

Brief for a Claude Code cloud session on `AzenhaAI/papagaio` (and, for part 4,
`AzenhaAI/papagaio-app`). Written 2026-09-27 from measurements, not guesses.

## Why

The app's bundled dictionary (`papagaio-app/assets/packs/pt.json.gz`,
101,509 entries, built 2026-09-03) has an English gloss on 63% of entries and a
Russian one on **13%**. Of the 5,000 most frequent words, 2,175 have no Russian.
The server already knows far more: 13 of 13 sampled frequent words that lack
Russian in the pack came back from `/api/lookup` with a Russian gloss. The
nightly gloss runs write to D1; nothing carries them into the pack.

Consequences today: offline Russian→Portuguese search only reaches ~13.6k words,
and "meanings in RU" falls back to English for most entries.

The Russian layer also has quality defects that must not be shipped wider:

| word | Russian now | problem |
|---|---|---|
| forçado | ви́лы | that is *forcado*; *forçado* = вынужденный |
| monitor (deck) | следить за кем-либо | verb gloss on a noun |
| totalmente | полностью; полностью согласен; полностью уверен | padding |
| choque | удар; внезапный и резкий | adjective mixed into a noun |

## Goal

Russian coverage and quality level with Portuguese and English, in the pack and
on the server, for all three directions (PT→RU, RU→PT, EN↔RU where the English
lexicon has it).

Targets: RU gloss on ≥ 95% of the top 20,000 by rank and ≥ 60% of the whole
pack; every RU gloss passes the quality gate below.

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
2. **Fill and fix Russian.** For entries missing RU (by rank, most frequent
   first) generate candidates; run the gate over new *and* existing RU glosses
   in the top 20k; write passing ones back to D1 with history. Also the reverse
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
