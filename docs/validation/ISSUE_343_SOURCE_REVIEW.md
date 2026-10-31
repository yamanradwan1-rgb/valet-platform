# Issue #343 source review

## Review target

Local owned branch `feat/issue-343-task-route-history` against main
`92638c499a1062db3f814687ca3761f235361298`, including new files and the complete
existing-file diff. Approved prototype reference:
`1909a3cdb3e34d7bdf8d35897676948542468ac1`. This is implementer self-review;
independent review and remote CI remain required. No PR, merge or deployment.

## Decision/docs checked

The current Owner implementation brief explicitly authorizes Phase B and
supersedes the archive's pending-design note. AGENTS.md; core docs 00–20;
DEC-032/034/045/046/047/048/049; relevant staff-session, Management/Dashboard
and UI Freeze contracts, including DEC-080; current Emergency Takeover code,
migration 105 and DEC-107's actual Proposed status. No decision status changed.
The pre-code implementation plan records LOCKED/DERIVED propositions and the
READY TO IMPLEMENT decision. Existing code is convention evidence, not new
role or domain-policy authority.

## Findings

Corrected during self-review:

- MAJOR: placing Route History above the existing Emergency Takeover action
  would move that action. The optional insertion now follows the existing
  action; pixel and action-geometry comparisons cover that boundary.
- MAJOR: acquiring Location row locks before the shared lifecycle advisory
  boundary could invert the existing lifecycle/Shift writer lock order.
  Discovery now resolves only a scope hint, obtains the existing lifecycle
  lock, then proves the complete persisted authority. A real PostgreSQL
  concurrent Location-disable regression test exercises the corrected order.
- MINOR: limiting automatic pagination only by point count could traverse too
  many sparse pages. There is now a hard four-request bound in addition to
  the 2,000-observation bound, with a sparse-page unit test.
- MINOR: the existing TrackingModule ownership test needed to include the new
  controller/service. Its tracking assertion is updated; the unrelated stale
  Dispatch assertion is deliberately preserved and reproduced on main.

No unresolved feature-specific security finding was identified in these
bounded review passes. This is not a full-repository security audit.

## Security & tenant/location verdict

Discovery authenticates the current bearer session, rechecks that exact session
and active User inside its transaction, resolves the Task's persisted Location,
then joins exact Organization/Location/ValetSession/Task, active membership,
active User and explicit LocationAccess. Exact LOCATION_MANAGER or
VALET_SUPERVISOR only; Supervisor also needs current active Shift at the same
Location. No Company Admin hierarchy shortcut, employee or guest authority.
Missing, foreign, ungranted, inactive and ineligible targets are concealed with
the same authorization error. Client organization/location/membership fields
are rejected by the strict query schema. Every metadata and sample page makes
a fresh authorized request. The existing sample endpoint's policy is retained.

## Retry/concurrency & DB verdict

No protected INSERT/UPDATE/DELETE or business state transition is added.
Discovery uses existing transaction/authority helpers and shared locks retained
through the read. The existing lifecycle lock precedes Location row locks.
Grant deletion is blocked while proof is in use; waiting readers are tested
against both writer commit and rollback. Later requests observe revocation.
No claim of one snapshot spanning separate HTTP requests is made. Reads can
observe retention cleanup between pages; a displayed bounded window is not
advertised as a complete archival export. Task-bound cursors cannot grant
scope. No retry/idempotency write contract is introduced.

## Abstraction compatibility verdict

The new controller/service/query follow existing staff tracking conventions.
The exact-session revalidation helper receives genuine StaffSessionContext;
Shift eligibility receives the actual persisted membership and Location.
No fake IDs, no helper broadening and no modification to the existing general
Task-list contract. The historical Google adapter extends its SDK type locally;
the shared loader and existing live-map behavior stay unchanged.

## Audit/privacy verdict

Read-only addition: no invented audit events or metadata, no GPS log/metric
payloads, no guest surface, no exports, no route-sharing URL, no collection or
retention changes. Discovery returns only ended-recording references/times and
nullable immutable owner provenance. Known membership UUIDs are not rendered;
legacy NULL provenance is explicitly unknown and never inferred from current
Task assignment. Raw reads and discovery use no-store responses. Coordinates are held in feature state; closing the viewer tears down that
state and provider resources. Abort/generation fences and scoped remounts reject
stale work. No new local/session storage of coordinates.

## Downstream consumer verdict

Shared strict contracts and a backend query independent of HTTP expose the
minimum scoped recording discovery capability. The Dashboard reuses the
existing sample API. Separate recording selection prevents lines crossing
employees/recordings. No future Dispatch ownership model or reusable generic
repository framework is introduced.

## Architecture/300-line verdict

Responsibilities are separated into authorization, cursor, query, transport,
recording loading, provider adapter, coordinate renderer and inspection UI.
Authored code stays at or below 300 physical lines; CSS and Markdown follow
repository exemptions. No architecture baseline edits, dependency changes,
Prisma changes or migrations. The task's handoff includes the exact line-count
manifest and architecture command evidence.

## Test adequacy verdict

Focused tests cover real PostgreSQL authority, two-principal object isolation,
role/Location/Shift boundaries, active Task/tracker rejection, separate immutable
segments, cursor bounds, inactive status/session revocation and concurrent
revocation. The new HTTP test uses real bearer/session resolvers and the runtime role.
The retained legacy sample transport test stubs principal resolution against a
real PostgreSQL query.
Browser tests run the actual Dashboard with isolated API fixtures: explicit-open
loading, bounded pagination, failed-page discard/retry, denial, cancellation,
focus restoration, responsive layouts and bilingual/theme keyboard behavior.
Scripted Google SDK tests check observed paths, bounded markers and teardown;
they do not prove live provider behavior. Full gate and evidence limitations
are recorded without converting mocks into production runtime claims.

## Scope leakage verdict

Only Task Details property forwarding/insertion, its new feature folder,
tracking/contracts, focused tests and task validation docs change. Existing
Emergency Takeover implementation, Tasks browsing/filtering, shared dialogs,
sidebar/header/navigation, global CSS, map setup, live tracking, custody and
lifecycle commands remain unchanged. Generated Next files are excluded.

## Gate evidence

See ISSUE_343_HANDOFF.md and its evidence bundle for exact commands, actual
counts, screenshots and limitations. Local lint/typecheck/build evidence is
not remote CI evidence. The unconditional root-test Issue #215 disposable-target
attestation blocks that command before tests. Unrelated help-count and Dispatch
ownership assertion failures reproduce on untouched main. Existing mounted-help
browser tests also require a browser binary missing from the default Playwright
cache. These gates remain open. Live Google and native 200% desktop browser
zoom require additional runtime evidence.

## Merge verdict

BLOCK MERGE

The feature is preserved for independent review with verification-incomplete
status. Do not infer merge or production approval from focused green checks.
