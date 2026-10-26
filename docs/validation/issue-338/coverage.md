# Issue 338 Customer primary branding coverage

Base: `02fbee5512895fff2870d88f93d40d8edcefe44f` (fetched main). Isolated branch:
`fix/issue-338-customer-primary-branding-ui-frozen`.

Pre-code assessment: affected projection is GuestSafeSession.branding, resolved
server-side from persisted ValetSession → Location → Organization. No entity,
state transition, Task/Dispatch, authorization, persistence, index, configuration
policy, API or contract change. Accepted DEC-062/085 and #185/#239 remain intact;
this is the approved basic-branding MVP. Existing target TS/TSX files are under
300 lines; palette derivation and context selection will be small focused modules.

Baseline: real Customer components exported before runtime edits by
`QA338_RENDER=<before> pnpm --filter @valet/customer exec vitest run qa/issue-338/render.test.tsx`.
This exports all 22 demo screen renderers, four existing sheets and controls in
EN/AR, light/dark and green/purple/fallback. Browser comparison uses those exact
HTML exports, not manually reconstructed UI. Runtime application verification is
reported separately. Static exports do not prove live authorization or DB writes.

## Initial trace and classifications

There is one Next page (`src/app/page.tsx`), routed by GuestAppRoot into lifecycle
and post-visit states; no separate Customer check-in/enrollment form exists.
Bootstrap/loading/recovery are existing entry states. DemoScreenRenderer also
exposes deferred payment/report views; these are included without activation.

