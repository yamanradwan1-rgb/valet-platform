# Issue #240 / T05-E — Shift History

Status: IMPLEMENTED / FOCUSED ACCEPTANCE PASSED.
No remote CI, merge, production-readiness or full-shift pilot claim.
The owner's closure-only instruction accepts the focused T05-E evidence already
completed. Pre-existing aggregate baseline failures are outside T05-E scope,
not repaired, not counted PASS and deferred to cumulative/repository closure.
They do not block T05-E acceptance, commit or push. Issue #240 is not complete.
Owner-authorized scope: pasted T05-E brief clauses 0–54 and Issue #240 plan
sections 13, 17–19, 21–28. Baseline verified after fetch:
`d5488b0f6bca98642f2e59ec2c85bc5c9a9ed191`; clean existing normal branch
`fix/240e-shift-history`, starting HEAD equal to origin/main. Latest migration 053.

## Pre-code contract ledger and implementation map

Accepted authority: owner T05-E brief (latest instruction), DEC-081 with locked
U-01/U-02, DEC-078 ordinary read assurance, DEC-088 Dashboard entitlement,
DEC-032/052 unchanged self-shift semantics, DEC-082 read privacy. The owner brief
explicitly distinguishes Location-history authority from target management.

| Locked claim | Identity / persistence | Derived mechanics / proof |
| --- | --- | --- |
| List GET `/v1/staff/management/organizations/:organizationId/shifts` | Organization + existing Shift | Strict membershipId/locationId/status/from/to/cursor/limit; default 50/max100; predicates before LIMIT+1 |
| Detail GET same base `/:shiftId` | Shift -> same-org member/User/Location | Same strict entry, independent GET; absent/outside scope concealed with existing AUTHORIZATION_DENIED/404 |
| Current canonical identity and currentRole | Membership names, global User.email, current member role | Canonical identity schema/display fallback; no historical snapshot claim, UUID primary identity, cash, Task/Session or audit blobs |
| CA organization history including inactive Location/target lifecycle | Current actor User/session/member/org/entitlement | Reuse authorizeStaffManagement actor boundary with STANDARD read assurance; no authorizeStaffTarget |
| LM current active Location-grant history | Same actor boundary; current grants and Location status | Location predicate before limit, exact filter denial; no target-role/status/grant coverage predicate |
| Stable bounded history | Shift.started_at DESC, id DESC | Version/domain/org/actor-scope/filter fingerprint bound base64url cursor; both CA and LM scope-bound |
| Started-in `[from,to)` instants | Shift.started_at timestamptz(3) | Inclusive from/exclusive to; equivalent offsets normalized; reversed/equal/malformed rejected |
| Employee selection uses history authority | Existing shifts, tenant-composite member/Location joins | Dedicated bounded GET `/shifts/employees`, search/locationId/cursor/limit; EXISTS visible history; UUID ascending candidate cursor with independent domain; no PII in cursor |
| Location selection | Current authorized bounded management discovery | Lazy focus read, explicit pages, CA inactive supported; typed All state is absent locationId |
| Calendar filter timezone | Exact selected Location.timezone; all-scope UTC | Date controls labelled From inclusive/To exclusive and timezone; tested exact midnight conversion; invalid/nonexistent boundary blocks read |
| Duration local only | Persisted startedAt/endedAt | One shared 60s tick for visible surface/drawer; fixed ended duration, negative clamp; no live announcement/polling |
| Browser result ownership | Existing identity/session/selection/authority scope epoch | Epoch + normalized filters + query generation + cursor + detail selection generation; reset drawer/cursors synchronously on filters/refresh |
| Immutable business domain | Existing Shift, member, User, Location | No mutation or new business audit; existing CA session admin-activity recording retained |
| Measured read index only if justified | Final SQL plans on isolated representative rows | Four EXPLAIN cases before deciding migration; preserve historical rows/constraints/privileges |
| Frozen visual language | Staff reference CSS / AdministrationDrawer / existing controls | Before and after EN/AR, light/dark, desktop/narrow; added history content/filters only; Employees unchanged |

