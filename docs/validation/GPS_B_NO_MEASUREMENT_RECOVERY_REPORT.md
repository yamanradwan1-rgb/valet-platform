# GPS-B evidence-free recovery correction — Issue #257

## Independent review follow-up

The original "no remaining known gap" conclusion below was disproved at this
report's commit by distinct-operation convergence: O2 could return success yet
remain PENDING. The owner-authorized forward 068 correction preserves this work
and records a truthful no-effect result for O2. Reproduction and current evidence
are in [GPS_B_CONVERGENCE_RECOVERY_REPORT.md](GPS_B_CONVERGENCE_RECOVERY_REPORT.md).
The original 067 validation ledger below remains historical evidence.

Date: 2026-10-04. Actual fetched origin/main:
`fa178f1a6697e48ef85bccb5b82797bfd0aedb3f`.
Branch: `fix/257-gps-c-no-measurement-recovery`, clean before work and created
directly from this base. The owner explicitly authorizes this server/contracts
correction; no Native implementation, dependency, Dashboard, Web or camera work.

## Pre-code contract and scope ledger

| Behavior                                           | Binding authority                | Identity, persistence, retry and privacy                                                                            |
| -------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Optional request selector, equality with evidence  | Owner sections 3–6/27/30; LOCKED | UUID correlation only; strict transport validation; old bodies/responses unchanged                                  |
| Existing exact operation/challenge, no replacement | Owner 7–9/15/16; DEC-099; LOCKED | User/member/Organization/Location/action/END Shift/canonical cash; HMAC scope; current authorization before bind    |
| OFF completion without evaluation                  | Owner 10–12/32; LOCKED           | Explicit nullable OFF_NO_EVIDENCE basis; exact Shift + request/policy binding; no fake Decision; existing retention |
| WARN_ONLY missing measurement on O                 | Owner 13/26; LOCKED              | Existing truthful evaluator/Decision/consumption in same transaction; no random X for correlated input              |
| Strict missing measurement denial                  | Owner 14; LOCKED                 | Bound O terminal DENIED/PRESENCE_REQUIRED, summary null; no Shift/Decision/exception                                |
| Exact terminal recovery and unchanged END order    | Owner 16–25; DEC-099/100; LOCKED | Fresh target authority, stored policy fingerprint, no inferred success/replay; cash/open work before composition    |
| Forward persistence and grants                     | Owner 11/29; DERIVED             | 067 typed basis CHECK/trigger; no historical rewrite; least privilege; representative upgrade proof                 |
| Native/Web/Dashboard/GPS-D/strict activation       | Owner 34/37; FORBIDDEN           | No read/change to apps/valet; no clients, dependencies, release activation or merge                                 |

Affected entities: User, OrganizationMembership, Organization, Location,
LocationAccess, StaffAuthSession, Shift, ShiftPresenceOperation/Challenge/Decision.
No ValetSession or Task/Dispatch transition changes. Existing Shift ACTIVE→ENDED,
safe-own-End, cash, force-end and audit semantics remain. This is existing MVP
Presence and Company-default/Location-override policy, without new configuration.
No new index is needed; existing scoped FKs and unique identity remain binding.
Implementation-critical unresolved policy: none under the explicit owner brief.

Structure: keep fingerprint/attempt/command modules focused; no authored module
over 300 lines. Extract only task-relevant orchestration if growth requires it.
Docs and this ledger were written before implementation. Validation and final
inventory are recorded below after execution; no unexecuted gate is claimed.

## A. Git and exact inventory

Base `fa178f1a6697e48ef85bccb5b82797bfd0aedb3f`; branch
`fix/257-gps-c-no-measurement-recovery`. Commit message:
`fix(shifts): correlate evidence-free presence operations`. The final chat handoff
records the actual final SHA, independently queried remote SHA and post-push
clean-tree observation (a document cannot contain its own commit hash).

Exact task inventory, 27 files:

