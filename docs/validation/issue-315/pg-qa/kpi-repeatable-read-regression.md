# #315 follow-up — KPI authorization regression (deterministic source-level proof)

## Actual cause

At the pre-#315 baseline `9abbbd2cf6ea062beabdcd06d8323ede474384dc`,
`apps/api/src/modules/dashboard/dashboard-read-authorization.ts` directly
returned the authorized Location Manager scope for `ANALYTICS_READ`.
`analytics-kpi-query.ts:37-47` began a `REPEATABLE READ` transaction, called
that authorization helper, and continued to compute the KPI response.

#315's revocation fence adds a SHARED organization advisory lock and tests
`current_setting('transaction_isolation') = 'read committed'`, returning
`null` for an LM under `REPEATABLE READ`. The unchanged KPI route then calls
`assertAuthorized(null)` and throws `DashboardOverviewError` with code
`AUTHORIZATION_DENIED`. A fully authorized LM therefore cannot retrieve KPIs.
The source of the conflict is the KPI transaction isolation, not a real
membership or grant revocation.

## Minimal regression test and expected outcome

`apps/api/test/dashboard-issue315-kpi-regression.test.ts` invokes **the real**
`locationKpiAnalytics` and **the current real**
`authorizeDashboardReadLocation`. It simulates PostgreSQL transaction
isolation, mocks the raw LM grant read and the unrelated KPI aggregates,
and asserts the exact KPI contract. It includes an explicit **source-equivalent
emulation** of the pre-#315 LM authorization branch for a complete baseline KPI
call, rather than claiming to run a pre-#315 binary or real PostgreSQL server.
Its KPI SLA projection stub checks that the transaction executing projection
is still `REPEATABLE READ`.

Run from repository root:

```powershell
pnpm --dir apps/api exec vitest run --config ../../docs/validation/issue-315/pg-qa/vitest-kpi.config.mjs --reporter=verbose
```

**Against the two original #315 auth commits (8b235c1b, 4ff09023):**

| Case | Result |
| --- | --- |
| Source-equivalent baseline LM branch returns KPI with RR snapshot | PASS |
| **Current authorized LM KPI must succeed under RR** | **FAIL: AUTHORIZATION_DENIED** at `analytics-kpi-query.ts:47` |
| Revoked LM grant must deny KPI before projecting | PASS |
| Company Admin's separate MFA-gated KPI path still works under RR | PASS |

**Current run: 3 PASS / 1 expected RED, 0.7s.** The RED test is a desired
acceptance condition for the W1 production fix; do not weaken it or mark this
regression suite green until the LM KPI route actually works.

## Fix acceptance criteria for W1

1. Legitimate LM KPI success, preserving a *single REPEATABLE READ* source
   snapshot for the KPI analytics projection.
2. Canonical `staff_management_set_location_access` revocation cannot commit
   midway through the projection, and a reader that loses the race must
   re-evaluate the committed grant (not rely on an old MVCC snapshot).
3. Revoked/ungranted/foreign/disabled LM authority fails closed; no accidental
   CA promotion while holding the LM SHARED advisory lock.
4. Company Admin retains the independent MFA-gated authorization contract.
5. This source-level test is a regression sentinel; its simulated PostgreSQL
   cannot, by itself, prove real `pg_advisory_xact_lock_shared` blocking,
   MVCC snapshot ordering or end-to-end HTTP responses. Existing #315
   PostgreSQL race cases and relevant KPI integration tests remain separate
   acceptance requirements.

No new database, service, or CI system was started for this follow-up. The
previous disposable #315 PostgreSQL directory had already been stopped and
deleted; no shared 5432 service was touched.
