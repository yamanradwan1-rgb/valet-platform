# GPS-D Dashboard Shift Presence implementation evidence

Date: 2026-10-05. Repository: veletpro0-lgtm/valet-platform.

**BLOCKED — GPS-D**: the required full Dashboard lint gate fails with 9 errors
and 3 warnings in unchanged shell/scope files; the full Dashboard unit suite
fails two unchanged Operations presentation tests. Baseline reproduction is
recorded below. These failures were not suppressed or repaired outside GPS-D.
This is an implementation handoff requiring independent review, not approval.

## Git and accepted reference

- Actual fetched production main: `de617b363d3c2c9325cebde35137f419bec76eb7`,
  `fix(native): retain truthful presence recovery provenance (#257)`.
- Accepted design reference: `5e341361957c93ac8e9ae7dd99c9d361de2246a6`,
  `origin/design/257-gps-d-ui-freeze`. Verified one ahead / zero behind main;
  its diff contains only the prototype HTML and prototype notes.
- Implementation branch: `codex/native-257-presence-management`, created from
  that design reference. Variant A is the owner-selected composition.
- Final HEAD, implementation commit and matching remote SHA are supplied in the
  final chat handoff. A report cannot contain its own final commit hash without
  changing that hash. Resolve this report's commit with `git rev-parse HEAD` and
  `git ls-remote origin refs/heads/codex/native-257-presence-management`.
- Push is authorized. No PR, merge, issue closure or strict activation occurs.

## Implementation and domain boundaries

The only production surface added is one embedded Shift Presence subsection
after the existing settings panel, inside Policies & Settings. There is no new
route, Settings tab, sidebar entry or shell redesign. Company has exactly four
independent default rows. CA exact Location and LM use the same Location
composition: heading, server Readiness, policy rows, Attendance Zones, Presence
Exceptions. The existing three legacy settings panels, shell and administration
styles remain byte-identical to the accepted reference.

Affected entities are Organization presence policy, Location overrides,
AttendanceZone and PresenceException. There are no ValetSession, Task/Dispatch
or Shift transitions in this slice. Backend authorization, geometry, readiness,
approval expiry/consumption, locks, database integrity and atomic audit remain
GPS-B authority. Management review only approves/rejects the exception; it never
starts/ends a Shift, supplies employee evidence or consumes an approval.

Typed GPS-B schemas validate requests and projections. Policies preserve
Company default → Location override; explicit same-value overrides differ from
Clear. Location writes carry paired revisions and the server fingerprint.
Zones start with blank center/radius/state, accept zero coordinates and decimal
5–1000 m radius, and load exact targets before edit/enable/disable. Quick state
actions lock geometry and omit map/geolocation helpers. Lists use bounded
25-item server cursor pages, without accumulation, per-row enrichment or polling.

Exception UI displays real safe requester name/email, Location, action, reason,
status, revision and timezone-aware times. Terminal/self/cannot-review detail is
read-only. `canReview` and policy capabilities are server projections. Local
expiry is advisory: disable decisions immediately and request a bounded canonical
refresh; no local terminal state or approval authority is invented.

Four narrowly scoped audit display compatibility files add the already-published
GPS-B event/entity/detail-kind catalog so Dashboard typecheck accepts the current
shared union. No new event is emitted, and PRESENCE detail rows remain closed
instead of exposing new private fields. Normal Prettier formatting is retained.

## Public routes consumed

Company base: `/v1/staff/management/organizations/:organizationId/shift-presence`.
CA Location base adds `/locations/:locationId` to that Company base.
LM base: `/v1/staff/dashboard/locations/:locationId/configuration/shift-presence`.
The authority route families are deliberately distinct.

