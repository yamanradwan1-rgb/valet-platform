# GPS-D Dashboard Shift Presence implementation evidence

Date: 2026-10-05. Repository: veletpro0-lgtm/valet-platform.

## Owner accepted auth continuity closure — VERIFIED

Starting HEAD: `2cf71a15f574e3e04d65ac69c03027ba56e70bfe`, owned branch
`codex/native-257-presence-management`. The owner technical decision on
2026-10-05 resolves the missing contract. This section supersedes all historical
BLOCKED/DECISION REQUIRED statuses below. No PR or merge is created.

### Public auth contract and authoritative source

Strict Web response: `{ accessToken, tokenType: "Bearer", accessExpiresAt,
sessionExpiresAt, staffAuthSessionId: UUID }`. Native extends this exact response
with `refreshToken`. The new required ID is the persisted `staff_auth_sessions.id`.
Login INSERT returns its new row ID; refresh UPDATE returns the ID of the exact
session locked through the credential lookup. Ordinary refresh creates no new
session. The ID is public, non-credential and non-authority. No request accepts
it as authority, no User ID is added and expiry is never used as identity.

Affected entities: StaffAuthSession and the safe feature-owned GPS-D receipt
descriptor. No ValetSession or Task/Dispatch transition changes. Existing
persisted principal/tenant/Location authorization and backend ownership remain
unchanged. No policy precedence, DB constraint/index, migration or Prisma change.
This is the explicitly accepted GPS-D MVP correction.

### Dashboard continuity and exact recovery

StaffAuthClient exposes `getStaffAuthSessionId()`. Every successful refresh still
advances sessionGeneration. Same-ID refresh preserves identityGeneration;
confirmed ID replacement advances identityGeneration and retires old requests.
Logout and definitive auth loss remove continuity normally.

PresenceIntentLifetime fences identityGeneration plus non-null session ID,
partitioned by authority, Organization and exact Company/Location surface.
The descriptor remains an explicit allowlist of mutationId, result kind,
entityId when applicable and safe create metadata. No request body, coordinates,
accuracy, employee evidence, credentials, MFA codes or exception payload is
retained; no browser persistence is added. Old UI callbacks additionally retain
the captured sessionGeneration and mounted-lifetime checks.

Only explicit Retry uses the new feature-owned recovery function. Its abort
controller survives ordinary same-session UI remount, listens for logical auth
replacement and refreshes stale credentials before the exact result GET.
PresenceApi permits this narrow signal/auth-reconciliation override only on its
fixed GET receipt method. The existing shared DashboardApiClient, protected
context, scope key and ordinary usePresenceApi fences remain unchanged.
Existing result validators check mutation, kind, entity and canonical scope.
COMMITTED clears only the matching descriptor. UNKNOWN, transient GET failure
or stale request rejection leaves it blocked. No protected POST/PUT replay.
Current actionable Review openers now honor the same mutation block as Add and
Save; read-only details and exception/domain/MFA semantics stay unchanged.

Structure: focused recovery, auth continuity tests and browser fixture modules.
The 300-line Dashboard API fixture extracted auth-response handling before new
per-login session UUID behavior. All owned authored files are at most 300 lines.
The scoped validator explicitly owns only the approved auth files. Three
pre-existing auth test files retain their original formatting only when a
byte-comparison proves the sole change is insertion of the required UUID fixture
literal; other edits still require formatting. No architecture baseline changed.

### Observed proofs

Real Nest HTTP + isolated PostgreSQL: login UUID matches the actual persisted row;
ordinary refresh returns the same UUID with different access token and one session;
same-User independent logins yield different UUIDs. Cookie B refresh reports B
when both persisted absolute expiries are deliberately equal. Native login/refresh
shares UUID meaning and preserves credential rotation. This is runtime evidence
for auth transport, not a new object-authorization/production/remote CI claim.

Chromium with deterministic mocked management/auth fixtures: UNKNOWN zone create,
then stale token at a fixed clock, explicit Retry, same-ID refresh and fresh-Bearer
exact GET COMMITTED clears the block. Exact GET UNKNOWN or HTTP 503 preserves
UNKNOWN, Add/Save/Review blocking and Retry. Every scenario has one protected
write and two exact GETs (initial reconciliation plus explicit Retry). A different
UUID during refresh purges without sending the old second receipt GET. A barrier
holds a refreshed exact GET through logout/new login for the same User: login IDs
differ, old completion does not enter new UI and no write replays. Ordinary refresh
incrementing sessionGeneration while UUID/descriptor remain stable is also unit
proved. Existing unmount, authority/lifetime, CAS and MFA race coverage passed.
No sleeps, timeout increases, skipped tests or weakened assertions.

