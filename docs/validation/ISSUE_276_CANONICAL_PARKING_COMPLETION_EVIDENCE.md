# #276 Task 5 — canonical Parking completion evidence, read-only investigation

**Status: SOURCE INVESTIGATION / APPROVED READER POLICY IN DEC-102 / POSTGRESQL UNVERIFIED.** Repository `origin/main` at diagnostic time = `698bcb6044f72844008ffa49ef085f11471f53e1`; isolated diagnostic parent = `e2221edd51ad754b5a1d536351c6ce8bbcbc2a54`. The proposed completion reader below has **not** been implemented or run on PostgreSQL.

**2026-10-09 Owner acceptance:** [DEC-102](../decisions/DEC-102_LIVE_OPERATIONS_HISTORICAL_STAFF_ATTRIBUTION.md) accepts strict paired Task + Dispatch + Audit coherence and matching Parker actor, conservative `UNVERIFIABLE` for contradictions/duplicates/unknown provenance and distinct maximal-time ties, no `Task.updated_at` chronology, and three-valued `parkingCompletionProof`. Any `NOT YET ACCEPTED` decision text further down is the archived analysis state. **Runtime DB privileges, actual event completeness, query boundedness/EXPLAIN and safe concurrent auth locks still require proof; the policy is Accepted, the implementation is not.**

## A. Evidence from the Accepted writer, not assumptions about Tasks

| Evidence | Actual source | Consequence |
|---|---|---|
| Confirm Parked one transaction | `apps/api/src/modules/parking/confirm-parked-command.ts:51-70,105-117,158-201` | Task/Session/Dispatch/Audit effects succeed or roll back together |
| Canonical time | `dispatch-transaction.ts:28-39` | `transaction_timestamp()::timestamptz(3)` is shared by writers, millisecond precision |
| Task completion guard | `confirm-parked-mutations.ts:10-25` | Update `IN_PROGRESS -> COMPLETED` requires exact Task version and original assignee |
| Dispatch COMPLETED | `confirm-parked-command.ts:158-170`, `dispatch-event-writer.ts:22-56` | Event `actor_membership_id = new_assignee_membership_id =` authenticated Parking completion actor; previous assignee null |
| Canonical parking audit | `confirm-parked-audit.ts:24-52` | `VALET_SESSION_PARKED`, same actor, time and exact scope; `metadata_json.taskId` and transition/version facts |
| Accepted contract | `DEC-037_CONFIRM_PARKED.md:414-445,474-545,680-697`; `DEC-068_POST_PARKING_KEY_SLOT_BINDING.md:320-341` | Atomic Task COMPLETED + Dispatch COMPLETED + Audit VALET_SESSION_PARKED, including new slot-binding path |
| Exact relational scope | `packages/database/prisma/schema.prisma:1127-1177`; migration 020 `:97-101,115-131` | Event-to-Task composite FK enforces Organization+Location+Session+Task ID |
| Operational history privileges | `packages/database/src/task-dispatch-runtime-role.integration.test.ts:103-171` | Runtime Tasks are writable; Dispatch history is append-only for ordinary runtime (INSERT still permitted) |

### Why Task.updated_at is unsafe

`Task.updated_at` is `@updatedAt` with no persisted immutable `completed_at` (`schema.prisma:1127-1153`). Supported application commands do not normally update terminal Tasks, **but the DB runtime role permits `UPDATE tasks` and no terminal-row immutability trigger exists** (task migration 020 and runtime-role test `:103-121`). No query may treat `task.updated_at DESC` as trusted completion chronology.

### Why an isolated DispatchEvent is also insufficient

The runtime role may INSERT DispatchEvent; migration 020 does **not** enforce one `COMPLETED` event per Task nor actor=newAssignee nor the associated Audit pair. Audit metadata `taskId` is JSON, not an Audit-to-Task FK. Consequently, a `COMPLETED` event alone is **not** proof of a successful Confirm Parked operation. The Accepted DEC guarantees the atomic **writer** but does not impose a specific **reader-side** join. A history projection claiming `PROVEN` needs an expressly approved coherence rule.

### What "Parked By" actor means

The Confirm Parked actor must be the *current authorized Task owner at completion*; the current writer records that actor as Dispatch `actorMembershipId` and `newAssigneeMembershipId`, with the same actor on `VALET_SESSION_PARKED`. For a strict read-time proof, propose equality across: Dispatch actor, Dispatch new assignee, Audit actor, and, when consistent, the completed Task's assignee. An actor disagreement is **UNVERIFIABLE**, never a reason to pick whichever column happens to have a name. Legacy histories may not satisfy these fields: do not force a migration/backfill or fabricate a historic event.

