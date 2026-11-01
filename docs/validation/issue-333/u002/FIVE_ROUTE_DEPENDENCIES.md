# U-002 five-route source and downstream dependency matrix

Evidence baseline: audit `d8c342d5305fd688261312a7c777553ad3c1b4ac`.
Classification of **current behavior**: F333-A/B/C1/C2/C3 all
**CONFIRMED VULNERABILITY** under DEC-108 in previously demonstrated
canonical real-PostgreSQL schedules; no new runtime fix is present.
Proposed mechanisms below remain **UNVERIFIED** until implemented/tested.

| Finding / actual HTTP GET | Controller + authorizer | Protected query / transaction | Canonical invalidator / current lock | Proposed delivery boundary and needed regressions |
| --- | --- | --- | --- | --- |
| F333-A `/v1/staff/locations/:locationId/live-operations-map` | `tracking/live-map.controller.ts:28-68`; StaffSessionContext, `live-map-read-authorization.ts`, `live-map-authorization.ts`; LM exact grant, Supervisor grant+Shift, CA approved MFA/capability | `tracking/live-map-query.ts:108-199`: `REPEATABLE READ` authorizer then tracker/GPS/vehicle, commits before controller returns | CA MFA `POST /v1/staff/management/organizations/:organizationId/staff/:membershipId/location-access/revoke`; staff-management-org EXCLUSIVE xact | LM/Supervisor **only**: role preflight, session SHARED before RR snapshot, role recheck, one backend through `finish`. CA fallback bypasses SHARED to preserve its EXCLUSIVE xact; test two CA/CA+LM readers, role/Shift/MFA, lock loss |
| F333-B `/v1/staff/dashboard/organizations/:organizationId/locations` | `dashboard/dashboard-scope-discovery.controller.ts:79-100`; exact Staff session, LM membership | `dashboard/dashboard-scope-discovery.service.ts:77-157`: `READ COMMITTED`, grant/location join, paginated scope `items` | Same canonical CA MFA revoke and org EXCLUSIVE lock | Session SHARED before fresh membership/grant query; omit revoked Location and retain other grants, rebuild cursor. Original RED, stale CAS rollback PASS, multi-org, inactive-location, 2-reader and auth negatives |
| F333-C1 `/v1/staff/management/organizations/:organizationId/visit-contacts` | `management/management-visit-contact.controller.ts:50-71`; `management-visit-contact-authorization.ts:30-141` LM aggregate grants or CA standard assurance/capability | `management-visit-contact.service.ts:91-102,152-188`, `management-visit-contact-search-query.ts`: `READ COMMITTED`, people/vehicle/contact projections and aggregates | Same canonical revoke and org EXCLUSIVE lock | LM-only SHARED through fresh grant array, search/cursor+HTTP `finish`; CA bypasses SHARED, retains EXCLUSIVE xact. Requery all aggregates or whole-response deny, private sentinel/slow/abort |
| F333-C2 `/v1/staff/management/organizations/:organizationId/visit-contacts/:customerId/visits` | Same controller `:73-84,151-176`; same authorizer; object id validated | `management-visit-contact.service.ts:104-134`, `management-visit-contact-history-query.ts`: `READ COMMITTED`, paginated sessions, location, phone, plates | Same canonical revoke | LM-only SHARED through query and `finish`; CA bypasses SHARED. Check customer/organization ownership, revoked vs retained visits, pagination |
| F333-C3 `/v1/staff/management/organizations/:organizationId/visit-vehicles/:vehicleId/visits` | Same controller `:86-97,151-176`; same authorizer; vehicle id validated | `management-visit-contact.service.ts:104-134`, same history query, vehicle-filtered visit rows | Same canonical revoke | LM-only SHARED through query and `finish`; CA bypasses SHARED. Prove no foreign or ungranted visits/phone/plate sentinel, slow reader and disconnect |

**Actual writer:** `POST /v1/staff/management/organizations/:organizationId/staff/:membershipId/location-access/revoke`.