| Scope            | Method | Suffix                                                         | Purpose                                                   |
| ---------------- | ------ | -------------------------------------------------------------- | --------------------------------------------------------- |
| Company/Location | GET    | `/policy`                                                      | Authorized policy/readiness/capabilities                  |
| Company          | PUT    | `/policy/default`                                              | One default field                                         |
| Location         | PUT    | `/policy/override`                                             | Explicit one-field override                               |
| Location         | POST   | `/policy/override/clear`                                       | Clear one override                                        |
| Location         | GET    | `/zones?limit=25&cursor=…`                                     | Bounded zone page                                         |
| Location         | GET    | `/zones/:zoneId`                                               | Exact current target                                      |
| Location         | POST   | `/zones`                                                       | Create stable zoneId                                      |
| Location         | PUT    | `/zones/:zoneId`                                               | Edit/enable/disable with positive CAS                     |
| Location         | GET    | `/exceptions?view=PENDING\|HISTORY&limit=25&cursor=…`          | Bounded review/history page                               |
| Location         | GET    | `/exceptions/:exceptionId`                                     | Exact safe review projection                              |
| Location         | POST   | `/exceptions/:exceptionId/approve` or `/reject`                | Explicit CAS review                                       |
| Company          | GET    | `/results/:mutationId`                                         | Exact policy receipt                                      |
| Location         | GET    | `/results/:mutationId?kind=POLICY\|ZONE\|EXCEPTION&entityId=…` | Exact requested receipt; entityId only for zone/exception |

No controller, route, shared contract or generic auth/scope framework is changed.

## Map, configuration and #266

A feature-owned geographic Google Maps adapter loads the official JavaScript
SDK lazily, using direct async loading, quarterly version and only the marker
library. One Advanced Marker and one metric Circle share the same draft with
manual latitude/longitude/radius fields. Map clicks propose a center; manual
edits update the pin and circle. The geographic region stays LTR in Arabic.
Listeners, overlays and late SDK callbacks are retired when the dialog closes.
Blank Add drafts have a neutral world viewport, not a fabricated zone center.

Build-injected public configuration is documented in `.env.example`:
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and optional `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`.
No key value, credential, dependency or lockfile change is committed. Provision
the Maps JavaScript API key with website referrer and API restrictions before a
real provider run. Without a map ID the official demo map ID is used for the
Advanced Marker. Missing key, loader/network timeout and auth failure retain
manual editing and explicit map retry. No Places, geocoding, address persistence,
provider registry, operational map DTO or CoordinateCanvas is introduced.