Initial verification corrections: the first server invocation lacked the root
.env and failed database authentication; loading configured environment fixed it.
The initial new browser fixture improperly allowed cookie-free bootstrap refresh;
it now requires the established fixture cookie. The new Review-block assertion
exposed its opener gap, now fixed. API test cookie typing was corrected without
changing valid-cookie behavior. Build requires explicit API_ORIGIN; the configured
production build below passed. These failed attempts are not reported as passes.

### Executed validation

| Command / scope                                                                                                | Observed result                                                                   |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Git Bash guardian preflight                                                                                    | PASS, clean expected owned branch/HEAD                                            |
| Dashboard vitest: auth client/continuity, API client/binary, presence ID/API/validation/retained (8 files)     | PASS: 93 tests                                                                    |
| contracts vitest: staff-auth.test.ts, index.test.ts                                                            | PASS: 20 tests                                                                    |
| API owned harness: staff-auth.service.test.ts                                                                  | PASS: 5 tests                                                                     |
| API owned PostgreSQL harness: staff-auth-continuity.integration.test.ts, staff-auth-native.integration.test.ts | PASS: 14 tests                                                                    |
| Native vitest: native-auth-http.test.ts, native-telemetry-auth-correlation.test.ts                             | PASS: 11 tests                                                                    |
| employee-client vitest: native-auth-login/restore/logout/storage-matrix.test.ts                                | PASS: 38 tests                                                                    |
| Dashboard Playwright: auth-continuity, unmount, auth-races, recovery                                           | PASS: 20 tests                                                                    |
| Final Playwright after restricting the Review block to actionable rows: auth-continuity + recovery             | PASS: 10 tests                                                                    |
| Dashboard / contracts / API typecheck                                                                          | PASS, each exit 0                                                                 |
| Scoped ESLint --max-warnings=0                                                                                 | PASS; full owned-file ESLint also passes in validator                             |
| node scripts/gps-d-validation.mjs                                                                              | PASS: 78 authored / 83 owned, maximum 300 physical lines; frozen sources verified |
| Dashboard production build, API_ORIGIN=http://127.0.0.1:3000                                                   | PASS: optimized compilation, TypeScript and all 26 pages                          |
| git diff --check                                                                                               | PASS                                                                              |

Exact focused commands (from repository root except the explicitly noted API cwd):

```powershell
pnpm --filter @valet/contracts build
pnpm --filter @valet/dashboard exec vitest run src/features/administration/settings/shift-presence-id.test.ts src/features/administration/settings/shift-presence-api.test.ts src/features/administration/settings/shift-presence-validation.test.tsx src/features/administration/settings/shift-presence-retained-intent.test.ts src/lib/auth/staff-auth-client.test.ts src/lib/auth/staff-auth-continuity.test.ts src/lib/api/dashboard-api-client.test.ts src/lib/api/dashboard-api-client-binary.test.ts
pnpm --filter @valet/contracts exec vitest run src/staff-auth.test.ts src/index.test.ts
# cwd apps/api; final configured invocation passed both projects (14 + 5 tests):
pnpm exec node --env-file=../../.env ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/staff-auth-continuity.integration.test.ts test/staff-auth-native.integration.test.ts test/staff-auth.service.test.ts
pnpm --filter @valet/valet-native exec vitest run test/native-auth-http.test.ts test/native-telemetry-auth-correlation.test.ts
pnpm --filter @valet/employee-client exec vitest run src/native-auth-login.test.ts src/native-auth-restore.test.ts src/native-auth-logout.test.ts src/native-auth-storage-matrix.test.ts
pnpm --filter @valet/dashboard exec playwright test e2e/shift-presence-auth-continuity.spec.ts e2e/shift-presence-unmount.spec.ts e2e/shift-presence-auth-races.spec.ts e2e/shift-presence-recovery.spec.ts
pnpm --filter @valet/dashboard exec playwright test e2e/shift-presence-auth-continuity.spec.ts e2e/shift-presence-recovery.spec.ts
pnpm --filter @valet/dashboard typecheck
pnpm --filter @valet/contracts typecheck
pnpm --filter @valet/api typecheck
pnpm exec eslint apps/api/src/modules/auth/staff-auth-types.ts apps/api/src/modules/auth/staff-auth-token-result.ts apps/api/src/modules/auth/staff-auth.service.ts apps/api/src/modules/auth/staff-auth.transport.ts apps/api/test/staff-auth-continuity.integration.test.ts apps/api/test/staff-auth-native.integration.test.ts apps/dashboard/src/lib/auth/staff-auth-client.ts apps/dashboard/src/lib/auth/staff-auth-continuity.test.ts apps/dashboard/src/features/administration/settings/shift-presence-recovery.ts --max-warnings=0
node scripts/gps-d-validation.mjs
$env:API_ORIGIN='http://127.0.0.1:3000'; pnpm --filter @valet/dashboard build
git diff --check
```

