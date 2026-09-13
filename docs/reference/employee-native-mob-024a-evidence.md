# Employee Native — MOB-024A Observability Evidence

> Evidence/status record only. This document creates no product, API, schema,
> persistence, or security authority. Accepted decisions and the binding Native
> execution plan remain canonical.

## Scope and result

- Base: `8cb4893` (branch `glm/mob-024a-production-observability`)
- Scope: MOB-024A production-safe observability and correlation — API console
  operation observer + request-ID boundary tests, portable employee telemetry
  vocabulary/sanitizer/fail-open in `@valet/employee-client`, Native telemetry
  owner/ring/provenance/HTTP-transport and surface wiring, plus independent
  adversarial review.
- Physical evidence: NOT PERFORMED for MOB-024A (no device run, no CI run
  claimed by this record).
- Overall status: **IMPLEMENTED / LOCAL COMMAND VERIFIED** for the files below;
  MOB-024A remains open pending review/merge and MOB-024B runbooks.

## Observability surface

Everything in this task is IMPLEMENTED and, at best, LOCAL COMMAND VERIFIED
(vitest on the authoring machine). Nothing here is RUNTIME-VERIFIED,
PHYSICAL-VERIFIED, or CI-VERIFIED.

| Surface | Implementation location | Evidence level |
| --- | --- | --- |
| API operation observer (console) | `apps/api/src/common/observability/console-operation-observer.ts`; bound via `observability.module.ts` (`OPERATION_OBSERVER` provider) | IMPLEMENTED + LOCAL COMMAND VERIFIED (`console-operation-observer.test.ts`) |
| API request-ID boundary | `apps/api/src/common/http/api-request.ts` (unchanged; validated by new tests) | IMPLEMENTED + LOCAL COMMAND VERIFIED (`api-request-id-boundary.test.ts`) |
| API operation-runner fail-open + bounded enrichment | `apps/api/src/common/http/api-operation-runner.ts` (unchanged in this task; pre-existing `api-operation-runner.test.ts` proves observer-failure fail-open and core-field override prevention) | IMPLEMENTED + LOCAL COMMAND VERIFIED (pre-existing suite) |
| Portable vocabulary + sanitizer | `packages/employee-client/src/employee-telemetry-types.ts`, `employee-telemetry-classification.ts` | IMPLEMENTED + LOCAL COMMAND VERIFIED (`employee-telemetry.test.ts`) |
| Portable fail-open wrappers | `packages/employee-client/src/employee-telemetry-fail-open.ts` | IMPLEMENTED + LOCAL COMMAND VERIFIED (same suite) |
| Native telemetry owner + bounded ring (200) | `apps/valet-native/src/telemetry/native-telemetry-owner.ts` | IMPLEMENTED + LOCAL COMMAND VERIFIED (`native-telemetry.test.ts`, `native-telemetry-business-preservation.test.ts`) |
| Native provenance (expo-application, platform-isolated) | `apps/valet-native/src/telemetry/native-telemetry-provenance.ts` | IMPLEMENTED + LOCAL COMMAND VERIFIED (`native-telemetry.test.ts`) |
| Native HTTP operation + request-id correlation | `apps/valet-native/src/telemetry/native-http-operation.ts`, `native-http-telemetry.ts`; wired in `native-operational-http.ts` (closed operation table; response `X-Request-Id` only, pattern-bounded) | IMPLEMENTED + LOCAL COMMAND VERIFIED (`native-telemetry-operation.test.ts`, `native-telemetry-adversarial-operation.test.ts`, transport/privacy suites) |
| Auth login/refresh/logout surfaces | `apps/valet-native/src/auth/native-auth-http.ts` (response-only bounded `X-Request-Id`, closed auth classifications, original result/error preservation) | IMPLEMENTED + LOCAL COMMAND VERIFIED (`native-telemetry-auth-correlation.test.ts`) |
| Lifecycle (foreground/background) + network (offline/online/unknown) | `apps/valet-native/src/shell/use-native-production-lifecycle.ts` | IMPLEMENTED + LOCAL COMMAND VERIFIED (`native-telemetry-surfaces.test.ts` vocabulary acceptance) |
| OCR loop/provider/abort/capture surfaces | `apps/valet-native/src/check-in/native-plate-ocr-loop.ts` + `native-plate-ocr-telemetry.ts` (status discriminator only — never plate text or file URIs) | IMPLEMENTED + LOCAL COMMAND VERIFIED (`native-telemetry.test.ts`, `native-telemetry-surfaces.test.ts`) |
| Push registration/permission/channel surfaces | `apps/valet-native/src/notifications/use-native-push-lifecycle.ts` (snapshot enum transitions only — never provider token or intent id) | IMPLEMENTED + LOCAL COMMAND VERIFIED (`native-telemetry-surfaces.test.ts`) |
| Incident recovery surfaces (reserved/found/retired/unknown/unavailable/invalidated) | `apps/valet-native/src/incident/native-incident-recovery-context.ts`, `native-incident-recovery-resolution.ts` | IMPLEMENTED + LOCAL COMMAND VERIFIED (exact-count and DEC-077 shape-preservation suites) |
| Local support diagnostics access | Active-Shift production UI → `NativeShiftDiagnosticsCard` → bounded `nativeSupportDiagnosticsView(owner.snapshot())` | IMPLEMENTED + LOCAL COMMAND VERIFIED (`native-support-diagnostics*.test.ts[x]`); local/read-only/memory-only, newest 10 events, no export/upload |
| Bootstrap wiring + cold-start | `apps/valet-native/src/shell/native-production-bootstrap.ts`; production shell owns the bootstrap in a `useState` initializer | IMPLEMENTED + LOCAL COMMAND VERIFIED (`native-cold-start-telemetry.test.ts`); one event per bootstrap initialization, no persistent counter, ordinary foreground transitions use separate events |
| Adversarial sanitizer fuzz + business-preservation + ring-bound | `apps/valet-native/test/native-telemetry-adversarial.test.ts`, `native-telemetry-business-preservation.test.ts` (independent reviewer) | IMPLEMENTED + LOCAL COMMAND VERIFIED (15/15 passing) |