Affected read entities: Organization, subscription, StaffAuthSession, User,
OrganizationMembership, MembershipLocationAccess, Location, Shift.
ValetSession/Task/Dispatch transitions: none. Configuration policy: none.
MVP boundary: approved operational management history, no payroll/timesheets.
Existing tenant-composite FKs, Shift status/time checks and one-active-per-member
index remain authoritative. Read indexes are undecided until measured.

Structure: extract Shifts body from StaffPage; focused history controller/service,
query/cursor/candidate modules; UI API/query/filter/selector/row/duration/date files.
No new/changed authored file >300 physical lines; no legacy baseline relaxation.
Forbidden: T05-F/G, Force End/Start, self-shift changes, Overview semantics,
cash edits/projection, assignment, deletion, identity/name writes, history copies,
dependencies, protected browser persistence, N+1, preloads or page crawls.
Unresolved implementation-critical product behavior: none.

## Evidence

Executed on this branch; existing A–D reports were read as contracts, not reused
as proof. Backend cases use the repository-owned isolated PostgreSQL harness,
real Nest HTTP routes and runtime DB role. Browser cases use the actual Dashboard
with explicit API fixtures. They do not prove a populated browser-to-live-API
shift operation or a paid-customer pilot.

### Read behavior and authority

New strict shared contracts and three management GET routes expose only the
allowlisted history projection. All Location/tenant/employee/status/time/cursor
predicates execute before LIMIT+1; the bounded Shift page precedes identity JSON
projection. The history service reuses actor authorization independently of
target-management authority. No employee lookup per row or Location fan-out.

Real PostgreSQL history integration: 3 tests; authority integration: 2 tests;
candidate integration: 1 test; final SQL-plan integration: 1 test — all passed.
Covered stable tied timestamps over multiple pages, ACTIVE + ENDED, inactive
Location/target and disabled User, current canonical Unicode identity/currentRole,
ordinary CA assurance (six minutes accepted; nine hours denied), exact session,
actor account/member/Organization/role/entitlement denial, LM predicates before
LIMIT, direct hidden Shift concealment, inactive Location exclusion, grant loss,
scope/filter/domain cursor substitution, strict query rejection, literal wildcard
search and a 120-global-User / 240-membership candidate fixture. Reads preserve
Shift timestamps/status/cash and do not add Shift business audit events.

Unit checks: 14 contract tests, 3 cursor tests, 3 date/duration tests passed.
Calendar cases include UTC/Amman, New York DST, missing Apia midnight and
ambiguous Havana midnight; invalid/equal/reversed dates block browser requests.

Operational regression: 9 API files / 65 tests passed, covering Shift API,
eligibility, start/end/cash races and Overview API/authorization/domain/financial
reads. SelfShift, Overview consumers, cash commands and custody/Task lifecycle
source files were unchanged.

### Browser reads, retries and duration

Passed: `issue240e-history-budget` (2), `issue240e-history-races` (9),
`issue240e-denial-retry` (3), `issue240e-session-read` (2) and updated
`administration-r05-cursor-generation` (6). These cover first page, effective
filters, explicit Next/Previous, independent detail, bounded lazy employee and
Location selectors, exact timezone instants, invalid date zero reads, one shared
local minute timer, fixed ended duration, zero duration HTTP calls, keyboard
close/focus return, delayed success/failure for filter ABA/page/detail/candidates,
CA/LM Organization A→B→A, logout/same-user login and exact-session refresh.

Final review found cached selected-label restoration after a denied read/retry.
Three browser tests reproduced it before the fix and passed afterward. The
parent retains the employee membership ID only; names come from current history
or candidate results. Pending/denied/empty candidate retries use a generic
localized selected label. A cached Location label is also withheld during a new
history generation and after candidate denial. Technical IDs remain values,
not displayed primary identity.

Updated Staff authority/basic/presentation regression files passed (6 + 2 + 2).
Preserved A–D browser behavior passed: directory budget (1), LM staff (2),
create/onboarding (3), activation EN/AR (4). Both existing visual regression
files passed (2 + 2). No test was skipped or weakened to retain active-only
history, UUID-first identity or obsolete topbar chooser assumptions.

### Query plans and migration decision

