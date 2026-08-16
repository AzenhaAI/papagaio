#!/bin/bash
# One-shot: move the repos under an organisation and re-point everything that
# names them.
#
# Why: the product publishes as Azenha AI, and a personal handle was readable
# in three places at once — the site footer, the download buttons, and the
# release URLs the Worker proxies. The account name is not part of the product.
#
# GitHub keeps redirecting the old path after a transfer, so nothing breaks the
# moment this runs; the rewrites below are so nothing keeps *relying* on the
# redirect.
#
# Usage:  ./scripts/migrate_org.sh azenha-ai
# Needs:  the organisation to exist already (creating one is web-only), and
#         `gh auth status` to show admin rights on both repos.
set -euo pipefail

ORG="${1:?usage: migrate_org.sh <org-login>}"
OLD="kirshp"
PROJECTS="$HOME/Projects"

gh api "/orgs/$ORG" >/dev/null 2>&1 || {
  echo "no organisation '$ORG' — create it first at github.com/organizations/plan" >&2
  exit 1
}

for repo in papagaio papagaio-app; do
  if gh api "/repos/$ORG/$repo" >/dev/null 2>&1; then
    echo "== $repo already under $ORG"
  else
    echo "== transferring $OLD/$repo -> $ORG"
    gh api -X POST "/repos/$OLD/$repo/transfer" -f "new_owner=$ORG" >/dev/null
    # The transfer is asynchronous; wait for the new path to answer.
    for _ in $(seq 1 30); do
      gh api "/repos/$ORG/$repo" >/dev/null 2>&1 && break
      sleep 2
    done
  fi
done

echo "== rewriting references"
# Worker (release origins), site (footer, drawer, about), scripts, CI workflow.
grep -rl "$OLD/papagaio" \
  "$PROJECTS/papagaio/src" "$PROJECTS/papagaio/site/src" \
  "$PROJECTS/papagaio/scripts" "$PROJECTS/papagaio/README.md" \
  "$PROJECTS/papagaio_app/.github" 2>/dev/null |
  while read -r f; do
    sed -i '' "s|$OLD/papagaio|$ORG/papagaio|g" "$f"
    echo "   $f"
  done

echo "== pointing local remotes at the new path"
for d in papagaio papagaio_app; do
  cd "$PROJECTS/$d"
  url=$(git remote get-url origin)
  git remote set-url origin "${url/$OLD\//$ORG/}"
  echo "   $d -> $(git remote get-url origin)"
done

cat <<'NEXT'

Done. Still to do by hand:
  1. cd ~/Projects/papagaio && npx wrangler deploy      (proxy origins changed)
  2. rebuild + deploy the site                          (footer/about links)
  3. commit both repos
  4. check the Actions secret RELEASE_TOKEN survived the transfer
NEXT
