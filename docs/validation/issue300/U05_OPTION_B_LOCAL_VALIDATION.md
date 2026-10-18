# Issue #300 — Option B immutable indirect-parent provenance, local G2 record

**Owner authorization:** Option B, local worktree and disposable G2 only.
**Baseline:** `8c8915ee0244cec508f6f2bd76e66808f1866b48`,
branch `codex/issue-300-prime`. **No production migration, deploy, push, PR,
merge, UI change or Issue closure authorized or executed.**

## Mandatory independent design review, before migration

Two separate independent READ-ONLY agent reviewers inspected the code,
actual Task/Incident/Vehicle/Audit writers, runtime ACL provisioning, master
plan and Accepted DEC-034/059/068/079/080/082/102/103. Both **conditionally
accepted** a database-owned Task creation XID **combined with** immutable
canonical Task/Incident/Audit/Session relationship fields and a source-parent
visibility fence in all indirect read paths. Both rejected a plain
`audit_events`-INSERT-only association sidecar: historical/legacy Audit and
Audit-first/parent-later rows would lack a certificate indefinitely, and
silently omitting them contradicts the investigation evidence contract.

The review's blocking risks were that Task birth alone fails if a mutable
parent is reparented; privileged Audit or Session origin mutations can
rewrite history; a PARKED metadata reference is independent of an entity
reference; and legacy NULL markers cannot be assigned fictional XIDs. A
subsequent independent READ-ONLY implementation review found the Timeline
PARKED Task/meta contradiction and supplementary attribution fields; both
findings led to corrective changes **before the current proof**. No material
Accepted DEC conflict was found for immutable identity fields, conditional on
preserving operational Task state/assignee/version updates, Incident current
status, Session state and vehicle label corrections.

## Forward-only migration contract

1. **95 — `20261018009500_issue_300_option_b_task_relation_provenance`:**
   one PostgreSQL transaction takes ACCESS EXCLUSIVE locks on Audit, Task,
   Incident and Session, settles old writers, then adds nullable
   `tasks.pagination_birth_xid xid8` with `pg_current_xact_id()` default and
   database-owned INSERT/UPDATE preservation triggers. Original Task rows
   remain NULL, without backfilled transaction identities. All-row BEFORE
   UPDATE triggers block modifications to Task `(id, org, location, Session,
   task_type)`, Incident `(id, org, location, Session, created_at, reporter,
   type, severity)`, Session `(id, org, location, vehicle)` and Audit historical
   source identity, scope, direct link, actor, metadata and timestamps.
2. **96 — `20261018009600_issue_300_option_b_attribution_freeze`:**
   separate atomic follow-up from independent P1 review freezes Audit
   `controlled_operator_ref` and `idempotency_key` plus Session
   `checked_in_by_membership_id` and `created_at`. Original migration 95 was
   already applied locally and was **not modified** after application.
3. Search applies the captured `pg_snapshot` to independent Audit Task,
   Incident, PARKED metadata Task, and Dispatch Task parent joins in addition
   to all four source records. Timeline applies the same visibility rule to
   Task/Incident/PARKED and Dispatch parent joins. Distinct Task entity and
   PARKED metadata Task references must both be valid; an explicitly present
   JSON null `taskId` is invalid, not silently missing. Vehicle-only Audit
   continues to be excluded from indirect attribution; tenant and Location
   equality remains required before event projection.

**Truth boundary:** An old row with a NULL Task parent XID is certified
**only as part of the pre-migration cutover cohort** after the atomic locks,
not as proof that an entity association existed when an old Audit event
originally occurred. No old Task/Incident/Audit is backfilled or reattributed.
The existing HTTP 503 indirect-cohort guard is **unchanged and active**. A
successful migration alone never removes the guard, enables unrestricted
pagination or changes endpoint policies.

**Trusted maintenance boundary:** The ordinary runtime role is not a table
owner and must not gain DELETE/TRUNCATE/ALTER/TRIGGER or
`session_replication_role` bypass powers. A privileged DBA/schema owner or
PostgreSQL superuser can deliberately remove triggers or data; this design
does not claim cryptographic resistance to malicious privileged maintenance.
Maintenance operations which change historical relationships must remain
controlled and audited before any production rollout. Trigger-based immutable
UPDATE safety is not a substitute for unrestricted DBA-delete resistance.

## G2 execution evidence and scope

Preflight confirmed named Docker container `issue300_g2_pg17`, dedicated
`127.0.0.1:55480/issue300_g2`, PostgreSQL 17 and exactly **94** committed
migrations before these changes. `pnpm --dir packages/database migrate:deploy`
applied 95 and 96 successfully **only to G2**. `prisma validate` completed
successfully with 96 schema migrations.

