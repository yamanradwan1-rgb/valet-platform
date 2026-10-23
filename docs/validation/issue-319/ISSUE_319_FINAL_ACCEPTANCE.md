# VAYLET Issue #319 — Final Security Audit Acceptance / Owner Handoff

> **Historical pre-remediation audit checkpoint — preserved at `af62a11add5d97ec291ca0dbf49fdd29be88f708`.** The Owner subsequently approved F319-01/F319-02, then F319-03/F319-04 Branding/Subscription, and finally F319-05 CA RR MFA recovery. The original statements below describe the vulnerable baseline, **not the current patched worktree or Issue closure verdict**. Current tested findings, F319-05 red-to-green evidence and final security decision are in [remediation/FINAL_REMEDIATION_ACCEPTANCE.md](remediation/FINAL_REMEDIATION_ACCEPTANCE.md). Original logs are deliberately retained.

**Decision: SECURITY NO-GO for Issue #319 closure.** Two independently reviewed P2 read-revocation races are reproduced by real loopback HTTP and isolated PostgreSQL 17.11; application authorization has **not** been changed. Separate Owner approval is required for the narrowed production remediation, then regression proof and a renewed review. No merge, deployment or Issue closure is authorized by this report.

## Exact repository and environment identity

| Field | Value |
|---|---|
| Source repository | yamanradwan1-rgb/valet-platform |
| Baseline origin/main, tested application source and #315-descendant | 20998a069eb5d576895c0e6c149271a4a0e4028b |
| Historical #315 reference | 459e9c42dfff5b2aeb11ee9165a7d1a4338a7783 (ancestor; not assumed HEAD) |
| Dedicated branch | audit/issue-319-dashboard-revocation-coverage |
| Isolated worktree | /valet-platform/tmp/issue-319-audit |
| QA/test artifact commit | Determined by final branch commit after staging the exact test/documentation files; branch git history is authoritative. Source-under-test SHA remains 20998a0. |
| Database | Task-owned private local 127.0.0.1 PostgreSQL 17.11; random nondefault port, owner issue315_owner, per-fixture runtime role non-superuser/non-createdb/non-createrole |
| Migration identity | issue315_owner; explicit TEST_DATABASE_URL=MIGRATION_DATABASE_URL to validated private /postgres only; ambient DATABASE_URL removed |
| Cleanup | logs/audit-cleanup.txt: child DBs 0, child connections 0, unique owned cluster directory removed true |

The test harness guards runtime identity, private data_directory and explicit ISSUE319_EPHEMERAL_PG before any mutation. No production or shared development database, no real customer records, no external credentials. Baseline private-cluster run also cleaned up fully (logs/baseline-cleanup.txt).

## Source coverage and depth

- **89 GET patterns reviewed in source**: 85 registered concrete GET patterns in the two core modules (40 Dashboard, 45 Management, including seven twice-mounted inherited Presence handlers; 78 underlying GET declarations) plus four adjacent operational Staff vehicle/tracking GETs clearly labeled outside the core denominator. Two read-producing POST export endpoints inventoried separately. Default HEAD alias behavior is untested. This is a source enumeration, **not** 89 HTTP race proofs.
- **19 policy/authorization inventory families** distinguished in authorization-path-inventory.md (D315, KPI, LIVE, PHOTO, SIMPLE, DISC, PHYS, FEATURE, REPORT, CA, CA-RR, CA-DISC, AUDIT, STAFF, CONTACT, LIFE, GUESTINFO, PRES, INVEST). These are source classifications, not 19 independently tested implementations. **16 D315 routes + 69 non-D315 routes (including KPI) = 85 core GET routes**. KPI separately uses the pre-RR advisory mechanism.
- **13 authorization-state categories** mapped in authorization-writers.md: **11 application/operator writer categories** (role, membership status, grant/revoke, onboarding, Staff activation, Location lifecycle, session issuance, refresh/rotation, logout, global disable, MFA); two additional boundaries (Organization status and commercial entitlement) have no verified ordinary application writer. Precise functions, row/advisory order and threat-model exclusions are in that document.
- Verified application role/scope negative cases include LM, CA with/without MFA, Employee, Supervisor, foreign Organization, same-Org ungranted Location, unknown location ID, disabled User, inactive membership/Org/Location, expired session, fresh post-logout and post-revoke. Verified in-flight contrasts: physical resources, RR overview, legacy Configuration, real CA Location deactivation both orders.

## Exact validation

| Evidence | Command / scope | Final result |
|---|---|---|
| #315 prior guards (new private cluster) | powershell -NoProfile -ExecutionPolicy Bypass -File docs/validation/issue-319/run-lab.ps1 -Suite baseline | 4 files, **28 PASS / 0 FAIL / 0 SKIP** |
| New #319 isolated PostgreSQL / real HTTP | powershell -NoProfile -ExecutionPolicy Bypass -File docs/validation/issue-319/run-lab.ps1 -Suite audit | 4 files, **25 PASS / 0 FAIL / 0 SKIP**; 7 Physical GETs checked for fresh deny in one sequential loop test |
| API typecheck | pnpm --filter @valet/api typecheck | PASS, exit 0 after final test assertion |
| API lint | pnpm --filter @valet/api lint | PASS, exit 0 after final test assertion |
| Architecture | pnpm architecture:check | PASS, exit 0; existing grandfathered file-length warnings |
| API build | pnpm --filter @valet/api build | PASS, exit 0 |