### Scope, review and delivery

VAYLET adversarial self-review inspected the actual diff, authoritative login/
refresh call paths, strict response/request schemas, scope/result validators,
retirement and callback gates, safe descriptor allowlist and compatibility tests.
No unresolved owner behavior or broad request-fencing removal was found. Auth
security locks/transactions, credential protections and management authorization
are unchanged; no audit/history writer or data deletion is added.

New migrations: **0**. Prisma changed: **no**. Dependencies/lockfile changed: **no**.
Native production auth behavior redesign: **no**; shared Native response transport
contract changed: **yes**, the accepted additional UUID, with minimal required
response fixtures. No Native production source changed. Employee Web, GPS-C,
#266, maps and camera #262 remain untouched in this continuation. Baseline lint
and two Operations presentation failures are **unchanged**, not fixed or claimed
to pass. Broad/root scanner and unrelated suites were not run, per owner scope.
Real Google Maps runtime: **NOT VERIFIED**, historical mock-only status unchanged.
No new CI/deployment/physical-device evidence is claimed. Browser artifacts were
preserved outside Git; generated next-env path changes restored to the original.
Commit/new HEAD/push and final clean Git status are supplied in the final handoff.

### Exact files changed in this continuation (33)

- `apps/api/src/modules/auth/staff-auth-token-result.ts`
- `apps/api/src/modules/auth/staff-auth-types.ts`
- `apps/api/src/modules/auth/staff-auth.service.ts`
- `apps/api/src/modules/auth/staff-auth.transport.ts`
- `apps/api/test/staff-auth-continuity.integration.test.ts`
- `apps/api/test/staff-auth-native.integration.test.ts`
- `apps/dashboard/e2e/shift-presence-auth-continuity.spec.ts`
- `apps/dashboard/e2e/support/dashboard-api-fixture.ts`
- `apps/dashboard/e2e/support/dashboard-auth-fixture.ts`
- `apps/dashboard/e2e/support/fixture-data.ts`
- `apps/dashboard/e2e/support/presence-continuity-fixture.ts`
- `apps/dashboard/src/features/administration/settings/shift-presence-api.ts`
- `apps/dashboard/src/features/administration/settings/shift-presence-exceptions.tsx`
- `apps/dashboard/src/features/administration/settings/shift-presence-recovery.ts`
- `apps/dashboard/src/features/administration/settings/shift-presence-retained-intent.test.ts`
- `apps/dashboard/src/features/administration/settings/shift-presence-retained-intent.ts`
- `apps/dashboard/src/features/administration/settings/shift-presence-settings.tsx`
- `apps/dashboard/src/features/administration/settings/use-presence-retained-intent.ts`
- `apps/dashboard/src/features/administration/settings/use-shift-presence-mutation.ts`
- `apps/dashboard/src/lib/api/dashboard-api-client-binary.test.ts`
- `apps/dashboard/src/lib/api/dashboard-api-client.test.ts`
- `apps/dashboard/src/lib/auth/staff-auth-client.test.ts`
- `apps/dashboard/src/lib/auth/staff-auth-client.ts`
- `apps/dashboard/src/lib/auth/staff-auth-continuity.test.ts`
- `apps/valet-native/test/native-auth-http.test.ts`
- `apps/valet-native/test/native-telemetry-auth-correlation.test.ts`
- `docs/NATIVE_261_262_264_257_IMPLEMENTATION_PLAN.md`
- `docs/validation/GPS_D_IMPLEMENTATION_REPORT.md`
- `packages/contracts/src/index.test.ts`
- `packages/contracts/src/staff-auth.test.ts`
- `packages/contracts/src/staff-auth.ts`
- `packages/employee-client/src/native-auth-test-fixture.ts`
- `scripts/gps-d-validation.mjs`

