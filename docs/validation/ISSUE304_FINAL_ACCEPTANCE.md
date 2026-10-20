# VAYLET Issue #304 — final acceptance ledger

Status at source SHA 557edace23fdb37d7cf308491995c48dc405380c: VISUAL GO / integrated synthetic-browser and focused source checks PASS; overall release PENDING independent security, PR/CI and schema rollout gate. Evidence was committed separately as 0fa8ae1740382f2a2b7668cfcbad1f14639d9375 without product-source modifications. No main merge or deployment performed by this report.
Date: 2026-10-21.

## Immutable baseline

- Approved Option 3 HTML: design/issue304/option-3.html.
- SHA-256: 31e655ee1dc83311ea473705661a32638d59a17bf13c4d50ee6a00fc0ec939f2.
- Design preservation commit: 14d9116739843d99836f9ebbd0a67b67faf986a7.
- Original main: a3779327690debc1ec561760641502967603c5f2.
- Current candidate: 557edace23fdb37d7cf308491995c48dc405380c on feat/issue-304-option3-production-integration.

## Recorded acceptance gates

| Gate | Measured evidence | Status |
| --- | --- | --- |
| Approved design baseline | Exact HTML SHA verified; approved source unchanged | PASS |
| React Option 3 with live projected data | 16 responsive states, Key and Spot selected details, six KPI scopes | PASS in synthetic integrated browser |
| W5 mobile Header | 8/8 original spill conditions contained with all controls; desktop preserved | PASS in synthetic integrated browser |
| Modal visual | 64/64 interactive; 52 exact rectangles; 12 QR only +1px; 0 >1px; Arabic QR caption localized | W1 INDEPENDENT GO / PASS |
| Native 200% browser page zoom | Chrome tabs.setZoom(2), innerWidth 1280→640, DPR 1→2, keyboard still usable | PASS |
| Correct scoped KPIs and A→B→A | 16/16 synthetic browser scenarios; server filters before LIMIT, full-Location counts | PASS in synthetic browser and isolated PG tests |
| Scope authorization | CA, LM authorized; Supervisor denied; 403 stale data cleared, 4/4 browser | PASS in synthetic browser; production not tested |
| Final complete non-modal browser matrix | 80/80 Playwright tests against locally built source SHA 557edace, including Key/Spot, KPIs, scope, paging, keyboard and real native browser 200% zoom | PASS on locked source |
| Exact-source resource unit suite | Contracts 4/4, API overview/cursor/idempotency 12/12, Dashboard interaction and UI 24/24 focused Vitest tests | PASS on release-candidate source |
| Paging, resource details, custody, QR intent | 4 interaction tests, 2 pagination over 125 items each resource type, vehicle/QR rendered | PASS in synthetic browser |
| Repeated Spot create, MFA and label idempotency | Focused React, API and PostgreSQL regressions recorded in code and backend ledger | PASS in local focused suites |
| Dashboard production build | Next.js 16.2.11, 26 static/dynamic routes including /keys | PASS on candidate SHA using loopback API_ORIGIN |
| Workspace source checks | architecture:check, monorepo typecheck 11/11, Dashboard eslint --max-warnings=0 | PASS |
| Independent exact-SHA P0/P1 security audit | Earlier independent W7 findings remediated; new read-only review underway | PENDING |
| Migration deployment and staging privilege smoke | Additive nullable KeySlot.label tested with disposable PG, not production | STAGING/DEPLOYMENT NOT RUN |
| GitHub PR and exact pushed SHA CI | No PR/CI check verified as of this ledger | PENDING |
| Production deployment | Explicitly excluded by owner | NOT RUN |

The **80/80 non-modal browser suite was rerun successfully** against a fresh local production Next build of exact product source revision `557edace` after the final locale/wrapping fixes. Earlier runs remain historical. The **64/64** dialog matrix and production build also ran on `557edace`. The subsequent `0fa8ae17` commit records tests, reports and evidence without modifying product code; exact pushed-head CI must still run on the final PR SHA. Synthetic fixture success is not proof of live production API or database rollout.

## Evidence inventory

- docs/validation/ISSUE304_OPTION3_VISUAL_PARITY.md — final visual metrics and approved hash.
- docs/validation/issue304-w6/modals-release-557edace/ — 64 JSON plus 128 approved/integrated PNG, no personal customer records.
- docs/validation/issue304-w6/key-detail-final/, spot-final/, visual-final/ — selected and responsive production-browser comparisons; 80-case suite also rerun PASS against final product source without modifying those immutable image files.
- docs/validation/issue304-w6/zoom-final/native-tab-zoom200.json — genuine browser zoom evidence.
- docs/validation/ISSUE304_BACKEND_RESOURCE_CONTRACTS.md — SQL, real custody and grant/migration API details.
- docs/validation/ISSUE304_MOBILE_HEADER_FIX.md — exact scoped CSS fix and measured rectangles.
- docs/validation/ISSUE304_VISUAL_FREEZE_MANIFEST.md — reference protection, breakpoints, allowed exceptions.

## Mandatory stop conditions and rollback

Do not merge if a material unapproved visual delta, tenant/Location access leak, stale session response, missing create MFA, incorrect resource occupancy, QR identity mismatch, fabricated vehicle/custody, cursor gaps or unknown availability is found. Use last reviewed main build for rollback; do not drop the additive column or erase custody events. Apply the forward-only label migration/least-privilege grants before any backend activation relying on them, under an approved database change window. No production SQL or deployment action is performed as a side effect of PR creation.

## Exact final declaration (as currently evidenced)

- APPROVED OPTION 3 VISUAL PARITY: PASS for modal gate (W1 independent); final PR exact-SHA release acceptance remains conditional on security/CI.
- UNRELATED DASHBOARD UI CHANGES: ZERO source changes other than approved mobile Header geometry, pending full visual review of unrelated routes.
- MOBILE HEADER OVERFLOW: RESOLVED in synthetic integrated/browser conditions.
- REAL RESOURCE DATA AND ACTIONS: VERIFIED at source and authorized synthetic integration-test level, NOT VERIFIED against production or a deployed API.
- SECURITY AND AUTHORIZATION: local focused/synthetic tests PASS; final independent release security audit PENDING.
- EXACT-SHA CI: PENDING until PR is pushed and GitHub checks observed.
- OVERALL MERGE/DEPLOYMENT: NO-GO until remaining gates are satisfied.
