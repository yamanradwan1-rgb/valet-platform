# Issue #347 — authorized intake-stopped feedback

Implementation base: `462a2907ef080674413631248047a8d564f45b72` (fetched origin/main).
Branch: `fix/issue-347-intake-stopped-error-ui-frozen`.
All database and HTTP checks used disposable local PostgreSQL 17.11 databases,
synthetic staff/vehicles/customers and runtime roles. No production access,
deployment, migration change, PR, merge or issue closure.

## Cause and narrow change

`authorizeCheckInLocation` rejected `accepting_intake=false` before persisted
membership, Organization, Location grant and allowed-role authorization. The
result was the generic authorization failure. Web then discarded the API code
when storing `error.message` as a string.

New intake alone opts into authorization before intake-state classification.
It checks the returned persisted intake flag immediately after full authorization,
before operation lookup, vehicle/customer/session creation or guest issuance.
The original User -> shared Location lifecycle -> membership -> Organization /
Location -> Location grant lock ordering and transaction ownership are retained.
All locks remain held through the state check and transaction termination.
Serializable conflicts retain their existing bounded retries. The deterministic
`LOCATION_INTAKE_STOPPED` denial rolls back and is never retried.

The API returns HTTP 409 and the existing `{code,message,requestId}` envelope.
The mapper uses fixed safe English server copy, not an arbitrary error message.
Unauthorized requests retain the existing custody/authentication denial family
and safe HTTP 404/401 presentation. Missing grant, wrong role and foreign tenant
have the same codes whether intake is open or stopped; only authorized active
scope receives the new operational code. Unknown/inactive scopes remain denied.
Recognition and OCR keep their prior helper behavior. No new Shift,
entitlement or session policy is introduced; existing guards remain in place.
No schema, privilege, flag or management lifecycle implementation changes.

Portable EmployeeApiError, transport, FAILURE/AMBIGUOUS classification, form
snapshot and idempotency implementation already support this definite 409.
Focused tests lock that behavior without changing the portable runtime.
Native returns to Customer Contact, preserves captured/recognized vehicle and
phone, and retains no pending ambiguous operation. Its next deliberate Continue
uses a fresh operation identity, as before. Web retains its existing operation
identity for a deliberate retry. Neither path automatically replays a rejection.

Native adds only localized dictionary/copy/presentation mappings, reusing the
unchanged CheckInError and its existing assertive accessibility live region.
Web carries only this specific code through the controller, hook and flow;
clearing/replacing an error also clears its code. Other errors retain generic
presentation. The existing Customer Phone error div and exact classes are reused;
only this code appears directly before Continue, with `role="alert"`.

Exact copy:

- AR: هذا الفرع لا يستقبل سيارات جديدة حاليًا. تواصل مع إدارة الفرع.
- EN: This location is not accepting new vehicles right now. Contact the location manager.

The only updates in the existing #346 / lifecycle race tests are three expected
intake-denial code assertions; Resume Intake code, management authority, audit
and UI are unchanged.

## Executed checks

Commands were run from the repository root with Corepack pnpm 10.34.5.
Counts below are final executed test counts, not estimates.

| Command | Result | Tests |
| --- | --- | ---: |
| `corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/issue347-intake-stopped.integration.test.ts test/issue347-intake-state-races.integration.test.ts test/issue346-resume-intake.integration.test.ts test/management-location-races.integration.test.ts test/intake-session-command.integration.test.ts test/check-in-api.integration.test.ts` | PASS, 6 files | 68 |
| `corepack pnpm --filter @valet/employee-client exec vitest run src/employee-check-in-intake-stopped.test.ts src/employee-check-in-session.test.ts src/employee-check-in-transport.test.ts` | PASS, 3 files | 27 |
| `corepack pnpm --filter @valet/valet exec vitest run src/features/check-in src/lib/i18n src/components/screens/check-in/check-in-intake-stopped-flow.test.tsx` | PASS, 16 files | 77 |
| `corepack pnpm --filter @valet/valet-native exec vitest run test/issue347-native-intake-stopped.test.tsx test/native-check-in-customer-phone.test.tsx test/native-check-in-presentation.test.tsx test/native-check-in-visual-parity.test.tsx test/native-check-in-locale-state-matrix.test.tsx test/native-check-in-localization-contract.test.tsx` | PASS, 6 files | 62 |
| `corepack pnpm --filter @valet/api --filter @valet/employee-client --filter @valet/valet --filter @valet/valet-native typecheck` | PASS, 4 packages | N/A |
| `corepack pnpm --filter @valet/api --filter @valet/employee-client --filter @valet/valet --filter @valet/valet-native lint` | PASS, 4 packages | N/A |
| `corepack pnpm --filter @valet/contracts build` | PASS | N/A |
| `corepack pnpm --filter @valet/employee-client --filter @valet/api build` | PASS, 2 packages | N/A |
| `API_ORIGIN=http://127.0.0.1:3001 NEXT_TELEMETRY_DISABLED=1 corepack pnpm --filter @valet/valet build` | PASS, optimized local build | N/A |
| `CI=true EXPO_NO_TELEMETRY=1 corepack pnpm --filter @valet/valet-native exec expo export --platform android --output-dir /workspace/scratch/issue347/native-export` | FAIL: required Customer App origin absent; rerun below passed | N/A |
| `CI=true EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_CUSTOMER_APP_ORIGIN=https://customer.issue347.test corepack pnpm --filter @valet/valet-native exec expo export --platform android --output-dir /workspace/scratch/issue347/native-export` | PASS, Android Hermes bundle; synthetic build-time origin, no service request | N/A |
| `corepack pnpm architecture:check` | PASS; existing grandfathered-file warnings | N/A |
| `git diff --check` | PASS | N/A |
| `python /workspace/scratch/issue347/verify-visual.py` | PASS, 24 baseline comparisons + 12 stopped-error cases | 36 visual cases |
| Android APK/emulator/device + TalkBack runtime acceptance | NOT RUN: no Android SDK/device/emulator/adb available | 0 |

