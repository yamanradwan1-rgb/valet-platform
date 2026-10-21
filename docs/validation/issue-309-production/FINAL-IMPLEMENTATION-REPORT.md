# VAYLET #309 — production candidate integration / release verdict

**Status:** Code candidate integrated in an isolated worktree; **NO-GO for production activation, deployment or Issue closure**. Owner-approved HTML design does **not** imply photo-byte access rights. This report records observed evidence, including failed real tests. The original Dashboard and Native upload pipeline are deliberately outside the changed behavior except for the strictly additive photo section.

## Exact source references

- Current verified original `origin/main`: `459e9c42dfff5b2aeb11ee9165a7d1a4338a7783`.
- Approved immutable HTML: `design/issue-309-photo-viewer-html` commit `a6227f681f4948305c331b1372062fe34533b9aa`; SHA256 `0b1900896b46af9d1f11dd88f01643978629001cb1c956de5f1e7f5987cdbd74`.
- Production code integration: branch `feat/issue-309-management-photo-view`, isolated worktree `tmp/issue-309-production` (read exact HEAD with `git rev-parse HEAD`). No changes were merged into main or deployed.

## Deliverables implemented

- One isolated `SessionPhotos` React component under `apps/dashboard/src/features/operations/session-photos/` and scoped CSS matching the approved new photo feature. Minimal props from Vehicles and Live Operations flow into their shared `SessionDrawer`, inserted **after** the unmodified original FactList. Original Help/Close/sidebar/topbar/Fact order/headers/tables/global CSS are not rewritten.
- Authenticated Management manifest `GET /v1/staff/dashboard/locations/:locationId/sessions/:sessionId/condition-photos` returns up to ten opaque photo IDs and verified timestamps. A separate protected `GET .../:photoId/bytes` selects exact persisted verified, selected and AVAILABLE Check-In condition evidence from the exact ValetSession and uses the **existing** S3-compatible private store `readExact`, verifying immutable object version, byte count and SHA256. The original Native upload, byte verifier, persistence/state machines, bucket credentials and photo DB entities were **not modified**.
- The Dashboard client uses its own authenticated transport/session-generation fence, with a narrow GET binary adaptation and an 8 MiB JPEG body limit. Photo Blob URLs exist only while the drawer/scope is current and are revoked/aborted on cleanup. Viewer supports AR/EN, RTL/LTR, dark/light, the agreed responsive layout, Escape/Tab/focus restoration and arrows. Mock photos are not returned in the real app.
- A dedicated independent Management photo **VIEW** authority is defined and **ALWAYS DENIES in production** until owner-approved policy. Hypothetical Company Admin / Location Manager positive evaluation is injected **only in tests**, never via production env flag or inherited Dashboard/Audit/upload permissions.
- New separate view-request quota and per-replica bounded 2-per-user/4-global concurrent binary reads, without consuming legacy employee upload/status quota. HTTP bytes are enqueued under the second short SQL authorization/evidence fence **after** S3 retrieval, not during external storage I/O. This is a candidate protocol only, with known unresolved release constraints below.

## Measured checks

