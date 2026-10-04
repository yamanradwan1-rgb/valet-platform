# GPS-B consumer-contract correction — Issue #257

## Follow-up: evidence-free exact recovery

The subsequent owner-authorized correction adds optional top-level `operationId`
to Start/End without changing public Presence evidence or response shapes.
Matching evidence selectors remain compatible. Correlated OFF completion has no
Decision and uses typed migration-067 provenance; WARN_ONLY missing evidence uses
the known O; strict missing evidence recovers DENIED/PRESENCE_REQUIRED with null
summary. The B1/B2/B3 contracts documented below are preserved. Current evidence
and scope are in
[GPS_B_NO_MEASUREMENT_RECOVERY_REPORT.md](GPS_B_NO_MEASUREMENT_RECOVERY_REPORT.md).
This report's original base/branch/validation sections describe the prior 066
correction, not the current 067 branch.

Date: 2026-10-04. This is the owner-authorized server correction discovered when
GPS-C correctly stopped before Native implementation. It provides B1/B2/B3;
it does not implement GPS-C or activate production strict Presence.

## A. Git and ownership

Actual fetched origin/main base: `15ff51d5eb937f72db3bc35c1618e89ece8cf08a`.
The starting Windows Git working tree was clean. Branch
`fix/257-gps-c-server-contract` was created directly from that base, independently
of the empty GPS-C branch. Final commit/remote SHA and clean-tree result are
supplied in the final Git handoff. No PR, merge or Issue closure is authorized.

### Contract and scope ledger

| Behavior                                                 | Authority and classification                                    | Identity/persistence/retry/privacy                                                                                                   |
| -------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Current action mode and bounded challenge guidance       | Owner correction sections 3/4/12/13; canonical plan G; LOCKED   | Persisted User/member/Organization/Location and exact START target or END Shift; settings/lifecycle guards; no zone/admin projection |
| Safe terminal measured summary                           | Owner sections 5–7/11; DEC-099 enums/retention; LOCKED          | Owned Operation result; two enum columns, atomic denial; existing terminal immutability; no employee fix/history payload             |
| Fresh exception Operation B                              | Owner sections 8–10; DEC-099/100; LOCKED                        | Fresh User/operation UUID, exact current target/cash; A stays terminal; current override/reviewer authority; no automatic POST       |
| Nullable pending exception selector                      | Owner sections 16/17 exact lost-exception GET recovery; DERIVED | Existing exact authorized Operation → Challenge → Exception relationship; safe UUID only; no new allocation/replay                   |
| Guarded policy read and pure reason mapper               | Owner sections 4/9; DERIVED                                     | Existing guarded policy/evaluator contracts; no new authorization or geometry authority                                              |
| Native, Web, Dashboard, camera, tracking, strict release | Owner sections 2/13/18/20; FORBIDDEN                            | No source read/change to Employee Web; no client integration or release-gate edit                                                    |

Affected entities: Organization, Location, User, OrganizationMembership,
LocationAccess, StaffAuthSession, Shift, ShiftPresenceOperation/Challenge/Exception.
No ValetSession or Task/Dispatch transition changes; Shift ACTIVE → ENDED and
ordinary cash/open-work/force-end behavior remain unchanged. This is existing MVP
Presence, with per-field Company-default/Location-override inheritance. No new
index or policy setting is necessary. Implementation-critical unresolved policy:
none under the supplied explicit owner contract.

Docs were updated before implementation: public consumer contract, schema and
security additions. No historical migration or accepted DEC was rewritten.

## B. B1 — current employee-safe action guidance

Both POST challenges and exact GET challenge now return:

```text
operationId, challengeId, action, locationId, shiftId, issuedAt, expiresAt,
presence: { mode, maxAccuracyMeters, maxFixAgeSeconds }
```

