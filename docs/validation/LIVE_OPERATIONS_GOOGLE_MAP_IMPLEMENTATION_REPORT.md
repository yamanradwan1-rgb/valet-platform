# Live Operations Google Map Implementation Report

Status: **IMPLEMENTED AND VALIDATED**
Date: 2026-10-06
Repository: `veletpro0-lgtm/valet-platform`

## Baseline and Git

- Planning baseline / current implementation baseline: `origin/main` = `bbfa9c0206c65a3269a1c94dad99afc65b812dd3`.
- Approved plan commit: `2168c1e234aa415b8d90b39120da479e52c3b986`.
- Implementation branch: `feat/live-operations-google-map`.
- Validated implementation code SHA: `1efdd09792be8c71afa79aefe0244c384917d3e4`.
- The implementation commit is exactly one commit after the approved planning commit. This validation report is committed separately after validation so it can name the immutable implementation SHA above; therefore branch HEAD after the report-only commit is expected to differ from the implementation code SHA.
- No merge and no pull request were created by this task.

## Exact implementation files changed

Implementation commit `1efdd09792be8c71afa79aefe0244c384917d3e4` changes exactly these 23 Dashboard files:

1. `apps/dashboard/e2e/live-operations-google-map-visual.spec.ts` — added exact six-case baseline/candidate freeze harness.
2. `apps/dashboard/e2e/md-r07-map-races.spec.ts` — current topbar Location-switch selector only; race assertions unchanged.
3. `apps/dashboard/e2e/operations-google-map-authority.spec.ts` — added Google-primary CA/Supervisor/LM authority proof.
4. `apps/dashboard/e2e/operations-google-map.spec.ts` — added primary Google renderer, fallback, camera, theme, lifecycle and late-callback proof.
5. `apps/dashboard/e2e/support/operations-google-map-mock.ts` — added focused Google runtime mock.
6. `apps/dashboard/e2e/support/presence-map-mock.ts` — updated callback namespace for the shared loader.
7. `apps/dashboard/e2e/task01-map-async-race.spec.ts` — current topbar Location-switch selector only; mutation race assertion unchanged.
8. `apps/dashboard/src/features/administration/settings/attendance-zone-google-sdk.test.ts` — removed after loader extraction.
9. `apps/dashboard/src/features/administration/settings/attendance-zone-google-sdk.ts` — removed after loader extraction.
10. `apps/dashboard/src/features/administration/settings/attendance-zone-map.tsx` — switched to the shared loader/types with no Shift Presence UX change.
11. `apps/dashboard/src/features/operations/maps/maps-page.tsx` — replaces only the central `CoordinateCanvas` renderer with `OperationalGoogleMap`; existing page composition/data authority remains outside the renderer.
12. `apps/dashboard/src/features/operations/maps/maps-reference.module.css` — adds only map-viewport/provider/marker styles inside the existing surface geometry.
13. `apps/dashboard/src/features/operations/maps/operational-google-map-config.test.ts` — missing key/Map ID configuration proof.
14. `apps/dashboard/src/features/operations/maps/operational-google-map-config.ts` — narrow configuration predicate.
15. `apps/dashboard/src/features/operations/maps/operational-google-map-runtime.test.ts` — overlay identity/cleanup/theme-camera tests.
16. `apps/dashboard/src/features/operations/maps/operational-google-map-runtime.ts` — imperative Google map/marker/polygon/camera runtime.
17. `apps/dashboard/src/features/operations/maps/operational-google-map.tsx` — React lifecycle/provider/fallback boundary.
18. `apps/dashboard/src/features/operations/maps/operational-map-model.test.ts` — projection/privacy/camera model tests.
19. `apps/dashboard/src/features/operations/maps/operational-map-model.ts` — pure live/point/polygon/camera projection.
20. `apps/dashboard/src/features/operations/operations-copy.ts` — EN/AR provider loading/unavailable/language copy used only inside the map viewport.
21. `apps/dashboard/src/lib/maps/google-maps-sdk-ownership.test.ts` — proves Attendance and Operations share the one loader owner.
22. `apps/dashboard/src/lib/maps/google-maps-sdk.test.ts` — shared loader lifecycle/auth/single-flight/language tests.
23. `apps/dashboard/src/lib/maps/google-maps-sdk.ts` — shared narrow Dashboard Maps JavaScript SDK loader.

This report is the only additional file in the validation-only follow-up commit.

## Code volume and source-size policy

Implementation diff volume, excluding this report:

