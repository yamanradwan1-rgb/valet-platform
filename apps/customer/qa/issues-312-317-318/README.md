# Issues #312 / #317 / #318 QA

Use the exact baseline and implementation production builds with the same
`API_ORIGIN=http://127.0.0.1:3311`, served separately on 3314 and 3312.
Only these loopback processes belong to this QA harness. Do not point the
fixture or database tests at shared or production data.

Set `QA_EVIDENCE` to an absolute task-owned output directory. Run commands
sequentially: each visual command temporarily owns HTTP fixture port 3311.

```powershell
$env:TARGET_URL='http://127.0.0.1:3314'
node apps/customer/qa/issues-312-317-318/visual.mjs before
$env:QA_EXTRA='1'
node apps/customer/qa/issues-312-317-318/visual.mjs before
node apps/customer/qa/issues-312-317-318/zoom.mjs before

$env:TARGET_URL='http://127.0.0.1:3312'
$env:QA_EXTRA='0'
node apps/customer/qa/issues-312-317-318/visual.mjs after
$env:QA_EXTRA='1'
node apps/customer/qa/issues-312-317-318/visual.mjs after
node apps/customer/qa/issues-312-317-318/zoom.mjs after
node apps/customer/qa/issues-312-317-318/report.mjs
```

The regular matrix has 192 screenshots per build. The native 200% matrix has
the same 192 states. Native zoom uses an isolated Chromium extension calling
`chrome.tabs.setZoom(2)` and records DPR/CSS zoom/innerWidth. These are real
production routes using a synthetic HTTP contract fixture. No preview renderer
or production instrumentation is injected into the application.

Capture waits for real finite animation completion and loaded fonts. Infinite
animations are sampled at a fixed identical time. Pixels are never masked or
thresholded; raw PNG and DOM/computed-style/bounding-box snapshots are retained.
`report.mjs` decodes non-identical PNGs and counts differing RGBA pixels.

For real authority proof, start the implementation production build on 3312,
stop the HTTP fixture, set `TEST_DATABASE_URL` to a disposable task-owned
PostgreSQL instance, and opt into the checked-in API test:

```powershell
$env:CUSTOMER_RATING_BROWSER_QA='1'
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/customer-auto-rating.browser.integration.test.ts
```

This launches the existing Nest/PostgreSQL test context. Browser credentials
remain in memory/HttpOnly cookies and are never written to evidence.

For the independent development navigator smoke, start Customer dev on port
3315 and run `node apps/customer/qa/issues-312-317-318/dev.mjs`. Use localhost
for Next development origin checks; no production config changes are needed.
