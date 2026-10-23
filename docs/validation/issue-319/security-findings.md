# Issue #319 — security finding triage and remediation handoff

Baseline and tested application source: 20998a069eb5d576895c0e6c149271a4a0e4028b. Isolated QA only. Independent read-only security reviewer W4 signed on 2026-10-23: **P0 0 / P1 0 / P2 2 confirmed; NO-GO for Issue closure**. No physical cross-tenant BOLA and no MFA bypass were confirmed within tested routes; coverage gaps are not negative proofs.

## F319-01 — P2: Physical Resources Location Manager read can project after grant revocation

- Affected routes: GET /v1/staff/dashboard/locations/:locationId/physical-resources/{key-slots,overview} proven concurrently. The other five Physical GET routes invoke the same authorization helper and are candidates for the same flaw; only sequential current-grant allow/deny has been executed per route.
- Source: apps/api/src/modules/dashboard/physical-resource-authorization.ts:19-54 LM branch calls dashboard-location-authorization.ts:13-54 without the D315 shared staff-management Organization advisory or a post-fence grant recheck. apps/api/src/modules/dashboard/physical-resource-read.service.ts:29-165 performs subsequent protected projection; its overview begins REPEATABLE READ before LM eligibility check at :34-49. Contrast dashboard/dashboard-read-authorization.ts:41-86 and analytics-kpi-snapshot-transaction.ts:37-154.
- Attacker prerequisites: formerly authorized active Location Manager with a legitimate valid Staff access credential and Location grant; an authorized Company Admin removes that grant concurrently. No unassigned foreign-tenant identity was shown to exploit this.
- Deterministic reproduction: pause the real KeySlot GET after LM helper returns; POST actual CA MFA-authenticated Staff Management /location-access/revoke, observe HTTP 201; resume reader; observe LM GET 200 with exact synthetic keySlotId. Fresh request with same credential returns 404. Controlled RR variant: pause after RR snapshot begins, revoke, resume LM authorization and query; 200 old data, 404 fresh. Raw traces and source: docs/validation/issue-319/http-authorization-acceptance.md, logs/audit-tests.txt and apps/api/test/dashboard-issue319-http.integration.test.ts.
- Actual/expected: protected same-Location key-slot record is returned after canonical grant revocation has committed. For a read not yet authorized/linearized under a held accepted fence at revocation time, expected fail-closed or writer blocking until reader releases a valid prior fence. A response already delivered before revocation cannot be retroactively withdrawn.
- Impact: a just-revoked manager can receive Resource/KeySlot/parking operational data despite completed administrative revoke. This is a post-commit stale scope disclosure; no new request bypass is shown. P2 is appropriate given precise concurrency prerequisite and formerly legitimate permission.
- Narrow proposed fix (NOT IMPLEMENTED): reuse #315's scoped staff-management Organization SHARED advisory with fresh exact grant/member/Organization/Location recheck in the same read transaction before protected SELECT. For RR overview, acquire a safely released session-scoped shared advisory **before RR BEGIN**, then reauthorize from new snapshot as KPI path does. Preserve CA existing MFA and lock order; never promote arbitrary shared read lock to exclusive or weaken grants/privileges. Cover both writer-first and reader-first CA HTTP interleavings, five other GETs, cancellation/rollback, multi-reader and timeout.

## F319-02 — P2: Legacy Dashboard Configuration read lacks #315 revocation fence

- Confirmed endpoint: GET /v1/staff/dashboard/locations/:locationId/configuration.
- Source: apps/api/src/modules/dashboard/dashboard-configuration-command.ts:54-85,94-104 invokes bare dashboard-location-authorization.ts:13-54, then separately reads Configuration projection in the same RC transaction, without the matching shared advisory/recheck against canonical grant removal.
- Preconditions: formerly authorized LM, canonical concurrent grant removal, request paused after its positive authorization. Reproduce in apps/api/test/dashboard-issue319-http.integration.test.ts:121-150 by pausing the helper, committing staff_management_set_location_access(...false) via isolated runtime-role canonical writer, then resuming the real HTTP GET. Old GET returns 200 with organizationId, locationId and all ten settings; fresh GET returns 404. The protected projection follows revoke commit.
- Impact: Location configuration/settings remain readable to an already-started LM request after permission removal. Confirmed single endpoint, not cross-tenant BOLA. P2 given narrow in-flight scope.
- Separate fix required (NOT IMPLEMENTED): adapt the Configuration read's LM path to D315 grant coordination and fresh authorization in the same protected projection transaction, preserving response shape. Review branding-command.ts:23-35,99-110 and subscription-read.ts:17-68 because they call the same bare helper, but treat them as **unverified candidates**, not confirmed exploits. Test with a nonpublic saved setting sentinel and both orders of real CA HTTP revoke.

## Findings requiring investigation, not confirmed vulnerabilities

| Boundary | Current evidence | Classification |
|---|---|---|
| Scope discovery GET after grant removal | Fresh GET 200 with empty list; exact Staff session locked/rechecked. No grant advisory in listLocations. | Unverified concurrent projection; not confirmed data leak |
| Logout immediately before fresh request | Overview/Physical/Discovery all 401. | Correct tested behavior |
| Logout after old request resolved bearer | Physical and Overview 200; Discovery 401. DEC-023 promises rejection on new resolver; already-resolved cancellation requirement not established. | Threat-contract question, not separately confirmed defect |
| CA MFA state change mid-read | CA with standard MFA 200, password-only 403. No mid-request MFA assurance revocation test. | Missing test evidence |
| Location deactivation with D315 reader | Reader-first/read locks, revoker-first/deny observed through real CA HTTP; exact wait graph and all routes not shown. | Correct in selected supported contract; other paths unverified |
| Other Management and Guest Information read families | 85 GET routes are source inventoried, not 85 race tested. | Unverified runtime boundaries; no speculative vulnerability |
| Direct privileged DBA SQL, arbitrary external writers | Not coordinated with application advisory locks by definition. | Explicit threat-model exclusion |
| Cross-Organization or same-Org ungranted Location for tested Physical requests | 404 without record items. | Correct tested behavior |

## Owner approval and acceptance gate

**HOLD #319; request a separate Owner GO** for production authorization remediation for F319-01 and F319-02. No source patch, migration, runtime SQL privilege expansion, UI change, merge or deploy is included in this audit branch. Required regression proof: actual canonical CA HTTP writer with bidirectional barriers for both affected families, RR pre-snapshot correctness, same-org/foreign-tenant/MFA/session and stale settings negative tests, query lock PID graph, two readers/revoker, cancellation/timeout/pool cleanup and uncontended vs contended performance. Independent reviewer must inspect any eventual production patch and rule again before closure.

Scoping note: 'NO CONFIRMED NEW P0/P1 WITHIN THE VERIFIED #319 SCOPE' is supported by reviewed exercised cases; it is not a universal guarantee across all 85 routes or noncooperative SQL writers.
