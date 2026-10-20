# Issue #304 — refined Option 3 independent Edge QA

**Executed:** 2026-10-20T19:31:28.724Z. Final tested assembled HTML SHA256:
`31e655ee1dc83311ea473705661a32638d59a17bf13c4d50ee6a00fc0ec939f2`. This report covers only option-3.html.

**2975 PASS / 8 FAIL / 0 NOT RUN.**
**8 inherited shell failures; 0 Option 3 or test failures.**

## Six live demo KPIs (synthetic fixture)

| Scope | Active key slots | Keys available | Keys in use | Active parking spots | Spots available | Spots occupied |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Location A expected | 6 | 2 | 4 | 7 | 3 | 4 |
| Location B expected | 2 | 1 | 1 | 2 | 1 | 1 |

Actual verification: 480/480 exact values,
480/480 rendered KPI cards,
480/480 localized captions,
480/480 computed font-size checks.
Counts run with both family tabs active, EN/AR, Light/Dark, both Locations and A→B→A restoration.

## Vehicle and keyboard parity

- Vehicle/list truth: 96/96.
  Selected-detail identity: 96/96.
- Occupied plate prominence in list: 32/32.
  Prominence in detail: 32/32.
- Inactive state truth: 32/32.
- Shell-native font: 16/16.
  Title size: 16/16.
  Interior offscreen controls: 16/16.
- QR opens: 2/2.
  Focus containment: 2/2.
  Escape: 2/2.
  Focus return: 2/2.
  Create preview: 2/2.

## Screenshots and material limits

Captured 50 actual Edge images under
evidence/screenshots/option3-refined-*.png; examples: [option3-refined-320-ar-dark-loc-a.png](screenshots/option3-refined-320-ar-dark-loc-a.png), [option3-refined-390-en-light-loc-a.png](screenshots/option3-refined-390-en-light-loc-a.png), [option3-refined-768-ar-light-loc-b.png](screenshots/option3-refined-768-ar-light-loc-b.png), [option3-refined-1440-en-dark-loc-b.png](screenshots/option3-refined-1440-en-dark-loc-b.png).
32 requested A/B responsive visual states: 32/32 screenshots;
16 selected vehicle-detail screenshots and 2 QR previews
(50 total).
All screenshots are from the single real Edge QA runner, not a CSS proxy.

The shared fixed-height VAYLET Dashboard topbar can wrap/sign-out overlap at
320px and 390px. Those checks remain individually recorded under
inherited-topbar-spill, and are not treated as Option 3 regressions.
The static QR images do not prove live QR scanning, and synthetic fixture
preview forms cannot prove production persistence, authorization or APIs.

## Observed failed checks

| Name | Count | Classification | One exact context |
| --- | ---: | --- | --- |
| inherited-topbar-spill | 8 | Inherited frozen shell P1 | {"width":320,"locale":"en","theme":"light","detail":"sign-out bottom minus topbar bottom = 36.296875px"} |

Machine-readable full results and exact font/geometry values:
[option3-refined-results.json](../qa/option3-refined-results.json).