## Privacy firewall evidence (MOB-024A §17)

Forbidden material categories are proven excluded by these test cases:

| Forbidden material | Proof |
| --- | --- |
| Authorization / Bearer / access token / refresh token | `employee-telemetry.test.ts` "rejects unknown" rows and privacy canary "adversarial requestIds/errorCodes are dropped"; `native-telemetry-privacy.test.ts` "never leaks request bodies, headers, params, or paths" and "never leaks secrets on the network-failure path"; `native-telemetry-adversarial.test.ts` "every classification slot ... rejects poisoned material" (all 7 sources × 23 payloads) |
| Pickup code / Dynamic QR proof / guest bearer / payment secret / card PAN | `native-telemetry-adversarial.test.ts` FORBIDDEN_MATERIAL fuzz (format-level, serialized-JSON scan); `employee-telemetry.test.ts` privacy canary "serialized valid events match bounded patterns only" |
| Plate text (business input as classification) | `employee-telemetry.test.ts` "rejects unknown `lifecycle`/`ABC1234`"; `native-telemetry-adversarial.test.ts` plate-text rows; `native-telemetry.test.ts` "rejects classifications outside the closed vocabulary" (`plate-123`) |
| Image bytes/base64/file URIs | `native-telemetry-adversarial.test.ts` image-base64 rows; `native-telemetry-privacy.test.ts` FORBIDDEN includes `file://camera/plate.jpg`; OCR telemetry source passes only the status discriminator |
| Raw request/response body, path with entity IDs, arbitrary headers | `native-telemetry-privacy.test.ts` transport test (poisoned body/headers/params/path) and "keeps only enumerated keys in every event, whatever the sink"; `native-telemetry-adversarial.test.ts` fuzzed-key smuggling test |
| Free text / customer text / Incident description | `native-telemetry-adversarial.test.ts` free-text and arabic-rtl rows; only enumerated classifications can reach an event (closed table, O(1) membership check) |
| Business error message text (`EmployeeApiError.message`) | `native-telemetry-business-preservation.test.ts` "no business error message text is ever captured in the recorded event" — only `code` (pattern-bounded) enters the event |
| Log-forging / header-injection into request-id slots | `employee-telemetry.test.ts` UNSAFE_IDS rows; `api-request-id-boundary.test.ts` injection rows; `console-operation-observer.test.ts` control-character collapse test |
| Extra properties smuggled on the event object | `employee-telemetry.test.ts` "never emits properties beyond the documented contract keys"; `native-telemetry-privacy.test.ts` "keeps only enumerated keys"; `native-telemetry-adversarial.test.ts` fuzzed keys + prototype-pollution test |

`enrichMeasurement` in `api-operation-runner.ts` spreads arbitrary keys into
the measurement object (assessed as a potential leak vector): today the only
production enricher is `check-in-operation-runner.ts`, which supplies a single
server-computed `checkInElapsedMs` number — no request-derived material. The
Console observer renders only contract fields and never enrichment keys, and
`api-operation-runner.test.ts` proves enrichment cannot override core fields.
The spread itself remains an open seam to keep bounded by future enricher
discipline (recorded below as a residual note, not a defect).

## Fail-open evidence (MOB-024A §18)

