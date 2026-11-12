# Issue #432 — Owner Design and Architecture Approval Packet

**Final native-browser zoom verification (2026-11-12, after the earlier diagnostic): PASS for the exercised Variant A / EN / Light viewport.** Chrome for Testing exposed its actual UI control `Zoom: 200%` after five native Ctrl++ presses. With fixed outer window 1296x808, the CSS viewport became 640x360, devicePixelRatio 2 and visualViewport 640x360 at scale 1; the same window at Ctrl+0 was CSS 1280x720, DPR 1. The actual alerts panel was x=102.797..518.797, y=61.5..320.5; its footer y=290.609..319.5 remained within the 640x360 viewport, with document/body scrollWidth 640 and scrollable alert feed (1173/145). Evidence: `qa-artifacts/real-dashboard/variant-a-en-light-640x360-state-actual-desktop-zoom200.png`. Worker1 and Prime verified the native Chrome zoom UI; this is **not** CDP `Emulation.setPageScaleFactor(2)`. Other locale/variant/viewport combinations, physical touch, screen readers and direct Owner-reference parity are not covered by this single check. The optional diagnostic Playwright debug run was deliberately canceled after gathering zoom evidence; the separate full four-spec passing suite is the acceptance run.

**Matched actual-Dashboard pixel comparison (1440x900 EN/light, alert panel closed):** The saved baseline `variant-baseline-en-light-1440x900-state-dashboard-baseline.png` and each clean A/B `variant-{a,b}-en-light-1440x900-state-bell-closed.png` differ only within topbar bounds **x=1069..1311, y=15..49** (4,797 pixels); every pixel outside those bounds is identical in both comparisons. A separate focus-outline capture was intentionally excluded. This verifies unchanged non-alert shell pixels for that specific fixture/viewport and does not establish a match to the unavailable original Owner reference screenshots or every responsive permutation.

**Latest verification and Git state:** After the optional zoom diagnostic, Prime reran all four Issue #432 E2E specs on the current source: **8/8 PASS in 48.4 seconds**, and `apps/dashboard/test-results/.last-run.json` records `passed` with no failed tests. Worktree: `D:\kndoom\valet-platform\tmp\issue-432-management-alerts-prototype-worktree`; branch: `design/issue-432-management-alerts-prototype-master-plan`; baseline HEAD and `origin/main`: `a9c1c06c6632ac9d8f61a7fc8f8f0e87ba207bca`. The authored Issue #432 source/E2E inventory is 32 files, all authored code files at most 300 physical lines, content SHA-256 fingerprint `734418ef1df999f7b9930f2e08311f2a925d325f8a9098cb73e3073c9864ca7c`. These changes remain **local and uncommitted**: preserved historical standalone and temporary QA trace files remain untracked, so a clean scoped Git commit has not been made. No Push, PR, Merge, deployment, feature activation or Issue closure occurred.

**Purpose:** compare two *local, synthetic* Management Alerts designs inside the actual VAYLET Dashboard route, then approve design and proposed architecture before production feature implementation.
**Owner's binding correction:** 2026-11-06 Addendum to GitHub Issue #432 plus the latest 2026-11-12 handoff for a prototype-only borderless bell and local synthetic destination demo.
**Source baseline:** `a9c1c06c6632ac9d8f61a7fc8f8f0e87ba207bca`.
**Prototype package:** `apps/dashboard/src/features/management-alerts/prototype/`, with authenticated fixture E2E in all four `apps/dashboard/e2e/issue432-real-dashboard-prototype*.spec.ts` files and current local review instructions in `apps/dashboard/src/features/management-alerts/prototype/README.md`. **No real customer records or production API/DB calls.** The former standalone `prototypes/issue-432-management-alerts/` lab and screenshots are superseded.

## What the preview demonstrates