Real HTTP is from Nest + native login/MFA + actual repository queries on loopback, not mocked SQL. Test function wrappers only create deterministic barriers; transaction and protected projection actually run. Audit test log: logs/audit-tests.txt; identities: logs/{baseline,audit}-identity.txt; exit+cleanup: logs/{baseline,audit}-cleanup.txt; local pnpm command exit records: logs/quality-checks.txt. No production SQL, CI remote scan or browser session is claimed. The Configuration test label in the historical run log still says 'F319-01' because it predates separate finding triage; its final validated classification is **F319-02**.

## Confirmed findings and reviewer judgment

| Finding | Severity | Evidence | Gate |
|---|---|---|---|
| F319-01 Physical Resources LM stale projection (including RR overview variant) | P2 confirmed | CA MFA Staff Management revoke HTTP returned 201 before in-flight LM GET 200 with synthetic key slot; new GET 404. App-level and canonical SQL traces in http-authorization-acceptance.md. | Scoped shared org grant fence/fresh recheck, RR pre-BEGIN lock, tests |
| F319-02 Legacy Dashboard Configuration stale projection | P2 confirmed | Canonical revoke committed before original GET returned 200 with org/location IDs and a settings array of length ten; individual values/private sentinel not asserted. Fresh GET 404. | Configuration LM recheck/fence + sentinel regression; examine branding/subscription separately |
| P0 / P1 | 0 / 0 confirmed in verified exercised scope | Independent review plus test evidence; not a universal clean bill of health | Continue uncovering unknown routes/writers where necessary |

Independent reviewer **W4, signed 2026-10-23: P0=0, P1=0, P2=2; NO-GO Issue closure.** Reviewer inspected the source-path inventory, canonical writer locks, live HTTP+PostgreSQL logs, MFA/session semantics, seven Physical Resource paths, scope discovery, the test schedules and cleanup. Reviewer explicitly rejected universal seven-route concurrent-proof claims. No review edits or privileged DB interaction.

## Concurrency and performance

Location lifecycle via real Company Admin endpoint: reader-first blocks writer then read completes, deactivation 201, fresh read 404; revoker-first writer completes before waiting LM read, which returns 404. Lock-wait counts observed (1 and 2), with no exact backend PID blocking graph proven. Already-resolved logout requests may yield 200 on LM Overview/Physical while fresh post-logout GETs return 401, consistent with DEC-023's new-resolver boundary; a stronger cancellation requirement is an explicit open contract question.

Uncontended local HTTP 80 samples/route: Dashboard p50/p95 13.98/20.95 ms, Physical 8.44/14.05 ms, scope discovery 12.16/25.32 ms. Max 88.92/24.15/36.71 ms respectively. No before/after production patch or supported p95 lock-wait distribution; deliberate contention sample count too small. No PostgreSQL deadlock observed in these selected runs, **not** a deadlock-free proof. See lock-performance.md.

## Unverified boundaries (hold, not fictitious PASS)

- Scope-discovery in-flight grant revocation, Management Visit Contacts and other independently authorized paths: exact code mapped, but no per-route HTTP race matrix across all 85 core routes. An adjacent Live Operations map GET starts an RR snapshot and uses a separate unfenced LM/Supervisor grant SELECT: a source candidate, **not** a confirmed exploit.
- In-flight refresh/credential rotation, factor invalidation, controlled global User disable, membership role downgrade and new grant after revoke: only selected current-state and historical #315 contracts covered.
- Two-reader+revoker and cross-Organization simultaneous lock matrix, lock/statement timeouts, connection cancellation and rollback/quarantine, and all error-path KPI session-lock releases were not newly exercised in #319.
- Complete lock PID graph, contended latency distributions and uniform response-time semantics are not established. Some #315 reports compose several transactions; authorization linearization does not retroactively recall already delivered bytes.
- Privileged DBA SQL that does not participate in application advisory locks is outside the cooperative-lock threat model. No supported runtime Organization status or entitlement writer was identified; arbitrary SQL updates are not treated as a canonical app writer.

## Files, diff, approval and closure

Evidence index: authorization-path-inventory.md; authorization-writers.md; postgres-revocation-matrix.md; http-authorization-acceptance.md; lock-performance.md; security-findings.md; this report; logs and executable test harness. Tests: apps/api/test/dashboard-issue319-lab.ts and four dashboard-issue319-*.integration.test.ts files. The only implementation changes in this branch are task-owned **test/evidence**. Production Dashboard React/CSS/icons/copy/routes, auth/runtime source, database migrations, runtime privileges, configuration and UI are unchanged. No deployment, PR, merge, production mutation or Issue closure performed.

**Owner action**: Approve or reject a separate focused production authorization correction for both P2 findings. After GO, validate bidirectional real CA writer races, RR snapshot ordering, session/MFA boundaries, transaction cleanup, contention/deadlocks and independent regression review. Until that is done: **HOLD #319 OPEN — SECURITY NO-GO**.

NO CONFIRMED NEW P0/P1 WITHIN THE VERIFIED #319 SCOPE. The statement is limited by the enumerated missing test cases and cooperative writer threat model.
