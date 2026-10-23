# Issue #319 — PostgreSQL revocation and read-authorization matrix

> **Historical baseline run only.** The 25/25 green assertions here intentionally include stale HTTP 200 vulnerability reproductions at the original source SHA. See [remediation/postgres-race-regression.md](remediation/postgres-race-regression.md), [remediation/F319-05-ca-mfa-rr-finding.md](remediation/F319-05-ca-mfa-rr-finding.md) and the final remediation acceptance for patched test counts and remaining NO-GO.

**Status:** FINAL evidence report, read-only audit of VAYLET baseline origin/main 20998a069eb5d576895c0e6c149271a4a0e4028b on 2026-10-23. **Runtime:** isolated PostgreSQL 17.11, actual API HTTP requests, synthetic tenant fixtures. **Product changes:** none.

**Result:** #319 audit **25/25 PASS in four test files** (logs/audit-tests.txt:124-139); independent #315 baseline **28/28 PASS in four files** (logs/baseline-tests.txt:13-54). PASS describes the assertions made by these tests; the tests intentionally reproduce certain authorization races, so a green suite is **not** a product security GO. Specifically, F319-01 is a **confirmed stale in-flight disclosure** in Physical Resources, including a real Company Admin Staff Management revoke. A separate legacy Configuration GET demonstrates the same stale-in-flight pattern. The canonical #315 Dashboard read fence does block the tested real Location lifecycle deactivate in both orders.

## Environment, identity and cleanup

| Evidence | Audited value | Provenance / qualification |
| --- | --- | --- |
| Audit PostgreSQL engine | PostgreSQL **17.11**, x86_64-Windows, MSVC 19.44.35228, 64-bit | logs/audit-identity.txt:1-3 |
| Audit parent DB/owner/listener | postgres / issue315_owner / **127.0.0.1:65399** | logs/audit-identity.txt:1-6; apps/api/test/dashboard-issue319-lab.ts:19-40 |
| Audit private data directory | D:/kndoom/valet-platform/tmp/issue-319-audit/tmp/issue-315-pg-qa/issue319-cb8978a5b24f4e7bb45cedc31c4c7658/.issue315-private-cluster | logs/audit-identity.txt:2; this exact directory was temporary |
| Audit fixture application DB role | valet_runtime_mob007_* with rolsuper=false, rolcreatedb=false, rolcreaterole=false; fixture database owned by issue315_owner | logs/audit-tests.txt:13-21,80-88,101-109,124-132; apps/api/test/dashboard-issue319-lab.ts:42-52 |
| Baseline PostgreSQL engine / listener | PostgreSQL **17.11**, 127.0.0.1:56697, independent issue315_owner private cluster | logs/baseline-identity.txt:1-6 |
| Audit and baseline cleanup | 0 non-template child DBs, 0 child connections, **OWNED_CLUSTER_DIRECTORY_REMOVED=True** in each | logs/audit-cleanup.txt:1-9; logs/baseline-cleanup.txt:1-9 |
| Cleanup role nuance | Final inventory still listed **valet_photo_evidence_lock_owner** (one role) before shutdown in each ephemeral cluster | logs/audit-cleanup.txt:3-5; logs/baseline-cleanup.txt:3-5; do not misstate zero residual roles |
| Runner safety | New owned child cluster with loopback ephemeral port; SCRAM; explicit fixture flags; TEST_DATABASE_URL and MIGRATION_DATABASE_URL set only for that child; DATABASE_URL removed; exact target-validated cleanup | docs/validation/issue-319/run-lab.ps1:1-63; apps/api/test/dashboard-issue319-lab.ts:19-40 |

The bootstrap account issue315_owner is a **superuser only within the disposable test cluster**; the runtime role is not. This exercise did not connect to, write, or probe production/shared PostgreSQL. Tests are locally executed under Vitest v4.1.10; a pnpm/Node DEP0190 warning appeared without failing test exit (logs/audit-tests.txt:1-12,136-139).

## Executed HTTP revocation matrix

**Legend:** LM = Location Manager; CA = Company Admin; RC = READ COMMITTED; RR = REPEATABLE READ; grant = exact membership_location_access entry. A “fresh denial” proves a new request sees revoked state; it does not imply all concurrent requests are synchronized. “Confirmed repro” means the test **passes by observing a violation**.

