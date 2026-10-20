# Issue #304 — W6 independent integration QA plan

State: **TEST SOURCE PREPARED ONLY**. No integrated browser tests, user flows,
production role checks, accessible audit, visual comparison, or P0/P1 acceptance
have run in this W6 branch yet. Baseline commit: `a3779327`.

Tests are isolated in `apps/dashboard/tests/issue304-*` and use the existing
`DashboardApiFixture` with fictional IDs and plates. No real user data, external
API mutations, credentials, test users or production service are required.

The approved source is the exact Option 3 HTML, which was in the design worktree
when tests were authored. It is intentionally not copied or regenerated as a
new baseline. Prime must give its full SHA256 and path at runtime. Different
approved HTML versions must abort rather than silently replace the reference.

```powershell
$env:E2E_BASE_URL = 'http://localhost:3003'
$env:ISSUE304_APPROVED_HTML = 'D:\kndoom\valet-platform\tmp\issue304-design-prime\design\issue304\option-3.html'
$env:ISSUE304_APPROVED_SHA256 = '<full-64-hex-OWNER-approved-SHA256>'
cd apps/dashboard
pnpm exec playwright test --config tests/issue304-playwright.config.ts
```

Run **only after Prime integrates W2/W3/W4/W5 and releases the browser QA
slot**. W5 runs browser visual QA first. No server is started automatically by
the dedicated config. The app must already be available at `E2E_BASE_URL`.
Use one Playwright worker and never launch Edge/Chromium concurrently with W5.

## Required observed gates

1. 320/390/768/1440 × EN/AR × Light/Dark; screenshots of the integrated
   Dashboard and *exact* HTML at the same 16 settings. Each comparison records
   SHA256, DOM landmark geometry and a diagnostic normalized pixel-difference
   ratio. Pixel difference is **not** an automatic PASS; Prime reviews the
   actual saved image pairs and explicitly classifies P0/P1 deltas.
2. 320/390 × both locales × both themes: header sign-out stays inside header
   geometry after W5 fix. A shared shell problem is tracked separately from
   changes to the Option 3 interior.
3. KPI counts from bound API fixtures A `[6,2,4,7,3,4]` and B
   `[2,1,1,2,1,1]`, six simultaneously visible independent of active family,
   A→B→A restoration, no Search UI.
4. Company Admin, Location Manager and Supervisor authority, deny/no-data
   after 403 response, scoped request isolation, physical resource pagination,
   plate/descriptor/unknown vehicle truth and custody context.
5. Keyboard Tab/Enter/Escape, dialog focus return, accessible role/name,
   measured label contrast heuristic, and real Chromium `pageScaleFactor=2`
   visual viewport. This does **not** claim a full WCAG 2.2 or Lighthouse pass;
   axe/assistive-tech coverage must be separately run if required for release.
6. QR preview/create boundary: opening/closing must not perform writes; verify
   authoritative creation separately with actual test backend after integration
   when W3 contracts become available. Nothing here authorizes live writes.

## Evidence contract

Tests create artifacts only under `docs/validation/issue304-w6/`. Results JSON,
screenshots and per-variant `*-diff.json` appear **after actual execution**.
Avoid checking in transient traces, profiles, tokens or fixtures with secrets.
`docs/validation/ISSUE304_OPTION3_VISUAL_PARITY.md` is to be written only when
real post-integration evidence is available, with explicit FAIL/PENDING statuses.

Known dependency: integrated root / KPI / list / detail semantic hooks must
match the final contract under test. W2's actual selectors and final accessible
names must be reconciled in this test source after integration; a missing
selector is a test/implementation mismatch requiring review, never a pass.
