# Issue #333 — W3 P1-B Dashboard Scope Discovery: source and blocker report

Status: **BLOCKED / UNVERIFIED for in-flight revocation**. Read-only production-source audit plus a bounded disposable-PostgreSQL/real-HTTP verification attempt. No P0/P1/P2 vulnerability has been confirmed by this W3 exercise.

## Provenance and scope

- Immutable source baseline: `c638a437749cae1f78a8c8a417fd4d53e6a34920`.
- Isolated worktree: `tmp/issue-333-w3`; branch `audit/issue-333-w3-scope-discovery`.
- Scope: Issue #333 P1-B, `GET /v1/staff/dashboard/organizations` and `GET /v1/staff/dashboard/organizations/:organizationId/locations`. No production source, migration, schema, grant, dependency-lockfile, UI or deployment edits.
- Historical accepted #319 **89/89** and #315 **28/28** remain the baseline; W3 did not rerun those suites or reopen their eight accepted fixes.
- Binding authority reviewed: AGENTS.md, DEC-023 in `docs/08_DECISIONS_LOG.md` (current session, User identity), DEC-078 (exact-session MFA), DEC-080 (Company Admin), `docs/17_AGENT_CODE_STRUCTURE_RULES.md`, and #319 writer/path inventories.

## Current source contract and candidate

| Boundary | Source evidence | Consequence |
| --- | --- | --- |
| Staff HTTP authentication | `apps/api/src/modules/dashboard/dashboard-scope-discovery.controller.ts:60-100` | Exact bearer resolver and no-store responses; input and cursor are validated. |
| Organizations reader | `dashboard-scope-discovery.service.ts:31-75` | Transaction rechecks the exact Staff session, then a plain READ COMMITTED active User/LM membership/Organization SELECT. |
| Locations reader | `dashboard-scope-discovery.service.ts:77-157` | Exact-session recheck, a separate active LM membership SELECT at 92-109, then a granted-Location SELECT at 110-140. Inactive but granted Locations are deliberately included. |
| Canonical grant/role/membership-status writers | `staff-management.controller.ts:94-199`, `staff-management-mutation.service.ts:36-184`, `staff-management-authorization.ts:70-103` | Sensitive Company Admin MFA, exclusive `staff-management-org` advisory, target/version checks, mutation and audit in one transaction. |
| Location lifecycle writer | `management-location.service.ts:232-295`, `common/database/location-lifecycle-lock.ts:3-18`, `management-authorization.ts:95-132` | Exclusive Location lifecycle lock plus current Company Admin authority. |

Neither discovery reader acquires the canonical `staff-management-org` advisory or the Location lifecycle advisory for membership/grant/location projection. This is a **source-level concurrency candidate**, not proof that protected data was disclosed after revocation. Location deactivation alone also does not imply that an inactive granted Location should disappear from discovery.

## Authenticated HTTP and private PostgreSQL observations

The W3 test-only harness used PostgreSQL 17.11 on `127.0.0.1`, a fresh `issue315_owner`-owned database cluster, real migrations, Nest HTTP requests, an actual runtime database role, a Staff bearer session, and Company Admin TOTP MFA for the canonical writer. Synthetic W3 identifiers and Location names were used; no customer data or shared/production database was accessed.

| Case | Observation | Classification |
| --- | --- | --- |
| Multiple Organization memberships / role separation / foreign tenant | Active LM memberships listed, Supervisor-only Organization and foreign Organization excluded; granted Location per Organization only; no-store header present. | **PASS** in tested fresh HTTP contract |
| Fresh canonical CA-MFA Location-access revoke | HTTP writer returned 201; subsequent LM Locations read returned only the independently granted Location. | **PASS** in tested fresh HTTP contract |
| Password-only Company Admin revoke attempt | Returned HTTP 403; subsequent LM Locations read retained its original granted Location. | **PASS** in tested fresh HTTP contract |
| Grant revoke after in-flight SQL projection | The test-side SQL barrier was never positively reached; no ordered writer/reader proof. | **BLOCKED / UNVERIFIED** |
| Role downgrade after in-flight Organizations projection | SQL barrier not reached; no ordered proof. | **BLOCKED / UNVERIFIED** |
| Membership deactivation after in-flight Organizations projection | SQL barrier not reached; no ordered proof. | **BLOCKED / UNVERIFIED** |

