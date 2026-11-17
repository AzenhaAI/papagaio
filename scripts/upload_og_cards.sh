#!/bin/bash
# Uploads build/og/*.png (site/scripts/og_cards.mjs) to the R2 bucket
# papagaio-audio under og/, served at https://audio.azenha.ai/og/<slug>.png,
# eight at a time. Same pattern as upload_word_audio.sh: build/og/uploaded.txt
# lists every card confirmed in the bucket, and a word page names its card as
# og:image only when it is listed there (site/src/lib/og.js), so a shared link
# never points at a missing picture. FORCE=1 re-uploads everything.
# Cards are cached for a day, not forever: a redrawn card keeps its name.
# Exit status 1 when any upload failed.
set -u
cd "$(dirname "$0")/../build/og" || exit 1
touch uploaded.txt
tmp=$(mktemp -d) || exit 1
ls *.png | sort > "$tmp/all"; sort -u uploaded.txt > "$tmp/done"
if [ "${FORCE:-0}" = 1 ]; then cp "$tmp/all" "$tmp/todo"; else comm -23 "$tmp/all" "$tmp/done" > "$tmp/todo"; fi
echo "$(wc -l < "$tmp/todo") to upload"
# File name as $1, not -I: BSD xargs caps an -I command at 255 bytes.
xargs -P 8 -n 1 sh -c '
  npx wrangler r2 object put "papagaio-audio/og/$1" --file "$1" \
    --content-type image/png --cache-control "public, max-age=86400" --remote >/dev/null 2>&1 \
    && echo "$1" >> uploaded.txt || echo "FAILED $1" >&2' _ < "$tmp/todo" 2> upload_failed.txt
xs=$?
rm -rf "$tmp"
n=$(grep -c FAILED upload_failed.txt)
echo "uploaded total: $(sort -u uploaded.txt | wc -l), failed this run: $n, xargs status $xs"
[ "$xs" = 0 ] || { cat upload_failed.txt >&2; exit 1; }
[ "$n" = 0 ]
