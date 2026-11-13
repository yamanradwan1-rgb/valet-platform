# Issue #310 — Native WhatsApp prototype visual parity specification

Status: prototype specification; **PENDING OWNER DESIGN APPROVAL**.
Plan commit pushed first: `eeaa522717efd37e3041b7b1e208bddc6394d65f`.
Original UI source: `de338f4da187297aacd0fc7005ece9b6f041fe61` (unchanged by the plan).

## Scope and contract ledger

- LOCKED: reuse `NativeCheckInParkingTaskStep` and existing Native shell primitives. Insert only one green WhatsApp-logo control immediately after Guest Access. Existing card, Open Parking, notice, vehicle, status, header, navigation, styles and callbacks stay unchanged.
- LOCKED: prototype only; no new production send, API/client, credentials, consent, schema, provider or runtime activation.
- DERIVED: a development-only optional presentation slot allows the fixture to render the control without adding an action to production callers. No production caller supplies it; release mode ignores it even if supplied.
- UNRESOLVED: all real command/status/consent/sender/retry decisions in the master plan. Demonstration transitions are not future business policy.

Affected entities: none are created/read/mutated. Displayed session/vehicle/Location/membership are synthetic fixture values. ValetSession, Task and Dispatch transitions: **none**. Authorization/tenant/Location rules: unchanged. DB constraints/indexes/migrations and Company/Location configuration: unchanged. This is an authorized prototype of an approved MVP capability, not production implementation.

## Original layout inventory

Actual production path: `NativeProductionWorkspace` → `NativeCheckInRoute` → `NativeCheckInWorkflow` → `NativeCompleteStep` → `NativeCheckInParkingTaskStep`.

1. `EmployeeFrame` / `EmployeeAppHeader` with existing account utility and Location.
2. `CheckInHeader` with current Back/title.
3. Existing scroll body (`checkInStylesTheme.body`): 20dp padding, 16dp gap.
4. Parking badge, existing VehicleCard, foreground tracking notice.
5. Existing blue Open Parking action.
6. Existing Guest Access card and its navigation callback.
7. **Only addition:** WhatsApp demo control.
8. Existing 72dp `NativeProductionNavigation`, pinned as it is for Check-In.

No existing source styles, typography, colors, copy dictionaries, assets, interactions, navigation or theme implementation may change. The development fixture composes the actual header/body/navigation, not an HTML imitation. Its business callbacks are inert to avoid real operational effects; production callbacks remain unchanged and are regression-tested.

## New control proposal

Full content width; 56dp minimum height, existing 16dp primary radius, existing 15dp employee button typography, 16dp horizontal padding. Green background with white text; selected colors must meet 4.5:1 normal-text contrast. Existing `react-native-svg` renders a bundled recognizable phone/chat WhatsApp mark; no dependency addition.

The glyph is the [Simple Icons WhatsApp vector](https://github.com/simple-icons/simple-icons/blob/develop/icons/whatsapp.svg), distributed under [CC0](https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md). Brand/trademark ownership is unchanged. Colors live in a fixture-only palette, leaving shared tokens/palettes untouched. Existing appearance guards receive only an exact-path exception for that palette and the one new style-sheet identity; all original baseline entries remain compared, and no baseline snapshot is rewritten.

Label and status stay inside the new control. Logo is decorative; accessible button name includes WhatsApp and the localized Demo state. Respect EN/LTR and AR/RTL, readable wrapping/text scaling, disabled and busy accessibility states, and a polite live region. No banners, alerts, overlays, extra panels or decorative copy are added around the control.

## Demonstration states

| Fixture state | Meaning of demonstration only |
|---|---|
| default | Demo · Send via WhatsApp |
| pressed | deterministic pressed visual; also real touch feedback |
| loading | Demo · Requesting; busy/disabled |
| queued | Demo · Queued by VAYLET |
| accepted | Demo · Meta accepted; no delivery claim |
| failed | Demo · Failed; no real retry policy |
| unknown | Demo · Outcome unknown; no remote resend |
| delivered | Demo · Delivered (webhook); prospective signed-fact design |
| disabled | Demo · Unavailable; no actionable send |

Every state is visibly labeled Demo, including delivered. No state comes from a backend. A local tap sequence may briefly show loading and then queued; other variants can be selected deterministically from the development route. This is a visual sequence, not accepted production semantics. Route parameters cannot supply a recipient, token, URL or live session.

## Activation and production isolation

Development route: `/whatsapp-prototype`; query options `locale=en|ar`, `theme=light|dark`, `state=<variant>`, `baseline=1`. Unknown values normalize to safe defaults. The route and optional slot are guarded by `__DEV__`. There is no production navigation entry and no send behavior in any build. The fixture imports no staff API, auth/session runtime, Guest credential or messaging provider. It uses only sanitized static display data and local demonstration state.

Theme review uses the existing appearance selection mechanism inside the fixture and restores the prior preference on exit; the shared theme implementation is not edited. The fixture must not grant notification permission or generate any Guest link. Default original Guest/Open Parking callbacks are tested in the actual component, while the preview's replacements are deliberately inert.

## Baseline and evidence rules

Capture the unchanged component before inserting the slot/control. Save a sanitized rendered-tree baseline for EN/AR and both palettes, and real Native baseline/prototype screenshots when available. The tree baseline is structural/style evidence only. It does not establish pixels, native text shaping or device accessibility.

For real comparisons use identical runtime, dimensions/density, locale/theme, data, fonts, scroll and navigation. Only the new control and unavoidable content-height/scroll difference are permitted. Preserve bottom navigation geometry and use the existing ScrollView so the control stays reachable. Record exact runtime identity and candidate SHA/tree in the validation evidence. No fabricated capture or “100% pixel match” claim.

The Owner reference screenshot was not included in the accessible pasted request. Compare actual source-derived baseline; explicitly retain physical Android/Owner-reference review as unverified when unavailable.

## Visual acceptance checklist

- [x] Button is immediately beneath Guest Access; original component tree/styles unchanged when it is omitted.
- [x] Release-mode tests and normal-caller inspection show no prototype action.
- [x] Old Guest/Open Parking callbacks retain the original session/handler semantics.
- [x] Green/logo, EN/AR and both themes captured; all states tested, with EN/Light variant captures.
- [x] Accessibility props supply localized name/busy/disabled/state information; physical screen-reader speech remains unverified.
- [x] Small/standard Android emulator captures establish bounded visual parity and scroll reachability.
- [x] Static call-path review, component tests and local emulator taps establish demo-only behavior.
- [ ] Owner explicitly approves the design before any real feature implementation.