## Historical auth-refresh closure audit — DECISION REQUIRED

Reviewed HEAD: `a14856c16f7bc3c8c1795cf8ac635056b1ec9ecb`, same branch
`codex/native-257-presence-management`. The remaining major defect is confirmed:
retained reconciliation identity is currently cleared on successful access-token
refresh because `PresenceIntentLifetime` fences on `sessionGeneration`, which
increments for every successful refresh.

The owner's continuation explicitly requires: “If the current public auth state
exposes no safe way to distinguish A from B, STOP and report the exact missing
contract instead of guessing.” Implementation is stopped under that condition.

### Verified contract evidence

- `packages/contracts/src/staff-auth.ts:32` and
  `apps/api/src/modules/auth/staff-auth.transport.ts:46`: the strict public web
  response contains only `accessToken`, `tokenType`, `accessExpiresAt` and
  `sessionExpiresAt`. It exposes neither a logical-session identifier nor a
  principal identity/authoritative continuity signal.
- `apps/api/src/modules/auth/staff-auth.service.ts:93`: login creates a random
  session UUID. The persisted absolute expiry is database time plus 720 hours;
  it is a deadline, not an identity. Neither the session UUID nor user ID is
  included in the web auth response.
- `apps/api/src/modules/auth/staff-auth.service.ts:194` and `:264`: refresh
  resolves the HTTP-only refresh credential's actual persisted session, rotates
  credentials on that same row and leaves `absolute_expires_at` unchanged.
  `apps/api/test/staff-auth.integration.test.ts:610` explicitly asserts unchanged
  `sessionExpiresAt` on ordinary refresh. This proves stability for ordinary
  refresh, not uniqueness or guaranteed change for session replacement.
- `packages/database/prisma/schema.prisma:612` and
  `packages/database/prisma/migrations/20260810001700_staff_authentication/migration.sql:1`:
  the session UUID and current access-token hash have unique constraints.
  `absolute_expires_at` has millisecond precision and no uniqueness constraint.
  Distinct sessions are permitted to share the same exported expiry; treating
  that deadline as a session identifier would invent a contract.
- `apps/dashboard/src/lib/auth/staff-auth-client.ts:149` and `:189`:
  `performRefresh()` preserves `identityGeneration` whenever an in-memory session
  already exists, then increments `sessionGeneration`. Logout, explicit local
  login and definitive auth loss are detectable, but a changed HTTP-only cookie
  can select another logical session/principal without the refresh response
  allowing the client to prove continuity. Checking only `identityGeneration`
  or the local method name would weaken the required replacement fence.
- `apps/api/src/modules/auth/staff-auth-credential.ts:7`: access credentials are
  random opaque values, not tokens carrying a readable session/principal claim.
  Credential rotation cannot supply the missing non-secret continuity fact.

### Exact missing contract and disposition

Dashboard needs an authoritative, non-credential logical-session continuity fact
that is stable on ordinary credential refresh and distinguishes actual logical
session/principal replacement. The current public auth state provides no such
fact. An accepted auth/transport contract and its invariants are required before
the feature can safely rebind retained descriptors and perform the requested
fresh-auth exact GET. No new response field, expiry heuristic, ignored generation
change or broad auth framework is introduced by this audit.

The desired UNKNOWN → ordinary refresh → exact GET behavior is **not fixed or
verified**. No code/test/map/#266/auth/API/contracts/database/baseline file is
changed. The only changed file in this continuation is this report. No closure
unit/browser/typecheck/lint/build pass is claimed for the unresolved fix; the
previous evidence below is historical and does not prove auth-refresh safety.
The documentation is formatted and checked with `git diff --check` before its
authorized same-branch commit/push. No PR or merge is created. The final chat
handoff supplies the report-only commit SHA and clean/remote status.

