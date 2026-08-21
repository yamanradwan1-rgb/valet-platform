#!/usr/bin/env bash
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERROR: not inside a Git working tree" >&2
  exit 2
fi

root="$(git rev-parse --show-toplevel)"
branch="$(git branch --show-current)"

echo "repository: $root"
echo "branch: ${branch:-DETACHED}"
echo "status:"
git status --short

echo "recent commits:"
git log -8 --oneline

if [[ -z "$branch" || "$branch" == "main" || "$branch" == "master" ]]; then
  echo "ERROR: implementation must not run directly on ${branch:-detached HEAD}" >&2
  exit 1
fi

required=(
  AGENTS.md
  docs/00_SOURCE_OF_TRUTH.md
  docs/07_DEFINITION_OF_DONE.md
  docs/08_DECISIONS_LOG.md
  docs/17_AGENT_CODE_STRUCTURE_RULES.md
)

for file in "${required[@]}"; do
  if [[ ! -f "$root/$file" ]]; then
    echo "ERROR: required project contract missing: $file" >&2
    exit 1
  fi
done

echo "preflight: PASS (read-only checks only)"
