# Issue #333 U-002 — W2 PostgreSQL lease-loss falsification

Status: **test-only experimental protocol; no runtime remediation approved**.
Baseline: `a4f5f2c6589b6be01b7db99cac4e6829986007f1`.

## Question and bounded claim

DEC-108:17-42 requires an ordered canonical LocationAccess revoke COMMIT
against completion of protected server-side HTTP delivery. The proposed
U-002 response-held PostgreSQL session advisory is conditional: when a PG
backend vanishes before HTTP `finish`, its SHARED lock may disappear while
the already-assembled HTTP body is still writable.

The F03/F04 experiment reproduces **only the lock/transport failure mode**
with a small task-owned Node HTTP response, a synthetic marker, the actual
runtime `boundedPostgresPool` lease logic, a real PostgreSQL 17 connection
and the authenticated canonical Staff Management HTTP revoker. This is not
an authenticated reader from any of the five vulnerable VAYLET routes, nor
evidence that a completed proposed remediation exists.

## Private cluster and safety

- Run only through `scripts/validation/issue333/run-owned-postgres.ps1`
  with `-Suite issue333 -TestFile
  test/dashboard-issue333-u002-lease.integration.test.ts`.
- Runner creates a random localhost PostgreSQL 17 cluster under **this**
  worktree; verifies role, port, PGDATA and version before setting URLs.
- `startIssue333Lab` separately verifies the private owner and disposable
  migrated child database plus non-superuser application runtime role.
- Test terminates only a PID positively identified in that exact child DB,
  as the reader's runtime principal and holder of the exact SHARED advisory.
- Never touch the retained historical W3 PGDATA. Never copy or log passwords,
  tokens, TOTP, contact data, or full HTTP headers.
- Runner owns cleanup, records its child DB/connection inventory and preserves
  any nonempty cluster for owner review. No external cleanup.

## Deterministic interleaving

1. Seed an ACTIVE Location Manager with synthetic Location grants A and B,
   plus an MFA-assured Company Admin in the same Organization.
2. Task-local loopback Node HTTP reader acquires the same Organization SHARED
   session advisory on a bounded runtime PG lease; attests backend PID and
   an exact current grant, buffers a synthetic marker and pauses before
   `response.end`.
3. Real authenticated CA `/location-access/revoke` HTTP POST starts; observe
   an EXCLUSIVE advisory writer backend whose `pg_blocking_pids` contains
   that reader PID.
4. **F03**: allow the real `ownPostgresLease` watchdog to destroy the leased
   backend. **F04**: terminate only the attested reader PID with PostgreSQL's
   `pg_terminate_backend` from the private test owner.
5. Observe writer HTTP 201, independent persisted A grant count zero, absent
   reader advisory lock, and HTTP `finish` still absent.
6. Resume the loopback response. If synthetic protected marker bytes finish
   *after* the writer's acknowledged commit, the **uncoupled lease candidate**
   is falsified. Record exact order and connection cleanup.

Test PASS means the deliberately uncoupled *harness mechanism was falsified*;
it is a **negative security-design result**, not GREEN remediation.

## Acceptance boundaries

Report separately:

- Real PG17 backend lock wait and owner-verified failure: PASS/FAIL.
- Real authenticated canonical writer commit plus grant disappearance: PASS/FAIL.
- Buffered HTTP marker and server `finish` after writer commit: PASS/FAIL.
- Tested protocol cleanup and child DB inventory: PASS/FAIL/BLOCKED.
- Five actual application reader paths and new fail-closed mechanism:
  **UNVERIFIED** until those independent route-level tests execute.

No ValetSession/Task/Dispatch transitions, database schema, configuration,
API surface, runtime grant or product-policy behavior changes.

## Executed PostgreSQL 17.11 result

**Harness-falsification PASS (2/2). Security-design result: RED for an
uncoupled response-held session advisory. Five real reader routes:
UNVERIFIED.** This is not evidence of a committed U-002 implementation.

Command, from the assigned isolated worktree:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite issue333 -TestFile test/dashboard-issue333-u002-lease.integration.test.ts
```

Evidence run: `d3d6aeda711245229a54fd0c05e48f46`,
under `tmp/issue-333-w6-evidence/` in the isolated worktree.
`identity.txt`: database `postgres`, owner `issue315_owner`, localhost
port `60992`, PGDATA nested under this worktree's random `issue319-`
directory, version `170011`. The test fixture verified the disposable
child database and the unprivileged runtime role before either scenario.

| Observed fact | Watchdog F03 | Backend loss F04 |
| --- | --- | --- |
| Reader backend PID (held one SHARED advisory) | 16632 | 26516 |
| Canonical writer PID blocked by reader | 31320 | 31320 |
| Failure trigger | Lease watchdog, expirations 1 | Verified `pg_terminate_backend(26516)` |
| Canonical MFA Company Admin revoke HTTP status | 201 | 201 |
| Independently persisted revoked grant count | 0 | 0 |
| Reader advisory locks after writer COMMIT | 0 | 0 |
| Synthetic HTTP finish occurred after writer HTTP 201 | true | true |
| HTTP socket aborted before finish | false | false |
| Synthetic marker delivered HTTP 200 | yes | yes |

`tests.txt:13-25` records both assertions and observed PIDs. In F04,
`server.txt:5` records the backend's termination. `cleanup.txt` records
`0` child databases and `0` residual connections; runner reported
`exit=0 removed=True` and stopped/deleted only its generated cluster.
The warning in `tests.txt:4-12` is the existing pnpm launcher
deprecation notice and did not affect the test result.

The lock failure is supported by `apps/api/src/common/database/postgres-lease.ts:107-125`:
watchdog, client error and client end dispose of the PostgreSQL lease,
without an HTTP response-abort channel. The task-local synthetic HTTP
handler intentionally also lacks that channel. The tests establish
the concrete failure mode, not disclosure by a production route.
