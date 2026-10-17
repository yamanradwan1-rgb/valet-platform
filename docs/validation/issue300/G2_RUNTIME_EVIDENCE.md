# Issue #300 — G2 isolated PostgreSQL / authenticated HTTP / local candidate

> **Subsequent U05 Option A local-only update:** Code
> `372e3cf4953a46c9ea5254426173eb456976126a` applied migration **94/94**
> on this dedicated G2 database, added birth-XID insertion fencing for the
> three missing sources, and executed six test-only SQL/HTTP proof scripts.
> Independent adversarial testing found an actual historical Audit→Task/
> Incident indirect-join phantom; the candidate **fails closed** for affected
> paging cohorts. Both full U05 and full Issue #300 acceptance remain GAP.
> New code `5c3f8da2` includes Issue300-only reasons aggregation optimization
> and committed-fixture G2 EXPLAIN: 3,500 Sessions +900 Custody rows, p50
> **933.93ms**, p95 **969.80ms** (20 warm samples), >3.12M shared buffer hits.
> This is **not** target-scale/writer-load performance acceptance.
> Two later operational writer scripts additionally PASS on G2: real
> authenticated Supervisor HTTP Incident creation/retry (with separate
> Incident+Audit born-XID rows, no operational state mutations) and real
> Supervisor Dispatch assignment/reassignment (two born-XID rows with distinct
> actor/old/new assignee), both read back by CA with fresh MFA. User/Session/
> Shift data used direct SQL fixture setup, not operational writer proof.
> Detailed executable R01–R09 matrix:
> `U05_OPTION_A_LOCAL_VALIDATION.md`. The older code SHA and 93/93 migration
> values below describe the original *prior* G2 validation run only.

**Date:** 2026-10-17–18 (Asia/Amman). **Latest tested code candidate:**
`f90c3cabbff07c57df57ee783f052b30a70b0a21`, branch `codex/issue-300-prime`,
worktree `D:\kndoom\valet-platform\tmp\issue-300-prime-integration`.
Initial integration reference: `3210555c`; last earlier baseline: `6213fe1d`;
follow-up docs/QA/client cherry-picks `770bd741`, `1b99e7f7`, `c3245dee`;
subsequent implementation `961f324f`, source-provenance/Location-timezone fixes
`4b0b4ac3`, and evidence-strengthening tests `f90c3cab`.

## Exact task-owned runtime and safety envelope

- **Database:** Docker container **`issue300_g2_pg17`**, dedicated `issue300_g2`, PostgreSQL
  **17.10**, loopback `127.0.0.1:55480` only. Task-owned environment (untracked) under
  `tmp/issue300-g2-owned`; passwords, generated TOTP material, session tokens and
  recovery codes are **not recorded in these docs or Git**. Original port 55430 was
  rejected by Windows port allocation, not evidence of a shared-DB failure.
- **Migrations:** `pnpm --dir packages/database migrate:deploy` completed **93/93**
  forward migrations against verified `issue300_g2` and `55480` (with migration
  DSN checks). No Issue300 schema migration has been authorized or applied.
- **Compiled API:** `http://127.0.0.1:3161/health/ready` returned **200**; task-owned
  `node apps/api/dist/main.js` from this Prime worktree, test-only database/keys,
  **MFA bypass disabled**. Existing shared API `3001` remains untouched.
- **Dev Dashboard:** `http://localhost:3113/audit-log?investigationDemo=1`
  and `http://127.0.0.1:3113/audit-log` returned 200 page HTML; locally started
  Next dev process from this worktree, API rewrite to `3161`. The preexisting
  Dashboard at `3013` was neither stopped nor used as proof of this code.
- **Shared DB:** existing `valet` PostgreSQL on `5432` never queried, migrated,
  truncated or seeded by Issue300 G2 procedures. All G2 SQL test URLs have hard
  guards for **hostname=127.0.0.1, port=55480, database=/issue300_g2**.

## Executed proof — distinct evidence classes

