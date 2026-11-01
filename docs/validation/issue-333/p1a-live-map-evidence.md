# P1-A — Live Operations Map, native PostgreSQL 17.11

Source baseline: `origin/main c638a437749cae1f78a8c8a417fd4d53e6a34920`. Verification was executed from Prime Issue #333 branch after integrating the W6 harness as `c6362cd3`; the test and seed fixture were uncommitted verification-only files at execution time.

Exact test sources on the first run (SHA-256):

- `apps/api/test/dashboard-issue333-live-map.integration.test.ts`: `7B16BEE2EB01E5E698EA4B4C1A5B7912662259B4DFA63CEE3AF2DC3B582243B9`
- `apps/api/test/dashboard-issue333-live-map-fixture.ts`: `8176EFBDECDBDBE3AD4E9639F5B84F71CE101316A38C59C6B301AF64B7223AEB`

Run command from Prime worktree:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite issue333 -TestFile test/dashboard-issue333-live-map.integration.test.ts
```

Private owned cluster: random run ID `e2729db6a41e4f97a59ea1c3a663d857`, loopback `127.0.0.1:59276`, PostgreSQL server version number `170011`, authenticated bootstrap role `issue315_owner`, private PGDATA under this Issue #333 Prime worktree. The fixture migrated a child database and used a non-privileged runtime role. Source logs are local ignored artifacts at `tmp/issue-333-w6-evidence/e2729db6a41e4f97a59ea1c3a663d857/` (`identity.txt`, `tests.txt`, `cleanup.txt`); do not commit raw credentials or full logs.

## Authenticated HTTP and canonical writer result

| Schedule | Actual observation | Evidence classification |
| --- | --- | --- |
| Revoker-first | Real MFA-assured Company Admin HTTP revoke returned `201`; persisted `membership_location_access` grant count became zero; a subsequent real LM bearer GET returned `404` without the synthetic vehicle descriptor. | **VERIFIED SAFE IN TESTED CONTRACT** for a new read after confirmed revoke only. |
| Reader-first | Real LM bearer GET entered `REPEATABLE READ` and `authorizeLiveMapRead` returned current grant. In-transaction `pg_backend_pid=7280`, `txid_current_snapshot=1906:1906:`. The request was paused after authority evaluation; real Company Admin HTTP revoke committed `201` and the persisted grant was zero. `pg_stat_activity` showed reader PID 7280 `idle in transaction`, `pg_blocking_pids(7280)=[]`. After resume, LM HTTP GET returned `200` containing the synthetic vehicle. Next GET returned `404`. | **RED observed post-revocation disclosure**. Although the observational Vitest case passed its ordering/response assertions, this is **not** a passing security result; accepted ordinary-grant in-flight policy requires independent interpretation before a confirmed-vulnerability conclusion. |
| Scope negatives | Distinct authenticated foreign-Organization LM and same-Organization LM at an ungranted Location both received `404` without the vehicle. | **VERIFIED SAFE IN TESTED CONTRACT** for these two object-scope negatives. |

The Vitest characterization runner reported 3/3 test cases PASS, about 45 seconds total including boot/migrations. The reader-first case intentionally asserts trace correctness rather than assuming an unaccepted universal in-flight cancellation contract. It produced RED observational evidence; it must never be counted among safe reader-first authorization outcomes.

At teardown, the child database count and non-parent connection count were both **0**; the exact private PostgreSQL cluster was stopped and its owned data directory removed. No production database, shared QA database, production authorization code, API schema, migration, or Dashboard UI was changed.

Limits: This single native-PostgreSQL run covers the above precise schedules only. No two-reader same-authorization HTTP interleaving, canonical writer rollback, unknown commit outcome, Supervisor active-Shift revocation race, Company Admin session replacement/MFA expiry race, or representative p50/p95 latency sample was established by this file. These remain **UNVERIFIED** unless additional actual test evidence is recorded separately.
