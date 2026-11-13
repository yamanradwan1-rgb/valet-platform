# Issue #416 — Security Foundation implementation execution ledger

**Status: IN PROGRESS — NO SECURITY FOUNDATION PASS, NO RESET FEATURE GATE PASS.**

This ledger distinguishes previous Option A **document/source review** from newly authorized **implementation and isolated verification**. The Owner's 2026-11-13 implementation directive approves S1 for development, U1 conditionally for isolated synthetic-key implementation, L1 for synthetic admission/recovery tests and L2 as an isolated-rehearsal policy. It does **not** authorize a PR, merge, QA/production migration, live key provision, session revocation, feature activation, deployment or cutover.

## Baseline evidence — 2026-11-13

| Check | Observed result | Meaning |
| --- | --- | --- |
| Git fetch and source baseline | `origin/main` `bfb4fdccf9d557c371313c9e357faa52e0a71014` | Latest main observed before source implementation |
| Existing Issue #416 feature | local and `origin/feat/issue-416-company-admin-password-reset` both `9b873610f00d5d520c9553d4a5185b9598e0fdb5` | Integration source base, not a runtime proof implementation |
| Existing feature Git status | clean | No existing feature work overwritten |
| Owner development authorization | recorded in Prime-only commit `474506e96efd819b8f69f29995a1994b7927f642` | Local documentation commit; NOT YET merged into feature or pushed |
| `node scripts/architecture-check.mjs` on Prime baseline | PASS (exit 0) | Existing grandfathered overlength-file warnings; not security testing |
| `pnpm install --frozen-lockfile --prefer-offline` | PASS on isolated Prime worktree (no lockfile modification) | Dependency setup only; ignored optional native build scripts are not runtime assurance |
| `pnpm --filter @valet/contracts exec vitest run src/staff-password-reset.test.ts --maxWorkers=1` | PASS, 14/14 | Existing reset contract; protected reset backend not implemented |
| `pnpm --filter @valet/api typecheck` | PASS (after fixing an Issue416 test fixture mutable-array TS2345) | Current Prime integrated TypeScript before additional pending commits |
| `pnpm --filter @valet/database prisma:validate` | PASS | Prisma source schema syntax, not migration correctness |
| Focused API auth/MFA/management non-PostgreSQL Vitest | PASS: 38/38 Auth/MFA/Onboarding; 11/11 Issue416 management/Shift/limiter; **25/25 VAP1/U2 typed codec** on integrated Prime (separate executions) | Mocked/non-PG regression coverage, not SQL authorization or Node↔PG17 parity |
| `node --test apps/api/tools/issue416-legacy/tests/*.test.mjs apps/api/tools/issue416-rehearsal/tests/*.test.mjs` | PASS 29/29 | Symbolic/synthetic L1/L2 planning, no admission SQL or rehearsal |
| `node --test packages/database/issue416-quota/*.unit.test.mjs` on integrated Prime | PASS 7/7 | Source-only R02 rolling limits, four-row bundle/receipt and SQL migration structure; PG17 execution NOT RUN |
| Issue416 private PG17 Docker+SQL parent/sanitized-child attestation | PASS on **new** isolated `vaylet-issue416-w9-pg17` at `127.0.0.1:55416/issue416_w9_db` | Independent exact container/role/loopback/image/volume evidence; unrelated QA `45432` untouched |
| W9 private preflight unit + actual PG17 read-only privileges | PASS 48/48 preflight; 5/5 actual PG17 read-only tests in W9 branch; Prime reproduced 45/45 and 4/4 before W9 migrator follow-up | Proves test-target safety/role preflight only, not VAP1 runtime ACL |
| First guarded PG17 `run-migrations.mjs --apply` | **FAIL — Prisma P3018, SQLSTATE 42501, migration113 `permission denied for schema auth_proof_private`** | Original private schema REVOKE ran before `SET ROLE`; source owner-order fix committed, not yet proven by PG17 |
| First W9-only attested `run-resolve-113.mjs --resolve-113` | PASS: marked only first failed 113 row rolled back | Historical 112 success unchanged; targeted bookkeeping only in disposable W9 fixture |
| Second guarded PG17 `run-migrations.mjs --apply` | **FAIL — PostgreSQL logs 42501 `permission denied to change default privileges`; Prisma subsequently reports 25P02 `current transaction is aborted`** | The initial error was `ALTER DEFAULT PRIVILEGES FOR ROLE` before NOINHERIT proof owner `SET ROLE`; source correction `59931e05` NOT PG17 validated |
| W9 read-only `_prisma_migrations` + catalog after second failure | 112 SUCCESS, first 113 ROLLED_BACK, second 113 FAILED/UNFINISHED with empty logs; no private schema/proof owner/private relations/memberships | DDL fully rolled back; no generic reset/drop was performed |
| Second 113 recovery guard and test | W9 provenance-pinned source+three-history-record guard integrated; **55/55 private unit tests PASS** | The subsequent actual `--resolve-113` invocation was blocked by the execution environment's safety checks; NOT executed; no further migration retry |
| Latest feature SHA GitHub Actions / Security CI | NOT VERIFIED | Historical green run cannot attest this SHA |
| Source-level previous Option A W6/W7/W8 review | PASS for previous `9b873610...` design only | Not a code/PG17/prod assurance result |

## Distributed implementation ownership

