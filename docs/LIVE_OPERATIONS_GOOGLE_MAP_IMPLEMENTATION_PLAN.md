# Live Operations Google Map Implementation Plan

Status: **Canonical implementation plan — planning only**
Date: 2026-10-05
Repository: `veletpro0-lgtm/valet-platform`
Planning baseline: `origin/main` = `bbfa9c0206c65a3269a1c94dad99afc65b812dd3`

This plan covers only the Dashboard `Operations → Maps → Live` presentation conversion from the existing provider-neutral `CoordinateCanvas` to Google Maps Platform. It does not authorize production implementation on this branch.

## 1. Executive summary

The current repository already has the geographic data, authorization boundaries, tracking lifecycle, map-setup geometry, and Google Maps browser configuration needed for a real Operations map. The conversion is therefore a **Dashboard presentation/lifecycle change**, not a tracking or persistence project.

The implementation should introduce an Operations-owned `OperationalGoogleMap` as the primary map surface, backed by one narrowly shared Dashboard Google Maps JavaScript SDK loader extracted from `apps/dashboard/src/features/administration/settings/attendance-zone-google-sdk.ts`. The shared layer owns only page-global Google SDK concerns: one script load, language selection, nonce propagation, timeout/retry, global auth-failure handling, and the SDK types used by Dashboard map components. Shift Presence continues to own `AttendanceZoneMap`, circular attendance-zone semantics, and its manual editing workflow. Operations continues to own live task markers, operational points, polygons, camera policy, scope replacement, and `CoordinateCanvas`.

`CoordinateCanvas` should remain as an explicit truthful fallback when Google configuration or the provider is unavailable. The page must say that Google Maps is unavailable and offer Retry where retry can help; it must not silently present the fallback as a street map. This keeps Maps usable without weakening failure visibility or changing the existing manual Setup dialogs.

No backend contract change, Prisma change, database migration, GPS-ingestion change, tracking-lifecycle change, WebSocket, polling expansion, Places API, geocoding, route engine, or new credential is required.

## 2. Current architecture

The retained Dashboard route is `/maps-zones`, registered in `apps/dashboard/src/features/operations/operations-navigation.ts` as `LOCATION_MAPS` for `COMPANY_ADMIN`, `LOCATION_MANAGER`, and `SUPERVISOR`, with exact Location scope required.

`apps/dashboard/src/features/operations/maps/maps-page.tsx` currently owns page composition:

- the frozen Operations page title/subtitle;
- exact selected Location presentation;
- Returned Levels display;
- Live / Setup mode controls;
- explicit Refresh;
- the two-column map + side-panel layout;
- live-map cursor state through `useCursorPage()`;
- live reads through `useOperationsRead()` and `readLiveMap()`;
- LM-only setup reads through `useMapSetupState()`;
- the central `CoordinateCanvas` surface;
- `LiveMapPanel` as the textual live-task companion;
- `MapSetupPanel` as the LM setup companion.

`CoordinateCanvas` in `apps/dashboard/src/features/operations/maps/coordinate-canvas.tsx` is a provider-neutral SVG projection. It gathers actual latitude/longitude values from the current live page, LM map points, and LM map-area vertices; derives local bounds; and scales those values into a relative SVG. It does not geocode, fabricate a Location center, or claim to be a floor/street map. It omits live items whose `position` is `null`. LIVE markers use the current green semantic, STALE markers the current amber semantic, active setup points blue, and inactive setup data neutral/dashed presentation.

`apps/dashboard/src/features/operations/maps/maps-reference.module.css` freezes the visible composition: roughly 2.06:1 map/panel columns on desktop, one column below 1050 px, a 31.875 rem map surface on desktop and 26 rem on narrow screens, current toolbar/surface/legend geometry, and existing light/dark palettes. `docs/24_MANAGEMENT_DASHBOARD_INTEGRATION_PLAN.md` MD-03 makes that composition binding.

The target change is therefore inside the existing central surface. It is not a new route, page, navigation item, or operational shell.

## 3. Current end-to-end GPS/live-map data flow

The current data path is already provider-neutral and should remain unchanged:

```text
employee/device task-scoped GPS fix
  → POST /v1/staff/valet-sessions/:sessionId/tracking/gps-samples
  → gps-ingestion.controller.ts
  → gps-ingestion-command.ts
      → prove current actor / task owner / movement / active tracker
      → gps-sample-canonicalization.ts
      → gps-sample-persistence.ts → raw_gps_samples
      → geofence-evaluation.ts → geofence events when applicable
  → active TaskTrackingSession remains owned by authoritative movement lifecycle

Dashboard live read
  → GET /v1/staff/locations/:locationId/live-operations-map?limit=100&cursor=...
  → live-map.controller.ts
  → live-map-read-authorization.ts
  → live-map-query.ts
      → active tracker + IN_PROGRESS Parking/Retrieval task
      → latest raw GPS sample for that tracker
      → 60-second LIVE / STALE classification using DB time
      → active operational-area containment projection
      → bounded cursor page
  → LiveOperationsMapResponse
  → operations-api.ts
  → maps-page.tsx / LiveMapPanel / map renderer
```

`apps/api/src/modules/tracking/task-tracking-lifecycle.ts` starts/stops tracking only inside authoritative Parking/Retrieval movement transitions according to persisted tracking policy. The map conversion must not reopen those semantics.

`apps/api/src/modules/tracking/gps-sample-canonicalization.ts` and `gps-sample-persistence.ts` already canonicalize and persist task-scoped coordinates safely, with bounded batches and idempotent client sample identity. `live-map-query.ts` uses only the latest sample for live projection; it does not expose route history through the live endpoint.

`packages/contracts/src/live-operations-map.ts` already returns every coordinate fact needed by Google rendering: `latitude`, `longitude`, `capturedAt`, `freshness`, contained operational areas, task/session state, and safe vehicle presentation fields. A `position: null` item remains a real current task with no current map marker.