`issue240e-query-plans-before-projection.json` and
`issue240e-query-plans.json` record EXPLAIN ANALYZE/BUFFERS on 40,000 ENDED rows,
20,000 per tenant and 200 members per tenant, using migrations through 053.

| Scenario | Before bounded projection | Final SQL |
| --- | ---: | ---: |
| Organization | 175.723 ms | 20.391 ms |
| Exact Location | 76.310 ms | 9.547 ms |
| Exact membership | 6.310 ms | 10.420 ms |
| Status/date | 27.560 ms | 11.055 ms |

These are isolated local measurements, not production latency promises. Final
organization sorting is a bounded top-N over tenant rows; identity/location
joins project only 51 rows. Existing indexes were sufficient at this measured
scale after bounding the projection; no speculative indexes were added.

**No migration required; history reads existing Shift rows.** Latest remains
`20261001005300_mgt_240d_staff_activation`. Prisma, migrations, historical rows,
runtime privileges and database seeds are unchanged.

### Frozen visual proof

`issue240e-baseline/` contains 32 screenshots captured before implementation.
`issue240e-final/` contains 32 fresh screenshots after the final fix: Employees,
employee drawer, Shifts and shift drawer across EN/AR × light/dark × 1440/480 px.
The final eight capture cases passed, including document-width and unchanged
14px/24px table-cell padding checks. Reviewed final EN desktop and AR narrow
Shifts images directly; table overflow stays inside the established container.

`issue240e-visual-comparison.json` compares Employees and employee drawer in all
eight combinations. Comparison excludes the bottom 60 px containing the Next
development badge. Fourteen crops match exactly; the two EN light desktop crops
differ at three sidebar Organization-icon pixels each (x20–21, y92/97; channel
differences at most four). No shared reference stylesheet or Drawer primitive
changed. New history columns/filters preserve the established typography,
spacing, borders, pills and action style. Captures are fixture evidence.

### Repository gates and limits

Focused ESLint over every changed authored TypeScript file: passed with zero
warnings. `pnpm architecture:check`: passed; unchanged grandfathered warnings
remain. Every new/modified authored code file is below 300 physical lines
(maximum 253);
architecture baselines were not changed. `git diff --check`: passed.

Root `pnpm lint`: failed on unchanged baseline Dashboard scope/foundation files
(9 errors, 3 warnings): selected-management-shell-transition,
selected-management-shell, location-switch-menu, use-location-switch-epoch-guard,
use-location-switcher. Errors concern refs during render/state updates in effects;
warnings concern effect dependencies. All five blobs match baseline d5488b0.

Root `pnpm test:non-postgres`: failed under concurrent load. Isolated package
reruns separated the persistent failure from timeouts: API with one worker had
465 passed / 1 failed; Dashboard 570 passed, Contracts 326 passed and Database
non-Postgres 23 passed. The persistent API failure is
`test/feature-module-ownership.test.ts`: its exact Auth controller expectation
omits the already-present StaffActivationController. Both that test and
AuthModule match baseline d5488b0 byte-for-byte. The sanitized result is stored
in `issue240e-api-non-postgres.json`. No assertion or Auth ownership change was
made outside T05-E. The entire PostgreSQL suite was not run; the 72 focused/new
and regression PostgreSQL tests above were executed instead.

Root `pnpm typecheck`: failed in unchanged Employee-app fixtures (15 TS2741
errors across 9 files missing the already-required Location.timezone). These are
employee-app.start-shift, shell/employee-gates, shell/employee-start-shift-panel,
shift/start-shift-reconciliation, and staff-operational-context/{
select-startable-locations, auth-transition, controller, session-boundary,
staff-operational-context} test files. All nine blobs match d5488b0. API,
Dashboard and Contracts typechecks are checked separately below; root reported
9 successful tasks before the Employee failure stopped the run. No Employee
fixtures/contracts were changed to fix this unrelated gate.

`pnpm build:production --no-cache`: passed, exit 0, all 10 build tasks successful,
with invocation-only API_ORIGIN=http://localhost:3001. The first production and
verification builds both reported all 10 tasks successful but hung afterward
writing the local Turbo cache. Their verified task-owned runners were stopped;
they are not counted as command passes. Cache-writing was disabled only for the
rerun, with no repository/configuration change. Production build proof is local
compilation, not deployment or production-runtime proof.

