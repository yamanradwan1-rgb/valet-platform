# Issue #276 — Issues272–278/U-003 historical identity security decision

**Status: DRAFT — NOT ACCEPTED.** Prepared 2026-10-09 against `698bcb6044f72844008ffa49ef085f11471f53e1`. This text is a **proposal**, not a new Accepted DEC or permission to expand Live Operations API identity fields.

## Decision required and existing authority

Issue #276 concerns *three different operational facts*: `Checked In By` from the original ValetSession, `Parked By` from a successfully completed Parking Task, and `Current Assigned To` from an active Task. The only new identity disclosure sought is historical check-in/parking, **not** task assignment, directory access, or Management Audit enrichment.

Existing binding precedents do not decide the new surface:

- Accepted DEC-080 requires present Company Admin role, Organization, target Location, commercial entitlement, and applicable MFA; operational field mutation remains distinct from management reads.
- Accepted DEC-081, T05-E (lines 173–205) authorizes current canonical identity/name and email *specifically for bounded Management Shift history*. It allows authorized historic target identity despite target inactivity/old grants, but its permission cannot be automatically copied to Live Operations.
- Accepted DEC-079 and DEC-082 require purpose-limited, scoped, privacy-minimum Management Audit projections. They do **not** authorize a #277 identity expansion as a side-effect of this issue.
- Accepted DEC-088 requires current server-side Dashboard entitlement. Its loss must not change physical custody.
- `docs/plans/issues-272-278/OWNER_DECISIONS.md`, U-003 direction (Owner approved in principle) still requires formal security/DTO amendment; U-004 requires actual per-issue pixel/copy approval.

## Proposed Option A (recommended) — minimal historical names

Proposed minimal shape for an authorized sessions response is two nullable names-only keys, **after** formal amendment and coordinated client rollout. **Important shared-API boundary:** `SessionOverviewEntry` is also consumed by the Vehicles screen through the same sessions read. An API extension would therefore return historical names to **both** authorized consumers, even if only Live Operations renders them. The Owner must explicitly approve that actual API audience or authorize a distinct scoped read/DTO. Do not claim Live-Operations-only disclosure by merely hiding fields in the Vehicles UI:

```ts
type HistoricalStaffName = {
  firstName: string; // validated nonempty canonical membership component
  lastName: string;  // validated nonempty canonical membership component
}; // strict: NO email, membershipId, userId, role, grants or timestamps

interface SessionOverviewHistoryExtension {
  checkedInBy: HistoricalStaffName | null;
  parkedBy: HistoricalStaffName | null;
}
```

Names are from the authoritative **current OrganizationMembership record at read time**, never claimed as the name at the historic event time. Both components must exist and be safe before emitting a name. Do not derive names from `email`, UUID, audit metadata, Task notes or user account. A null is *unprojectable identity*, **not** proof that no completed Parking history exists.

**Open DTO/provenance decision:** the two nullable historical-name keys alone cannot tell whether `parkedBy:null` means no verified completed Parking Task or a verified completion with an unprojectable historic actor. Do not emit `Parked by: Unknown` as an established history fact solely from null. Before differentiated drawer facts ship, accept a minimal, separately verified completed-Parking-provenance flag (or another purpose-scoped reviewed evidence shape), with no extra PII and exact Org/Location/session checks; otherwise render a generic non-assertive Unknown without distinguishing the causes. Such a field is **not** part of Option A's currently proposed minimal names-only DTO and is not authorized merely by this draft.

**Proposed default: suppress historical email entirely.** Current `OperationalAssignee` retains its already-accepted email behavior for active assignments; do not reuse `staffManagementDisplayName` historical email fallback or globally alter `OperationalStaff`. No new generic history lookup endpoint, employee-directory fetch or new history snapshot/backfill is proposed.

### Option B — reuse current OperationalAssignee

Reusing `OperationalAssignee` yields convenient existing strict parsing and formatting, but exposes `membershipId` and linked account `email` that the historical cell/drawer does not need; its active-assignee subject-current-grant predicate would suppress authorized inactive history. Option B requires **separate explicit purpose-, role-, Organization-, Location- and UI-field approvals for email/ID disclosure** and dedicated historical join logic. Recommended decision: reject B for #276 and keep the two minimal names-only attributes.