| Gate | Observed result | Qualification |
| --- | --- | --- |
| W3 default-deny VIEW auth and proposed-policy unit tests | **17/17 PASS** | Positive role decisions not approved |
| W4 scoped backend unit tests | **15/15 PASS** | Mock DB cannot prove runtime SQL grants |
| W2 focused Dashboard API/photo tests | **38/38 PASS** in owner W2 run, including existing POST and original Facts regressions | Scope-limited unit tests |
| Combined Prime W3/W4 unit rerun | **32/32 PASS** | `api-non-postgres` |
| Combined Prime new Dashboard focused adapter/JPEG tests | **8/8 PASS** | Three focused Vitest suites |
| Whole Dashboard test suite | **979/980 PASS** on first parallel run; the single Google Maps ownership test timed out at 5 s and **PASS 1/1** on focused rerun | Timeout unrelated to #309; not silently counted as clean full-suite PASS |
| Real original #215 HTTP/native upload backend + PG17 + versioned private MinIO | **6/6 PASS** | Existing upload flow unaffected; disposable isolated resources |
| Real new #309 GET manifest/bytes / grant-race on PG17+MinIO | **7/7 FAIL; no positive bytes delivered** | Inherited anti-abuse CHECK rejects VIEW scope before auth, HTTP 503; no valid race proof |
| Real restricted runtime PHOTO evidence row locks | **4/4 attempts rejected SQLSTATE 42501** | Role has SELECT-only privilege; W4 `FOR SHARE` requires additional narrowly reviewed security mechanism |
| API/dashboard TS typecheck and architecture | **PASS** | No new source line-policy blocker; inherited grandfather warnings only |
| API production build | **PASS** | With existing repository build script |
| Dashboard production build | **PASS** | Isolated verification used `API_ORIGIN=http://127.0.0.1:3001` as a local build-only configuration; no API deployed or contacted |
| Genuine Next/React frozen original vs candidate browser DOM/geometry | **32/32 route/locale/theme/viewport cases PASS** | Actual original Fact content/order/rects and drawer Help/Close unchanged |
| Genuine Next/React original vs candidate zero-tolerance painted pixels | **Latest 93/96 pixel-exact, 3/96 STOP** | New **photo-only** `contain:paint` fix restored all **32/32 original FactList crops** to zero changed pixels, original 32/32 headers exact; current HEAD `4bf3c725` recapture has three closed-screen navigation-edge raster differences totaling **150 pixels** (prior normalized run 137). No frozen styles changed |
| Genuine integrated React photo gallery with intercepted synthetic JPEG | **320/320 PASS** | Actual Next/React: both pages × 10 states × EN/AR × light/dark × widths 320/390/768/1440, including 20/20 Playwright scenario tests. **Not** real private provider/authorization success |
| Genuine Chrome-native 200% candidate | **16/16 zoom verification PASS** | MV3 `chrome.tabs.setZoom(2)` + `getZoom===2` recorded for all 16 cases, photo gallery and modal usable at effective CSS widths160/195, no new horizontal overflow; original Close clipping inherited at physical320. Synthetic test photo evidence only |
| Accessible keyboard focus on first/last thumbnails | **32/32 PASS** | Real React browser source, both pages EN/AR light/dark CSS widths320/390; focused exterior pixels and ARIA viewer title/description/escape return tested; separate from manual assistive-technology certification |

## Two independent real-PostgreSQL P1 blockers

1. **New anti-abuse budget lacks a permitted DB scope.** W4's `v1:dashboard-session-photo-view-user` value is accepted by the new TypeScript union but not by the existing `anti_abuse_events_scope_check` (`packages/database/prisma/migrations/20261015008100_issue_215_photo_anti_abuse_scopes/migration.sql:7-19`). Actual isolated PG17 returns **SQLSTATE 23514** and HTTP 503 for every test photo GET before VIEW authorization. This requires a separate reviewed forward-only, least-privilege addition to the DB CHECK allowlist; do not reuse the employee upload/status scope.
2. **Protected final `FOR SHARE` cannot execute with current runtime photo grants.** `session-photo-query.ts` locks existing verified evidence operation/attempt/verification/availability rows through response enqueue. The runtime role has **SELECT only** on all four private photo tables and PostgreSQL `FOR SHARE` requires UPDATE. Actual restricted PG17 returned **SQLSTATE 42501** on all four. There is no approved runtime-callable dedicated `SECURITY DEFINER` photo-view locking helper. **Do not give the API runtime broad UPDATE rights.** A narrowly scoped reviewed helper or alternative approved serialization mechanism, migration, and real writer/read race proof are required first.

## Remaining security/release questions

