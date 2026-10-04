# GPS-B distinct-operation convergence correction

Owner follow-up, 2026-10-04. Continue on
`fix/257-gps-c-no-measurement-recovery`, reviewed parent
`9eb5836d64ba0fba2619ccf328d611c61e9dc9f3`. Fetched main remains
`fa178f1a6697e48ef85bccb5b82797bfd0aedb3f`. Native Windows Git is clean at
preflight. The WSL preflight displays environment-specific line-ending status
noise; native Windows Git independently reports no file changes. No unrelated
files are altered/restored. All accepted 067 work is retained.

## Pre-code contract ledger

| Behavior                                                             | Authority                                          | Exact identity/effect/privacy                                                                                                                                     |
| -------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same-Location ACTIVE convergence must recover through the caller's O | Owner sections 1/3–5, LOCKED                       | Current User/member/Organization/Location + existing O/Challenge; exact result Shift; no new Shift/audit/Decision or consumption                                  |
| Start unique-index fallback applies the same rule                    | Owner sections 1/5/8, LOCKED                       | Fresh authorized transaction after actual aborted INSERT; no inference by client                                                                                  |
| Exact ENDED convergence binds compatible canonical cash              | Owner sections 2/3/6, LOCKED                       | Exact owned Shift/cash/O; no second End or cash snapshot; changed correlated cash conflicts; force-ended missing cash unavailable                                 |
| Typed no-effect completion                                           | Owner sections 3/4/7, LOCKED                       | Extend existing nullable completion basis with NO_EFFECT_CONVERGENCE, forward 068, never edit 067 or copy another Decision                                        |
| Preserve public Start/End and recovery shapes                        | Owner sections 4/8, LOCKED                         | COMMITTED describes a durably recorded successful operation outcome; internal typed provenance distinguishes the effect; null Decision never asserts GPS evidence |
| Existing evidence fingerprints and terminal recovery                 | DEC-099/100; owner sections 3/8, LOCKED            | Same-O identity/cash/sample binding remains; no raw coordinates or request retention                                                                              |
| Existing validity, authorization, locks and retention                | DEC-099/100 and current shared primitives, DERIVED | Pending O/live exact challenge required for new binding; no proof evaluation/consumption on no-effect completion; clocks unchanged                                |
| Native/Web/Dashboard/rollout/PR/merge                                | Existing owner brief + follow-up 10, FORBIDDEN     | Server/contracts/database documentation only; no clients, dependencies, strict activation or merge                                                                |

Affected entities: Shift, ShiftPresenceOperation/Challenge and existing
User/membership/Organization/Location/session authority. No new physical Shift,
ValetSession or Task/Dispatch transitions; no new configuration or index. Existing
Company-default/Location-override settings guards remain. New no-effect helper is
extracted from Start/End to stay below 300 physical authored lines. No unresolved
implementation-critical policy under the owner's explicit correction.

## Reproduction and evidence

On reviewed parent `9eb5836d64ba0fba2619ccf328d611c61e9dc9f3`, the first
three new tests failed: ordinary concurrent START, defensive START INSERT-loser,
and concurrent END. O1 committed the canonical Shift; O2's successful HTTP reply
was destroyed; a fresh Nest application GET O2 returned PENDING. These tests
passed after the correction and were expanded into the matrix below.

Production Start authorization locks the membership, so normal READ COMMITTED
requests serialize and reach existing-ACTIVE convergence. The defensive
unique-index branch is exercised with a test-only real REPEATABLE READ snapshot:
O2 takes its snapshot before O1 commits, waits on the real authority locks,
attempts an INSERT against its older view, and receives actual PostgreSQL 23505
on `shifts_one_active_per_membership_idx`. Its aborted transaction rolls back;
recovery runs in a fresh transaction. The tests assert the actual violation count.
No query result/error is fabricated, no authority lock is disabled, and production
isolation is unchanged. END waits on the real exact Shift row lock. Barriers
observe `pg_stat_activity`; no timing sleeps are used.

The lost-response tests destroy the O2 success response before client delivery,
close the old Nest application, then start a fresh Nest application and GET the
caller-known O2. This proves durable database recovery across the tested HTTP
acknowledgement loss and application replacement; it does not claim an OS hard-kill
or a deployed Native acquisition test.

## Implementation and persistence

`shift-presence-convergence.ts` receives freshly authorized/locked exact Shift
scope from Start or End. It classifies the exact state and canonical END cash,
resolves the existing owned operation/challenge, checks selector equality and
live unconsumed challenge, binds the existing keyed request/policy fingerprints,
and records COMMITTED / NO_EFFECT_CONVERGENCE / exact result Shift / null Decision
in the caller's transaction. It never allocates, evaluates or consumes proof,
mutates a Shift, or writes a Shift audit. Absent correlation preserves legacy
behavior. Failed binding/completion rolls back without leaving a success.

