# Issue #442 — U-003 Security Qualification (2026-11-08)

**Verdict: BLOCKED — SECURITY ARCHITECTURE DECISION REQUIRED**

**Examined source revision:** `51976aa8a8ce2e646b2bf149a5d47afd23c782ba` on `fix/issue-442-retrieval-cancel-state`. This is a qualification of a proposed read, not a production route or deployment. The endpoint `GET /v1/staff/tasks/:taskId/outcome` has **not** been implemented.

**Controlling plan:** [Issue #442 Retrieval Outcome Reasons Implementation Plan](ISSUE_442_RETRIEVAL_OUTCOME_REASONS_IMPLEMENTATION_PLAN.md); [Issue #442](https://github.com/yamanradwan1-rgb/valet-platform/issues/442). The owner-approved U-001 and U-002 contracts and original five message cases remain unchanged. U-003 is conditional. The following PostgreSQL probes exercise **disposable local test data**; they do not constitute live endpoint, full production capacity, or physical Android evidence.

## Decision and basis

| Candidate | Authorization and committed-outcome result | Qualification |
| --- | --- | --- |
| **Read A — one READ COMMITTED statement with MVCC authority and Task/history projection** | A pre-revocation snapshot produced `GUEST_CANCELLED` **after real Native logout and access-token refresh committed** while the statement was held at a deterministic barrier. Fresh reads subsequently denied. User, grant, Membership, Shift, Organization and Location writer-first tests also returned the older snapshot while a conflicting writer was uncommitted. | **NOT QUALIFIED** under the approved current-disclosure boundary. A final Staff GET User-only interceptor does not revalidate token rotation, Shift or Location grant. |
| **Read B — credential advisory lock + session row lock, exact Location eligibility row locks, one history projection, transaction-held** | Correctly serialized observed credential/logout and several operational-row revocation schedules. However, a **different active Membership scope** was committed after its positive projection but before its transaction committed; the old positive remained buffered. The candidate also acquires User security before Location lifecycle, in conflict with established Shift writer order; a controlled PostgreSQL lock cycle returned `40P01`. The historical SQL can accept malformed unmatched relevant evidence. | **NOT QUALIFIED AS TESTED**. No safe, writer-compatible ordering and complete scope/evidence fence has been established. |

**Implementation prerequisite:** authorize and qualify a revised U-003 security architecture: resolve exact persisted target scope and identity safely; close concurrent new-scope creation and authorization revocation through the last protected read; establish a deadlock-safe global lock order against existing writers; strictly validate all relevant Task/Request/Session evidence; then run actual-writer races, timeouts, query budgets and independent security sign-off. A new index, migration, altered writer, or different revocation contract would require its own approved scope. Until then the approved Client/Native fallback is the existing neutral/unverified recovery path, without new positive reason assertions.

## Authorization predicates and integrity checks

| Required invariant | Evidence in this qualification | Status |
| --- | --- | --- |
| Exact Staff Session id, User id, creation time, access hash, no revocation and both expiries | Candidate SQL binds all fields; Read B uses `lockAndRecheckStaffSessionContext` and per-User security advisory lock. Real logout/refresh and expiry tests executed. | **B partial pass**; A fails post-commit writer race; B scope race still open. |
| Active User and exact Membership, field role, active Organization/Location, explicit Location Access and active Shift | Read B uses `lockShiftOperationalEligibility` with Location advisory lock and `FOR SHARE` of relevant rows; writer-first/read-first synthetic row invalidations ran. Real Shift end read-first also exercised. | **B partial pass**; multiple live scopes not protected against insert/start; no complete production writer matrix. |
| The same original RETRIEVAL Task, Organization, Location, Session and historical Membership relationship | SQL joins an exact Task UUID, scoped Session and matching Dispatch/Audit assignment/accept/transfer pairs. Positive assigned-without-Accept, same-Membership later Shift, transfer-back and cross-tenant/location denial probes ran. | **Partial pass**; matching pairs alone do not reject all unmatched, malformed, or contradictory relevant history. Valid transfer followed by a later status/version advance can also be reported neutral. |
| Terminal guest cancellation and completion proven by Task/Request/Session and complete scoped audit/release evidence | Re-requesting same Session used a different Task and retained original cancellation proof. READY/HANDOFF_PENDING/COMPLETED route test did **not** complete because Mark Ready returned 500 (see below). SQL completion omits the required vehicle-release witness, final holder/actor equality and full version/timestamp checks; cancellation omits null-new-assignee/previous-holder parity and Task update time. | **Incomplete/failed gate**. |
| No unauthorized, cross-scope, guessed-ID or unowned queued information disclosure | Disposable SQL projections returned no reason in the exercised negative cases. | **Sampled only**; no actual new HTTP route, status/header timing or enumeration test. |
| One coherent committed outcome, bounded waits, compatible lock order | Projection uses one SQL statement inside B, with 9-second statement timeout and 7-second lock timeout in probe transaction helper. Explicit 40ms timeout and rollback tested; 40P01 lock-order cycle observed. | **Not proven**; actual writer compatibility, lock-timeout scheduling, response serialization and end-to-end bounds outstanding. |

The `staff_auth_sessions` resolver proves initial bearer context, but a successful initial resolver is not a substitute for transaction-held revalidation at the point protected information is released. Locking existing rows also does not protect the absence of a second active Membership scope.

## Lock-order graph and compatibility

Notation: **→** means acquired before the next identified boundary; `S` = shared lock, `X` = exclusive lock. These are source-traced orders; they do **not** imply that every pair of operations always conflicts.

| Actor / code | Observed order and important locks | Consequence |
| --- | --- | --- |
| B probe (`tmp/u003/support.ts`) | User-security advisory X → exact Staff Session row FOR UPDATE → Location-lifecycle advisory S → Membership/User/Organization/Location/LocationAccess/Shift rows FOR SHARE → read-only Task/history projection | User-first Location-second ordering and untrusted fixture-derived preliminary scope. |
| Native logout / token rotation (`staff-user-security-lock.ts`, `staff-session-revalidation.ts`, `staff-auth.service.ts`) | User-security advisory X → credential/session and refresh state updates | B credential order serialized the tested logout/rotation winner schedules; A did not. |
| Start/End Shift presence (`shift-presence-security.ts`, `start-shift-command.ts`, `end-shift-command.ts`) | Management-settings Organization advisory S → Location-lifecycle advisory S → staff User-security/session recheck; also Membership/Location/Shift row locks depending on command | **Reverse User/Location acquisition order** relative to B. A cycle is possible when Location is held incompatibly and the writer needs User security. The PostgreSQL helper-cycle test reproduced `40P01`; reachability through a complete production writer transaction needs a targeted test. |
| Guest cancel (`guest-retrieval-cancellation-command.ts`) | ValetSession FOR UPDATE → RetrievalRequest FOR UPDATE → Task FOR UPDATE → scoped audit/dispatch writes | Session-first original lifecycle; its competing Start commit order was reproduced. |
| Start Retrieval (`start-retrieval-command.ts`) | ValetSession FOR UPDATE → management-settings Organization advisory S → actor/location eligibility and its Location advisory S → Task FOR UPDATE → Request and custody writes | Task/session order differs from ordinary Task-first reassignment. |
| Ordinary reassignment (`task-authorization.ts`, `reassign-task-command.ts`) | Task FOR UPDATE → actor/target Location eligibility locks → Dispatch/Audit | A new B design that adds Task locks ahead/behind eligibility needs explicit cycle validation. |
| Mark Ready, Handoff and Complete (`mark-ready-command.ts`, `complete-handoff-command.ts`, relevant locks) | Session-first, Task/Request/eligibility and custody-related locks, with operation-specific sequencing | Completion projection was not verified against committed release proof due to the enum failure. |
| Emergency Takeover (`emergency-takeover-authorization.ts`, `emergency-takeover-locks.ts`) | Session → credential/user boundary → Task/Location and takeover-specific proof/authority | Requires separately authorized #352 evidence; Proposed DEC-107 alone cannot authorize history disclosure. |

**Executed deadlock case:** in the disposable PostgreSQL environment, one connection held Location-lifecycle X and waited for the staff User lock; another held the User lock and waited for Location-lifecycle S. PostgreSQL aborted one transaction with `40P01` and let the other succeed. This is a real two-connection PostgreSQL lock cycle with production lock helpers and deliberately orchestrated ordering, not a claim that the exact same deadlock was reproduced through full Shift HTTP endpoints.

**Executed scope race:** B locked and projected a positive exact Task for Membership 1. A real `startShift` on a different Membership of the same User completed before the first B transaction committed, so the buffered positive survived the new ambiguous scope. A subsequent fresh B call correctly returned null. DEC-032 permits an active Shift **per Membership**; no User-global uniqueness constraint may be assumed.

## PostgreSQL concurrency and domain evidence

The existing five local qualification files in `tmp/u003/` were **preserved**, remain ignored by Git, and are excluded from the documentation commit. They use the repository's disposable PostgreSQL harness and distinct client connections. Existing probes were amended **only locally** to resolve `@nestjs/core` from the API installation, correct a real Shift End request payload and the documented loser HTTP status, add a scope-cardinality race, and collect a Mark Ready diagnostic. No production files were edited.

| Verification | Observed result | Scope of conclusion |
| --- | --- | --- |
| Real Native logout and refresh before old credential projection | **PASS**, A and B deny old credential; refreshed credential recognized as new context. | Old credential revoked before statement. |
| Read A starts, then real logout/refresh commits while A blocked | **PASS as falsification**: A still returns old `GUEST_CANCELLED`. | **A unsafe** under approved release rule. |
| Read B wins before real logout/refresh, or waits behind rotating writer | **PASS**: revoker waits for B commit; writer-first B rechecks and denies. | Credential subset of B. |
| User disable; Membership disable; Location grant removal; Shift end; Organization/Location deactivate, both lock orders | **PASS** for six direct PostgreSQL invalidator families in baseline test; real Shift End read-first passed separately after valid request payload. | Does not establish all real API lifecycle ordering. |
| Session expiry during held authority; rollback of revocation/read; repeated grant revoke and restore | **PASS** in disposal test; B final SQL expiry recheck denied; rollback preserved access. | Current SQL and 9s/7s probe budgets. |
| Same Membership later eligible Shift; different Membership same User; foreign tenant/location, unknown UUID, unrelated member | **PASS** for sampled projection paths; different active scope concurrently added after B proof **reproduced unsafe buffered positive**. | History/identity partial, cardinality **FAIL**. |
| Guest cancel vs Start, with shared Session barrier in both winner orders; new Task after prior cancellation | **PASS** after correcting expected loser HTTP status: Start winner gives late cancel 409; Cancel winner gives late Start 404. The persisted state, task/request and audit/custody effects were asserted. | Domain concurrency subset. |
| Ordinary supervisor reassign, before-Accept/after-Accept, transfer to another, transfer back | **PASS** in original tests. | In-progress Takeover and extended history permutations untested. |
| Corrupted/duplicate cancellation Audit proof | Corrupted unmatched extra audit **still returned positive**; later second matching conflicting audit caused null. | **Historical proof completeness FAIL** against stated U-003 gate; test expectation itself is too permissive. |
| Concurrent identical reads; cancellation timeout; explicit deadlock | **PASS** 3 A parallel reads, B credential serialization, 40ms SQLSTATE `57014` and rollback, and SQLSTATE `40P01` deadlock-cycle reproduction. | No production latency or complete actual-writer lock-order qualification. |
| READY / HANDOFF_PENDING / completed release evidence | **FAILED**: existing Mark Ready HTTP returned 500; direct command diagnostic returned PostgreSQL `22P02`: enum `dispatch_event_type` rejects `EMERGENCY_TAKEOVER` in the disposable test schema, queried from `handoff-takeover-proof-guard.ts`. | Completion and post-handoff proof **NOT RUN**. This is an observed source/schema compatibility problem on this baseline, not proof of a production outage. |

**Harness history:** first completed suite after fixing initial test-module resolution: **29 passed, 3 failed of 32** (cancellation loser status assumption, invalid Shift End payload, and Mark Ready enum failure). Focused reruns confirmed the corrected cancellation and real Shift End tests passed, and the new B scope test passed; Mark Ready continued to fail. The final all-executable-subset run on the same SHA, explicitly excluding only the Mark Ready/Completion test with a negative test-name filter, completed with **32 passed, 1 skipped of 33, exit 0**. This is **not** a full-suite pass, since the completion proof is still untested. The 32 passing tests include reproductions of disqualifying security behavior; passing a falsification probe is not qualification.

## EXPLAIN (ANALYZE, BUFFERS) and timing

Real `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` used the disposable database, with 30 client-side repeated reads per case. PostgreSQL plan execution times are distinct from wall-clock client request latency.

| Input / workload | PostgreSQL execution (ms) | Planning (ms) | Shared hits/reads | Client p50 / p95 / max (ms) |
| --- | ---: | ---: | --- | --- |
| Exact sparse Task and its history | 0.670 | 4.314 | 54 / 0 | 7.177 / **10.815** / 18.999 |
| Exact Task, 10,000 unrelated same-Session Audit noise events | 0.831 | 8.797 | 50 / 0 | 9.463 / **11.899** / 12.327 |
| Unknown Task UUID | 1.140 | 7.931 | 23 / 0 | 7.327 / **10.589** / 10.985 |
| Other Organization/Location Task | 0.490 | 3.748 | 23 / 0 | 7.308 / **8.925** / 9.632 |
| B transaction-held authority + proof (30 iterations, wall-clock) | — | — | — | **14.989 / 18.166 / 28.725** |

The final 32-pass subset reran EXPLAIN as well, with different local sample values: sparse p95 7.950ms, dense p95 9.626ms, unknown p95 9.943ms, foreign p95 15.810ms, held B p95 14.421ms. The table above preserves the first complete 30-sample run instead of replacing its observations; both runs are evidence of local variance.

Plan inspection showed indexes for the access token, composite Task lookup, Dispatch event scope/time and Audit scope/time; Shift used the existing `shifts_one_active_per_membership_idx`. The synthetic dense case added 10,000 unrelated audit rows, not 10,000 relevant Task history edges. This supports only a local **sample** under light contention; it cannot qualify worst-case history growth, cold buffers, parallel readers, lock waits, response budget or real deployed production data. No index or migration change is authorized here.

## Independent review

A separate read-only VAYLET Code Review-style security reviewer (COS worker `worker-1`, review run `30fd0bfb-146e-4de7-a225-0e3caba58c74`) inspected the exact source SHA, owner-approved plan/decisions, `proof.sql`, probe definitions, credential, Shift, Dispatch, cancellation, Handoff and lifecycle writers and relevant schema/migration sources. **Its final verdict: BLOCKED — SECURITY ARCHITECTURE DECISION REQUIRED; independent U-003 sign-off DENIED.** The reviewer performed an independent source audit, did not modify files, and did not independently rerun PostgreSQL tests.

The review reported these findings:

1. **P1 credential release:** A can disclose the pre-revocation reason after Native logout/access rotation commits.
2. **P1 incompatible locks:** B locks User-security before Location lifecycle while Shift presence and management lifecycle writers may lock Location first and then request credential/session security; the PostgreSQL synthetic interleaving reproduces `40P01`. Real writer path and compatible ordering remain unqualified.
3. **P1 insufficient evidence rejection:** `proof.sql` inner-joins only matching Dispatch/Audit records and omits a full ordered Task version chain. Malformed, unmatched, and duplicate relevant events can be ignored.
4. **P1 terminal proof gaps:** COMPLETED does not require the vehicle-release Audit, owner/actor parity, full version chain and timestamps. CANCELLED does not require all canonical Dispatch owner/null fields, Task update time and session version consistency.
5. **P2 false neutral transfer:** `proof.sql` requires reassignment version to equal the current Task version and restricts Task status to ASSIGNED/ACCEPTED, missing legitimate later Accept or Start progression; Emergency Takeover is separately gated and DEC-107 remains Proposed.
6. **P2 cardinality and performance:** B protects only the hinted membership/location; the original active-scope count can become stale. This was subsequently reproduced by the primary disposable PG #46 probe. Local 30-sample timings, timeouts and omission of final HTTP route tests are insufficient for production qualification.

These independent findings were cross-checked against the local probe outcomes and source references before being included here. They **deny qualification**, not approval for a particular replacement design.

## Reproduction and remaining prerequisites

From the existing Issue #442 worktree (`D:\\kndoom\\valet-platform\\tmp\\issue-442`), with the supported local disposable PostgreSQL harness and installed dependencies:

~~~powershell
git rev-parse HEAD
git status --short --branch
pnpm exec vitest run --config tmp/u003/qualification.config.mjs --reporter=verbose
pnpm exec vitest run --config tmp/u003/qualification.config.mjs --reporter=verbose -t '^(?!.*30/35)'
~~~

These temporary files are investigation assets and **not part of the pushed documentation**. The last command isolates the currently executable subset while explicitly excluding the failing completion path; it must not be mistaken for a whole-suite pass.

Before requesting U-003 qualification, design/approve a minimal compatible read boundary; prove all current auth/operational locks through response release (including new Membership/Shift scope); handle lock-order cycles without speculative locks; make the historical SQL fail closed on missing, duplicated, malformed, unmatched or contradictory scoped events; prove terminal completion with the required release witness and Emergency Takeover provenance when supported; reconcile the observed enum-schema mismatch through an authorized separate task; execute real writer-first/reader-first tests, complete timeout/deadlock matrix and representative larger-history EXPLAIN; and obtain independent security sign-off. Maintain exact Task UUID concealment and the approved five-case UI boundary.
