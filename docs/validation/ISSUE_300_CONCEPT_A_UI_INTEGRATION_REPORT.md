# Issue #300 — Concept A Real Dashboard UI Integration

**Status:** UI-only React integration completed locally for Owner inspection. **Owner approval and UI Freeze: PENDING.**

## Baseline and design reference

| Item | Verified value |
| --- | --- |
| Original main SHA | 6d7bd5991e66d8f5d93978512352a52c72bdc7f6 |
| Implementation commit | e6414613738e3a5465f019999b9d3ac59ec26ffe |
| Local task branch | feat/issue-300-concept-a-ui-integration |
| Isolated worktree | D:\kndoom\valet-platform\tmp\issue-300-concept-a-ui-integration |
| Selected prototype | tmp/issue-300-ux-prototypes/concept-a-split-workspace.html |
| ZIP fidelity | Owner ZIP Concept A HTML matches local original byte-for-byte, SHA256 D2FFA11684485232DF8D67F84403A7B3B4C978C8817F03A0AEEEC27BA4DC54EF |
| Original Dashboard evidence | tmp/issue-277-evidence/final (EN/AR, light/dark, table/drawer) |

## Integration and source boundary

Actual Dashboard route /audit-log now has a UI-review opt-in, ?investigationDemo=1. The real authenticated Dashboard shell, branding, Sidebar, topbar, selected Location, theme, locale, protected route, Audit title, scope label and contextual Help are reused rather than duplicated. No iframe or injected prototype document is used.

Ordinary /audit-log (without query opt-in) retains the existing Audit Events table, real authenticated API, filtering, cursor pagination, read-only drawer, Help and access checks. An AuditEventsContent child mounts the original useAuditPage hook **only when Events mode is actually selected**. No live Audit Events API call is made behind fixture-only Investigation. Company Admin and Location Manager can open the review state only under a selected Location; Supervisor, unknown role and organization-wide scope remain on the normal Events view. The real Audit page is keyed on identity/session/scope revisions so changes remount stale UI.

New scoped/frontend modules under apps/dashboard/src/features/audit:

- audit-page.tsx and audit-view-switch.module.css: in-page modes, scope gate, native Events preserved.
- investigation-demo.tsx, investigation-demo.module.css, investigation-demo-types.ts: local controlled review search and selected Session state.
- investigation-search-panel.tsx, investigation-search.module.css: exact selected Concept A filters, Clear/Apply/collapse, time validation, EN/AR.
- investigation-workspace.tsx, investigation-workspace.module.css: persistent matching results + complete selected Session chronology, tablet two-column results, source and window labels.
- investigation-demo-fixtures.ts: the same 3 fictional Sessions, 12/8/5 events, 3/4/1 K-07 witness counts, honest slot clear / actor / assignee / incident source history.
- investigation-event-drawer.tsx, investigation-event-drawer.module.css: 448px logical-side detail drawer, source ID and recorded evidence, existing Help and nested focus management.
- next.config.ts: ISSUE_300_LOCAL_PREVIEW=1 enables isolated local Webpack aliases for task worktree built packages only. Not enabled for normal production configuration.
- Three focused component tests and three scoped Playwright specifications added for fixture, role and visual behavior.

**Nothing for the real Investigation feature has been added to backend routes, API contracts, Prisma/database, production query services, event writers, authentication rules, or historical custody persistence.** No real customer data is embedded in or requested by the fixture.

## Verified visual relationship to selected Concept A

At 1440px authenticated Chromium EN light, integrated search card x≈292 y≈285 width≈1116, versus selected Concept A x292 y285 width≈1116; workspace results y≈558 versus prototype y≈555. Real shell Sidebar width 260px, header 64px, Audit title 24px/32px, authentic VAYLET tokens and Segoe UI fallback match. Matching Session choices remain on the left and the complete selected history on the right in LTR, mirrored RTL. At width 541–820px the result cards form two columns; at smaller widths stack. The original Audit event detail drawer stays 448px and opens from logical inline end.

Expected differences: real selected Location (Main Garage in fixture screenshot), authenticated Sign out control, original Audit subtitle/Help and source-authenticated Audit Events. The selected Concept A demo strip and mode tabs are scoped to the opted-in review state, with explicit fictional record IDs and timezone. No new shell or navigation item has been introduced.

**Screenshot evidence:** D:\kndoom\valet-platform\tmp\issue-300-concept-a-ui-integration\apps\dashboard\test-results\issue300-concept-a-ui