## 4. Current authorization model

The Google renderer must consume only data that existing server and Dashboard authority already allow. It does not become an authorization layer.

Current `LOCATION_MAPS` entry and live-map behavior are:

| Viewer | Live map | Map setup geometry/API | Additional current requirements |
| --- | --- | --- | --- |
| Company Admin | Yes | No | Exact active Location, current Company Admin management authority, MFA assurance, commercial Dashboard access, effective tracking policy |
| Location Manager | Yes when Dashboard access is enabled | Yes | Active LM membership, explicit exact-Location grant, active Organization/Location; live map also needs commercial Dashboard access |
| Location Manager with `dashboardAccess=false` | No live read | Yes | Maps route remains available and is forced into Setup mode |
| Supervisor | Yes | No | Active Supervisor membership, exact Location grant, ACTIVE Shift at that Location, commercial Dashboard access |
| Employee / Guest | No | No | No Maps surface/exact live coordinates |

The current Company Admin path is the DEC-080-amended authority implemented by `apps/api/src/modules/tracking/live-map-read-authorization.ts`: `LIVE_MAP_READ` requires current server-validated management context/MFA and active target Location. Raw route history and map setup remain outside that Company Admin authority.

`apps/api/src/modules/tracking/live-map-authorization.ts` retains LM/Supervisor exact-Location rules. `apps/api/src/modules/map-setup/map-setup-authorization.ts` retains LM-only exact Location setup authority. The implementation must not make CA/Supervisor call LM setup endpoints merely to draw more overlays.

`operationsScopeKey()` in `apps/dashboard/src/features/operations/operations-scope.ts` includes identity generation, session generation, selection revision, authority, Organization, and Location facts. `MapsPage` remounts `MapsContent` on that key. The Google runtime must treat that remount as an authority/scope replacement and dispose all old provider objects.

## 5. Current Map Setup model

`packages/contracts/src/map-setup.ts` already defines geographic setup data:

- `LocationMapPoint`: `ENTRANCE | PICKUP | DROP_OFF`, exact latitude/longitude, code, label, optional `levelLabel`, active state;
- `LocationMapArea`: `PARKING | OVERFLOW | STAGING | RESTRICTED`, active state, code, label, optional `levelLabel`, optional canonical Parking Zone association, and 3–500 ordered geographic vertices;
- Parking Zone association is context only; it does not replace canonical `ParkingZone` / `ParkingSpot` assignment authority.

The current endpoints in `apps/api/src/modules/map-setup/map-setup.controller.ts` are already sufficient:

- `GET /v1/staff/locations/:locationId/map/points`;
- `POST /v1/staff/locations/:locationId/map/points`;
- `PATCH /v1/staff/locations/:locationId/map/points/:pointId`;
- `GET /v1/staff/locations/:locationId/map/areas`;
- `POST /v1/staff/locations/:locationId/map/areas`;
- `PATCH /v1/staff/locations/:locationId/map/areas/:areaId`;
- `PUT /v1/staff/locations/:locationId/map/areas/:areaId/vertices`;
- bounded Parking Zone selector reads.

`point-editor-dialog.tsx` and `area-editor-dialog.tsx` already provide manual latitude/longitude and ordered-vertex editing. `use-map-setup-mutation.ts` reconciles success, conflict, network-unknown outcome, and auth-reconciled retry without blindly replaying writes. Phase 1 must preserve this authoring model.

## 6. Existing Shift Presence Google integration analysis

Current Google integration is feature-owned by:

- `apps/dashboard/src/features/administration/settings/attendance-zone-google-sdk.ts`;
- `apps/dashboard/src/features/administration/settings/attendance-zone-map.tsx`;
- focused unit/browser tests and `apps/dashboard/e2e/support/presence-map-mock.ts`.

The existing loader uses the official Maps JavaScript API directly and lazily, with no Google npm dependency. It provides:

- one in-flight script load per page/module instance;
- `loading=async`, quarterly version, marker library, CSP nonce propagation;
- initial language selection from the Dashboard locale;
- a 15-second timeout;
- explicit network/timeout retry by clearing the failed `loading` promise;
- `window.gm_authFailure` handling and mounted failure subscribers;
- sticky auth-failed state after provider authorization failure;
- old callback retirement by generated callback name;
- `AdvancedMarkerElement` support.

`AttendanceZoneMap` owns map creation, one center marker, a `Circle`, geographic click handling, theme rebuild, disposal, and manual form fallback. It forces the geographic map region to `dir="ltr"`, while localized surrounding copy follows Dashboard locale/direction. It rebuilds on theme change because `colorScheme` is supplied at map construction. It records the SDK's first-loaded language and truthfully tells the user that a page reload is needed when Dashboard locale changes after SDK load.

The GPS-D evidence is **mocked SDK evidence**, not live Google proof. The repository contains no authorized real-provider Operations proof.

One current loader edge deserves correction during extraction: retry can wrap `gm_authFailure` repeatedly because each load captures and chains the prior wrapper. The shared loader should install one owned global auth-failure bridge and maintain subscribers without wrapper stacking; a focused regression test must prove one notification per failure.

## 7. Reuse vs feature-specific architecture decision

**Decision: extract and reuse a narrowly shared Dashboard Google Maps SDK loader; keep rendering feature-specific.**

Recommended shared boundary:

`apps/dashboard/src/lib/maps/google-maps-sdk.ts`

It should own only:

- the single page-global Maps JavaScript API load;
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` loading input;
- initial SDK language and the observable loaded language;
- generated provider callback namespace;
- CSP nonce propagation;
- timeout/network retry;
- one global auth-failure bridge + subscriber registration;
- minimal Google SDK structural types needed by Dashboard features (`Map`, `Circle`, `Polygon`, `LatLngBounds`, `AdvancedMarkerElement`, event cleanup).

It must not know about attendance zones, live tasks, parking zones, operational areas, marker copy, permissions, API reads, or scope.

Feature ownership remains:

- `AttendanceZoneMap`: circular Shift Presence attendance-zone draft/edit rendering;
- `OperationalGoogleMap`: live task/vehicle markers, operational points, polygons, current-page camera policy, provider fallback, and Operations-specific cleanup/reconciliation;
- `CoordinateCanvas`: provider-neutral Operations fallback.

A separate Operations loader is rejected because both features share `window.google`, one script URL, one first-loaded language, and one global `gm_authFailure`; duplicate loaders would create conflicting singleton/language/auth-failure behavior. A generic Google/Mapbox/provider registry is also rejected because DEC-045 accepts Google as the first provider and there is no current second-provider requirement.

## 8. Target UX

The existing `/maps-zones` composition stays frozen. The implementation changes only the central map rendering capability and provider-status copy needed to tell the truth.

Preserve unchanged:

- Operations page heading/subtitle;
- selected Location display;
- Returned Levels display;
- Live / Setup mode toggle and LM forced-Setup behavior;
- explicit Refresh button;
- two-column desktop and one-column responsive composition;
- surface header and legend positions;
- `LiveMapPanel` textual companion and cursor controls;
- `MapSetupPanel`, dialogs, forms, focus behavior, manual coordinate/vertex editing;
- light/dark, EN/AR, LTR/RTL shell behavior.

In Live mode the central surface becomes a real Google base map with pan/zoom and exact marker placement. In LM Live mode, preserve the current behavior of also showing LM-authorized setup points/areas. CA/Supervisor continue to see live markers only because current authority does not grant them setup geometry.

Use the same restrained control posture as the existing Attendance map: preserve pointer/touch pan, wheel/gesture zoom, keyboard map interaction, and the standard zoom affordance needed to operate the map; do not add map-type, Street View, fullscreen, Places/search, or clickable-POI UI that would redesign the frozen surface or introduce unrelated provider behavior.

In Setup mode, LM sees Google geography plus existing point/area overlays, while live task items remain hidden exactly as today.

### Phase 1 required Setup behavior

Phase 1 renders existing point and polygon configuration geographically and leaves all creation/editing in the existing dialogs. Clicking the map does not create/move points or vertices.

### Optional future map-assisted editing

Direct map click/drag point placement, polygon vertex handles, snapping, draw tools, and map-driven boundary editing are a separate future product/UX task. They would require deliberate authoring, accessibility, conflict, and mutation semantics. They are not required for the provider conversion.

## 9. Live marker model

Each current-page live item with non-null `position` maps to one Google `AdvancedMarkerElement` at exactly `{ lat: position.latitude, lng: position.longitude }`. Items with `position: null` have no marker and remain represented in `LiveMapPanel` as `No current position`.

Use stable task identity internally to reconcile marker instances across same-page refreshes. `taskId` may be an internal renderer key but must never appear in visible/accessibility copy. On refresh:

- existing task marker → update position/status/content/title in place;
- new task → create marker;
- absent task → detach marker and clear its listeners;
- scope/page replacement → dispose the entire prior marker set before publishing the new scope.

Marker accessible text must reuse `liveMapMarkerLabel()` from `map-presentation.ts`, which is already tested to exclude raw internal IDs and coordinate text. No employee GPS metadata, membership UUID, tracking-session UUID, valet-session UUID, or task UUID goes into visible marker copy.

LIVE vs STALE must not depend only on color. Use the existing green/amber semantics plus a structural cue in custom marker content, for example a filled/solid LIVE marker and an outlined marker with a small clock/last-known glyph for STALE. Keep marker content compact and derived from existing Dashboard status tokens; do not introduce a new map design system.

Marker click behavior for Phase 1: **no InfoWindow and no task-management action**. `LiveMapPanel` remains the safe textual detail companion. Adding marker-to-panel selection/focus can be a future accessibility/UX enhancement if product explicitly requests it.

## 10. Points model

Each LM-authorized `LocationMapPoint` maps to one `AdvancedMarkerElement` at its exact latitude/longitude.

Presentation rules:

- use one compact Operations setup-point marker family;
- distinguish active/inactive with the existing operational/neutral semantics and a non-color cue where feasible;
- accessible/title copy uses the existing safe point presentation (`label`, `code`, kind, `levelLabel`, active state), never internal IDs;
- points are shown to LM in both Live and Setup because that is current `CoordinateCanvas` behavior;
- CA/Supervisor do not fetch or render setup points.

No point marker is movable in Phase 1. Editing continues through `point-editor-dialog.tsx`.

## 11. Polygon/area model

Each LM-authorized `LocationMapArea.vertices` array maps to one Google `Polygon` using ordered `{ lat, lng }` paths.

Preserve domain meaning without creating a rainbow palette:

- `PARKING`, `OVERFLOW`, and `STAGING` use restrained variants of the existing Operations/brand map treatment (stroke weight/opacity/fill opacity may distinguish them where needed);
- `RESTRICTED` may use the existing danger semantic because restriction is materially different;
- inactive geometry uses the existing neutral/inactive treatment with reduced emphasis and a textual inactive state in the Setup panel;
- purpose, label, code, `levelLabel`, parking-zone association, and active state remain available in the existing Setup panel/dialogs.

The implementation should derive map styles from current Dashboard semantic tokens/current CSS values rather than invent a provider-specific color system.

Operations polygons remain entirely separate from Shift Presence attendance circles. Never read/write attendance-zone persistence from the Operations map and never reuse an Attendance `Circle` as an operational-area representation.

CA/Supervisor currently do not receive map-area vertices. They therefore do not render configured polygons in Phase 1. The `LiveOperationsMapResponse.position.areas` array supplies only containment descriptors, not polygon geometry. Expanding full geometry to CA/Supervisor would be a separate backend authorization/contract decision and is not necessary for Google conversion.

## 12. Camera behavior

There is no authoritative Location center in the selected Dashboard scope. Location name/timezone are presentation facts only. The implementation must never geocode a Location name/address or infer a tenant center.

Use a deterministic camera epoch such as `scopeKey + mode + live cursor`:

1. On first provider-ready render for a camera epoch, collect coordinates that are actually rendered in that mode/current page: live marker positions plus LM-authorized point positions and polygon vertices.
2. If two or more useful geographic coordinates define a non-degenerate extent, `fitBounds` with fixed responsive padding and cap the resulting maximum zoom so a tiny polygon does not create an unusably close camera.
3. If exactly one useful coordinate exists, center it with a bounded operational zoom (implementation constant, expected around street/parking-area scale, not an unbounded maximum).
4. If no geographic data exists, use a neutral world presentation (`{lat: 0, lng: 0}`, world-scale zoom) and the existing truthful empty/no-tracked-task state. This is presentation only and does not fabricate a Location center.
5. Never call geocoding, Places, address search, or browser/device geolocation to choose the Operations camera.

Ordinary same-page Refresh updates overlays in place and preserves the operator's current pan/zoom. Cursor page change, Location/scope replacement, and Live↔Setup mode change create a new camera epoch and fit that epoch's actual rendered data.

Theme rebuild is different: capture the current camera before teardown and restore it on the same camera epoch after constructing the new color-scheme map. Theme change must not unexpectedly refit or move the operator to another area.

## 13. Level behavior

`levelLabel` is metadata, not an indoor map coordinate system. Current `maps-page.tsx` shows a sorted union of returned setup point/area levels and live position containment-area levels; it does not filter by level.

Phase 1 preserves that truthful behavior:

- all currently returned/render-authorized levels display simultaneously on the geographic map;
- the existing Returned Levels control remains a read-only display;
- no new level selector/filter is introduced;
- Google Maps does not solve multi-floor garage overlap or indoor elevation.

A future level filter is reasonable only after product decides its semantics and contracts can identify/filter geometry and live positions reliably. A live marker itself has no authoritative standalone floor field today; inferring a floor from latitude/longitude would be false, and containment can be ambiguous when multiple level polygons share the same geographic footprint.

Indoor floor plans, z-coordinates, indoor routing, or a garage digital twin are out of scope.

## 14. Refresh behavior

Current Live Map behavior is **initial/read-key loading plus explicit Refresh and cursor/scope changes**. `useOperationsRead()` has no interval, WebSocket, event stream, or background polling. Map Setup similarly reloads on mount, explicit Refresh, and mutation reconciliation.

The Google conversion preserves that load profile. Provider rendering must react to the data already returned; it must not create a second live-data fetch loop.

Optional follow-up, separately approved: low-frequency foreground-only live refresh with bounded backoff. That is not part of this conversion and must be evaluated against backend load, stale semantics, hidden-tab behavior, and operator need before implementation.

## 15. Theme/locale behavior

The target supports Light, Dark, EN, AR, LTR, and RTL without mirroring geography.

- `OperationalGoogleMap` receives the current Dashboard theme and creates Google `Map` with `colorScheme: "LIGHT" | "DARK"`.
- Because theme is chosen at map construction, theme change deliberately rebuilds the Google map runtime, preserving the current camera and reattaching current data.
- The geographic map container is always `dir="ltr"`; longitude east/west never mirrors under Arabic.
- Surrounding toolbar, provider-status copy, legend, panels, and fallback notices follow current Dashboard locale/direction.
- The shared loader selects Google SDK `language` only on the first page-level load.
- If Dashboard locale changes after the SDK has loaded in another language, keep current localized UI controls and show a truthful localized notice that provider base-map labels require a page reload. Do not attempt fake dynamic base-map language switching.

Because the loader becomes shared, whichever Google feature loads first (Shift Presence or Operations) establishes the page-level SDK language. This singleton behavior must be explicit and tested.

## 16. Failure/fallback behavior

**Decision: Google primary + explicit `CoordinateCanvas` fallback.**

Treat these as provider-unavailable states:

- missing `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`;
- missing Operations-required `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`;
- invalid provider authorization / `gm_authFailure`;
- script/network error;
- loader timeout;
- map construction error, including invalid Map ID/provider runtime failure.

Behavior:

1. Show a localized provider-unavailable status that explicitly says the Google geographic map could not be loaded.
2. Render `CoordinateCanvas` using the exact same already-authorized live/setup data. Keep its provider-neutral disclaimer so the user cannot mistake it for a street map.
3. Show Retry for recoverable script/network/runtime attempts. Missing build-time configuration or sticky provider auth failure may fail immediately again; the page remains usable through fallback.
4. Keep `LiveMapPanel`, Setup panel, dialogs, pagination, and manual coordinate editing usable.
5. Never substitute a decorative/fake basemap or guessed geographic center.

The shared loader should reset failed in-flight state after network/timeout so explicit retry can create a fresh script request. Provider auth failure stays sticky for the page because reloading an invalid/restricted key repeatedly is not useful. Failure subscribers must detach on unmount.

## 17. Privacy/provider implications

Moving from `CoordinateCanvas` to Google Maps changes a privacy boundary: exact task GPS coordinates and LM setup geometry that are already authorized for browser presentation will also be supplied to the third-party Google Maps JavaScript runtime as rendering positions/paths.

Required controls:

- send Google only what the browser map needs to render (`LatLng` positions, paths, map options); do not copy coordinates into custom analytics, telemetry, logs, errors, or provider event payloads;
- do not add Google Analytics/Places/geocoding/directions/traffic merely because the Maps SDK is present;
- do not include employee identity, membership IDs, tracking session IDs, valet session IDs, task IDs, or raw internal IDs in marker labels or provider metadata;
- do not expose route history; only current/last-known active movement positions already returned by the live endpoint are rendered;
- do not broaden CA/LM/Supervisor authority;
- do not persist Google-rendered state or exact coordinates in localStorage/sessionStorage/IndexedDB/cache;
- preserve logout/scope replacement removal of protected map DOM/runtime state;
- production privacy notices/customer contracts must accurately describe third-party map rendering of authorized operational location data.

Google browser key material is public configuration, not a server secret, but it must be referrer/API restricted. No credentials belong in repository source.

## 18. Scope/race lifecycle

The provider runtime adds asynchronous lifecycle work on top of existing data-read fencing. It must preserve current A→B→A, logout, identity/session replacement, cursor, and setup-mutation guarantees.

Recommended runtime rules:

- maintain an `OperationalGoogleMap` generation token/disposed flag for each provider initialization/rebuild;
- after every awaited SDK load, check current generation and mounted DOM before constructing/publishing a map;
- theme rebuild increments generation before disposing the old runtime;
- scope/unmount disposes map listeners, marker instances, point instances, polygons, and provider node children before any later callback can publish;
- provider failure subscriptions are detached on teardown;
- old provider callbacks may resolve but cannot attach overlays or set component state for a retired generation;
- data refresh reconciles only against the current `scopeKey/mode/cursor` inputs;
- scope/page replacement clears old overlay identity maps before accepting new data;
- `CoordinateCanvas` fallback receives only current props and disappears with the same component scope;
- no provider callback triggers an API mutation or retries a protected write.

Keep existing `useOperationsRead`, `useMapSetupState`, and `useMapSetupMutation` data authority/race fences; the map renderer should not duplicate or bypass them.

## 19. Google configuration

Operations should use the **same existing** Dashboard browser configuration as Shift Presence:

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`;
- `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`.

