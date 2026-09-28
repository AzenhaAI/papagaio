# Dictionary parity — steps left for a local machine

The cloud session edited D1 and built the packs; these steps need `gh`,
`wrangler deploy` or Flutter, which the cloud session may not run.

## 1. Publish the packs as release `packs-v2`

`packs/` on branch `claude/cloud-dictionary-parity-pilot-m0g5pz` holds
`pt.json.gz`, `en.json.gz`, `ru_forms.json.gz`, `manifest.json`, `coverage.json`.
The examples pack did not change; copy it over from v1 so the v2 release is
complete (the app offers it, and the proxy will only look in v2).

```sh
git fetch origin claude/cloud-dictionary-parity-pilot-m0g5pz
git checkout claude/cloud-dictionary-parity-pilot-m0g5pz
gh release download packs-v1 --repo AzenhaAI/papagaio -p examples.json.gz -D /tmp/packs-v1
gh release create packs-v2 --repo AzenhaAI/papagaio --title "Offline packs v2" \
  --notes "Built from D1 by scripts/export_packs_d1.mjs; see packs/coverage.json" \
  packs/pt.json.gz packs/en.json.gz packs/ru_forms.json.gz packs/manifest.json \
  /tmp/packs-v1/examples.json.gz
```

## 2. Point the Worker at v2 and deploy — only after step 1

The branch already changes `src/api.js` (`/packs/*` proxy): the cache key and
the release URL now say `v2`. Deploying before the release exists breaks pack
downloads, so the order matters.

```sh
curl -sI https://github.com/AzenhaAI/papagaio/releases/download/packs-v2/pt.json.gz | head -1   # expect 302
npx wrangler deploy
curl -s https://azenha.ai/packs/manifest.json   # expect "version": 2
```

## 3. The app (`papagaio-app`)

- Replace `assets/packs/pt.json.gz` with `packs/pt.json.gz` (6.1 MB instead of 4.0).
- In `lib/data/offline_dict.dart`, update the `packs` list:
  `('pt', …, 110133, 6.1)`, `('en', …, 31424, 2.8)`, `('ru_forms', …, 464478, 2.0)`.
- Existing installs never receive a new bundled pack: `seedBundled()` runs once
  (the `pt.seeded` marker) and is skipped when `pt` is installed. Make the
  marker a version: re-seed when the marker does not read `2`, overwriting
  `pt.json.gz`, and write `2`. Users who downloaded `pt` from the network get
  v2 the same way, since the bundled file is the v2 pack.
- `flutter test test/offline_dict_test.dart`, then build iOS/Android as usual.

## 4. Nightly gloss runs

Nothing ran through Workers AI on 25–27 September (14, 3 and 36 requests a
day), so the nightly batches look stopped. They are started from this
machine, not from the cloud: check `crontab -l` / `launchctl list | grep -i papagaio`
and the dates of the files in `build/`.

Before turning them back on:
- Never let them overwrite edited rows: add
  `AND id NOT IN (SELECT card_id FROM gloss_history WHERE run LIKE 'parity-%')`
  to the queue queries (`scripts/gen_need_lists.mjs` and the `gen_*` scripts).
- Pass every Russian gloss through `cleanRu()` and reject it when `flagRu()`
  returns anything (`scripts/lib/ru_clean.mjs`): that alone stops stress marks,
  repeats, Latin/Cyrillic mixes, bare `;` and truncated text.

## 5. The rest of the mechanical Russian clean-up

About 12,000 low-frequency rows are left (stress marks, exact repeats). The
cloud session is scheduled to write them on 2026-09-29. If that did not
happen: `node scripts/export_packs_d1.mjs --fresh && node scripts/clean_ru_d1.mjs --limit 12200`
(one run per day; D1's free tier allows ~100k rows written per day).

## Rolling back

Every change is in `gloss_history` with its old value. Undo a whole run with
`node scripts/parity_writeback.mjs --rollback <run>`; the runs are
`parity-pilot-2026-09-27`, `parity-top-0-2000`, `parity-lean-2k-10k`,
`parity-ru-redo-4`, `parity-ru-redo-1`, `parity-lean-10k-20k`, `parity-fill-top20k` and
`ru-mechanical-2026-09`.
