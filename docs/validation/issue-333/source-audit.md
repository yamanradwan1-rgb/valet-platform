# Issue #333 — authorization reader/writer source audit

Baseline: `c638a437749cae1f78a8c8a417fd4d53e6a34920` (`origin/main`, 2026-10-31). Audit scope is security verification only. The historical #319 inventory identifies 40 Dashboard, 45 Management and four adjacent operational GET routes; **89 inspected route patterns does not mean 89 race-tested endpoints**. This is a current-source candidate inventory, not a security certification.

## Binding contract

| State | Requirement | Authority |
| --- | --- | --- |
| LOCKED | Staff bearer tokens resolve an active PostgreSQL-backed session and current User; no tenant, role or Location authority is taken from the token. | DEC-023 in `docs/08_DECISIONS_LOG.md`; `docs/06_SECURITY_AND_DATA_RULES.md` |
| LOCKED | A normal logout/revocation blocks a subsequent session resolution. Existing #319 tests explicitly allow some already-resolved requests to finish. | DEC-023; `apps/api/test/dashboard-issue319-http.integration.test.ts` |
| LOCKED | Company Admin Management authority requires active User, active Organization, active ORG_ADMIN membership, exact target ownership, applicable capability and session-bound MFA. | Accepted DEC-078 and DEC-080 |
| LOCKED | Staff role, membership status and Location grant writers use the supported management command, fresh sensitive MFA, optimistic version, tenant audit and serializing organization authorization locks. | Accepted DEC-081; `apps/api/src/modules/management/staff-management-mutation.service.ts` |
| LOCKED | Live Operations Map exposes active task positions only to an eligible granted Location Manager, eligible on-Shift granted Supervisor, or a properly assured Company Admin. | Accepted DEC-049 and DEC-080 |
| LOCKED | Visit Contacts are scoped and role-minimized, including Location Manager's complete granted Location set and private contact projection. | Accepted DEC-084 |
| LOCKED | Inactive Locations can remain visible for authorized history. Inactivity alone does not prove a private historical-read defect. | Accepted DEC-094 |
| DERIVED | A session resolved before a transaction is not, on its own, a lock held through response serialization. Each reader needs its own explicit authorization analysis. | Controller/service ordering in this table |
| UNRESOLVED | Whether ordinary grant revocation must cancel a previously authorized in-flight read after revocation commits is not resolved by the session-lifetime rule alone. | DEC-023 versus DEC-081; deterministic timing evidence required before policy conclusion |

No new authorization rule is introduced by this document. For any material conflict between an Accepted focused DEC and the canonical decisions log, stop instead of selecting a convenient interpretation.

## P1 current-reader inventory

| Priority | Actual HTTP reader and authorization chain | Transaction and snapshot | Protected projection and invalidating writers | Evidence boundary |
| --- | --- | --- | --- | --- |
| P1-A | `GET /v1/staff/locations/:locationId/live-operations-map` → `tracking/live-map.controller.ts:37` → `LiveMapService.execute` → `createLiveMapQuery` → `authorizeLiveMapRead`. Controller resolves bearer session first. Operational branch tests persisted User, membership, role, exact grant and Supervisor active Shift; CA branch checks management capability, commercial access and session MFA. | `tracking/live-map-query.ts:117-198` uses one PostgreSQL `REPEATABLE READ` transaction. Authorization query in `live-map-authorization.ts:14-47` uses plain joins without an explicit staff-org advisory/grant-row fence. Subsequent vehicle/GPS SELECT shares the RR snapshot. | Tracking session, task, ValetSession, vehicle identity and live GPS coordinates. Canonical management grant revoke, role/status mutation, session revoke, Location deactivation, Shift end. | Reader-first RR snapshot may outlive the grant writer's commit; source inspection alone does not prove prohibited disclosure. |
| P1-B | `GET /v1/staff/dashboard/organizations` and `GET /v1/staff/dashboard/organizations/:organizationId/locations` → `dashboard-scope-discovery.controller.ts:60,79` → `dashboard-scope-discovery.service.ts:31-157`. | Explicit exact-session lock/recheck; `READ COMMITTED` membership and LocationAccess SELECT with no staff-org shared advisory lock. | Accessible Organization list and granted Location list; management membership activate/deactivate, role downgrade, grant/revoke, Location and Organization lifecycle, session revoke. | A committed grant change may interleave between session recheck and scope projection. Multi-Organization users must be tested, not assumed away. |
| P1-C | `GET /v1/staff/management/organizations/:organizationId/visit-contacts`, `GET .../visit-contacts/:customerId/visits`, `GET .../visit-vehicles/:vehicleId/visits` → `management-visit-contact.controller.ts:50,73,86` → service → `management-visit-contact-authorization.ts:30-158`. | `READ COMMITTED` authorization obtains aggregate LM granted Location IDs with no retained staff-org grant fence; later contact/visit projection uses captured scope. CA requires management/session MFA. | Synthetic private contact sentinel, visit and vehicle history. Canonical management grant revoke/role downgrade and session revocation; inactive Location remains historical by contract. | A 200 response is insufficient evidence: check sentinel's presence/absence and exact tenant/Location inclusion. |

