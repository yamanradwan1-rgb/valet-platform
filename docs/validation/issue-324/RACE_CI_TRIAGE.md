# VAYLET #324 — `postgres-api-race` CI failure triage

Date: 2026-10-23. Scope: read-only source analysis of the #319 test harness and #324 candidate; no runtime, database, test, or workflow edits.

## Finding

At CI run `40014019769`, the reported `postgres-api-race` lane finished after about 21 minutes with 231 passing tests / 1,398 passing assertions, while seven #319 suites reported `Issue319 requires its explicitly owned private cluster.` These counts and timing are supplied by the run handoff; the private GitHub job log was not available to this worker, so individual stack traces and timestamps were not independently retrieved.

The failure has a direct source-level explanation. `apps/api/test/dashboard-issue319-lab.ts:19-30` defines `startLab()` and deliberately rejects `process.env.CI === 'true'`, or any missing `ISSUE319_EPHEMERAL_PG=I_OWN_THIS_CLUSTER`, wrong owner/database/port, mismatched migration URL, or unrecognized private data directory. The subsequent live PostgreSQL identity and nonprivileged runtime-role checks are also mandatory (`:32-52`). The failing files call `beforeAll(startLab, 180_000)`: the error is a guarded suite setup failure, **not evidence that #324 changed authorization behavior or that any of these tests reached their assertions**. Calling this an import failure describes the lane's reported outcome, but the throw site is in `beforeAll`, not in module parsing.

`scripts/test-harness/test-classification.mjs:16-19,120-129` assigns DB-backed, race-signaling files to `api-postgres-race`; `apps/api/vitest.config.mjs:28-44,60` includes them in the project. The exact seven #319 suite names classified there on original `main` (`2bee94f2`) are:

- `dashboard-issue319-adjacent-remediation-races.integration.test.ts`
- `dashboard-issue319-ca-mfa-rr-regression.integration.test.ts`
- `dashboard-issue319-extension-locks.integration.test.ts`
- `dashboard-issue319-final-retry-cleanup.integration.test.ts`
- `dashboard-issue319-lifecycle.integration.test.ts`
- `dashboard-issue319-physical-lease.integration.test.ts`
- `dashboard-issue319-remediation-races.integration.test.ts`

`.github/workflows/ci.yml` runs `api-postgres-race` on `ubuntu-latest` against a disposable service `postgres:17-alpine` with `valet:valet@localhost:5432/valet`, under GitHub Actions' CI environment. That service is separate from the #319 Windows `run-lab.ps1` path, which starts an independently owned loopback PostgreSQL 17 cluster under `tmp/issue-315-pg-qa/issue319-<unique-id>/.issue315-private-cluster` and provides all explicit attestation variables (`docs/validation/issue-319/run-lab.ps1:8-45`). Even if other CI PostgreSQL harness checks pass, they cannot establish the stricter #319 private-cluster identity. In particular, `CI=true` independently blocks the #319 lab.

The #319 harness, #319 runner, `apps/api/vitest.config.mjs`, and `.github/workflows/ci.yml` at candidate `87f1085e` match merged `main` for these paths. The error is therefore an **inherited test-environment incompatibility exposed by suite discovery**, not an identified #324 code regression. Prior #319 local acceptance recorded `89/89` tests from 20 suites in its attested private lab (`docs/validation/issue-319/remediation/FINAL_MERGE_ACCEPTANCE.md:26-41`); that is historical local evidence, not a pass for the current CI lane.

## Acceptance handling

1. Keep the #319 identity guard fail-closed. Do not spoof `CI`, inject flag values into the shared CI database, change URLs to impersonate the private cluster, skip/exclude the seven suites, relax ownership, or increase timeouts to camouflage this deterministic failure.
2. Record the lane as **failing** and its seven #319 suite setup errors as **baseline-inherited** in the #324 comparison. Continue focused #324 tests and final diff review separately; do not infer #324 success or failure from the #319 environment error.
3. A green CI gate for these tests requires a separately reviewed, owner-authorized runner/attestation design that actually creates and verifies a disposable private cluster in CI. The current #319 guard expressly denies any `CI=true` run, so safely enabling that path is a distinct #319/test-infrastructure decision and implementation, outside this triage's permitted edits. Preserve required `postgres`/`quality` gating while it is unresolved. Any decision to alter required checks must come explicitly from the owner and cannot be represented as test success.

No #319 suite, fixture, timeout, workflow, production source, migration, or database was changed or executed by this investigation.