No second API key or Map ID is justified by current security, quota, styling, or ownership evidence. A separate Map ID can be considered later only if Operations requires materially different cloud-side style/configuration that cannot coexist with Shift Presence.

Production deployment requirements:

- Google Cloud project with Maps JavaScript API enabled;
- billing enabled for that project;
- valid Map ID suitable for Advanced Markers/vector map use;
- Dashboard served over HTTPS;
- public browser API key restricted to deployed Dashboard HTTPS HTTP referrers (plus explicitly approved development origins as needed);
- API restriction limited to Maps JavaScript API;
- `NEXT_PUBLIC_*` values injected at Dashboard build time;
- no server/service-account key in browser configuration or repository;
- same domain/referrer restriction policy as Shift Presence.

No Places API, Geocoding API, Directions API, Traffic API, or address search is required.

## 20. Exact file impact proposal

No `apps/api/**`, `packages/contracts/**`, Prisma, migration, `.env.example`, lockfile, or dependency changes are expected.

### Production files

| File | Planned impact |
| --- | --- |
| `apps/dashboard/src/lib/maps/google-maps-sdk.ts` | **New.** Extract narrow page-global loader/lifecycle/types from Attendance loader; add Polygon/Bounds/basic camera interfaces required by Operations; fix single auth-failure bridge ownership. |
| `apps/dashboard/src/features/administration/settings/attendance-zone-google-sdk.ts` | **Remove after extraction** (or leave only a zero-logic transitional re-export if repository sequencing requires it, then remove in same implementation task). No second loader remains. |
| `apps/dashboard/src/features/administration/settings/attendance-zone-map.tsx` | Import shared loader/types; preserve existing Attendance behavior, Circle ownership, theme rebuild, locale notice, manual fallback. |
| `apps/dashboard/src/features/operations/maps/operational-map-model.ts` | **New.** Pure feature-specific projection: live marker descriptors, point descriptors, polygon descriptors, safe labels, renderer identity, fit-coordinate collection, semantic map style roles. |
| `apps/dashboard/src/features/operations/maps/operational-google-map-runtime.ts` | **New.** Imperative Google runtime: map construction, overlay reconciliation/disposal, bounds/camera, listener cleanup, theme camera capture/restore. |
| `apps/dashboard/src/features/operations/maps/operational-google-map.tsx` | **New.** React provider-status/generation boundary; shared loader invocation; failure/Retry; explicit `CoordinateCanvas` fallback; locale-language notice. |
| `apps/dashboard/src/features/operations/maps/maps-page.tsx` | Replace central direct `CoordinateCanvas` use with `OperationalGoogleMap`, pass mode/scope/cursor camera key/theme/current authorized data. Keep page authority/fetching/pagination unchanged. Because this file is already 269 lines, do not grow it past repository limits. |
| `apps/dashboard/src/features/operations/maps/map-surface.tsx` | **New if needed to keep `maps-page.tsx` comfortably below 300 lines.** Extract the existing surface header/map/legend composition without visual change; this is preferred if the Google integration would otherwise grow `maps-page.tsx`. |
| `apps/dashboard/src/features/operations/maps/maps-reference.module.css` | Preserve frozen dimensions/layout; add geographic-map host/fallback/provider-status selectors and dark/narrow equivalents; remove coordinate-only selector assumptions from the primary path. |
| `apps/dashboard/src/features/operations/operations-copy.ts` | Add only localized Google loading/unavailable/retry/language-reload/geographic-map labels needed for truthful provider state. Keep existing setup/live copy. |
| `apps/dashboard/src/features/operations/maps/coordinate-canvas.tsx` | Retain as fallback. No functional change is required unless a tiny prop/accessibility extraction is needed for fallback integration. |