`pnpm build --cache=local:r,remote:r`: passed, exit 0, all 10 build tasks
successful. Remote caching remained unavailable; no login or remote setup was
performed. The flag changes cache behavior only and preserves the canonical
verification environment/compile steps.

`pnpm --filter @valet/contracts --filter @valet/api --filter @valet/dashboard
typecheck`: passed, exit 0, all three affected packages completed successfully.

### Adversarial review record (vaylet-code-review)

1. **Review target:** baseline d5488b0 → this normal branch's scoped diff,
   including new files and visual evidence; no PR or remote CI action.
2. **Decisions/docs:** owner clauses 0–54; complete issue plan; DEC-081, 078,
   080, 088, 032, 052, 082; schema/security/structure/DoD; A–D records.
3. **Findings:** cached-label retry defect fixed and regression-tested. Existing
   aggregate lint/Auth ownership/Employee typecheck failures are pre-existing,
   outside T05-E scope, not repaired or counted PASS, and deferred to cumulative
   repository closure. They do not block this subtask's commit/push acceptance.
4. **Security/tenant/location:** tested actor and object scope negatives;
   persisted authority and parameterized predicates precede every history read.
5. **Retry/concurrency/DB:** read cursors and browser generations reviewed;
   shared existing authorization locking semantics retained; no new command,
   idempotency policy or migration. Cross-request frozen snapshot is not claimed.
6. **Abstraction compatibility:** actor proof reused without target-management
   coverage; no helper generalization/sentinel IDs; transaction ownership intact.
7. **Audit/privacy:** allowlisted current identity only; no cash/Task/custody/audit
   blobs, browser persistence or PII cursor. Existing authorized CA session admin
   activity recording occurs after actor proof; no new business write/audit.
8. **Downstream consumers:** selfShift and Overview source/contracts unchanged;
   independent history service does not introduce Force End/Start semantics.
9. **Architecture:** focused controller/service/query/cursor/filter modules;
   all changed authored files <300 lines and structure check passed.
10. **Test adequacy:** real HTTP/PG authority and pagination plus browser fixture
    race/budget/visual evidence; explicit live-stack/pilot/CI limits above.
11. **Scope leakage:** no T05-F/G, dependency/lockfile/config-policy change,
    protected worktree, PR, Issue write or merge. Only the owner-authorized
    existing-branch push is included in this closure.
12. **Gate evidence:** focused gates passed; aggregate baseline failures recorded
    separately. Local builds do not establish production/remote CI readiness.
13. **T05-E closure verdict:** **IMPLEMENTED / FOCUSED ACCEPTANCE PASSED** under
    the owner's closure instruction. Full repository/remote CI readiness and
    Issue #240 completion are not claimed.

## Handoff

Existing normal branch: `fix/240e-shift-history`, based on the required d5488b0
baseline. The implementation was saved in c02f0e1; this closure classification
is saved as a new intentional documentation commit with the owner-requested
message `fix(dashboard): add full staff shift history`, preserving that commit.
Push only this existing branch and verify local/remote SHA equality and clean
Git status. No PR, merge, worktree, Issue update or T05-F/G work is authorized.
Generated Next route-reference drift returned to baseline content after the
earlier build; no generated source change is included. The 64 screenshots
contain explicit fixture identities only and were not regenerated for closure.

The final local inspection against d5488b0 confirmed 113 changed files, including
38 authored TS/TSX files (maximum 253 physical lines; no changed MJS file).
Only T05-E history reads/UI/contracts/docs/tests and recorded evidence are
present. No Force End/Start, self-shift/Task/Session/cash mutation or cash
projection change, migration addition, edit to migrations 001–053, or unrelated
baseline repair is present. The only CSS addition styles history filters;
shared reference CSS, shell and Drawer primitives remain unchanged, preserving
the frozen geometry established by the completed visual evidence.

Closure performed local diff/line-count inspection, this documentation update,
scoped commit, branch push and Git SHA/status verification only. No tests,
lint/typecheck/build commands, broad suites, remote CI, timeout changes or
visual regeneration were run again. The recorded aggregate failures retain
their actual failed result and remain deferred outside this subtask.