The actual `/policies?section=operations&prototype=alerts&variant=a|b` route renders the real `ProtectedDashboardRoute → ManagementFoundationApp → SelectedManagementShell → DashboardShell/Topbar/Sidebar → PoliciesStudioPage` chain. With the Phase1 UI flag OFF, the default `/policies?section=operations` baseline renders no alert bell; the separate original-control fallback passes focused resolver Vitest 2/2. The prototype-only borderless bell retains the original slot, 44×44 target, 18px glyph and count treatment. ALT-08 title/description are one native local anchor to `#SIM-TARGET-INCIDENT-1042` with explicit synthetic source/target IDs and an in-memory **No production record** destination. Unavailable, missing and unauthorized destinations are distinct. Initial hash/reload/new tab, hashchange, Back and Forward restore the synthetic preview. Pointer/keyboard open supports one-shot Tab entry; Shift+Tab from the first panel control returns to the bell with the panel OPEN, then forward Tab exits to the next shell control and closes. Seen success focuses the next still-present eligible action, then nearest preceding eligible action, then Close/panel heading; failure returns to the same row's retry action. **Worker2's final exact-source four-spec headless 8/8 PASS (50.8s, exit 0) and headed/debug 8/8 PASS (7m, exit 0)** validate the exercised synthetic flows, including authenticated manual bell review. This does not prove production exact-source navigation, which still requires source-scoped exact reads and destination by-ID reauthorization.

The event controls illustrate *intended UX*. They do not mean an SSE/WebSocket stream, PostgreSQL publisher, an authentication bypass or rollout currently exists.

## Design variants and recommendation

| Criterion | Variant A — Compact / Minimal Luxury | Variant B — Balanced / Operational Clarity |
| --- | --- | --- |
| Density | Smaller row height; easier to scan many short alerts | More breathing room and a visible two-line reason |
| Visual style | Very restrained separators, less metadata | Clear urgency, Location and source context without card overload |
| Strength | Short operational lists and narrow display space | Owner's complaint about generic `ALT-08` / `Important incident` and ambiguous source becomes visibly addressed |
| Risk | Can become terse or hide key context when localized Arabic wraps | Fewer rows visible without scrolling; needs careful mobile height |
| Accessibility | Needs 44px hit targets despite dense rows | More natural touch and zoom spacing |
| Complexity | Slightly simpler markup | A little more text layout but can reuse same typed content/row primitive |

**A/B selection is unresolved.** The available history does not reliably map an Owner selection to Variant A or B. Retain both variants for comparison and do not treat either as approved. Both variants must pass the same source-fact, synthetic-navigation and authorization rules.

## Design freeze boundaries

| Allowed change after future implementation authorization | Must remain unchanged |
| --- | --- |
| Prototype-only borderless bell in the existing 44×44 hit area/slot, count indicator and anchored dropdown | Outlined production bell/default control, global topbar height, locale/theme/account order, adjacent controls and behavior |
| Anchored non-modal dropdown, loading/error/empty/overflow states | Entire shell/sidebar, other topbar buttons and page content |
| Localized notification rows and explicit OCCURRENCE Seen control | Task/Dispatch/ValetSession operational commands, unrelated dashboard tables |
| Minimal, separately authorized exact-record destination selection | Existing destination-page styling/layout and unrelated navigation |
| Alert-only realtime invalidation, timed eligibility and safe Preview refresh after future approval | #415 Live Operations refresh, global notifications, browser push or outbound messaging |

The existing `FocusDialog` and outlined production bell remain the default when the override is absent. The prototype's ALT-08 native anchor and in-memory `No production record` preview preserve the production pathname/query, with hash restoration for initial load, reload/new tab, `hashchange`, Back and Forward. Distinct unavailable/missing/unauthorized states, pointer/keyboard Tab entry, Shift+Tab-to-bell while open and Seen next→nearest preceding→Close / failure-to-same-row are **source implemented and exercised by the final headless/headed four-spec runs (8/8 PASS each)**. Production exact-source navigation still requires a proven destination route, source-scoped exact read and fresh by-ID authorization; no production record is opened.

## Interactive review guide