`apps/dashboard/src/features/operations/operations.module.css` is not expected to change; the map-specific styles belong in `maps-reference.module.css` unless implementation proves an existing shared Operations style must be reused.

### Test/support files

| File | Planned impact |
| --- | --- |
| `apps/dashboard/src/lib/maps/google-maps-sdk.test.ts` | **New/moved** shared-loader tests: missing key, single-flight, nonce, language singleton, timeout/retry, one auth bridge, subscriber detach, late callback retirement. |
| `apps/dashboard/src/features/administration/settings/attendance-zone-google-sdk.test.ts` | Remove/replace after shared-loader extraction; Attendance-specific rendering assertions stay in Attendance tests. |
| `apps/dashboard/src/features/operations/maps/operational-map-model.test.ts` | **New.** Marker omission/projection, LIVE/STALE cue model, safe labels, polygons/active state, camera coordinate set. |
| `apps/dashboard/src/features/operations/maps/operational-google-map-runtime.test.ts` | **New if runtime helpers are practical to unit-test.** Identity-preserving updates, disposal, theme camera restore, fit behavior. |
| `apps/dashboard/e2e/support/google-maps-mock.ts` | **New/shared.** Replace/absorb provider primitives currently in `presence-map-mock.ts`, adding Polygon/Bounds/marker identity/camera hooks without becoming a fake provider framework. |
| `apps/dashboard/e2e/support/presence-map-mock.ts` | Remove or narrow to Shift Presence-specific helpers that build on the shared mock. |
| `apps/dashboard/e2e/shift-presence-map.spec.ts` | Preserve Attendance behavior through shared-loader extraction. |
| `apps/dashboard/e2e/shift-presence-map-lifecycle.spec.ts` | Preserve theme/language/late-listener cleanup behavior and add no duplicate auth notification regression as appropriate. |
| `apps/dashboard/e2e/operations-maps.spec.ts` | Convert canvas-primary assertions to Google-adapter assertions while preserving live/stale/null/pagination and full Setup mutation reconciliation. Keep fallback assertions explicitly for provider failure. |
| `apps/dashboard/e2e/operations-google-map.spec.ts` | **New preferred focused provider test** for primary Google rendering, marker/polygon projection, theme, RTL, fallback, current-page replacement, and provider callback fencing rather than overgrowing existing 219-line Operations Maps test. |
| `apps/dashboard/e2e/operations-authority.spec.ts` | Preserve/extend proof that CA/SUP never call setup geometry endpoints and LM without Dashboard access never performs live-map read. |
| `apps/dashboard/e2e/md-r07-map-races.spec.ts`, `md-r07-map-privacy-budget.spec.ts`, `md-r07-map-session.spec.ts`, `task01-map-async-race.spec.ts` | Update only selectors/provider harness where needed; retain existing A→B→A, logout/session, memory-only and no-replay assertions. |
| `apps/dashboard/e2e/operations-visual-freeze.spec.ts` / `md-r07-map-visual.spec.ts` | Replace coordinate-canvas-specific geometry assertion with geographic-host dimensions and frozen surrounding composition; keep EN/AR, dark/light, desktop/narrow proof. |

