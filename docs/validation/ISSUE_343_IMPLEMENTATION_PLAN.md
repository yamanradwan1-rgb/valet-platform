# Issue #343 implementation contract and plan

## Repository facts discovered

Clean baseline `origin/main`: `92638c499a1062db3f814687ca3761f235361298`.
Prototype: `1909a3cdb3e34d7bdf8d35897676948542468ac1`; merge base:
`2b1ed12d62a3d68d4b3bafeaf25b6bf53fde1e3f`.
Owned branch: `feat/issue-343-task-route-history`.
Issue #343 and its one archive comment were retrieved through GitHub.
The Owner's current implementation brief supersedes their pending-design gate.

`RouteHistoryController` has literal `@Controller("v1/staff/tracking-sessions")` prefix;
`EmergencyTaskTakeoverController` has literal `@Controller("v1/staff")` prefix.
`tracking.module.ts` imports AuthModule, RuntimeDatabaseModule and
HttpInfrastructureModule and applies RequestIdMiddleware to its controllers.
Its thin route-history service delegates to an explicit transactional query.
`TaskDrawer` is wrapped by `EmergencyTaskDrawer`; `TasksContent` is keyed by
the operations scope, which includes identity/session generations.

## Binding requirements

Current Owner brief: completed Parking/Retrieval only; approved insertion and
overlay only; no unrelated Dashboard visual changes; real retained observations;
no PR, merge or deployment. DEC-045/049 own GPS privacy and read permissions.
DEC-080 explicitly excludes raw route history from Company Admin authority.
DEC-046/048 and current migration 105 preserve separate immutable recordings.
DEC-107 remains Proposed; no change to its status is authorized here.

## Existing implementation patterns

Reuse the exported DashboardApiClient, routeHistoryResponseSchema and existing
sample endpoint. Reuse FocusDialog, locale/theme providers and Google Maps SDK
loader. Add a feature-owned historical renderer without changing live maps.
Reuse transaction-aware Shift eligibility for Supervisor reads. Query mechanics
follow route-history-query.ts; no new repository framework or database pool.

## LOCKED decisions

| Claim | Scope and source | Falsifier searched and result |
| --- | --- | --- |
| L1: Only exact active Location Manager or exact active shifted Supervisor reads raw history | DEC-049, DEC-080; current persisted User/member/Organization/Location/grant | Later Management authority searched; raw routes still excluded |
| L2: New Task feature requires completed Task and ended recordings | Current Owner brief sections 4.3 and 8 | Existing endpoint permits ended segment on active Task; retain that broader endpoint independently |
| L3: Separate recordings cannot be joined or attributed to current owner | Current brief 5.2; DEC-046 clarification; migration 105 | Nullable immutable snapshot exists; legacy provenance remains unknown |
| L4: Only approved feature region may change visually | Current brief 2.2 and approved prototype | Four reference screenshots inspected; no global CSS change needed |
| L5: Retention, GPS ingestion, lifecycle and custody remain unchanged | DEC-045/049 and current brief exclusions | Existing read endpoint and scoped tracking FKs support feature without writes |

## DERIVED conclusions

| Claim | Derivation | Falsifier searched and result |
| --- | --- | --- |
| D1: Add a narrow paginated discovery read | Owner explicitly authorizes deriving minimum transport from current conventions; existing sample read needs a tracker ID | No existing Task discovery endpoint found |
| D2: Read one recording at a time | L3 plus approved existing viewer; select and pagination use existing feature design language | Multiple recordings exist; no combined polyline needed |
| D3: Bound each displayed window to 2,000 samples | Existing maximum 500 per page, four sequential pages; explicit next/previous windows preserve access to all data | Existing cursor supports continued traversal; no total/complete claim for partial windows |
| D4: Existing persistence suffices | Composite FKs and session chronology index already present; migration 105 supplies immutable nullable provenance | Schema and forward SQL inspected; no new persistence invariant needed |

Falsification coverage: 9 / 9 LOCKED+DERIVED conclusions checked.

## UNRESOLVED decisions

No implementation-critical policy choice remains under the current Owner brief.
U-001 is resolved by D1: a Task-scoped, read-only transport derived under explicit
Owner authorization. U-002 is resolved by D2: separate selectable recordings,
without inferred continuity or current-assignee attribution. U-003 is resolved
by the Owner's explicit instruction to retain current Supervisor Tasks browsing.
Runtime, provider and visual verification are evidence gates, not new authority.