Important representative captures: en-light-1440-initial.png, en-dark-1440.png, ar-dark-1440.png, en-light-768-initial.png, en-light-390.png, ar-dark-320.png, ar-effective200-384.png, en-effective200-720.png, en-light-1440-audit-events.png, en-light-1440-audit-drawer.png.

## Tests and independent reviews

| Check | Observed result |
| --- | --- |
| Dashboard TypeScript | PASS |
| Scoped Dashboard ESLint | PASS |
| Repository architecture | PASS; baseline grandfathered API/DB line warnings only |
| Git staged whitespace | PASS |
| Scoped Vitest | 20/20 PASS |
| Browser-real isolated keyboard smoke | 28/28 PASS EN/AR; focus trap, Tab/Shift+Tab, Escape, no API requests |
| Integrated authenticated Chromium | 15/15 PASS including Company Admin, Location Manager, Supervisor restrictions, existing Audit Events, desktop/mobile, themes, RTL and zoom baselines |
| 200% effective browser viewport | PASS with CSS viewport widths 384 and 720, corresponding to 768px and 1440px displays at browser zoom 200% |
| Authentic Audit request in fixture Investigation view | 0; authentic Events request occurs only after opening Events |
| Existing Audit drawer/Help | PASS, including nested context Help, Escape and original focus return |

One earlier accidental broad Dashboard unit command finished with 849 passing tests and an unrelated Google Maps ownership test timeout. That broad suite was not used as Issue #300 acceptance and was not repeated; all task-scoped tests passed.

### Important Chromium document-root CSS-zoom limitation

Artificial document.documentElement.style.zoom = 2 at 768px Arabic RTL generates a blank/navy screenshot in headless Chromium even though the Audit heading remains a DOM hit target. The **unmodified real Audit Events mode without Concept A** produces the same blank snapshot under identical native-shell conditions; baseline capture native-original-audit-ar-csszoom2-768.png confirms the inherited compositor behavior. This synthetic screenshot is **not a visual PASS**, even though DOM/scroll geometry assertions pass. Separately, the integrated React design rendered and functioned at effective CSS viewport widths 384 and 720 (representative normal browser 200% zoom). Do not mistake the synthetic blank image for a new Investigation component regression or claim true CSS-root screenshot parity.

Other minor P2 limitations:

1. Only browser popstate changes the URL opt-in store; shallow same-route history.pushState/replaceState can leave the rendered opt-in choice stale until navigation. Ordinary navigation and tab actions are tested, with no role bypass.
2. Fixture location VAYLET Pilot North remains clearly fictional even when the actual authenticated Dashboard location has another name.
3. Real shell mobile header wrapping belongs to the existing application; no global shell override was introduced for this task.
4. The content is near the approved Concept A geometry, not a claim of mathematically pixel-perfect parity across all browser fonts/zoom modes. No formal WCAG 2.2 certification was conducted.

Independent workers inspected source for hidden Audit API, role/location fencing, fixture purity, React escaping, modal focus, and screenshot/source geometry. They reported **zero confirmed P0/P1 code or security issues**. The synthetic root CSS zoom screenshot limitation above remains explicitly disclosed.

## Local preview and Owner review instructions

The real Next.js Dashboard preview responded with HTTP 200 at:

**http://localhost:3013/audit-log?investigationDemo=1**

Start/restart from the isolated task worktree with an authorized local Dashboard API/auth development environment:

1. cd D:\kndoom\valet-platform\tmp\issue-300-concept-a-ui-integration
2. Set PowerShell environment variable ISSUE_300_LOCAL_PREVIEW to 1.
3. Run pnpm --dir apps/dashboard exec next dev --webpack --port 3013.
4. Log in with an authorized Company Admin or Location Manager user and select a specific Location.
5. Open the exact query URL above; Investigation is selected. Apply the prefilled K-07 search, switch Sessions and inspect events. Click Audit Events to return to the actual authenticated Events table.

A working Next server and an HTTP 200 for a protected route do not bypass normal authentication. The Playwright fixture login exists **only inside isolated tests**, and no test-only login bypass is exposed to the user-facing page. The Owner needs a valid connected local API/auth environment to view the authenticated screen interactively.

## Explicit stop gate

Concept A selected: YES. Real Dashboard React UI integration: YES. Original shell/Audit Events preserved: YES. Demo fixtures isolated: YES. Local source commit: e6414613738e3a5465f019999b9d3ac59ec26ffe.

**Owner visual approval: PENDING. UI Freeze: PENDING. Master Plan update: PENDING Owner visual approval. Backend/API/database/full historical Investigation: NOT STARTED.**

No Git push, PR, merge to main, production deployment or Issue #300 closure occurred. Wait for explicit Owner approval before changing the Master Plan or starting full implementation waves.