Run the local authenticated review command in `apps/dashboard/src/features/management-alerts/prototype/README.md`. It uses `DashboardApiFixture` to create a synthetic Staff session and intercept every `/v1/staff/**` request; no real credentials, production API or database is required. Use `localhost` for the browser origin. Review both variants at English/Arabic, RTL/LTR and light/dark, and inspect 320/390/768/1280/1440. The 2× `Emulation.setPageScaleFactor` check is visualViewport page-scale emulation, not desktop browser 200% zoom; the native Chrome 200% A/EN/light 640x360 case was separately verified. Test pointer-open → first Tab into panel → subsequent Tab through native DOM order (Close, eligible Seen actions, then available anchor); Shift+Tab from the first panel control returns focus to the bell while the panel stays open, and the next forward Tab exits to the next shell control and closes it. Test keyboard-open followed by immediate Tab before geometry is ready. After Seen success, verify focus moves to the first still-present subsequent eligible action at the removed row's position, then the nearest preceding eligible action, then Close/panel heading; on failure, focus returns to the same row's action. Also test Escape/outside click, local synthetic anchor `#SIM-TARGET-INCIDENT-1042` open/return/reload/new-tab restoration, arrivals and retirement, Seen success/failure, unavailable/missing/unauthorized source states, offline/reconnect and A→B→A Location scope. Verify the fragment is the only URL change and no production API request occurs.

Browser screenshots should come from the actual running Dashboard prototype and carry viewport, theme, locale and state labels. Capture the worktree revision and test-run provenance in the evidence ledger or accompanying run record; these uncommitted-worktree PNG filenames do not independently encode a source SHA. Do not confuse synthetic preview screenshots with production UI QA.

**Current artifact inventory (verified native browser zoom capture):** Currently **56 PNG files** under `docs/plans/issue-432/qa-artifacts/real-dashboard/`: **40 Variant A** (including native Chrome 200% zoom evidence), **15 Variant B**, and **1 separate baseline** capture. The final headed/debug authenticated review passed 8/8 and captured Owner-facing states with Demo controls hidden; these are synthetic actual-Dashboard captures. They do not establish direct Owner screenshot pixel parity, physical touch/screen-reader coverage or native 200% layout for other variants/viewport combinations. The 2× page-scale emulation is different. Do not use superseded `prototypes/issue-432-management-alerts/qa-artifacts/` screenshots.

## Owner decision checklist

- [ ] **Design:** select Variant A or B (or a bounded correction), including row information density. Available history does not establish a final Owner selection; keep A/B comparison open. The borderless bell is a prototype-only UI-01 treatment.
- [ ] **Copy / navigation:** accept EN/AR category copy rules and the safe local synthetic destination demo. Production exact-source navigation remains a separate gap; approve any separately scoped selector proposal before implementation.
- [ ] **Architecture:** review conditional authenticated fetch-based SSE + minimal PG transaction invalidation proposal, after operations supplies actual proxy, replicas, DB and staff-auth topology; approve or request a documented alternative.
- [ ] **Master Plan:** approve the staged Work Breakdown, security gates, QA targets and rollout rules. Plan approval **does not** authorize production coding.
- [ ] **Future production authorization:** a distinct explicit instruction is required **after** prototype/design and architecture approval before implementation starts.
- [ ] **Separate future activation:** authorize migrations/cutovers/flags/deployment only after actual future implementation PG17, mounted API, browser, security and performance evidence.

## Supporting artifacts

- [Current state and gap analysis](CURRENT_STATE_AND_GAP_ANALYSIS.md)
- [Visual baseline and variant specification](PROTOTYPE_VISUAL_SPEC.md)
- [Accessible interaction contract](ACCESSIBILITY_AND_INTERACTION_SPEC.md)
- [Per-category safe copy and source inventory](ALERT_CATEGORY_CONTENT_MATRIX.md)
- [Deep-link and DTO design](API_DTO_AND_DEEP_LINK_PLAN.md)
- [Realtime decision](REALTIME_ARCHITECTURE_DECISION.md)
- [Security and authorization](SECURITY_AND_AUTHORIZATION_MODEL.md)
- [PostgreSQL/cutover/release](DATABASE_CUTOVER_AND_RELEASE_PLAN.md)
- [QA and performance plan](QA_AND_PERFORMANCE_MATRIX.md)
- [Master implementation plan](MASTER_IMPLEMENTATION_PLAN.md)
- [Dependency-ordered implementation slices](WORK_BREAKDOWN_AND_DEPENDENCIES.md)
- [Independent review findings](INDEPENDENT_REVIEW_FINDINGS.md)
- [Observed evidence and test ledger](EVIDENCE_AND_VALIDATION_LEDGER.md)

