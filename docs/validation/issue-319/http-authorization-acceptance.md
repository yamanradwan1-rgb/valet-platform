# Issue #319 — real HTTP authorization acceptance

Baseline: 20998a069eb5d576895c0e6c149271a4a0e4028b. All requests here use the actual Nest controller/service stack on a loopback ephemeral listener from apps/api/test/staff-auth-native-fixture.ts:131-134,187-213, with real PostgreSQL 17.11. Synthetic records only. Source: apps/api/test/dashboard-issue319-*.integration.test.ts; exact retained timestamps and statuses: logs/audit-tests.txt. No production traffic.

## Decisive in-flight disclosure evidence

| Case | Controlled order observed (performance.now() ms within test worker) | HTTP result | Classification |
|---|---|---|---|
| Physical KeySlots; canonical SECURITY DEFINER grant writer | AUTH complete 24948.906 → revoke SQL completes 25181.713 → revoke commits 25181.840 → projection resumes 25181.847 → reader response 25189.389 | Original LM GET 200 with synthetic keySlotId, fresh GET 404 | Confirmed F319-01 |
| Physical KeySlots; **real Company Admin MFA Staff Management revoke HTTP** | LM auth complete 25880.224 → admin POST starts 25880.239 → POST 201 completes 26079.863 → LM projection resumes 26080.012 → LM response 26083.203 | Old LM GET 200 with synthetic keySlotId, fresh GET 404 | Confirmed F319-01, canonical app writer |
| Physical overview under REPEATABLE READ | RR transaction snapshot/CA hint 26432.215 → canonical revocation commits 26753.867 → LM auth/projection starts 26753.879 → HTTP ends 26784.620 | Old LM GET 200 with synthetic keySlotId, fresh GET 404 | Confirmed F319-01 RR variant |
| Legacy Dashboard Configuration GET | LM bare auth complete 27119.332 → canonical revoke committed 27375.114 → configuration projection resumes 27375.120 | Original GET 200 with organizationId, locationId and 10 settings, fresh GET 404 | Confirmed F319-02 family |

All four are deterministic controlled barriers using vitest spy wrappers around real application functions, rather than sleeps as scheduling proof. The data query is allowed to finish only after the revocation operation has completed. The real Staff Management writer uses POST /v1/staff/management/organizations/:organizationId/staff/:membershipId/location-access/revoke with an MFA-assured Company Admin; it returns 201 before the waiting LM request returns 200. The canonical SQL writer test uses staff_management_set_location_access(..., false) under the runtime database role and is separately labeled.

## HTTP negative / positive acceptance

| HTTP case | Actual observed result | Proof classification |
|---|---|---|
| Authorized LM Physical KeySlots | 200 and exact synthetic slot | Real HTTP PASS |
| Same LM new read after grant revoke | 404, no items | Real HTTP PASS for fresh reads |
| All seven Physical Resources GET variants authorized then revoked | 200 before removal, 404 after | Real HTTP PASS for sequential checks; in-flight only KeySlots and RR overview |
| CA with accepted standard MFA | 200 for authorized org Location | Real HTTP PASS |
| CA password only (no standard MFA) | 403, no items | Real HTTP PASS |
| Employee and Supervisor against LM/CA Physical endpoint | 404 | Real HTTP PASS |
| Foreign Organization, same-org ungranted Location, forged unknown UUID | 404, no items | Real HTTP PASS |
| Inactive LM membership, Organization, or Location before call | 404, no items | Real HTTP PASS |
| Disabled Staff user, expired Staff access session | 401, no items | Real HTTP PASS |
| HTTP logout committed before a new overview, physical or discovery GET | 401 each | Real HTTP PASS |
| Logout after resolver has completed, before protected transaction | 200 overview; 200 physical; 401 discovery | Real HTTP characterization; cannot alone classify as defect under DEC-023 |
| Scope discovery GET after grant removal | 200 with empty items array | Real HTTP PASS for fresh discovery |
| Managed Location deactivation reader-first | LM read 200 precedes CA POST 201, then fresh read 404 | Real HTTP + real PG lock PASS |
| Managed Location deactivation revoker-first | CA POST 201, subsequent in-flight LM read 404 | Real HTTP + real PG lock PASS |

## Actual scope and limits

Vitest execution: PowerShell -NoProfile -ExecutionPolicy Bypass -File docs/validation/issue-319/run-lab.ps1 -Suite audit. Final full command: 4 files, 25 passing tests, 0 failing, 0 skipped, PostgreSQL 17.11 isolated private cluster; cleanup confirms database/connection count 0 and owned cluster removed. Earlier #315 historical baseline: 28 passing tests. Timestamps are monotonic process times within each test worker; do not cross-compare absolute values across workers.

Not established: in-flight races for every one of the 85 inventoried GET patterns; MFA assurance removal mid-request; session rotation mid-request; two simultaneous live readers plus revoker under all paths; precise HTTP payload bytes across tenant existence probes; canceled connection/pool teardown under failure; real network-edge proxies and response delivery outside the loopback server. Session logout during an already resolved request is observed but DEC-023 only promises denial of newly resolved credentials; whether stronger cancellation is required remains a policy boundary. These are NOT RUN or UNVERIFIED, not PASS.

Protection of a response already authorized and delivered before a revocation linearization point is not retroactive; the confirmed F319-01/F319-02 traces specifically show protected projection continuing **after** the app revocation completed. No raw DBA SQL coordination is assumed.
