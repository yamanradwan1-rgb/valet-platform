# Issue #407 — Policies Studio geographic attendance map

## Repository facts discovered

Fresh `git fetch origin main` on 2026-11-01 resolved to
`08d01c9e5c47f8721cc94ae2fa508b1e7e672bf0`. The initial `work` branch was clean;
the dedicated `fix/issue-407-attendance-zones-google-map` branch starts there.
There was no local main branch to fast-forward and no pre-existing work to move.

`PoliciesStudioPage` keys `AuthorizedStudio` by `administrationScopeKey` (session,
identity, selection revision and authoritative scope). `AuthorizedScopedStudio`
also keys by Company/Location mode. `PoliciesStudioView` -> `Workspace` ->
`ReadState` -> identity-keyed `ZonesPane` consumes `StudioPresenceData`.
`studioPresenceBridge` maps `usePoliciesStudioPresence`'s scoped authoritative
reads, capabilities, zones and mutation outcomes. The hook loads every zone page
only after the selected Location policy is available. Denial clears the zone
snapshot; foreground refresh and abort/generation checks retire old reads.

`ZonesPane` currently renders `OfflineMap`: invented SVG buildings/roads,
31.95/35.91 fallback coordinates and arbitrary pixel radii. This is the source
regression, independent of #406's read contention.

## Binding requirements

Owner's #407 implementation instruction, Issues #321/#280/#266, AGENTS.md,
source-of-truth/product/engineering/security/DoD/stack/rebaseline/structure docs,
and Accepted DEC-083/099/100 govern this presentation repair. #321's approved
shell, navigation, layout, Help and forms remain frozen. #406 remains separate.
Affected entity: exact-Location ShiftPresenceZone configuration. No ValetSession,
Task/Dispatch or Shift Start/End transition, policy or database change.

## Existing implementation patterns

`AttendanceZoneMap` owns a single draft; `AttendanceZonesOverviewMap` owns saved
overlays. Composing them directly would produce two independent map instances.
Reuse their `loadGoogleMapsSdk`, `onGoogleMapsFailure`, theme/configuration and
`attendanceZoneBoundPoints` contracts in one focused Studio map runtime.
No additional SDK loader or dependency is necessary.

## LOCKED decisions

- Real Google geographic tiles; exact saved centers and 5–1000m circles.
- Map/coordinate/geolocation changes affect an unsaved draft only; explicit Save.
- Preserve typed adapter, expectedRevision, mutationId, MFA, readiness and audit.
- Optional foreground geolocation only on click; accuracy never sets radius;
  no raw device-location history or logging.
- No fabricated Location center; empty maps use a labelled world viewport.
- Retire protected geometry and callbacks on scope/session/authorization loss.

## DERIVED conclusions

One map runtime can retain authoritative saved overlays alongside a distinct
draft. Overlay synchronization and click-listener generations can be updated
without reconstructing the map on every input change. A provider failure must
detach geometry/listeners while preserving the form draft. No migration is
necessary for this rendering-only change.

## UNRESOLVED decisions

No implementation-critical product decision. Verification facts remain pending:
production configuration, deployed SHA, key/map ID restrictions and actual tile
delivery. These are evidence gates, not authority to fabricate a map.

## Risks / boundary violations

Invalid geometry, stale drafts/callbacks, provider false success, stale Location
overlays and duplicate Save are the principal failure paths. The UI must not
infer authorization loss from network failure. An explicit unavailable signal
from the existing presence snapshot will retire the map/draft on real denial.

## Proposed implementation plan

Replace OfflineMap with a localized map component plus a focused overlay/runtime
module. Remove illustrative CSS/component. Update only map-related form copy,
geometry validation and lifetime protections. Add controlled SDK regression
tests and run existing mutation/scope tests plus Dashboard/repository gates.
No new downstream domain boundary: existing presence adapter remains the consumer.

Authorization-before-mutation proof (existing unchanged backend): established
staff session -> `protectPresenceManagementAuthority` resolves persisted Location
Organization -> locks settings/lifecycle/session/member/access and checks exact
CA or LM role, active scope, entitlement and MFA -> service's protected command
wrapper -> `writePresenceZone` reads exact scoped target/revision and readiness
under configuration protection -> create/update -> safe append-only zone audit
and mutation receipt -> final session/MFA recheck -> transaction commit.
Result reads re-enter the same authority boundary before scoped disclosure.