| Actual file/component under apps/customer/src | Exact elements | Previous source | Role / expected source | Required wiring / verification |
|---|---|---|---|---|
| features/session/guest-branding.ts | shell token bundle | rejects any primary failing 4.5 on every surface; blue/hover identical | authoritative primary plus safe derived accent/content | accept every contract-valid hex, split fill/accent; contrast matrix |
| components/layout/app-shell.tsx | scope around header/main/all in-shell sheets | guestBrandStyle of error-free unexpired session | effective session only | reuse selection with sheet; mounted scope tests |
| components/layout/app-header.tsx; components/brand/vaylet-logo.tsx | venue name, logo, header icons | effective displayName; neutral text; fixed VAYLET asset | identity text already correct; product logo/neutral exception | preserve; screenshot geometry/pixels |
| components/primitives/btn.tsx | primary/ghost CTA; spinner | --v-blue; white; currentColor | primary exact fill + contrast foreground; ghost safe accent | fill/hover/pressed/focus/boundary tokens; browser input states |
| components/primitives/journey-progress.tsx | completed/current dots, connectors, labels | --v-blue | brand progress, safe accent for visibility | same derived accent; runtime/screenshot |
| components/primitives/status-badge.tsx | info/active dot/text | --v-blue | informational brand accent | derived accent; success/warning/neutral preserved |
| components/primitives/vehicle-hero.tsx | vehicle icon and backing | --v-blue / --v-ice | branded illustration | accent and primary tint; screenshots |
| components/primitives/info-row.tsx | highlighted values | --v-blue | brand emphasis | existing accent consumption; render test |
| features/session/screen-received.tsx | informational icon/panel | --v-blue / --v-ice | brand-primary | accent + tint; all lifecycle captures |
| features/session/screen-on-the-way.tsx | pulse/text, ETA icon/panel | --v-blue / --v-ice | brand-primary | accent + tint; all lifecycle captures |
| features/session/screen-ready.tsx; screen-completed.tsx | information/card backing; success badge/check | --v-ice; success token/green tint | neutral/security/status exception | preserve backing and success semantics; screenshots |
| features/session/screen-parked.tsx | request CTA, highlighted info, vehicle illustration | shared Btn/InfoRow/VehicleHero | brand-primary | shared consumers; captures |
| features/session/screen-verifying.tsx; app/guest-session-loading.tsx | spinner segment | --v-blue | brand progress | safe accent; no loading behavior changes |
| features/retrieval/screen-requested.tsx; overlay-confirm-request.tsx | progress/panel/icon, confirmation CTA | --v-blue / --v-ice / Btn | brand-primary | accent/tint/Btn; screen/sheet captures |
| features/handoff/screen-ready-pin.tsx; screen-ready-qr.tsx; components/primitives/pickup-pin.tsx | progress, refresh actions; code/QR/security surfaces | --v-blue; --v-ice; neutral digits; white QR | refresh/progress brand; security/urgency exceptions | safe accent on refresh; preserve security backing/digits/QR; captures |
| components/primitives/trust-strip.tsx | security shield and backing | --v-blue / --v-ice | security/trust, not tenant brand | decouple shield from runtime accent, retain existing light/dark blue and ice |
| features/deferred/overlay-more-menu.tsx | menu icons, selected theme switch/white thumb | --v-blue / white | icons and switch brand; labels neutral | accent; exact fill + safe on-primary thumb; capture |
| features/deferred/guest-information-content.tsx | contact/privacy links | --v-blue | brand link | safe accent/focus; existing loading/empty/error remain unchanged |
| features/auth/overlay-guest-context-conflict.tsx | continue-current CTA in sibling sheet | Btn outside AppShell | current scoped brand | same central token function at BottomSheet boundary; isolation test |
| features/deferred/overlay-vehicle-details.tsx | neutral details/highlight via InfoRow | shared primitives | only existing highlighted info brand | shared consumption; sheet capture |
| features/deferred/screen-payment.tsx; screen-payment-method.tsx; screen-report-issue.tsx | selected tip/payment/report controls; bill/vehicle summaries | --v-ice; --v-blue radio/white dot; selectedBorder neutral | selected accents brand; bill/vehicle summaries and selectedBorder stay neutral | tint; exact radio fill/content + safe boundary; captures |
| features/deferred/screen-payment-complimentary.tsx | validation shield, bill summary, total, CTA | --v-blue / --v-ice / InfoRow / Btn | security and neutral exceptions; total/CTA brand | preserve ice and system shield; total/CTA use shared accent/fill |
| features/deferred/screen-payment-success.tsx; screen-report-submitted.tsx | green confirmation; receipt/summary panels and CTA | semantic green/ice/Btn | success/neutral exceptions; CTA brand | preserve green and neutral panels; shared Btn |
| features/payment/guest-payment-summary.tsx | receipt panel, status/payment amounts | ice/neutral/status | neutral and operational exceptions | preserve; post-visit tests |
| features/rating/guest-live-rating.tsx; features/deferred/screen-service.tsx | rating stars; submit/back | warning/amber; Btn | rating meaning, not tenant branding; primary submit brand | preserve stars; shared Btn |
| features/ready-alert/guest-vehicle-ready-alert.tsx | toast border, close action | success / neutral | status exception (also outside shell) | preserve entire toast |
| features/web-push/guest-web-push-permission-card.tsx | enable/not-now buttons | shared Btn | enable brand, not-now neutral | existing AppShell inheritance; frozen JSX remains unchanged |
| app/guest-freshness-notice.tsx; deferred/screen-system.tsx; screen-payment-error.tsx | retry CTA, neutral/warning/danger notices | Btn / status / ice | retry brand; recovery/status exception | shared Btn only; preserve severity |
| features/demo/demo-navigator.tsx | development-only navigation | --v-blue/white, fixed dark overlay | developer tooling, not Guest tenant UI | preserve; never activated in production |
| app/globals.css; lib/theme/colors.ts | blue, ice, static palette, neutral surfaces, animations | theme defaults | fallback and system palette | retain defaults, add narrow brand aliases/states; no geometry edits |
| components/icons/*.tsx; features/handoff/qr-code.tsx | SVG currentColor; QR white/dark | parent/currentColor; scan colors | inherit parent semantics / QR exception | no icon paths/sizes/fills rewritten |

All raw hex/RGB/SVG/inline/token occurrences were searched and then traced through
these actual consumers. Unused legacy static palette exports are compatibility
constants, not active fixed primary accents. Shadows/overlays, theme-color meta,
product logo assets, typography, neutrals and disabled opacity are not branding.

## Final semantic audit

Bill/receipt summaries and the report form's vehicle summary retain `C.iceSemantic`.
Only selected tip/payment/report options use `C.accentSurface`. The complimentary
validation shield is a system/security cue and uses `C.trustAccent`, like
TrustStrip; its backing remains ice. This avoids applying tenant green to
security cues through the old shared `--v-blue` alias. Old #239 globally aliased
that variable for accepted colors, inadvertently including the shield; system
blue is now independent in both themes. Product logo assets stay unchanged.

Exact primary is used for CTA fills and the selected switch/radio fill. Small
progress marks, brand text/icons, radio boundaries and focus use the safe accent
shade so extreme colors remain visible. Existing neutral selected outlines stay
neutral. This is a necessary role distinction, not a different branding source.

Only colors change: primary fill/content, contrast-safe accent, brand tint,
hover/pressed fill, focus ring and an inset one-pixel primary-button contrast
boundary. The inset ring does not alter dimensions. No component was wrapped or
moved; shell and BottomSheet inherit the same locally computed token bundle.
No tokens are written to document/root storage. Existing client/coordinator
ownership fences remain intact; no new async branding state exists.