Mode is OFF/WARN_ONLY/REQUIRE/REQUIRE_OR_OVERRIDE for this action only. Accuracy
is integer 1..200 m; age is integer 1..120 s. Values use independent per-field
inheritance. ISSUE and GET describe current effective policy within their guarded
transaction, not a retained issuance snapshot. Final Shift commands evaluate the
then-current configuration; guidance is neither readiness nor permission to act.
No zones, manager authority, Company values/overrides or fingerprint are exposed.
Legacy clients need no challenge; old Start/End success schemas remain unchanged.

`readGuardedShiftPresenceConfiguration` extracts the existing guarded read;
callers already own settings/lifecycle guards. ISSUE reads configuration after
current target authority and before allocation. Exact challenge/exception paths
read configuration after current authority and before locking the lower Operation.
They do not acquire a new settings guard after Operation/Challenge locks.

Real HTTP tests cover OFF, Company WARN_ONLY, Location override, independent END,
accuracy/age inheritance, current GET, concealed foreign selectors and unchanged
legacy success. Barrier tests show a policy writer waits for challenge commit or
rollback. A final measured command uses the resulting current mode, and a separate
OFF-issued challenge followed by strict policy denies outside evidence safely.

## C. B2 — durable minimized denial

Forward migration:
`20261004006600_shift_presence_consumer_denial/migration.sql`.

Operation gains nullable existing-enum columns `denial_classification` and
`denial_measurement_reason`. SQL requires both null or a consistent non-inside
pair on DENIED/PRESENCE_REJECTED with bound request and policy fingerprints. It
rejects partial null pairs, inside summaries, unrelated outcomes/reasons and
contradictory classification/reason. Existing guards reject terminal updates by
both runtime and owner. Historical denials remain null; no fabricated backfill.
Prisma mirrors the enum fields, and runtime provisioning/verification grants only
these two additional result-column UPDATE privileges, never broad UPDATE/DELETE.

Every RECOVERABLE result now requires `summary`, explicitly null or
`{ classification, reason }`. Only measured PRESENCE_REJECTED may carry it.
APPROVER_AUTHORITY_REVOKED/PRESENCE_REQUIRED and other terminal outcomes return
null. The shared schema rejects invalid pairs/private fields and preserves its
refinement when extended into recovery. Outer EXPIRED remains unchanged. Recovery
ends at 14 days; minimized facts remain on the 90-day tombstone without widening
the recovery horizon. No new 24-month Decision is created for a denial.

Real lost-HTTP/new-Nest tests recover OUTSIDE, EDGE, INACCURATE_FIX, STALE_FIX,
FUTURE_FIX and NO_ACTIVE_ZONE from the exact persisted Operation, with no Shift,
Decision, exception or automatic B allocation. Tests inspect retained rows,
audit, logs and responses for forbidden employee measurement fields/capture time.
Synthetic zone coordinates remain separate configuration. Enum results contain
no latitude/longitude/accuracy/age/distance/capturedAt/request body. Existing
observer/privacy and runtime-role tests also pass. Fresh versioned migrations and
representative pre-066 denied data upgrade were executed, not schema sync.

## D. B3 — explicit terminal A → fresh B

1. A's measured request fails; server atomically terminalizes DENIED and its
   minimized summary. Employee reconciles A exactly. A cannot request an exception
   or return to PENDING/COMMITTED, and its fingerprint/result cannot be changed.
2. Explicit employee approval intent allocates fresh B for the same current START
   Location or exact current END Shift/current canonical cash. Challenge B must
   currently report REQUIRE_OR_OVERRIDE. No automatic B is allocated.
3. Explicit exception request uses the accepted controlled reason. The shared
   `shiftPresenceMeasuredDenialExceptionReason` maps validated server OUTSIDE to
   OUTSIDE_ZONE, EDGE to AMBIGUOUS_FIX, and unusable GPS to GPS_UNAVAILABLE. It
   returns null for configuration/inside outcomes. Local permission failure uses
   LOCATION_UNAVAILABLE; services/acquisition failure uses GPS_UNAVAILABLE.
   Configuration failure is never locally translated to outside.
