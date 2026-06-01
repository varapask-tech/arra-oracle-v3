#!/usr/bin/env bash
# Idempotent guard for the Mr.0 Oracle dashboard/HTTP server (port 47778).
# Calls `bun run server:ensure` which only starts the server if it is not
# already running (pid-file + health check), so this is safe to run on a
# */5 cron + @reboot without ever spawning a duplicate.
#
# Mirrors Ms.2's ensure-dashboard.sh pattern for the 1412 family.
set -euo pipefail

export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"
REPO="/home/junior/ghq/github.com/Soul-Brews-Studio/arra-oracle-v3"
LOG="$HOME/.claude/channels/discord-mr0/dashboard-server.log"

cd "$REPO"
echo "[$(date '+%F %T')] ensure-server-cron: checking…" >> "$LOG"
bun run server:ensure >> "$LOG" 2>&1