## Explicitly independent statuses

| Milestone | Approval status |
| --- | --- |
| Prototype ready for visual approval | **PROTOTYPE READY FOR OWNER APPROVAL (A/B comparison); final design selection and broader visual reference checks remain open.** Final actual-route four-spec headless **8/8 PASS (50.8s, exit 0)** and headed/debug **8/8 PASS (7m, exit 0)** with authenticated manual bell review; Worker2's completed run recorded `.last-run.json` as `status: passed`, `failedTests: []`. **56 PNGs** (40 A including native Chrome 200% evidence, 15 B, 1 baseline); the original 55-image Owner-facing captures had Demo controls hidden, while the new native Chrome 200% zoom capture is independently verified. Prime rerun: Dashboard typecheck PASS, full lint PASS, Vitest 194 files/1246 tests PASS, `architecture:check` exit 0 with grandfathered warnings, Next 16 production build PASS with local `API_ORIGIN=http://127.0.0.1:3001`, fresh `.next/static/chunks`, `.next/server`, `.next/standalone` prototype marker scan ZERO matches, `git diff --check` PASS. First build attempt without required API_ORIGIN failed as expected configuration validation, then corrected local build passed. Actual desktop browser 200% zoom **PASS only for the observed Variant A / EN / Light 640×360 native-Chrome case** (other combinations NOT VERIFIED; 2× page-scale is different), no direct Owner-image pixel-diff/100% parity proof, physical touch or screen-reader sign-off. A/B selection remains unresolved. |
| Owner design approval | **PENDING; A/B selection unresolved in available history** |
| Proposed Master Plan | Authored and ready for Owner review; final local E2E/build/architecture verification is recorded. Production P1/P2 security, exact-source, topology and performance blockers remain; plan approval **does not** authorize production coding. |
| Runtime architecture approval | **PENDING real topology and Owner acceptance** |
| Production UI/API/stream implementation | **NOT STARTED** |
| PG17/real-source/browser/security/runtime QA for proposed code | **NOT RUN** |
| Production migrations, deployed API/Dashboard SHA and cutover evidence | **NOT PERFORMED** |
| Feature flags / production activation | **NOT ENABLED / NOT DEPLOYED BY THIS TASK** |
| #432 closure | **ISSUE REMAINS OPEN** |

## Production implementation blockers (separate from prototype approval)

- **ALT-13:** Location Manager Seen must repeat the protected source authorization and MFA assurance used by the force-ended Shift reader.
- **Seven-day boundary:** Preview eligibility, `seenEligible`, and Seen insert/retry must share one accepted PostgreSQL-time equality comparator.
- **ALT-17:** reject this restricted subscription-recovery category at every generic ordinary-bell schema, decoder, correlator and fan-out boundary; keep it in the separately authorized CA utility.
- **Production UI-02:** implement a canonical typed DTO and lookup handle, exact source selection, source-scope-specific read and fresh by-ID destination reauthorization. ALT-15 requires a separate CA-only Organization-scoped normal preview, exact read, Seen and fan-out path independent of selected Location.
- **Time-only retirement:** implement ALT-12 expiry and seven-day retirement without writes for all five OCCURRENCE families (ALT-05/07/09/13/15). Unknown source timestamps remain null; never invent a time.
- **Cross-device invalidation:** Seen and timing-preference mutations must invalidate all active devices for the same User+Organization only.
- **Writer cutovers:** deploy and attest the fixed Phase1 Dispatch and Phase2/3 Stage writer builds, drain old writers/transactions, then capture separate DB-server UTC-millisecond cutovers for each phase. Never reuse or infer timestamps.

**OWNER ORIGINAL SCREENSHOTS NOT AVAILABLE FOR DIRECT PIXEL COMPARISON.** The visual baseline is sourced from the actual Dashboard TSX/CSS and issue text, rather than an invented screenshot match.
