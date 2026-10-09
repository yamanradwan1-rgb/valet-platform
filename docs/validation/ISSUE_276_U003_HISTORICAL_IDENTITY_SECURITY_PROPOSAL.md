# Issue #276 — Issues272–278/U-003 historical identity security decision

**Status: HISTORICAL PROPOSAL — SUPERSEDED BY ACCEPTED DEC-102 (2026-10-09).** Prepared against `698bcb6044f72844008ffa49ef085f11471f53e1`. The original alternatives and open questions below remain as the *pre-acceptance reasoning record*, not current implementation authority.

**Binding resolution:** [DEC-102 — Live Operations historical staff attribution](../decisions/DEC-102_LIVE_OPERATIONS_HISTORICAL_STAFF_ATTRIBUTION.md) records the Owner's explicit acceptance of six recommendations: canonical complete name-only read-time historical identities (including inactive subjects), no historical email/IDs, dedicated Live-only read API (Vehicles excluded), transaction-held exact CA/LM session/scope proof, strict paired Task+Dispatch+Audit Parker proof with actor equality and `occurred_at` ordering, conservative `UNVERIFIABLE` ties/conflicts, and strict `PROVEN | NO_RECORD | UNVERIFIABLE` provenance with nullable names. The older options and `DRAFT / NOT ACCEPTED` statements below describe **past** decision status only. No production code, PostgreSQL validation, U-004 visual signoff or merge has occurred through this documentation acceptance.

## Decision required and existing authority

Issue #276 concerns *three different operational facts*: `Checked In By` from the original ValetSession, `Parked By` from a successfully completed Parking Task, and `Current Assigned To` from an active Task. The only new identity disclosure sought is historical check-in/parking, **not** task assignment, directory access, or Management Audit enrichment.

Existing binding precedents do not decide the new surface:

- Accepted DEC-080 requires present Company Admin role, Organization, target Location, commercial entitlement, and applicable MFA; operational field mutation remains distinct from management reads.
- Accepted DEC-081, T05-E (lines 173–205) authorizes current canonical identity/name and email *specifically for bounded Management Shift history*. It allows authorized historic target identity despite target inactivity/old grants, but its permission cannot be automatically copied to Live Operations.
- Accepted DEC-079 and DEC-082 require purpose-limited, scoped, privacy-minimum Management Audit projections. They do **not** authorize a #277 identity expansion as a side-effect of this issue.
- Accepted DEC-088 requires current server-side Dashboard entitlement. Its loss must not change physical custody.
- `docs/plans/issues-272-278/OWNER_DECISIONS.md`, U-003 direction (Owner approved in principle) still requires formal security/DTO amendment; U-004 requires actual per-issue pixel/copy approval.

## Proposed identity shape N1 — minimal historical names (not yet approved)

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

**Open DTO/provenance decision:** the two nullable historical-name keys alone cannot tell whether `parkedBy:null` means no verified completed Parking Task or a verified completion with an unprojectable historic actor. Do not emit `Parked by: Unknown` as an established history fact solely from null. Before differentiated drawer facts ship, accept a minimal, separately verified completed-Parking-provenance flag (or another purpose-scoped reviewed evidence shape), with no extra PII and exact Org/Location/session checks; otherwise render a generic non-assertive Unknown without distinguishing the causes. Such a field is **not** part of initial identity-shape N1 and is not authorized merely by this draft.

**Proposed default: suppress historical email entirely.** Current `OperationalAssignee` retains its already-accepted email behavior for active assignments; do not reuse `staffManagementDisplayName` historical email fallback or globally alter `OperationalStaff`. No new generic history lookup endpoint, employee-directory fetch or new history snapshot/backfill is proposed.

### Rejected identity shape N2 — reuse current OperationalAssignee

Reusing `OperationalAssignee` yields convenient existing strict parsing and formatting, but exposes `membershipId` and linked account `email` that the historical cell/drawer does not need; its active-assignee subject-current-grant predicate would suppress authorized inactive history. N2 requires **separate explicit purpose-, role-, Organization-, Location- and UI-field approvals for email/ID disclosure** and dedicated historical join logic. Recommended decision: reject N2 for #276; instead extend N1 minimally with an independently approved completion-provenance status.

## Viewer authorization: *current request*, not historic subject

The existing `authorizeDashboardReadLocation` must succeed *before* querying identities, in the same authorized Location-scoped server read:

