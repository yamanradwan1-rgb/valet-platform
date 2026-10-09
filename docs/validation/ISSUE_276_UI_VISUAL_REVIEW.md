# Issue #276 — U-004 Live Operations visual-review packet

**Status: REVIEW PROPOSAL — NOT OWNER SIGNED OFF.** Prepared 2026-10-09, current baseline `698bcb6044f72844008ffa49ef085f11471f53e1`.

## Gate and allowed surface

Package-local **Issues272–278/U-004**, issue-specific review. Product direction for narrow staff attribution was approved on 2026-10-08, but the Owner has **not approved final text wrapping, density, drawer arrangement or actual before/after captures**. The identity disclosure contract **Issues272–278/U-003** is likewise **DRAFT — NOT ACCEPTED**. No Live Operations render/code delta has been made for #276.

Freeze: same six table columns, widths, row heights, header, sidebar, KPI cards, filters, resource facts, action/Details button, drawer width/header/tab/order outside new facts, typography, colors, themes, icons, RTL/LTR, mobile/narrow responsiveness, map and Retrieval Queue. Do not globally alter `OperationalStaff` or add employee directory fetches.

**Shared drawer risk:** `apps/dashboard/src/features/operations/vehicles/vehicles-page.tsx` also renders this `SessionDrawer`. Future added history facts must be gated to the specifically approved Live Operations call site (or separately authorized on Vehicles); do not silently change the Vehicles drawer. The existing table staff second line is an email when available, so adding a role subtitle must not create a third line, overflow or silently expose historical email. Existing CSS fixes row height, and large/RTL names require actual measurements.

## Exact copy proposed for Owner review

| Location/meaning | English | العربية |
|---|---|---|
| Existing staff column header (replacement) | Staff | الموظف |
| Current active assignment secondary role | Assigned to | مُسنَدة إلى |
| Historic parked employee secondary role | Parked by | ركنها |
| Drawer original employee | Checked in by | سجّل الدخول |
| Drawer historic employee | Parked by | ركنها |
| Drawer current employee | Current assigned employee | الموظف المكلّف حالياً |
| No active Task/current assignment | No active assignment | لا يوجد تكليف نشط |
| Historical identity unavailable | Unknown | غير معروف |

**Privacy note:** Proposed historical rows display canonical *read-time complete name only*; no email row is added. The existing active-assignee email remains unaffected unless the Owner separately approves a change. All names require new server DTO explicitly accepted under U-003.

**Checked in by wording still needs Owner semantic approval:** this proposal points to the session's original `checked_in_by_membership_id` association. Per the accepted state machine, the actor who *completed* check-in can be different; do not silently relabel the original association as the final command actor. A requested different concept requires a separate provenance decision.

## Role-selection truth matrix

| Scenario | Table staff cell | Drawer |
|---|---|---|
| PARKED/no active Task/completed Parking with known identity | Parked By + approved name | Checked In By and Parked By separately; current: No active assignment |
| PARKED/completed Parking fact proven, identity unprojectable | Unknown (never fabricate a name or current assignment) | Parked By Unknown only when the completion fact is independently proven; current: No active assignment |
| PARKED/no completed Parking fact | Unknown (not an invented Parker or active assignee) | No asserted Parked By actor/fact; preserve known Check-in; current: No active assignment |
| Active Parking Task with assigned staff | Actual active assignee + Assigned to | Historical facts independent |
| Active Retrieval Task assigned | Actual Retrieval assignee + Assigned to | Earlier Parking name stays historic |
| QUEUED Retrieval, assignee null | Unassigned (never historic fallback) | Current Unassigned; earlier Parker separate |
| Active Task missing projectable identity | Safe existing Unassigned/current fallback | Never borrow historic Parker |
| COMPLETED/CANCELLED session (defensive domain invariant, NOT current Live list fixture) | Only authoritative facts justified by state | Never imply active assignment or fabricated completion actor |
| Historical subject inactive/subject grant revoked | Only under accepted U-003 | Canonical read-time identity, not event-time snapshot |
| Current viewer scope revoked/changed | Protected row/name disappears | Old drawer teardown / ignore late response |