- Production source/CSS: **865 added / 136 deleted lines**.
- Tests/support: **1457 added / 135 deleted lines**.
- Total implementation commit: **2322 insertions / 271 deletions**.

Key authored file physical line counts at the validated implementation SHA:

- `operations-google-map.spec.ts`: 300 lines.
- `maps-page.tsx`: 279 lines.
- `operational-google-map.tsx`: 209 lines.
- `operational-google-map-runtime.ts`: 223 lines.
- `operational-map-model.ts`: 183 lines.

The repository 300-line architecture policy did not report any violation in a changed implementation file.

## Google loader architecture

`apps/dashboard/src/lib/maps/google-maps-sdk.ts` is now the single Dashboard owner of direct Maps JavaScript API loading. It keeps the existing no-dependency direct script model and owns only provider infrastructure:

- one page-global in-flight load;
- generated callback namespace;
- CSP nonce propagation;
- API key input;
- first-loaded SDK language;
- 15-second timeout and network retry;
- one owned `gm_authFailure` bridge with current failure subscribers;
- structural Google map/marker/polygon/bounds/listener types.

The loader gives the pending `loading` promise priority over an early `window.google` global. This closes a real race found during A→B→A validation: Google may expose globals before invoking the requested ready callback, and a later scope must still wait for that same pending callback rather than constructing a runtime early.

`google-maps-sdk-ownership.test.ts` proves both `AttendanceZoneMap` and `OperationalGoogleMap` import this same loader, only this file owns the Maps JavaScript URL and `gm_authFailure`, and the previous Attendance-specific loader no longer exists.

There is no generic provider registry, Mapbox abstraction, new package, or new credential.

## Shift Presence regression status

`AttendanceZoneMap` retains its existing ownership and behavior: center marker, radius Circle, click-to-propose-center, manual fallback, theme rebuild, EN/AR behavior, `dir="ltr"` geography, provider-language limitation, failure/retry, and cleanup.

Configured mocked-provider browser regression after the final shared-loader race fix:

- `e2e/shift-presence-map.spec.ts`
- `e2e/shift-presence-map-lifecycle.spec.ts`

Result: **4/4 PASS**.

No Shift Presence persistence, authority, circle semantics, layout or UX was redesigned.

## Operations renderer architecture

The current `/maps-zones` data pipeline remains in `MapsPage`. `OperationalGoogleMap` does not fetch protected data and does not become an authority layer.

The feature is split into three focused layers:

- `operational-map-model.ts`: pure projection from already-authorized current live/setup props to marker/polygon descriptors and deterministic camera intent.
- `operational-google-map-runtime.ts`: Google Map construction, `AdvancedMarkerElement` reconciliation, `Polygon` reconciliation, camera fit/snapshot/restore and cleanup.
- `operational-google-map.tsx`: loader/config state, generation fencing, theme rebuild, language notice, provider failure, Retry and `CoordinateCanvas` fallback.

Current reads and mutations remain owned by `useOperationsRead()`, `readLiveMap()`, `useMapSetupState()` and `useMapSetupMutation()`.

No polling, WebSocket or provider-driven API fetch was added.

## Live marker behavior

- One `AdvancedMarkerElement` is rendered for every current-page item whose `position` is non-null.
- Marker position is exactly `position.latitude` / `position.longitude`.
- `position === null` creates no marker and remains represented in the existing textual Live panel.
- Stable `taskId` is used only as an in-memory reconciliation key; it is not copied to visible/accessibility provider content.
- Existing tasks update marker position/status/title in place on ordinary same-page Refresh.
- New tasks create markers; removed tasks are detached and listeners cleared.
- LIVE and STALE differ structurally as well as by color: LIVE uses a solid marker treatment; STALE uses a dashed/outlined treatment.
- Marker accessible/title copy reuses `liveMapMarkerLabel()` and focused tests prove raw task/tracking/valet/membership/vehicle IDs and coordinate text are absent.
- No InfoWindow, task action or map-driven operational workflow was added.

## LM point and polygon behavior

Existing LM-authorized setup data is rendered geographically without changing authoring:

- `LocationMapPoint` → `AdvancedMarkerElement` at exact lat/lng.
- `LocationMapArea.vertices` → Google `Polygon` preserving ordered vertices.
- active/inactive, point kind, area purpose and level metadata are preserved in the feature model and existing Setup panel/dialog copy.
- `RESTRICTED` uses the existing danger semantic; normal operational polygons use the existing Dashboard blue semantic; inactive data is de-emphasized neutrally.
- existing Add/Edit Point, Add/Edit Area, manual lat/lng, vertices textarea and Parking Zone association remain unchanged.
- no map click creation, dragging, drawing tools, vertex handles, Places or geocoding was added.