Ordinary Start classifies same Location before calling this helper. The
unique-violation recovery transaction freshly guards settings/lifecycle/session,
authorizes Start, resolves an exact terminal operation first, then applies the
same convergence rule. Different Location remains ACTIVE_SHIFT_CONFLICT. End
resolves self-ownership and locks its exact Shift before recovery/convergence;
stored missing cash stays SHIFT_CASH_RECONCILIATION_UNAVAILABLE and incompatible
correlated cash is PRESENCE_OPERATION_CONFLICT. Real effect paths are unchanged.

Migration `20261004006800_shift_presence_converged_completion` commits the new
enum label before its use, then extends the terminal CHECK and existing private
invoker trigger. Decision-backed completion still requires a Decision with null
basis; OFF mutation still requires current OFF; convergence requires prior bound
PENDING identity, exact result scope/action/state, live unconsumed exact challenge
and no operation Decision. END requires its stored cash snapshot. The operation
transition and existing immutable-scope/history triggers stay in force. Existing
column grants suffice: no broad UPDATE/DELETE, public trigger execution or new
runtime privilege. No data backfill, migration rewrite, new index/configuration,
raw coordinates, request payload, audit/event or attendance history is added.
Binding stores the existing HMAC, never the supplied measurement/exception body.
Existing 14-day recovery, 90-day tombstone and ephemeral challenge purge apply.

## Focused validation ledger

Real disposable PostgreSQL 17, task-owned container
`valet-gpsb-convergence-20261004`, host port 55442. Each harness invocation reports
zero remaining task databases, roles and children. An independent PostgreSQL
catalog query found no leftover test databases or roles; the exact task label
was verified before removing this disposable container. Existing developer
database on port 5432 is untouched. No unrelated broad repository test loop was run.

| Gate                                                  | Observed result                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| New convergence races + fences                        | 2 files, 15 tests passed                                                                          |
| New proof + affected API regressions                  | 14 files, 132 distinct tests passed after the one superseded assertion correction described below |
| Database upgrade/runtime/privacy/release/persistence  | 6 files, 37 tests passed                                                                          |
| Total focused coverage                                | 22 files, 184 distinct tests; includes 32 new tests (22 API, 10 database)                         |
| Contracts/API/database typechecks                     | Passed                                                                                            |
| Contracts/API builds                                  | Passed                                                                                            |
| Prisma schema validation                              | Passed                                                                                            |
| GPS-B scoped structure/import/format/ESLint/diff gate | Passed; historical migrations unchanged                                                           |
| Native Windows `git diff --check`                     | Passed                                                                                            |

The affected API run first passed all 85 tests in its eight-file race project.
Its six-file standard project had 46 passes and one failure: an old enforcement
test explicitly expected a successfully converged O2 to stay PENDING. That
expectation encoded the reviewed defect. It now requires RECOVERABLE COMMITTED,
null Decision/summary, the exact original ACTIVE Shift, NO_EFFECT_CONVERGENCE,
and an unconsumed challenge with null Decision, retaining all original business
cardinality checks. The entire 12-test enforcement file passed on focused rerun.
No production code change was needed after these focused regressions.

New coverage includes OFF/WARN_ONLY without evidence; measured O2 under WARN;
both normal Start and actual INSERT-loser; same exact End/canonical cash;
lost O2 HTTP acknowledgement and fresh Nest GET; identical O2 retries; different
Location conflicts in both Start paths; O2's independently allocated different
cash intent; missing-cash force-ended fixture plus existing real force-end
regressions; no-effect COMMIT rollback; strict current policies applied to an
already-satisfied effect; measured O1 with approved-exception O2 remaining
APPROVED/unconsumed; challenge purge followed by later End/replacement Start.

Database tests deploy real versioned migrations on empty databases and upgrade
representative existing 067 OFF-completed, PENDING and DENIED rows to 068 with
every field preserved. Existing 066 Decision-backed upgrade coverage also passes
through the current migrations. Negative tests reject provenance on allocation,
unbound/same-statement binding, wrong result scope/state, END without cash,
copied Decision and owner/runtime terminal identity mutation. Narrow privileges
and private helper execution are verified with PostgreSQL capability queries.

Executed commands (owned harness selects its existing profiles automatically):