| Evidence | Observed result | Limit |
| --- | --- | --- |
| `issue300-option-b-late-parent-proof.mjs` | **PASS**: committed OLD indirect Task/Incident Audit, captured S0, inserted parent Task/Incident afterward. Search and Timeline at S0 still exclude both; new S1 admits them. | Actual G2 SQL & current source SQL, not independently rebuilt HTTP process. |
| Same new proof: PARKED reference | **PASS**: contradictory Task entity and missing/JSON-null PARKED `taskId` excluded by both Search and Timeline. | Owned two adversarial rows, not the complete historical catalog. |
| Same new proof: DB immutability | **PASS**: Task/Incident reparent, Task type, Session vehicle and Audit entity UPDATE denied (`23514`); ordinary projection updates allowed, Task birth spoof rejected. | One locally controlled role and representative columns. |
| `issue300-option-b-runtime-acl-proof.mjs` | **PASS**: rollback-only simulated limited nonowner DB writer cannot DELETE/TRUNCATE/ALTER/DISABLE or set replica bypass, but may update Task version. | Does not prove a superuser/DBA cannot disable PostgreSQL enforcement. |
| `issue300-u05-trigger-proof.mjs` | **PASS**: migration94 source birth markers still immutable; legacy source NULL values unchanged and catalog XID triggers present. | Legacy XID unknown by design. |
| `issue300-u05-indirect-join-counterexample.mjs` | **PASS** reoriented regression: old S0 no longer sees newly created Task/Incident links; fresh S1 does; conservative overfull guard still rejects. | Historical pre-Option-B phantom is now an intentionally fixed oracle. |
| `issue300-operational-incident-writer.mjs` | **PASS**: real Supervisor incident HTTP, DB Incident+Audit persisted, CA+MFA readback. | Separate SQL auth/Shift/Session setup, not full operational lifecycle. |
| `issue300-operational-dispatch-writer.mjs` | **PASS**: real Supervisor Assign/Reassign HTTP, persisted Dispatch events and CA+MFA readback. | Separate SQL auth/Shift/Session setup. |
| `issue300-u05-http-held-writers.mjs` | **PASS**: all four Audit/Custody/Dispatch/Incident sources, signed Search+Timeline pages exclude held late COMMIT and fresh S1 includes it. | API 3162 was a previously running local gated build; not a new build attestation for Option B SQL. |

**Post-review strengthening, current Option B local candidate:** The late-parent
proof now uses **two independent PostgreSQL connections**: a writer holds
Task+Incident inserts uncommitted while the reader captures a second snapshot.
Both original S0 and held-writer S0 remain unchanged after COMMIT; only
fresh S1 discovers the old indirect Audit. The same proof now rejects a
PARKED Audit naming **two different valid same-Session Tasks**, a RETRIEVAL
Task masquerading as a PARKING reference, unknown entity type, absent or
JSON-null Task hints, while admitting the actual `VALET_SESSION` writer shape,
its NULL-direct legacy shape and an internally consistent Task-typed shape.
It also checks every new migration96 attribution immutability field and
preserves genuine legacy NULL Task birth markers. These are **direct G2 SQL
tests**, not signed HTTP pagination of newly linked Audit. Independent
read-only security review found no remaining new P0/P1 in the corrected
Search/Timeline predicates; previously existing unverifiable-orphan
coverage diagnostics and fresh-only point-detail remain acceptance gaps.

**R09 repeat after Option B on disposable G2:** 3,500 committed owned
Sessions + 900 born-XID-visible Custody records, 101-result cap, 20
hot-cache SQL-only samples: **p50 1,599.35 ms, p95 1,968.88 ms**,
`EXPLAIN ANALYZE` execution 1,892.792 ms, planning 64.181 ms,
2,014,479 inclusive buffer hits, 0 physical reads. A nested-loop hotspot
repeated an Organization-level Session index scan 901 times and a Vehicle
index scan 901 times. The `enable_nestloop=off` diagnostic had previously
timed out at 8 seconds and proved no equivalent faster plan. All
3,500/900 random owned fixtures were deleted by exact IDs. This is a
**measured performance concern, NOT an acceptable target-scale or
writer-loaded/cold-cache p95 PASS**; no optimizer/schema release fix is
claimed.

## U05-R01–R09 after Option B

| Gate | Status | Remaining independent acceptance |
| --- | --- | --- |
| R01, R02 | **PARTIAL PASS** | Four-source signed HTTP held writers pass, but larger mixed Task/Incident/metadata concurrency and repeated revocation stress remain. |
| R03 | **G2 SQL PASS / HTTP PARTIAL** | Old phantom eliminated under G2 SQL and signed source tests; new signed HTTP indirect two-request proof after recompilation, cross-tenant/Location and legacy contradiction matrix remain. Guard stays enabled. |
| R04, R05 | **PARTIAL** | Atomic 95/96 deployment G2 succeeds; interrupted migration / waiting writer / automatic rollback of new four-table locks unproven at pre/post writer load. |
| R06 | **PARTIAL** | Previous 106-Session /112-event deterministic signed keyset source-only proof; new indirect pages and all 100k/1m size levels unproven. |
| R07, R08 | **PARTIAL** | Existing signed binding, CA/LM MFA and strict scope checks; complete revocation under active multi-request race, and production privilege attestation remain. |
| R09 | **GAP/PARTIAL** | Real Incident/Dispatch writers pass. Full concurrent operational chain, 100k/1m scale, cold-cache/writer-loaded p95, and performance SLA are not proven. |

**Local readiness:** schema/design candidate exists and regression proofs pass,
but **unrestricted U05 and Issue #300 release remain NOT READY**, pending
the explicit acceptance gaps and final independent runtime review. No UI
component, JSX, CSS, copy, interaction or existing Audit Events source changed.