`valet_sessions.checked_in_by_membership_id` is the **original Check-in association**; the `complete-check-in` command's actual completing actor can differ (`docs/04_VALET_SESSION_STATE_MACHINE.md:115-117`). Do not silently relabel the original check-in membership as the actor of the final check-in command.

## B. Proposed strict read-side integrity rule — Owner/security decision required

1. Authorize current viewer/User/Staff Session/MFA/entitlement and exact active Organization+Location inside the *same protected history-read transaction*; only inspect sessions matching this scope.
2. For each bounded result session, inspect **all exact-scope `PARKING` Task records**, including nonterminal Tasks that might have contradictory `DispatchEvent(COMPLETED)` history. A candidate Parker must have `task.status='COMPLETED'`; a completion event on a currently QUEUED/ASSIGNED/ACCEPTED/IN_PROGRESS/CANCELLED Task is an integrity anomaly, never a valid candidate.
3. For each candidate Task, require **exactly one** scope-matching `DispatchEvent(COMPLETED)`. Its actor and new assignee must both be non-null and equal; previous assignee is null. Compare with Task current assignee where required by the approved canonical actor policy.
4. **Recommended extra coherence proof**: exactly one matching `AuditEvent(VALET_SESSION_PARKED)` in the exact scope, with `entity_type='VALET_SESSION'`, `entity_id = session.id`, `metadata_json.taskId = task.id`, from/to Task status/version and from/to Session status/version consistent, equal event actor and equal authoritative `occurred_at`. Explicitly approve this read-side requirement and measure its JSON predicate cost; it is *not* already mandated for every reader by DEC-037.
5. Zero completed candidates **and no contradictory completion or canonical Parking audit evidence** => **NO_RECORD** (no verified completed Task recorded, *not proof no car was parked*). Any missing/duplicate/contradictory event or metadata, a completed event on a noncompleted Task, or a same-scope `VALET_SESSION_PARKED` audit referring to a missing/malformed/wrong Task => **UNVERIFIABLE**; no Parker name. At least one safely coherent candidate with no anomaly elsewhere => chronology selection per C.
6. A matching event whose membership lacks both safe canonical name components may produce `PROVEN` completion + `parkedBy:null`, *only after U-003*. Do not fallback to email or Check-in staff.
7. Never multiply outer session rows; no per-session HTTP, global directory or N+1 SQL. Keep existing `activeTask`, cursor and filter unmodified.

## C. Ordering choice (not yet Accepted)

Proposed ordering for **individually validated** complete events: `dispatch.occurred_at DESC`, then `task.id DESC`, then `dispatch.id DESC` for stable results. Each completion event is associated with exactly one Task; the event ID does not rescue invalid duplicate events. Timestamp `timestamptz(3)` has millisecond precision; distinct completed Tasks may tie in actual occurrence time. A UUID tie-break is deterministic **but does not establish which physical completion occurred later**.

**Privacy/conservatism recommendation:** if multiple *distinct* verified Parking Tasks tie at the maximal `occurred_at`, classify the Parker as **UNVERIFIABLE** rather than arbitrarily claiming the newest human actor. Alternative: Owner may explicitly accept an `id DESC` deterministic tie policy as a display convention (not physical chronological proof), with that limitation in the contract. Do **not** choose either by silent implementation.

If an otherwise suspect completed Task cannot be ordered against a valid candidate, fail closed for that session; do not skip an inconsistent history and claim another person is the latest Parker. A missing event is not automatically older than an existing event.

## D. Candidate bounded SQL plan (**illustrative — NOT EXECUTED**)

Start with the unchanged existing authorized `listDashboardSessions` outer scope: Organization + Location + canonical state filter, keyset `(session.created_at,session.id)`, `LIMIT limit+1`. After an accepted purpose-specific DTO and in-transaction reauthorization, enrich *only that bounded page*. **Enumerate PARKING TASKS first**, not only those having an event: an event-first INNER JOIN can omit a newer COMPLETED Task with a **missing** completion event and wrongly display an older Parker. It can also hide a contradictory completion event on a nonterminal Task. Both violate fail-closed semantics.

```sql
-- SKETCH ONLY: not an approved runnable query or performance result.
FROM authorized_page AS session
LEFT JOIN LATERAL (
  SELECT task.id AS task_id,
         COUNT(event.id) AS completed_dispatch_count,
         MAX(event.occurred_at) AS candidate_completion_time
  FROM tasks AS task
  LEFT JOIN dispatch_events AS event
    ON event.organization_id = task.organization_id
   AND event.location_id = task.location_id
   AND event.valet_session_id = task.valet_session_id
   AND event.task_id = task.id
   AND event.event_type = 'COMPLETED'
  WHERE task.organization_id = session.organization_id
    AND task.location_id = session.location_id
    AND task.valet_session_id = session.id
    AND task.task_type = 'PARKING'
  GROUP BY task.id, task.status
  -- Each candidate MUST be validated: exactly one dispatch completion,
  -- exactly one approved matching Audit PARKED, actor/status/version/time
  -- coherence and no suspect candidate before ranking a final winner.
) AS candidates ON TRUE
```