| Level | Exact reproducible command from Prime root | Observed result | Qualification |
| --- | --- | --- | --- |
| PostgreSQL SQL, rollback fixtures | `ISSUE300_PG_TEST_URL=<owned-G2-URL> node apps/api/test/issue300-pg/issue300-pg-proof.mjs` | **PASS**: independent same-Session in-window slot and employee witnesses, no reliance on current slot; canonical Task/Incident/Audit contradiction denied; unknown Audit actor denied; Location and exclusive upper bound; source-qualified timeline, duplicate names and **205+ historical employees across bounded UUID pages**, even if a time-only query needs no employee list | Direct SQL inserts in transaction, **not operational writers**; rolled back |
| PostgreSQL concurrency primitive | `ISSUE300_PG_TEST_URL=<owned-G2-URL> node apps/api/test/issue300-pg/issue300-late-commit-proof.mjs` | **PASS**: on 2 connections a late COMMIT with older event time is erroneously included by a timestamp-only predicate, excluded by immutable `xid8` under prior `pg_snapshot` | Dedicated toy table only, created and removed. Not a source migration or actual cross-request paging test |
| Real signed HTTP/MFA | `ISSUE300_PG_TEST_URL=<owned-G2-URL> node apps/api/test/issue300-pg/issue300-auth-http-proof.mjs` | **PASS**: four genuine Argon2-password logins, three real TOTP enrollments; CA/LM 200 on sessions/filters/timeline/detail, Supervisor and other tenant denied, anonymous 401; no-store, four sources, same-Session AND, wrong Session/Location, signed MEMBER >20 cursor/tamper denial, revocation on Location grant and staff session, operational source row counts unchanged. Canonical metadata-only `VALET_SESSION_PARKED`/PARKING Task is visible in Search/Timeline; RETRIEVAL/Vehicle contradictions excluded | Source Session/Event test fixtures committed by **direct SQL only**. Actual identity/MFA writers are real, but **T01 operational writers remain GAP**. Browser child exit/stage is now checked separately and fails the parent acceptance harness if the browser fails |
| Search performance SQL fixture | `ISSUE300_PG_TEST_URL=<owned-G2-URL> node apps/api/test/issue300-pg/issue300-query-performance.mjs` | **PASS executed, not target PASS**: 3,500 Session and 900 Custody rows, `EXPLAIN (ANALYZE, BUFFERS)`: execution **864.518ms**, planning **11.408ms**, shared hits **1,988,794**, reads **0**, sorts `top-N heapsort`/`quicksort`, 20 warm samples p50 **625.05ms**, p95 **695.18ms**, result cap 101; ROLLBACK | Single-client hot-cache measurements only; **no 100k/1m**, concurrent writers, cold p95 or SLA acceptance. High buffer work is a performance concern |
| API TypeScript/build/lint | `pnpm --dir apps/api typecheck`; `pnpm --dir apps/api build`; `pnpm --dir apps/api lint` | **PASS** | Authored code, no validation disabled |
| Focused API tests | `pnpm --dir apps/api exec vitest run test/issue300-search/ --project=api-non-postgres --reporter=dot`; `node --test apps/api/test/issue300-timeline/*.mjs`; `node --test apps/api/test/issue300-qa/*.mjs` | **16/16**, **18/18**, **12/12 PASS** | Mock/unit/static tests; not a substitute for actual writers |
| Dashboard/regression | `pnpm --dir apps/dashboard typecheck`; `pnpm --dir apps/dashboard lint`; `pnpm --dir apps/dashboard exec vitest run src/features/audit --reporter=dot` | **241/241 PASS** across 18 suites | Unit/component checks, not geometry browser acceptance |
| Architecture | `pnpm architecture:check` | Exit **0**; only recorded grandfathered unrelated file-length warnings | No baseline tooling repair |
| Frozen UI source | `node scripts/validation/issue300/verify-live-ui-exceptions.mjs . tmp/issue300-g0/FROZEN_UI_MANIFEST.json` | **119/124 SHA256 identical; exactly 5/5 approved source-only exceptions; no extra protected changes** | Source integrity only, not actual rendered parity |

The `ISSUE300_PG_TEST_URL` placeholder above is deliberately non-secret. Set it
only using the already-owned untracked G2 credential source after checking
container ownership; **never** copy values into Git, logs, shell history or
reports. Do not substitute a shared development/production DSN.

