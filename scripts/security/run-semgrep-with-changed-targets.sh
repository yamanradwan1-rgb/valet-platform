#!/usr/bin/env bash
# Explicit changed files defeat Semgrep's directory-discovery exclusions for
# .github and test/ while retaining the normal scoped scan and baseline gate.
set -euo pipefail

if [[ "$#" -ne 1 || ! "$1" =~ ^[0-9a-f]{40}([0-9a-f]{24})?$ ]]; then
  echo "Semgrep comparison base is missing or invalid" >&2
  exit 2
fi

targets_file="$(mktemp)"
trap 'rm -f "$targets_file"' EXIT
# A failing git diff or invalid target MUST fail this command. Do not use
# process substitution: mapfile would otherwise hide the producer's failure.
python3 scripts/security/semgrep_coverage.py --changed-targets "$1" > "$targets_file"
mapfile -d '' -t changed_targets < "$targets_file"

semgrep scan --config p/security-audit --config p/owasp-top-ten \
  --metrics=off --disable-version-check --json \
  --output security-reports/semgrep-head.json \
  --exclude '**/node_modules/**' --exclude '**/dist/**' \
  --exclude '**/.next/**' "--baseline-commit=$1" \
  apps packages scripts infra .github "${changed_targets[@]}"