**Provenance decision still required:** the proposed names-only nullable `parkedBy` cannot distinguish no verified completion from a verified completed Parking Task whose identity is unprojectable. Do **not** infer a completed-task fact from a null name or display the historic Parked By row as established without evidence. Before implementing these exact two drawer states, secure Owner/security acceptance of a minimal separate server-authoritative completion-provenance indicator (or an equally bounded reviewed alternative); if not approved, use one generic truthful Unknown presentation that does not assert Parking history. These are review scenarios, **not** currently expressible by the proposed DTO alone. Final copy and omission geometry require U-004 sign-off.

**Testability restriction:** the current strict Live `SessionOverviewEntry` state enum omits `CANCELLED`, and its `sessionOverviewFilterStates.ALL` excludes `COMPLETED`; do not claim the defensive COMPLETED/CANCELLED row is a renderable list scenario without a separate accepted scope/state contract. The recommended new Live-only history DTO must not silently widen either cohort. Required visible cases are the states actually returned by the existing filters.

**Approved-scope design candidate, not rendering approval:** use an explicit Live-only staff-cell selector (primary current active employee with secondary Assigned to; otherwise PROVEN Parking with named parker and secondary Parked by; never substitute an historic Parker for a queued/unassigned Retrieval), plus dedicated history-only drawer fact composition. The existing `SessionDrawer` is shared; keep Vehicles' exact existing facts/copy and focus semantics. Preserve two-line staff cells by replacing, **not adding**, the active email subtitle in Live only, while retaining the current-assignee email contract in non-historic authorized data/drawer. Require verified wrapping/clamp/bidi/row height and scroll captures.

## Exact before/after capture matrix (all **NOT CAPTURED**)

Capture with equal source/synthetic inputs, viewport/zoom, authorized viewer, Organization, Location and deterministic time:

1. EN Light wide; EN Dark wide.
2. AR Light wide; AR Dark wide.
3. EN and AR at smallest officially supported narrow width.
4. At 200% zoom with keyboard focus and screen-reader accessible Details/Close.
5. Long Latin name and long Arabic name; confirm bidi isolation, ellipsis, no extra row height.
6. Different Checker/Parker; same Checker/Parker.
7. PARKED with history, PARKED without safe historical identity.
8. Active Parking assignment, assigned Retrieval and queued unassigned Retrieval.
9. Denied/revoked viewer and deferred old-scope response while drawer is open.
10. Drawer with maximum fact list, scroll and close/focus restoration.
11. Original Retrieval Queue unaffected in same scope.
12. Vehicles table and **shared drawer remain unchanged** with the same input, EN/AR/theme/viewport.
13. A→B→A and logout/revocation while a synthetic historical-name drawer is open: no stale A name, dialog or scope response may reappear.

Record before screenshot artifact/checksum and after artifact/checksum for every combination; unexpected geometry delta is a blocker. Do not update unrelated visual snapshots.

## Baseline and measured evidence

Source: `apps/dashboard/src/features/operations/live-operations/live-operations-table.tsx:42-51,126-130`; `session-drawer.tsx:59-93`; `operations-copy.ts:26,126`.

Current main table header reads “Assigned To”/“المسند إليه” and uses `activeTask?.assignee`; drawer uses the same active-only assignment, including its existing email row. Synthetic diagnostic tests reproduce this pre-fix behavior.

No visual before/after comparison is claimed. No browser screenshot or fully mounted interaction evidence was collected. U-003 forbids introducing the new identities yet; separate chronology risk also blocks implementing the eventual historic candidate selection.

**Owner U-004 sign-off: PENDING.** Do not merge, deploy or close Issue #276 based on this packet.