```text
apps/api/src/modules/shifts/end-shift-command.ts
apps/api/src/modules/shifts/shift-presence-attempt.ts
apps/api/src/modules/shifts/shift-presence-command.ts
apps/api/src/modules/shifts/shift-presence-fingerprint.ts
apps/api/src/modules/shifts/shift-presence-no-evidence.ts
apps/api/src/modules/shifts/shift-presence-operation.ts
apps/api/src/modules/shifts/shift.controller.ts
apps/api/src/modules/shifts/shift.service.ts
apps/api/src/modules/shifts/start-shift-command.ts
apps/api/test/shift-presence-no-evidence-fences.integration.test.ts
apps/api/test/shift-presence-no-evidence-races.integration.test.ts
apps/api/test/shift-presence-no-evidence-recovery.integration.test.ts
apps/api/test/shift-presence-no-evidence-retention.integration.test.ts
apps/api/test/shift-presence-no-evidence-test-helper.ts
apps/api/test/shift-presence-selector-compatibility.integration.test.ts
docs/03_DATABASE_SCHEMA.md
docs/06_SECURITY_AND_DATA_RULES.md
docs/validation/GPS_B_CONSUMER_CONTRACT_REPORT.md
docs/validation/GPS_B_IMPLEMENTATION_REPORT.md
docs/validation/GPS_B_NO_MEASUREMENT_RECOVERY_REPORT.md
docs/validation/GPS_B_PUBLIC_CONTRACT.md
packages/contracts/src/shifts.ts
packages/contracts/src/shifts-correlation.test.ts
packages/database/prisma/schema.prisma
packages/database/prisma/migrations/20261004006700_shift_presence_evidence_free_completion/migration.sql
packages/database/scripts/shift-presence-runtime-privileges.mjs
packages/database/src/shift-presence-completion.integration.test.ts
```

## B. Public contract

POST `/v1/staff/shifts/start`: `{ targetLocationId: UUID, operationId?: UUID,
presence?: MEASURED | EXCEPTION }`.
POST `/v1/staff/shifts/:shiftId/end`: `{ cashReported: MoneyString,
operationId?: UUID, presence?: MEASURED | EXCEPTION }`.

Both schemas remain strict. When both selectors exist they must equal; mismatch
is transport-invalid (HTTP 400) before business writes. Invalid UUID, unknown
fields and public MISSING/CORRELATED_MISSING are rejected. The new selector is
correlation only, never authority or client evidence. Existing evidence-only
requests and matching dual-selector requests retain the same fingerprints and
exact terminal recovery. Legacy OFF needs no challenge; legacy WARN_ONLY retains
its internal missing journal; legacy strict requirements are unchanged. Success
and B1/B2/B3 response shapes are unchanged.

## C. OFF

After current authorization and ordinary business checks, resolve exact existing
O and its unique challenge, lock both, check expiry/consumption, and bind the
HMAC request/current policy. The real Shift mutation, existing Shift audit and
O COMMITTED result commit together. Result provenance is `OFF_NO_EVIDENCE`, with
resultShiftId present and resultDecisionId null. Decision created: **NO**.
There is no evaluation/classification or fake fix. O's challenge stays unconsumed.
Lost Start/End responses recover through GET O in a freshly constructed Nest app,
without mutation replay. Original Start recovery survives later End and another
active Shift; exact recovery precedes ordinary convergence.

## D. WARN_ONLY

Use the same existing O and challenge. X allocated for a correlated caller:
**NO**. The existing evaluator truthfully reports missing measurement as
MEASUREMENT_UNUSABLE / INVALID_FIX with UNUSABLE accuracy/freshness bands. Shift,
audit, Decision, challenge consumption and O completion share one transaction.
GET O recovers the exact Shift result after loss and Nest reconstruction.
Completion basis is null; the Decision requirement is preserved.

## E. REQUIRE / REQUIRE_OR_OVERRIDE

Current strict missing evidence binds O and commits DENIED/PRESENCE_REQUIRED,
with summary, result and decisionId null. Shift mutation: **NO**. No Decision,
exception or replacement Operation is created. Lost Start and End denials recover
exactly. Existing explicit fresh Operation B override flow remains unchanged;
O's terminal denial is immutable. Production strict rollout stays closed.

## F. END

Target and request fingerprints bind exact User/member/Organization/Location,
END action, exact Shift, O and canonical cash. `7` and `7.000` are equivalent for
the tested JOD intent; changing to `8` conflicts, and invalid representability is
rejected before binding. A different Shift or START Operation cannot substitute.
Recovery returns exact ENDED Shift, startedAt/endedAt and immutable reconciliation:
cashExpected `0.000`, cashReported `7.000`, cashVariance `7.000`, currency `JOD`,
reportedAt equal to the committed endedAt. Ordinary cash/open-work checks and
safe-own-End ordering remain intact, including access/membership loss.

## G. Database

