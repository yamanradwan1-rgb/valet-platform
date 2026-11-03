# Local, optional change-aware precheck — never a CI gate selector

Date: 2026-11-03
Source of truth: merge `f9ecebd9af85b44580771b4027515d06c0a31de4`; this experiment is on the local Test Audit branch only.

## Why it exists
The default workflow runs the full protected `unit`, PostgreSQL Standard/Compound/Race/Database/Issue215, Dashboard/Employee browser E2E, platform, static-build and aggregate quality jobs on every PR. That must stay in place until any replacement proves equivalent protection. However running every database suite locally for an isolated UI edit wastes engineering time and token budget.

The new `scripts/test-harness/local-precheck.mjs` **prints a deterministic recommendation only; it executes nothing, cannot skip a workflow, has no network or database access, and always reports that full PR CI remains required.**

Example:
```bash
node scripts/test-harness/local-precheck.mjs --base origin/main
```

It inspects committed differences (`origin/main...HEAD`), unstaged/staged differences and untracked files; changes in application-local `apps/dashboard/src`, `apps/customer/src`, `apps/valet/src`, and `apps/valet-native/src` yield package typecheck and focused `vitest run` for edited test source, or `vitest related --run` **plus** an explicit full package test recommendation for edited application source.

Shared packages (including `packages/employee-client`), API source, migrations, workflow, runner tooling, infrastructure and binding decisions **fail closed** to the root non-Postgres precheck and explicit protected PostgreSQL/browser gate reminder. More than two changed app packages, an unknown config, any deleted/renamed file, and ambiguous `.spec.*` or Node `.test.mjs` runner input also fail closed. Docs-only applies to text files **under `docs/`**, outside binding decisions, and still requires architecture and normal PR CI.

Warnings:
- `vitest related` sees static imports only; runtime dynamic imports can be missed. Package `test` should be run when low-risk changes require complete local confidence.
- "No local changes" never proves the current HEAD has passed required CI. The SHA must be verified separately.
- This does **not** calculate affected PostgreSQL cases or allow bypass of tenant/Location/MFA/payment/custody/audit/race/Issue215 gates.
- All commands are suggestions for a human developer; there is no auto-exec switch or commit/PR modification.
- The authoritative required GitHub workflow is unchanged.

## Gate evidence
The policy now has **eight** fail-closed Node tests: local Dashboard fast plan, exact test-file plan, protected/shared inputs, unknown/multi-app/untrusted paths, docs/empty input, executable documentation outside `docs/`, ambiguous runner types and deletion/rename/traversal negatives. These must pass before publication. The script may be used in local development only. Measure actual reduction in manual pre-push work on 20 comparable feature edits before calling it a time-saving solution.

Official documentation: https://v4.vitest.dev/guide/cli (related covers static imports, not runtime imports); https://pnpm.io/filtering (explicit package ownership); https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow (skipped required checks can block merges).