## Viewer authorization: *current request*, not historic subject

The existing `authorizeDashboardReadLocation` must succeed *before* querying identities, in the same authorized Location-scoped server read:

1. Current authenticated active User and the **exact current Staff session** on historical-name reads, not a stale client token's claimed role. Its lock/revalidation must run inside the very transaction that reads the history, for **both** Company Admin and Location Manager.
2. Current active Organization; active Company Admin or Location Manager membership with exact established capability `LOCATION_DASHBOARD_READ`.
3. Current requested active Location owned by that Organization. Location Manager requires its own **present** exact `membership_location_access` grant. Company Admin uses the existing persisted authority/MFA assurance boundary, not hypothetical LM grants.
4. Current `DASHBOARD_ACCESS` commercial entitlement and applicable MFA/session checks. Never add field-operation permissions merely for this read.
5. A revoked viewer account/session/role/Location grant or disabled Location denies the requested page; never supply a previously cached identity after a later denial.

Source authorization functions are `apps/api/src/modules/dashboard/dashboard-read-authorization.ts` and `dashboard-location-authorization.ts`. The existing filter and cryptographically bound Organization/Location cursor must remain unchanged. A passed request's Location ID alone is not authority.

**Concrete existing authorization gap for future history:** `dashboard-read-authorization.ts:41-49` currently returns the Location Manager `LOCATION_DASHBOARD_READ` scope without `lockAndRecheckStaffSessionContext` in the data-read transaction. The controller authenticates earlier, outside that later transaction. A concurrent Staff session revoke between those steps could let the new name projection proceed under a stale session. Company Admin already uses a stronger in-transaction context boundary. **Before new historical names are added**, require/verify the exact Staff session context, current token/session generation and an in-transaction lock/recheck for **both** roles, with real concurrent-revocation, session substitution and old-scope negative tests. Determine lock order and compatibility with existing Location Manager reads; **no new routine LM history MFA requirement** is proposed, while existing CA MFA remains binding. Do not silently assert this condition is already implemented. A previously loaded page/directory is never sufficient.

## Historical subject lifecycle (proposed amendment)

Subject **is not the viewer**. Given a current authorized viewer reading the exact historical fact:

- A disabled historical membership, old Shift, changed base role, revoked historical subject Location grant or now-inactive linked User **does not automatically erase** the fact established at the event.
- Resolve only the historical `OrganizationMembership` referred to by the canonical session/check-in or the same-Organization, same-Location completed Parking Task. Membership must belong to that Organization; never globally join a `User` on client-supplied ID.
- If identity record is missing, deleted, cross-tenant, invalid, incomplete or unprojectable, return `null` and localized `Unknown`. Do not show partial names or fallback email.
- Reading names does not renew membership permission, grant active Shift, reassign a Task, change custody or reveal other Location sessions.
- Historic names are **not event-time snapshots**; a later canonical name change legitimately updates the history projection.

## Fact-specific provenance and integrity

| Fact | Exact source | Scope / anti-confusion |
|---|---|---|
| Checked In By | `valet_sessions.checked_in_by_membership_id` | Scope through authorized session Organization + Location; no Parking fallback |
| Parked By | `tasks.current_assignee_membership_id` on one canonical `PARKING / COMPLETED` Task | Must match session ID **and** Organization **and** Location; never canceled/queued or Retrieval |
| Current Assigned To | Existing `activeTask.assignee` | Preserve current filter/authorization; queued unassigned stays unassigned |

**Independent sequencing blocker discovered 2026-10-09:** `Task.updated_at` can be changed after COMPLETED at database runtime (see `ISSUE_276_LIVE_OPERATIONS_STAFF_HISTORY_REPORT.md`). Selecting the “latest completed” by `updated_at DESC` is **not yet canonical**. This U-003 approval must *not* be misconstrued as chronology approval. A separate evidence-backed completion-order contract is needed before a public query is implemented.

**Parker provenance must also be reconciled:** the task's stored `current_assignee_membership_id` is the original Issue #276 source and remains the existing proposed fact; the separate chronology investigation suggests append-only completion-event `actor/newAssignee` may be stronger canonical provenance where task data is mutable. The Owner/security amendment must select and prove **one** authoritative Parker identity and consistency check before the query is built. Neither candidate is declared accepted here.