1. Current authenticated active User and the **exact current Staff session** on historical-name reads, not a stale client token's claimed role. Its lock/revalidation must run inside the very transaction that reads the history, for **both** Company Admin and Location Manager.
2. Current active Organization; active Company Admin or Location Manager membership with exact established capability `LOCATION_DASHBOARD_READ`.
3. Current requested active Location owned by that Organization. Location Manager requires its own **present** exact `membership_location_access` grant. Company Admin uses the existing persisted authority/MFA assurance boundary, not hypothetical LM grants.
4. Current `DASHBOARD_ACCESS` commercial entitlement and applicable MFA/session checks. Never add field-operation permissions merely for this read.
5. A revoked viewer account/session/role/Location grant or disabled Location denies the requested page; never supply a previously cached identity after a later denial.

Source authorization functions are `apps/api/src/modules/dashboard/dashboard-read-authorization.ts` and `dashboard-location-authorization.ts`. The existing filter and **scope-validated, unsigned base64url JSON** Organization/Location cursor must remain unchanged (`session-overview-cursor.ts:15-39`); it is **not an authentication/authorization token or MAC**. A passed request's Location ID alone is not authority.

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

History is added only inside a specifically approved, authorized, keyset-paginated sessions read; no N+1 or global directory. One historical parking candidate per session using a safe, proven completion ordering source (not currently proven `updated_at`), one row per session, unchanged filters, cursor and 6-column table. The initial two nullable name attributes are **not a final approved DTO**: an independently reviewed, non-PII completion-provenance discriminant may also be needed. Zod `.strict()` must reject extra email/IDs or other protected keys. Coordination must include API mapper, contracts, fixture tests, Dashboard parser and **all** `SessionOverviewEntry` consumers if a shared DTO is chosen; old-client/new-API strict-schema rollout and actual disclosed audience require an explicit plan. No DB migration is approved by this proposal.

Do not add `HistoricalStaffName` to a broad shared service with generic read rights. Do not reinterpret DEC-081 T05-E's email disclosure as blanket authorization.

## Proposed Accepted amendment (future, **not effective now**)

> For Issue #276, only the expressly approved Dashboard session-read API audience may receive canonical read-time first and last names (both present) of the session's original check-in membership and one proven completed-Parking-task membership. Current `LOCATION_DASHBOARD_READ`, exact Organization/Location, commercial, session/MFA and **in-transaction exact-Staff-session revalidation** are required for both CA and LM. Historical subjects may be inactive or no longer hold current Location grants. Return null rather than partial, missing or email-derived names; no historical email, membership/user IDs, directory endpoint, historical snapshot or new authority. If the shared SessionOverview DTO is approved, explicitly include its Vehicles consumer in the allowed API audience; otherwise use a separately approved scoped read. Keep current active Task assignment untouched. This amendment does not authorize Issue #277 Management Audit enrichment.

Acceptance record must identify **Issues272–278/U-003** (not bare U-003), exact Accepted DEC or Owner/security artifact/date, allowed viewer and historical-subject states, null semantics, historical identity shape N1 **plus approved completion-provenance shape**, chosen API audience A(shared) or B(purpose-specific), active-assignment email unchanged, exact API/UI scope, and all mandatory negative cases. Subsequently obtain per-issue **Issues272–278/U-004** visual sign-off.

## Final decision-ready supplement — 2026-10-09 continuation

**Still DRAFT — NOT ACCEPTED.** This supplement proposes actual choices without silently changing the earlier diagnostic/Owner plan or producing a new protected API. Event integrity rationale and non-executable SQL outline: `ISSUE_276_CANONICAL_PARKING_COMPLETION_EVIDENCE.md`.

### API audience choice: shared A versus purpose-minimized B

| | A: Extend existing `/overview/sessions` DTO | B: separate Live history response (**recommended**) |
|---|---|---|
| Audience | Existing Live **and Vehicles** authorized exact Location readers necessarily receive historical names in HTTP response | Only the explicit Live Operations history route/DTO contains those additional protected fields; existing Vehicles response remains byte-for-byte identical |
| Complexity | Smaller API/query duplication, but shared strict contract/fixtures require simultaneous change and mixed-version coordination | New narrowly scoped server read/contract/transport, preserve existing pagination/filter semantics, more initial tests/maintenance |
| Principal authority | Existing CA/LM `LOCATION_DASHBOARD_READ`, Location/Organization and commercial/MFA restrictions | **Same current CA/LM authority**, plus exact in-transaction Staff session recheck. A distinct route is **not** a new role permission: an authorized manager could still call it outside the Live browser UI |
| Data minimization | Broadens the current Vehicles response | Avoids incidental history payload in Vehicles; no client-only CSS hiding |
| Rollout | New required nullable fields can break current strict clients if API deploys first; coordinate client/server or compatible versioned route | Separate strict new endpoint schema can ship without modifying Vehicles' existing `sessionOverviewEntrySchema` parser; Live switches only after approved coordinated deployment |

