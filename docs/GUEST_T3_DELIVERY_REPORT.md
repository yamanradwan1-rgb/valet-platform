# T3 delivery report — 2026-10-08

## RESULT

Implementation delivered on `fix/guest-anti-abuse-postgres-resilience-t3` from
`95b515e7094145eaafa2f70ac583b2a63b68bec0`. The final delivery commit is reported
in the accompanying delivery message and is the branch HEAD containing this file.
Implementation is committed for independent review; aggregate validation is
incomplete/failed, so **merge readiness is NOT established**. The Owner explicitly
requested stopping the long-running aggregate test and committing/pushing now.

## DOCUMENTATION AND DECISIONS

Read the complete Guest production-readiness plan, the supplied T3 brief,
AGENTS.md, docs 00–09 as required, 13, 15 and 17, relevant implementation and
tests, and focused/canonical Accepted DEC-024/025/040/042/043/044/057/064/070/091.
Applied U-07/U-09 without reopening Owner decisions. No new DEC number or status.

DEC-024's canonical log amendment and focused pointer publish the derived T3
contract. Focused 040/042/044/057/064/070/091 explicitly preserve their domain
contracts while referencing that amendment. DEC-025 TLS/non-owner and DEC-043
release guards remain unchanged. Schema, engineering and security documents are
synchronized. [Policy and evidence](GUEST_T3_POLICY_AND_EVIDENCE.md) contains the
exact route map, envelope, counting, cooldown and compatibility contract.

## RATE-LIMIT POLICY

All windows are exact DB-clock rolling 900 seconds. Authorized A–D share one
visit HMAC aggregate of 864; original credential keys remain visible to N-1.

| Class | Budget | Supported maximum | Headroom | Route family |
| --- | ---: | ---: | ---: | --- |
| A | 784 | 392 | 2x | Session GET and payment projection GET |
| B | 32 | 16 | 2x | Enroll/exchange/prepare/switch/reconcile/end |
| C | 32 | 16 | 2x | Retrieval/cancellation/rating/tip |
| D | 16 | 2 | 8x admission | Handoff issue/rotation; independent proof limits remain |
| E | 60/source; 180/unknown credential | Hostile bound | Not a legitimate envelope | Missing/malformed/unknown/stale/revoked traffic |
| Anonymous allocation | 4000/source | 2000 | 2x arithmetic envelope | Clean NONE reconciliation plus enrollment for 1000 arrivals |

Authenticated admission commits COUNTED before public results. Invalid traffic
reserves durable PENDING before disclosure; crashes remain charged until expiry.
NULL historical classes conservatively consume every sub-budget. No event is
inserted once an applicable quota is exhausted. Retry-After uses the actual
clearing event, greatest blocker, integer 1..900; public 429/503 are generic and
no-store. Proof issuance 5/900s, verification failures 10/900s, five attempts per
proof and staff thresholds are unchanged. The 4000 boundary was seeded/tested;
a real 1000-arrival run was not executed.

## SECURITY

Two real Nest instances with independent pools share PostgreSQL. Exact read
ceiling survives a replica restart and bearer-to-cookie/staff-generation reissue.
100 synchronized authorized visits with 60 crashed source PENDING rows: 100
successes, zero legitimate 429/503. 70 hostile presentations: 60 invalid-access
responses, 10 rate-limited. Current persisted authority selects an authenticated
budget; cookie presence alone cannot. Downstream business commands reauthorize
under existing parent locks; tenant/generation/custody effects are unchanged.
Keys remain domain-separated HMAC with shared canonical secret validation;
SQL predicates use full hashes even under forced advisory-lock collisions.
Internal metrics contain only fixed dimensions; no credential or tenant labels.
Actual child-process hard death proved durable reservation survival.

## POSTGRESQL RESILIENCE

Production requires validated pool maximum, allowed connections, reserved
capacity, and maximum simultaneous API instances including surge. The maximum
cannot exceed floor((allowed-reserved)/instances). Queue admission is finite
(default min(pool*32,1024)); acquisition 2s, lock 2s, statement 3s, idle transaction
2s, full transaction 5s, operation 6s. Real PostgreSQL 17.11 settings are verified
at startup. Missing capacity/version/settings fail closed.

