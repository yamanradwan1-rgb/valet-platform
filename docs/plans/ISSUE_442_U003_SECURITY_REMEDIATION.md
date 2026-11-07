# Issue #442 — U-003 Security Architecture Remediation (2026-11-08)

- **Repository:** `yamanradwan1-rgb/valet-platform`
- **Investigated baseline:** `41dfa50f1a6d721af6511e185e89bd5a6e916368` on `fix/issue-442-retrieval-cancel-state`
- **Scope:** disposable PostgreSQL qualification and documentation; no production Retrieval Outcome API, Native UI, shared writer change or migration.
- **Original qualification:** [U-003 Security Qualification](ISSUE_442_U003_SECURITY_QUALIFICATION.md).
- **Binding implementation plan:** [Issue #442 Retrieval Outcome Reasons](ISSUE_442_RETRIEVAL_OUTCOME_REASONS_IMPLEMENTATION_PLAN.md).

## What the new evidence does—and does not—establish

The original **Read A** is disqualified by a completed Native logout/token rotation overlapping an earlier MVCC snapshot. The original **Read B** is disqualified by the demonstrated second-scope activation after projection and by its potentially incompatible User-security → Location-lifecycle blocking-lock order. The original historical SQL admits malformed/unmatched relevant history. These previous findings remain part of the record.

The new **Read C disposable candidate** uses nonblocking acquisition to avoid waiting while holding locks that could conflict with existing writers. The new historical SQL checks a Task-scoped, versioned Dispatch/Audit chain and terminal proof. PostgreSQL schedules support these limited mechanisms, but only an independent review and the complete supported writer matrix can qualify their production design.

| Workstream | New observed result | Still required |
| --- | --- | --- |
| Scope cardinality | Read-first real second-Membership Shift Start waits behind a held all-Membership lock; subsequent Read C returns neutral. Writer-first second scope yields neutral; inactive Membership reactivation is fenced. | All onboarding/management/force-end paths, cross-Organization multi-scope, admin MFA, real location lifecycle under overlapping locks and final release boundary. |
| Lock order | Read C takes a nonblocking User-security advisory and exact row `NOWAIT` locks. A synthetic opposing User/Location lock cycle returned `55P03` and then allowed the writer, without `40P01`; tested domain writers also serialize. | Verify every shared writer and constraints, whole-transaction/global time budget and lock contention under production-equivalent load. |
| History | Original five files retained. `proof-hardened.sql` and new negative fixtures reject sampled extra unmatched Audit/Dispatch, malformed Task/Request/version links, false transfer after Decline and contradictory release witness. Completion and later Accept scenarios pass. | Broader malformed/legacy chronology and all permitted transfer/Takover variants; no real API response parity or enumeration test yet. |
| Completion compatibility | The original `22P02` disappeared on the worktree-local migration lane; actual Mark Ready→Handoff→Complete passed and 104/105 ledger and enum are verified. | Verify any other CI/test invocations that set a wrong cwd; fix shared bootstrap only under a separately approved change. |

## Candidate Read C — precise disposable transaction contract

`tmp/u003/scope-nowait-candidate.ts` is investigation code, **not an approved production authorizer**. The intended sequence on **one PostgreSQL READ COMMITTED transaction** is:

1. Acquire the staff User-security advisory lock with `pg_try_advisory_xact_lock`; return neutral if another transaction holds it. This is the same hashed `staff-user-security:` key used by the existing staff credential boundary.
2. Revalidate the **exact** Staff Session id, User id, creation timestamp, current token hash, revoked flag and both expiries using `FOR UPDATE NOWAIT`, then require active User with `FOR SHARE NOWAIT` and run existing `lockAndRecheckStaffSessionContext` with already-held locks. Native logout locks the session even when it does not use the per-User advisory.
3. Lock **all existing Memberships** for that User, including inactive/pending, in stable id order `FOR SHARE NOWAIT`; lock their Organizations and active Shifts' Locations, all active Shifts and corresponding MembershipLocationAccess rows with `FOR SHARE NOWAIT`. These locks fence the tested membership-status/role/grant and Shift Start/End writers, including other Memberships.
4. Derive the currently usable field operation scopes **from persisted User → Membership → Organization → Shift → Location → explicit LocationAccess joins**, with active statuses/field roles and exact cardinality **one**. No client-selected Membership, Organization, Location or Shift is authoritative. A User may lawfully hold multiple active Shifts under DEC-032; this outcome read therefore returns neutral when more than one usable scope exists.
5. Read the exact RETRIEVAL Task by id as an *unauthoritative hint*. Verify its persisted Organization and Location equal the locked unique scope before locking the matching ValetSession, Task and original RetrievalRequest rows, `FOR SHARE NOWAIT` in Session → Task → Request order. Nothing in a Task id or historical link grants access.
6. Run `proof-hardened.sql` as one coherent parameterized statement within the held transaction. A positive projection then repeats the exact credential/session recheck **after** the history query to catch expiry while SQL was executing (a deterministic induced-expiry test passed); this is still a database transaction boundary rather than HTTP serialization authority. Return only `GUEST_CANCELLED`, `TAKEN_BY_ANOTHER_EMPLOYEE` or `COMPLETED` after all checks agree. Otherwise return neutral. Release locks only on transaction COMMIT/ROLLBACK.

The local candidate sets `statement_timeout=1500ms` and `lock_timeout=150ms` **per statement**, handles SQLSTATE `55P03`, `57014` or `40P01` only after rollback, and uses nonblocking `NOWAIT`/try locks to avoid new blocking edges. The timeout values are probe choices and are **not** an approved end-to-end deadline. A production route would need one bounded request/deadline model and a final HTTP authorization/response contract.

### Scope protection and negative-space invariant

Locking one current Shift is insufficient: a second usable Shift can be inserted under another Membership. Under current writers, real Shift Start takes target Membership `FOR UPDATE` before inserting a Shift ([Shift authorization](../../apps/api/src/modules/shifts/shift-authorization.ts)); management role/status/grant changes acquire target Membership `FOR UPDATE`; the current onboarding flow takes the User-security advisory before introducing a Membership. A User-global active-Shift index would contradict [DEC-032](../decisions/DEC-032_SHIFT_OPERATIONAL_ELIGIBILITY.md). Read C tries to hold all present Membership rows plus User advisory instead. Existing Force End may update the Shift without the target Membership row, so the read locks active Shift rows too.

The all-Membership lock approach must be re-evaluated for **any** existing or future writer that introduces a Membership without the User-security advisory, changes eligibility without locking a protected Membership/Shift/Org/Location/Grant row, or bypasses a shared lock. Its correctness depends on the actual writer inventory and transaction boundaries, not on the SQL read alone.

## Lock-order graph and tested conflicts

| Writer | Source order relevant to Read C | Read C's behavior / exposure |
| --- | --- | --- |
| Native logout | refresh credential / Staff Session `FOR UPDATE` → revoke Session ([source](../../apps/api/src/modules/auth/staff-auth-logout.ts)) | Exact Session row `NOWAIT` fails closed if logout first; logout waits through reader transaction if reader first. |
| Token refresh/login | staff User-security advisory → Staff Session and credential updates ([source](../../apps/api/src/modules/auth/staff-auth.service.ts)) | Reader uses `try` advisory, returning neutral under conflict. Existing credential recheck is held through projection. |
| Shift Start | Org-management/shared Location lifecycle → credential/Session → User `FOR SHARE` → Membership `FOR UPDATE` → Shift insert ([source](../../apps/api/src/modules/shifts/start-shift-command.ts)) | All-Membership `FOR SHARE NOWAIT` fences a new Shift on a second Membership in tested orders; conflicting reader returns neutral. |
| Shift End / Force End | Scope/Shift row locks; Force End can lock target Shift without target Membership | Reader locks every active Shift `FOR SHARE NOWAIT`. Real End and direct Shift invalidation schedules tested; Force End source only. |
| Management role/Location grant | MFA Session and User rows → staff management Org advisory → Membership `FOR UPDATE` → grant/status changes | Reader uses `NOWAIT` for User/Membership rows; complete MFA writer-first/read-first path remains to be tested. |
| Location stop/resume | optional Org settings advisory → Location lifecycle `EXCLUSIVE` → admin MFA Session/User → Location row writes ([source](../../apps/api/src/modules/management/management-location.service.ts)) | Reader avoids blocking on Location advisory by relying on protected User/Location rows, but real lifecycle interleavings remain to be qualified. |
| Guest cancellation, Start Retrieval, Complete Handoff | physical ValetSession `FOR UPDATE` → Task / Request locks, specialized domain writes | Reader locks ValetSession then Task then Request `FOR SHARE NOWAIT`; tested Guest cancellation/reassignment/Completion overlap samples. |
| Reassignment | Task `FOR UPDATE` → current and replacement eligibility locks ([source](../../apps/api/src/modules/dispatch/reassign-task-command.ts)) | Reader does not wait for Task `NOWAIT`; initial Task lookup is nonauthoritative and unprotected until scoped locks. |
| Emergency Takeover | Session `FOR UPDATE` → settings Org → credential/Staff Session → Task → eligibility | Read C returns neutral under row contention; Emergency Takeover relationship remains separately authorization-gated (DEC-107 Proposed). |

**Caution:** the nonblocking scheme is an architectural proposal with tested examples, not proof that all production writers are deadlock-free. The old Read B `40P01` synthetic interleaving remains reproducible and is not erased by this new result.

## Historical SQL proof

`tmp/u003/proof-hardened.sql` is a local 200+ line prototype built around exact scoped Task and Session joins. The SQL requires one `QUEUED` Dispatch plus one Dispatch for each Task version advance, corresponding Audit pairs for operations requiring Audit, strict from/to version increments, exact statuses and actor/recipient/previous-holder consistency, and no additional relevant unmatched witness. It uses *Task version* for ordering; timestamps support pair matching rather than independent order. Current owner is checked against the terminal edge.

- **Assignment/Acceptance/Transfer:** same committed Task, explicit Membership recipient and actor, previous-owner semantics, valid state changes, no unrelated QUEUED access. A direct last owner-changing `REASSIGNED` from the viewer to current different holder proves transfer even if the recipient later Accepts; Decline→unrelated Assignment is neutral. In-progress Emergency Takeover stays neutral absent separately qualified source.
- **Guest cancellation:** exact cancelled Task and corresponding cancelled Request created in same episode and with canonical persisted `requested_by_type='CUSTOMER'`, guest actor with null membership, cancelled Dispatch with null new holder and correct prior holder, scoped `RETRIEVAL_CANCELLED` Audit, timestamp and terminal version coherence. A new Retrieval Task on the same ValetSession does not transfer the old result.
- **Completion:** exact completed Task, Request and Session, current holder equals completion actor, terminal Dispatch/Audit pair, matching `VALET_SESSION_VEHICLE_RELEASED` Audit with exact Session entity/type, Membership actor and Task id, one same-Task witness even across different timestamps, and RELEASED key custody evidence at the same operation time, final Session version and timestamp consistency.
- **Corruption:** test fixtures append orphan/malformed/conflicting Audit/Dispatch records, because production audit/history has an immutable relation trigger (`ISSUE300_AUDIT_RELATION_IMMUTABLE`). Tampering with existing Audit rows is rejected by the database and is **not** treated as a valid simulated malformed-history test.

A check of a representative chain is not a formal proof for arbitrary legacy histories. The final result must be neutral on any unproven episode, conflicting owner edge, partial migration history or unsupported Emergency Takeover pair. Do not add historical entitlement or expose audit payloads.

## PostgreSQL compatibility diagnosis

The disposable fixture class [`ShiftTestContext`](../../apps/api/test/shift-test-context.ts) calculates its `repositoryRoot` as `resolve(process.cwd(), "../..")` (line 32), then runs migrations and runtime provisioning from that directory (lines 41–50, 116–139). The **old** U-003 command ran Vitest from the worktree root. That resolved two levels above into the separate, older `/valet-platform` checkout with only 102 migration directories and without `20261029010400_issue352_emergency_dispatch_type`. The actual Issue #442 worktree has 111 directories, including the enum addition and `20261029010500_issue352_emergency_takeover_persistence`.

With cwd set to the **Issue #442 `apps/api` directory**, the fresh disposable database migration ledger reported both 104 and 105 with `finished_at`, public `dispatch_event_type` had 9 labels including `EMERGENCY_TAKEOVER`, and the SQL literal enum cast passed. Actual Mark Ready→Initiate Handoff→Complete Handoff then returned success and the terminal proof returned `COMPLETED`. **No forward migration, manual enum patch, production source cast or schema downgrade was needed.** Source/fixture cwd assumption should receive a separate narrow test-harness review if test commands must run from arbitrary directories.

## Reproduction and data provenance

All probes were executed on the repository's disposable PostgreSQL harness with isolated DB/role per run and normal migration/runtime-role provisioning. The original five `tmp/u003/` files were not overwritten and remain ignored by Git. New supplemental files under the same directory are also local-only and excluded from any documentation commit. Reproducible invocation (PowerShell):

```powershell
cd 'D:\kndoom\valet-platform\tmp\issue-442\apps\api'
pnpm exec vitest run --config ../../tmp/u003/qualification.config.mjs --reporter=default
```

Do not run the original root-cwd variant; it silently uses the wrong checkout for the test fixture's migrations. A failing verification test must not be relabeled a successful qualification. All security conditions and performance numbers refer to **local disposable** data only.

### Final executable matrix — correct worktree, after final hardening

The final command shown above completed with **exit 0; 10 test files passed; 61 tests passed; 0 failed; 0 skipped; duration 288.35 seconds**. Its disposable database/role cleanup reported zero remaining DBs, roles and children. This count includes tests that **successfully reproduce old Read A/B security failures** and is not a security sign-off. Every result below is an actual execution or explicitly labeled coverage gap, not a fabricated skip.

| Required scenario group | Observed PostgreSQL evidence | Scope limit |
| --- | --- | --- |
| 1. Native Logout and Token Rotation | Both committed-before-read and overlapping original candidates; Read C revocation and final token expiry checks pass | No real new GET response boundary |
| 2. User and Membership disable | Writer-first/read-first row invalidation and Read C fail-closed tests pass | Real administrative disable path via MFA not exhausted |
| 3. Location Access grant/revoke | Old read-first/writer-first and Read C grant revoke schedules pass; repeated restore/revoke passes | New managed-grant API and high-fanout transitions not exhaustively tested |
| 4. Shift Start/End | Actual Start Shift on second Membership is fenced in both sampled orders; real Shift End read-first and row invalidators pass | Force End, all owner variants and start with concurrent onboarding not fully exercised |
| 5. Additional operational scope | Read B stale-positive exploit reproduced; Read C returns null on second scope and holds all existing Membership rows through commit | All production Membership-creation paths still need qualification |
| 6. Org/Location lifecycle | Direct PostgreSQL deactivation plus Read C writer-first/reader-first invalidations pass | Real management location stop/resume path not fully exercised |
| 7. Reader/writer lock order | Old B synthetic PostgreSQL 40P01 reproduced; C NOWAIT opposing-lock schedule returned 55P03 and allowed writer to commit | Not a complete production lock-cycle proof |
| 8. Guest Cancellation vs Start Retrieval | Real command paths with both Session-lock winner orders pass | Other guest operation permutations not exhaustive |
| 9. Reassignment vs read | Actual supervisor reassignment, transfer-back, recipient Accept and Read C held-read schedules pass | Emergency Takeover held neutral pending separate authority |
| 10. Completion vs read | Mark Ready → Handoff Pending → Complete Handoff passes with correct migrated enum; Read C returns COMPLETED | No actual GET endpoint/response serialization |
| 11. Historical corruption | Six hardened-evidence tests reject sampled orphan/duplicate/wrong Task/Request/version and release evidence, and preserve legitimate cases | No exhaustive arbitrary legacy/corrupt history proof |
| 12. Cross-tenant/location denial | Sampled foreign Organization, wrong Location, unrelated Membership return null | No HTTP status/body/header/timing concealment test |
| 13. Unknown Task | Sampled unknown UUID yields neutral on proof and Read C | Actual 404 indistinguishability untested |
| 14. Dense exact-Task history | 62 versioned relevant Dispatch edges passed, with EXPLAIN ANALYZE BUFFERS | Cold cache and larger real workload untested |
| 15. Lock/statement timeouts | SQLSTATE 55P03 and 57014 rollback/recovery tests pass; C try/NOWAIT returns neutral | No global pool/transaction/HTTP deadline |
| 16. Rollback/retry safety | Rollback of credential/grant invalidation and Read C Membership revocation preserves valid committed authority | Repeated unknown-commit production requests not exercised |

### Historical proof cost — measured, no invented production SLA

`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` plus 25 client-side SQL samples per scenario:

| Scenario | PostgreSQL execution / planning ms | Shared hits / reads | Client p50 / p95 / max ms |
| --- | --- | --- | --- |
| Sparse original Task | 2.676 / 53.433 | 40 / 0 | 12.757 / **16.110** / 39.645 |
| 62 real Dispatch events for exact original Task (30 assign/decline loops + initial queue + cancellation) | 2.888 / 4.479 | 111 / 0 | 11.739 / **14.219** / 15.654 |
| Unknown Task UUID | 1.059 / 5.313 | 17 / 0 | 11.700 / **15.406** / 16.211 |
| Foreign Task | 1.743 / 6.615 | 17 / 0 | 13.589 / **18.514** / 36.620 |

The dense test uses **62 relevant Task-specific Dispatch rows**, unlike the old 10k unrelated same-Session Audit-noise probe. Eight concurrent SQL projections passed. One `55P03` lock timeout and one `57014` statement timeout were reproduced and the transaction rolled back; retry succeeded with current authority. These results do **not** measure full Read C overhead, HTTP latency, cold cache, extreme multi-tenant cardinality or peak concurrent load.

### Read C complete transaction timing

An additional 25-iteration sample per input measured `nowaitOutcome`, including staff User advisory, row locks, operational scope derivation, Task proof and transaction commit:

| Input | p50 / p95 / max (milliseconds) |
| --- | --- |
| Valid original cancelled Task | 18.341 / **51.781** / 108.518 |
| Unknown Task UUID | 9.190 / **16.806** / 17.296 |
| Foreign Task | 8.712 / **10.661** / 13.223 |

In an eight-way simultaneous sample for one User, **2 returned the valid positive and 6 deliberately returned neutral** because the per-User advisory lock was contended. This is a consciously restrictive availability tradeoff; a downstream Client must handle neutral/busy without inventing a positive reason, and a complete HTTP budget and anti-enumeration timing test are not established by these 25 local measurements.

The **final full 61-test rerun** gave a different warm 25-sample Read C set: valid Task p50/p95/max **34.289 / 79.670 / 162.331 ms**, unknown **12.897 / 17.014 / 19.932 ms**, foreign **15.340 / 27.101 / 84.257 ms**. Eight concurrent reads returned **3 positives and 5 neutral**. The same run's hardened SQL EXPLAIN measurements were sparse **4.547 ms execution / 90.849 ms planning, 40 shared hits / 0 reads**, and dense 62 exact Task Dispatch **3.464 ms execution / 5.648 ms planning, 108 hits / 0 reads**; client SQL p95 was **22.409 ms sparse / 26.371 ms dense**. Both sample runs are retained because they expose variance; neither defines an acceptance SLA. Query planning and overall fixture runtimes must not be conflated with warm client p95.

## Independent review and qualification gate

The fresh independent VAYLET Code Review worker (`worker-1`), using the same branch baseline and read-only inspection of new ignored SQL/TypeScript probes plus the real authentication, Shift, management, onboarding, Task, cancellation, custody and Completion writers, issued **BLOCKED — independent U-003 qualification denied**. Its initial adversarial findings identified incomplete persisted Request requester parity, missing exact release Audit entity/actor/Task checks, no post-proof credential expiry fence, absent end-to-end deadline, and absent HTTP concealment/status evidence. The primary subsequently corrected the first three issues in the disposable SQL/Read C candidate, ran a deterministic expiry-after-proof test, and obtained a second independent read-only re-review.

**Latest independent disposition:** the reviewer found **no remaining concrete P1 source defect in those three repaired predicates** within the reviewed scope. It **did not grant sign-off**: the candidate remains unqualified until the remaining P2 architecture and end-to-end behavior gates are proven. Neither review executed PostgreSQL itself; its database observations were independently assessed from the primary's reported test outputs and source, not described as an independently repeated run.

### Outstanding security and architecture blockers

1. **Bounded complete read:** `scope-nowait-candidate.ts` sets 1500 ms `statement_timeout` and 150 ms `lock_timeout` **per statement**. The many-statement transaction has no single budget covering connection-pool acquisition, all SQL statements, rollback, request handling and response delivery. `NOWAIT` on row locks does not exempt table-level locks. A per-request deadline and deadline-exhaustion behavior must be qualified.
2. **Actual HTTP boundary:** no `GET /v1/staff/tasks/:taskId/outcome` exists. The local probe uses `null` for missing Task, foreign Task, revoked credential, ambiguous scope and transient contention. It cannot establish the required distinct **401 invalid/expired authentication**, concealed **404 target/scope**, controlled transient infrastructure response, `Cache-Control: no-store`, or similar observable behavior for guessed vs foreign identifiers. None of those are to be silently chosen in this documentation-only task.
3. **Writer coverage:** actual onboarding/Membership creation, role and location-access management via MFA, location stop/resume, force-end and emergency-takeover full paths still require both writer-first/reader-first deterministic PG barriers, including failure/rollback. The ordinary Shift Start, credential rotation/logout, domain reassignment/cancellation/completion, User/Membership/Org/Location invalidators and synthetic opposing locks were sampled; these do not prove a universal global lock-order theorem.
4. **History/scale:** sampled corrupt append-only events, 62 exact-Task Dispatch records and warm timing do not exhaust legacy chronology, malformed/duplicate release variants, all multi-Organization high-fanout scenarios, cold-cache/contended EXPLAIN or deployed-volume query budgets. Emergency Takeover records are intentionally neutral unless separately authorized and evidentially qualified; DEC-107 remains Proposed.

### Concrete next-stage patch proposal — review only; NOT implemented

No current-source writer change or schema migration was demonstrated as *necessary* to close the reproduced second-Shift race in the tested writer paths. Read C's combination of per-User security advisory, all persisted Membership locks and active Shift/Grant/Org/Location locks is one source-compatible **candidate**, not a binding decision. Before selecting it for production, confirm all relevant writer boundaries and gain explicit acceptance of the chosen nonblocking/fail-closed protocol and its availability trade-off.

The later authorized implementation would extract the current credential revalidator from [`staff-session-revalidation.ts`](../../apps/api/src/modules/auth/staff-session-revalidation.ts), consume existing transaction/lock utilities, and add a **new narrowly scoped read/query module** under `apps/api/src/modules/dispatch/` rather than modifying shared Shift or authentication semantics. A thin [`dispatch.controller.ts`](../../apps/api/src/modules/dispatch/dispatch.controller.ts) integration and an explicitly reviewed result/error contract in `packages/contracts` would map separately proven credential-invalid, concealed-target and transient-busy outcomes. The module should use a single end-to-end deadline propagated to connection acquisition/transaction/statement and response path, exact persisted Task/Session/Request authority, contiguous immutable evidence proof and a final credential fence, without exposing raw event data. These are **proposed file areas**, not source edits or authorization to implement them.

Acceptance tests for this future proposal: PostgreSQL barriers for each writer class in both winner orders; credentials expiring during history evaluation and before response; unknown/foreign/cross-Location UUID response equivalence; exact 401/404/no-store/busy headers, body and latency; bounded transaction/pool wait and cancellation; rollback/retry after `55P03`, `40P01` and `57014`; no stale positive after any real revoker commit; dense exact-Task and concurrent same-User reads with measured p95/p99 under a documented budget. Any writer/invariant change that testing proves unavoidable must be isolated as an explicit owner-approved patch with affected callers, before and separate from the outcome endpoint.

**Final security verdict: BLOCKED — SECURITY ARCHITECTURE DECISION REQUIRED.** The old Read A/B remain disqualified, while Read C and its historical SQL are **partially qualified only as disposable investigations**, not as a production disclosure boundary. The owner-approved U-001 (exact prior Membership assigned/accepted/transferred) and U-002 (direct proven transfer only, terminal proof precedence, Emergency Takeover separately authorized) are unchanged. No new location, role, entitlement or override is approved. The next authorized step is further **read-only/isolated disposable qualification** of missing writer and deadline/HTTP-model evidence, followed by another independent sign-off; production changes require separate owner approval.