Migration: **YES**, next forward migration **067**:
`20261004006700_shift_presence_evidence_free_completion`.
Prisma and SQL have the same nullable typed single-value completion basis.
Historical migrations 058–066 changed: **NO**.

The replacement terminal CHECK keeps Decision-backed COMMITTED invariants, with
an explicit non-null OFF basis exception requiring request/policy/result facts.
Explicit IS NOT NULL predicates prevent SQL CHECK's NULL escape. The new invoker
trigger rejects allocation-time provenance and requires a previously bound
pending attempt, current effective OFF, live unconsumed exact challenge, no
Decision, and the correct real result Shift/state (including exact END cash
snapshot existence). Existing scope FKs, history/policy immutability, terminal
guards and indexes continue to apply. No backfill or rewritten history.

Runtime provisioning extends only the existing column UPDATE allowlist with
completion_basis. No broad UPDATE/DELETE, immutable-scope update, maintenance or
trigger-helper execution is granted. Existing allocation INSERT privileges stay;
the trigger rejects supplied completion provenance at INSERT for owner/runtime.
The helper has fixed search_path, is not SECURITY DEFINER and PUBLIC execution
is revoked. Both provisioning and verification cover its private boundary.

Real upgrade proof: deploy genuine migrations through 066, seed valid pending,
Decision-backed committed and denied operations, deploy 067 with Prisma migrate
deploy, compare every old JSON field unchanged, then exercise runtime-role
positive and hostile SQL. Fresh migrated API databases exercise the new path.
Deployment order is migration 067 and runtime-role provisioning before starting
the corrected server; no production deployment was performed in this task.

## H. Atomicity, races and response loss

Actual PostgreSQL commit barriers and pg_stat_activity lock observations are
used; no sleep-based race, arbitrary timeout increase or weakened assertion.
Every policy schedule runs for START and END. The owner-only writer takes the
existing settings EXCLUSIVE guard, while the final runtime command demonstrably
waits on its SHARED guard. COMMIT/ROLLBACK release determines final policy:

| Issuance  | Writer value/outcome                        | Final outcome                           |
| --------- | ------------------------------------------- | --------------------------------------- |
| OFF       | OFF / COMMIT                                | O COMMITTED, OFF basis, no Decision     |
| OFF       | WARN_ONLY / COMMIT                          | O COMMITTED, one missing Decision, no X |
| OFF       | REQUIRE / COMMIT                            | O DENIED/PRESENCE_REQUIRED, no mutation |
| WARN_ONLY | REQUIRE / COMMIT                            | O DENIED/PRESENCE_REQUIRED, no mutation |
| REQUIRE   | OFF / COMMIT                                | O COMMITTED, OFF basis, no Decision     |
| OFF       | WARN_ONLY / ROLLBACK                        | O COMMITTED under retained OFF          |
| OFF       | REQUIRE / committed acknowledgement UNKNOWN | O DENIED under committed REQUIRE        |

Strict fixture constraints are relaxed only in disposable owner-created test
databases by the existing fixture helper; production SQL gates are untouched.

Additional command/status schedules cover OFF/WARN_ONLY × START/END × COMMIT,
ROLLBACK and UNKNOWN acknowledgement after real COMMIT. A successful result has
one effective Shift, one matching audit, and only WARN_ONLY's one Decision and
consumed challenge. Rollback restores O PENDING with null bindings/result/basis,
unconsumed challenge, no new audit/Decision, and unchanged END cash. Strict denial
COMMIT/ROLLBACK schedules prove terminal or pending state respectively. Concurrent
identical O calls wait, return equal original results, and never duplicate facts.
Real duplicate-audit failure after the protected writes proves complete rollback
for all four OFF/WARN_ONLY Start/End combinations.

HTTP tests destroy the response socket after the protected commit, close the old
Nest app, create a fresh Nest app/DI graph, and GET O. The recovery read precedes
any explicit test of terminal-command idempotence; it never replays a mutation.
The proof is acknowledgement loss plus app reconstruction in the test process,
not an OS SIGKILL/container-loss claim. Strict lost denials also use fresh apps.

## I. Privacy and retention

Raw employee GPS introduced: **NO**. Generic request persistence: **NO**.
New durable facts are a typed completion basis and existing keyed digests; no
request body, device/trajectory or measurement is retained. Public union stays
MEASURED/EXCEPTION. OFF creates no attendance classification or 24-month Decision.
WARN_ONLY preserves minimized truthful history. Existing anti-abuse limits stay.

