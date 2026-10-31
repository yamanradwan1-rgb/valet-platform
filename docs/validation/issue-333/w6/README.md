# Issue #333 — W6 isolated PostgreSQL verification lab

Use this runner **only in a named Issue #333 isolated worktree**. It creates a
fresh PostgreSQL 17 cluster under that worktree's own
`tmp/issue-315-pg-qa/issue319-<random>/.issue315-private-cluster` path. The
historical directory shape deliberately preserves the existing #315/#319
fixture ownership guards. It never starts or touches the Windows PostgreSQL
service, Docker, another worktree's database, or a shared/prod database.

The runner binds only `127.0.0.1` on a random nonstandard port, generates a
random SCRAM password, attests the *live* PostgreSQL role, port, data directory
and version before setting any test database URL, and injects a scoped test
environment. Each `ManagementControlPlaneTestFixture` creates and removes its
own migrated child database/runtime role. No broad root test command is used.

From the owned worktree root, with offline dependencies present:

```powershell
pnpm install --offline --frozen-lockfile --ignore-scripts
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite issue333
```

To run one test file rather than all `dashboard-issue333-*.integration.test.ts`
files, pass a strict suite-owned path:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite issue333 -TestFile test/dashboard-issue333-live-map.integration.test.ts
```

Historical suites can be sampled without editing their guards:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite baseline -TestFile test/dashboard-issue315-concurrency.integration.test.ts
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite audit -TestFile test/dashboard-issue319-lifecycle.integration.test.ts
```

For new Issue #333 tests, import `fixture`, `startIssue333Lab`,
`stopIssue333Lab`, `barrier`, and `waitForPgBlockers` from
`apps/api/test/dashboard-issue333-lab.ts`. The `start` function first verifies
the exact private parent PostgreSQL identity, then migrates/starts the fixture
and checks its runtime principal is not superuser and has no role/DB creation
privileges. The blocker helper compares exact backend PID sets returned by real
`pg_blocking_pids`, with a finite deadline.

The runner stores identity, test output, cleanup inventory and any failure in
`tmp/issue-333-w6-evidence/<random-run-id>`. After an ordinary completed run,
it stops only its own cluster. It deletes only that freshly generated directory
when live identity matches, all test child databases/connections are gone, and
`pg_ctl` stopped successfully. Otherwise it retains the private data directory
for deliberate owner inspection. No stale-resource sweeper is enabled.

Evidence levels: W6's direct lock graph proves two independent database readers
can hold an advisory SHARED lock against one EXCLUSIVE writer. `55P03` and
`57014` prove actual PostgreSQL timeout/cancellation and rollback. The `40001`
case injects SQLSTATE synthetically on a real connection; it does **not** prove
a naturally induced serialization conflict, application-level retry policy, or
HTTP result. Ambiguous/unknown COMMIT, protected disclosure after revocation,
and canonical authenticated HTTP writers must be tested separately by their
owning W2/W3/W4/Prime suites; neither success nor failure is inferred here.