**Recommended decision B**, contingent on Owner/security acceptance of the additional read route and exact new DTO. Candidate route name (not yet reserved/implemented): `GET /v1/staff/dashboard/locations/:locationId/overview/live-sessions` with existing safe `filter/limit/cursor` parameters and server-enforced exact scope. Route naming and the new cursor domain/version require explicit contract review; do not reuse an old cursor for a new domain without verifying the existing codec's binding. No generic staff directory; no guest/Native/Management Audit exposure. Even B does not guarantee a manager cannot voluntarily call the endpoint; it minimizes incidental response disclosure, not principal authority.

### Recommended future STRICT Live-specific DTO (candidate only)

```ts
type HistoricalStaffName = {
  firstName: string; // both validated, current membership name at read time
  lastName: string;
}; // strict; neither email nor membership/user ID

type ParkingCompletionProof =
  | "PROVEN"        // canonical completed Task and approved event proof
  | "NO_RECORD"     // no completed Parking Task AND no contradictory Dispatch/Audit evidence
  | "UNVERIFIABLE"; // any missing/duplicated/conflicting/orphan completion or Audit evidence,
                    // including Dispatch COMPLETED on a nonterminal Task or orphan
                    // Parking Audit when zero completed Parking Tasks exist

interface LiveSessionStaffAttribution {
  checkedInBy: HistoricalStaffName | null;
  parkedBy: HistoricalStaffName | null;
  parkingCompletionProof: ParkingCompletionProof;
}
```

Add these to a **new strict Live-only SessionOverview derivative** after acceptance, never to `OperationalAssignee`. Existing `activeTask`, `currentAssigneeMembershipId` and Vehicle facts remain unchanged. Treat `checkedInBy` as original `valet_sessions.checked_in_by_membership_id`, **not automatically the actor of `VALET_SESSION_CHECK_IN_COMPLETED`**, which can be different (`docs/04_VALET_SESSION_STATE_MACHINE.md:115-117`). If the Owner instead wants the final check-in completing actor, that is a *different* domain contract needing explicit provenance review.

**Cross-field strictness:** `parkingCompletionProof !== "PROVEN"` REQUIRES `parkedBy === null`. With `PROVEN`, name may be null if the actor membership has missing/incomplete canonical names. **`NO_RECORD` requires absence of completed Parking Task AND any contradictory Dispatch/Audit history; otherwise `UNVERIFIABLE` applies even without a completed Task.** No field implies a Task/current assignment, a staff role/grant, or an event-time snapshot. Unrecognized proof discriminator, extra `email`, `membershipId`, `userId`, `rawAudit`, unbounded strings, missing required keys and invalid Unicode/whitespace name components must be rejected. Names follow the current accepted membership-name constraints (1–100 Unicode code points each, no surrounding ECMAScript whitespace). `NO_RECORD` and `UNVERIFIABLE` are not synonyms; both must render without inventing `Parked By`.

**Completion evidence is separately pending Owner/security choice.** Recommended strict read proof: exact same-scope `Task(PARKING,COMPLETED)` + one Dispatch `COMPLETED` + one canonical Audit `VALET_SESSION_PARKED` matched by scope, metadata taskId, actor, DB occurrence time and coherent status/version; actor equals event newAssignee and original Task assignee. No `tasks.updated_at` chronology; identical millisecond timestamps across distinct tasks are `UNVERIFIABLE` unless Owner explicitly approves an arbitrary stable tie convention (which cannot prove physical order). A candidate with a missing/conflicting duplicate is never silently skipped in favor of an older actor.

### Current viewer authority matrix, subject versus viewer

| Reader | Existing read authority required | Added protection before ANY historical name SELECT | Expected |
|---|---|---|---|
| Active LM in exact active Location | Active User, LM membership, active Organization/Location, currently persisted exact Location grant, `DASHBOARD_ACCESS` | Lock+recheck exact Staff session/access verifier, then serialize/recheck current LM membership + exact Location grant and active Location under the existing staff-management Organization lock/row order; retain locks through history read | Names only for that Location |
| Active CA on exact active Organization-owned Location | Active User/CA membership, active Organization/Location, `DASHBOARD_ACCESS` and existing CA MFA assurance | Exact Staff session lock+recheck before applicable MFA/session and Management scope evaluation in same transaction | Names only for authorized Location |
| Supervisor / Employee / Guest / unauthorized viewer | No `LOCATION_DASHBOARD_READ` management entitlement | No history/name probe | Deny without identity detail |
| Revoked/expired viewer session, revoked LM grant, inactive viewer membership or Organization, lapsed entitlement | Current authority fails | Reject before history SELECT; old client data must be generation-fenced/cleared | No names |
| Historical subject now inactive, demoted, no active Shift/Location grant | Viewer authority remains independent of subject's *current* employment/operational privileges | Match historical same-Organization membership and both validated canonical name components only, subject not required to be ACTIVE | Names only if the U-003 historical-subject exception is formally Accepted |
| Missing/deleted/cross-tenant/malformed historical subject | No trustworthy same-Organization identity | Never infer email local-part, global User or metadata | Null/Unknown |