The implementation should prefer these focused files over allowing `maps-page.tsx`, one provider runtime, or one browser spec to exceed the 300-physical-line source/test rule.

## 21. Test matrix

### Unit/component/provider-adapter

- shared loader loads once when Attendance and Operations both request it;
- missing API key creates no script and returns provider-unavailable;
- Operations missing Map ID selects explicit fallback without attempting a fake geographic map;
- initial SDK language is EN or AR and remains singleton after locale switch;
- network error/timeout permits explicit retry;
- `gm_authFailure` publishes once to current subscribers and does not stack wrappers across retry;
- detached subscribers receive no later failure;
- late/retired loader callback cannot initialize a retired map generation;
- live item with position → exact Advanced Marker lat/lng;
- live item without position → no marker;
- LIVE and STALE use different structural state as well as color;
- safe marker accessible name contains existing safe vehicle/task presentation and no raw IDs/coordinates;
- same task marker is updated in place on same-page refresh;
- disappeared task marker is detached;
- LM point projection includes exact coordinate/active/kind/level facts;
- LM polygon projection preserves ordered vertices, purpose, active/inactive, level metadata;
- no Attendance Circle/persistence enters operational polygon model;
- camera fit input contains only current rendered geography;
- one-point camera uses bounded zoom;
- zero-point camera uses neutral world view;
- same-page refresh preserves camera;
- cursor/mode/scope change starts a new camera epoch;
- theme rebuild restores same camera/data with new `colorScheme`;
- runtime teardown removes map/marker/polygon listeners and detaches overlays;
- provider failure swaps to `CoordinateCanvas` using the same current authorized props;
- fallback geography remains LTR in Arabic.

### Browser

| Scenario | Required proof |
| --- | --- |
| CA Live Map | Exact active Location; real live endpoint; Google markers; no setup endpoint/controls; current authority/MFA shell remains intact. |
| LM Live Map | Dashboard access true; live markers + LM-authorized configured points/areas; existing Live panel. |
| LM no Dashboard entitlement | Forced Setup mode; setup geography available; **zero** live-map request. |
| Supervisor Live Map | Active shifted exact Location; live markers; no setup reads/controls. |
| Employee / denied authority | No Maps entry/provider data exposure. |
| No tracking / empty response | No markers; truthful no-tracked-task state; neutral/default camera. |
| No position | Item remains in Live panel; no marker. |
| LIVE / STALE | Correct safe label and non-color-only marker state. |
| Multiple markers | Geographic positions preserved; fit bounds; current page only. |
| Cursor next/previous | Old-page markers removed, new-page markers shown, camera epoch refit; cursor never crosses scope. |
| LM point geometry | Exact point position; active/inactive semantics; level metadata remains in Setup UI. |
| LM polygon geometry | Exact ordered boundary; purpose and active/inactive truth; parking-zone association unchanged. |
| Setup mutation | Existing create/edit/conflict/unknown/retry reconciliation unchanged; map redraw follows authoritative reload only. |
| EN/AR | UI localized; geographic container LTR; initial SDK language correct. |
| Light/Dark | Correct `colorScheme`; camera/data retained across rebuild. |
| Desktop/narrow | Frozen map/panel composition and no document horizontal overflow. |
| Location A→B→A | Old A data/provider callback never publishes into B/final A. |
| Logout / session replacement | Protected overlays/DOM cleared; late callbacks cannot repaint. |
| Provider failure | Explicit unavailable status + truthful CoordinateCanvas fallback + existing panel/setup usability. |
| Missing key / Map ID | Same safe fallback; no false Google-ready state. |
| Privacy persistence | Exact coordinate/area sentinels absent from browser persistent stores; provider conversion adds no object-URL/cache persistence. |