Provider documentation used for the loading/configuration boundary:
[Google SDK loading](https://developers.google.com/maps/documentation/javascript/load-maps-js-api)
and [Google API security practices](https://developers.google.com/maps/api-security-best-practices).

#266 is an optional explicit foreground `getCurrentPosition` call, with no watch,
automatic acquisition or Save. It changes draft center only. Accuracy is
informational and never sets radius, Location authority, readiness or employee
attendance evidence. Manual edit, Save, cancel, backgrounding, scope/session
replacement and dialog retirement invalidate late callbacks. Permission denial,
unavailable/timeout/unsupported/insecure browser leaves manual entry usable.
A feature-local CSPRNG UUID-v4 fallback supports manual submissions where
secure-context `randomUUID` is absent. No Math.random identity is used.

**Real Google Maps runtime proof: NOT EXECUTED — GOOGLE MAPS KEY/ENVIRONMENT UNAVAILABLE.**
The browser adapter test intercepts the SDK with an explicit mock; it proves
component synchronization and disposal, not tiles, billing, deployment-key
restrictions or actual provider behavior.

## Mutation recovery, MFA, fencing and privacy

Every write has a new explicit mutationId; create keeps its zoneId through MFA.
One shared feature mutation coordinator retains an uncertain intent above the
dialogs. Network, malformed and ambiguous server failures use exact result GET.
UNKNOWN remains UNKNOWN even when the canonical value equals the draft. It
blocks every duplicate/change after dismissal. Failed lookup retains the lock;
only an exact validated COMMITTED receipt clears it. Recovery never repeats the
write. Result scope, kind, entity and mutation identity are checked before display.

Known MFA_REQUIRED uses the existing exact-session ceremony. Assurance rereads
the exact target/current context, then requires a new explicit submission; it
never replays the old protected request. CAS conflict displays previous saved,
current server and draft values/revisions with an explicit review/reapply step.
Focused foreground reads refresh policy/lists and the currently open exact
target. Transient same-scope failures retain drafts with writes disabled;
authorization loss conceals protected data.

The subsection is keyed by the existing full administration lifetime: identity,
session, selection revision, authority, Organization, Location and Company versus
Location surface. Abort controllers and live guards retire old reads/writes,
result/MFA callbacks and focus restoration. Preflight auth reconciliation checks
the captured identity/session before dispatch. A→B→A creates a fresh lifetime;
resource ID equality cannot resurrect an old callback. The existing API client
handles mutation 401 refresh without replay, and session replacement retires the
feature intent.

Manager device proposal/accuracy stays in transient form memory until an explicit
zone Save. Only the proposed draft center and informational accuracy appear in
the editor; there is no separate manager fix/history. No employee fix, access
token, evidence digest, operation/challenge selector or opaque requester identity
is displayed/logged/persisted by this feature. Payloads contain only intentional
zone configuration and accepted correlation/CAS fields.
No localStorage/sessionStorage, analytics or telemetry is added for coordinates.

## Validation commands and exact results

| Command / evidence                                                                                                           | Exact result                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `git fetch origin`; main/design SHAs and `git rev-list --left-right --count origin/main...origin/design/257-gps-d-ui-freeze` | Main/design match the recorded SHAs; design 0 main-only / 1 design-only; only the two design docs differ |
| `pnpm --filter @valet/dashboard typecheck`                                                                                   | PASS, exit 0                                                                                             |
| `pnpm --filter @valet/contracts typecheck`                                                                                   | PASS, exit 0                                                                                             |
| `pnpm --filter @valet/dashboard lint`                                                                                        | FAIL, exit 1: 9 errors / 3 warnings, unchanged baseline files below                                      |
| `pnpm --filter @valet/dashboard test`                                                                                        | FAIL, exit 1: 84 files passed / 2 failed; 646 tests passed / 2 failed (648 total)                        |
| Focused Vitest command below                                                                                                 | PASS, exit 0: 4 files, 36 tests                                                                          |
| Consolidated Playwright command below                                                                                        | PASS, exit 0: 52 tests, Chromium, one worker                                                             |
| Separate Google adapter browser mock                                                                                         | PASS, exit 0: 1 test; explicitly mocked SDK, not real Google proof                                       |
| Isolated main visual capture                                                                                                 | PASS, exit 0: 8 actual main Dashboard visual baseline cases                                              |
| Candidate visual/focus matrix                                                                                                | PASS: 8 of the consolidated 52 cases; EN/AR, light/dark, 1440×900 and 480×900                            |
| `pnpm exec node scripts/gps-d-validation.mjs`                                                                                | PASS, exit 0: 48 authored files / 53 owned files; maximum 284 source/test lines                          |
| `pnpm --filter @valet/dashboard build` with `API_ORIGIN=http://localhost:3001`                                               | PASS, exit 0: optimized compilation, TypeScript and all 26 pages                                         |

Focused unit command:

```powershell
pnpm --filter @valet/dashboard exec vitest run src/features/administration/settings/shift-presence-api.test.ts src/features/administration/settings/shift-presence-validation.test.tsx src/features/administration/settings/attendance-zone-google-sdk.test.ts src/features/administration/settings/shift-presence-id.test.ts
```

Consolidated browser command:

```powershell
pnpm --filter @valet/dashboard exec playwright test e2e/shift-presence-settings.spec.ts e2e/shift-presence-recovery.spec.ts e2e/shift-presence-geolocation.spec.ts e2e/shift-presence-scope.spec.ts e2e/shift-presence-lists.spec.ts e2e/shift-presence-organization.spec.ts e2e/shift-presence-auth-races.spec.ts e2e/shift-presence-visual.spec.ts e2e/administration-settings.spec.ts e2e/administration-settings-validation.spec.ts e2e/mfa.spec.ts e2e/operations-maps.spec.ts
```

The separate map adapter proof used a temporary dev process on port 3005 with
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=fixture-only`; `E2E_BASE_URL=http://localhost:3005`
and `pnpm --filter @valet/dashboard exec playwright test e2e/shift-presence-map.spec.ts`.
The test intercepts the SDK URL and provides its own mock. That process was stopped.

Additional checks: normal `pnpm exec prettier --write` on owned source/tests;
scoped `pnpm exec eslint` with `--max-warnings=0`; `git diff --check`; and unchanged
legacy source comparison. The scoped gate reuses the repository's physical-line
and import policy helpers without traversing excluded source trees.

Browser coverage includes Company four-row/no-location composition, shared
CA/LM Location order, inheritance vs same-value override vs Clear, bounds/zero/
decimal validation, closed strict feedback, safe approval/history, all terminal
statuses, exact enable/disable reads, bounded cursor pages, CAS comparisons,
uncertain create after dismissal, repeated failed exact receipt lookup, MFA
explicit resubmission and focus restoration, scope A→B→A, Organization A→B→A,
logout/identity replacement with delayed success/error/result, mutation 401
without replay, session replacement with delayed MFA, foreground target/CAS
refresh, transient read failure versus denial, one-shot/manual/cancel/background
geolocation retirement, controlled device failures and insecure manual fallback.

Initial integration test failures were corrected without weakening assertions:
legacy validation fixtures now supply the new authorized subsection projection;
scope fixtures keep Location subscription/discovery responses distinct; refresh
assertions measure the increment after initial login; and copy expectations match
the localized production message. A foreground-test assertion failure held a
fixture barrier; its test now releases that barrier in `finally`. One overlapping
validation run was interrupted and replaced by the sequential 52-test run above.
No timeout increase, test skip, baseline fix or provider proof substitution was used.

### Reproduced baseline failures

All five full-lint files match main (empty Git diff):
`src/components/foundation/selected-management-shell-transition.ts`,
`src/components/foundation/selected-management-shell.tsx`,
`src/components/scope/location-switch-menu.tsx`,
`src/components/scope/use-location-switch-epoch-guard.ts` and
`src/components/scope/use-location-switcher.ts` under `apps/dashboard`.
Running ESLint `lintText` on each exact `git show de617b…:<path>` source with the
current unchanged repository ESLint configuration reproduces **9 errors and
3 warnings**. They concern render ref access, synchronous effect state updates
and missing hook dependencies. This diagnostic reproduction reports counts;
the full lint command is the failing gate, not the diagnostic wrapper's exit.

An isolated archive of actual main's Dashboard/shared dependencies also
reproduces both failing Operations tests with:

```powershell
pnpm --filter @valet/dashboard exec vitest run src/features/operations/operations-presentation.test.ts src/features/operations/live-operations/live-operations-presentation.test.ts
```

Result: **2 failed / 14 passed (16 total)**, exit 1. At line 98 the first test
expects `Lina Haddad` but receives `Assigned`; at line 113 the second expects
`Assigned` but receives `Lina Haddad`. Both tests and their presentation modules
are unchanged from main. GPS-D does not repair this unrelated disagreement.

### Visual baseline and artifacts

The baseline runs actual main Dashboard source in an isolated temporary archive
containing only Dashboard and its shared dependencies; no Employee Web source
was archived/read. An external-runner Turbopack filesystem root adjustment permits
the existing node_modules junctions; no production source is altered in that
baseline. Frozen-region comparisons cover DOM, geometry and computed styles for
sidebar, topbar, title, tabs and every legacy row. Only generated CSS-module path
hashes are normalized between checkouts. No semantic markup/style/geometry
difference is normalized away. All eight cases pass; focused tables may scroll
internally while document-level horizontal overflow stays absent.

Keyboard checks cover label/invalid field focus, dialog/footer viewport bounds,
tab wrapping, Escape and opener/section restoration; numeric/code/map direction
stays LTR in Arabic. Desktop EN/light and mobile AR/dark captures were visually
inspected. Captures include baseline/candidate, scrolled section and Add Zone
dialog for each case: **32 PNGs plus 8 baseline JSON files**, copied to
`C:/Users/LP/.codex/visualizations/2026/10/05/01a10c8e-5346-7a10-a667-93420e6061a8/gps-d`.
This proves the tested frozen regions; it is not blanket pixel equivalence.
Local command logs are in `C:/Users/LP/AppData/Local/Temp/vaylet-gps-d-*.log`.

## Evidence limits and review disposition

Self-review compares production main plus the accepted design layer. It covers
Variant A, shared CA/LM composition, separate public routes, capability/response
scope checks, no local readiness authority, exact UNKNOWN recovery, no protected
replay, CAS/MFA/foreground fences, bounded lists, map/manual draft sharing, #266
privacy, source size and excluded ownership. It is not independent acceptance.

The root architecture scanner was not invoked because it can traverse excluded
Employee Web source. The design spike records the existing root failure
`packages/employee-client/src/employee-shift-presence-local-provenance.test.ts:
window violates portable Employee client global boundary`; GPS-D does not
reproduce or repair that excluded-tree issue. A changed-file architecture/import,
line-count, format, lint, diff and frozen-source gate is used instead. It is not
a green whole-repository architecture claim.

CI: **NOT OBSERVED**. Browser evidence uses real Dashboard React in Chromium with
typed API fixtures. No real manager↔employee/backend/device shift workflow is
proved here; server lock/race/authorization guarantees remain predecessor proof.
No production deployment, live Google key, physical Android/iOS, APK build,
camera causal acceptance, #262 fix, retention-operation proof or strict rollout
activation is claimed. Review coverage is specific tested schedules, not all
possible interleavings. Browser zoom/assistive-technology/physical mobile testing
is not claimed.

| Excluded area                             | GPS-D change/read status                                            |
| ----------------------------------------- | ------------------------------------------------------------------- |
| DB migrations                             | **0 added/modified**                                                |
| Prisma                                    | **No**                                                              |
| API/server implementation                 | **No change**; public controllers inspected for route compatibility |
| Native                                    | **No change**; no GPS-D Native implementation inspection            |
| Portable employee client                  | **No change**                                                       |
| Employee Web / apps/valet                 | **Not read; not changed**                                           |
| Dependencies / lockfile                   | **No change**; SDK uses an owned direct loader                      |
| ValetSession/Task/Shift/audit persistence | **No change**                                                       |

## Exact changed files and physical line counts

The inventory below is relative to the accepted design reference. Its HTML is
already in branch history and unchanged by GPS-D. Counts include blank/comment
lines, using the repository physical-line helper; all authored source/tests/tools
are at most 300 lines.

Final geolocation retirement refinement: Dashboard typecheck passes and the
8-test geolocation browser file passes again. The final production build is
repeated after this refinement and passes (exit 0). Generated Next type references and Playwright
outputs are restored/moved outside the repository before staging.

| File                                                                                     | Physical lines |
| ---------------------------------------------------------------------------------------- | -------------: |
| `.env.example`                                                                           |             87 |
| `apps/dashboard/e2e/administration-settings-validation.spec.ts`                          |            190 |
| `apps/dashboard/e2e/shift-presence-auth-races.spec.ts`                                   |            173 |
| `apps/dashboard/e2e/shift-presence-geolocation.spec.ts`                                  |            232 |
| `apps/dashboard/e2e/shift-presence-lists.spec.ts`                                        |            175 |
| `apps/dashboard/e2e/shift-presence-map.spec.ts`                                          |            106 |
| `apps/dashboard/e2e/shift-presence-organization.spec.ts`                                 |             88 |
| `apps/dashboard/e2e/shift-presence-recovery.spec.ts`                                     |            232 |
| `apps/dashboard/e2e/shift-presence-scope.spec.ts`                                        |            232 |
| `apps/dashboard/e2e/shift-presence-settings.spec.ts`                                     |            165 |
| `apps/dashboard/e2e/shift-presence-visual.spec.ts`                                       |            148 |
| `apps/dashboard/e2e/support/presence-data.ts`                                            |             97 |
| `apps/dashboard/e2e/support/presence-fixtures.ts`                                        |            211 |
| `apps/dashboard/src/features/administration/settings/attendance-zone-google-sdk.test.ts` |            114 |
| `apps/dashboard/src/features/administration/settings/attendance-zone-google-sdk.ts`      |            110 |
| `apps/dashboard/src/features/administration/settings/attendance-zone-map.tsx`            |            173 |
| `apps/dashboard/src/features/administration/settings/settings-page.tsx`                  |            251 |
| `apps/dashboard/src/features/administration/settings/shift-presence-api.test.ts`         |            202 |
| `apps/dashboard/src/features/administration/settings/shift-presence-api.ts`              |            232 |
| `apps/dashboard/src/features/administration/settings/shift-presence-copy.ts`             |            223 |
| `apps/dashboard/src/features/administration/settings/shift-presence-errors.ts`           |             39 |
| `apps/dashboard/src/features/administration/settings/shift-presence-exception-facts.tsx` |             46 |
| `apps/dashboard/src/features/administration/settings/shift-presence-exceptions.tsx`      |            173 |
| `apps/dashboard/src/features/administration/settings/shift-presence-feedback.tsx`        |             35 |
| `apps/dashboard/src/features/administration/settings/shift-presence-id.test.ts`          |             16 |
| `apps/dashboard/src/features/administration/settings/shift-presence-id.ts`               |             17 |
| `apps/dashboard/src/features/administration/settings/shift-presence-list-ui.tsx`         |             70 |
| `apps/dashboard/src/features/administration/settings/shift-presence-policy-fields.ts`    |             64 |
| `apps/dashboard/src/features/administration/settings/shift-presence-policy.tsx`          |            248 |
| `apps/dashboard/src/features/administration/settings/shift-presence-readiness.tsx`       |             55 |
| `apps/dashboard/src/features/administration/settings/shift-presence-response-scope.ts`   |             82 |
| `apps/dashboard/src/features/administration/settings/shift-presence-review-dialog.tsx`   |            165 |
| `apps/dashboard/src/features/administration/settings/shift-presence-settings.tsx`        |            235 |
| `apps/dashboard/src/features/administration/settings/shift-presence-validation.test.tsx` |            126 |
| `apps/dashboard/src/features/administration/settings/shift-presence-zone-dialog.tsx`     |             93 |
| `apps/dashboard/src/features/administration/settings/shift-presence-zone-draft.ts`       |             58 |
| `apps/dashboard/src/features/administration/settings/shift-presence-zone-form.tsx`       |            284 |
| `apps/dashboard/src/features/administration/settings/shift-presence-zones.tsx`           |            140 |
| `apps/dashboard/src/features/administration/settings/shift-presence.module.css`          |             27 |
| `apps/dashboard/src/features/administration/settings/use-attendance-zone-location.ts`    |            108 |
| `apps/dashboard/src/features/administration/settings/use-presence-api.ts`                |             74 |
| `apps/dashboard/src/features/administration/settings/use-presence-dialog-focus.ts`       |             33 |
| `apps/dashboard/src/features/administration/settings/use-presence-expiry.ts`             |             47 |
| `apps/dashboard/src/features/administration/settings/use-presence-foreground.ts`         |             18 |
| `apps/dashboard/src/features/administration/settings/use-shift-presence-mutation.ts`     |            218 |
| `apps/dashboard/src/features/audit/audit-detail-values.ts`                               |            103 |
| `apps/dashboard/src/features/audit/audit-event-copy.ts`                                  |            277 |
| `apps/dashboard/src/features/audit/audit-event-labels.ts`                                |             60 |
| `apps/dashboard/src/features/audit/audit-safe-details.ts`                                |            105 |
| `docs/design/GPS_D_UI_PROTOTYPE_NOTES.md`                                                |  documentation |
| `docs/NATIVE_261_262_264_257_IMPLEMENTATION_PLAN.md`                                     |  documentation |
| `docs/validation/GPS_D_IMPLEMENTATION_REPORT.md`                                         |  documentation |
| `scripts/gps-d-validation.mjs`                                                           |             90 |
