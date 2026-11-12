# Real Dashboard management-alert prototype

The current review surface is the actual protected Dashboard route:

/policies?section=operations&prototype=alerts&variant=a

Switch to variant B with variant=b. The route gate is disabled in production. The page content, shell, sidebar, topbar, currentPath and selected Policies section remain the real Dashboard; only the existing alerts-control slot is replaced. The override is optional and the original ManagementAlertsControl remains the default when no prototype query is present.

## Local, isolated run

Start the Dashboard with an intentionally unreachable local API origin:

~~~powershell
$env:API_ORIGIN = "http://127.0.0.1:1"
$env:NEXT_TELEMETRY_DISABLED = "1"
pnpm --filter @valet/dashboard exec next dev --port 3433
~~~

The real route still requires normal Staff authentication and authorized scope restoration. A fresh local browser has no session and must not be treated as authenticated. Automated review uses the repository's DashboardApiFixture to sign in a synthetic Company Admin, select fixture Organization/Location records, and intercept every /v1/staff/** request. No QA credentials, production auth bypass, real API, or database are used.

Run the visual/parity and interaction suites from the repository root:

~~~powershell
$env:E2E_BASE_URL = "http://localhost:3433"
pnpm --filter @valet/dashboard exec playwright test e2e/issue432-real-dashboard-prototype*.spec.ts
~~~

Screenshots are written to docs/plans/issue-432/qa-artifacts/real-dashboard/. The suite captures A/B at 320, 390, 768, 1280 and 1440 CSS-pixel widths, a 320×568 short viewport, Arabic/dark-theme states, and Chromium 2× page-scale (pinch-zoom) reflow. The page-scale check is not desktop OS/browser zoom. A separate native Chrome Zoom: 200% measurement PASSED for Variant A / EN / Light at 640×360 (see docs/plans/issue-432/OWNER_DESIGN_APPROVAL_PACKET.md); other combinations remain NOT VERIFIED.

## Owner interactive review

To pause after synthetic sign-in and scope selection with the actual Dashboard route loaded:

~~~powershell
$env:E2E_BASE_URL = "http://localhost:3433"
$env:ISSUE432_OWNER_REVIEW = "1"
pnpm --filter @valet/dashboard exec playwright test e2e/issue432-real-dashboard-prototype-interactions.spec.ts --debug --workers=1
~~~

Playwright Inspector opens a headed browser with the fixture still intercepting all Staff API traffic. Inspect the actual page and bell, then choose Resume in Inspector to continue the assertions, or stop the run to end the session. No production or QA account is used.

## Hidden controls and fixture policy

Prototype controls are closed by default. Use Ctrl+Shift+P to reveal the local scenario panel. All rows are synthetic and the panel makes no management-alert API requests. The ALT-08 sample source `SIM-INC-1042` has a native same-page fragment link to `#SIM-TARGET-INCIDENT-1042`, a local synthetic preview that explicitly has no production record, route, API call or authorization check. The destination-state scenario separately shows unavailable, missing and synthetic unauthorized outcomes. Every other category remains destination-unavailable until an exact production route and by-ID reauthorization are proven. ALT-15 remains Company Admin-only and Organization-scoped; ALT-17 is excluded from the ordinary bell; ALT-14 remains disabled.