4. Manager approves B under existing authority/MFA rules. Approval alone changes
   no Shift. Employee explicitly submits B's EXCEPTION evidence. Current requester,
   original approver, target/cash, lifetime and cash/open-work rules remain DEC-100.

START and END HTTP tests prove exactly one business effect/decision and unchanged
exact A recovery. END test binds A to cash 1, B to current cash 2, rejects cash 3
under B without consuming approval, then commits canonical cash 2. Ordinary
approved command convergence cannot create another effect. REQUIRE still denies
exception requests. Existing approver-revocation/authority races remain green.

PENDING exact operation GET includes nullable `exceptionId`. This is derived from
the exact authorized relationship, not caller-provided scope or an allocation.
Lost B challenge response recovers status/challenge by GET; lost exception
response recovers this selector and then exact exception GET. No exception POST
must be repeated. Pending alone never means approved. B's challenge/exception
calls consume normal User quotas; count assertions and existing randomized-ID,
shared-status and Retry-After threshold tests pass.

## E. Validation and evidence

The task-owned `gpsb-consumer-257` container uses PostgreSQL 16 on local port 55440,
max_connections=250. A generated disposable password/URL stayed outside Git and
was never printed. Standard profile used one worker; race profile used two,
within the existing harness budget. Test contexts provisioned real runtime roles,
ran versioned migrations and cleaned their own databases/roles. No timeout,
assertion, structure baseline, production gate or resource profile was weakened.

Final focused API command, with TEST_DATABASE_URL set from the private task URL:

```powershell
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/shift-presence-consumer-policy.integration.test.ts test/shift-presence-consumer-recovery.integration.test.ts test/shift-presence-consumer-continuation.integration.test.ts test/shift-presence-consumer-integrity.integration.test.ts test/shift-presence-consumer-policy-races.integration.test.ts test/shift-presence-forward-migration.integration.test.ts test/shift-presence-http.integration.test.ts test/shift-presence-enforcement.integration.test.ts test/shift-presence-recovery.integration.test.ts test/shift-presence-exceptions.integration.test.ts test/shift-presence-approver.integration.test.ts test/shift-presence-anti-abuse.integration.test.ts test/shift-presence-anti-abuse-privacy.integration.test.ts test/shift-presence-failure.integration.test.ts test/shift-presence-current-authority-races.integration.test.ts
```

PASS: **15 files, 94 tests** (standard 10/67, race 5/27). New consumer files
contribute **29 tests**; existing affected families contribute 65. Evidence includes
actual Nest HTTP disconnect after denial/allocation/exception commit, a new Nest
application exact read, actual PostgreSQL lock-wait witnesses with commit/rollback/
unknown acknowledgement branches, and actual runtime backend termination before
protected COMMIT with no ghost business result. No OS SIGKILL claim.

```powershell
pnpm --filter @valet/contracts exec vitest run src/shift-presence-consumer.test.ts src/shift-presence-public.test.ts src/shift-presence.test.ts src/shift-presence-management-result.test.ts
pnpm --filter @valet/contracts typecheck
pnpm --filter @valet/api typecheck
pnpm --filter @valet/database typecheck
pnpm --filter @valet/contracts build
pnpm --filter @valet/api build
pnpm --filter @valet/database prisma:validate
node scripts/gps-b-validation.mjs
git diff --check
```

Contracts PASS: **4 files, 46 tests**, including 17 new consumer tests. Package
typechecks, contracts/API builds and Prisma validation PASS. Prisma used the
private task MIGRATION_DATABASE_URL. Scoped structure/import/Prettier/ESLint/diff
checks PASS; all changed authored files remain below 300 physical lines. Historical
058–065 SQL and earlier migrations are unchanged. No Web-reading broad gate ran.
Focused formatting used `pnpm exec prettier --write` on the changed applicable
files only; the complete inventory is the Git diff against the recorded base.

Intermediate failures were corrected and reverified:

- Before implementation, new shared tests reproduced 13 absent-contract failures.
- Initial database invocation could not authenticate using default local valet
  credentials. A separate owned disposable PostgreSQL container resolved this;
  no user's database/password was changed.
- Initial recovery tests queried a nonexistent audit column and backdated a stale
  fix before the challenge's five-second allowance. They now inspect actual audit
  rows and test staleness within the challenge window; all cases pass.
- Initial race fixture left END strict while changing START, correctly hitting
  closed strict rollout. The fixture now isolates START with END OFF; no gate was
  changed. Commit/rollback/unknown branches pass.
- Existing disconnect helper terminated the preceding new limiter transaction,
  producing 503 on status rather than reaching the protected-read 500 test. It now
  targets only a transaction that accessed Presence operations, still verifying
  the exact backend before termination. Existing 500/no-ghost assertions remain
  unchanged; all 10 failure tests pass.
- Prisma initially lacked required MIGRATION_DATABASE_URL; configured rerun passes.
  ESLint found an unused test destructuring variable; it was removed, not suppressed.

### Self-review with VAYLET code-review skill

Review target is the complete tracked/untracked correction against the base,
including SQL, Prisma, runtime grants, public schemas, tests and docs. All 12 skill
passes were applied. No scope leakage, target-authority regression, terminal
mutation, raw GPS retention, new generic abstraction or missing consumer contract
was identified in the reviewed diff. This is implementer self-review, not an
independent human review or remote CI result.

Authority trace: controller authenticates current staff session, applies the
existing User limiter, then command guard acquires settings/lifecycle before
persisted current target authority. ISSUE performs no allocation before that
proof; exact result/challenge/exception reads reprove owned scope before lower
Operation locks. Start/End preserve ordinary authorization/cash/open-work order;
denial summary writes occur only after bound request/current evaluation in the
existing transaction. Terminal result writes commit atomically before controlled
denial is returned. Exact pending exception lookup uses full persisted scope.
Successful actions retain existing atomic Shift/Decision/consumption/audit paths.

Security/tenant, retry/concurrency/DB, abstraction, audit/privacy, downstream,
architecture and test verdicts: no unresolved blocker identified for this focused
correction. Merge verdict: **BLOCK MERGE** until independent review and actual
required remote CI; this task creates no PR or merge.

| Evidence level         | Observed scope                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| IMPLEMENTED            | B1/B2/B3 server/contracts/migration/docs only                                                         |
| STATIC VERIFIED        | Scoped lint/format/import/structure, three package typechecks, Prisma                                 |
| LOCAL COMMAND VERIFIED | 94 API/PostgreSQL + 46 contracts tests, API/contracts builds                                          |
| RUNTIME VERIFIED       | Owned PostgreSQL 16, real grants, Nest routes and authoritative rows                                  |
| FAILURE VERIFIED       | HTTP response loss; fresh Nest reconstruction; real backend termination; SQL commit/rollback barriers |
| CI VERIFIED            | NO actual remote run observed                                                                         |
| PHYSICAL ANDROID / iOS | NO; no Native work in this task                                                                       |

## F. Scope assertions

Server changed: YES. Contracts changed: YES. Forward migration: YES, 066.
Historical migration changed: NO. Native changed: NO. Dependency/lockfile changed:
NO. Dashboard UI changed: NO. Employee Web read/changed: NO/NO. Background tracking,
attestation and camera/#262 changes: NO. Strict rollout enabled: NO. GPS-C/GPS-D
started: NO. PR created/merge performed/Issue #257 closed: NO/NO/NO.

## G. Remaining gates

This consumer correction is reviewable with the listed available evidence. Actual
remote CI and independent review remain required before merge. GPS-C implementation,
native permission/configuration/APK/device/privacy/lifecycle acceptance, the separate
iOS physical gate and GPS-D complete acceptance are future work. Strict release
remains closed. No unavailable hardware or production-deployment claim is used to
explain away a server-contract or test failure.

READY FOR CHATGPT REVIEW — GPS-B CONSUMER CONTRACT