## Authenticated real browser smoke and partial T58/T59/T70

On the **same owned API `3161` and Dashboard `3113`**, after rebuilding/restarting
the task-owned API to serve the current source-provenance fix,
`apps/dashboard/e2e/issue300-g2-live-browser.mjs` completed **actual**
Argon2-password login, fresh (not reused) TOTP step-up, CA Company/Location
selection, real Investigation Search HTTP 200, first Session and event detail
from independent read, modal focus transfer, Escape close/return focus, and
no hidden Audit Events read. It also injected **one browser-network abort** on
Search and verified no stale timeline, one failed request/no autonomous retry,
followed by one explicit user Apply successfully recovering HTTP 200. The
parent `issue300-auth-http-proof.mjs` now fails the run if Playwright exits
nonzero or its final stage/32 cases/Investigation HTTP proof are missing.

The task-owned untracked `tmp/issue300-g2-owned/browser-geometry.json` records
`stage=BROWSER_MATRIX_32_CASES`, **32 panel-visible smoke cases** with 4
viewport widths (320/390/768/1440), DOM-injected `en/ar`, `light/dark`, and
CSS `zoom:1/2`; **26** observed successful Investigation HTTP 200 in the
latest recorded run (this is a request count, not 26 distinct endpoints).
There was **no real preference-switch interaction** in these 32 cases, no
translated React-content/computed theme/bidi parity assertion, and no actual
physical 200% browser zoom: **16 synthetic CSS zoom=2 cases reported document
overflow** by design. Therefore **T58/T59 and full T70 are still GAP/PARTIAL**:
only detail Escape/focus and **one Search abort/manual recovery** are proven;
nested Help, other source aborts, repeated scope transitions, actual keyboard
tab traversal, full rendered overflow parity and independent browser zoom
remain unproven. Never label all 32 cases as visual regression PASS.

## U05 safety decision, independent reviews and remaining blockers

- Real PG17 two-connection race supports rejection of timestamp-only pagination;
  **three of four event families still lack database-owned immutable birth-XID**,
  complete legacy/DDL lock/privilege proof and cursor page1→page2 source tests.
  Existing service **refuses cursor and overflow with 503**. A first-page
  captured snapshot label is also not a four-source coherent insert cohort when
  late commits enter READ COMMITTED reads. Thus **U05 BLOCKED, full acceptance
  NOT ACHIEVED**. See `U05_SNAPSHOT_DECISION.md` for nine mandatory proof gates.
- Worker W4 independently inspected current Prime changes: **no confirmed
  P0**, found P1 large-directory time-only search blockage (fixed locally with
  no frozen visual changes), and P2 contradictory/orphan Audit member discovery
  (tightened with canonical Session/Task/Incident predicates). Signed MEMBER
  keyset remains **LIVE** and can miss participants becoming eligible *below*
  `lastId` between two requests, despite HMAC/session binding. An unbounded
  directory above the deliberate 200-option cap cannot be represented by the
  frozen native select; a selected employee filter must fail closed, but a
  time-only query still works. Review/race/Owner UX policy remain GAP.
- Worker W3 independently confirmed source-xid8 primitive proof cannot close
  actual source migration/late-commit/legacy cohort/authorizing cursor proof.
- T01 actual movement/writer proof, T70 **timeline/detail** disconnect/retry
  and full multi-scope revocation, 100k/1m skew/load/operational writer
  impact, actual React locale/theme setting, nested Help/focus and physical
  200% rendered parity all remain **GAP**. The one Search-abort browser case
  is partial T70 evidence, not full acceptance.
  All operational state-machine changes must come from actual approved domain
  writers, not these directly inserted isolated fixtures.

**Owner decision needed:** approve a separately reviewed, additive forward-only
birth-XID marker/overwrite trigger + legacy activation/privilege rollout for
Custody, Dispatch and Incident and associated source query/index/cursor design,
or explicitly approve reduced pagination guarantees. Existing hard requirements
must not be silently weakened. No push, PR, main merge, production migration,
deployment or Issue closure occurred.