| Track | Owner | Allowed source area | Initial state |
| --- | --- | --- | --- |
| G1 application binary VAP1 TLV/proof signer | W1 + W11 typed codec | New Auth `vap1` and `vap1-typed` modules/tests | Node 18-field proof and strict U2 typed/20-field state codec integrated, 25/25 PASS; purpose-specific authenticated signer NOT IMPLEMENTED |
| G2 private SQL key/challenge/receipt, migration/provisioner | W2 | Exclusive Prisma/schema, forward-only migrations and SQL privilege scripts | 113–117 dormant source integrated; **113 actual PG17 FAILED**, protected writer SQL and successful migration PENDING |
| G3 Staff Login/Refresh/MFA | W3 | Existing Auth/MFA integration and own tests | mte1 source-compatible preparation and raw-vsa1 guard integrated; direct legacy SQL still active |
| G4 Management/Onboarding/Push/X01/anti-abuse | W4 + W12 quota | Non-Auth API and separate private R02 SQL bundle | Pre-domain lease source regressions integrated; R02 private migrations120/124 dormant source + 7/7 unit PASS; no actual PostgreSQL quota enforcement; protected Management/X01 writer NOT IMPLEMENTED |
| G7 legacy ADMIT/HOLD/RETIRE and rehearsals | W5 | New L1/L2 tools and fixtures, no schema writes | 29/29 synthetic PASS; no real SQL admission, operators or N/R rehearsal |
| G6 safe disposable PostgreSQL17 test target | W9 | Dedicated Issue416 private preflight/config/test harness | Parent+child attestation and 48/48+5/5 role/preflight PASS, 55/55 unit guard PASS; two actual 113 migration FAILs; second targeted Prisma recovery blocked/unexecuted |
| Security review | W6/W7/W8 initial; W10 candidate | No edits | Static findings corrected or OPEN; final exact implementation SHA independent review and PG17 proof pending |
| Integration and conditional Reset Backend/Dashboard | Prime | Shared integration and feature stage only after security proof | GATE CLOSED |

## Mandatory security blockers and validation backlog

1. **P0 real SQL migration failure:** first isolated PG17 migration113 failed 42501 on private schema REVOKE before proof-owner SET ROLE. After scoped first rollback resolve, second migration113 failed 42501 on default-privilege ALTER before the same SET ROLE; PostgreSQL logs established this exact underlying error while Prisma's explicit transaction surfaced only later 25P02. Both owner-context defects are fixed **in source only** at current local migration113. No private schema/role objects survived either failure. **Second Prisma failed migration is unresolved: the subsequently attempted guarded recovery was blocked by tool safety checks; no third migration application or security PASS.**
2. **P0 test-target isolation:** existing Docker PostgreSQL `127.0.0.1:45432` and QA candidate processes are not Issue416 disposable targets. The dedicated W9 fixture `127.0.0.1:55416` now passes parent+sanitized-child Docker/SQL identity gates and negative tests. Only its explicit guarded test adapter is authorized; generic cleanup/fallback runners remain prohibited. **ISOLATED PRE-FLIGHT PASS, SQL MIGRATION BLOCKED.**
3. **P0 SQL-only authority:** currently enabled historic runtime DML and actor/hash-only SQL definers are not yet replaced. New dormant source for denying old regrant paths exists, but no verified purpose-specific replacements or two-run ACL evidence. Keep `LEGACY_COMPAT`; no PROTECTED promotion. **NOT VERIFIED.**
4. **P0 signer oracle:** strict 18-field Node proof codec/tests exist; NO actual purpose-specific signer exists. The app must bind genuine submitted credentials to one signed challenge under same backend/fullXID/locked state, never arbitrary User ID, fake context or stored hash. **Node↔PG17 byte/HMAC parity and signer-oracle/SQL-only forgery tests NOT RUN.**
5. **P1 MFA audit provenance:** unchanged migration112 reserves reset names; proposed forward-only 116 adds phase-gated protection for four MFA ceremony names but **failed 113 blocked applying 116**. Existing generic runtime append vulnerability remains. No protected audit writer enabled.
6. **P1 `mte1` encrypted MFA persistence:** actual source-compatible encrypted material helper and raw Bearer possession guard added, focused Node tests pass. No A04-create/A07 protected SQL persistence or A04-resume encrypted-return function. **End-to-end SQL integration NOT RUN.**
7. **P1 R02 anti-abuse:** pure fixed-key planner, safer onboarding reservation ordering and dormant private four-scope quota source are integrated; migration120 (250 lines) and migration124 (245 lines) declare atomic private reserve/reconcile+deferred integrity and no runtime grants, with 7/7 source-only unit tests PASS. The actual PG17 migrations, R02 signed-domain generation, receipt reconciliation, SQL-only tamper negatives, retention policy and integration with 118/119/121–123 **are NOT VERIFIED**. Existing `limiter_bindings` FK with `ON DELETE RESTRICT` can block old one-hour anti-abuse cleanup after rows are populated; resolve lifecycle before activation.
8. **P1 concurrency and legacy trust:** 21 planned PostgreSQL two-connection race cases, ADMIT/HOLD version-fencing, operator recovery, key promotion/retirement, unknown COMMIT, older-backup monotone protection and N/R compatibility are **NOT RUN** (only 29 synthetic Node L1/L2 PASS).

## Hard feature gate

Issue #416 reset Backend, Dashboard Admin action and anonymous redeem page must **not** be treated as authorized to advance until all source security gates are genuinely implemented and their mandatory isolated tests pass, with no unresolved BLOCKER/MAJOR. Missing production infrastructure attestation blocks **production readiness**, not necessarily source development. Reviewers must re-review the **exact final integrated implementation SHA**, independently of earlier design/source reviews.

**Deployment status:** NOT AUTHORIZED. **Production key custody:** EXTERNAL — NOT VERIFIED. **No PR, merge, deploy, cutover, feature activation or issue closure.**