The sketch deliberately emits **multiple evidence rows per session as an intermediate relation**, so it is **not the final one-row projection** and intentionally lacks `LIMIT 1`. In the approved implementation, classify and aggregate all exact-scope Parking Task evidence with paired event counts, include missing events and anomalous events on nonterminal Tasks **and orphan/mismatched canonical Parking audit evidence**, fail closed on **any** unverified candidate, and only then select one proven event/actor and rejoin as **one scalar row per session**. A window/CTE/lateral approach is acceptable if it preserves this ordering of logic. Never select one event first, ignore duplicates, or lose Task-without-event candidates. Joining `organization_memberships` for name should use exact Organization+candidate membership ID and no subject-current-Location-grant predicate (subject historical visibility still pending approval). Strict target URL/role/scope gates remain mandatory.

**Performance/boundedness blocker:** a page limit does not itself cap the number of historical Tasks/Audit/Dispatch events inspected for each session. The DB does not enforce a historical candidate cap. A proposed finite Task-evidence cap+1 with `UNVERIFIABLE` on overflow could preserve a hard per-session work bound but **requires an Owner-approved limit/semantics and measured representative PostgreSQL query plans**; no numeric limit is selected by this draft. Otherwise demonstrate safe indexed, measured history scans and scale without claiming a hard cap. Any index or schema change requires its own approval.

Existing index candidates: `tasks_valet_session_id_created_at_id_idx`, `dispatch_events_task_id_occurred_at_id_idx`, `dispatch_events_valet_session_id_occurred_at_id_idx` and `audit_events_valet_session_id_occurred_at_idx`. None proves efficiency on representative historic distributions. **No index or migration is authorized in Task 5 Phase A.**

## E. Required validation matrix after approvals

| Synthetic fixture / threat | Expected proof |
|---|---|
| Exact Task + one Dispatch + one paired Audit, all agreeing | `PROVEN`, historical actor is completion actor; current assignment unaffected |
| Distinct original checker versus Parker | Different historical roles preserved |
| Same checker and Parker | One identity may occur in two truthful roles |
| Queued unassigned Retrieval after Parking | Current `activeTask.assignee=null`, Parked By separate |
| Active assigned Retrieval | Current assignee is Retrieval owner, not historic Parker |
| Cancelled/no completed Parking and no contradictory event | `NO_RECORD`; no fabricated Parker |
| Nonterminal or cancelled Task has Dispatch COMPLETED evidence | `UNVERIFIABLE`; never suppress the contradiction |
| Canonical Parking Audit refers to unknown/wrong Task in same session | `UNVERIFIABLE`; never silently classify NO_RECORD |
| Completed Task but Dispatch event missing | `UNVERIFIABLE` |
| Two COMPLETED events for same Task (even with same actor) | `UNVERIFIABLE` under strict option |
| Missing/contradictory canonical Audit actor/task/time/status/version | `UNVERIFIABLE` under paired-proof option |
| Event actor != newAssignee or Task assignee | `UNVERIFIABLE` |
| Different Org, Location or ValetSession Task/event | Never included in result |
| Distinct completed Tasks, same `occurred_at` | Tie policy must be approved; recommend `UNVERIFIABLE` |
| Multiple completed Tasks with distinct times | Latest proven event; no invalid unresolved candidate skipped |
| Historical membership disabled/grant revoked | Names only under formally accepted read-time U-003 |
| Viewer LM grant revoked, CA MFA lost, exact session revoked | Denied/fenced; no stale response/name |
| Pagination / query budget / session counts | Exactly one page row per session; unchanged cursors; zero writes |

## F. PostgreSQL access, EXPLAIN and evidence limitations

**NOT RUN.** `TEST_DATABASE_URL`, `DATABASE_URL`, `POSTGRES_URL`, PGHOST and PGPORT are absent in this worktree; `psql` is not on PATH, although an installed PostgreSQL 17 executable and ready Windows localhost service were located by read-only host inspection. A running server does **not** prove an isolated disposable test database, credentials or authorized task destination. No proven isolated disposable database currently exists for this task. Do not attempt migrations, fixture writes or destructive setup against production/shared QA. When a verified disposable test database becomes available, use a read-only transaction for plan inspection and synthetic database integration tests only within that disposable isolation:

```sql
BEGIN TRANSACTION READ ONLY;
EXPLAIN (FORMAT JSON, ANALYZE, BUFFERS)
SELECT ...;  -- only approved SELECT projection on disposable fixtures
ROLLBACK;
```

