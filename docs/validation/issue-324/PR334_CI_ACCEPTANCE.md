# PR #334 — CI Baseline Comparison and Focused Acceptance (2026-10-23)

**Review base:** main `2bee94f200677176368e14edc64928c779c884fe`.
**Candidate branch:** `security/issue-324-prime`; record the pushed HEAD SHA after all commits.
**Original PR CI run inspected:** GitHub Actions run `40014019769`.
**Status:** **CONDITIONAL / NOT MERGE-APPROVED.** No production deploy or main merge.

## Proven CI root causes and scoped corrections

| CI lane | Observed failure in run 40014019769 | Main/issue baseline evidence | Scoped fix or disposition |
| --- | --- | --- | --- |
| `unit` | Test-harness expected exactly 41 direct/provision DB tests; discovery reports 42 direct and 43 provision | Baseline main `node --test scripts/test-harness/classification.test.mjs` reproduced `42 !== 41` | Updated exact ownership counts **with new named fixture-membership assertions**, retaining one-owner security checks. Current local harness 39/39 PASS |
| `postgres-database` | Five historical tests compared complete 102-migration directory list to stale 97-migration manifest | Reproduced **5/5 RED** against baseline main on disposable local Postgres17 | Added accepted append-only migrations 98–102 to expected manifest. **5/5 GREEN** on same isolated PG17; no SQL migration edited |
| `postgres-issue215` | `issue309-photo-db-blocker-proof.test.ts` expected approved new view-budget scope to be absent, but accepted guarded migration 98 now allows it | Source-level direct conflict confirmed by independent W10 review | Corrected runtime assertion: allow approved scope, reject unknown scope with SQLSTATE 23514 and preserve 42501 `FOR SHARE` privilege checks. **Live attested Issue215 suite NOT RERUN**; W10 scoped source GO only |
| `platform-windows-latest` | Process/PID sampling unit exceeded expected Windows PowerShell startup bound | Source test directly executed native `Get-Process` for synthetic negative PID | Replaced portable PID contract check with injected deterministic reader while retaining a dedicated bounded native Windows integration. Windows focused suite 16/16 PASS |
| `employee-e2e` | Five flows stalled after login waiting for Tasks; signed-in UI remained at `Loading operational context...` | Prime reproduced in a task-owned local PG17/API/Next fixture | React StrictMode controller lifecycle reattachment fixed; local E2E got through task creation/Start Parking before the test helper attempted `localhost:3001` while isolated API lived on 127.0.0.1:3101. Worker W8 added explicit test API-origin resolution with IPv4 loopback, Playwright contract 4/4 PASS. **All five real live lifecycle flows NOT YET RERUN to completion** |
| `postgres-api-race` | Seven #319 test suites reject shared CI service with `Issue319 requires its explicitly owned private cluster` | W12 compared #319 harness/runner/CI config on original main and candidate; identical | **Inherited test-target attestation restriction**, not proven #324 regression. Do not spoof `CI`, skip tests, bypass guard or extend timeout. Required CI remains blocked until a separately authorized private-cluster runner design |
| `static-build`, `platform-ubuntu`, `postgres-api-compound`, `postgres-api-standard` | Recorded PASS on original run | Source CI job statuses | No change necessary |
| `quality` | Failed due required upstream CI failures | Original run required checks | Remains blocked until actual gates pass, not a stand-in success |

## Additional main-vs-candidate non-PostgreSQL comparisons

`pnpm test:non-postgres` **FAILED** on the candidate (full suite is NOT green). On original, untouched `main`, a clean baseline worktree reproduced **7/7 failures** in selected Dashboard navigation/help tests and **2/2 failures** in selected API tests for MFA snapshot and audit event counts. Examples include unclassified `/guest-information`, an extra allowed Guest Information navigation entry, KPI MFA factor guard expectations and 101 vs 100 audit event types. These were not caused by the #324 file diff; they are **verified existing test-source expectation drift**.

Other failures observed within the full API non-PostgreSQL run (including Guest Information contract/Guest Rating module and Guest T3 policy) are **not yet individually baseline compared** and must remain OPEN, not automatically classified as inherited. The full API Vitest output showed 18 failed files (some suites/skips) and five individual failed tests, 1180 passed tests, 68 skipped. This is a nonzero test exit, **not PASS**. Do not weaken MFA, disclosure or role boundary tests to make counts green.

## Independent reviews and verification

- W10 independently inspected #309 SQL and test boundary: allowlisted scope is deliberate; unknown scope and private photo table row-lock denial remain protected. Source GO only, no attested PostgreSQL runtime test.
- W12 independently proved seven #319 race suite CI failures are a private-cluster attestation design mismatch inherited from main. The detailed document is `RACE_CI_TRIAGE.md`.
- W11 independently reviewed 32 changed source/doc files against main; no P0/P1 confirmed. Found one P2: missing/malformed Semgrep `results` falsely yielded a zero count. Prime patched the gate; Python regression suite **5/5 PASS**; W11 independently confirmed the precise guard and propagation fix (P2 CLOSED).
- Latest local acceptance: `pnpm test:build-contract` PASS; `pnpm build` 10/10 PASS; `pnpm lint` 11/11 PASS; `pnpm typecheck` 11/11 PASS; `pnpm architecture:check` PASS with historic warnings; test-harness 39/39 PASS; database non-Postgres 65/65 PASS; migration real PG17 5/5 PASS; operational-context 9/9 PASS; Windows PID 16/16 PASS; focused Employee E2E API origin 4/4 PASS; security scanner summary 5/5 PASS.

## Blocking acceptance items

1. Run the full real Employee E2E suite against a correctly configured **task-owned** DB/API/Next service and confirm no expected workflow regressions.
2. Resolve or explicitly and separately adjudicate the inherited #319 private CI service mismatch **without disabling its attestation**. The required check is still red; no misleading CI PASS or code skip.
3. Investigate the remaining full-suite test failures with per-file baseline comparisons, making only verified scoped fixes.
4. Actual current Semgrep scan with all nine historical partial-parser failures resolved or signed disposition; authenticate/live HTTP OCR/PG safety tests; three residual High package advisory dispositions; 29 secret owner reviews; ingress/TLS/headers evidence.
5. Update this document with the final pushed SHA and a genuinely fresh CI run outcome; maintain Draft status until owner-approved acceptance.

No `main` merge, live deploy, production database access, secret rotation or intentional test-security bypass occurred in this campaign.
