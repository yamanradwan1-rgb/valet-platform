# Issue #276 — Parking history domain cardinality review

Date: 2026-10-09
Scope: read-only independent review for Focused P1 Recovery §4. No production source, migration, fixture, index, or history mutation was performed.

## Decision

The current production workflow does **not** support forty completed Parking Tasks for one ValetSession as an ordinary lifecycle. The correct current classification is:

`APPLICATION_PROHIBITED_BUT_DB_NOT_ENFORCED`

This is not a hard historical-size bound. Accepted DEC-034 deliberately enforces uniqueness only for active Tasks and states that `COMPLETED` / `CANCELLED` rows do not block a later distinct Task when a later accepted workflow legitimately creates one (`DEC-034_TASK_DISPATCH_PERSISTENCE_FOUNDATION.md:160-177`). The binding state machine also reserves `RETRIEVING -> PARKING` for a future focused guarded exception flow (`04_VALET_SESSION_STATE_MACHINE.md:302-312,424-455`). No such production flow is currently accepted/implemented. Dense history therefore remains a required adversarial/performance case under DEC-102/103; a reader must not assume max=1 or impose a cap from the current application shape.

## Seven §4 questions

| # | Question | Answer / classification | Evidence |
|---|---|---|---|
| 1 | Can one ValetSession legitimately have multiple `COMPLETED PARKING` Tasks? | **Current production: no. `APPLICATION_PROHIBITED_BUT_DB_NOT_ENFORCED`.** A later accepted return-to-parking workflow could make a later terminal Parking Task legitimate; no such flow exists today. | Queue requires `AWAITING_PARKING` before creating/returning a Parking Task (`queue-parking-task-command.ts:59-86`). Confirm Parked changes exact `IN_PROGRESS -> COMPLETED` and `PARKING -> PARKED` (`confirm-parked-mutations.ts:10-25,28-58`). Current staff post-parking projection treats `completedParkingTasks.length !== 1` as corrupted (`staff-valet-session-authorization.ts:92-107,136-168`; regression `staff-valet-session-projection-and-invariants.integration.test.ts:177-201`). DEC-034:160-177 is the future-compatibility caveat. |
| 2 | Can the same physical custody lifecycle return to Parking more than once? | **Not in the current executable workflow. `APPLICATION_PROHIBITED_BUT_DB_NOT_ENFORCED`.** | State machine allows `RETRIEVING -> PARKING` only after a focused exception flow defines guards (`04_VALET_SESSION_STATE_MACHINE.md:302-312,424-455`). DEC-044 explicitly excludes defining/authorizing that post-start reset (`DEC-044_GUEST_PRE_START_RETRIEVAL_CANCELLATION.md:15-16,46-63`). No production command implementing return-to-parking was found. |
| 3 | Is a completed Parking Task terminal? | **Yes in the accepted domain. Transitioning it afterward is `APPLICATION_PROHIBITED_BUT_DB_NOT_ENFORCED`.** | Accepted DEC-034 canonical path ends at `COMPLETED` (`DEC-034:9-13`) and calls `COMPLETED`/`CANCELLED` terminal (`DEC-034:160-177`). Operational mutation types exclude terminal statuses and task projection rejects them (`dispatch-types.ts:5-18,62-69`). PostgreSQL has no terminal-row immutability/FSM trigger. |
| 4 | Can Task owner/version be modified after completion? | **Supported writers: no. PostgreSQL/runtime privilege: yes. `APPLICATION_PROHIBITED_BUT_DB_NOT_ENFORCED`.** | Confirm Parked mutates only exact `IN_PROGRESS` + expected version + owner (`confirm-parked-mutations.ts:10-25`). Runtime provisioning grants `SELECT, INSERT, UPDATE` on `tasks` (`runtime-table-privileges.mjs:45-51,184-190`), and the runtime-role integration test proves a direct Task status/assignee/version UPDATE succeeds (`task-dispatch-runtime-role.integration.test.ts:103-121`). The Task CHECK permits terminal rows without an immutable owner/version rule (`20260812002000.../migration.sql:27-46`). |
| 5 | Do accepted writers prevent multiple completions? | **Yes for the current normal workflow; enforcement is application-only. `APPLICATION_PROHIBITED_BUT_DB_NOT_ENFORCED`.** | Queue is gated by `AWAITING_PARKING` (`queue-parking-task-command.ts:59-61`); Confirm Parked has Task and Session CAS/state guards (`confirm-parked-mutations.ts:16-24,36-45`); DEC-098 cancellation is pre-custody only and terminal, and says the queue's locked `AWAITING_PARKING` predicate prevents regeneration (`DEC-098_PRE_CUSTODY_PARKING_CANCELLATION.md:14-20,50-55`). |
| 6 | Does PostgreSQL independently enforce those invariants? | **No. `APPLICATION_PROHIBITED_BUT_DB_NOT_ENFORCED`.** | Migration enforces Task scope/assignee shape and only one **active** `(valet_session_id, task_type)` via partial unique index for `QUEUED/ASSIGNED/ACCEPTED/IN_PROGRESS` (`20260812002000.../migration.sql:27-46,81-86,103-131`). There is no unique terminal Task constraint, terminal-transition trigger, immutable owner/version rule, unique `DispatchEvent(COMPLETED)` per Task, or DB constraint requiring the canonical Audit pair. |
| 7 | Could imported, legacy, corrupted, or privileged-runtime data violate them? | **Yes. `APPLICATION_PROHIBITED_BUT_DB_NOT_ENFORCED`.** | Ordinary runtime already has Task INSERT/UPDATE (`runtime-table-privileges.mjs:184-190`). Runtime may append Audit and Dispatch history while UPDATE/DELETE/TRUNCATE on append-only history is revoked (`provision-append-only-tables.mjs:60-94`; `task-dispatch-runtime-role.integration.test.ts:124-171`). A migration/admin/import role can therefore also persist DB-valid terminal cardinalities that normal writers would never create. |