Mock SDK tests are adapter/lifecycle evidence only. They must never be described as live Google proof.

## 22. Real provider acceptance

When an authorized production-like browser key and Map ID are available later, run a separate real-provider acceptance pass on the built Dashboard over an allowed HTTPS/referrer origin.

Required evidence:

- Google geographic base map visibly loads;
- one known fixture/current task marker appears at its independently known latitude/longitude;
- one known LM operational polygon appears over the correct real geographic footprint;
- LM configured point appears at the correct location;
- map pan and zoom work with keyboard/pointer controls;
- light and dark map schemes construct successfully;
- EN/AR UI remains correct and geography is not mirrored;
- referrer/API restrictions accept the approved origin and reject an unapproved origin where deployment tooling permits controlled proof;
- no Places/geocoding/directions requests are made.

Record the exact environment and clearly distinguish this from intercepted SDK mocks. The current repository has **no such real-provider proof**.

## 23. Rollout/rollback

No database rollout is expected.

Recommended deployment order:

1. Provision/verify the existing Dashboard Google Cloud project configuration: Maps JavaScript API, billing, restricted browser key, Map ID, approved HTTPS referrers.
2. Inject existing `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` at Dashboard build time.
3. Deploy Dashboard implementation. Backend/API/tracking services require no coordinated schema or API rollout for this change.
4. Run provider-independent browser acceptance first, then real-provider acceptance when the authorized key is available.

If configuration is absent, invalid, or Google is unavailable, Maps remains usable through the explicit `CoordinateCanvas` fallback and existing panels/dialogs. Provider availability must not block setup authoring or hide current live textual details.

Rollback is a Dashboard-only rollback to the prior build. Because contracts/persistence are unchanged and `CoordinateCanvas` remains in the codebase as fallback, rollback does not require data migration, tracking changes, or cleanup of provider-owned state.

## 24. Explicit non-goals

This conversion does not include:

- PostGIS or spatial database migration;
- Prisma/schema changes;
- new GPS persistence or ingestion behavior;
- tracking policy/lifecycle changes;
- whole-Shift employee tracking;
- WebSockets, Kafka, Redis, event streaming, or high-frequency polling;
- historical route display on the Live Map;
- organization-wide live tracking;
- Guest exact coordinates;
- Places, geocoding, directions, traffic, address search, route optimization, or map tile servers;
- indoor floor-map support, 3D/digital twin, floor inference, or indoor routing;
- clustering at current 100-item Dashboard page size;
- direct map-assisted point/polygon editing in Phase 1;
- attendance-zone reuse for operational areas;
- new navigation/page/shell or visual redesign;
- marker-driven task/custody actions;
- new Google API key, credentials, npm dependency, or provider abstraction marketplace.

### Deferred / not required for Google conversion

Potential future work only with separate approval: foreground periodic refresh, level filter, marker-to-side-panel selection, clustering if actual scale proves it necessary, map-assisted setup editing, CA/Supervisor operational geometry read contract, and operations-specific Google cloud styling/Map ID.

## 25. Risks

| Risk | Mitigation |
| --- | --- |
| Shared page-global SDK language conflicts between Attendance and Operations | One shared loader, first-language singleton documented/tested, truthful reload notice after locale change. |
| Global `gm_authFailure` wrapper stacking | Shared loader owns one bridge; explicit regression test across failure/retry/subscriber attach-detach. |
| Late provider callback repaints retired Location/session | Feature generation fencing + scope-key remount + full runtime teardown. |
| Theme rebuild moves camera or duplicates overlays | Capture/restore camera for same epoch; dispose runtime before rebuild; reconcile current data once. |
| Google failure makes Operations unusable | Explicit provider status + `CoordinateCanvas` fallback; panels/dialogs continue. |
| CA/SUP geometry temptation weakens setup authority | Do not call setup endpoints; render only authorized live markers. Geometry expansion is separate contract/authority work. |
| Marker labels leak internal IDs/GPS details | Reuse `liveMapMarkerLabel`; focused negative tests for UUIDs/coordinates/private metadata. |
| Browser persistence leaks protected location | Keep provider/render state in memory; preserve R07 persistent-storage/logout tests. |
| Visual freeze regression | Keep current surface dimensions/layout/legend/control positions; focused computed-style + screenshot matrix. |
| Maps page exceeds 300 lines | Extract `map-surface.tsx` rather than grow 269-line `maps-page.tsx`. |
| Large overlay work causes churn | Reconcile markers/polygons by identity; no full map reconstruction on ordinary refresh; current live page is 100 items. |
| Polygon complexity | Each area is contract-bounded to 500 vertices; dispose/reuse overlays; no simplification/clustering until evidence requires it. |
| Misleading multi-floor geography | Preserve all-level metadata behavior; no floor inference/filter in Phase 1. |

## 26. Open questions only where repository evidence cannot answer them

There are **no product/architecture blockers** for Phase 1.

Two implementation-detail choices should be settled during coding without reopening product scope:

1. Exact numeric camera constants (single-point zoom, fit padding, fit max zoom) should be chosen against the frozen 510 px desktop / 416 px narrow surface and locked by focused tests. Repository data provides no authoritative product number.
2. Exact Google overlay stroke/fill numeric values should be derived from the current Operations semantic palette during implementation. The plan locks the semantic rule (restrained normal operational treatment, danger for restricted, neutral/de-emphasized inactive), not new arbitrary color values.

