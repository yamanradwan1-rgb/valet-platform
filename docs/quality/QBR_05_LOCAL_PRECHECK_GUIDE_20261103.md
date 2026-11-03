# QBR-05 — Local pre-PR checks without weakening required CI
Date: 2026-11-03
State: proposed workflow for developer use; no CI workflow/gate mutation.

## Goal and evidence
Developer time and agent token budget are wasted when an unrelated test's brittle assertion is discovered only after a full remote GitHub Actions run. The observed CI #582 included a strict Dashboard select locator, End Shift mock ownership mismatch, and three security-semantic/fixture API failures. The earlier API race/standard jobs were each about 21 minutes in one run; no statistically sound median exists.

The repository currently has exactly one required PR pipeline: .github/workflows/ci.yml. Root run scripts separate pure/non-Postgres and database-backed lanes. The owned-test classifier must continue to discover exactly one owner and preserve Issue215. A local quick check is **diagnostic assistance**, not evidence that the mandatory remote CI or another package's runtime tests passed.

## User workflow: cheap first, expensive only when needed
| Changed area | Immediate local check | Required follow-up |
| --- | --- | --- |
| Dashboard TS/React business/UI code | package typecheck and focused affected package Vitest tests | Browser-backed relevant scenarios when behavior depends on real DOM; required PR CI remains mandatory |
| Employee Web End Shift/Start Shift state or UI | package-scoped Vitest for exact changed source and related owner/retry guards | Real Employee E2E plus normal CI; do not infer correct async state from SSR-only mocks |
| Customer Guest session/identity/security | focused Customer Vitest and typecheck | Tenant/visit isolation, stale response, offline retries; mandatory PR CI |
| API authorization, scopes, protected reads/writes | affected non-Postgres tests, actual PostgreSQL integration test on *approved disposable* DB | All required Postgres lanes and security/race checks on PR; never skip because unit is green |
| Database schema/migrations/runtime roles | manifest/SQL integrity and focused migration test | Disposable PostgreSQL fresh + upgrade, privilege checks and full mandatory PR CI |
| Shared contracts, harness, build/config, dependency or workflow | full root non-Postgres and all relevant DB-backed suites; assess dependency graph | All required PR CI; unknown impact is high risk |
| Documentation only | inspect status/decision provenance, architecture check | No automated bypass of policy review when docs encode binding decisions |

Useful **examples**, not automated test-impact proof:
- `pnpm --filter @valet/dashboard exec vitest run src/features/intelligence/intelligence-api.test.ts`
- `pnpm --filter @valet/dashboard typecheck`
- `pnpm --filter @valet/valet exec vitest run src/components/end-shift-recovery.test.tsx`
- `node --test scripts/test-harness/*.test.mjs`
- `pnpm test:non-postgres` (broader but database-free)
- `pnpm --filter @valet/dashboard exec playwright test --config playwright.runtime.config.ts --list` **discovers** tests but does not run them.

Do not use a partial `vitest run` as an assertion that an affected nested import chain is exhaustively covered. A full required PR run is still needed; even a green full CI run is not production deployment evidence.

## Implementation rule
No new script has been added in this scope: an unsafe heuristic mapping file prefixes to test selectors can be worse than manual command selection. A trustworthy automated test-impact runner needs complete test dependency mapping, ownership, mutation-based falsification, and a fail-closed fallback for unknown/migrations/CI/contract changes. Implement that only after measured coverage and false-negative validation. This is a **documented immediate workflow**, not a proven speedup.
