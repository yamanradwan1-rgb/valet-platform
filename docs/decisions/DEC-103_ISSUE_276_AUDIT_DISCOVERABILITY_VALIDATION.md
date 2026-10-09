# DEC-103 — Issue #276 canonical Parking Audit discoverability validation

Status: **Accepted — design and isolated-test authorization only**
Date: 2026-10-09
Owner: VAYLET product owner
Scope: Issue #276 / Task 5; follows Accepted DEC-102
Implementation branch: `fix/issue-276-live-operations-staff-history`

## Context and approval boundary

The DEC-102 history-reader prototype only probes `audit_events.valet_session_id`. This column is nullable, and the existing `(valet_session_id, occurred_at)` index cannot find canonical Parking Audit anomalies linked to a session only by `entity_id` or `metadata_json.taskId`. Those missed events could incorrectly turn an otherwise unverified Parking history into `NO_RECORD` or `PROVEN`.

The Owner **approved the two-partial-index direction** on 2026-10-09, on the explicit condition that implementation and measurements happen **first on a verified, isolated/disposable PostgreSQL database**. Applying any migration to a real shared QA, staging or production environment needs a **separate explicit approval**. This decision does **not** assert that index performance, PostgreSQL correctness, concurrent-authority safety, or U-004 UI fidelity is already verified.

## Accepted scope of the experiment

Keep the existing Audit session index, and evaluate two **additional partial lookup indexes** restricted to the canonical `VALET_SESSION_PARKED` event family:

```sql
-- DESIGN ONLY. May be tested on a VERIFIED DISPOSABLE PostgreSQL instance.
-- Not an approved production or shared-environment migration.
CREATE INDEX CONCURRENTLY audit_events_parked_org_entity_idx
  ON public.audit_events (organization_id, entity_id)
  WHERE event_type = 'VALET_SESSION_PARKED';

CREATE INDEX CONCURRENTLY audit_events_parked_org_task_ref_idx
  ON public.audit_events (organization_id, (metadata_json->>'taskId'))
  WHERE event_type = 'VALET_SESSION_PARKED';
```

The exact index key order, predicates and optional ordering columns may be refined **only with disposable-PostgreSQL EXPLAIN evidence**, while preserving the same evidence coverage and privacy boundary. `CREATE INDEX CONCURRENTLY` is **not valid inside a transaction block**; test infrastructure must handle that explicitly and must not execute against unverified targets. The index names are proposals and must be checked for collisions before any approved forward migration.

## Read-side evidence selection and conservative classification

On the **already authorized, bounded Live Operations session page**:

1. Probe the existing session-reference path: same Organization and `audit.valet_session_id` in authorized session IDs.
2. Probe the entity-reference path: same Organization, `event_type='VALET_SESSION_PARKED'`, and `audit.entity_id` in authorized session IDs.
3. Probe the Task-reference path: same Organization, `event_type='VALET_SESSION_PARKED'`, and `audit.metadata_json->>'taskId'` matching canonical **same-Organization, same-Location, same-session PARKING Task IDs** associated with the bounded authorized page.

Prefer three separately indexable SELECT branches (e.g. `UNION ALL` with deterministic `audit.id` deduplication) over an unmeasured wide `OR` or table scan. Do not cast untrusted JSON text to UUID without first checking its validity; use safe text comparison and classify malformed references conservatively when another trusted relation locates the event.

**Discovery is not validation.** Fetch candidate evidence only from the authorized Organization and bounded page references, then check the exact Audit Organization, Location, session/entity, Task relation, event type, canonical status/version metadata, actor and occurred-at consistency required by DEC-102. Do not pre-filter mismatched/null Location or session references in a way that hides anomalies. Never project an identity from a foreign Organization, untrusted metadata, or an unrestricted historical directory.

An event found through multiple reference arms must be deduplicated by Audit primary key before assessing multiplicity. If an event links two different authorized sessions or contradicts the target Task/session, classify all implicated in-scope evidence as `UNVERIFIABLE` rather than silently choosing a session. Missing, duplicate, conflicting or orphan evidence follows DEC-102. `NO_RECORD` is permitted only when all **approved discoverable evidence paths** have been checked with no completed Task or contradictory completion Audit/Dispatch facts.

**Observability limit:** No bounded query can reliably attribute a completely reference-free or fully malformed event to a particular session. Do not invent such linkage or claim universal detection. If further corruption classes require global scans to preserve the accepted semantics, stop for a focused decision or safe constraint/backfill strategy—never claim the two indexes solve every possible corruption.

## Mandatory PostgreSQL proof before shipping code

- First prove that the target PostgreSQL cluster, database, credentials, schemas and fixtures are **isolated and disposable**. The presence of a local PostgreSQL 17 service is not enough. Do not inspect or mutate an unidentified/shared database.
- Test all three reference arms with valid, null-linked, wrong-entity, wrong-location, duplicate, orphan, contradictory and malformed metadata, including `valet_session_id IS NULL`, conflicting `entity_id`, matching Task-reference only, and one Audit matching multiple arms.
- Prove one row per authorized ValetSession, no silent lost anomalies, no cross-tenant data or newly leaked historic email/IDs, unchanged current Task assignment, cursor/filter/Vehicle semantics, and **no domain writes** by the reader.
- Run `EXPLAIN (ANALYZE, BUFFERS)` on safe SELECT statements in representative sparse and dense data (50/100-session pages; varied Task/Event/Audit history sizes). Record per-arm plan, loops, examined rows, buffers and latency against existing page-query baseline; do not treat an index's existence as performance proof.
- Verify index deployment feasibility on the disposable DB, lock/concurrency impact, privileges and rollback/failure behavior, plus the still-pending DEC-102 current Staff session/grant/entitlement revocation interleavings.
- If a candidate still requires a global/history-wide scan, an additional index, a new schema CHECK, data repair or an arbitrary per-session candidate cap, **stop for a separate reviewable approval**.

## Explicit non-authorizations

This decision **does not authorize** running or committing an applied forward migration against shared QA, staging or production; applying a migration in any real environment; production data repair/backfill; rewriting old Audit rows; relaxing DEC-102 audit-pair/actor proofs; weakening current CA/LM authorization; expanding Vehicles/Management Audit identity exposure; PR, fast-forward merge, deployment, Issue #276 closure, or claiming U-004 final UI sign-off.

The existing uncommitted #276 production prototype remains **unshipped WIP** until the proof gates pass and final independent security/DB/UI code reviews complete. Keep the Worktree WIP intact; a documentation-only decision commit must stage **only expressly changed decision/report files**.

## Acceptance and remaining gates

- **Approved:** two partial-index evaluation direction, three-path evidence discovery design, isolated/disposable PostgreSQL experiment, conservative DEC-102 fail-closed handling.
- **Pending:** proven isolated PostgreSQL setup; actual index builds/EXPLAIN and SQL negative cases; reader query-budget decision; Staff session and authorization concurrency tests; final code review; U-004 EN/AR × Light/Dark evidence and Owner sign-off; explicit real-environment migration authorization; separate merge/deployment/issue-closure authority.

Source evidence: [Issue #276 orphan Audit blocker report](../validation/ISSUE_276_DEC102_ORPHAN_AUDIT_INDEX_BLOCKER.md); binding baseline: [DEC-102](DEC-102_LIVE_OPERATIONS_HISTORICAL_STAFF_ATTRIBUTION.md).