Server-native deadlines terminate SQL. A shortened transaction budget is set
before BEGIN, reset before reuse, and failed rollback/reset destroys the lease.
The outer timer disposes active leases, including callbacks that never resume.
Tests verified connection exhaustion, lock/statement/full-transaction and overall
deadline failure, zero committed test effect, no active transaction, pool recovery
and restored native settings. Lost commit responses remain ambiguous; no replay.
Actual deployed capacity, production TLS topology, proxy/client deadlines belong
to T4/T2 and were not configured by this task.

## MAINTENANCE

No cleanup on the Guest read hot path. One non-overlapping worker per API calls
a fixed parameterless SECURITY DEFINER function with safe search_path, PUBLIC
denied, migration owner distinct from runtime. Runtime receives narrow column
grants/EXECUTE, no DELETE/TRUNCATE/DDL. Each call deletes <=1000 events older than
one hour, using SKIP LOCKED and a distributed advisory try-lock. It cannot select
current keys/windows or touch business/audit history. 2501 expired rows converged
across two workers and a held old row; three current rows survived. Bounded
backlog sampling and oldest age remain internal. Seven local cleanup samples:
p50 2.739ms, observed upper-tail/max 8.997ms; no soak claim.

## PERFORMANCE

Immutable pinned baseline versus T3, 20 reads each, 100000 current unrelated rows:
SQL/round trips 23→7; acquisitions 5→1; transactions 3→1; inserts 2→1; actual
updates 1→0; request cleanup calls 2→0. Baseline p50/p95/p99:
70.276/85.830/175.811ms; final indexed T3: 6.920/8.934/17.649ms.
T3 acquisition p50/p95/p99: 0.072/0.153/0.274ms. Redacted final EXPLAIN:
without group index 3479 shared hits/35.712ms; indexed 3 hits+3 reads/0.095ms.
The 100-visit two-instance burst p50/p95/p99: 239.757/315.638/316.119ms.
Measured pool waits stayed within the 500ms histogram bucket, with no acquisition
failure/rejection in that fixture. These are local samples, not staging SLOs.

Retained JSON: [cost](evidence/guest-t3/cost.json),
[two instances](evidence/guest-t3/two-instance.json),
[maintenance](evidence/guest-t3/maintenance.json). No attributable WAL, dead-tuple,
8h/26h retention soak, or deployed 500/1000 cohort evidence is claimed.

## UI FREEZE

PASS: zero production Customer/UI files changed. No visual, copy, EN/AR/RTL,
polling scheduler, screen or T1 conflict-UI change.

## VALIDATION

Final focused runs on actual owned PostgreSQL databases:

- API pure: 5 files / 41 tests PASS.
- Guest/runtime race: 11 files / 57 tests PASS; includes two-instance 3,
  maintenance 5, native/resource deadline 10 and immutable N/N-1 coexistence.
- Guest/T1 standard routes and production database safety: 11 files / 83 tests PASS.
- Staff authentication/activation and handoff proof races: 3 files / 40 tests PASS.
- Staff/handoff and affected Presence privacy/disconnect cases: 7 files / 43 tests PASS.
- T3 migration and existing DEC-024 schema contract: 2 files / 11 tests PASS;
  420 unrelated schema cases explicitly skipped by the focused selector.
- API lint/typecheck and database typecheck PASS. Repository build 10/10 PASS.
- Prisma validation and whitespace diff check PASS.

Required broad gates were executed, with truthful limits:

- `pnpm lint`: FAIL, unchanged Dashboard 9 errors/3 warnings.
- `pnpm typecheck`: FAIL, unchanged Employee timezone-fixture errors.
- `pnpm architecture:check`: FAIL, existing Customer 301-line file, DB 328-line
  context-switch test, and Employee portable-window boundary. T3 files comply;
  touched grandfathered Check-In/provision files do not grow; schema test shrinks.
- `pnpm test`: STOPPED at Owner request during compound PostgreSQL lane.
  Completed API standard 155 passed/4 failed files, 1080 passed/7 failed tests.
  Three failures were obsolete T3-affected Presence expectations, corrected and
  passed in the final focused run. Three Overview projection expectations and
  one Zone disconnect-helper failure remain unrelated. API race/database lanes
  in this aggregate invocation did not finish; no aggregate PASS claimed.
