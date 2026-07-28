#!/usr/bin/env bash
# Stores the bot token in Worker secrets and sets the Telegram webhook.
# The token is entered interactively and never written anywhere.
set -euo pipefail
cd "$(dirname "$0")/.."

read -rsp "BotFather token: " TG_TOKEN; echo
WORKER_URL="${1:-https://papagaio.kirshp.workers.dev}"

SECRET=$(openssl rand -hex 16)

printf '%s' "$TG_TOKEN" | npx wrangler secret put TG_TOKEN
printf '%s' "$SECRET"   | npx wrangler secret put WEBHOOK_SECRET

curl -s "https://api.telegram.org/bot${TG_TOKEN}/setWebhook" \
  -d "url=${WORKER_URL}/tg/${SECRET}" \
  -d "drop_pending_updates=true"
echo
echo "Webhook set: ${WORKER_URL}/tg/***"
