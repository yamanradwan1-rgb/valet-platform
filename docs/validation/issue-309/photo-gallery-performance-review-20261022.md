# Issue #309 — Protected Gallery Performance Review Evidence

Date: 2026-10-22 (Asia/Amman)

## Scope and source provenance

- Baseline: `origin/main` at `622a20989d83a661cc42d345848f2a9fdb10ffbc`.
- Review branch: `perf/issue-309-photo-gallery-optimization`.
- Functional commits: `322be5bb` (bounded original JPEG acquisitions), `96cf812e` (same-origin Web Locks gallery coordination, serial fallback).
- Test commits: `0668584e` (API admission boundaries), `154a2b79` (abort while awaiting Web Lock).
- No change to manifest/JPEG endpoints, role policy, object-storage adapter, authorization, SHA validation, COMMIT delivery fence, or Native upload.
- No edit to gallery CSS or JSX return subtree. Gallery still reaches a single all-or-nothing `ready` state using authenticated original JPEG Blobs in both tiles and viewer.

## Confirmed automated verification

The following were run on the review branch and completed successfully:

| Check | Result |
| --- | --- |
| Dashboard focused Vitest: scheduler, protected client, JPEG reader | **18/18 PASS**, four files |
| API focused Vitest: authorization, admission, service, HTTP COMMIT fence | **51/51 PASS**, five files |
| Dashboard TypeScript | PASS |
| API TypeScript | PASS |
| Gallery-focused ESLint | PASS |
| `git diff --check origin/main HEAD` | PASS |
| Dashboard JSX return subtree compared to `origin/main` | Exact text match, excluding line endings/terminal whitespace |
| Gallery CSS tracked diff | None |

An isolated detached worktree at the feature source commit `96cf812e`, with its **own pnpm dependencies**, passed `pnpm --filter @valet/dashboard build` using the normal Next.js 16.2.11 Turbopack production build, including all routes. Its separate Next.js production preview answered HTTP 200 for `/vehicles` on port 3000. This establishes that the optimized React application can compile and serve; it does **not** establish that authenticated private photo reads succeeded in that preview.

The optional Webpack build failed on an unrelated existing selector in `apps/dashboard/src/features/administration/physical-resources/resource-label-print.module.css:2` (`:global(body *)` not a pure CSS Modules selector). That frozen source was not edited; the normal Turbopack build passed.

## Hard limits of acceptance evidence

At the time of this run, the original Dashboard `127.0.0.1:3113`, API `127.0.0.1:3101`, and local PG/MinIO ports were not listening. Docker Desktop Linux Engine was unavailable (missing `dockerDesktopLinuxEngine` named pipe). The persistent QA database, private MinIO data and local launcher files were **not** reset, restarted or modified.

Therefore **not executed or not proven in this run**:

- Real fresh browser log-in, Vehicles/Live Operations, `5f5` two protected JPEGs and `jj` empty-state functional checks.
- Real browser screenshot/pixel/a11y/focus parity at all required locales, themes, widths and zoom.
- Real PG17/MinIO revoker-first/reader-first and provider failure/COMMIT fault replay on this candidate.
- Matched cold/warm baseline versus optimized p50/p95 photo timings for 0/1/2/5/10 photos, transferred bytes, resource consumption, multi-user throughput and 429/503 rates.
- The suggested **20% reduction in p95 full-gallery readiness** for 5- and 10-photo galleries: **UNVERIFIED**. No numeric speedup is claimed.

The existing #309 persisted evidence/acceptance from the baseline is not a substitute for candidate testing.

## Concurrency design and residual caveats

One active gallery loads up to two authenticated original JPEGs concurrently, preserving manifest indices and publishing only after every photo succeeds. A failed read aborts sibling reads; scope disposal aborts requests and releases all created Blob URLs. Same-origin tab/gallery coordination uses an exclusive Web Lock held over the complete batch. Browsers without Web Locks fall back to one in-flight JPEG request. The server's original two-deliveries-per-user, four-per-instance admission and durable 120-per-15-minute budget remain unchanged.

This voluntary browser coordination is not a cross-device, cross-origin or hostile-client admission protocol. Server admission remains authoritative. A separate independent review and concurrent real-browser 429 test are still required before unconditional release approval.

Thumbnail variants, speculative prefetch, persistent private-image caching, new storage schema and image transformations are **excluded**: exact approved pixels and immediate original viewer behavior were not shown achievable with such changes.

## Review verdict

**BLOCKED FOR REAL DEVELOPMENT / SECURITY / PERFORMANCE ACCEPTANCE.** Source-level focused tests, frozen JSX/CSS and isolated normal production build passed. Fresh end-to-end image and benchmark evidence could not be collected because services were unavailable, and the coordinated worker team's independent final review did not complete due to COS worker startup/tool-approval failures. Do not merge to `main` or deploy to production based on this evidence alone.

The branch is available for **Owner code review**, not certified production or complete live-Development acceptance.