Run the proposed query with 50/100 result sessions, history-heavy and sparse cases, record rows/loops/actual timings/index decisions and pagination, and compare with the unchanged active-sessions baseline. `EXPLAIN ANALYZE` executes SELECT, so never run unvetted statements or treat it as side-effect-free for arbitrary SQL.

## G. Explicit Owner/security acceptance choices

1. **Canonical Parked By actor:** require `DispatchEvent.actor = newAssignee = canonical AuditEvent.actor = Task.assignee` (recommended strict) or define and justify another source.
2. **Completion reader proof:** require matching canonical Audit pairing (recommended) or explicitly accept Dispatch-only evidence with stated duplicate/forgery risk. DEC writer atomicity alone does not settle this read-side policy.
3. **Multiple-event integrity:** exact one per completed Task (recommended) or a carefully justified dedup policy; never silently drop conflicts.
4. **Equal-time distinct Tasks:** conservative `UNVERIFIABLE` (recommended) or explicitly accepted UUID tie convention without physical chronology claim.
5. **Missing/suspect candidate:** `NO_RECORD` vs `UNVERIFIABLE`, fail-closed semantics and minimum non-PII provenance DTO.

**Historical proposal snapshot above.** The Owner subsequently Accepted the canonical actor/proof/tie/privacy/API semantics in [DEC-102](../decisions/DEC-102_LIVE_OPERATIONS_HISTORICAL_STAFF_ATTRIBUTION.md) (2026-10-09). That acceptance authorizes implementation, but does **not** certify audit-record discoverability, row-lock/revoker safety or PostgreSQL query plans.

## H. Post-acceptance implementation-time P1 finding

The exact schema permits `VALET_SESSION_PARKED` AuditEvent with `valet_session_id=NULL` and `entity_id=` an authorized session UUID: `packages/database/prisma/migrations/20260808000700_audit_event_foundation/migration.sql:6-18,39-43`. The existing `audit_events_valet_session_id_occurred_at_idx` (`:23-25`) does not support efficient lookup of these otherwise relevant orphan/malformed rows by `entity_id` or `metadata_json.taskId`. A Task-first completion reader that subsequently selects only Audits by `valet_session_id=ANY(scoped_page_ids)` could miss contradiction and misclassify `NO_RECORD/PROVEN`. General Organization/occurredAt index existence is not measured proof of bounded entity lookup.

**DEC-102 §58–59 requires stopping** rather than silently weakening orphan classification or selecting a new arbitrary per-session history cap. No new index/migration was approved. The focused alternatives, proposed partial-index shape, required disposable PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)`, and remaining tests are in `ISSUE_276_DEC102_ORPHAN_AUDIT_INDEX_BLOCKER.md`. The uncommitted SQL/API/UI code is **not released**. No DB fixtures or production/QA data were touched.

## I. Measured DEC-103 isolated PostgreSQL continuation — P1 remains

Owner Accepted DEC-103 for **disposable index testing only**. A completely fresh PG17.11 cluster was verified at `127.0.0.1:55449` with a unique data directory and a separate child database; the original local service on `5432` was never contacted. All 78 repository migrations succeeded there. The test inserted 200 synthetic sessions, 4,100 Parking Tasks, 4,100 Dispatch completions and 24,105 Audit records, including five malformed/orphaned canonical Parking Audits.

Both approved partial Audit lookup indexes were successfully created with `CREATE INDEX CONCURRENTLY` outside a transaction **on that disposable child database alone**. Three discovery arms using A Session ID, B Entity ID and C taskId found the deliberately anomalous null-linked, entity-only, task-only, cross-session and wrong-Location candidates. Deduplicating the synthetic 50-page relation gave 156 raw mentions, 55 physical Audit IDs and 56 (Audit ID, implicated page session) pairs: the same event across multiple arms is not a duplicate, but cross-linked page sessions must each fail closed.

**Unresolved P1:** `apps/api/src/modules/dashboard/operational-history-audit-discovery.ts:62-70` in the uncommitted source uses a C-branch join that produces a full `audit_events` Seq Scan (24,105 rows per case) despite both indexes. Exact 50/100-page elapsed times were 16.557, 23.634, 28.709 and 44.578 ms. The tested scoped-Task-ID `ANY` alternative avoided the full table scan but still cost 50.967 ms and 16,816 buffer hits at dense 100 due to 4,000 probes/lookups. This is **not a proven bounded dense-history plan**. Source plans, index definitions, 12 before/after single-arm timings, fixture dimensions and cleanup policy: `ISSUE_276_DEC103_POSTGRESQL_EXPERIMENT.md`. No additional index, arbitrary cap, migration rollout or synthetic backfill is authorized; production WIP remains uncommitted pending a new focused approved query-plan solution. Existing section H represents the pre-DEC-103 chronology.