The attempted interception of a PostgreSQL client query had no positive target-SELECT/backend-PID trace. Therefore **none** of the three race cases establishes a 200 response after a proven canonical writer commit. The absence of an observed leak is not a PASS.

## Exact commands and failure gate

1. `pnpm install --offline --frozen-lockfile` within W3: exit 0; 1,043 cached packages linked; lockfile unchanged.
2. `pnpm --filter @valet/api typecheck` after the test-only interceptor revision: exit 0. This proves TypeScript only, not the race.
3. `powershell -NoProfile -ExecutionPolicy Bypass -File docs/validation/issue-333/w3-scope-discovery/run-private-pg.ps1`:
   - First disposable run: 3 passed, 3 SQL-barrier timeouts, exit 1; post-test child database/connection inventory `0/0`, cluster directory removed.
   - Second unique disposable run: 3 passed, 3 SQL-barrier timeouts; `afterAll(() => fixture.stop(), 90_000)` also timed out. Suite exit **1**. The private PostgreSQL server stopped, but cleanup inventory was **1 child database / 0 child connections**. Cleanup guard intentionally preserved the owned directory: `OWNED_W3_CLUSTER_DIRECTORY_REMOVED=False`.
4. Sanitized second-run evidence in the W3 worktree: `docs/validation/issue-333/w3-scope-discovery/logs/{identity,tests,cleanup}.txt`. Those raw logs are local investigation artifacts, not part of this report-only commit.

Second-run private cluster identity (non-secret): database `postgres`, owner `issue315_owner`, loopback port `59326`, server version `170011`, data directory
`D:/kndoom/valet-platform/tmp/issue-333-w3/tmp/issue-315-pg-qa/issue319-issue333-w3-c9de2faf0847446cb24af327bf9cdaa7/.issue315-private-cluster`.
The failed test fixture created `valet_mob007_auth_13504_7c6f1e24` with a distinct nonsuperuser runtime role; its residual private test database was not cleaned after the teardown timeout. The private server is stopped. **Do not delete or reuse this directory automatically; preserve it for owner review.**

## Test-only blocker diagnosis and safe next steps

- `apps/api/src/common/database/bounded-postgres-query.ts:17-18,95` replaces each leased client's `query` instance function. `bounded-postgres-pool.ts:68,137-243` also replaces the pool instance's `connect`. An unverified prototype or instance spy is not proof of reaching the target SQL.
- The aborted race tests release their latch after `awaitEntered` times out but do not await the pending HTTP request before Vitest restores spies. This is a plausible test-harness cause of lingering leases/teardown delay. `staff-auth-native-fixture.ts:241-251` awaits Nest app close before dropping its child database. The exact cause was **not** established by tracing; do not treat this hypothesis as confirmed.
- In a fresh authorized test run, use the shared W6-owned, private PostgreSQL harness; positively instrument the exact active service/transaction and capture SQL SELECT completion, backend PID, blocking PIDs where applicable, canonical HTTP 201 commit, and response order. On any barrier failure, release the latch and `await Promise.allSettled` on every in-flight HTTP request before teardown.
- Exercise reader-first and revoker-first schedules separately. Treat a genuine protected sentinel returned after canonical revocation as **RED evidence even if a characterization test assertion passes**. Stop and request a separate Owner remediation decision; do not alter production authorization under #333.
- Keep Location status, membership role/status, grant, Organization scope, and session revocation claims distinct. DEC-023 does not silently require cancellation of reads already completed at its authentication resolver.

**Gate:** W3 P1-B in-flight coverage remains **BLOCKED**, and W3 private-test cleanup **FAILED**. The three fresh-HTTP negative results are scoped evidence only. No direct exploit, production fix, merge, PR, deployment, or issue closure is claimed.