**BLOCKED — GPS-D auth-refresh closure. Not ready for final review.**

## Historical focused correction contract (previous owner continuation)

Continue from `12e307aef0320ae0936e036ec6f59d7b50cd3ddc` on the same branch.
Retain only exact reconciliation identity in feature-owned memory across UI
unmounts, fenced by staff client identity/session generations and exact authority,
Organization and Company/Location surface. No request body, coordinates, device
accuracy, exception data or credentials enter that memory. Definite rejection
clears the descriptor; uncertain writes require an exact receipt, without replay.

Use the existing Dashboard theme for explicit Google color scheme initialization
and rebuild only the map on theme changes. Keep the zone draft. The first SDK
language remains fixed for the page; display a localized reload limitation when
controls switch language, retaining LTR geography. Manual/map center replacement
clears device feedback and retires acquisition callbacks; radius-only editing
preserves informational accuracy. No API, DB, authority or domain transition
changes are needed. Correction validation evidence follows after implementation.

Historical re-review handoff for the previous three corrections; superseded by
the auth-refresh blocker above.

The owner continuation authorizes three focused corrections and preserves the
independently confirmed unrelated baseline failures. Current correction evidence
is recorded separately below. The initial implementation's broad gate failures
remain historical evidence, without suppression or out-of-scope repairs. This is
an implementation handoff for independent review, not merge/deployment approval.

## Historical correction mechanics and regression evidence

- **Unknown/unmount:** a feature-owned `WeakMap` keyed by the existing staff auth
  client holds one generation-bound lifetime. Descriptors are partitioned by
  authority, Organization, exact Location and Company/Location Settings surface.
  An explicit allowlist copies only mutation ID, result kind/entity ID and create
  flag; generations and target key supply full identity. No draft/body, coordinates,
  accuracy, exception data, credential, storage, callback action or canonical
  payload survives UI unmount. React subscribes to descriptor changes; returning
  scopes immediately block writes and offer explicit exact-result reconciliation.
  Registration precedes the protected request. Pre-dispatch auth refresh runs
  before registration, so refresh failure cannot manufacture UNKNOWN. Known
  rejections clear the matching descriptor even if the UI retired. An aborted or
  uncertain dispatched write retains it. Only a current direct success or exact
  COMMITTED receipt clears uncertainty; canonical equality never does. Old UI
  callbacks stay retired through A→B→A. Auth generation changes purge all retained
  descriptors, unsubscribe the lifetime watcher and reject retired store writes.
