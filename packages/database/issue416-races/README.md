# Issue #416 — two-connection PG17 races (source-only acceptance lane)

**Status: BLOCKED / NOT RUN.** This directory is a read-only design and
validation lane based on `docs/plans/issue-416-option-a-locks.md` §§739–935,
which describes 21 security-sensitive race pairs. It does not sign VAP1 proofs,
provision a database, execute SQL, repair a migration, or claim a single PG17
integration PASS. A source-only test passing is never evidence of successful
PostgreSQL concurrency, real credential verification or cutover safety.

The fixed source baseline is Prime `e130441ae46f5cabaeb7c03e49553406a0c90f5f`.
W9's original migration113 recovery is explicitly **DENIED** and its historical
second attempt is unresolved. Even a seemingly correct `ISSUE416_R02_PG17_RELEASE`
value cannot supply ownership of an actual exclusive W9 lease. The runtime gate
intentionally raises `BLOCKED_PG17_NOT_RUN` before touching any callback.

The case manifests cover original pairs 01–15 and L1 `ADMIT→HOLD` pairs 16–21.
`enumerateTrials()` materializes all 210 `21 × 2 × 5` primary combinations:

| Branch | Must be proven by real PostgreSQL execution |
| --- | --- |
| `C` | Server-observed COMMIT and subsequent exact locked-state revalidation |
| `R` | Server-confirmed ROLLBACK and safe fresh ceremony |
| `D` | Backend disconnect strictly before any COMMIT, with observed rollback |
| `U` | Server COMMIT with **only acknowledgment** dropped, then new-lease receipt reconciliation |
| `T` | Observed named lock wait and bounded timeout; complete rollback, new proof and fresh lease |

For both A-first and B-first schedules, future tests must capture distinct PID,
transaction isolation, effective role/grants, `pg_blocking_pids`, matched
`pg_locks` resource and test-only statement-to-rank mapping. An ordinary lock
observation alone cannot establish the logical named fence. Observe the exact
lock before releasing the holder; never insert a timed sleep to guess a race.
`race-pg-observer.mjs` supplies **read-only SQL text** and a physical-witness
validator, without opening a connection. An authorized harness must additionally
collect the matching SQL XID, live version, receipt IDs and audit row counts.
`race-catalog-contract.mjs` supplies read-only PG17 identity, Prisma ledger,
private admission ACL and owner default-ACL queries. Its validators only check
source-shaped observations; they cannot independently attest the connection or
authorize a runtime lease.

After the original denial is resolved through *new authorization* and independent
review, the executor requires a genuinely owned per-connection lease; an attested
disposable PG17 with all reviewed migrations committed; real purpose-specific
issuer, proof and current credentials; verified private schema and default ACLs;
runtime/PUBLIC/inherited direct-write denial; current L1 gates and external HOLD
checkpoint; exact rank-ordered operations; and controlled independent COMMIT
acknowledgment loss. A mock, synthetic signer or arbitrary fixture DML does not
substitute for those conditions. No automatic fallback exists.

Additional acceptance requirements include the ten L1 negative gates defined
in `race-cases-admission.mjs`, globally enumerated expired credentials, UUID
inversion, multi-organization and wrong-tenant proof, whole-transaction audit
failure rollback, quota/finalizer starvation with a strict two-connection pool,
missing-admission rows and pre-T0 restore, replay and current generation checks,
and absence of secrets from receipts/logs. The reverse operator-timeout branch
is **not** a completed HOLD; affected authority stays externally paused until
reconciled. A `40P01` in the canonical graph is a regression, even if the
database aborts one transaction safely.

Source-only commands from repository root (require only Node):

```powershell
node --test packages/database/issue416-races/*.unit.test.mjs
node packages/database/issue416-races/race-runner.mjs --source-plan
```

Any `--execute` attempt must fail before acquiring a PG client. There is no
integration runner in this source checkpoint because no authorized, authentic
case driver or independently provable W9 lease-owner capability exists. To
complete PG17 acceptance, implement those dependencies in a separately reviewed
revision and execute each case/branch against the attested database. Report the
real SQLSTATE, physical lock witness, transaction outcomes, and durable
postconditions, rather than treating this manifest as execution evidence.