| Read path / order | Writer / synchronized boundary | Expected vs observed HTTP result | Outcome and exact evidence |
| --- | --- | --- | --- |
| Physical key-slot list; **reader first**, pause after LM authorization, revoke and commit, then resume projection | Canonical staff_management_set_location_access(..., false) SECURITY DEFINER SQL as runtime-compatible writer; revoke commits ahead of projection | In-flight **200 + protected keySlotId**, then fresh **404** with no items | **PASS — confirmed F319-01 stale read.** apps/api/test/dashboard-issue319-http.integration.test.ts:27-53; logs/audit-tests.txt:24-27; writer helper apps/api/test/dashboard-issue319-lab.ts:80-93 |
| Physical key-slot list; **reader first**, real CA application writer | Actual POST /v1/staff/management/organizations/:organizationId/staff/:membershipId/location-access/revoke (CA with accepted MFA), HTTP **201** completes before LM resumes | In-flight LM GET **200 + keySlotId**, fresh LM GET **404** | **PASS — confirmed F319-01 with genuine CA HTTP writer**, not merely test SQL. apps/api/test/dashboard-issue319-http.integration.test.ts:55-92; logs/audit-tests.txt:28-31; writer mapping docs/validation/issue-319/authorization-writers.md:11 |
| Physical overview; LM read opens **RR**, snapshot fixed by CA eligibility hint before LM authority | Canonical grant removal commits **before** LM authorization and projection | Stale in-flight **200**, overview keySlots includes revoked key; fresh **404** | **PASS — confirmed RR snapshot stale authorization.** apps/api/test/dashboard-issue319-http.integration.test.ts:94-119; logs/audit-tests.txt:32-35; RR entry apps/api/src/modules/dashboard/physical-resource-read.service.ts:29-54 |
| Legacy GET /v1/staff/dashboard/locations/:locationId/configuration; after LM auth, before projection | Canonical grant removal commits during paused request | In-flight **200** with locationId, organizationId, 10 settings; fresh **404** | **PASS — confirmed separate Configuration stale read behavior.** apps/api/test/dashboard-issue319-http.integration.test.ts:121-150; logs/audit-tests.txt:36-39; apps/api/src/modules/dashboard/dashboard-configuration-command.ts:54-85,94-105 |
| Dashboard overview/keys; real CA Location deactivate, **reader first** after staff-org shared fence | POST .../locations/:locationId/deactivate; writer blocked by read's held authorization fence | Authorized in-flight **200**, writer **201 only after read completes**, later **404** | **PASS — serialized for tested order; PostgreSQL lock wait observed.** apps/api/test/dashboard-issue319-lifecycle.integration.test.ts:68-90; logs/audit-tests.txt:90-93 |
| Dashboard overview/keys; CA Location deactivate, **revoker first** | Independent PG gate holds staff-org exclusive advisory, writer queues; reader then also queues; release gate | Writer **201**, waiting reader **404** and no items | **PASS — serialized for tested order; two actual PostgreSQL Lock wait observations.** apps/api/test/dashboard-issue319-lifecycle.integration.test.ts:92-120; logs/audit-tests.txt:94-97 |
| All **seven** Physical GET routes, **sequential** state check | Initial exact LM grant; remove via canonical grant SQL; issue new HTTP reads | Seven **200** before removal; seven fresh **404** after; no items in denials | **PASS — seven-route fresh-denial matrix; NOT seven concurrent-race tests.** apps/api/test/dashboard-issue319-physical-matrix.integration.test.ts:11-44; logs/audit-tests.txt:124-134 |
| Scope discovery / organizations/:organizationId/locations, fresh request after grant removal | Canonical grant removal happens entirely before HTTP request | **200** with empty items | **PASS — fresh-scope filter only.** apps/api/test/dashboard-issue319-http.integration.test.ts:236-243; logs/audit-tests.txt:73-76 |
| Session logout **committed before** request: overview/keys, Physical key slots, Location scope discovery | POST /v1/staff/auth/native/logout returns **204**, then real staff context resolver runs | **401** for each; no items | **PASS 3/3.** apps/api/test/dashboard-issue319-http.integration.test.ts:152-162; logs/audit-tests.txt:40-51 |
| Session logout **after resolver**, before service transaction: same three routes | Resolver pauses after reading session, canonical HTTP logout commits, service then proceeds | Overview **200**, Physical **200**, Discovery **401** | **PASS characterization 3/3.** apps/api/test/dashboard-issue319-http.integration.test.ts:164-195; logs/audit-tests.txt:52-63. Existing DEC-023 policy permits already-resolved requests to complete; do not automatically classify two 200 responses as violations. |
| CA current MFA; CA password-only | Normal real login and MFA enrollment/assurance | Assured CA Physical GET **200**; password-only CA **403** and no items | **PASS.** apps/api/test/dashboard-issue319-http.integration.test.ts:197-204; logs/audit-tests.txt:64 |
| VALET_EMPLOYEE / VALET_SUPERVISOR | Both roles attempt Physical Management GET | **404** for each | **PASS 2/2.** apps/api/test/dashboard-issue319-http.integration.test.ts:206-209; logs/audit-tests.txt:65-66 |
| Cross-tenant, same-tenant ungranted Location, unknown UUID | LM bearer points at unauthorized location identifiers | **404** and no items for all three | **PASS one compound negative case.** apps/api/test/dashboard-issue319-http.integration.test.ts:211-220; logs/audit-tests.txt:67 |
| Pre-request membership inactive, user disabled, Organization inactive, Location inactive, token expired | Synthetic fixture mutates each relevant record **before** request | **404** membership/org/location; **401** user/expired; no items | **PASS 5/5**, sequential denial only. apps/api/test/dashboard-issue319-http.integration.test.ts:222-234; logs/audit-tests.txt:68-72 |

