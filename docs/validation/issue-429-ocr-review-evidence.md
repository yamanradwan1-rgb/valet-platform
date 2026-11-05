# Issue #429 — integrated OCR implementation verification evidence

Status: **Review branch only; DO NOT MERGE OR ENABLE PRODUCTION OCR.**
Reviewed source baseline: fetched `origin/main`
`ac758ffff7181efa6cad1311c40aca731171770e` and fetched planning branch
`95ea194099c0e48c417a90956a89fdd22048d79f` (rechecked 2026-11-05).
This record distinguishes static/code results from tests that actually ran.

## Source and review evidence

| Workstream | Committed source | Independent source review | Measured local checks |
| --- | --- | --- | --- |
| Phase 0 / DEC-074 | `d93c962d`, correction `9c38b7a5` | W2 CLEAN | Four-column 12-row U matrix, 34 plan sections, Prettier and diff check PASS |
| W2 shared SQL/privileges | `f120f072`, `b2938901`, `f3e83172`, `12d486bc`, `d8170aab`, `725890e0` | W3/W5/W7: SQL ambiguity, maintenance caps and prelease Docker identity MAJOR/BLOCKER corrections reviewed CLEAN | Prisma validate PASS using dummy nonconnecting URL; database lint/typecheck PASS; prelease Node negatives 7/7 PASS; live SQL **NOT RUN** |
| W3 Admission / one-use capability | `c7690039` | W4 CLEAN | Focused Vitest 16/16 PASS; API type/lint/architecture PASS |
| W4 provider/API integration | `7abc1e54`, `1c6922c3`, `4ec21f9c`, `7ad9890a` | W3 mandatory permit/NODE_ENV corrections CLEAN; Prime verified TS-only test correction | W4 focused non-PG 69/69 PASS; integrated A/provider/S local mock 36/36 PASS; root typecheck PASS |
| W5 settlement/UNKNOWN and operator CLI | `378f7e1e`, `175cc863`, `12f7cb13` | W2 column, role membership and unrelated relation ACL corrections CLEAN | Focused non-PG Vitest 71/71 PASS; TypeScript/ESLint PASS |
| W6 Native deliberate Capture | `7df57894` | W7 CLEAN | 260 Native test files / 1881 tests PASS with 15-second timeout; EN/AR, style freeze, ROI, Torch, lifecycle; Native type/lint PASS |
| W7 independent QA | `aa3bce89`, `e3436845` (source-to-artifact provenance correction pending) | W5: child lifecycle and ACL CLEAN; artifact provenance MAJOR remains open at this revision | Node QA 31/31 PASS including synthetic trusted TLS, prelease negatives and independent confidence-bound logic; live multiprocess/PG/performance **NOT RUN** |

## Repository-wide verification

| Command / gate | Actual result |
| --- | --- |
| `corepack pnpm architecture:check` | **PASS** exit 0; reports only pre-existing documented grandfathered files above 300 lines; changed authored code meets the file-size ceiling |
| `corepack pnpm lint` | **PASS** exit 0; Turbo 11/11 packages successful |
| `corepack pnpm typecheck` | **PASS** exit 0; Turbo 11/11 packages successful after correcting one malformed-permit negative-test cast |
| `corepack pnpm build` | **PASS** exit 0 on an independent complete verification run (10/10 build tasks); another overlapping build invocation failed due Next.js concurrent build lock, not an application compilation finding |
| `corepack pnpm --filter @valet/database exec prisma validate` | **PASS** with process-only nonconnecting synthetic migration URL; no DB connection |
| Integrated focused `api-non-postgres` Vitest A/provider/S | **PASS** 36/36; separate focused recovery 71/71 PASS |
| `node --test scripts/test-harness/issue429-qa-*.test.mjs` | **PASS** 31/31 including actual local synthetic HTTPS/TLS; no real paid provider or database |
| `node --test packages/database/issue429-private/target-preflight.test.mjs` | **PASS** 7/7 offline negative target checks; never acquired PostgreSQL lease |
| `git diff --check` | PASS after integration and reviewed corrections |
| Root `corepack pnpm test` (includes PG-dependent suites) | **NOT RUN**: unsafe without attested exclusive isolated PostgreSQL target/lease |
| OCR migrations, live SQL constraints/grants, cross-process races and production-mode two-API HTTPS mock | **NOT RUN**: Docker Desktop became unavailable, no exclusive validated test URL/lease credentials; no database mutation attempted |
| Paired ordinary Check-In P50/P95/P99 with confidence interval; independent headroom-qualified NOWAIT false-denial envelope | **NOT RUN**: representative traffic not approved/configured; no valid baseline/candidate pair, confidence bound or resource telemetry |
| Android/iOS physical-device testing | **NOT RUN**: Phase 7 removed by Owner; automated appearance checks do not replace device proof |
| GitHub remote CI | **NOT RUN / UNVERIFIED** until an authorized review-branch push and actual job conclusion |

## Security and release conditions

The implementation defaults platform and Organization OCR OFF, makes Admission
and immutable debit durable before provider fetch, denies unknown COMMIT,
consumes one private synchronous pre-fetch permit, conservatively settles
possibly invoked HTTP to `UNKNOWN`, and keeps Manual/No Plate Check-In
independent. These are **source-reviewed properties**, not validated live
PostgreSQL/remote-provider execution guarantees. No real provider billing,
subscription, privacy, rate/pricing or remote-completion claims are inferred.

The isolated QA environment was observed earlier as a test-labeled PG17 Docker
container on `127.0.0.1:45432` but later `docker inspect` failed with
`Docker Desktop is unable to start`; current env has no approved
`TEST_DATABASE_URL`, migration URL, run ID or Issue429 exclusive lease. Host C:
reported zero free space during the failure. Do not start, migrate, recover or
run destructive tests against an unverified database. No production migration
or live OCR traffic occurred.

Open gates before merge/activation: fix and independently review W7 source-to-
build artifact provenance; execute attested isolated PG17 migrations/ACL/role
and cross-process correctness/failure tests; authorize representative normal
and peak envelopes, then run paired Check-In and NOWAIT tests to the accepted
statistical gates; obtain physical Native proof if merge policy requires it;
verify provider account/cost cycle/TLS/egress/privacy, human-bound operators,
alerts/recovery schedule, CI and separate production Owner approval. Without
this evidence the branch is suitable only for **Owner source review**.