- Aggregate API pure under unrestricted workers: 515 passed/39 failed/4 skipped.
  A bounded two-worker rerun: 554 passed/6 failed in 73 passed/3 failed files.
  Residual failures are existing feature-module controller inventories and
  management-audit event inventories, verified against pinned baseline source.
  Earlier hook/architecture subprocess timeouts were resource-sensitive, not
  automatically labelled baseline defects; the bounded rerun resolves them.
- Aggregate Dashboard tests: 732 passed/3 failed; untouched presentation/SDK tests.
- `pnpm test:postgres:database`: FAIL. Direct 579 passed/17 failed (40 files),
  provision 160 passed/10 failed/4 skipped (38 files), plus one setup failure.
  One direct T3 column expectation was corrected/extracted and focused PASS.
  Other failures are old migration-count/manifests (46/49/53/56/57 while baseline
  already has 74), existing audit privilege expectation, and a pinned old fixture
  missing shift_presence_management_results. These were not repaired.

Reproducible focused commands (TEST_DATABASE_URL selects an owned disposable DB):

```text
pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-non-postgres test/guest-t3-policy.test.ts test/postgres.test.ts test/anti-abuse-boundaries.test.ts test/guest-no-store.integration.test.ts test/api-operation-runner.test.ts
pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-postgres-race test/guest-t3-budget.integration.test.ts test/guest-t3-crash.integration.test.ts test/guest-t3-maintenance.integration.test.ts test/guest-t3-rolling-concurrency.integration.test.ts test/guest-t3-runtime-resilience.integration.test.ts test/guest-t3-two-instance.integration.test.ts test/guest-browser-session test/guest-rating-boundary.integration.test.ts test/guest-rating-idempotency.integration.test.ts test/guest-rating-concurrency.integration.test.ts test/guest-retrieval-request.integration.test.ts test/handoff-api.integration.test.ts test/mark-ready-guest-progression.integration.test.ts
pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-postgres-standard test/guest-t3-cost.integration.test.ts test/production-database-safety.integration.test.ts test/guest-browser-session-context-switch-recovery.integration.test.ts test/guest-browser-session-context-switch.integration.test.ts test/guest-browser-session-http.integration.test.ts test/guest-browser-session-lifecycle.integration.test.ts test/guest-rating-boundary.integration.test.ts test/guest-rating-idempotency.integration.test.ts test/handoff-api.integration.test.ts test/complete-handoff-api.integration.test.ts test/mark-ready-guest-progression.integration.test.ts
pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-postgres-race test/staff-auth.integration.test.ts test/staff-activation-anti-abuse.integration.test.ts test/handoff-proof-concurrency.integration.test.ts
pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-postgres-standard test/shift-presence-failure.integration.test.ts test/shift-presence-anti-abuse-privacy.integration.test.ts test/handoff-abuse.integration.test.ts test/handoff-atomicity.integration.test.ts test/complete-handoff-guards.integration.test.ts test/staff-auth-continuity.integration.test.ts test/staff-auth-native.integration.test.ts
pnpm --filter @valet/database exec vitest run --config vitest.config.mjs --project database-postgres-direct src/guest-t3-migration.integration.test.ts src/schema.integration.test.ts -t "T3|DEC-024 anti-abuse persistence"
pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-non-postgres --maxWorkers 2
pnpm --filter @valet/api lint
pnpm --filter @valet/api typecheck
pnpm --filter @valet/database typecheck
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:postgres:database
pnpm architecture:check
git diff --check
git diff --check origin/main...HEAD
```

API PostgreSQL aggregate was invoked by `pnpm test` as the same repository-owned
`pnpm --filter @valet/api test:postgres` command underlying test:postgres:api.
It was stopped, not passed. First attempts and a native-timer ordering regression
were diagnosed and corrected; only final focused results above are PASS.

## COMPATIBILITY AND ROLLBACK

No T1 credential/cookie/generation/domain contract changed. Additive nullable
columns preserve active events; no counter reset, HMAC rotation or history edit.
Production defaults COMPATIBILITY with N-1's 180 original-key cap. Immutable N-1
and N real APIs raced for the last slot and admitted exactly one. T4 may activate
ACTIVE only after all replicas use T3, old requests drain and 900 seconds pass.
2x headroom applies to ACTIVE; COMPATIBILITY is a temporary conservative floor.
Rollback must retain T1 cookies plus T3 security budgets/schema, not old quotas
with legacy polling. Enrollment remains disabled in deployed configuration.

