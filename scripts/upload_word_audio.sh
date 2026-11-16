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
ls *.mp3 | sort > /tmp/pg_all.$$ ; sort -u uploaded.txt > /tmp/pg_done.$$
if [ "${FORCE:-0}" = 1 ]; then cp /tmp/pg_all.$$ /tmp/pg_todo.$$; else comm -23 /tmp/pg_all.$$ /tmp/pg_done.$$ > /tmp/pg_todo.$$; fi
echo "$(wc -l < /tmp/pg_todo.$$) to upload"
xargs -P 8 -I{} sh -c '
  npx wrangler r2 object put "papagaio-audio/{}" --file "{}" \
    --content-type audio/mpeg --cache-control "public, max-age=31536000, immutable" --remote >/dev/null 2>&1 \
    && echo "{}" >> uploaded.txt || echo "FAILED {}" >&2' < /tmp/pg_todo.$$ 2> upload_failed.txt
rm -f /tmp/pg_all.$$ /tmp/pg_done.$$ /tmp/pg_todo.$$
n=$(grep -c FAILED upload_failed.txt)
echo "uploaded total: $(sort -u uploaded.txt | wc -l), failed this run: $n"
[ "$n" = 0 ]