## Negative threat matrix (test before rollout)

| Threat | Required result |
|---|---|
| Foreign Organization's completed Task or membership | No join/name; no foreign page |
| Same Organization, wrong Location's Task | No historical parker join |
| Revoked LM Location grant / changed CA MFA / expired actor session | Deny page and teardown old names |
| Cross-scope stale response/cache/drawer | Old response fenced by current scope generation; no retained name |
| Historical employee disabled or lost Location grant | Eligible history subject **only if this proposed rule becomes Accepted** |
| Name missing/partial or email-only membership | `null`/Unknown; no email or local-part inference |
| Queued, unassigned Retrieval after completed Parking | Current assignment remains Unassigned; historical Parker stays separate |
| Cancelled Parking or no completed Parking | No invented parker |
| Multiple completed Parking Tasks | One deterministic canonical completion, no row multiplication |
| Management Audit / Guest / Retrieval Queue | No DTO or permission change |

## Bounded query/response requirements after decision acceptance

History is added only inside a specifically approved, authorized, keyset-paginated sessions read; no N+1 or global directory. One historical parking candidate per session using a safe, proven completion ordering source (not currently proven `updated_at`), one row per session, unchanged filters, cursor and 6-column table. Only two new nullable historical attributes; Zod `.strict()` rejects extra email and other protected keys. Coordination must include API mapper, contracts, fixture tests, Dashboard parser and **all** `SessionOverviewEntry` consumers, including Vehicles; old-client/new-API strict-schema rollout and the actual disclosed audience require an explicit plan. No DB migration is approved by this proposal.

Do not add `HistoricalStaffName` to a broad shared service with generic read rights. Do not reinterpret DEC-081 T05-E's email disclosure as blanket authorization.

## Proposed Accepted amendment (future, **not effective now**)

> For Issue #276, only the expressly approved Dashboard session-read API audience may receive canonical read-time first and last names (both present) of the session's original check-in membership and one proven completed-Parking-task membership. Current `LOCATION_DASHBOARD_READ`, exact Organization/Location, commercial, session/MFA and **in-transaction exact-Staff-session revalidation** are required for both CA and LM. Historical subjects may be inactive or no longer hold current Location grants. Return null rather than partial, missing or email-derived names; no historical email, membership/user IDs, directory endpoint, historical snapshot or new authority. If the shared SessionOverview DTO is approved, explicitly include its Vehicles consumer in the allowed API audience; otherwise use a separately approved scoped read. Keep current active Task assignment untouched. This amendment does not authorize Issue #277 Management Audit enrichment.

Acceptance record must identify **Issues272–278/U-003** (not bare U-003), exact Accepted DEC or Owner/security artifact/date, allowed viewer and historical-subject states, null semantics, Option A name-only DTO, active-assignment email unchanged, exact API/UI scope, and all mandatory negative cases. Subsequently obtain per-issue **Issues272–278/U-004** visual sign-off.

## Independent review and Owner sign-off

- **Independent security reviewer:** PENDING / NOT VERIFIED. Do not mark PASS until an independent reviewer checks the actual proposal and later final diff.
- **Question 1:** Accept name-only Option A, including historical subjects now disabled/revoked?
- **Question 2:** Confirm historical email and membership/user ID are suppressed even if names are missing?
- **Question 3:** Approve current read-time identity disclosure (not frozen event-time identity) and `null` fallback?
- **Question 4:** Approve adding an **in-transaction exact Staff session lock/recheck for both CA and LM** before historical disclosure, with concurrency/lock-order tests and no unrelated field-operation changes?
- **Question 5:** Approve historical identity presence on the **shared SessionOverview API used by Vehicles**, or require a separate strictly scoped Live Operations response?
- **Question 6:** How should the UI distinguish **no proven completed Parking** from **completed Parking with missing actor identity**? Approve a minimal completion-provenance indicator or a generic non-assertive Unknown?
- **Separate question:** Accept a proven authoritative completion-order strategy before implementing multiple-completed-Parking selection? U-003 alone does not resolve that blocker.

**STOP — DO NOT COMMIT OR SHIP PUBLIC HISTORICAL IDENTITY FIELDS UNTIL FORMALLY ACCEPTED.**