```powershell
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/shift-presence-convergence-races.integration.test.ts test/shift-presence-convergence-fences.integration.test.ts
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/shift-presence-convergence-proof.integration.test.ts test/shift-start.integration.test.ts test/shift-end.integration.test.ts test/shift-cash-reconciliation.integration.test.ts test/shift-presence-recovery.integration.test.ts test/shift-presence-no-evidence-recovery.integration.test.ts test/shift-presence-no-evidence-races.integration.test.ts test/shift-presence-consumer-recovery.integration.test.ts test/shift-presence-enforcement.integration.test.ts test/shift-presence-exceptions.integration.test.ts test/shift-presence-consumer-continuation.integration.test.ts test/shift-presence-failure.integration.test.ts test/shift-presence-forward-migration.integration.test.ts test/staff-shift-force-end.integration.test.ts
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/shift-presence-enforcement.integration.test.ts
pnpm --filter @valet/database exec node ../../scripts/test-harness/run-owned-tests.mjs database vitest.config.mjs src/shift-presence-convergence.integration.test.ts src/shift-presence-completion.integration.test.ts src/shift-presence-runtime-role.integration.test.ts src/shift-presence-persistence.integration.test.ts src/shift-presence-privacy.integration.test.ts src/shift-presence-release-gate.integration.test.ts
pnpm --filter @valet/contracts typecheck
pnpm --filter @valet/api typecheck
pnpm --filter @valet/database typecheck
pnpm --filter @valet/contracts build
pnpm --filter @valet/api build
pnpm --filter @valet/database prisma:validate
node scripts/gps-b-validation.mjs
git diff --check
```

## Adversarial self-review

Review target: the follow-up diff against reviewed parent `9eb5836d`, on the same
owner branch. Implementation and code-review guardian skills applied. Authority:
latest explicit owner correction, Accepted DEC-032/099/100, relevant schema,
security, Definition of Done, collaboration and 300-line rules. This is a local
self-review; it does not substitute for independent ChatGPT/human review or CI.

| Review pass                  | Verdict and evidence                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Findings                     | No remaining BLOCKER/MAJOR identified in the reviewed diff; superseded PENDING test corrected with stronger exact-result/proof assertions                                                                                                                                                                                                           |
| Security and tenant/Location | Start `authorizeShiftStart` proves current User/member/tenant/Location/access before `bindPresenceAttempt`; End `requireActiveShiftUser` + `resolveOwnedShift` + `lockOwnedShift` prove persisted self-scope first; the helper rechecks exact result scope and locks existing O/Challenge before its first UPDATE; fresh fallback repeats authority |
| Retry/concurrency and DB     | Exact terminal lookup precedes mutable Shift convergence; O2 uses its own fingerprints/result with null Decision; real lock/unique-error/rollback/lost-response tests pass; typed constraints and immutable history retained                                                                                                                        |
| Abstraction compatibility    | Reuses exact PresenceShiftAttempt/Operation and transaction-owned helpers; no custody writer broadening, sentinel entity or new generic store                                                                                                                                                                                                       |
| Audit/privacy                | Existing Shift audits unchanged, no second audit or Decision, no exception/challenge consumption, no raw fix/payload persistence; existing maintenance clocks unchanged                                                                                                                                                                             |
| Downstream boundary          | Existing authenticated server recovery returns the exact O result without client state inference; no acquisition, UI or future Task/Dispatch work                                                                                                                                                                                                   |
| Architecture/300 lines       | Extracted focused helper; all changed/new authored code below 300 physical lines; no baseline or suppression changes                                                                                                                                                                                                                                |
| Test adequacy                | Tested cardinalities, proof preservation, current strict policy, distinct targets/cash, rollback, actual unique error, acknowledgement loss and fresh application recovery; no Native/OS hard-crash/deployment claims                                                                                                                               |
| Scope leakage                | No client/Dashboard/dependency/rollout change, no PR/merge/issue closure; only forward 068 added                                                                                                                                                                                                                                                    |
| Gate evidence                | Local static, real migration/runtime and tested failure recovery evidence above; actual remote CI not observed                                                                                                                                                                                                                                      |
| Merge verdict                | MERGEABLE AFTER FIXES: independent re-review and required repository CI remain; no merge performed                                                                                                                                                                                                                                                  |

## Follow-up inventory

- API commands: Start, End, Operation completion type, new convergence helper.
- API tests: new races, fences, proof and snapshot helper; affected enforcement
  assertion now matches the owner's correction without weakening proof guards.
- Database: Prisma enum, forward 068, new convergence integrity/upgrade tests;
  existing completion test recognizes the forward enum extension.
- Documentation: schema/security/public contract, current implementation and
  original historical recovery reports, this correction/evidence/self-review.

Commit/push uses the same branch with message
`fix(shifts): recover converged presence operations`; the final response records
the resulting SHA after native Git verification. Historical 067 is unchanged.
GPS-C and strict rollout are not started. Work is ready for independent re-review,
with CI/merge remaining separate owner workflow steps.