**Proposed explicit lock order, still requiring independent concurrency validation:**

1. Existing `staff-user-security:<userId>` advisory boundary, **then** exact current Staff session `FOR UPDATE` / access-token verifier recheck (`staff-session-revalidation.ts:11-36`).
2. Existing **CA only** MFA/session proof *after* that security/session boundary (never acquire MFA session lock first, then the user advisory lock); LM receives no new routine MFA.
3. Determine authorized Organization without trusting the client. Serialize the relevant actor-role/grant authority with existing `staff-management-org:<organizationId>` advisory boundary used by LM staff writers (`20261001005000_mgt_240b_lm_staff_authority/migration.sql:15-17`), then lock/recheck the actor membership and **exact LM grant + ACTIVE Location** rows (ordered deterministically, with suitable `FOR SHARE` / `FOR UPDATE` semantics) and active Organization. Reuse the existing policy's grant-row locking direction (`migration.sql:47-68`), **not** a new post-org Location-lifecycle advisory lock that would invert its accepted lifecycle->staff-org order. Hold the relevant locks through the bounded history/name SELECT.
4. Recheck current `DASHBOARD_ACCESS` commercial entitlement and applicable CA Management capability/MFA under a demonstrated compatible serialization boundary for platform entitlement revocation. The exact entitlement writer/reader lock compatibility remains a **separate required proof**, not an assumed lock or automatic new permission.
5. Only after these checks access history and return the exact-Location bounded response; current scope and stale-client-generation fences still apply.

The existing LM `authorizeDashboardReadLocation` path performs a plain early SELECT without same-transaction exact Staff-session lock or LM grant-row serialization (`dashboard-read-authorization.ts:41-56`; `dashboard-location-authorization.ts:20-39`); controller token resolution occurs earlier (`overview.controller.ts:72-103`). **Do not implement the proposal by merely adding a late Staff session check after the unlocked LM scope SELECT.** Test logout/refresh and LM grant/role revoke interleavings including rollback, plus CA MFA and entitlement flips, for deadlock and stale-name response safety. If the existing location lifecycle / entitlement writers cannot safely serialize with this order, stop and request a focused alternative instead of widening shared Dashboard authorization or inventing a lock. No claim that this has been implemented. Keep current CA MFA; do **not** add routine LM MFA, operational mutation authority or a global authorization rewrite.

### Transaction/scope/cache guarantees to prove, not presume

- Authenticate header once, resolve a concrete Staff context, enter the history-read transaction, establish exact session/security proof and re-evaluate *current* CA/LM Organization/Location/entitlement/MFA there, then read bounded scope and history.
- For concurrent revocation, test both interleavings with actual lock boundaries (session logout/refresh, LM grant/role revoke, CA MFA expiry, commercial entitlement off). An unlocked LM grant SELECT followed by history would be a TOCTOU; proposed Organization advisory + row locks must be checked against the actual revoker. A preliminary lookup or unsigned cursor is not authority. Ensure unauthorized outcomes do not emit names, including delayed responses.
- Session/cursor `(created_at,id)` ordering and filter-specific boundaries stay unchanged; a new purpose-specific cursor domain must reject wrong Location, Organization, filter, endpoint version, malformed/foreign cursor. The current cursor is unsigned scope-validated JSON, **not a secret capability**.
- Client must fence response by Staff identity generation, Staff session generation, Organization, exact Location, selected scope revision, read generation and component lifetime; teardown old loaded rows and open history drawer on scope change, logout, denial or entitlement change. Do not reuse a previous authorized name across A→B→A solely because Location returns to A.
- The server must scope historical membership lookup by the already-authorized session Organization and stored membership ID; never by user ID alone. Never resolve protected names with a per-row fetch or generic search.
- The new response must contain zero historical email/IDs or audit JSON in normal, empty, unknown, error and telemetry branches. Existing current active-assignee email remains its own approved field.

### Before/after deployment and tests

