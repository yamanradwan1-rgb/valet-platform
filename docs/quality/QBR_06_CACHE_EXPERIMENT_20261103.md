# QBR-06 — Lockfile-scoped pnpm cache experiment
Date: 2026-11-03
Status: Local configuration experiment, remote GitHub Actions NOT RUN on this change.

## Change
The existing five CI job definitions, which fan out to ten runner jobs through matrices, each installed dependencies without an explicitly configured pnpm store cache. This scoped patch reorders `pnpm/action-setup@v4` before `actions/setup-node@v4` and opts into setup-node's lockfile-scoped `cache: pnpm` with `cache-dependency-path: pnpm-lock.yaml`. All `pnpm install --frozen-lockfile` steps, job names, matrices, protected Issue215 tests, PostgreSQL services, browser/E2E execution and final quality aggregation remain unchanged. `pnpm-lock.yaml`, dependencies, Node 22 and pnpm 10.34.5 remain unchanged.

Primary reference (current public guidance): https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md#caching-packages-data — pnpm setup precedes Node setup, caching is of the global pnpm package store, **not** node_modules. Cache is an optimization, never a test execution substitute. Default branch/PR cache accessibility requires care with untrusted workflows: https://docs.github.com/en/actions/reference/dependency-caching-reference .

## Local proof and limitations
- Git diff integrity: PASS.
- PyYAML parsing of exact resulting workflow: PASS, six job declarations intact.
- For each of five setup blocks: pnpm setup before Node setup before frozen-lock install; exact version, cache key path, and frozen installs preserved. PASS (5/5).
- Runtime GitHub Actions cache restore/save/miss, cache scope, artifact security, job outputs, total runner minutes, and reduction are **NOT RUN**. A YAML parser is not the GitHub Actions interpreter.
- No required CI or merge policy was removed or weakened.

## Measurement / stopping gate
Run a normal owner-approved candidate PR with exact SHA, then compare at least 20 comparable workflow runs grouped by cache hit/miss, lockfile, OS and runner class. Capture install-step wall time and overhead, API-standard/race critical path, overall workflow p50/p95, total billed runner minutes, flaky failures and cache restore errors. The earlier run #582 had PostgreSQL race/standard critical-path duration near 21 minutes; caching may save setup time yet leave overall duration essentially unchanged.

Revert the optimization if setup-node cannot find pnpm on any OS, cache write/reuse fails, frozen lock integrity changes, setup time regresses, or protected tests fail. Do not claim a percentage savings before measured data.