## PostgreSQL enforcement boundary

The Task migration is deliberately narrower than the application state machine:

- `tasks_assignee_status_check` validates assignee shape only (`migration.sql:40-45`).
- `tasks_one_active_per_valet_session_task_type_idx` covers only four active statuses (`migration.sql:84-86`).
- exact Organization/Location/ValetSession Task scope and Dispatch-to-Task scope are enforced by composite foreign keys (`migration.sql:103-131`).
- no constraint caps historical terminal Tasks per session/type.

Therefore a 40-completed-Task fixture is adversarial rather than current-domain-normal, but it is a valid test of the persistence boundary and reader/query scaling. It must not be used as proof that forty completions are a supported user workflow, and current application cardinality must not be used to skip dense-history validation.

## Canonical classifier review

The current classifier is aligned with Accepted DEC-102/103 for the reviewed anomaly classes:

- all task rows are grouped before ranking; non-completed Tasks carrying completion Dispatch/Audit evidence become anomalous (`operational-history-evidence-classifier.ts:78-115`);
- every `COMPLETED` candidate requires exactly one Dispatch completion and one paired Audit, positive Task version, non-null/equal Task owner + Dispatch actor/new assignee, canonical Dispatch shape/time, and canonical Audit metadata/scope (`operational-history-evidence-classifier.ts:117-139`);
- any anomaly makes the whole session `UNVERIFIABLE`; zero verified completion becomes `NO_RECORD`; otherwise completions order by canonical event time, and a tied maximum across distinct Tasks is `UNVERIFIABLE` (`operational-history-evidence-classifier.ts:140-149`);
- discovery uses Organization-gated session, entity, and same-scope Parking-Task reference arms, then deduplicates `(auditId, implicatedSessionId)` before hydration (`operational-history-audit-discovery.ts:35-90`).

Accepting multiple fully coherent completed Tasks with **different** authoritative completion times and choosing the latest is not a #276 classifier P1 by itself. DEC-102 explicitly says to validate all exact-scope evidence and then select the latest unambiguous proven completion; only distinct Tasks tied at the maximum event time are forced `UNVERIFIABLE` (`DEC-102:38-44`). The current one-completed-Task application assumption is not DB-enforced, and the Focused P1 Recovery prompt expressly forbids silently weakening/changing DEC-102 from such an assumption.

No classifier correctness P0/P1 was found in this focused static review. The observability limit remains the Accepted DEC-103 boundary: a fully reference-free malformed Audit cannot be attributed to a bounded session without a global scan (`DEC-103:43-47`).

## Independent evidence fingerprint reconstruction

The previous recovery runner computes each query variant's own `count + MD5(sorted auditId|implicatedSessionId)` (`dec103-worker2-recovery-bench.ps1:106-109`). Candidate-to-candidate equality alone would not establish an independent oracle.

For this review, the expected relation was reconstructed independently from the synthetic fixture's deterministic IDs and explicit anomaly meanings, without using the production discovery SQL:

1. Canonical rows: for each fixture Task, `auditId = md5('dec103-audit-' + task UUID)` and implication = its deterministic ValetSession UUID (`dec103-worker2-fixture.sql:24-51`).
2. Sparse anomaly implications were derived from the five actual synthetic anomaly rows after a read-only identity check against `valet276_dec103_w2_40c1a097d8 | valet276test | 127.0.0.1 | 55449 | ...issue-276-disposable-pg.../data`: orphan-entity -> session 1; noncanonical/unhyphenated task-ref row -> session 3 through entity; wrong-Location row -> session 4 through entity; task-reference-only -> session 2; crosslink -> sessions 2 and 3.
3. The expected pairs were sorted by `(auditId, implicatedSessionId)` and MD5-hashed independently.

The independent reference exactly matches all recorded fingerprints in `ISSUE_276_DEC103_POSTGRESQL_EXPERIMENT.md:332-350`:

| Page | Independent expected pairs | Independent MD5 | Recorded candidate MD5 |
|---|---:|---|---|
| sparse50 | 56 | `360c2fcf6350a0251c2913596d3cf805` | same |
| sparse100 | 106 | `804cdd8c6058e75bdad5b243de121493` | same |
| dense50 | 2,000 | `f6319eda9dc4b6ee8a2147de7be1ae30` | same |
| dense100 | 4,000 | `6196c48febcde7605327fd58cec72b3f` | same |

This closes the "all candidates may share the same mistake" concern for this specific discovery fixture. It does not prove universal corruption detection or replace the mandatory end-to-end PostgreSQL classifier/security cases in DEC-102/103.

## Review outcome

- Historical dense Parking Tasks: **APPLICATION_PROHIBITED_BUT_DB_NOT_ENFORCED** for the current production lifecycle; future-compatible and DB-unbounded.
- Hard maximum completed Parking Tasks/session: **none proven at PostgreSQL boundary**.
- Completed Task owner/version DB immutability: **not enforced**.
- Current accepted writers: **prevent a second normal completion**.
- Canonical classifier: **no focused P0/P1 correctness defect found** against DEC-102/103 anomaly semantics.
- Independent fixture evidence reference: **matches the four recorded discovery fingerprints exactly**.
- Production query performance P1 remains separate; this review does not change that NO-GO.