- The role, MFA freshness, allowed historical visits, inactive Location/Organization, audit behavior, commercial entitlement and retained evidence policies in `security-and-access-questions.md` are proposals, not accepted permissions. All production photo VIEW remains denied until accepted.
- The final SQL authorization/evidence transaction synchronously calls `res.end(bytes)` **before SQL COMMIT** so that it holds compatible shared locks at enqueue. A COMMIT fault after response enqueue cannot unsend bytes. Owner/security must accept a precise enqueue-time serialization and test fault/response behavior. No guarantee can block physical network delivery after enqueue.
- The 2-user/4-global byte admission cap is **per API replica**, not a fleet-wide lease; real multi-replica capacity/failover tests, private production S3 versioning/IAM, hold, backup and retention gates remain unresolved.
- A genuine Chromium same-host/fixture original-vs-candidate comparison initially found FactList subpixel rasterization differences, although original DOM, labels, styles and geometry were identical. A W6-proven **component-scoped** `.photoSection {contain:paint}` change eliminated those changes in all 32 tested FactList regions with no alteration to frozen source. A separate scoped `overflow-clip-margin:6px` preserved the required focus outline otherwise clipped by paint containment; the CSS fix changes **only** the new photo section. The latest final HEAD4bf3c725 strict A/B result is **93/96 exact regions**; the remaining three closed-screen navigation-edge regions differ by **150 pixels** (subpixel anti-alias variations; prior capture 137). A source-v-source recapture of the same baseline also differed by 85 pixels, but the Owner's literal zero-pixel gate is **not met** and no original regions were masked.
- Only default-denied/fail-closed source integration is accepted. Do not enable VIEW, change the uploader, grant broad DB rights, merge/push, deploy, close Issue #309, or assert that a successful mocked test proves real private delivery.

## Owner-facing status matrix

| Required statement | Verdict |
| --- | --- |
| **HTML DESIGN APPROVED** | **YES**, immutable reference above |
| **FULL FEATURE CODE IMPLEMENTED** | **PARTIAL candidate**: new React/backend read code built; live access policy and schema-compatible locking/budget not accepted or working |
| **APPROVED PHOTO UI MATCH** | **PENDING independent complete React/photo HTML pixel proof**; synthetic HTML prior QA alone is insufficient |
| **EXISTING DASHBOARD UI-FROZEN** | **PENDING / STRICT STOP**: 32/32 original Facts and 32/32 headers pixel-exact after component-only paint fix; 3/32 closed-shell cases still mismatch by 150 pixels in latest HEAD; zero-tolerance **96/96 not proven** |
| **REAL PRIVATE IMAGE DELIVERY** | **FAIL/BLOCKED** in actual PG17+MinIO GET tests; existing employee upload 6/6 PASS |
| **SECURITY ACCEPTANCE** | **NO-GO** due default-deny role decision and DB blockers |
| **PRODUCTION ROLLOUT READY** | **NO-GO**, no deploy/push/merge; exact blockers documented |

## Evidence

- `docs/validation/issue-309/` — W5 real PostgreSQL 17/versioned MinIO tests and SQLSTATE proof.
- `docs/validation/issue-309-api/README.md` — backend contract, byte integrity and lock/commit caveats.
- `docs/validation/issue-309-auth/decision-gate-and-transaction-contract.md` — fail-closed VIEW contract.
- `docs/validation/issue-309-production/w7-independent-security-release-review.md` — independent release security NO-GO.
- `docs/validation/issue-309-production/prime-release-gates.md` — scope and owner decisions.
- `docs/validation/issue-309-production/w7-photo-db-authorization-proposal.md` — **UNAPPROVED** strictly scoped forward-only anti-abuse CHECK and private-photo lock helper / commit-semantics decision design, not applied.
- `docs/validation/issue-309-production/qa/W6-REACT-QA.md` — genuine React original-vs-candidate screenshot/pixel measurements and 320/320 synthetic photo UI matrix; additional native200/focus follow-up evidence in `qa/results/`.
- W1 real original source baseline `docs/validation/issue-309-prototype/baseline/` in the approved immutable design branch.

**Safety posture:** Feature implementation is reviewable and built behind default-deny. Real positive Management image delivery has **not** passed persisted acceptance; never interpret its 503 responses or unapproved permissions as a release success.