Operational areas remain separate from Shift Presence attendance circles and persistence.

## Camera and levels

Camera epochs are keyed from current scope + mode + current live cursor page:

- multiple rendered coordinates → bounds fit with responsive padding and a maximum zoom cap;
- one rendered coordinate → bounded operational zoom;
- no rendered geography → neutral world `{lat: 0, lng: 0}` / world zoom;
- ordinary same-page Refresh reconciles overlays without refitting, preserving operator pan/zoom;
- cursor, scope/Location and Live↔Setup changes create a new fit epoch;
- theme rebuild snapshots and restores the current camera.

LM Live initial fit waits for current live plus LM setup reads, so points/polygons that are already part of current product presentation are included in first authoritative fit.

`levelLabel` remains metadata. All currently authorized levels may overlap geographically. No level filter, indoor map, z-axis or floor inference was added.

## Fallback behavior

Google is primary when both existing Dashboard variables are configured:

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`

Safe fallback conditions include missing key, missing Map ID, script/network failure, timeout, Google auth failure, construction failure and post-ready provider/runtime sync failure.

On failure, the existing `CoordinateCanvas` is rendered inside the same viewport with explicit EN/AR provider-unavailable copy and Retry. The page does not present the fallback as Google or as a street map. Live/Setup panels, dialogs, pagination and manual setup remain usable.

Post-ready provider failure handling was tested by making marker position update throw synchronously: the runtime tears down markers/listeners/provider DOM and moves to the fallback instead of allowing an uncaught renderer exception.

## Authority proof

Authority was not expanded.

New Google-primary authority spec result: **3/3 PASS**:

- Company Admin renders current live markers and performs zero Map Setup point/area reads.
- Supervisor renders current live markers and performs zero Map Setup point/area reads/controls.
- LM with `dashboardAccess=false` is forced to Setup, renders LM-authorized point/polygon geometry, and performs **zero live-map requests**.

Existing Operations authority regression also passed inside the 16-test regression set, including CA exact-Location behavior, LM entitlement behavior, Supervisor server denial and Employee exclusion.

`trackingEnabled=false` semantics were not changed; authorization remains separate from whether the live endpoint returns any active tracked items.

## Scope / session / race proof

The renderer checks generation/mount state after asynchronous SDK load. Teardown removes/detaches markers, point overlays, polygons, provider listeners/failure subscribers and owned provider DOM. Theme rebuild has its own generation and camera preservation.

The shared-loader early-global race described above was found and fixed during validation.

Google-specific adapter suite result: **7/7 PASS**, including:

- exact live/setup geography;
- same marker identity updates;
- current-page camera epochs;
- theme camera preservation;
- network fallback + explicit Retry;
- post-ready provider sync failure teardown/fallback;
- late provider callback A→B→A: retired `FIRST-A` / `MIDDLE-B` runtime cannot publish a marker; the only attached marker is `FINAL-A`.

Existing focused Operations regression set result: **16/16 PASS**, including:

- stale first-A success and failure fencing;
- cursor from A never crossing into B;
- pending live read after logout;
- pending LM setup read after scope replacement;
- pending LM point mutation after A→B;
- session/logout setup fencing;
- same-scope mutation reconciliation without replay;
- async A→B→A setup write fencing.

Two legacy race-test helpers were updated only to use the current in-place topbar `Select location` listbox introduced before this feature; no race assertion was weakened.

## Privacy proof

No backend or privacy contract changed. Exact coordinates remain current authorized browser data and are supplied only to Google map rendering primitives needed to draw markers/paths.

The implementation adds no localStorage/sessionStorage/IndexedDB coordinate persistence, GPS analytics payload, telemetry payload, route history, console coordinate logging, or new protected identifier display.

Evidence:

- projection tests assert raw task, assignee membership, tracking-session, valet-session, vehicle IDs and raw coordinate strings are absent from live marker labels;
- `md-r07-map-privacy-budget.spec.ts` passed, proving map data stays memory-only and logout removes protected DOM;
- retired scope/provider callbacks are fenced as described above.

## UI FREEZE evidence

The baseline was captured from a detached worktree at exact `origin/main` SHA `bbfa9c0206c65a3269a1c94dad99afc65b812dd3`, before comparing the implementation candidate.

The dedicated freeze harness snapshots **23 frozen elements** per case outside the provider-rendered geographic interior:

`sidebar`, `topbar`, `page`, `title`, `subtitle`, `toolbar`, `scope`, `levels`, `modes`, `refresh`, `grid`, `surface`, `surface-header`, `surface-status`, `surface-meta`, `legend`, `live-panel`, `setup-panel`, `setup-add-point`, `point-dialog`, `point-dialog-header`, `point-dialog-body`, `point-dialog-footer`.

For each element it compares bounding-box geometry plus computed layout/style facts including display/position, typography, color/background, radius, padding, margin, gap, grid columns, flex direction, alignment and justification. The provider viewport interior itself is not used for equality because its tiles/labels/markers are the allowed delta.

Exact visual matrix, all at height 900:

| Locale / direction | Theme | Viewport | origin/main baseline | Candidate equality |
| --- | --- | ---: | --- | --- |
| EN / LTR | Light | 1440×900 | PASS | PASS |
| EN / LTR | Dark | 1440×900 | PASS | PASS |
| AR / RTL | Light | 1440×900 | PASS | PASS |
| AR / RTL | Dark | 1440×900 | PASS | PASS |
| EN / LTR | Light | 480×900 | PASS | PASS |
| AR / RTL | Dark | 480×900 | PASS | PASS |

Baseline: **6/6 PASS**. Candidate exact comparison against those baseline JSON snapshots: **6/6 PASS**.

The repository's existing `md-r07-map-visual.spec.ts` + `operations-visual-freeze.spec.ts` also passed after implementation: **5/5 PASS**, including the existing Setup dialog geometry checks.

### UI FREEZE VERDICT

**PASS — no surrounding UI delta**

Only the content inside the existing central map viewport changes from provider-neutral coordinate SVG content to Google geographic content when configured. The map host keeps the same allocated 31.875 rem desktop / 26 rem narrow geometry. Provider loading/failure/language notices live inside that viewport.

## Validation commands and results

### Shared loader / Operations unit tests

```text
pnpm --filter @valet/dashboard exec vitest run \
  src/lib/maps/google-maps-sdk.test.ts \
  src/lib/maps/google-maps-sdk-ownership.test.ts \
  src/features/operations/maps/operational-map-model.test.ts \
  src/features/operations/maps/operational-google-map-config.test.ts \
  src/features/operations/maps/operational-google-map-runtime.test.ts
