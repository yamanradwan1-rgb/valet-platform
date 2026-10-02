# Issue #254 — Resource occupancy and vehicle context

Owner-authorized implementation contract, 2026-10-02. Scope authority is the
owner's Issue #254 execution brief and GitHub Issue #254. This records that
approved read-only addition; it does not amend custody lifecycle decisions.

## Repository facts discovered

Starting `origin/main`: `875571136428d47cceb946a0aa1e0bbb75daac35`.
The existing operational Keys and physical Parking Spots reads are paginated
server queries. DEC-031's unique current-assignment indexes enforce one session
per non-null resource. Vehicle scope is Organization, not Location; its session
provides the exact Location relationship.

## Binding requirements

Preserve the frozen Keys & Spots UI, existing authorization, cursors, create
responses, QR labels, and all lifecycle commands. No migration, polling, N+1,
client occupancy inference, or persistent browser operational data.

## Existing implementation patterns

Extend `listKeyAccountability` and `listParkingSpots` in place. Keep shared
strict Zod contracts, existing read hooks, selected scope epochs, and existing
StatusBadge/muted table styles. Use a neutral Dashboard vehicle presentation
helper shared by the two features; do not change `operationsVehicleLabel`.

## LOCKED decisions and contract ledger

| Behavior | Authority | Scope/persistence | Retry/concurrency | Audit/privacy |
| --- | --- | --- | --- | --- |
| Key usage retains `holdingSessionId`; add nullable `holdingVehicle` with normalized plate and descriptor only | Owner brief §§3–7; DEC-068 | Same Organization/Location non-COMPLETED current `key_slot_id` holder | Existing bounded read and unique slot assignment index | Existing protected manager read and browser request cache behavior; no new audit |
| Spot list entry adds optional nullable `occupancy`: sessionId, sessionState, minimal vehicle | Owner brief §§3,6–7; DEC-031 §6 | Same Organization/Location non-COMPLETED current `parking_spot_id`; scoped Vehicle join | One page query; existing unique spot assignment index | Existing no-store manager read; no customer/staff/provider details |
| Active Location: null means Available; object means Occupied | Owner brief §§3,6 | Persisted Location status and current assignment | Current result on existing reads only | No client authority or cache |
| Inactive Location: omit occupancy and render configuration only | Owner brief §§3,6; DEC-096 inactive behavior | Persisted inactive Location, CA historical authority | Existing historical read | No operational availability claim or vehicle projection |
| Keep CA/LM access and deny Supervisor/Employee/Guest; revalidate every read | DEC-080; DEC-088; DEC-096 Management authority; owner §12 | Existing persisted User, membership, Organization, Location, MFA/entitlement/access guards | Existing transaction authorization before projection; no domain mutation | Existing concealed denials and protected-read cache behavior |
| Plate → descriptor → localized unavailable; plate LTR, descriptor auto | Owner brief §4 | Server-projected vehicle facts only | No browser join or UUID fallback | Minimal identity display within existing cells |
| Preserve UI geometry/styles and request/generation behavior | Owner brief §§2,8–11 | Existing Usage/Status cells and scope/session generation | Existing hooks, cursor resets, lazy tabs | In-memory protected data only |

## DERIVED conclusions

No schema changes are needed. A dedicated `ParkingSpotListEntry` extends the
configuration shape while create responses remain `ParkingSpotConfiguration`.
Omitted occupancy denotes the configuration-only historical view; it must never
be interpreted as Available. Session identity/state are supporting API facts,
not the primary row label. No new session/task transitions, configuration policy,
Company-default/Location-override behavior, or audit events are introduced.

## UNRESOLVED decisions

None within the approved Issue #254 scope.

## Risks / boundary violations

Join resources to sessions by persisted UUID and exact Organization/Location;
join Vehicles by UUID plus Organization. Never let inactive reads produce a
live projection. Keep the near-limit Overview controller unchanged. New tests
and focused modules stay within 300 physical lines.

## Proposed implementation plan

Add strict minimal vehicle and dedicated list contracts; extend the existing SQL
projections; render only required secondary content in existing cells; prove
authority, current assignment movement/release, races, request budget and visual
freeze. Reusable boundary is the two existing server query functions and shared
typed contracts. No downstream write capability is introduced.

## Test matrix

Contract strictness and create stability; real PostgreSQL CA/LM reads, foreign
scope/role/entitlement/access denials, current movement/release and pagination;
Dashboard plate/descriptor/fallback and bidi, lazy reads, cursor resets, A→B→A
late success/failure, logout/replacement, storage privacy, EN/AR, light/dark and
desktop/narrow screenshots. Mutations/replay/concurrent write semantics are
unchanged; existing resource creation/QR regression suites verify those paths.

## Files expected to change

Shared resource read contracts; two Dashboard SQL query modules; physical read
controller schema reference; neutral Dashboard identity presentation; existing
Keys Usage and Spot Status cells; localized resource copy; focused tests/fixtures.

## Explicitly out of scope

Lifecycle mutations, schema/migrations, Issue #236, Issue #237 relocation, shell,
navigation, CSS, new columns, polling, dependencies, PR, merge and issue closure.

## Ready-to-implement verdict

READY TO IMPLEMENT
