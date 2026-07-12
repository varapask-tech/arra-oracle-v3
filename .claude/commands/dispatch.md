---
description: "Dispatch a task to a remote worker (MacBook) via GitHub Issues"
allowed-tools:
  - Bash
  - Read
---

# /dispatch — Send Task to Remote Worker

Create a GitHub Issue with the right labels for a remote worker to pick up automatically.

## Usage

`/dispatch <task description>`
`/dispatch --to <worker-name> <task description>`

Default worker: `macbook`

## Action

1. **Parse arguments**:
   - Extract `--to <name>` if provided (default: `macbook`)
   - Everything else is the task description

2. **Create the issue**:

```bash
gh issue create \
  --repo varapask-tech/arra-oracle-v3 \
  --title "remote: <short summary of task>" \
  --label "remote-task,worker:<worker-name>" \
  --body "$(cat <<'ISSUE_EOF'
## Remote Task

<full task description from user>

## Context

- Dispatched by: Mr.0 Oracle
- Target worker: <worker-name>
- Dispatched at: <timestamp>

## Instructions

The remote worker will execute this via Claude CLI.
Results will be posted as a comment when complete.
ISSUE_EOF
)"
```

3. **Confirm**:

```
📡 Task dispatched → #<issue-number>
   Worker: <worker-name>
   Task: <summary>
   Track: gh issue view <number> --repo varapask-tech/arra-oracle-v3
```

## Notes

- Worker polls every 30s — task should be picked up within a minute
- Monitor: `gh issue list --repo varapask-tech/arra-oracle-v3 --label remote-task`
- Labels: `remote-task` (queue), `worker:<name>` (routing), `status:*` (lifecycle)

## Arguments

$ARGUMENTS