- **Theme/locale:** the form reads `useDashboardTheme` and passes theme to the map.
  Initialization explicitly uses `LIGHT` or `DARK`. Theme changes dispose click
  listeners, pin/circle attachments and instance listeners before rebuilding the
  map from the current unsaved draft. Google documents that color scheme is an
  initialization option that cannot be changed afterward:
  [Google color scheme](https://developers.google.com/maps/documentation/javascript/mapcolorscheme).
  Locale is passed explicitly into the first SDK load and retained as its language.
  Subsequent EN↔AR switches update all product copy and show a localized statement
  that provider labels retain the initial language until page reload. Reload is
  never automatic; the notice asks managers to resolve uncertain saves first.
  Geography stays `dir="ltr"`. Google's language is selected on the SDK script:
  [Google localization](https://developers.google.com/maps/documentation/javascript/localization).
- **Device feedback:** retirement always invalidates outstanding device callbacks.
  Manual latitude/longitude and map-center edits also clear accuracy/error/status;
  label, state and radius changes retire pending callbacks while preserving
  informational accuracy for an unchanged center. Save retires feedback and
  reopen initializes clean state. Radius is never derived from accuracy and no
  proposal automatically writes configuration.

New browser cases cover tab unmount with exact COMMITTED recovery and one POST;
route re-entry with one POST; logout/replacement after retained UNKNOWN with no
old result request/publication; definite rejection; expired-token refresh failure
before dispatch with zero writes; both initial map themes and theme rebuild with
unchanged draft; deliberately invoked retired map callbacks after rebuild/close;
Arabic-first → English SDK limitation and LTR geography; device ±12 m followed by
latitude, longitude or map replacement; radius-only preservation; reopen clearing;
and stale device error removal without autosave. The existing in-flight A→B→A
case now asserts retained UNKNOWN/write blocking, exact COMMITTED recovery, then
a new draft that the delayed original response cannot close or repaint. Its
original fresh-draft assertions are preserved. After this test strengthening,
`pnpm --filter @valet/dashboard exec playwright test e2e/shift-presence-scope.spec.ts`
with the same temporary server passes all four cases again (exit 0, 8.8 seconds).
The existing map case additionally proves English-first → Arabic limitation.

New unit coverage proves descriptor allowlisting, UI unsubscribe/re-entry,
authority/Organization/Location/surface separation, session-only and identity
replacement purge, exact-ID clearing, retired-writer rejection, and both first
SDK languages staying fixed without duplicate SDK loads. Existing MFA/CAS,
foreground, authorization, bounded paging and visual assertions remain active.

All correction gates below passed (exit 0). The first 65-case browser attempt
had 64 passes and one unavailable-map fixture failure: its old test depended on
an absent key, while this run supplied an adapter fixture key. The test now
explicitly aborts the SDK request, preserves every assertion and passes in the
clean 65-case rerun. No timeout, skip, baseline or production behavior was changed
for that test.

| Current correction command                                                     | Result                                                     |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Focused Vitest command below                                                   | PASS: 5 files, 48 tests                                    |
| Consolidated Playwright command below                                          | PASS: 65 tests, Chromium, one worker, 2.1 minutes          |
| Changed-file ESLint command below, `--max-warnings=0`                          | PASS: zero errors/warnings                                 |
| `pnpm --filter @valet/dashboard typecheck`                                     | PASS                                                       |
| `pnpm --filter @valet/contracts typecheck`                                     | PASS                                                       |
| `pnpm exec node scripts/gps-d-validation.mjs`                                  | PASS: 55 authored / 60 owned files, max 287 physical lines |
| `pnpm --filter @valet/dashboard build` with `API_ORIGIN=http://localhost:3001` | PASS: optimized compilation, TypeScript and all 26 pages   |
| `git diff --check`                                                             | PASS                                                       |

Exact commands (PowerShell; temporary dev server on port 3005 used
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=gps-d-adapter-fixture-only`; real-map adapter
cases intercept the SDK and unavailable-map case aborts it):

```powershell
pnpm --filter @valet/dashboard exec vitest run src/features/administration/settings/shift-presence-id.test.ts src/features/administration/settings/shift-presence-api.test.ts src/features/administration/settings/shift-presence-validation.test.tsx src/features/administration/settings/attendance-zone-google-sdk.test.ts src/features/administration/settings/shift-presence-retained-intent.test.ts
$env:E2E_BASE_URL='http://localhost:3005'
pnpm --filter @valet/dashboard exec playwright test e2e/shift-presence-settings.spec.ts e2e/shift-presence-recovery.spec.ts e2e/shift-presence-geolocation.spec.ts e2e/shift-presence-scope.spec.ts e2e/shift-presence-lists.spec.ts e2e/shift-presence-organization.spec.ts e2e/shift-presence-auth-races.spec.ts e2e/shift-presence-visual.spec.ts e2e/administration-settings.spec.ts e2e/administration-settings-validation.spec.ts e2e/mfa.spec.ts e2e/operations-maps.spec.ts e2e/shift-presence-map.spec.ts e2e/shift-presence-map-lifecycle.spec.ts e2e/shift-presence-location-feedback.spec.ts e2e/shift-presence-unmount.spec.ts
$files = @(git diff --name-only -- '*.ts' '*.tsx' '*.mjs' | Where-Object { $_ -ne 'apps/dashboard/next-env.d.ts' })
$newFiles = @(git ls-files --others --exclude-standard -- '*.ts' '*.tsx')
pnpm exec eslint @files @newFiles --max-warnings=0
```

The safe adapter now classifies shared-schema write validation failures as
`DashboardApiError` validation failures before dispatch, without copying raw Zod
issues. Five additional tests cover invalid create/update/set/clear/review inputs,
zero network calls and no UNKNOWN classification.

## Exact correction files relative to reviewed HEAD

- `apps/dashboard/e2e/shift-presence-location-feedback.spec.ts`
- `apps/dashboard/e2e/shift-presence-map-lifecycle.spec.ts`
- `apps/dashboard/e2e/shift-presence-map.spec.ts`
- `apps/dashboard/e2e/shift-presence-scope.spec.ts`
- `apps/dashboard/e2e/shift-presence-settings.spec.ts`
- `apps/dashboard/e2e/shift-presence-unmount.spec.ts`
- `apps/dashboard/e2e/support/presence-map-mock.ts`
- `apps/dashboard/src/features/administration/settings/attendance-zone-google-sdk.test.ts`
- `apps/dashboard/src/features/administration/settings/attendance-zone-google-sdk.ts`
- `apps/dashboard/src/features/administration/settings/attendance-zone-map.tsx`
- `apps/dashboard/src/features/administration/settings/shift-presence-api.test.ts`
- `apps/dashboard/src/features/administration/settings/shift-presence-api.ts`
- `apps/dashboard/src/features/administration/settings/shift-presence-copy.ts`
- `apps/dashboard/src/features/administration/settings/shift-presence-retained-intent.test.ts`
- `apps/dashboard/src/features/administration/settings/shift-presence-retained-intent.ts`
- `apps/dashboard/src/features/administration/settings/shift-presence-zone-form.tsx`
- `apps/dashboard/src/features/administration/settings/use-attendance-zone-location.ts`
- `apps/dashboard/src/features/administration/settings/use-presence-retained-intent.ts`
- `apps/dashboard/src/features/administration/settings/use-shift-presence-mutation.ts`
- `docs/validation/GPS_D_IMPLEMENTATION_REPORT.md`
- `scripts/gps-d-validation.mjs`

The correction changes 21 files. The complete GPS-D inventory below remains
relative to the accepted design reference. Both inventory counts include the
validation report. Current checks enforce the unchanged 300-line ceiling. Final diff review found no out-of-scope change, persistent private data, weakened authority, automatic mutation replay, timeout increase, skipped assertion, dependency or lockfile change. Independent acceptance and remote CI remain unobserved.

**REAL GOOGLE MAPS RUNTIME NOT VERIFIED**: temporary fixture key and intercepted
SDK adapter only; no live billing/key, physical device or provider proof is claimed.
Unrelated baseline lint files and Operations presentation tests/modules remain
byte-identical to the reviewed HEAD. Broad failing gates are not rerun or repaired.

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

## Historical initial implementation validation commands and exact results

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

Historical initial geolocation retirement refinement: Dashboard typecheck passes and the
8-test geolocation browser file passes again. The final production build is
repeated after this refinement and passes (exit 0). Generated Next type references and Playwright
outputs are restored/moved outside the repository before staging.

| File                                                                                         | Physical lines |
| -------------------------------------------------------------------------------------------- | -------------: |
| `.env.example`                                                                               |             87 |
| `apps/dashboard/e2e/administration-settings-validation.spec.ts`                              |            190 |
| `apps/dashboard/e2e/shift-presence-auth-races.spec.ts`                                       |            173 |
| `apps/dashboard/e2e/shift-presence-geolocation.spec.ts`                                      |            232 |
| `apps/dashboard/e2e/shift-presence-lists.spec.ts`                                            |            175 |
| `apps/dashboard/e2e/shift-presence-location-feedback.spec.ts`                                |             68 |
| `apps/dashboard/e2e/shift-presence-map-lifecycle.spec.ts`                                    |            103 |
| `apps/dashboard/e2e/shift-presence-map.spec.ts`                                              |             60 |
| `apps/dashboard/e2e/shift-presence-organization.spec.ts`                                     |             88 |
| `apps/dashboard/e2e/shift-presence-recovery.spec.ts`                                         |            232 |
| `apps/dashboard/e2e/shift-presence-scope.spec.ts`                                            |            280 |
| `apps/dashboard/e2e/shift-presence-settings.spec.ts`                                         |            168 |
| `apps/dashboard/e2e/shift-presence-unmount.spec.ts`                                          |            237 |
| `apps/dashboard/e2e/shift-presence-visual.spec.ts`                                           |            148 |
| `apps/dashboard/e2e/support/presence-data.ts`                                                |             97 |
| `apps/dashboard/e2e/support/presence-fixtures.ts`                                            |            211 |
| `apps/dashboard/e2e/support/presence-map-mock.ts`                                            |            118 |
| `apps/dashboard/src/features/administration/settings/attendance-zone-google-sdk.test.ts`     |            132 |
| `apps/dashboard/src/features/administration/settings/attendance-zone-google-sdk.ts`          |            120 |
| `apps/dashboard/src/features/administration/settings/attendance-zone-map.tsx`                |            189 |
| `apps/dashboard/src/features/administration/settings/settings-page.tsx`                      |            251 |
| `apps/dashboard/src/features/administration/settings/shift-presence-api.test.ts`             |            222 |
| `apps/dashboard/src/features/administration/settings/shift-presence-api.ts`                  |            246 |
| `apps/dashboard/src/features/administration/settings/shift-presence-copy.ts`                 |            227 |
| `apps/dashboard/src/features/administration/settings/shift-presence-errors.ts`               |             39 |
| `apps/dashboard/src/features/administration/settings/shift-presence-exception-facts.tsx`     |             46 |
| `apps/dashboard/src/features/administration/settings/shift-presence-exceptions.tsx`          |            173 |
| `apps/dashboard/src/features/administration/settings/shift-presence-feedback.tsx`            |             35 |
| `apps/dashboard/src/features/administration/settings/shift-presence-id.test.ts`              |             16 |
| `apps/dashboard/src/features/administration/settings/shift-presence-id.ts`                   |             17 |
| `apps/dashboard/src/features/administration/settings/shift-presence-list-ui.tsx`             |             70 |
| `apps/dashboard/src/features/administration/settings/shift-presence-policy-fields.ts`        |             64 |
| `apps/dashboard/src/features/administration/settings/shift-presence-policy.tsx`              |            248 |
| `apps/dashboard/src/features/administration/settings/shift-presence-readiness.tsx`           |             55 |
| `apps/dashboard/src/features/administration/settings/shift-presence-response-scope.ts`       |             82 |
| `apps/dashboard/src/features/administration/settings/shift-presence-retained-intent.test.ts` |            117 |
| `apps/dashboard/src/features/administration/settings/shift-presence-retained-intent.ts`      |             99 |
| `apps/dashboard/src/features/administration/settings/shift-presence-review-dialog.tsx`       |            165 |
| `apps/dashboard/src/features/administration/settings/shift-presence-settings.tsx`            |            235 |
| `apps/dashboard/src/features/administration/settings/shift-presence-validation.test.tsx`     |            126 |
| `apps/dashboard/src/features/administration/settings/shift-presence-zone-dialog.tsx`         |             93 |
| `apps/dashboard/src/features/administration/settings/shift-presence-zone-draft.ts`           |             58 |
| `apps/dashboard/src/features/administration/settings/shift-presence-zone-form.tsx`           |            287 |
| `apps/dashboard/src/features/administration/settings/shift-presence-zones.tsx`               |            140 |
| `apps/dashboard/src/features/administration/settings/shift-presence.module.css`              |             27 |
| `apps/dashboard/src/features/administration/settings/use-attendance-zone-location.ts`        |            112 |
| `apps/dashboard/src/features/administration/settings/use-presence-api.ts`                    |             74 |
| `apps/dashboard/src/features/administration/settings/use-presence-dialog-focus.ts`           |             33 |
| `apps/dashboard/src/features/administration/settings/use-presence-expiry.ts`                 |             47 |
| `apps/dashboard/src/features/administration/settings/use-presence-foreground.ts`             |             18 |
| `apps/dashboard/src/features/administration/settings/use-presence-retained-intent.ts`        |             45 |
| `apps/dashboard/src/features/administration/settings/use-shift-presence-mutation.ts`         |            224 |
| `apps/dashboard/src/features/audit/audit-detail-values.ts`                                   |            103 |
| `apps/dashboard/src/features/audit/audit-event-copy.ts`                                      |            277 |
| `apps/dashboard/src/features/audit/audit-event-labels.ts`                                    |             60 |
| `apps/dashboard/src/features/audit/audit-safe-details.ts`                                    |            105 |
| `docs/NATIVE_261_262_264_257_IMPLEMENTATION_PLAN.md`                                         |  documentation |
| `docs/design/GPS_D_UI_PROTOTYPE_NOTES.md`                                                    |  documentation |
| `docs/validation/GPS_D_IMPLEMENTATION_REPORT.md`                                             |  documentation |
| `scripts/gps-d-validation.mjs`                                                               |             90 |
