# Issue #309 W5 follow-up — runtime DB proof, 2026-10-21

**Source inspected:** Prime isolated `/valet-platform/tmp/issue-309-production`
at `03f037e5308276e4af753bf33e9ac31eb52349ed`; W5's isolated
`feat/issue-309-w5-tests` worktree. **Production photo VIEW: still DENY.**
This follow-up contains test evidence and an implementation constraint assessment
only. It authorizes no migration, database grant, VIEW policy, release or deploy.

## Independent infrastructure and exact proof

The W5 run created a fresh privately-owned `postgres:17-alpine` container with
tmpfs, a randomized loopback port, independent migrated databases and uniquely
named restricted runtime roles. The authenticated test-run manifests and
identity gate were enforced by the existing #215 protected PG harness. A separate
versioned private Chainguard MinIO bucket used its own loopback port, test
identity, and tmpfs; other existing photo-QA containers were untouched.

The new, durable test
`apps/api/test/issue309-photo-db-blocker-proof.test.ts`:

1. Connects as the **actual provisioned restricted API runtime role**, whose
   `anti_abuse_events` permissions intentionally allow column-level
   `INSERT(scope,key_hash,state)` but **not** table-wide INSERT. It reads the
   current database CHECK definition, then attempts a valid-form COUNTED event
   for `v1:dashboard-session-photo-view-user`. PostgreSQL returns **23514**
   on **`anti_abuse_events_scope_check`**, leaving zero rows. This is the
   durable photo VIEW admission failure at
   `session-photo-admission.ts:17-20`, before session authorization and storage.
2. Confirms `SELECT=true`, `UPDATE=false` on each of
   `vehicle_photo_verifications`, `vehicle_photo_availability`,
   `condition_photo_upload_attempts`, and
   `condition_photo_upload_operations`. Plain `SELECT` is permitted; the same
   empty query with `FOR SHARE` fails on **each** table with **42501**.
   W4's `session-photo-query.ts:104-153` requests these exact locks on the
   last authorized JPEG delivery transaction. It cannot run with this role.

The isolation of these errors matters: the normal HTTP endpoint fails at the
anti-abuse scope check before it reaches a final photo evidence lock. An HTTP
`503` alone cannot prove the final row-lock error, permission denial, or a
successful revocation race. The protected direct-DB test proves the two
independent reasons while retaining all runtime restrictions.

## Safe remediation search within existing authorization

**No permitted application-only change was found that enables a real positive
photo VIEW while preserving the existing guarantees.** The options below do
not meet the current contract:

| Candidate | Why insufficient |
| --- | --- |
| Reuse `v1:condition-photo-upload-user` or `v1:condition-photo-status-user` | Couples new Management-view traffic to employee upload/status quotas and damages existing #215 budget isolation. |
| Skip persistent admission or use only process-local counters | Removes the durable per-User 15-minute admission guarantee across restarts/replicas. |
| Final plain `SELECT`, `READ COMMITTED` second query, or a shared management advisory lock alone | Does not lock the photo availability row against the existing employee or maintenance `FOR UPDATE` availability downgrade. |
| `FOR KEY SHARE` | Does not block an UPDATE to the non-key `state`/`reason` availability columns, so cannot replace `FOR SHARE` for byte enqueue. |
| Invoke existing photo maintenance/employee SECURITY DEFINER functions | Those are mutation-purpose authorities, have different role constraints and side effects, and are not an approved exact Management read-lock capability. |
| Give runtime broad UPDATE or direct column UPDATE | Expands immutable evidence-table mutation privilege contrary to the existing least-privilege design. |

`condition_photo_set_availability` in the applied #215 migration uses
`FOR UPDATE` on `vehicle_photo_availability`, as does
`condition_photo_maintenance_mark_unavailable`; their current writers do not
take a photo-view-specific advisory lock. The existing post-S3 last check must
therefore preserve a conflicting row lock through byte enqueue. Further, the
response `res.end()` currently precedes transaction COMMIT, leaving a separate
fault/linearization decision gate; solving either SQLSTATE does not close it.

The narrow **proposal**, requiring separate owner/security/database approval,
is already recorded in
`docs/validation/issue-309-production/w7-photo-db-authorization-proposal.md`:
forward-only addition of the one new anti-abuse CHECK value, and a strict
`SECURITY DEFINER` verified-photo row-lock helper with exact argument binding,
explicit EXECUTE-only privilege and independent writer-race tests. Neither
proposal was applied in W5. Until approved, preserve production default-deny
and report real Management image delivery **BLOCKED / NO-GO**.

## Validation separation

- Original #215 upload/verification persisted HTTP flow: **6/6 PASS** using
  actual restricted PG17 and private versioned MinIO. This is evidence of
  continuing upload functionality only.
- New direct restricted-DB blocker tests: **2/2 PASS** with SQLSTATE 23514
  and 42501 asserted separately. These are evidence of known blockers, not
  successful photo retrieval.
- New #309 Management HTTP manifest/JPEG/grant-race cases: a fresh two-file
  run on these disposable PG17/MinIO resources **failed 7/7**. The five photo
  viewer assertions saw **HTTP 503** rather than the intended 200 or 403/404,
  including the concurrent case's four responses `[503,503,503,503]`.
  Both revoker-first tests failed `blocked=false` because the HTTP reader
  did **not** reach a shared-advisory wait while the writer held its exclusive
  management grant lock. This is **not** a proven bypass: the SQL23514
  admission failure preempted authorization and the requested concurrency
  assertions. No real positive Management JPEG delivery was observed.
- The new blocker test's initial draft had an invalid assumption that the API
  role had table-wide INSERT on `anti_abuse_events`. The actual provisioner
  grants **column-level** INSERT on the required fields, intentionally
  denying table-wide INSERT. The test was corrected to inspect those three
  grants; its final actual-DB rerun passed **2/2**.

Focused static checks after the test-only change: API TypeScript typecheck
**PASS**, scoped ESLint **PASS**, protected exact-file test classification
**4/4 PASS**, `git diff --check` **PASS**. Per-suite PG harness teardown
reported **db=0 roles=0 children=0**, without touching external clusters.

All test resources belong exclusively to W5; the final owner-scoped Docker
teardown and zero-remaining-container checks are part of this follow-up.
