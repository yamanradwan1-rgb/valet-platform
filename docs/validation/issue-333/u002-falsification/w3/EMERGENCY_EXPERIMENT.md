# Issue #333 / U-002 W3 — emergency global User disable falsification

Status: **verification design; results pending**. This experiment is limited to disposable local PostgreSQL 17, test-only Nest API child processes and the supported controlled security-disable CLI. It does not implement the U-002 response fence.

## Locked boundary and distinct action

- DEC-081 (`docs/decisions/DEC-081_STAFF_ROLE_AND_ACCESS_LIFECYCLE.md:19-28`) requires emergency/security disable to block *new and current* access immediately, revoke affected sessions/attention and leave operational custody records truthful. Global User disable is distinct from Organization-scoped membership disable.
- DEC-108 (`docs/decisions/DEC-108_LOCATION_ACCESS_REVOCATION_DELIVERY.md:60-75`) preserves that stronger emergency requirement while defining an independent, ordered LocationAccess grant-revocation delivery contract. An ordinary grant revoke must not be substituted for the security disable.
- Canonical security operation: `apps/api/tools/security-disable-staff.ts` delegates to `tools/security-disable/persistence.ts`, which serializes account security, changes User status, revokes Staff sessions and push endpoints, appends audit and commits in one transaction. No direct User SQL mutation is used in this experiment.

## Concrete falsifiers

The test will create an active Location Manager with an actual Organization, granted Location, valid Staff session and identifiable private Location sentinel. Two independently spawned Nest API OS processes use the disposable database's restricted runtime role. Reader A enters the real Dashboard Locations service, completes its real SQL read, then waits in a **test-only process-local gate** before HTTP serialization. The supported CLI disables the User and commits. Reader A is released; its actual `ServerResponse.finish` / `close`, status and body are compared with independent persisted User/session/audit state. Reader B then attempts new admission with the same credential.

| Schedule | Evidence required | Falsifier / allowed result |
| --- | --- | --- |
| Reader-first | A SQL-read gate, CLI COMMIT witness before A response finish | Private sentinel delivered after disable = RED for the current-access contract |
| Emergency-first | CLI success plus independent DB witness, then B protected GET | No protected success; forbidden private bytes = RED |
| Slow reader | Wall-clock held A response, writer elapsed time and finish/commit timestamps | Exposes whether writer is blocked by the reader or can commit while A pending |
| Disconnect | Abort A before gate release; process `close` (without `finish`) | Later private response delivery or stalled writer = RED; ambiguity is UNVERIFIED |
| Lost acknowledgment | Operator command committed but first stdout success is intentionally withheld from observer; replay same operationId | Exactly one security audit, disabled User and revoked sessions; consumer-lost ACK is **not** process crash or server-side COMMIT-ACK loss |
| New-admission gap | A third active user; test-owned transaction holds the existing per-User advisory lock; canonical CLI queues, then B GET queues behind it; observe `pg_locks` waiter PIDs and blockers; release test lock | Reader must fail closed after writer COMMIT; private success = RED |

The test records sanitized OS PID identities, PG17 cluster port/data directory fingerprint and backend PIDs when observable, commit ordering and HTTP terminal events. It does not equate a preliminary handler result with `finish`, promise completion with commit, or an unchanged previous RED result with a safe design. If compiled API or authenticated integration cannot run, record exact blockers and the reduced coverage.

## Isolation and cleanup

Use existing `scripts/validation/issue333/run-owned-postgres.ps1` with the exact accepted `test/dashboard-issue333-u002-emergency.integration.test.ts` name. Its private PG17 marker, random database/role, runtime non-superuser assertions and safe cleanup govern the run. Stop only PIDs spawned by the test. The W3 historic PostgreSQL artifact, Owner worktree, runtime code, Dashboard/Policies Studio, schema, migration and production/shared QA resources are outside scope.
