# VAYLET Security CI policy

## Scope
The independent Security CI workflow runs on every branch push and PR. It invokes Gitleaks, Semgrep Community, Trivy, OSV-Scanner and CodeQL (JavaScript/TypeScript), plus an aggregate security-gate check. Existing CI and manual ZAP workflow are unchanged.

## Gates and baselines
- Gitleaks blocks any detected new secret. On a first push without a comparison commit, history is scanned. Raw secret strings must never be uploaded.
- Semgrep uses a comparison commit where available and blocks new ERROR (High) or explicitly High/Critical findings; failed parsing and zero scanned paths fail closed.
- Trivy compares dependency and IaC findings in base and head. New High/Critical findings and severity escalations block.
- OSV compares package/advisory IDs and installed versions. New High/Critical advisories block; unrated new advisories also block pending review.
- CodeQL must complete successfully and uploads analysis to GitHub Code Scanning on same-repository PRs and pushes. A successful CodeQL check **does not** assert that no alerts were found. Blocking merges on newly introduced CodeQL alerts additionally needs repository Code Scanning merge protection where available.

Without a usable base commit, baseline-aware scanners treat current findings as new. This can expose backlog on new branches but must not quietly mark an incomplete scan as clean.

## False positive / accepted risk process
No automatic allowlist or continue-on-error is used for the security gate. Any exception or tool-specific suppression requires a reviewed PR referencing a tracking issue, rule/advisory ID, relevant path, evidence for false positive or accepted risk, accountable owner, and review/expiry date. Suppressions must be narrowly scoped. A detected issue is a candidate finding, not proof of an exploitable vulnerability.

## Reports
Raw tool reports are kept on the ephemeral runner. Only sanitized metadata (ID, path, package, version, severity and counts) is uploaded as 7-day artifacts, alongside Actions job summaries. This is a public repository: assume logs and artifacts can be viewed publicly. Never publish credential excerpts.

## Heavy scans and branch rules
The existing manually triggered Security Audit retains ZAP passive and localhost active scans. Deep security review is a separate, human-guided process.

**Required repository setting:** configure a branch ruleset/protection requiring the exact check Security CI / security-gate on main, as well as existing CI / quality. Until configured, failed security checks are visible but do not necessarily prevent merge. Review optional GitHub Code Scanning merge protection separately.