The seven Physical GET endpoints actually enumerated (prefix **GET /v1/staff/dashboard/locations/:locationId/physical-resources**) are:

| # | Suffix | Controller source | Service source |
| ---: | --- | --- | --- |
| 1 | /overview | apps/api/src/modules/dashboard/physical-resource.controller.ts:49-76 | physical-resource-read.service.ts:29-54 (**RR**) |
| 2 | /key-slots | physical-resource.controller.ts:109-127 | physical-resource-read.service.ts:81-99 |
| 3 | /parking-spots | physical-resource.controller.ts:129-147 | physical-resource-read.service.ts:100-118 |
| 4 | /parking-zones | physical-resource.controller.ts:149-167 | physical-resource-read.service.ts:119-141 |
| 5 | /key-slots/:resourceId/label | physical-resource.controller.ts:169-186 | physical-resource-read.service.ts:142-165 |
| 6 | /parking-spots/:resourceId/label | physical-resource.controller.ts:188-205 | physical-resource-read.service.ts:142-165 |
| 7 | /key-slots/:resourceId/custody | physical-resource.controller.ts:78-107 | physical-resource-read.service.ts:56-79 |

The loop and its synthetic zone/spot fixtures are in apps/api/test/dashboard-issue319-physical-matrix.integration.test.ts:12-42. The LM Physical authorization branch calls the ordinary single authorization lookup (apps/api/src/modules/dashboard/physical-resource-authorization.ts:19-54); it does **not** hold the #315 shared staff-org advisory and repeat-check across projection. Overview opens RR before authorization (physical-resource-read.service.ts:34-49). Label checks use action LABEL and require active Location, unlike LIST (physical-resource-authorization.ts:25,47-53). CA follows separate Management MFA and membership authorization.

## Actual transaction and lock traces

The trace values are **monotonic milliseconds relative to each test worker**, so compare only events within a row; they are not wall-clock timestamps or network-wide ordering proofs.