Retry/concurrency authority remains `useShiftPresenceMutation` and server
`recordPresenceManagementMutation`/zone CAS: first explicit command may commit;
duplicate UI submissions are flight-blocked; duplicate successful mutation UUIDs
conflict; different stale writers conflict on expectedRevision; a rollback leaves
no zone/audit/receipt effect; unknown responses reconcile exact receipts under
fresh authority without replay. A retry after success requires a refreshed
canonical revision and fresh explicit intent. The map introduces no command.

## Test matrix

`PASS` below means controlled automated evidence at the stated boundary, never
actual Google tile delivery or new live-server authorization/CAS proof.

| ID | Result | Evidence / limit |
| --- | --- | --- |
| T01 | PASS | Production ZonesPane SSR and `/policies` tests contain the Google map, no illustrative component/classes. |
| T02 | PASS | Shared official loader tests, production SDK URL interception, one geographic SDK runtime. |
| T03–T04 | PASS | Constructor doubles verify exact saved centers and decimal meter radii; persisted mock result reappears after refresh. |
| T05 | PASS | ACTIVE/DISABLED circle colors/opacities and marker titles differ; selected/draft styles are separate. |
| T06 | PASS | Runtime bounds equal every circular zone's cardinal extrema; existing bounds tests include dateline/poles. |
| T07 | PASS | Empty/invalid saved lists use world viewport only, no draft coordinates; empty CA Location browser test. |
| T08–T09 | PASS | Map click updates draft fields only; no-draft/read-only clicks and retired listeners cannot write. |
| T10–T11 | PASS | Manual coordinates and radius update existing draft overlays without reconstructing map or saved geometry. |
| T12 | PASS | NaN, infinity, invalid coordinates and radii hide overlays; existing typed validation tests remain green. |
| T13 | PASS | Cancel retires draft/map/geolocation callbacks, with zero API writes. |
| T14 | PASS | One explicit Save uses existing adapter and typed mutation; browser fixture records exactly one command. |
| T15 | PASS / BLOCKED | Existing adapter test preserves exact expectedRevision; actual stale-writer PostgreSQL CAS not rerun (root DB preflight blocked). |
| T16 | PASS / BLOCKED | Synchronous duplicate Save is flight-blocked; existing server command/receipt logic unchanged. Real concurrent DB requests not exercised. |
| T17 | PASS / BLOCKED | Unknown-response mock retains draft, disables resubmit and does not invent saved geometry; real-server conflict/MFA/unknown execution remains QA work. |
| T18 | PASS | Browser fixture rereads server-owned list after Save and page refresh; no optimistic insertion into saved overlays. |
| T19–T20 | PASS | A→B→A clears saved geometry/drafts and rejects late device/map callbacks; delayed shared SDK resolves only into current map. |
| T21 | PASS / BLOCKED | Controlled 403 retires map, all overlays and editor; genuine logout/revoked-role QA and two-principal server proof unavailable. |
| T22 | PASS | Failed SDK request shows error; Retry loads via the shared loader without losing coordinates. SDK-without-tiles timeout is also covered. |
| T23 | PASS / BLOCKED | Shared loader missing-key/auth-failure tests and mounted provider-auth failure; no schematic fallback. Actual restricted production key unavailable. |
| T24–T25 | PASS | Zero geolocation calls before explicit click, denial leaves inputs usable; scope replacement retires old success callback. |
| T26–T27 | PASS / BLOCKED | Mounted production forms/map bounds tested EN/AR × Light/Dark × 320/390/768/1440, logical RTL and LTR map. Real provider appearance/labels remain unverified. |
| T28 | PASS | Runtime disposal detaches all circles/markers/listeners; retired click/tile callbacks do nothing. Retry, auth failure and scope replacement covered. |
| T29 | PASS / BLOCKED | Keyboard Retry, coordinate focus/Tab order, localized input labels and map keyboard options covered; Google native-map keyboard UI requires real provider QA. |
| T30 | PASS | Existing #321 settings save, section history, legacy route and LM scope/navigation browser tests pass; no unrelated UI source changed. |

## Files expected to change

ZonesPane, ZoneForm, zone-map.css; replace OfflineMap with focused map component,
runtime and tests. Pass existing presence availability through its UI bridge.
Keep authored files <=300 physical lines; no loader/API/schema/dependency edits.

## Explicitly out of scope

#406, operational maps, Shift enforcement, new permissions/MFA, migrations,
background tracking, redesign, merging, deployment and Issue closure.

## Ready-to-implement verdict

READY TO IMPLEMENT. Delivery readiness still requires the verification gates.

## Source implemented

- `ui/StudioZoneMap.tsx`: localized loading/error/Retry/empty/draft states;
  shared SDK failure subscription; waits for tilesloaded before ready; bounded
  20-second map completion deadline. Scope/theme-keyed layout cleanup retires
  outstanding SDK completions before another lifetime can use them. No claims
  of actual tile success from constructor completion alone.