| Business-preservation property | Proof |
| --- | --- |
| Observer throw cannot change a successful API result | pre-existing `api-operation-runner.test.ts` "does not change a successful result when observation fails"; `console-operation-observer.test.ts` "never throws when the logger itself fails" |
| Mapped API error still returned when observer fails | `api-operation-runner.ts` wraps `observe` in try/catch after rethrowing the mapped HttpException; `api-exception.filter.ts` commits the safe response before observing (pre-existing behavior, unchanged) |
| Collector throw cannot change EmployeeClient success result | `native-telemetry-business-preservation.test.ts` "a real EmployeeClient still resolves a success payload unchanged" (identical result with always-throwing collector vs healthy) |
| Collector throw cannot change the mapped business error | same file "a real EmployeeClient still maps its API error identically" (code/status/message equal) |
| Throwing recorder at the production seam is harmless | same file "the production seam (createNativeEmployeeClient) survives a throwing recorder" |
| Transport errors rethrown as the original instance | `native-telemetry.test.ts` / `native-telemetry-surfaces.test.ts` "rethrows the original unchanged" (toBe identity) |
| Auth transport failures rethrow original error after recording | `native-auth-http.ts` catch blocks rethrow `error` unchanged (source review) |
| Ring stays bounded under repeated failure (no unbounded growth, cheap per event) | `native-telemetry-business-preservation.test.ts` "repeated failures ... stay bounded and cheap" (10k iterations, size stays at limit) |
| Telemetry construction cannot break bootstrap | `native-production-bootstrap.ts` wraps `createNativeTelemetry()` in try/catch → no-op registry; `native-telemetry.test.ts` registry default tests |
| No custody mutation / audit count / retry trigger from telemetry | No telemetry file writes to any store other than the in-memory ring; no audit import anywhere in telemetry code (§19 sweep, this review); no retry/replay path reads telemetry |

## Explicitly recorded gaps

- **Crash/ANR collection NOT implemented.** MOB-024A does not claim it: there
  is no crash/ANR collector, no Sentry/vendor, and no test or doc in this task
  asserting crash or ANR collection. The plan's crash/ANR clause stays open
  until an approved collector decision exists. The code contains no crash/ANR
  claims (verified by grep).
- **Physical device evidence NOT performed** for MOB-024A. No runtime-on-device
  verification of any recorded event, lifecycle transition, or overhead
  measurement was run in this task.
- **MOB-024B runbooks still required** (support/outage/Web fallback). This
  record does not close them; MOB-024A output is local diagnostics only.
- **G7 NOT closed by MOB-024A.** The gate needs MOB-023B + MOB-024B per the
  plan; observability alone cannot close it.
- **Native telemetry sink is a bounded in-memory ring (200 events), no remote
  sink.** Per the dependency boundary there is no approved telemetry vendor.
  What support can do today: open the Shift screen and read the sanitized
  diagnostics card (provenance + newest ≤10 events), or read
  `owner.snapshot()` locally on the device for correlation with a requestId.
  The card is intentionally limited to the authenticated active-Shift screen;
  there is no separate Help/Support route or unauthenticated diagnostics path.
  What it cannot do today: export, tail, or query events remotely; anything
  beyond the newest 200 events is permanently dropped; history before app
  restart does not exist. A future accepted decision would be needed to add
  any export path.
- **Residual `enrichMeasurement` seam:** the runner's spread of enricher keys
  is only as safe as future enrichers; current discipline (server-computed
  numbers only) must be enforced in review, since the Console observer ignores
  enrichment fields entirely.
