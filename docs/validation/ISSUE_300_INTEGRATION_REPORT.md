# VAYLET Issue #300 — Local Backend and Concept A Live-Data Integration

Date: 2026-10-17. **Candidate, not release-approved.**

## Authority and Git baseline

- Owner approved U01–U06, final Concept A UI Freeze, and later a **narrow exception only to connect real authorized data to that UI**. No redesign, CSS, route/shell restructuring, or new navigation was authorized.
- Frozen UI baseline `0d5d0482` (branch `feat/issue-300-concept-a-ui-integration`). Master Plan base `2f1311575507eae06c6166270e748687762fb508`.
- Main remains `6d7bd5991e66d8f5d93978512352a52c72bdc7f6`; isolated integration worktree `tmp/issue-300-prime-integration`, branch `codex/issue-300-prime`.
- Initial live-data wiring SHA `cc5f4390b54cfda39fa1f7f3671caff875f48c05`; independent static QA integration `2e227819` plus subsequent data-only P2/P1 repairs are represented by the final local integration branch SHA (recorded in the release handoff). The initial SHA alone is **not** the final candidate.
- Worker deliveries: W1 `f1b6f579`, W2 `c09c5000`, W3 `bfef2a95`, W4 `2062531f`, W5 `737cb029` and LIVE `4a8e6fb1`, W6 `42814161` and LIVE `b66ec440`, W7 `7d15abba` plus CRLF correction `97a1df23`.
- **No push, PR, merge to main, deployment, production migration, or Issue closure.** Existing local owner scripts and frozen UI worktree remain untouched.

## Implemented source surfaces

| Area | Local implementation and boundaries |
| --- | --- |
| Contracts | Strict bounded Zod search, selectors, four-source timeline, safe detail, coverage/current labels, signed-cursor payload and types in `packages/contracts/src/audit-investigation-*` |
| Search | `GET .../audit-investigations/sessions` and `/filters`; canonical Session same-window AND with independent persisted KeySlot and employee witnesses; `AUDIT`, `KEY_CUSTODY`, `DISPATCH`, `INCIDENT` sources; verified direct/entity/Task/Incident link guards; current vehicle identity differentiated from history |
| Timeline | `GET .../sessions/:sessionId/timeline` and `/events/:source/:eventId`; exact scoped source IDs, time/rank/UUID order, persisted actors/assignee roles, unknown-event minimal projection, Incident privacy, nullable RELEASED slot |
| Security | Existing Management Audit live staff-session/MFA/role/location/commercial checks composed by investigation-only W4 guard; CA/Location Manager only, no Supervisor elevation; direct/indirect event detail resource containment before projection; current Incident active-Location gate |
| Cursor | Purpose/scope/active staff-session/filter keyed digest in signed opaque transport; validation implemented, but strong cross-request four-source pagination remains **disabled** pending U05 DB proof |
| Live frontend | New `investigation-live.tsx` replaces fixture-only route rendering; real selected Location, authenticated scoped selectors, true UUID/time filter, AbortController/generation cancellation, search→timeline→independently authorized detail; W5/W6 typed adapters and safe data projection |
| Existing Audit Events | Audit Events component/API/scope retained as separate tab and never mounted while Investigation tab selected |

The backend deliberately rejects cursor or overfull first-page results with explicit safe 503 errors rather than claiming a full/snapshot-stable history. This is a **known functional limitation**, not complete pagination.

## UI Freeze comparison and narrow exception

- G0 baseline manifest: `tmp/issue300-g0/FROZEN_UI_MANIFEST.json`, **124 files**. Verification initially passed all 124 Git blobs on original frozen branches.
- Following Owner's live-data exception, the only pre-existing protected UI files intentionally changed are `audit-page.tsx`, `investigation-demo-types.ts`, `investigation-search-panel.tsx`, `investigation-workspace.tsx`, and `investigation-event-drawer.tsx`. These change source wiring, current/recorded values, real date/UUID display, and misleading Demo/Incident fixed copy, not CSS layout. New standalone data client/model/adapters/coordinator files were added.
- `git diff 0d5d0482..HEAD -- apps/dashboard` shows **zero CSS changes**. Existing Sidebar, Header, tab structure, grid, focus containment, contextual Help, and responsive class names are retained.
- **Do not describe post-exception 124/124 hash equality as a PASS.** Five protected files necessarily differ by explicit Owner data-only exception. All other 119 match G0; exact rendered cross-locale/zoom parity still needs independent G2 browser proof.
- Production routing remains subject to the pre-existing explicit review URL opt-in. Development Audit tab remains discoverable for current CA/LM Location scope. No Supervisor access.