```

Result: **5 files / 19 tests PASS**.

### Shift Presence Google regression

Run with dummy browser Maps config and intercepted SDK request:

```text
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=fixture-key
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=fixture-map-id
pnpm --filter @valet/dashboard exec playwright test \
  e2e/shift-presence-map.spec.ts \
  e2e/shift-presence-map-lifecycle.spec.ts
```

Result: **4/4 PASS**.

### Operations Google adapter + Google authority

Run against an isolated Dashboard dev server built with the same dummy browser config; Google SDK request is intercepted by the local mock:

```text
pnpm --filter @valet/dashboard exec playwright test \
  e2e/operations-google-map.spec.ts \
  e2e/operations-google-map-authority.spec.ts
```

Result: **7/7 PASS**.

### Existing Operations authority / paging / mutation / race / privacy regression

```text
pnpm --filter @valet/dashboard exec playwright test \
  e2e/operations-maps.spec.ts \
  e2e/operations-authority.spec.ts \
  e2e/md-r07-map-races.spec.ts \
  e2e/md-r07-map-privacy-budget.spec.ts \
  e2e/md-r07-map-session.spec.ts \
  e2e/task01-map-async-race.spec.ts
```

Result: **16/16 PASS**.

### Existing visual/freeze regression

```text
pnpm --filter @valet/dashboard exec playwright test \
  e2e/operations-visual-freeze.spec.ts \
  e2e/md-r07-map-visual.spec.ts
```

Result: **5/5 PASS**.

### Exact origin/main → candidate six-case freeze gate

Origin/main baseline command in the detached baseline worktree:

```text
LIVE_GOOGLE_MAP_VISUAL_BASELINE=true
pnpm --filter @valet/dashboard exec playwright test \
  e2e/live-operations-google-map-visual.spec.ts
