# Validation commands and outcomes

Baseline:66968655b8bd90c6681daf53fb9d8da9b9ab9f79. Existing Node24.19.0/Vitest4.1.10 dependencies reused; no full supported-toolchain CI or production build pass. Commands use isolated source except external audit configs/probes. Working directory is the corresponding package for package-local runs.

## Architecture check

```sh
node scripts/architecture-check.mjs
```

PASS;17 grandfathered warnings

Evidence: `architecture-final.log`.

## Targeted lint

```sh
<DEPENDENCY_CHECKOUT>/node_modules/.bin/eslint apps/api/src apps/api/test apps/api/tools apps/customer/src apps/dashboard/src apps/valet/src packages/*/src --max-warnings=0 --no-cache
```

PASS; excludes native/scripts/infra full lint

Evidence: `lint-final.log`.

## API TypeScript

```sh
<DEPENDENCY_CHECKOUT>/node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit --incremental false
```

PASS; API only

Evidence: `typecheck-api-final.log`.

## Harness safety

```sh
node --test scripts/test-harness/*.test.mjs
```

39 passed; separate successful rerun, not doubled

Evidence: `harness-only-final.log`.

## Initial build contract + harness

```sh
node --test scripts/test-harness/*.test.mjs scripts/build/build-contract.test.mjs
```

46 passed including39 harness;1 actual-build case failed during unintended dependency setup; no build proof

Evidence: `node-validation.log`.

## Customer

```sh
<DEPENDENCY_CHECKOUT>/node_modules/.bin/vitest run --config apps/customer/vitest.config.mjs apps/customer/src --reporter=json --outputFile=<AUDIT_WORKDIR>/customer-tests.json
```

67 files /481 tests passed

Evidence: `customer-tests.json`.

## Dashboard focused

```sh
Exact seven-file command preserved in dashboard appendix
```

7 files /78 tests passed

Evidence: `dashboard/report.md`.

## API operations focused

```sh
Exact eleven-file command in backend operations appendix
```

11 files /81 tests passed

Evidence: `backend_operations/tests.log`.

## API integration boundaries focused

```sh
Exact nine-file command in integrations appendix
```

9 files /67 tests passed

Evidence: `backend_integrations/focused-tests.log`.

## Database pure full project

```sh
<DEPENDENCY_CHECKOUT>/node_modules/.bin/vitest run --config vitest.config.mjs --project database-non-postgres
```

8 files;64 passed /1 failed (DB-01)

Evidence: `database/vitest-non-postgres.log`.

## Contracts full source

```sh
<DEPENDENCY_CHECKOUT>/node_modules/.bin/vitest run src --maxWorkers=2
```

71 files;506 passed /1 failed (VAL-002)

Evidence: `contracts-full-tests.log`.

## Portable employee full source

```sh
<DEPENDENCY_CHECKOUT>/node_modules/.bin/vitest run src --maxWorkers=2
```

103 files /897 tests passed; includes earlier30 focused cases

Evidence: `employee-client-full-tests.log`.

## Employee Web full src

```sh
<DEPENDENCY_CHECKOUT>/node_modules/.bin/vitest run src --maxWorkers=2
```

117 files /655 tests passed; includes earlier13 focused cases

Evidence: `employee-web-full-tests.log`.

## Native Node test scope

```sh
<DEPENDENCY_CHECKOUT>/node_modules/.bin/vitest run test --exclude '**/*.mjs' --maxWorkers=2
```

225 files;1575 passed /5 failed initially;4 .mjs script suites excluded; no device proof

Evidence: `native-node-full-tests.log`.

## Native timeout disambiguation

```sh
<DEPENDENCY_CHECKOUT>/node_modules/.bin/vitest run test/native-appearance-render-matrix.test.ts test/native-header-theme-geometry.test.ts test/native-shift-recovery-freeze.test.ts --maxWorkers=1 --testTimeout=30000
```

3 files /10 tests passed; resolves3 initial5000ms timeouts, not a clean default-timeout full-suite pass

Evidence: `native-timeout-disambiguation.log`.

## Native font path diagnosis

```sh
Compared the9 configured font paths in audit vs original existing dependency directories
```

0/9 in audit conventional node_modules vs9/9 in original;2 font-path failures are environment limitations, not established production defects

Evidence: `native-font-diagnosis.txt`.

## Currency precision

```sh
<DEPENDENCY_CHECKOUT>/node_modules/.bin/vitest run --config vitest.config.mjs --project api-non-postgres --maxWorkers=1 test/currency-minor-units.test.ts
```

1 file /4 tests passed

Evidence: `currency-tests.log`.

## Tracking official discovery

```sh
vitest list --config vitest.config.mjs --project api-non-postgres --filesOnly src/modules/tracking/live-map-cursor.test.ts src/modules/tracking/route-history-cursor.test.ts src/modules/tracking/point-in-polygon.test.ts
```

No files discovered; confirms TEST-001

Evidence: `tracking-official-discovery.log`.

## Tracking explicit external config

```sh
<DEPENDENCY_CHECKOUT>/node_modules/.bin/vitest run --config <AUDIT_WORKDIR>/tracking-tests.config.mjs
```

3 files /10 tests passed; not part of official API projects

Evidence: `tracking-direct-tests.log`.

## Disposable operational PostgreSQL suites

```sh
Exact3-file Vitest command in validation commands; fresh audit-owned localhost15439 only
```

3 files failed fixture setup /23 cases skipped;0 operational cases passed

Evidence: `disposable-postgres-tests.log`.

## Direct clean PostgreSQL SQL chain

```sh
Applied existing migration.sql files in sorted order via docker exec psql -v ON_ERROR_STOP=1
```

103 SQL files PASS;PostgreSQL17.11,84 public tables;container removed

Evidence: `disposable-sql-migration.log`.

## Source probes

```sh
Existing-source transpilation probes for preferences/button, workspace scope, staff lease and handoff time
```

Mounted/SSR/pure/fake-DB evidence; not physical/provider/real concurrency tests

Evidence: `coordinator-findings.md`.

## PostgreSQL fixture invocation

From source/apps/api with DATABASE_URL, MIGRATION_DATABASE_URL and TEST_DATABASE_URL all set explicitly to the newly created audit-only valet_audit database on127.0.0.1:15439:

```sh
<DEPENDENCY_CHECKOUT>/node_modules/.bin/vitest run --config vitest.config.mjs --project api-postgres-standard --maxWorkers=1 test/dispatch-assignment.integration.test.ts test/complete-handoff-authorization.integration.test.ts test/complete-handoff-command.integration.test.ts
```

The synthetic container password was not a real credential. No existing database/volume was used. PostgreSQL global setup/cleanup succeeded; fixture subprocess pnpm setup failed and23 operational cases were skipped. Direct SQL validation was separate.
