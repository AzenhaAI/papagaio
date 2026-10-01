#!/bin/bash
# Writes queued dictionary changes to D1, at most one day's worth per run.
#
# D1's free plan allows 100k written rows a day and parity_writeback.mjs costs
# about 4 per change (history row, update, and fold for English glosses), so
# a run takes queued files in name order until 20,000 changes — ~80k rows,
# leaving room for the app's own writes. Run daily by launchd
# (~/Library/LaunchAgents/ai.azenha.papagaio.drain.plist) shortly after the
# limit resets at 00:00 UTC.
#
# Queue: build/parity/write_queue/NN__<run-tag>__<count>.json, the
# parity_writeback changes format. A written file moves to done/; a failed one
# stays and is retried the next night — every UPDATE is guarded on the value
# it replaces, so a repeat never writes twice. An empty queue does nothing.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
QUEUE="$ROOT/build/parity/write_queue"
BUDGET=20000
export PATH=/opt/homebrew/bin:/usr/bin:/bin

cd "$ROOT" || exit 1
mkdir -p "$QUEUE/done"
echo "== $(date -u '+%Y-%m-%d %H:%M UTC') drain start"

used=0
for f in "$QUEUE"/[0-9]*__*__*.json; do
  [ -e "$f" ] || { echo "queue empty"; break; }
  name=$(basename "$f" .json)
  tag=$(echo "$name" | awk -F'__' '{print $2}')
  count=$(echo "$name" | awk -F'__' '{print $3}')
  if [ $((used + count)) -gt "$BUDGET" ]; then
    echo "budget reached ($used written); $name waits for tomorrow"
    break
  fi
  echo "-- $name ($count changes, run $tag)"
  node scripts/parity_writeback.mjs "$f" "$tag" > "$QUEUE/last.log" 2>&1
  status=$?
  grep -v '^\s*at ' "$QUEUE/last.log" | tail -3
  if [ "$status" -eq 0 ]; then
    mv "$f" "$QUEUE/done/"
    used=$((used + count))
  else
    echo "!! $name failed (exit $status); stays in the queue"
    break
  fi
done
echo "== drain end: $used changes this run"