```

Result: **6/6 PASS**, six baseline JSON snapshots and six baseline screenshots retained in temporary validation storage.

Candidate command uses `LIVE_GOOGLE_MAP_VISUAL_COMPARE=true`, dummy browser Google config, the same six cases and the same baseline JSON. Result: **6/6 PASS**. Candidate screenshots were retained in the same temporary validation storage.

### Static validation

- Scoped ESLint over every changed TypeScript/TSX implementation/test/support file with `--max-warnings=0`: **PASS**.
- `pnpm --filter @valet/dashboard typecheck`: **PASS**.
- `pnpm test:build-contract`: **4/4 PASS**.
- `git diff --check`: **PASS** before the implementation commit.
- No changed implementation file exceeds the 300 physical-line policy.

`pnpm architecture:check` reaches one unrelated existing violation:

```text
packages/employee-client/src/employee-shift-presence-local-provenance.test.ts:
window violates portable Employee client global boundary
```

That file is byte-for-byte unchanged from `origin/main` (`git diff --exit-code origin/main -- <file>` passes), and the same `window` identifier is present in the baseline source. Architecture output also lists pre-existing grandfathered line-count warnings in API/database files. No architecture failure points at this implementation.

An exploratory `prettier --check` was not treated as a repository acceptance gate; it reported formatting differences in 16 touched files, including the repository's compact existing map CSS style. No broad formatting rewrite was performed because that would create unnecessary UI-source churn. Required ESLint, typecheck, source-size, browser and build gates are the acceptance evidence above.

## Production build

Running `next build` without `API_ORIGIN` first produced the repository's intentional production configuration error: `API_ORIGIN is required in production`. `pnpm test:build-contract` confirms that rejection is required behavior.

Production Dashboard build was then run with the validation API origin supplied only as a process environment value:

```text
API_ORIGIN=http://127.0.0.1:3001
pnpm --filter @valet/dashboard build
```

Result: **PASS**. Next.js compiled successfully, TypeScript completed, and all 26 routes including `/maps-zones` were generated/finalized successfully.

No Google key or Map ID was required to build because provider absence intentionally uses the runtime fallback.

## Real provider status

The machine environment had neither `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` nor `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` configured for a real authorized provider run. Dummy values were used only in tests whose Google JavaScript request was intercepted by the repository mock.

**REAL GOOGLE MAPS RUNTIME NOT VERIFIED**

No mocked SDK result is reported as real Google proof.

## Backend / database impact

- Backend production changed: **NO**.
- API contract changed: **NO**.
- `packages/contracts` changed: **NO**.
- Prisma changed: **NO**.
- Database migrations: **0**.
- GPS ingestion changed: **NO**.
- tracking lifecycle/policy changed: **NO**.
- new dependencies / lockfile changed: **NO**.
- `.env.example` changed: **NO**.
- Google credentials added to repository: **NO**.

The existing live-map and map-setup contracts already provide all required geographic information.

## Known limitations / intentionally retained behavior

- Google provider base-map language is fixed by the first SDK load for the page; a later app locale switch updates app UI but requires page reload to change provider labels.
- Multi-level garage geometry remains lat/lng metadata rendered together; Google Maps does not add indoor-floor semantics and Phase 1 adds no level filter.
- Live data refresh remains initial/explicit Refresh/cursor/scope driven; no polling or event stream was added.
- CA/Supervisor continue to receive live data only; they do not fetch LM Map Setup geometry.
- Setup map presentation is geographic but authoring remains the existing dialogs/manual coordinate and vertex workflow.
- Marker clustering, map-assisted editing, Places, geocoding, directions, traffic and route history remain out of scope.
- Real provider acceptance still requires an authorized restricted Google browser key and Map ID in an approved deployment-like environment.

## Final self-review against the approved plan

The final implementation diff was inspected against both `origin/main` and `docs/LIVE_OPERATIONS_GOOGLE_MAP_IMPLEMENTATION_PLAN.md`.

Confirmed:

- no Attendance Zone / Operational Map Area persistence mixing;
- no new role or entitlement access;
- no Maps page/shell/navigation redesign;
- no polling/WebSocket/GPS/task-lifecycle expansion;
- no Places/geocoding/directions/traffic;
- no level selector or indoor-floor inference;
- no CA/Supervisor setup-geometry read expansion;
- no marker task actions;
- no backend/contract/DB/Prisma/lockfile/env change;
- `CoordinateCanvas` remains as the explicit truthful fallback;
- all provider-specific status UI is confined to the existing central map viewport;
- final UI freeze verdict remains PASS.

## Git status at validated implementation commit

Immediately after implementation commit `1efdd09792be8c71afa79aefe0244c384917d3e4`, the implementation branch was clean and one implementation commit ahead of `origin/plan/live-operations-google-map`. This report is the only planned follow-up file before branch push.