Real retention tests prove OFF's unconsumed challenge survives before expiry+24h,
is purged after it, and both GET O and exact terminal lookup still recover without
that row. At terminal+14 days result recovery expires; the tombstone remains
through 89 days and purges after 90. Shift/audit facts survive that cleanup.
Existing suites verify Decision/exception history's unchanged 24-month clock.

## J. Validation ledger

Environment: task-owned `postgres:17-alpine` container
`valet-gpsb-evidence-free-20261004`, label `valet.task=gps-b-evidence-free`, local
port 55442. Existing PostgreSQL on 5432 was untouched. TEST_DATABASE_URL and
MIGRATION_DATABASE_URL were configured for this disposable instance. Harness
leases/profiles managed concurrency and reported zero database/role/child leaks.

Final unique focused coverage across the successful runs: **47 files, 380 tests**.

| Coverage                                                   | Files | Tests | Final result |
| ---------------------------------------------------------- | ----- | ----- | ------------ |
| Contracts Presence/consumer/Shift selector                 | 3     | 44    | PASS         |
| API Shift/Presence focused regression and new proofs       | 39    | 309   | PASS         |
| Database upgrade/integrity/privilege/privacy/release gates | 5     | 27    | PASS         |

New API cases: recovery 9; fences 13; deterministic races 34; retention 2;
dual-selector compatibility 2. No existing test was changed or weakened.

Exact commands (environment configured as above):

```powershell
pnpm --filter @valet/contracts typecheck
pnpm --filter @valet/api typecheck
pnpm --filter @valet/database typecheck
pnpm --filter @valet/contracts build
pnpm --filter @valet/api build
pnpm --filter @valet/database prisma:validate
pnpm --filter @valet/contracts exec vitest run src/shifts-correlation.test.ts src/shift-presence-consumer.test.ts src/shift-presence.test.ts
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/shift-presence-no-evidence-recovery.integration.test.ts
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/shift-presence-no-evidence-fences.integration.test.ts test/shift-presence-no-evidence-retention.integration.test.ts test/shift-start.integration.test.ts test/shift-end.integration.test.ts test/shift-presence-enforcement.integration.test.ts test/shift-presence-http.integration.test.ts test/shift-presence-recovery.integration.test.ts test/shift-presence-consumer-recovery.integration.test.ts test/shift-presence-consumer-policy.integration.test.ts test/shift-presence-consumer-integrity.integration.test.ts test/shift-presence-consumer-continuation.integration.test.ts test/shift-presence-consumer-policy-races.integration.test.ts test/shift-presence-exceptions.integration.test.ts test/shift-presence-approver.integration.test.ts test/shift-presence-negative.integration.test.ts test/shift-presence-failure.integration.test.ts test/shift-presence-configuration-races.integration.test.ts test/shift-presence-authority-races.integration.test.ts test/shift-presence-current-authority-races.integration.test.ts test/shift-presence-session-races.integration.test.ts test/shift-presence-readiness-races.integration.test.ts test/shift-presence-expiry-races.integration.test.ts test/shift-presence-zone-evaluation-races.integration.test.ts test/shift-presence-forward-migration.integration.test.ts test/shift-presence-maintenance.integration.test.ts test/shift-presence-maintenance-expiry.integration.test.ts test/shift-presence-anti-abuse.integration.test.ts test/shift-presence-anti-abuse-privacy.integration.test.ts test/shift-presence-foundation.integration.test.ts test/shift-presence-fingerprint.test.ts test/shift-presence-evaluator.test.ts test/shift-presence-retention.test.ts test/shift-presence-audit-projection.test.ts test/shift-presence-policy-noop-recovery.integration.test.ts test/shift-presence-management-failure.integration.test.ts test/shift-presence-management-http-recovery.integration.test.ts
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/shift-presence-no-evidence-retention.integration.test.ts test/shift-presence-no-evidence-races.integration.test.ts
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/shift-presence-selector-compatibility.integration.test.ts
pnpm --filter @valet/database exec node ../../scripts/test-harness/run-owned-tests.mjs database vitest.config.mjs src/shift-presence-completion.integration.test.ts src/shift-presence-runtime-role.integration.test.ts src/shift-presence-persistence.integration.test.ts src/shift-presence-privacy.integration.test.ts src/shift-presence-release-gate.integration.test.ts
pnpm --filter @valet/database exec node ../../scripts/test-harness/run-owned-tests.mjs database vitest.config.mjs src/shift-presence-completion.integration.test.ts
node scripts/gps-b-validation.mjs
git diff --check
```