| Trace from FINAL audit-tests.txt | Ordered observations and HTTP assertion |
| --- | --- |
| Physical SQL writer (:24-27) | HTTP_READER_START **24924.248** → PHYSICAL_AUTHORIZATION_COMPLETE_BEFORE_PROJECTION **24948.906** → CANONICAL_GRANT_WRITER_SQL_COMPLETE **25181.713** → CANONICAL_GRANT_COMMITTED **25181.840** → PROTECTED_PROJECTION_RESUMED **25181.847** → HTTP_READER_COMPLETE **25189.389**. In-flight 200, fresh 404. |
| Physical **actual CA HTTP** writer (:28-31) | APP_WRITER_RACE_LM_AUTH_COMPLETE **25880.224** → STAFF_MANAGEMENT_HTTP_REVOKE_START **25880.239** → STAFF_MANAGEMENT_HTTP_REVOKE_COMPLETE **26079.863** → APP_WRITER_RACE_LM_PROJECTION_RESUMES **26080.012** → LM_PHYSICAL_HTTP_COMPLETE_AFTER_ADMIN_REVOKE **26083.203**. Writer 201, in-flight reader 200, fresh 404. |
| Physical overview RR (:32-35) | HTTP_READER_START **26422.883** → RR_SNAPSHOT_ESTABLISHED_CA_HINT_NULL_BEFORE_LM_AUTH **26432.215** → CANONICAL_GRANT_WRITER_SQL_COMPLETE **26753.631** → CANONICAL_GRANT_COMMITTED **26753.867** → LM_AUTH_AND_PROJECTION_RESUME_AFTER_REVOKE **26753.879** → HTTP_READER_COMPLETE **26784.620**. In-flight 200, fresh 404. |
| Legacy Configuration (:36-39) | CONFIGURATION_LM_AUTH_COMPLETE **27119.332** → CANONICAL_GRANT_WRITER_SQL_COMPLETE **27374.914** → CANONICAL_GRANT_COMMITTED **27375.114** → CONFIGURATION_PROJECTION_RESUMED **27375.120**. In-flight 200, fresh 404. |
| Location **reader first** (:90-93) | READER_REQUEST_START **19745.311** → DASHBOARD_ORG_SHARED_FENCE_HELD **19764.576** → POSTGRES_1_LOCK_WAITS_OBSERVED **19857.720** → DASHBOARD_PROJECTION_RESUMED **19857.748** → READER_HTTP_COMPLETE **19886.604** → DEACTIVATION_HTTP_COMPLETE **19959.162**. |
| Location **revoker first** (:94-97) | POSTGRES_1_LOCK_WAITS_OBSERVED **20894.573** → REVOKER_QUEUED_BEFORE_READER **20894.603** → POSTGRES_2_LOCK_WAITS_OBSERVED **20911.225** → EXTERNAL_GATE_RELEASED **20912.010** → READER_HTTP_COMPLETE_AFTER_REVOKER **20928.138** (404). An external migration-owner advisory gate was used only for deterministic scheduling (lifecycle test :94-110). |
| Logout **after resolver** (:52-63) | Each trace shows AUTHENTICATION_RESOLUTION_COMPLETE → LOGOUT_HTTP_COMPLETE_AFTER_COMMIT → PROTECTED_TRANSACTION_START_AFTER_LOGOUT, then HTTP completion. Explicit assertions distinguish overview/physical 200 from discovery 401 (HTTP test :164-195). |

**Why Location serialization succeeds here:** apps/api/src/modules/dashboard/dashboard-read-authorization.ts:41-86 takes a transaction-scoped **shared** hashtextextended('staff-management-org:' + organizationId, 0) advisory after initial LM hint, verifies **READ COMMITTED**, repeats the live grant authorization, and holds the fence until projection transaction ends. Canonical Management Location deactivate takes lifecycle exclusive then sensitive CA/session assurance, **staff-org exclusive** and relevant row locks (apps/api/src/modules/management/management-location.service.ts:268-295; see authorization-writers.md:14,23-29). The reader-first PostgreSQL waiter and revoker-first two waiters prove coordination for those two observed orders, with no deadlock in those runs. A single passing pair does not prove all permutations or timeouts.

**Why RR Physical overview is distinct:** its query starts RR and consults the unfenced LM Physical helper, allowing the snapshot to keep a grant that was current when the snapshot began (physical-resource-read.service.ts:34-49; physical-resource-authorization.ts:47-54). The hardened #315 LM helper **deliberately rejects non-RC** snapshots after its shared advisory, because an RR MVCC snapshot can predate writer commit (dashboard-read-authorization.ts:62-86). The special KPI implementation obtains shared session advisory **before** establishing its RR transaction and should not be generalized to Physical (apps/api/src/modules/dashboard/analytics-kpi-snapshot-transaction.ts:37-154).

## #315 regression baseline — 28/28 PASS

The same audit worktree reran #315 in a **different disposable PostgreSQL 17.11 cluster**. Four test files passed (logs/baseline-tests.txt:51-54):

- **Canonical LM grant and membership races:** reader-first/revoker-first SECURITY DEFINER grant revoke, managed advisory revoke, role downgrade, Location deactivate, cross-tenant/ungranted deny, capabilities LOCATION_DASHBOARD_READ / ANALYTICS_READ / REPORTS_READ, two simultaneous readers (baseline-tests.txt:13-26).
- **Fault and isolation matrix:** same-transaction regrant, competing revokers, bounded lock_timeout instead of deadlock, fail-closed RR/SERIALIZABLE on generic #315 LM read, REPORT_EXPORT exact-session check, disabled user/inactive membership, intentional privileged raw SQL bypass characterization (baseline-tests.txt:30-37).
- **KPI RR:** real LM KPI RR snapshot, reader-first and revoker-first canonical revoke, two parallel readers; CA MFA correctness and 40001 retry in a fresh RR transaction (baseline-tests.txt:41-49).

