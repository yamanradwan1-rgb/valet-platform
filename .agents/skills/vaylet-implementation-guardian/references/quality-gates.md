# VAYLET quality gates

Run the repository-defined gates required by the current Definition of Done.

Baseline root gates:

```bash
corepack pnpm architecture:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Database-affecting work also runs:

```bash
corepack pnpm --filter @valet/database exec prisma validate
```

Plus the repository-defined development/production migration and drift checks required by `docs/07_DEFINITION_OF_DONE.md` and `docs/16_PRODUCTION_DATABASE_DEPLOYMENT_CHECKLIST.md` when applicable.

Always run:

```bash
git diff --check
```

Run focused formatting checks on changed applicable files. Do not mass-format unrelated debt.

Never claim a fresh Standard Security Scan or Deep Security Scan succeeded unless that scan was actually executed and its result was observed.

## Production evidence gates

For runtime-affecting work, successful repository gates do not replace runtime/failure verification. Read `production-evidence-and-failure-gates.md`.

Keep these results separate in the final evidence:

- lint;
- typecheck;
- test;
- build;
- migration verification;
- Docker/runtime verification;
- failure-injection verification;
- remote CI verification.

When Docker/Compose is in scope, inspect actual container state, health/readiness, dependency connectivity, and logs after startup. When crash/outage recovery is claimed, prefer the real process/container failure over a mocked callback when practical.
