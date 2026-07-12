#!/bin/bash
# Install Oracle Remote Worker as macOS LaunchAgent
# Worker polls GitHub Issues for remote tasks and executes via Claude CLI.
#
# Prerequisites:
#   1. gh auth login
#   2. claude login
#   3. Clone this repo to ~/ghq/github.com/Soul-Brews-Studio/arra-oracle-v3
set -e

PLIST_NAME="com.oracle.worker.plist"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_SRC="$SCRIPT_DIR/$PLIST_NAME"
PLIST_DST="$HOME/Library/LaunchAgents/$PLIST_NAME"
WORKER_SCRIPT="$SCRIPT_DIR/remote-worker.sh"
LOG_DIR="$HOME/.oracle/worker"

echo "Oracle Remote Worker — LaunchAgent Installer"
echo "============================================="
echo ""

# ── Preflight checks ───────────────────────────────────────────────────────
if [ ! -f "$PLIST_SRC" ]; then
  echo "ERROR: $PLIST_SRC not found"
  exit 1
fi

if [ ! -x "$WORKER_SCRIPT" ]; then
  echo "ERROR: $WORKER_SCRIPT not executable. Run: chmod +x $WORKER_SCRIPT"
  exit 1
fi

command -v gh >/dev/null 2>&1    || { echo "ERROR: gh CLI not installed"; exit 1; }
command -v claude >/dev/null 2>&1 || { echo "ERROR: claude CLI not installed"; exit 1; }
gh auth status >/dev/null 2>&1   || { echo "ERROR: gh not authenticated — run 'gh auth login'"; exit 1; }

echo "[ok] gh CLI authenticated"
echo "[ok] claude CLI found"

# ── Prepare directories ────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"
mkdir -p "$HOME/Library/LaunchAgents"
echo "[ok] Log directory: $LOG_DIR"

# ── Fix paths in plist ─────────────────────────────────────────────────────
TEMP_PLIST="$(mktemp)"
sed \
  -e "s|/Users/junior|$HOME|g" \
  -e "s|\$HOME|$HOME|g" \
  "$PLIST_SRC" > "$TEMP_PLIST"

# Redirect logs to persistent location
sed -i '' \
  -e "s|/tmp/oracle-worker.log|$LOG_DIR/worker-stdout.log|g" \
  -e "s|/tmp/oracle-worker.error.log|$LOG_DIR/worker-stderr.log|g" \
  "$TEMP_PLIST"

echo "[ok] Paths resolved for $HOME"

# ── Stop existing service ──────────────────────────────────────────────────
if launchctl list 2>/dev/null | grep -q "com.oracle.worker"; then
  echo "  -> Stopping existing worker..."
  launchctl unload "$PLIST_DST" 2>/dev/null || true
fi

# ── Install ─────────────────────────────────────────────────────────────────
cp "$TEMP_PLIST" "$PLIST_DST"
rm -f "$TEMP_PLIST"
echo "[ok] Installed: $PLIST_DST"

launchctl load "$PLIST_DST"
echo "[ok] Service loaded"

# ── Verify ──────────────────────────────────────────────────────────────────
sleep 2
if launchctl list 2>/dev/null | grep -q "com.oracle.worker"; then
  echo ""
  echo "Oracle Remote Worker is running!"
  echo ""
  echo "  Worker: ${ORACLE_WORKER_NAME:-macbook}"
  echo "  Repo:   ${ORACLE_WORKER_REPO:-Soul-Brews-Studio/arra-oracle-v3}"
  echo "  Poll:   every ${ORACLE_POLL_INTERVAL:-30}s"
  echo "  Logs:   $LOG_DIR/"
  echo ""
  echo "Commands:"
  echo "  Stop:    launchctl unload ~/Library/LaunchAgents/$PLIST_NAME"
  echo "  Start:   launchctl load ~/Library/LaunchAgents/$PLIST_NAME"
  echo "  Status:  launchctl list | grep oracle.worker"
  echo "  Logs:    tail -f $LOG_DIR/worker.log"
  echo "  Dry run: $WORKER_SCRIPT --dry-run"
else
  echo ""
  echo "WARNING: Service may not have started. Check:"
  echo "  tail -f $LOG_DIR/worker-stderr.log"
fi
