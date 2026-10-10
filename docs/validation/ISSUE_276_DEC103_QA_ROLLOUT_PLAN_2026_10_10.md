# Issue #276 / DEC-103 — QA/Staging index rollout and rollback

**Status: synthetic rollout/rollback PASS; real QA/Staging NOT EXECUTED.**
Date: 2026-10-10. The Owner approved a verified isolated QA/Staging test,
with rollback preparation, and no Production access. This does not authorize
altering an unverified database, pushing, merging, deploying or closing #276.
Accepted DEC-102/103 are unchanged.

## Missing real QA target — fail closed

No verified QA/Staging PostgreSQL URL or identity manifest was found.
The primary checkout's local .env points to 127.0.0.1:5432/valet:
**unverified, excluded and never contacted**. The previous verified
127.0.0.1:55449 fixture is synthetic-only, not actual QA/Staging.

Before real QA DDL, the operator must supply a protected, dedicated migration
connection (no credentials in logs), expected host/port/database/user,
out-of-band cluster/data-directory or system identifier, evidence of
nonproduction isolation and authorized maintenance ownership, TLS/CA or
SSH-tunnel rules, current schema/migration head, sufficient storage and a
backed-up/PITR-capable recovery procedure.

**STOP** for unverified identity, any Production possibility, missing rollback
operator, unexpectedly active business traffic, unknown schema head,
insufficient permissions/disk, unexpected existing or invalid index,
or a DB URL that falls back to 5432. Do not use global migration commands
with implicit environment fallbacks.

## Read-only verification before applying DDL

Connect explicitly to the Owner-specified QA database and validate:

~~~sql
SELECT current_database(), current_user,
       inet_server_addr(), inet_server_port(),
       current_setting('server_version'),
       current_setting('data_directory');
SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid();

SELECT idx.indexname, idx.indexdef, ix.indisvalid, ix.indisready
  FROM pg_indexes AS idx
  JOIN pg_class AS relation
    ON relation.relname = idx.indexname
   AND relation.relnamespace = 'public'::regnamespace
  JOIN pg_index AS ix ON ix.indexrelid = relation.oid
 WHERE idx.schemaname = 'public'
   AND idx.tablename = 'audit_events'
   AND idx.indexname IN ('audit_events_parked_org_entity_idx',
                         'audit_events_parked_org_task_ref_idx');
~~~

Do not use blind IF NOT EXISTS: conflicting index names must block deployment,
and preexisting index definitions must be preserved. Record read-only Audit
counts, sizes, index usage and exact scoped 50/100-session evidence fingerprints
before changing the index layout. Reproduce valid, null-linked, orphan,
wrong-entity, wrong-location, malformed taskId and cross-session contradiction
cases. Keep personal data out of log artifacts.

## Proposed forward DDL — only after independent QA identification

Each CREATE INDEX CONCURRENTLY MUST run as a **standalone SQL statement**,
not in BEGIN/COMMIT or an automatically transactional migration wrapper.
Use the narrowly scoped admin role and monitored finite lock/statement
timeouts. DDL can consume disk/CPU, wait on old snapshots, and leave an
invalid index if interrupted.

~~~sql
CREATE INDEX CONCURRENTLY audit_events_parked_org_entity_idx
  ON public.audit_events (organization_id, entity_id)
  WHERE event_type = 'VALET_SESSION_PARKED';

CREATE INDEX CONCURRENTLY audit_events_parked_org_task_ref_idx
  ON public.audit_events (organization_id, (metadata_json->>'taskId'))
  WHERE event_type = 'VALET_SESSION_PARKED';
~~~

Record exactly which indexes this rollout newly created. Validate both
definitions, indisvalid=true and indisready=true, then optionally ANALYZE
public.audit_events after evaluating QA write load. Measure actual atomic
Task/Dispatch/Audit source SQL with EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON),
row/buffer/loop/heap-read counts, sparse/dense 50/100-session history,
unaltered evidence fingerprints, same-scoped authorization and authenticated
HTTP concurrency. No global Audit Seq Scan is acceptable in measured
representative paths; this is not equivalent to constant query cost.