**After both U-003 security and completion ordering are Accepted:** implement an isolated Live-only endpoint/schema, API mapper/query and client hook; existing Vehicles `readSessions` remains original strict DTO. Add dedicated versioned strict contract tests rejecting leaked keys, wrong `PROVEN`/name combination, incomplete canonical names, cross-Locale shape differences and malformed proof. Add PostgreSQL exact-scope/actor/paired-event/duplicate/zero-event/tie tests; CA/LM exact-session concurrent revoke, stale cache and commercial access tests; preserve active Task behavior. Measure `EXPLAIN (ANALYZE, BUFFERS)` only on proven disposable representative PostgreSQL and existing index/query budgets.

**After U-004 reviewed visual geometry:** new Live role cell/role drawer fields with existing six columns, no third text line, EN/AR, Light/Dark, RTL/LTR, wide/narrow/long names/200% zoom, deferred browser scope-switch and focus checks. Keep Vehicles drawer and existing Retrieval Queue visibly unchanged. An absent completed Parking record is **not** rendered as a proven historic parker; `PROVEN` with null name permits explicitly qualified Unknown.

**Phase A permitted evidence now:** read-only source proof, non-PostgreSQL writer diagnostic, synthetic UI omission diagnostic, strict *candidate* vector/specification, DRAFT review; no public DTO, route, query or UI exposing history. **PostgreSQL, physical QA, screenshots and new endpoint tests remain NOT RUN/PENDING until actual approved and isolated conditions exist.**

### Owner approval record — exact choices, not implied

1. **U-003 historical subject:** approve current viewer authority despite historical subject inactive/role or grant loss, current read-time complete names (no email/IDs), no snapshot?
2. **U-003 audience:** approve recommended purpose-limited **B** route/strict Live-only DTO (Vehicles unchanged), or explicitly approve **A** shared session DTO and extra Vehicles HTTP audience?
3. **U-003 session proof:** approve in-transaction exact Staff session lock/recheck for both CA/LM, compatible revocation/lock ordering and no new LM MFA?
4. **Completion proof:** approve required canonical Task + Dispatch COMPLETED + Audit VALET_SESSION_PARKED paired reader integrity, actor equality, fail-closed anomalies and no `Task.updated_at` use?
5. **Chronology tie:** accept conservative `UNVERIFIABLE` for distinct tasks sharing maximal timestamp, or expressly permit stable arbitrary ID ordering **without** physical newest guarantee?
6. **DTO provenance:** approve three-value `parkingCompletionProof` discriminator plus nullable strict `checkedInBy`/`parkedBy`; no fabricated Parked By row for `NO_RECORD/UNVERIFIABLE`?
7. **U-004 (separate):** approve exact final Live text, row/drawer placement and before/after EN/AR × Light/Dark + responsive captures **only after** test render evidence, prior to merge.

An actual acceptance artifact must identify **Issues272–278/U-003**, Owner/security reviewer, Accepted DEC/amendment/date, exact API audience/DTO, chronology source, conditional UI/rollout scope and residual limitations. Approval of this DRAFT or general issue direction is **not** authorization.

## Independent review and Owner sign-off

- **Independent security design review:** completed read-only by worker-4 on source/Accepted DEC and current DRAFT; concrete *pre-implementation* P1 risks (LM exact-session recheck, staff-user-security-before-MFA lock order, Vehicles response audience/old strict clients, canonical Parker actor, null-history provenance) are explicitly gated above. **This is NOT Owner security approval or an implementation security PASS.** Final post-approval code/DB diff independent review remains PENDING.
- **Question 1:** Accept **identity shape N1** (strict first+last name only) for historically inactive/revoked subjects, independently of the recommended **API audience B**?
- **Question 2:** Confirm historical email and membership/user ID are suppressed even if names are missing?
- **Question 3:** Approve current read-time identity disclosure (not frozen event-time identity) and `null` fallback?
- **Question 4:** Approve adding an **in-transaction exact Staff session lock/recheck for both CA and LM** before historical disclosure, with concurrency/lock-order tests and no unrelated field-operation changes?
- **Question 5:** Approve historical identity presence on the **shared SessionOverview API used by Vehicles**, or require a separate strictly scoped Live Operations response?
- **Question 6:** How should the UI distinguish **no proven completed Parking** from **completed Parking with missing actor identity**? Approve a minimal completion-provenance indicator or a generic non-assertive Unknown?
- **Separate question:** Accept a proven authoritative completion-order strategy before implementing multiple-completed-Parking selection? U-003 alone does not resolve that blocker.

**STOP — DO NOT COMMIT OR SHIP PUBLIC HISTORICAL IDENTITY FIELDS UNTIL FORMALLY ACCEPTED.**