These #315 passes establish **their named service/test contracts**, not automatic coverage of independently implemented #319 routes. Particularly, intentionally privileged raw SQL not participating in a canonical advisory lock is outside the cooperative-lock guarantee; it is documented by the tests, not prevented by them.

## Measured local HTTP latency (descriptive, not a target SLA)

The suite ran **80 sequential, uncontended** real HTTP measurements per route after one warmup (apps/api/test/dashboard-issue319-performance.integration.test.ts:11-48; logs/audit-tests.txt:111-120).

| Route | n | p50 (ms) | p95 (ms) | max (ms) |
| --- | ---: | ---: | ---: | ---: |
| Dashboard overview keys | 80 | 13.98 | 20.95 | 88.92 |
| Physical key slots | 80 | 8.44 | 14.05 | 24.15 |
| Scope discovery locations | 80 | 12.16 | 25.32 | 36.71 |

This is one disposable Windows fixture baseline; **no production p95, contended load performance, saturation, or CI latency budget** was established.

## PASS versus NOT RUN, and conclusion bounds

| Claim | Evidence classification |
| --- | --- |
| #315 28/28; #319 25/25; PostgreSQL 17.11; synthetic runtime non-superuser; transient cleanup | **PASS, logged**. |
| Physical list stale after canonical SQL grant revoke and real Company Admin Staff Management HTTP revoke; RR Physical overview stale; legacy configuration GET stale | **CONFIRMED repro**. The tests pass precisely because the stale response is present. |
| Location deactivate reader-first/revoker-first with real CA HTTP and observed PostgreSQL lock waits for Dashboard overview | **PASS for both tested orders**; **not** a universal lock proof. |
| All seven Physical GET routes fresh after grant removal; session/MFA/role/cross-scope and pre-request negative cases | **PASS for explicit matrix**; only one Physical path and overview had in-flight grant races. |
| In-flight grant/role downgrade on every one of the seven Physical routes; Physical vs real Location deactivate; 2-reader Physical; deadlock/lock_timeout under mixed Physical traffic | **NOT RUN**. No conclusion on timing of those combinations. |
| Concurrent discovery Location grant/role revoke between session check and SELECT; concurrent Configuration/branding/subscription beyond the one reproduced configuration scenario | **NOT RUN**. Sequential discovery filtering passed; race remains unverified. |
| Session refresh/rotation/replay or controlled global User disable while read in flight; MFA factor retirement during a read; other exact-session-sensitive reads | **NOT RUN**. Logout before/after resolver only, with the stated DEC-023 boundary. |
| Photo metadata/bytes and object-store delivery, exports (including report POST render/finalize), audit investigation, contacts, guest information, Shift Presence, all 85 scoped GET routes, HEAD aliases | **NOT RUN in this #319 PostgreSQL execution**. Existing source/test references in authorization-path-inventory.md are not new executed results. |
| Arbitrary privileged owner/DBA direct SQL, production/shared database, tenant entitlement/Organization-status lifecycle writer outside the known application contract | **OUTSIDE this proof**. Cooperative advisory locks do not constrain SQL that ignores the advisory; see authorization-writers.md:15,21,44-46. |

**Interpretation:** The #315 canonical Dashboard overview mechanism successfully serialized the observed real Location deactivation, while the independently authorized Physical Resource LM helper omitted that held fence and yielded confirmed stale protected responses after a grant revoke committed; the RR overview can even authorize from an earlier snapshot. The legacy Configuration read is an additional confirmed surface and should be tracked explicitly rather than assumed to be covered by a seven-route Physical fix. No P0/P1 exploit severity or arbitrary cross-tenant disclosure is established by this artifact; finding ownership/severity decisions belong in the final Issue #319 audit report.

Source navigation: [authorization-path-inventory.md](authorization-path-inventory.md) inventories all registered scoped GET routes; [authorization-writers.md](authorization-writers.md) enumerates canonical writers, lock order and threat-model boundaries. This artifact contains **only evidence and conclusions** and made no product/DB/test/git modifications.