- `ui/studio-zone-map-runtime.ts`: one Google Map, authoritative saved circles
  and markers, selected styling, separate orange square draft marker/circle,
  safe geographic bounds, validated geometry, in-place draft synchronization,
  generation-fenced draft-only map listener, complete idempotent disposal.
- `ui/ZonesPane.tsx`: replaces OfflineMap; uses current theme, scope-aware
  existing one-shot geolocation hook, synchronous Save flight guard and async
  lifetime fencing. Saved overlays continue to use authoritative list data.
- `ui/ZoneForm.tsx`: real-map EN/AR instructions, safe blank radius input,
  disabled protected fields during blocked saves; existing form/buttons/Help,
  Cancel and confirmation preserved.
- `ui/zone-map.css`: replaces fictional SVG styling with a contained geographic
  canvas (320–448px), marker/legend styles, keyboard focus; existing form/list
  rules preserved. No shell/sidebar/global token/CSS change.
- `ui/OfflineMap.tsx`: deleted. No production schematic rendering remains.
- `studio-presence-bridge.ts` / `ui/studio-types.ts`: forward existing snapshot
  unavailability to unmount protected map/editor on denial/inactive scope,
  independently of provider failure or transient network error. No permission
  or persistence semantics change.
- Tests: two focused UI/runtime Vitest files, SDK doubles, two production-route
  Playwright specifications and two focused browser fixture helpers.

## Google Maps integration

Configuration remains `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and optional
`NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`, with the repository's existing `DEMO_MAP_ID`
fallback for Advanced Markers. `loadGoogleMapsSdk` owns the sole async script,
marker library, language selection, nonce, network timeout and auth bridge.
No Maps library, Places/geocoding, loader change or dependency change.
The map's initial 0/0 zoom-2 world camera is explicitly presentation only;
it never fills a draft or acts as a Location center. Saved circles use
`attendanceZoneBoundPoints`, including the full radius, instead of fixed cities
or SVG projections. Locale changes preserve the loader's established language
and display the existing reload guidance; map geometry stays LTR in Arabic.

## Commands and observed gate results

Commands use `corepack pnpm` (pinned 10.34.5). Executor Node is v24.19.0;
repository CI uses Node 22. No install or lockfile change was required.

| Command | Result | Evidence |
| --- | --- | --- |
| Implementation-skill read-only preflight | PASS | Clean owned branch, binding files present. |
| `corepack pnpm --filter @valet/dashboard test` | PASS | Final full run: 174 files, 1,163 tests. |
| Focused `vitest run src/features/administration/policies-studio src/features/administration/settings/attendance-zone-bounds.test.ts src/lib/maps` | PASS | 12 files, 64 tests. |
| `corepack pnpm --filter @valet/dashboard lint` | PASS | ESLint, not tsc. Also passed in root lint. |
| `corepack pnpm --filter @valet/dashboard typecheck` | PASS | Final tsc run, also covered by serial root typecheck. |
| `corepack pnpm --filter @valet/dashboard build` | BLOCKED without configuration | Correctly rejects missing production API_ORIGIN. |
| `API_ORIGIN=http://127.0.0.1:3001 corepack pnpm --filter @valet/dashboard build` | PASS | Optimized Next build, route generation and production TypeScript verification; repository verification origin, no live API claim. |
| `corepack pnpm lint` | PASS | 11/11 tasks successful. |
| `corepack pnpm typecheck --concurrency=1` | PASS | 11/11 tasks successful on final run. |
| `corepack pnpm test` | BLOCKED | Safety preflight rejects the absent verified task-owned Issue215 disposable PostgreSQL target; no alternate DB used. |
| `corepack pnpm build --concurrency=1` | PASS | 10/10 build tasks successful; deterministic verification mode, not deployment. |
| `corepack pnpm architecture:check` | PASS | Existing grandfathered warnings only; changed authored files <=300 lines. |
| `corepack pnpm format:check` | FAIL (existing repository debt) | 1,995 files flagged; no unrelated formatting performed. Changed-file check recorded separately. |
| Changed-file Prettier / `git diff --check` | PASS | Every changed applicable file checked; no whitespace errors. |
| Production-route Playwright: #321 plus both #407 specs | PASS | 15 tests in final combined run, plus 2 additional delayed-SDK/no-tile timeout tests passed after addition. All provider/API data controlled. |