## Risks / boundary violations

GPS disclosure, stale identity/scope data, revoked grants between pages, active
Task discovery, unbounded route loading, and nested-dialog focus are critical.
No protected coordinates or recording metadata precede authorization.
No coordinates enter audit, telemetry, logs, browser storage or broad Task reads.

## Proposed implementation plan

1. Capture current-main screenshots and geometry in an isolated checkout.
2. Add shared strict discovery schemas and `GET
   /v1/staff/tasks/:taskId/route-history-recordings`. Request accepts only bounded
   limit/cursor; cursor binds Task and chronological boundary. Response contains
   ended recording identifiers, persisted start/end and nullable immutable owner
   membership reference, plus next cursor. No employee name is inferred.
3. Add thin controller/service plus explicit query and scoped authorizer in the
   existing TrackingModule. Preserve the existing sample response and policy.
4. Add feature-specific typed client, bounded cancellable reads and keyed state.
5. Port approved section/viewer/CSS, remove prototype controls and fixtures,
   use actual Location timezone and observations, and render separate recordings.
6. Add lazy Google historical renderer using existing loader; preserve approved
   coordinate fallback with real data and truthful provider status/retry.
7. Verify source, PostgreSQL, mounted browser, visual freeze and repository gates.

Reusable read boundary: explicit Task discovery query accepts authenticated
session context and untrusted Task selector; it derives all authoritative scope,
proves completed Task and exact historical authority, then returns a bounded
recording page. It decides no Task assignment or future mutation eligibility.

Authorization-before-mutation proof: no business mutations are introduced.
Protected read order is exact current Staff session authentication, persisted
Task/Session scope resolution, current role/status/exact grant proof, Supervisor
Shift proof where required, bounded ended-recording query, commit, disclosure.
Session revalidation and authorization locks are retained through discovery.
Every subsequent discovery/sample page freshly authenticates and authorizes.
No success/denial read creates an audit event or changes custody/history.

Read/revocation race: Transaction A authenticates and holds current authority
rows through its bounded read; Transaction B changes grant/status/Shift. Existing
writer-compatible row/eligibility locks serialize the read and revocation. B
commits first => A denies; A holds proof first => B waits until A completes.
B rollback retains authority. Timeout/disconnect with unknown read outcome has
no business effect; explicit retry reauthorizes. No read helper is presented as
proof for a later assignment write. The check-use invalidation boundary for later
consumer transactions is outside this read-only feature. This task owns only the read interval.

## Test matrix

Real PostgreSQL: two-principal cross-tenant and cross-Location attempts; both
allowed roles; denied roles/status/grants/Shift; completed/active Tasks; ended/
active recordings; multiple immutable segments and unknown legacy owner;
keyset ties/pages; revocation before/between pages and read/revocation locks.
Existing route endpoint tests remain relevant and are rerun.

Read retry matrix: first, identical retry, concurrent identical reads, conflicting
revocation, retry after revocation all reauthorize and produce no business writes.
Commit/rollback/unknown outcomes are considered above. Mutation idempotency and
audit-rollback cases are inapplicable because the feature has no business mutation.

Dashboard: empty/single/2,000 samples, separate recordings, explicit partial
windows, second-page failure/retry, stale/aborted reads, closed viewer, Task/
Location/session replacement, provider failure, cleanup, keyboard/focus, EN/AR,
themes, required widths and browser zoom where supported. Screenshot/geometry
comparison masks only the exact new insertion; no broad Dashboard mask.

Evidence ladder: implementation, static checks, local commands, real PostgreSQL,
real browser and observed remote CI are reported separately. A local build does
not prove provider runtime or remote CI. No production-readiness claim is planned.

## Files expected to change

TrackingModule plus feature-owned discovery controller/service/query/authorization/
cursor and tests; additive packages/contracts discovery schema/export/tests;
TaskDrawer optional content forwarding and EmergencyTaskDrawer integration;
new operations/tasks/route-history components, client, state, renderer, copy,
scoped CSS and tests; task-specific validation documents and browser evidence.
New authored code files stay at or below 300 physical lines.

## Explicitly out of scope

Supervisor completed-task browsing, role expansion, existing Dashboard styling,
global CSS/tokens, map configuration, GPS collection/retention, Directions/Roads,
distance/speed/ETA, schema/migration/privilege changes, dependencies, PR/merge/deploy.

## Ready-to-implement verdict

READY TO IMPLEMENT
