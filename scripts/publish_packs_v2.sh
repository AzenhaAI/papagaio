#!/usr/bin/env bash
# One-shot publish of the parity work (run from the repo root, on this branch):
# release packs-v2 → check it is served → deploy the Worker → check the live
# manifest → merge this branch into main so later deploys keep pointing at v2.
set -euo pipefail
REPO=AzenhaAI/papagaio
BRANCH=$(git rev-parse --abbrev-ref HEAD)
tmp=$(mktemp -d)
gh release download packs-v1 --repo "$REPO" -p examples.json.gz -D "$tmp"
gh release create packs-v2 --repo "$REPO" --title "Offline packs v2" \
  --notes "Built from D1 by scripts/export_packs_d1.mjs; coverage in packs/coverage.json" \
  packs/pt.json.gz packs/en.json.gz packs/ru_forms.json.gz packs/manifest.json "$tmp/examples.json.gz"
code=$(curl -s -o /dev/null -w '%{http_code}' "https://github.com/$REPO/releases/download/packs-v2/pt.json.gz")
[[ "$code" == 302 || "$code" == 200 ]] || { echo "release not served yet (HTTP $code) — not deploying"; exit 1; }
npx wrangler deploy
curl -s https://azenha.ai/packs/manifest.json | grep -q '"version": 2' && echo "live: packs v2" || echo "WARNING: manifest is not v2 yet (edge cache?) — recheck in a few minutes"
git checkout main && git pull --ff-only && git merge --no-edit "$BRANCH" && git push
echo "done"
