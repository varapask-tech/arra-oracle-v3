#!/usr/bin/env bash
# Oracle Remote Worker — polls GitHub Issues for tasks and executes via Claude CLI.
# Designed for a secondary machine (e.g. MacBook) that runs as a headless worker.
#
# Usage:
#   ./scripts/remote-worker.sh              # run forever (daemon mode)
#   ./scripts/remote-worker.sh --once       # process one task then exit
#   ./scripts/remote-worker.sh --dry-run    # show what would be picked up
set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
REPO="${ORACLE_WORKER_REPO:-varapask-tech/arra-oracle-v3}"
WORKER_NAME="${ORACLE_WORKER_NAME:-macbook}"
POLL_INTERVAL="${ORACLE_POLL_INTERVAL:-30}"
LABEL_QUEUE="remote-task"
LABEL_WORKER="worker:${WORKER_NAME}"
LABEL_PROGRESS="status:in-progress"
LABEL_DONE="status:completed"
LABEL_FAILED="status:failed"
LOG_DIR="${HOME}/.oracle/worker"
LOG_FILE="${LOG_DIR}/worker.log"
PID_FILE="${LOG_DIR}/worker.pid"
MAX_TASK_MINUTES="${ORACLE_MAX_TASK_MINUTES:-30}"

# ── Helpers ─────────────────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"

log() {
  local ts
  ts="$(date '+%F %T')"
  echo "[$ts] $*" | tee -a "$LOG_FILE"
}

die() { log "FATAL: $*"; exit 1; }

check_deps() {
  command -v gh   >/dev/null 2>&1 || die "gh CLI not found"
  command -v claude >/dev/null 2>&1 || die "claude CLI not found"
  gh auth status >/dev/null 2>&1 || die "gh not authenticated — run 'gh auth login'"
}

cleanup() {
  log "Shutting down worker (pid $$)…"
  rm -f "$PID_FILE"
  exit 0
}

# ── Label management ────────────────────────────────────────────────────────
ensure_labels() {
  local labels=("$LABEL_QUEUE" "$LABEL_WORKER" "$LABEL_PROGRESS" "$LABEL_DONE" "$LABEL_FAILED")
  local colors=("0e8a16"      "1d76db"       "fbca04"          "6f42c1"      "d73a4a")
  for i in "${!labels[@]}"; do
    gh label create "${labels[$i]}" \
      --repo "$REPO" \
      --color "${colors[$i]}" \
      --force 2>/dev/null || true
  done
}

# ── Core: find → claim → execute → report ──────────────────────────────────
find_next_issue_number() {
  gh issue list \
    --repo "$REPO" \
    --label "$LABEL_QUEUE,$LABEL_WORKER" \
    --state open \
    --limit 1 \
    --json number \
    --jq '.[0].number // empty'
}

get_issue_field() {
  local issue_num="$1" field="$2"
  gh issue view "$issue_num" \
    --repo "$REPO" \
    --json "$field" \
    --jq ".$field"
}

claim_task() {
  local issue_num="$1"
  gh issue edit "$issue_num" \
    --repo "$REPO" \
    --add-label "$LABEL_PROGRESS" \
    --remove-label "$LABEL_QUEUE"
  log "Claimed #${issue_num}"
}

execute_task() {
  local issue_num="$1"
  local title="$2"
  local body="$3"
  local result_file="${LOG_DIR}/result-${issue_num}.md"
  local prompt

  prompt="$(cat <<EOF
You are a remote worker executing a task dispatched by Mr.0 Oracle.
Complete the following task and report your results concisely.

## Task #${issue_num}: ${title}

${body}

## Instructions
- Execute the task fully.
- Report what you did and the outcome.
- If you encounter errors, report them clearly.
EOF
)"

  log "Executing #${issue_num}: ${title}"

  if timeout "${MAX_TASK_MINUTES}m" claude -p "$prompt" > "$result_file" 2>&1; then
    log "Task #${issue_num} completed successfully"
    return 0
  else
    local exit_code=$?
    log "Task #${issue_num} failed (exit code ${exit_code})"
    return 1
  fi
}

report_result() {
  local issue_num="$1"
  local success="$2"
  local result_file="${LOG_DIR}/result-${issue_num}.md"
  local comment_body
  local final_label

  if [ "$success" = "0" ]; then
    final_label="$LABEL_DONE"
    comment_body="$(cat <<EOF
## Worker Result — ${WORKER_NAME}

$(head -c 60000 "$result_file")

---
*Completed by \`${WORKER_NAME}\` at $(date '+%F %T %Z')*
EOF
)"
  else
    final_label="$LABEL_FAILED"
    comment_body="$(cat <<EOF
## Worker Failed — ${WORKER_NAME}

$(tail -50 "$result_file")

---
*Failed on \`${WORKER_NAME}\` at $(date '+%F %T %Z') — exit code ${success}*
EOF
)"
  fi

  gh issue comment "$issue_num" \
    --repo "$REPO" \
    --body "$comment_body"

  gh issue edit "$issue_num" \
    --repo "$REPO" \
    --add-label "$final_label" \
    --remove-label "$LABEL_PROGRESS"

  if [ "$success" = "0" ]; then
    gh issue close "$issue_num" --repo "$REPO"
  fi

  log "Reported result for #${issue_num} (${final_label})"
}

process_one() {
  local issue_num
  issue_num="$(find_next_issue_number)"

  if [ -z "$issue_num" ]; then
    return 1
  fi

  local title body
  title="$(get_issue_field "$issue_num" title)"
  body="$(get_issue_field "$issue_num" body)"

  claim_task "$issue_num"

  local exit_code=0
  execute_task "$issue_num" "$title" "$body" || exit_code=$?

  report_result "$issue_num" "$exit_code"
  return 0
}

# ── Main ────────────────────────────────────────────────────────────────────
main() {
  local mode="${1:-daemon}"

  check_deps

  case "$mode" in
    --dry-run)
      log "Dry run — checking for tasks…"
      local issue_num
      issue_num="$(find_next_issue_number)"
      if [ -z "$issue_num" ]; then
        log "No tasks in queue"
      else
        log "Found task #${issue_num}"
        gh issue view "$issue_num" --repo "$REPO"
      fi
      exit 0
      ;;
    --once)
      log "Single-run mode"
      ensure_labels
      if process_one; then
        log "Task processed"
      else
        log "No tasks found"
      fi
      exit 0
      ;;
    *)
      # Daemon mode
      if [ -f "$PID_FILE" ]; then
        local old_pid
        old_pid="$(cat "$PID_FILE")"
        if kill -0 "$old_pid" 2>/dev/null; then
          die "Worker already running (pid ${old_pid}). Remove ${PID_FILE} to override."
        fi
      fi

      echo $$ > "$PID_FILE"
      trap cleanup SIGTERM SIGINT

      log "Worker '${WORKER_NAME}' starting (pid $$, poll every ${POLL_INTERVAL}s)"
      log "Repo: ${REPO}"
      log "Watching: label=${LABEL_QUEUE} + label=${LABEL_WORKER}"

      ensure_labels

      local idle_count=0
      while true; do
        if process_one; then
          idle_count=0
        else
          idle_count=$((idle_count + 1))
          if [ $((idle_count % 20)) -eq 0 ]; then
            log "Idle (${idle_count} polls, ~$((idle_count * POLL_INTERVAL / 60))min)"
          fi
        fi
        sleep "$POLL_INTERVAL"
      done
      ;;
  esac
}

main "$@"