## Canonical invalidating writers

| Writer family | Supported application operation and authority | Commit/lock considerations |
| --- | --- | --- |
| Staff grants | Authenticated, freshly MFA-assured Company Admin Management `POST /v1/staff/management/organizations/:organizationId/staff/:membershipId/location-access/revoke`; companion grants use the same Staff Management boundary. | Staff-management organization exclusive advisory, current actor/target checks, `expectedVersion`, persisted grant rows and audit in one transaction. See `management/staff-location-access.controller.ts`, `staff-management-mutation.service.ts` and repository. Direct privileged SQL is not a replacement for this writer in a race proof. |
| Staff role/status | Authenticated Staff Management role-change/deactivate commands with current actor and target checks. | Same shared staff-management organization serialization domain, optimistic target version and audit. |
| Location lifecycle | Approved Management Location lifecycle mutation with sensitive MFA and safe-drain preconditions. | Lifecycle exclusive advisory is acquired before staff-management organization lock; active location and historical views have distinct contracts. |
| Auth session | Native logout, refresh rotation/replay, staff User security disable. | Auth session/User row locks and persisted revocation. DEC-023 speaks to subsequent resolution, with a separately tested in-flight caveat. |
| Supervisor Shift | Authorized task/Shift operation that ends Shift eligibility. | Live Map Supervisor authority requires a current active Shift at exact granted Location; a direct fixture UPDATE is not a canonical concurrency proof. |

## Priority 2 coverage and risk selection

This is a grouping by actual reader/writer dependency, not an 85 × N assertion matrix.

| Reader family | Existing protection or established test family | Distinct residual question / representative candidate |
| --- | --- | --- |
| Staff Directory, grants, Shift history | Staff Management current actor/target checks, sensitive MFA on mutations, current LM subordinate scope; #319 tracked integration tests. | Whether an LM staff-directory projection can retain a stale aggregate grant set through a supported CA revoke. |
| Audit, Investigations, Presence | Specialized exact-session, scope and lifecycle locks; historical #319 catalog lists independent stronger guards. | Cross-Location and historical-audit projection semantics require route-specific evidence; not inferred from inventory counts. |
| Guest Information, capability probes | Service-specific branch for LM/CA/Supervisor, commercial and exact scope checks. | Probes must not be misread as proof that the subsequent protected feature read is authorized; test representative GET and its writer. |
| Reports/exports and company analytics | Dashboard reports compose multiple transactions with final reauthorization; Company Admin analytics/reports use a separately protected RR snapshot and retry handling. | Report export response handoff, final revalidation after revocation, error concealment and rollback; preserve accepted #315/#319 tests. |
| Configuration, Branding, Subscription, physical resources | Specific #319 remediated shared advisory fences and focused regression tests. | Re-run actual #319 regressions; do not reopen eight accepted defects without contradictory new evidence. |
| Operational vehicle directory, session details, route history, GPS | Scope and physical-session checks differ by route; Live history is a separate stronger authorization path than Live Operations. | Test precise GPS/route private data under Location grant and Shift change; avoid assuming LIVE-history coverage applies to Live Map. |
| Logout, refresh, rotation/replay, MFA | DEC-023 exact session state; DEC-078/080 MFA session binding. | Distinguish new-request refusal from already-resolved in-flight read; do not assert cancellation absent an accepted policy. |

## Verification rule

Reader-first and revoker-first scenarios must use real authenticated HTTP, task-owned PostgreSQL, a supported writer, bounded deterministic barriers, and sanitized transaction/snapshot evidence. A candidate is **CONFIRMED VULNERABILITY** only when a reproducible prohibited disclosure/effect violates an exact Accepted contract; **VERIFIED SAFE IN TESTED CONTRACT** only for the exact exercised schedule and negatives; otherwise **UNVERIFIED**. No finding may be upgraded because a simulated Promise race, source-only lock hypothesis, or ordinary green test did not fail.
