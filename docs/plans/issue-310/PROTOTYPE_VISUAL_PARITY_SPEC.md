# Issue #310 — Native WhatsApp prototype visual parity specification

Status: prototype specification; **PENDING OWNER DESIGN APPROVAL**.
Reconciled 2026-11-14 against the latest [Owner selections](OWNER_DECISIONS_RECONCILIATION_2026-11-14.md). Current task baseline: `0a1d40c0`. Original captures/copy are historical; current capture attempts/source identity are under `qa-artifacts/owner-2026-11-14/`. **Fresh Native visual evidence: PARTIAL — no new PNG accepted.**
Plan commit pushed first: `eeaa522717efd37e3041b7b1e208bddc6394d65f`.
Original UI source: `de338f4da187297aacd0fc7005ece9b6f041fe61` (unchanged by the plan).

## Scope and contract ledger

- LOCKED: reuse `NativeCheckInParkingTaskStep` and existing Native shell primitives. Insert only one green WhatsApp-logo control immediately after Guest Access. Existing card, Open Parking, notice, vehicle, status, header, navigation, styles and callbacks stay unchanged.
- LOCKED: prototype only; no new production send, API/client, credentials, consent, schema, provider or runtime activation.
- DERIVED: a development-only optional presentation slot allows the fixture to render the control without adding an action to production callers. No production caller supplies it; release mode ignores it even if supplied.
- OWNER DIRECTION SELECTED: manual-only, actual Check-In capability, one-step phone-entry UX, no per-tap rotation/resend, immediate Sending and visible-disabled availability. TECHNICAL CONTRACT PENDING: the real command/status/evidence/central sender/credential/retry mechanisms in the master plan. Local simulated transitions do not establish those contracts.

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

Label and status stay inside the new control. Logo is decorative; accessible button name includes WhatsApp and the localized state. Visible labels contain no Demo/تجريبي prefix or leading separator. The non-visible hint explains simulation/no actual message; the Delivered hint explicitly says it is simulated, not provider evidence. Respect EN/LTR and AR/RTL, readable wrapping/text scaling, disabled and busy accessibility states, and a polite live region. No banners, alerts, overlays, extra panels or decorative copy are added around the control.

## Demonstration states

| Fixture state | English visible label | Arabic visible label |
|---|---|---|
| default / pressed | Send via WhatsApp | إرسال عبر واتساب |
| loading | Sending… | جاري الإرسال… |
| queued | Queued by VAYLET | في قائمة إرسال VAYLET |
| accepted | Meta accepted | قبلت Meta الطلب |
| failed | Failed | تعذّر الإرسال |
| unknown | Outcome unknown | نتيجة الإرسال غير معروفة |
| delivered | Delivered | تم التسليم |
| disabled | Unavailable | الإرسال غير متاح |

The Owner rejected the earlier visible Demo prefixes; the table above supersedes that copy without changing styling. Default/pressed tap immediately sets local loading with spinner and busy/disabled on the same button, then a 900ms local timer illustrates Queued. No state comes from a backend; Queued/Meta accepted/Delivered are separate finite fixtures, not authenticated facts. Changing states is a design interaction, not future retry policy. Route parameters cannot supply a recipient, token, URL or live session.

## Activation and production isolation

Development route: `/whatsapp-prototype`; query options `locale=en|ar`, `theme=light|dark`, `state=<variant>`, `baseline=1`. Unknown values normalize to safe defaults. The route and optional slot are guarded by `__DEV__`. There is no production navigation entry and no send behavior in any build. The fixture imports no staff API, auth/session runtime, Guest credential or messaging provider. It uses only sanitized static display data and local demonstration state.

Theme review uses the existing appearance selection mechanism inside the fixture and restores the prior preference on exit; the shared theme implementation is not edited. The fixture must not grant notification permission or generate any Guest link. Default original Guest/Open Parking callbacks are tested in the actual component, while the preview's replacements are deliberately inert.

## Baseline and evidence rules

Capture the unchanged component before inserting the slot/control. Save a sanitized rendered-tree baseline for EN/AR and both palettes, and real Native baseline/prototype screenshots when available. The tree baseline is structural/style evidence only. It does not establish pixels, native text shaping or device accessibility.

For real comparisons use identical runtime, dimensions/density, locale/theme, data, fonts, scroll and navigation. Only the new control and unavoidable content-height/scroll difference are permitted. Preserve bottom navigation geometry and use the existing ScrollView so the control stays reachable. Record exact runtime identity and candidate SHA/tree in the validation evidence. No fabricated capture or “100% pixel match” claim.

The original Owner reference screenshot is unavailable locally. Retain physical Android/Owner-reference/TalkBack/large-font review as unverified when not performed. New paired captures must use the same current source/runtime and only omit the optional control with `baseline=1`; original Parking Task/source/style baselines remain unchanged. Compare all original product pixels with transparent system/new-control masks and record exact source identity. Old captures with Demo text cannot verify current copy.

## Visual acceptance checklist

- [x] Button is immediately beneath Guest Access; original component tree/styles unchanged when it is omitted.
- [x] Release-mode tests and normal-caller inspection show no prototype action.
- [x] Old Guest/Open Parking callbacks retain the original session/handler semantics.
- [x] Exact new EN/AR states and unchanged logo/theme styles tested; prior captures remain historical.
- [ ] Fresh default/Sending/remaining states in EN/AR, Light/Dark and small/standard Native captures; emulator attempts did not reach a usable fixture.
- [x] Accessibility props supply localized name/busy/disabled/state information; physical screen-reader speech remains unverified.
- [ ] Current-copy Native pixel parity, scroll/label-fit and readability; original historical geometry proof is not new-copy capture evidence.
- [x] Static call-path review and current component/lifecycle tests establish local-only behavior; no new successful emulator tap is claimed.
- [ ] Owner explicitly approves the design before any real feature implementation.
