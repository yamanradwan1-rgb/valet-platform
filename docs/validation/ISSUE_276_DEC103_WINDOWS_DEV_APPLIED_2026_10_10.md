# Issue #276 / DEC-103 — Windows development database index rollout

**Result: APPLIED and VERIFIED on the actual Windows VAYLET development DB.**
Date: 2026-10-10. This follows the Owner's explicit go-ahead for the two
DEC-103 indexes. No production system exists for this development project.
No Git commit, push, PR or merge was performed.

## Target, preflight and safety

- Both the main checkout's `DATABASE_URL` and `MIGRATION_DATABASE_URL`
  independently resolve to `127.0.0.1:5432/valet`. Credentials were never
  printed or written to the evidence logs.
- Read-only preflight confirmed PostgreSQL **17.11**, database `valet`,
  migration user `valet_admin`, and data directory
  `C:/Program Files/PostgreSQL/17/data`. This is distinct from the
  disposable test cluster on port 55449.
- `public.audit_events`, `public.tasks` and `public.valet_sessions`
  existed, the two candidate names did **not** exist, and all **77**
  Prisma migrations were finished with **zero** unresolved migrations.
- Preflight database size: **18,069,171 bytes**; Audit heap:
  **204,800 bytes**, old Audit indexes total **180,224 bytes**.
  At preflight only the migration session was active. C: had approximately
  **4.28 GB** free. Preflight Audit count estimate was `reltuples=432`
  (statistics estimate, **not** an exact before count). The exact preflight
  `VALET_SESSION_PARKED` count was **21**.

## Backup verified before DDL

- Full PostgreSQL custom-format `pg_dump` created locally at
  `tmp/issue276-reinvestigation/windows-dev-valet-pre-dec103-20261010T0243.pgcustom`.
- Exact size: **920,719 bytes**, SHA-256:
  `1A72C87811D91D832FB9ADF541C1B1598D7DEC26F904F4A898191D30A80DF45C`.
- Archive table of contents was successfully read via `pg_restore --list`.
  **A full restore into an independent database was not executed.**
- Backup path is covered by `.gitignore` (`tmp/`). The file ACL was
  hardened to explicit FullControl for only local Administrator,
  `NT AUTHORITY\SYSTEM`, and `BUILTIN\Administrators`; previous inherited
  `Authenticated Users` and `BUILTIN\Users` access was removed. Treat this
  archive as private: it may contain actual development records and tokens.

## Forward DDL — completed

Every CREATE INDEX CONCURRENTLY ran as a **standalone SQL command** using
the separately verified exact target. Session-only bounded
`lock_timeout=5000ms` and `statement_timeout=120000ms` were used.
The catalog and target identity were rechecked before each command.
No Task/Audit/Session data rows were updated.

```sql
CREATE INDEX CONCURRENTLY audit_events_parked_org_entity_idx
  ON public.audit_events (organization_id, entity_id)
  WHERE event_type = 'VALET_SESSION_PARKED';

CREATE INDEX CONCURRENTLY audit_events_parked_org_task_ref_idx
  ON public.audit_events (organization_id, (metadata_json->>'taskId'))
  WHERE event_type = 'VALET_SESSION_PARKED';
```

Both returned **CREATE INDEX** successfully. `ANALYZE public.audit_events`
also completed to refresh planner statistics.

## Independent post-flight checks

- PostgreSQL catalog shows **exactly two** candidate indexes with the
  accepted key/expression and partial predicate:
  `indisvalid=true` and `indisready=true` for each.
- Both index files measured **16,384 bytes** each on this small dev DB.
- The same database and cluster/data-directory were confirmed after DDL.
- Exact current Audit count **482**; exact `VALET_SESSION_PARKED` count
  **21**, unchanged from preflight. No changes to migration count:
  **77 applied / 0 unresolved**.
- The application connection `DATABASE_URL` authenticated as the
  intentionally restricted `valet_runtime` role, and read `audit_events`
  successfully under `BEGIN READ ONLY`; both installed indexes were
  also visible/valid to that connection.
- The planner can prefer other indexes or even scans with only 21 parked
  Audits. A forced-index diagnostic selected the new task-reference index
  for the matching expression; this is **not** a production latency claim.
- The previously verified full Dense100 HTTP 4,000-Audit suite and the
  CREATE/DROP rollback rehearsal ran on separately owned test child DBs,
  **not on this real development DB**. Index rollout here does not imply
  that #276's unmerged feature code is deployed on main.

## Verified rollback plan — not executed on the real dev DB

If rollback is needed, first check target identity again and ensure these
index names still refer to **exactly** this rollout's definitions. Run
each statement independently, **outside an explicit transaction**:

```sql
DROP INDEX CONCURRENTLY public.audit_events_parked_org_task_ref_idx;
DROP INDEX CONCURRENTLY public.audit_events_parked_org_entity_idx;
```

Inspect `pg_index.indisvalid` / `indisready` if any operation is
interrupted. Do not use `CASCADE`, force-close unrelated database sessions,
or overwrite the backup. The index-only rollback has previously passed on
a verified **isolated synthetic clone**, not on this actual dev DB.

## Remaining workflow gate

U-004 visual design was explicitly accepted by the Owner in chat.
This step confirms the **database deployment gate** for this specific
Windows dev environment only.

Issue #276's source and tests still reside as uncommitted changes in the
protected worktree. A reproducible version-controlled migration / index
deployment mechanism for other databases, the final whole-diff review,
and **separate express authorization to commit and fast-forward merge**
remain outstanding. No change was made to `main`.
