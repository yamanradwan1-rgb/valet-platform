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
| `pnpm --filter @valet/contracts exec vitest run src/staff-password-reset.test.ts --maxWorkers=1` | NOT RUN — `vitest` command unavailable before dependency installation | Does not establish a test failure or PASS |
| Latest feature SHA GitHub Actions / Security CI | NOT VERIFIED | Historical green run cannot attest this SHA |
| Source-level previous Option A W6/W7/W8 review | PASS for previous `9b873610...` design only | Not a code/PG17/prod assurance result |

## Distributed implementation ownership

| Track | Owner | Allowed source area | Initial state |
| --- | --- | --- | --- |
| G1 application binary VAP1 TLV/proof signer | W1 | New Auth `vap1` modules and own tests | IN PROGRESS, isolated branch |
| G2 private SQL key/challenge/receipt, migration/provisioner | W2 | Exclusive Prisma/schema, forward-only migrations and SQL privilege scripts | IN PROGRESS, isolated branch |
| G3 Staff Login/Refresh/MFA | W3 | Existing Auth/MFA integration and own tests | IN PROGRESS, isolated branch |
| G4 Management/Onboarding/Push/X01/anti-abuse | W4 | Exclusive non-Auth API source/tests | IN PROGRESS, isolated branch |
| G7 legacy ADMIT/HOLD/RETIRE and rehearsals | W5 | New L1/L2 tools and fixtures, no schema writes | IN PROGRESS, isolated branch |
| G6 safe disposable PostgreSQL17 test target | W9 | Dedicated Issue416 private preflight/config/test harness | IN PROGRESS, isolated branch |
| Security review | W6/W7/W8 (initial read-only) | No edits | EARLY SOURCE FINDINGS ONLY; new code review pending |
| Integration and conditional Reset Backend/Dashboard | Prime | Shared integration and feature stage only after security proof | GATE CLOSED |

## Mandatory security blockers and validation backlog

1. **P0 test-target isolation:** existing Docker PostgreSQL `127.0.0.1:45432` and QA candidate processes are not Issue416 disposable test targets. Generic PostgreSQL harness has a fallback chain and stale-owner cleanup that may DROP a database/role. A new Issue416-only PostgreSQL17 instance must be attested with an exclusive lease **before** any migration/provisioner/test DDL. All of `TEST_DATABASE_URL`, `MIGRATION_DATABASE_URL`, `DATABASE_URL` and sanitized child-process overrides must resolve to the same proved disposable instance, with distinct allowed roles. NOT VERIFIED.
2. **P0 SQL-only authority:** currently enabled historic runtime DML and actor/hash-only SQL definers are not yet replaced. The old runtime/MFA, management/onboarding and Shift provisioners can regrant those privileges. A coordinated source+grant+provisioner+verifier cutover, with two-run ACL negative evidence, is mandatory. NOT IMPLEMENTED/NOT VERIFIED.
3. **P0 signer oracle:** application signer may be admitted only from genuine in-process password/refresh/bearer/TOTP/recovery ceremonies and a purpose/current-transaction-bound command, never arbitrary User ID, fake session context or stored access-token hash. Node/PG17 byte/HMAC parity and replay/forgery negatives remain NOT RUN.
4. **P1 MFA audit provenance:** unchanged migration `20261113011200_issue416_reserved_security_audit` reserves reset names but generic runtime audit can currently append four MFA ceremony names. Future forward-only SQL and test changes must reject generic append while preserving genuinely authorized purpose-bound events. NOT IMPLEMENTED.
5. **P1 `mte1` encrypted MFA persistence:** A04-create/A07 must carry source-compatible protected ciphertext and A04-resume returns ciphertext only to the authenticated original session; SHA-256 digest alone is insufficient. End-to-end SQL integration NOT RUN.
6. **P1 R02 anti-abuse:** fixed pre-domain atomic four-scope reservation and SQL-authenticated finalization; no nested pool acquisition under domain locks and no COUNTED→IGNORED by ordinary SQL. NOT IMPLEMENTED/NOT VERIFIED.
7. **P1 concurrency and legacy trust:** 21 planned PostgreSQL two-connection race cases, ADMIT/HOLD version-fencing, operator recovery, key promotion/retirement, unknown COMMIT, older-backup monotone protection and N/R compatibility are NOT RUN.

## Hard feature gate

Issue #416 reset Backend, Dashboard Admin action and anonymous redeem page must **not** be treated as authorized to advance until all source security gates are genuinely implemented and their mandatory isolated tests pass, with no unresolved BLOCKER/MAJOR. Missing production infrastructure attestation blocks **production readiness**, not necessarily source development. Reviewers must re-review the **exact final integrated implementation SHA**, independently of earlier design/source reviews.

**Deployment status:** NOT AUTHORIZED. **Production key custody:** EXTERNAL — NOT VERIFIED. **No PR, merge, deploy, cutover, feature activation or issue closure.**
