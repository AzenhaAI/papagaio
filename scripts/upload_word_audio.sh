#!/bin/bash
# Uploads build/word_audio/*.mp3 (scripts/gen_word_audio.mjs) to the R2 bucket
# papagaio-audio, served at https://audio.azenha.ai/, eight at a time.
#
# build/word_audio/uploaded.txt lists every file confirmed in the bucket; the
# word page export shows a recorded 🔊 only for those, so a page never points
# at a file that failed to upload. Files already listed are skipped.
# Objects are served as immutable for a year: a corrected recording needs a new
# file name, or FORCE=1 here plus a cache purge.
# Exit status 1 when any upload failed.
# Run from anywhere: bash scripts/upload_word_audio.sh
set -u
cd "$(dirname "$0")/../build/word_audio" || exit 1
touch uploaded.txt
tmp=$(mktemp -d) || exit 1
ls *.mp3 | sort > "$tmp/all"; sort -u uploaded.txt > "$tmp/done"
if [ "${FORCE:-0}" = 1 ]; then cp "$tmp/all" "$tmp/todo"; else comm -23 "$tmp/all" "$tmp/done" > "$tmp/todo"; fi
echo "$(wc -l < "$tmp/todo") to upload"
# The file name goes in as $1, not through -I: BSD xargs caps an -I command
# at 255 bytes and refuses the whole run ("command line cannot be assembled").
xargs -P 8 -n 1 sh -c '
  npx wrangler r2 object put "papagaio-audio/$1" --file "$1" \
    --content-type audio/mpeg --cache-control "public, max-age=31536000, immutable" --remote >/dev/null 2>&1 \
    && echo "$1" >> uploaded.txt || echo "FAILED $1" >&2' _ < "$tmp/todo" 2> upload_failed.txt
xs=$?
rm -rf "$tmp"
n=$(grep -c FAILED upload_failed.txt)
echo "uploaded total: $(sort -u uploaded.txt | wc -l), failed this run: $n, xargs status $xs"
[ "$xs" = 0 ] || { cat upload_failed.txt >&2; exit 1; }
[ "$n" = 0 ]