**Actual writer call graph** for all five:
`staff-management.controller.ts:180-199` (auth header, route, input)
→ `StaffManagementMutationService.locationAccess`
(`staff-management-mutation.service.ts:136-184`)
→ `authorizeStaffManagement` (`staff-management-authorization.ts:70-139`
or Company Admin `management-authorization.ts:95-133`)
→ `authorizeStaffTarget` and persisted blockers/CAS
→ `setStaffLocationAccess` (delete membership grant, bump version)
→ `appendStaffManagementAudit`
→ `inPostgresTransaction` COMMIT. Writer takes
`pg_advisory_xact_lock(hashtextextended('staff-management-org:' || organizationId,0))`
before mutation; scope, 5-minute sensitive MFA and audit stay unchanged.
Original canonical-writer success is **HTTP 201 plus persisted grant count 0**;
HTTP 201 alone is not proof of persistence. Stale CAS is rejected/rolled back.

**Protected response boundaries:** `ApiOperationRunner` awaits handlers;
Nest Express subsequently performs JSON response writing. The current
`@Res({passthrough:true})` headers in Dashboard/Management do **not**
control response `finish`. Live Map currently has no explicit response
parameter. The proposal requires explicit transport ownership and a
fail-closed terminal lifecycle on each of these five paths, without public
contract changes or Dashboard/Policies Studio changes.

**Objects and affected entities:** User; StaffAuthSession and MFA assurance;
OrganizationMembership; Organization; Location;
`membership_location_access`; Shift (Supervisor only);
tracking positions/Tasks/ValetSession/Vehicle (Live Map);
Customer/Vehicle/visit history (contacts); Membership version and tenant
AuditEvent in writer. **No ValetSession or Task/Dispatch state transition**
is requested. No schema/index/configuration override change: the existing
organization advisory key and persisted grants are used as written.

**Scope semantics:** Company Admin's MFA-assured organization read does not
depend on one Location grant; LM exact membership+Organization grants and
Supervisor Shift must be checked at the protected reader, not inferred
from caller role. Inactive Locations keep separately authorized eligible
history under DEC-094. An LM with grants A+B who loses A may still view
correctly recomputed B; search result counts and cursor cannot carry A
metadata. Two users and two independent memberships must support IDOR proofs.

**Related callers/consumers, assess before implementation:**

- `dashboard-scope-discovery.service.ts:listOrganizations` uses the same
  service but has **different per-Organization scope** and is not one of the
  five confirmed RED HTTP paths. A shared refactor must not silently change it.
- `management-visit-contact.service.ts:correctName/correctPhone` are CA
  **write** operations with sensitive MFA; preserve correction/tenant audit
  and CAS, do not funnel them through a read-response fence.
- `management-visit-contact-search-query.ts`,
  `management-visit-contact-history-query.ts`, pagination cursor builders
  and `management-visit-contact-policy.ts` carry sensitive aggregates and
  disclosure rules; revalidation must preserve their current filters.
- `analytics-kpi-snapshot-transaction.ts`,
  `physical-resource-overview-transaction.ts`,
  `dashboard-read-authorization.ts`, `live-history-read-authorization.ts`
  reuse related advisory domains but today release before HTTP delivery.
  They are **not** proven DEC-108-safe by this five-path proposal.
- `session-photo-controller.ts` / `session-photo-delivery-fence.ts`
  own a distinct image-byte response and its own delivery protocol;
  do not implicitly convert the existing photo lock design.
- Staff Management role/status/grant writers, controlled security-disable,
  session logout/refresh, MFA and organization/location lifecycle writers
  are potentially invalidating **different** authorization dimensions.
  This task does not assert they all take the same lock or automatically
  acquire the DEC-108 grant-revocation in-flight policy.

## Evidence pointers

- `../p1a-live-map-evidence.md`: reader snapshot, canonical revoke,
  persisted deletion, private Live Map marker delivered after commit.
- `../w4-visit-contacts/reproduction.md`: three distinct protected
  Management routes, five real PostgreSQL runs and fresh-read negatives.
- `apps/api/test/dashboard-issue333-scope-races.integration.test.ts`
  from repository root: F333-B post-SQL/pre-HTTP strict RED.
- `apps/api/test/dashboard-issue333-scope-rollback.integration.test.ts`:
  stale-CAS rollback still authorizes retained grant (separate PASS).
- `../U001_OWNER_CONTRACT_AND_REMEDIATION.md`: Owner decision and
  classified evidence. These are **historical results**; this design review
  has not rerun them or cured their RED outcomes.