## DIFF

Only T3 API/database/security docs, tests and example configuration. Forward
migrations 075/076/077; no historical migration edited, no dependency added,
no domain lifecycle/role/Company–Location configuration feature introduced.
The exact path manifest follows this report.

## GIT

Commit/push only the dedicated task branch. Main's commit remains the verified
base. A checkout switch back to main was detected during final delivery; the
existing same-base task branch is restored before commit, preserving all changes.
No PR, merge, deployment, production migration or issue closure. Delivery status
and full pushed SHA are verified in the final delivery message.

## BLOCKERS

No failing final focused T3 case is known. Aggregate validation is incomplete
and existing repository gates fail; independent review/CI must resolve or
explicitly disposition those gaps before a merge-readiness claim. T4 real pool/
TLS/proxy/rollout activation and T6 100→500→1000 staging/8h/26h qualification are
later operational dependencies, not completed evidence from T3. Do not merge.

## Exact changed paths

- `.env.example`
- `apps/api/src/common/database/bounded-postgres-pool.ts`
- `apps/api/src/common/database/postgres-transaction.ts`
- `apps/api/src/common/database/postgres.ts`
- `apps/api/src/common/database/runtime-database-deadline.ts`
- `apps/api/src/common/database/runtime-database.module.ts`
- `apps/api/src/common/database/runtime-postgres-policy.ts`
- `apps/api/src/common/http/api-errors.ts`
- `apps/api/src/common/http/api-operation-runner.ts`
- `apps/api/src/modules/anti-abuse/anti-abuse-key.ts`
- `apps/api/src/modules/anti-abuse/anti-abuse-maintenance.ts`
- `apps/api/src/modules/anti-abuse/anti-abuse.module.ts`
- `apps/api/src/modules/anti-abuse/anti-abuse.service.ts`
- `apps/api/src/modules/anti-abuse/classified-guest-counter.ts`
- `apps/api/src/modules/guest-access/guest-access.controller.ts`
- `apps/api/src/modules/guest-access/guest-access.module.ts`
- `apps/api/src/modules/guest-access/guest-browser-context.controller.ts`
- `apps/api/src/modules/guest-access/guest-browser-limiter.ts`
- `apps/api/src/modules/guest-access/guest-browser-session.controller.ts`
- `apps/api/src/modules/guest-access/guest-credential-authorizer.ts`
- `apps/api/src/modules/guest-access/guest-rating.service.ts`
- `apps/api/src/modules/guest-access/guest-request-admission.ts`
- `apps/api/src/modules/guest-access/guest-request-policy.ts`
- `apps/api/src/modules/payments/payment-transaction.ts`
- `apps/api/src/modules/retrieval/handoff-guest.controller.ts`
- `apps/api/src/modules/retrieval/handoff.service.ts`
- `apps/api/src/modules/retrieval/retrieval.service.ts`
- `apps/api/test/check-in-api.integration.test.ts`
- `apps/api/test/guest-authorizer-test-providers.ts`
- `apps/api/test/guest-browser-session-enrollment-anti-abuse.integration.test.ts`
- `apps/api/test/guest-browser-session-peer-app.ts`
- `apps/api/test/guest-browser-session-test-module.ts`
- `apps/api/test/guest-no-store.integration.test.ts`
- `apps/api/test/guest-rating-test-context.ts`
- `apps/api/test/guest-request-admission-test-providers.ts`
- `apps/api/test/guest-retrieval-request.integration.test.ts`
- `apps/api/test/guest-t3-baseline-source.ts`
- `apps/api/test/guest-t3-budget.integration.test.ts`
- `apps/api/test/guest-t3-cost.integration.test.ts`
- `apps/api/test/guest-t3-crash-worker.ts`
- `apps/api/test/guest-t3-crash.integration.test.ts`
- `apps/api/test/guest-t3-maintenance.integration.test.ts`
- `apps/api/test/guest-t3-policy.test.ts`
- `apps/api/test/guest-t3-rolling-concurrency.integration.test.ts`
- `apps/api/test/guest-t3-runtime-resilience.integration.test.ts`
- `apps/api/test/guest-t3-two-instance.integration.test.ts`
- `apps/api/test/handoff-api.integration.test.ts`
- `apps/api/test/mark-ready-guest-progression.integration.test.ts`
- `apps/api/test/postgres.test.ts`
- `apps/api/test/production-database-safety.integration.test.ts`
- `apps/api/test/shift-presence-anti-abuse-privacy.integration.test.ts`
- `apps/api/test/shift-presence-failure.integration.test.ts`
- `docs/03_DATABASE_SCHEMA.md`
- `docs/05_ENGINEERING_RULES.md`
- `docs/06_SECURITY_AND_DATA_RULES.md`
- `docs/08_DECISIONS_LOG.md`
- `docs/decisions/DEC-024_SHARED_DURABLE_ANTI_ABUSE.md`
- `docs/decisions/DEC-040_GUEST_RETRIEVAL_REQUEST.md`
- `docs/decisions/DEC-042_SECURE_HANDOFF_VERIFICATION.md`
- `docs/decisions/DEC-044_GUEST_PRE_START_RETRIEVAL_CANCELLATION.md`
- `docs/decisions/DEC-057_PHASE6_FINANCIAL_RELEASE_AND_PROJECTIONS.md`
- `docs/decisions/DEC-064_GUEST_BROWSER_ENTRY_TRANSPORT.md`
- `docs/decisions/DEC-070_RETRIEVAL_NOTIFICATION_MVP.md`
- `docs/decisions/DEC-091_GUEST_RATING_AND_RETURNING_CONTACT.md`
- `docs/evidence/guest-t3/cost.json`
- `docs/evidence/guest-t3/maintenance.json`
- `docs/evidence/guest-t3/two-instance.json`
- `docs/GUEST_T3_DELIVERY_REPORT.md`
- `docs/GUEST_T3_POLICY_AND_EVIDENCE.md`
- `packages/database/prisma/migrations/20261008007500_guest_t3_classified_anti_abuse/migration.sql`
- `packages/database/prisma/migrations/20261008007600_guest_t3_visit_budget_binding/migration.sql`
- `packages/database/prisma/migrations/20261008007700_guest_t3_group_window_index/migration.sql`
- `packages/database/prisma/schema.prisma`
- `packages/database/scripts/guest-runtime-privileges.mjs`
- `packages/database/scripts/provision-runtime-role.mjs`
- `packages/database/scripts/verify-runtime-table-privileges.mjs`
- `packages/database/src/guest-anti-abuse-schema-assertions.ts`
- `packages/database/src/guest-t3-migration.integration.test.ts`
- `packages/database/src/schema.integration.test.ts`