API coverage includes both intake roles, open intake, revoked membership/User /
session, expired session, inactive Organization/Location, missing grants, wrong
roles, foreign/unknown Locations, Stop/Intake ordering and both Resume/Intake
orderings. A blocked membership revocation cannot obtain the paused-state code.
Denied operations preserve full tenant business-row snapshots for Vehicle,
Customer, ValetSession, intake operation, Task, Dispatch, Payment, key custody,
audit and outbound intent/delivery/envelope. A guest issuance spy is not called;
the deterministic command opens exactly one transaction. Normal replay remains
idempotent after a deliberate successful attempt.

Portable tests cover typed transport propagation, definite failure for plate,
descriptor and recognized vehicles, preserved phone/details/scope, no recovery /
automatic retry, normal deliberate identities and unchanged timeout/network/500
ambiguity. Native component tests cover exact EN/AR copy, RTL/LTR text style,
Light/Dark palettes, one announcement and unchanged controls/styles. Web tests
cover controller -> hook/flow presentation boundaries, input value and vehicle
retention, code clearing, error placement/style/accessibility and unrelated copy.

## UI freeze evidence and limits

Only visible changes: the approved localized error text; Web placement of that
specific error immediately before Continue; natural wrapping of that text.
Web adds a nonvisual alert role. Native's existing live region is unchanged.

No header, Location header, vehicle card, Customer Contact structure, phone
input, country selector, Continue / No Phone control styling, color, typography,
spacing, navigation, global CSS, Native styles, other Native screens, general
Employee Web UI or Dashboard implementation is changed.

The visual harness rendered the real existing Web Customer Phone component and
its i18n provider under current application CSS in local Chromium. It covered
EN/AR with LTR/RTL, Light/Dark browser color schemes and widths 320/390/768.
It did not contact a backend. Baseline screenshots were captured before the UI
change, then stable comparisons recaptured the exact base component source to
eliminate development-indicator and RTL-hydration timing noise. The temporary
local route was removed before the build/commit; no test route ships.

For no error and unrelated generic error, all 24 cases have identical control
state, classes and bounding rectangles. 22 screenshot pairs are pixel-identical;
two differ only by 1/255 channel antialiasing at 8 and 14 phone-input corner
pixels, with identical geometry. No application CSS/style changed.
All 12 new-error cases fit the existing error container without clipping or
button overlap, retain the input value, and preserve every control's dimensions.
The existing phone row already overflows the 320 viewport in the isolated base
component; this pre-existing behavior is identical and was left unchanged under
the UI freeze. The new error itself fits that viewport.

[Recorded matrix](../evidence/issue-347/web-visual-assertions.json) and representative
[EN baseline](../evidence/issue-347/web-before-en-light-390.png),
[EN after](../evidence/issue-347/web-after-en-light-390.png),
[AR generic baseline](../evidence/issue-347/web-before-ar-dark-390-generic.png),
[AR generic after](../evidence/issue-347/web-after-ar-dark-390-generic.png),
[EN stopped at 320](../evidence/issue-347/web-stopped-en-light-320.png),
[AR stopped at 320](../evidence/issue-347/web-stopped-ar-dark-320.png).

Native component tests and Android JS export are not Android runtime screenshots,
TalkBack verification or physical-device acceptance. Runtime wrapping, focus,
scrolling and appearance at the requested Android viewports remain unverified.
Overall UI Freeze status: **NOT FULLY VERIFIED** until that acceptance is executed.