## Explicit rollback and partial-failure handling

First verify the *same* target identity again. Remove ONLY indexes created
by this particular QA rollout; never a preexisting, foreign or unknown index.
Run each independently, outside a transaction:

~~~sql
DROP INDEX CONCURRENTLY public.audit_events_parked_org_task_ref_idx;
DROP INDEX CONCURRENTLY public.audit_events_parked_org_entity_idx;
~~~

If the second CREATE fails, inspect pg_index for any invalid/half-created
index first, and remove only owned rollout indexes after reviewing catalog
definitions. Never use CASCADE or kill unknown connections to force a DROP.
Concurrent DROP can wait on long-lived transactions. Verify both owned
indexes are absent, baseline evidence hashes unchanged, table row counts
unchanged and application reads healthy. An index-only rollback never
rewrites historical Task, Audit or Session rows.

## Completed disposable synthetic rollout + rollback rehearsal

Verified PostgreSQL 17.11 on loopback 127.0.0.1:55449,
database valet276_dec103_w2_40c1a097d8, role valet276test,
cluster data directory
D:/kndoom/valet-platform/tmp/issue-276-disposable-pg-0d8a6d3a254e/data.
Synthetic source contains 200 ValetSessions, 4,100 Tasks, 4,100 Dispatch
events and 24,105 Audit rows. Verified source indexes were valid.

1. Created a fresh, separate owned clone:
   valet276_dec103_qa_drill_20261010. The source was never modified.
2. Removed the two cloned candidate indexes **in this clone only** to
   establish a no-new-index baseline; preserved all four full-row
   Task/Dispatch/Audit evidence fingerprints.
3. Re-created both accepted DEC-103 partial indexes with separate
   CREATE INDEX CONCURRENTLY statements (25.34 and 36.22ms on this tiny,
   local synthetic fixture). Verified their exact definition and
   indisvalid/indisready=true; analyzed this clone.
4. Measured exact source atomic SQL with three warm EXPLAIN samples per
   page. Full Audit Seq Scan nodes went from 2 to 0 on all four profiles;
   every full-row fingerprint matched before/after.
5. Ran DROP INDEX CONCURRENTLY for both created indexes (4.08 and 3.60ms),
   verified absence and unchanged full-row evidence fingerprints.
6. Closed the cloned connection, dropped ONLY the newly owned clone,
   and reverified its absence. Original source still has 24,105 Audits
   and both existing candidate partial indexes. No contact with 5432.

| Synthetic page | SQL median before indexes, ms | After indexes, ms | Full Audit Seq Scan nodes after |
|---|---:|---:|---:|
| Sparse50 | 13.31 | 6.29 | 0 |
| Sparse100 | 16.63 | 8.31 | 0 |
| Dense50 | 54.46 | 43.48 | 0 |
| Dense100 | 108.05 | 97.78 | 0 |

This is a synthetic warm-cache DDL/rollback rehearsal, **not** real
QA, a staging load test, a production p95 or permission to deploy.
No third C-collated index was created. Dense100 still has thousands of
real Audit candidates; there is no arbitrary history cap.

Repeatable fixed-target-only disposable script:
tmp/issue276-reinvestigation/dec103-qa-isolated-drill.ts

Raw report:
tmp/issue276-reinvestigation/dec103-qa-isolated-drill-results.json

## Decision / release status

**Disposable rollout + rollback: PASS. Real QA/Staging rollout:
BLOCKED until the Owner identifies and verifies a QA target. Production:
NOT TOUCHED and NOT AUTHORIZED.**

DEC-102 release gates remain: native writer interleavings, real authorized
HTTP performance, QA invalid-history and tenant isolation proofs, Owner
U-004 visual approval and final whole-diff review. No Git commit, PR,
merge, push, deploy or #276 closure was done.