Initial failures and repair evidence are kept explicit: the first database
five-file invocation passed the four existing suites (18 tests) but could not
seed a committed row using a Decision fixture without result Shift. The fixture
was corrected with a real, bound result. Its next nine-test run passed eight but
incorrectly expected the pre-existing allocation INSERT privilege to be absent;
the test now verifies that existing grant plus actual trigger rejection of
supplied provenance. Final nine-test upgrade/privilege suite passed.

The 36-file API invocation passed 34 files/262 tests but failed two new retention
assertions comparing internal Date/full command objects to serialized public
responses. The assertions now compare the exact public ISO-date projection and
the separate exact internal terminal result. The targeted two-file repair run
passed 36 tests (retention 2 + expanded races 34). All preceding unchanged suites
remain valid evidence; they were not needlessly rerun. Scoped formatting initially
flagged this report's table; formatting was fixed, without changing the gate.
The existing Node DEP0190 harness warning is observed, unrelated and unchanged.

Static/build commands passed. The final scoped gate passed for 123 authored files
and 141 owned files from its GPS-B baseline. It verifies import boundaries,
physical-line limits, real ESLint, formatting, diff whitespace and unchanged
historical migrations; it deliberately reads no Employee Web source. Every new/
modified authored file is <=300 lines, largest new file 293. No baseline change.

## K. Scope

| Boundary                                         | Result                                                |
| ------------------------------------------------ | ----------------------------------------------------- |
| Server changed                                   | YES                                                   |
| Shared contracts changed                         | YES                                                   |
| Database changed                                 | YES — typed forward 067, Prisma parity, narrow grants |
| Native / expo-location / Dashboard changed       | NO / NO / NO                                          |
| Employee Web read / changed                      | NO / NO                                               |
| Camera / #262 changed                            | NO                                                    |
| Strict rollout enabled                           | NO                                                    |
| GPS-C implemented / GPS-D started                | NO / NO                                               |
| PR created / merge performed / Issue #257 closed | NO / NO / NO                                          |

## L. Evidence levels and self-review

IMPLEMENTED: server correlation, OFF provenance, same-O WARN_ONLY and strict
terminal denial, docs and tests exist.
STATIC VERIFIED: typecheck, Prisma validation and scoped structure/import/
format/ESLint gates.
LOCAL COMMAND VERIFIED: focused tests and contracts/API builds.
RUNTIME VERIFIED: real PostgreSQL migrations/runtime role and Nest HTTP boundary.
FAILURE VERIFIED: real HTTP socket loss, app reconstruction, duplicate-audit SQL
failure, actual rollback/commit with unknown acknowledgement, real lock races.
CI VERIFIED: **NO** — no remote CI run is represented by local evidence.

VAYLET review target: full local diff/new files against actual base above, task
brief and DEC-099/100, current Native plan, schema/security/DoD/structure rules.
Findings: no remaining blocking code defect found in the reviewed paths. Earlier
test-fixture/projection expectations were corrected without changing contracts.

Authorization-before-mutation trace: controller strictly parses selectors and
resolves staff session; command resolves persisted target, locks existing settings/
lifecycle/session boundaries, then authorizes Start or safe-own-End. Exact O target
and terminal recovery run next. New attempts retain cash/open-work checks, current
configuration and exact O/challenge lock before bind (the first new protected
write), then the existing Shift/Decision/audit/result transaction. Terminal retry
and status reads independently reauthorize; foreign O never binds/discloses.

Review verdicts: tenant/location, retry/concurrency/DB, existing abstraction
compatibility, append-only audit/privacy, downstream GPS-C contract, architecture,
scoped tests and scope fidelity passed the local review at the recorded evidence
levels. The ledger above traces each new behavior to the owner's exact clause.
No new session/task state, generic writer or speculative abstraction was added.
B1/B2/B3 and production strict gates are preserved.

Merge verdict: **BLOCK MERGE** pending independent human/cross-review and actual
repository CI. This is a process/evidence gate, not an unresolved implementation
finding. No merge or PR was performed; the branch is handed off for review.

## M. Remaining gaps

No remaining known gap in this focused evidence-free server correction. GPS-C
Native acquisition/UX, GPS-D and production strict activation remain separate
work. Independent review and remote CI remain unobserved. The tests establish
the named schedules and failure boundaries, not an untested OS hard-crash or
production deployment claim.