Neither question requires backend, schema, authority, or UX-flow expansion.

## 27. Implementation sequence

Implement as one reviewed feature effort with three internal phases. Separate branches/PRs are optional engineering sequencing, not required product bureaucracy; each phase should leave the branch testable.

### Phase A — shared Google SDK infrastructure

1. Extract `attendance-zone-google-sdk.ts` into `apps/dashboard/src/lib/maps/google-maps-sdk.ts` with no Attendance behavior regression.
2. Install one global auth-failure bridge and test retry/subscriber lifecycle, including the current wrapper-stacking edge.
3. Extend only the shared structural SDK types needed for Operations core map/Polygon/Bounds/Advanced Marker behavior.
4. Point `AttendanceZoneMap` and its tests at the shared loader; prove existing light/dark, EN/AR language singleton, click/manual fallback, cleanup, and retry behavior still passes.

### Phase B — Live geographic rendering

5. Add pure `operational-map-model.ts` projection helpers using existing contracts and safe presentation helpers.
6. Add `operational-google-map-runtime.ts` with map creation, exact marker reconciliation, camera epoch logic, cleanup, and theme camera preservation.
7. Add `operational-google-map.tsx` with Google config/load status, generation fencing, locale notice, Retry, and `CoordinateCanvas` fallback.
8. Integrate it at the existing Maps surface boundary. If `maps-page.tsx` would grow materially, extract the existing surface markup to `map-surface.tsx` first; preserve the DOM/layout outside the provider host.
9. Render only current-page task markers with positions. Keep `LiveMapPanel`, pagination, explicit Refresh, null-position behavior, and current authority untouched.

### Phase C — Setup geography, resilience and acceptance

10. Reconcile LM setup point markers and operational Polygon overlays in Live and Setup modes, preserving current LM-only reads and manual dialogs.
11. Add inactive/purpose semantics and the existing legend-compatible presentation without redesign.
12. Complete provider-failure fallback, missing config, late callback, A→B→A, logout/session, theme, RTL, and persistence/privacy tests.
13. Update frozen visual tests for the real map host while retaining the exact surrounding geometry and responsive composition.
14. Run focused Dashboard lint/typecheck/tests/build and existing relevant API/contracts regression tests without changing backend code.
15. When authorized real Google configuration exists, perform the separate real-provider acceptance in Section 22 and record it as real provider evidence.

Do not begin Phase C map-assisted editing; that remains deferred.

## 28. Size/complexity estimate

Classification: **MEDIUM-LARGE**.

Reason: the domain/backend work is already complete, but the browser integration has non-trivial third-party singleton behavior, imperative overlay lifecycle, frozen UI constraints, theme rebuild, locale singleton behavior, provider fallback, privacy-sensitive coordinates, and strong existing scope/race tests. The risk is integration correctness rather than algorithmic or database complexity.

Expected implementation footprint:

- production files touched/added/removed: approximately **9–11**;
- test/support files touched/added: approximately **8–12**;
- production TypeScript/CSS net new or materially rewritten code: approximately **700–1,050 lines**, with extraction offsetting some existing loader/surface code;
- focused test/support code: approximately **700–1,100 lines**;
- backend/contracts/Prisma/migrations: **0 files changed**;
- new dependencies: **0**.

The effort should remain **one implementation task with three internal phases** because the shared loader extraction and Operations renderer are tightly coupled by one browser singleton and one acceptance matrix. Split into separate reviewed tasks only if repository scheduling requires independent merge points; do not split the domain model or create a generic maps-platform project.

## 29. Definition of Done

Implementation is complete only when all of the following are true:

- `/maps-zones` retains the frozen title/subtitle, Location/levels toolbar, Live/Setup toggle, Refresh, two-column layout, panels, dialogs, responsive behavior, EN/AR, LTR/RTL, and light/dark presentation;
- Google Maps is the primary central map when valid existing Dashboard Google configuration is available;
- live markers use exact current-page `LiveOperationsMapResponse.position.latitude/longitude` and omit null positions;
- LIVE/STALE are truthful and distinguishable without color alone;
- safe marker names reuse existing presentation and expose no raw internal identifiers/private GPS metadata;
- LM-authorized points and polygons render geographically in the same modes where current setup geometry is available;
- CA/Supervisor do not gain setup geometry/API authority;
- LM `dashboardAccess=false` remains Setup-only and sends no live-map request;
- Setup dialogs/manual coordinate and vertex editing, parking-zone association, active/inactive state, level labels, conflict/unknown/retry reconciliation remain unchanged;
- current explicit Refresh/current-page cursor semantics remain unchanged and no new polling exists;
- camera behavior is deterministic, uses only rendered authoritative geography, never geocodes/guesses a Location center, and preserves camera on ordinary refresh/theme rebuild as specified;
- all-level behavior remains truthful with no indoor/floor inference;
- one shared Dashboard Google loader services Shift Presence and Operations without duplicate scripts/auth handlers;
- theme rebuild, SDK language singleton, failure subscribers, late callbacks, marker/polygon disposal, and scope replacement are fenced and tested;
- missing/invalid provider configuration or provider/network/auth failure is explicit and falls back to `CoordinateCanvas` without breaking side panels/setup;
- no protected location data is newly persisted in browser stores/logs/analytics;
- no backend, contract, GPS ingestion, task/tracking lifecycle, Prisma, migration, dependency, lockfile, or credential change is introduced;
- mocked provider tests are labeled as mocks, and real Google proof is claimed only after Section 22 succeeds with authorized configuration;
- focused unit/browser/visual/privacy/race regression matrix passes, plus Dashboard typecheck/build and relevant existing API/contracts regressions;
- `git diff` contains only the approved implementation scope when implementation is later performed.
