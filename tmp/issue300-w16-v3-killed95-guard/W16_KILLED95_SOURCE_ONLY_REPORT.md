# Issue #300 R2 / W16 — isolated V3 killed95 fail-closed source review

**Disposition: SOURCE-ONLY, NOT LIVE ACCEPTED.** No V3 PG, Docker,
build, HTTP, API, browser, private-key access or production operation.

## Scope / non-mutation

- W16's **only** writable review folder:
  `D:/kndoom/valet-platform/tmp/issue300-w16-ts-deps-isolated/tmp/issue300-w16-v3-killed95-guard`.
- Read-only canonical source:
  `D:/kndoom/valet-platform/tmp/issue-300-final-closure-r2/tmp/issue300-r2-w6-v3-owned`.
- Copied canonical `v3-acceptance.mjs` (817 lines),
  `v3-sql-lease-watchdog.mjs` (136 lines), and
  `v3-sql-lease-watchdog.test.mjs` (245 lines). W16 modifies only
  OWN acceptance/watchdog copies and adds the witness helper/test,
  lease-boundary test and admission runbook. Canonical and integration
  shared copies remain untouched.
  New authored code and test files each remain under 300 physical lines.

## False-PASS removed

Canonical `v3-acceptance.mjs:582-626` considered *any* backend with
  `pg_stat_activity.wait_event_type='Lock'` evidence that the **child**
  was blocked in migration95; it ignored `child.kill('SIGKILL')`'s
  return value and treated every nonzero/undefined child exit as killed.
  An unrelated concurrent query, already exited runner, failed signal
  or unrelated process failure could satisfy the old gate.

W16's local replacement now:

1. Generates a cryptographically random per-child application name and
   passes it only to the spawned Prisma migration95 process as `PGAPPNAME`.
2. Requires an **observed** PostgreSQL `pg_stat_activity` and
   `pg_locks` join for that exact unique application name; own database,
   owner role, `public.tasks` relation, ungranted
   `AccessExclusiveLock`, `wait_event_type='Lock'` /
   `wait_event='relation'`, and the exact migration95
   `LOCK TABLE public.audit_events, public.tasks, public.incidents,
   public.valet_sessions IN ACCESS EXCLUSIVE MODE` query shape.
   The backend's start/query times must postdate child spawn.
3. Requires exactly one matching backend row, a live, unsignaled
   child; rechecks the same backend PID/start/query after a fresh SQL
   read immediately before kill.
4. Requires `child.kill('SIGKILL') === true` **and**
   Node's actual child exit callback `code === null` and
   `signal === 'SIGKILL'` in a bounded interval. A mere nonzero exit
   is not evidence.
5. After the OS death, every fresh independent PostgreSQL read checks
   `pg_stat_activity` by **exact observed PID and backend_start**, as
   well as **all sessions tagged by the same per-child nonce**, even
   across PID changes. Both must be absent for **two consecutive**
   bounded snapshots before it can release the held `tasks` lock.
   A CLI exit while the PG backend remains alive is **not PASS**.
6. On *any* absent/mismatched observation, failed signal, timeout,
   ambiguity or unsupported driver tagging: **throw and refuse PASS**.
   The failure finalizer records `killed95_unknown_quarantine` **GAP**,
   attempts a bounded OS exit and requires the independently owned V3
   PostgreSQL container to be verified **STOPPED before the held writer
   lock is deliberately released**. Docker identity is rechecked before
   and after stop. If stop is unconfirmed, the cleanup deliberately
   refuses to invoke the lock-release callback. Even confirmed stop is
   quarantine/UNKNOWN, never killed95 PASS.
7. Defers `process_death_while_ddl_blocked` PASS until after a fully
   reconciled migration95 rollback/retry, exact final migration ledger,
   and expected catalog. The earlier journal write before reconciliation
   is removed from the isolated copy.

## Material runtime compatibility blocker

`PGAPPNAME` is standard libpq connection behavior but **not source-proven**
to propagate through this repository's Prisma migration engine/driver.
`packages/database/scripts/database-connection-policy.mjs:91-103`
rejects all nonproduction `MIGRATION_DATABASE_URL` query parameters,
so a user-supplied `?application_name=` is **not** an approved fallback.
An application-name-less Prisma session must leave killed95 **GAP**.
Only a future separately Owner-authorized, live isolated PG/Prisma
verification that the exact child nonce reaches the blocking backend
can satisfy this condition. Do not replace the nonce with an arbitrary
count of lock waiters or weaken the condition to make the test pass.

`20261018009500_issue_300_option_b_task_relation_provenance/migration.sql`
lines 3-11 establish the actual held `tasks` / migration95 lock.
Source-only unit tests cannot attest true OS-process-to-DB connection
parentage, Windows SIGKILL semantics, actual lock durations, SQL lease,
or 93→96 recovery.

**Owner Fast-track B refinement:** Own-copy SQL lease watchdog now has
holder-only `quarantineBeforeSocketDestroy`: on lease revoke, it
immediately refuses future SQL but retains the lock socket until
independently verified STOP of the exact owned V3 PG container.
Failed STOP must not intentionally destroy the connection.
The killed95 positive path verifies the same held PostgreSQL session
still owns a granted `public.tasks` RowExclusiveLock under an active
signed lease, and rechecks no revocation/UNKNOWN before emitting PASS.
The suite includes five new lease-boundary negatives.

**Critical residual limitation:** External network drops, host process
death and Docker failure can release the held lock independently of
the source-controlled watcher; no source-only claim of guaranteed
quarantine safety is possible. Owner must independently fence the
resource and run authorized live interrupted migrations before PASS.
Uncorrelated/undrained/backend-unknown states remain QUARANTINE/GAP.

**Additional source-only lane:** A new disposable
`issue300_r2_w6_v3_fresh` DB is planned for real empty 0→96
Prisma+ledger+catalog proof. Own `--check` does not load live PG driver;
the actual `--run` still requires a valid installed `pg` package.

## W20 P1 — final Docker STOP before overall PASS

W20 independently observed the earlier runner could journal
`v3_overall PASS` while the owned PostgreSQL container was still
running, then report `STOP_UNCONFIRMED` afterward. The W16-only fix
removes the early PASS call. The new `v3-overall-stop-gate.mjs` requires
the exact fully verified owned container ID, successful stop if running,
fresh post-stop Docker inspect with `Running=false`,
`Status=exited`, `Pid=0`, and a sanitized stop-handoff journal record.
Immediately before an eligible overall PASS it independently inspects
the same owned container again, requiring it still be exited. Failed
STOP, wrong ID/ownership, stale/restarted container, unavailable inspect,
failed journal or missing earlier acceptance stages **never emit an
overall PASS**. The failure path records GAP and a nonzero exit.
This is source-only; none of the Docker assertions were tested against
a running engine or constitute live V3 acceptance.

## Lightweight offline verification

Run only the explicitly scoped offline test when machine resources permit:

```powershell
node --test tmp/issue300-w16-v3-killed95-guard/v3-killed95-witness.test.mjs
```

Negative mocks: unrelated lock and wrong migration95 statement,
pre-dead/signaled child, failed kill, missing or incorrect SIGKILL exit,
unobserved exit timeout, backend PID swap, duplicate backend matches,
missing Prisma backend tag, CLI dead but same PID/start backend alive,
detached nonce-tagged backend reconnected with different PID, corrupt
or unavailable PG observations, and failed/false quarantine stop
that must not release a held writer lock. Combined 31/31 offline Node
tests and standalone source-only `--check` PASS; synthetic successes
prove only mock logic, **not** V3 runtime acceptance.