- **MOB-024A focused review repair (follow-up commit).** ChatGPT's
  independent GitHub review found six gaps; all six are repaired in the
  follow-up commit on this branch:
  1. **Operation correlation** — `EmployeeTelemetryEvent` gained an optional
     `operation` slot sourced ONLY from the closed
     `EMPLOYEE_TELEMETRY_OPERATIONS` table (34 literals; `"other"` is the
     documented bounded fallback). The Native mapper
     (`native-http-operation.ts`) reads the request path only to select a
     closed literal via method + static-segment templates with an `{id}`
     placeholder; raw paths, entity IDs, query strings and poisoned
     segments are never stored. The public event field is typed with the
     literal union, and the runtime sanitizer rejects non-members. Every
     currently used Native route family, including release payment-status,
     maps to a safe operation; unknown routes use only `"other"`. A network
     failure with no requestId is now attributable to a safe class. Proven by
     `native-telemetry-operation.test.ts`,
     `native-telemetry-adversarial-operation.test.ts`, and portable
     sanitizer cases in `employee-telemetry.test.ts`.
  2. **Auth request-id correlation** — `NativeAuthHttpTransport`
     login/refresh/logout events now carry the bounded `X-Request-Id`
     read from the RESPONSE only, on success and error paths; network
     failures (no response) omit it. Credentials/refresh tokens/body never
     enter events. Proven by `native-telemetry-auth-correlation.test.ts`.
  3. **Exactly-once recovery telemetry** — the duplicate
     resolution-recording is removed: `applyNativeIncidentRecoveryResolution`
     is the single recording site; the restore wrapper records only its
     own distinct outcomes (invalidated / storage-unavailable / catch).
     DEC-077 business behavior byte-identical. Proven by exact-count tests
     in `native-incident-recovery-telemetry.test.ts` and shape parity in
     `native-incident-recovery-telemetry-shapes.test.ts`.
  4. **Support snapshot access** — a real LOCAL read-only access path now
     exists: `native-support-diagnostics.ts` (pure bounded row builder)
     plus `NativeShiftDiagnosticsCard` rendered at the bottom of the active
     Shift screen, showing localized labels, provenance
     (appVersion/appBuild/platform), the event count, and the newest ≤10
     sanitized one-line events including bounded operation correlation. Still
     local, bounded, sanitized, non-authoritative, non-persistent; no remote
     sink, no vendor, no export. Proven by
     `native-support-diagnostics.test.ts` and
     `native-support-diagnostics-card.test.tsx`.
  5. **Cold-start** — `createNativeProductionBootstrap()` now records ONE
     lifecycle `cold-start` event per bootstrap initialization. The mounted
     production shell owns one bootstrap value through its React `useState`
     initializer, distinct from foreground/background transitions. Proven by
     `native-cold-start-telemetry.test.ts`. No process-death persistence
     invented; telemetry stays memory-only.
  6. **API observer logger context** — `ConsoleOperationObserver` uses the
     neutral `OperationObservability` NestJS logger context (it serves
     shifts/payments/push/parking/tracking/retrieval, not only check-in);
     fields and fail-open behavior unchanged.
- **Idempotency-key/operation-id surfaces emit no telemetry** and telemetry
  requestIds are never used as authority anywhere (§11/§19 hold by design and
  source review).

## iOS portability notes

- Portable (no platform imports): vocabulary, sanitizer, fail-open wrappers
  (`packages/employee-client/src/employee-telemetry-*`); Native owner, bounded
  ring, registry, HTTP transport wrapper (`native-telemetry-owner.ts`,
  `native-http-telemetry.ts`, `native-telemetry-types.ts`); OCR mapping
  (`native-plate-ocr-telemetry.ts`).
- Android-specific: `native-telemetry-provenance.ts` is the only telemetry
  module importing `expo-application`/`react-native` (provenance reader);
  `android-expo-notification-adapter.ts` (FCM push adapter feeding push
  classifications) is Android-only.
- Likely iOS counterpart: same owner/ring/vocabulary unchanged; provenance via
  the same `expo-application` values on iOS (`nativeApplicationVersion` /
  `nativeBuildVersion` / `Platform.OS === "ios"`, already handled as bounded
  strings); push provider differs (APNs), so the push adapter needs an iOS
  implementation behind `NativePushPlatformAdapter`.
- Known iOS crash/lifecycle collection gaps: no crash/ANR collection on either
  platform; lifecycle classification covers cold-start (once per production
  bootstrap initialization) plus foreground/background
  transitions; iOS background/foreground semantics and kill-restore flows are
  untested and explicitly not claimed.

## Automated validation (final repair review, local only)

- Focused portable telemetry: 3 files / 135 tests passed.
- Focused Native telemetry/auth/recovery/support/cold-start: 13 files / 89
  tests passed after correcting one directly related test-fixture default and
  rerunning that file (6/6).
- Focused API observer/request-ID/runner: 3 files / 28 tests passed.
- Full `@valet/employee-client`: 69 files / 619 tests passed; lint, typecheck
  and build passed.
- Full `@valet/valet-native`: one unrelated load-sensitive push-bootstrap test
  failed in the package run; its required exact isolated rerun passed 1/1, so
  it is classified load/flaky and no further investigation was performed.
  Native lint and typecheck passed.
- API full DB-heavy suite was intentionally not run for this repair. API
  focused tests, lint, typecheck and build passed.
- `architecture:check` passed (only pre-existing grandfathered-size warnings);
  targeted Prettier passed, and `git diff --check` passed.
- No package install, DB/schema/migration, dependency, or lockfile change was
  made. These results are LOCAL COMMAND VERIFIED only: no runtime/device,
  physical, or CI verification was performed or observed.

MOB-024A remains OPEN pending review/merge; MOB-024B and G7 remain open.