## T3 remediation checkpoint (2026-10-08)

Remediation commit: `9d627af2fbb992316957f79f21d9eb81515d70a0`, following the initial T3 implementation `046efa652c2fabf974813f0e0141d4b63b6c3de2`. The old validation and blocker entries above describe the **initial** implementation only.

The new commit scopes the six-second operation deadline to explicitly opted-in Guest routes, introduces separate finite general PostgreSQL lease limits, hardens lease/protocol handling and COMMIT outcome accounting, preserves rate-limit 429 responses, and supports authorized Browser Session reconciliation under same-NAT contention. No Customer presentation files or new migrations were changed in remediation.

The implementing agent reported 59 focused T3 tests (12 files), 50 compatibility tests, 213 Customer tests, and passing focused lint/typecheck. Several aggregate failures were reported on both the T3 branch and pinned baseline. **Final PostgreSQL aggregate and remaining verification were NOT COMPLETED — OWNER-REQUESTED STOP**. These results were not independently rerun during the subsequent GitHub source inspection. No passing GitHub CI status is recorded for the remediation SHA.

Independent source inspection found no obvious new P0/P1 issue in the scoped remediation but does not certify runtime or production readiness. Any owner-authorized fast-forward is code integration with explicitly incomplete verification, not authorization to deploy, enable enrollment, or activate `GUEST_T3_RATE_POLICY=ACTIVE`. T4 deployment validation and T6 capacity/soak qualification remain pending.