Earlier verification failures were corrected: effect-driven loading reset was
replaced with scope/theme-keyed state plus explicit Retry; portable Mock types
fixed test-double TS2742; an SSR assertion was corrected for static markup.
The first parallel root typecheck exited 137 under the 8GiB limit (OOM kills
observed); serial execution passed. One browser run crashed during that resource
pressure, then the full 15-test run passed. The first delayed-SDK fixture used
Location A policy for B and was correctly rejected by the existing scope guard;
the fixture now provides exact B scope. No application scope guard was changed.
The delayed-loader test also now waits for the shell's selected Location and
its authoritative zone snapshot before releasing the loader, so it does not
mistake a still-valid intermediate Location map for a stale callback.

Final additional commands:

```text
E2E_BASE_URL=http://localhost:3003 corepack pnpm --filter @valet/dashboard exec playwright test e2e/issue407-attendance-map.spec.ts e2e/issue407-map-lifetime.spec.ts e2e/issue321-policies-studio.spec.ts
# PASS: 15 tests before adding the two additional SDK lifetime cases.
E2E_BASE_URL=http://localhost:3003 corepack pnpm --filter @valet/dashboard exec playwright test e2e/issue407-map-lifetime.spec.ts --grep 'late shared SDK|without tile completion'
# PASS: 2 additional cases.
corepack pnpm --filter @valet/dashboard exec vitest run src/features/administration/policies-studio/ui/StudioZoneMap.test.tsx
# PASS: 5 presentation cases after final empty-state wording adjustment.
```

The empty-state wording is conditional on map availability, so an unavailable
provider never claims that the world view is already displayed. All modified
authored files are below the physical-line limit (largest is ZonesPane at 253).

## Real-browser Google Maps verification and screenshots

**BLOCKED — actual geographic tile delivery has not been verified.**

- Managed environment reports current enforced restricted networking, no secrets,
  no runtime variables or outbound identities. Google Maps API/tile hosts are
  outside its allowlist. No bypass was attempted.
- No authorized QA URL/session or real Maps key/map ID is available in this
  workspace. Public example configuration has blank values; actual production
  values, website/API restrictions, billing, CSP and deployed Dashboard SHA
  cannot be established from source.
- Connected local browser tab listing returned `NOT_FOUND`: desktop tunnel
  client has not been seen for 300 seconds. No local QA session was accessible.
- Official Playwright browser download was denied (403 Domain forbidden).
  Available system Chromium 154.0.8037.57 was used through local Playwright cache
  launch links for automated browser tests. This is a real headless browser
  running controlled API/SDK doubles, **not real Maps provider verification**.
- Local dev injected an explicitly noncredential fixture key solely to exercise
  the official loader's production integration. No real API credential was
  printed or committed. No mocked map screenshot is offered as delivery proof.
- Real before/after geographic screenshots: **BLOCKED / none captured**. Issue
  #407's owner screenshot description identifies the before defect but is not
  treated as a screenshot captured in this run.

QA still must verify actual tiles and saved geographic positions/radii, real
save/refresh/conflict behavior, real CA/LM/denied/revoked scope, provider key
restrictions, keyboard/native map UI, all appearance/size combinations, and
capture sanitized matched before/after screenshots. Do not deploy to obtain
that evidence under this task's explicit no-deployment instruction.

## Security and scope self-review

Review target: entire #407 branch diff against the pinned baseline, using the
VAYLET code-review skill and DEC-083/099/100/Owner's locked behavior.
No new protected write, API route, permission, MFA rule, schema, migration,
storage/logging, employee tracking or Shift/Task/ValetSession transition.
Map clicks cannot reach a command; the only map callback patches local draft
coordinates. Geolocation is still one foreground opt-in proposal; accuracy
does not set radius. Denied availability unmounts the protected editor/map;
ordinary network/provider failure retains the draft. Timers, provider failure
subscription, SDK completion, listeners, circles, markers and replaced draft
callbacks all have explicit lifetime retirement.

Existing retry/CAS and append-only audit authority is preserved, not claimed
reproven against PostgreSQL. Abstractions reuse the established provider and
geographic bounds contracts; no security-sensitive helper broadened. No new
downstream domain consumer. Authored-code size, dependency direction and scope
checked; no architecture baseline exception or lockfile change.
No unresolved source-code blocker identified in self-review. Merge verdict:
**BLOCK MERGE pending real provider QA and applicable repository gates**.
No independent human review or fresh Codex Security scan is claimed.

## Delivery status

Source implemented; automated/static verification as above. Real Google Maps
runtime and remote CI are separate outstanding evidence gates. Delivery verdict:
**BLOCKED**. Commit, push and exact remote-head verification are recorded in the
delivery response. No PR creation, merge, deployment or Issue closure is authorized
by this delivery, and none is performed.