## Focused tests and evidence (not substitutes for DB/HTTP)

- Reviewed contracts focused tests: **17 passing**, contracts typecheck/ESLint passing.
- Security focused tests: **26 passing**, API typecheck/lint passing on integration candidate.
- Historical search first-page focused API mock tests: **13 passing**, including a contradictory Vehicle/Audit reference regression.
- W3 Timeline source/order/privacy/authorization Node mock tests: **18 passing**, including inactive Incident coverage regression. Actual writer data not exercised.
- Frontend Concept A/W5/W6 scoped integration Vitest after live data-source repairs: **41 passing in 7 suites**; Dashboard TypeScript/ESLint passing. These do not verify a real database.
- W7 static oracle suite: **15 passing** (10 synthetic domain oracles + 5 disposable lease guards). T01–T70 exact acceptance ledger complete at `docs/validation/issue300/T01-T70_ACCEPTANCE_LEDGER.md`; **real DB/HTTP/browser/concurrency/performance lanes remain GAP** until executed and documented.
- `pnpm architecture:check` returned exit 0 with pre-existing grandfathered unrelated file-length warnings. New authored code stays at or below 300 physical lines per file. `git diff --check` passed.
- Post-exception QA `node scripts/validation/issue300/verify-live-ui-exceptions.mjs . tmp/issue300-g0/FROZEN_UI_MANIFEST.json`: **119/124 original files unchanged and 5/5 data-only exceptions accounted for; no CSS/Help/Shell source differences.** This is STATIC, not rendered browser parity.

## Unresolved acceptance gates — no misleading PASS

1. **U05 PostgreSQL cross-source snapshot:** Current Prisma schema has immutable `pagination_birth_xid` for AuditEvent and ValetSession only, not KeyCustodyEvent/DispatchEvent/Incident. Strong late-commit stable continuation needs approved forward-only birth-XID/index/rollout/grants design and real two-connection proof. Until then pages exceeding the safe first-page limit fail closed. No migration authored or executed.
2. **Owned PostgreSQL environment:** Provisioning an isolated task-owned PostgreSQL 17 at port 55430 was blocked by tool safety checks. The already-running local `valet` database on 5432 is shared/non-task-owned and was **not** used for Issue #300 DB, writer, migration, HTTP, benchmark, or regression acceptance.
3. **Real production-equivalent HTTP/browser proof:** The existing healthy `localhost:3001` API and `localhost:3013` Dashboard were started from the *older main/frozen-preview sources*, not this candidate. Their HTTP 200 readiness does **not** prove that the new Issue #300 endpoints or live UI have run end-to-end. Real CA/LM authorization/revocation/Incident/late-commit cases await a separately controlled service/database runtime.
4. **Owner review and public release:** Maintain Owner-approved data-only UI exception, run dedicated rendered EN/AR RTL/LTR 320/390/768/1440/true zoom 200% checks on this candidate, and seek explicit publication approval after actual DB/HTTP proof. Do not restore misleading Demo copy for live records.
5. **Large selector sets:** Slot-code input now refines its `KEY_SLOT` selector request with the typed exact-code prefix and refuses ambiguous/incomplete responses. The existing native Employee select still initially exposes at most the first 20 scoped member options: members outside that bounded list require a future access-safe searchable selector/continuation design. Do not claim full U01 employee discoverability for large Locations.
6. **Independent QA follow-ups:** Source-based reviewer found and Prime corrected timeline's missing discovery-context before/inside/after classification, transient selector query retry via existing Apply, and timeline/detail API auth-reconciliation cancellation callbacks. Typed slot-code search now requests bounded exact-prefix suggestions rather than treating the first 20 global slots as complete. Their browser race/authorization behavior still needs G3 execution.

## Verdict

**Local typed/backend/frontend implementation candidate exists and is covered by focused static and mock tests, but full Issue #300 definition-of-done is NOT met.** Pagination proof and real PostgreSQL/HTTP/actual-writer/browser/performance/security acceptance remain explicit, blocking gaps. No production deployment or Issue closure authorized.
