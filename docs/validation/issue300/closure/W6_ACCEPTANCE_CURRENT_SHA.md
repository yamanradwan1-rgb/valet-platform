# Issue #300 — W6 current-SHA independent migration acceptance

## LATEST EXECUTED ACCEPTANCE — 2026-10-18, 19:26 UTC (supersedes earlier resource-only snapshot)

**PARTIAL REAL ACCEPTANCE: MIGRATIONS / ACTUAL ROLE / DB ROLLBACK PASS;
INTERRUPTION AND TWO-RUNNER GAPS remain.** The earlier preflight below was
written *before* the new Owner directive and the eventual safe bounded
execution. Do not read its "no W6 Docker" sentence or GAP table as current
final disposition; retain it only as an accurate historical snapshot.

**Last follow-up, resource lease released:** after four safe host RAM readings
(2011/1901/1835/1912 MiB free and more than 5.5 GiB committed-memory
reserve), Prime explicitly granted exclusive continuation and W6 restarted
**only its own** label/volume/port-verified PG57327. Fresh read-only
`psql` inspection of the aborted `issue300_r2_w6_acceptance_race`
fixture showed **12 migration ledger rows: 11 finished, one unfinished
`20260809001200_refund_foundation`, zero rollback-marked rows and zero
birth-xid columns**. This is an unresolved migration attempt, *not*
a clean 93 checkpoint; W6 quarantined it without a blind retry/resolve.
No concurrent runner or further mutation was attempted.

During this read-only follow-up, Prime integrated commits
`20cc7b9e` and `1f5e9b17b7f20ab3b0f9460713aa463db1cffb2b` into the
shared integration branch. W6 did not change HEAD. A read-only
`git diff a0a6fb1c..1f5e9b17 -- packages/database` was **empty**:
the underlying migration files were unchanged, but this is **not** a
complete assertion of overall current-candidate app acceptance. The
ignored W6 continuation harness refused to run when HEAD differed from
its pinned baseline.

An additional host safety sample then fell to **425 MiB free physical RAM**
(4.49 GiB commit reserve) while W6's PG was idle at about **44 MiB and
0% CPU**. W6 re-attested Docker custody and immediately stopped **only**
its own `issue300_r2_w6_acceptance_pg17`; free RAM recovered to about
713 MiB. The container is **stopped**, preserved own volume is intact,
and the **W6 exclusive heavy lease was explicitly released to Prime**.
No W7/W11, existing human PG57285, API3165 or Dashboard3114 process
was touched. Repeating heavyweight migration/concurrency processes on this
currently constrained host would violate the safety boundary; those
remaining tests require a newly attested safely isolated execution window.

- **Current candidate:** `a0a6fb1c032088be67437e93e8f4b5dbb9461a5a`,
  still the checked integration HEAD. No app, migration, proof-gate,
  tracked script, frozen worktree, production or shared resource was edited.
- **New actual W6-only Docker instance:** name
  `issue300_r2_w6_acceptance_pg17`, full immutable container ID
  `d828da592704d80dc20f7d2d503cba62a94b71f846586997fb7f093460597315`,
  label `com.vaylet.task=issue300-r2-w6-acceptance`,
  volume `issue300_r2_w6_acceptance_pgdata`, loopback
  **127.0.0.1:57327**, PostgreSQL **17.10** (server initialization logs),
  cap **384 MiB memory / 0.7 CPU**. Its bootstrap environment was explicitly
  forwarded from in-memory role/db/password values; Docker metadata
  *and actual authenticated migration-role SQL* matched, avoiding W7 P1000.
- **Real new DBs:** `issue300_r2_w6_acceptance_fresh`,
  `issue300_r2_w6_acceptance_upgrade`,
  `issue300_r2_w6_acceptance_race` and
  `issue300_r2_w6_acceptance_interrupt`. Only the first two completed
  acceptance. Migration login `issue300_r2_w6_acceptance_owner`;
  provisioned, separately authenticated ordinary login
  `issue300_r2_w6_acceptance_runtime`. All secrets generated in-memory;
  no passwords, DSNs or secret values logged.
- **Actual driver:** canonical unchanged Prisma
  `node packages/database/node_modules/prisma/build/index.js migrate deploy`,
  `NODE_ENV=test`, migration URL mapped to the **new W6-owned 57327** DB,
  plus exact copied original migration directories in an ignored staging
  fixture for each legacy prefix. Canonical unchanged
  `node packages/database/scripts/provision-runtime-role.mjs` was also
  actually executed. These invocations were by the task-local ignored
  `tmp/issue300-r2-w6-acceptance-owned/w6-acceptance.mjs`, not by
  the old proof scripts pinned to the human 57285 instance.

| Executed gate | Result and independently checked evidence |
| --- | --- |
| New independent PG identity | **PASS** Docker custody/label/volume/port + actual `current_user`, `current_database`, PostgreSQL 17.x |
| Fresh **0→96** | **PASS**, canonical Prisma **exit 0**, 15,740 ms; 96 ordered completed migration names and source-matching SHA256 checksums; six xid8 columns, 12 enabled birth triggers, six enabled immutable triggers |
| Populated 0→93 staging | **PASS**, canonical Prisma exit 0, one committed Audit, Session, Task and Incident source row present at 93 |
| **93→94** | **PASS**, canonical Prisma exit 0, 2,759 ms, 94 valid ledger checksums, five xid8 columns, ten birth triggers, zero Option B immutable triggers |
| **94→95** | **PASS**, exit 0, 2,552 ms, 95 valid ledger checksums, six xid8 columns, twelve birth triggers, four immutable triggers |
| **95→96** | **PASS**, exit 0, 3,028 ms, 96 valid ledger checksums, six xid8 columns, twelve birth triggers, six immutable triggers |
| Historical source preservation | **PASS**, 1 Audit + 1 Session + 1 Task + 1 Incident retained; **one NULL Task** and **one NULL Incident** birth marker still present after 96, no synthetic backfill. *No pre-45 legacy NULL Audit/Session cohort was exercised in this run.* |
| Canonical runtime provisioning + actual separate role login | **PASS**, provisioner exit 0, role `issue300_r2_w6_acceptance_runtime` actually logged in; no elevated role attributes, allowed Task UPDATE, forbidden Audit UPDATE, blocked DISABLE TRIGGER |
| Actual ordinary operational writer + rollback | **PASS** permitted Task/Session version UPDATE, Audit append, task XID spoof preserved, immutable Task association modification rejected, and transaction ROLLBACK restored Task and removed test Audit; only source-fixture records remain in disposable DB |
| Two runners + interruption | **GAP**, race fixture 0→93 attempt failed when W6 proactively stopped its own PG for RAM pressure. Two actual concurrent runners were **not executed**, and no controlled between-statement/COMMIT interruption or complete rollback sequence was performed. |
| Rollback compatibility with an older running app | **GAP**, database rollback-only transaction is proven; no older app runtime or HTTP rehearsal was claimed |

**Safety event:** During W6 execution free physical RAM fell to approximately
**561 MiB** (W6 PostgreSQL was only approximately 72 MiB resident, under its
384 MiB cap). W6 independently re-attested task label/volume and sent
`docker stop -t 1 issue300_r2_w6_acceptance_pg17` to **that container
only**. The runner reported `Race fixture setup to 93 failed` after the stop;
the race DB must have its actual migration ledger reconciled before any
retry. W6's previously successful fresh/upgrade/ACL checks were already
reported with successful exit codes and catalog/ledger assertions.
The W6 container remains **stopped with owned volume retained**. Existing
human PG57285, API3165, Dashboard3114, W7/W11/other instances and
sessions remained untouched. This is a limited **PARTIAL PASS**, not
an overall migration-acceptance clearance.

**Candidate:** `a0a6fb1c032088be67437e93e8f4b5dbb9461a5a` (clean
`codex/issue-300-final-closure-r2`, verified before execution).
**Scope:** independent **new** disposable PostgreSQL 17 migration, role and
rollback acceptance. No production, push, merge, service mutation or alteration
of the pre-existing R2 / G2 database is authorized.

## Safety preflight and actual disposition

**LIVE ACCEPTANCE BLOCKED BY RESOURCE SAFETY; not a migration failure and
not PASS.** On October 18 the read-only Windows measurements showed physical
RAM 15.93 GiB, available 1.37 GiB (independent performance counter 1,208 MiB),
commit used approximately 31.64 GB against 36.47 GB limit. Docker was already
running a *separate W7 acceptance PostgreSQL* instance at approximately 97.5%
of one CPU core. The Owner/Prime instructed W6 to avoid concurrent heavy work
when resources are insufficient. Starting yet another PostgreSQL and Prisma
migration processes at that point could disrupt W7 and existing human services.

**No W6 Docker instance/volume/database, role or port was created; no PostgreSQL
connection or mutation was performed in this new current-SHA run.** The shared
`issue300_r2_pg17`, `127.0.0.1:57285`, API3165 and human LM were left
untouched. The W7 instance was observed by read-only `docker stats --no-stream`
only. W6 told Prime that it would wait for a demonstrably safe isolated window
instead of silently competing for memory or claiming a false PASS.

## Actual offline evidence on this SHA

| Gate | Status | Observation |
| --- | --- | --- |
| Clean exact integration SHA | **PASS** | `git rev-parse HEAD` exact above; `git status` clean before W6 report |
| Existing script JavaScript syntax | **PASS** | `node --check` both W6 proof scripts exit 0 |
| Source migration inventory | **PASS (static)** | Repository 96 directories; `issue300-closure-migration-proof.mjs --check` exit 0 |
| Source runtime proof inventory | **PASS (static)** | `issue300-closure-runtime-role-proof.mjs --check` exit 0; this does *not* run a role login |
| Immutable source migration digests | **PASS (file hashes only)** | 45/94/95/96 SHA256 listed below; no applied ledger hash was read |
| Fresh 0→96 on new W6 target | **GAP** | New PG not started under memory/CPU contention |
| Populated 93→94→95→96 with legacy rows | **GAP** | Requires independent owned DB, committed 93 checkpoint and legacy fixtures |
| Bounded writer/DDL lock, migration interruptions | **GAP** | No actual lock, kill or mid-file test on this target |
| Two concurrent Prisma runners | **GAP** | No concurrent processes started; must use bounded timeouts and fresh ledger/catalog reconciliation |
| Actual new provisioned ordinary API role / ACL | **GAP** | No newly provisioned role or login on this SHA/target |
| Migration failure recovery and backward-compatible rollback | **GAP** | No new disposable DB or supported predecessor API under W6 control |

The SHA256 values of migration SQL files (NOT proof of applied checksums):

| Migration | SHA256 |
| --- | --- |
| 45 | `7a9f38316532d1f248043e43a54c76628937500d621b6b924096f65db87794cc` |
| 94 | `09e267382040c295c209f085718dd7ed010355501457c12258fcde96af3f74cf` |
| 95 | `b24775792febd2a89901c8c6fcfb41e6ea3c0e037423fc82d92584dc7294c432` |
| 96 | `fa67521424caa40606f18f40172998c59e3b8b59e983a32ba5dabfb77cb0f498` |

Migrations 94–96 each contain explicit `BEGIN`/`COMMIT` and bounded
`SET LOCAL lock_timeout='5s'`; migration 45 does not contain an explicit
top-level `BEGIN`/`COMMIT` pair. No real interruption or atomicity conclusion
is inferred from those source observations.

## Controlled acceptance recipe for a safe follow-up window

Only after Prime attests W7 load quiescence, adequate available RAM **and**
committed-memory reserve: create exactly one new PostgreSQL 17 disposable
Docker container, dedicated label/volume, bound to a *distinct* checked free
`127.0.0.1` port, with two newly created DBs independently named under
`issue300-r2-w6-acceptance-*` and a separately provisioned role under the
PostgreSQL-safe equivalent `issue300_r2_w6_acceptance_*`. Confirm
Docker ID, image/PG version, name, label, volume, listener, DB, migration user
and current integration SHA **before** any migration. Store generated
credentials only in protected task-local memory/temporary files and never
emit credentials, DSNs or PG environment into logs. The currently committed
W6 `--execute` scripts are explicitly hard-bound to the *old* 57285 test DB
and therefore **must not be run** against the new target. Reuse the unchanged
actual Prisma migration/provisioning entrypoints with W6-owned guarded
invocation; do not edit existing scripts or source to bypass those guards.

1. Fresh DB: verify empty catalog, run actual 0→96, compare ordered migration
   ledger names and SHA256, six xid8 defaults/twelve birth triggers/six
   immutable triggers. Verify no incomplete/rolled-back migration entries.
2. Upgrade DB: apply the original migrations 1–44 from a separate
   *disposable manifest copy* of exactly those files, insert committed
   pre-45 Audit/Session evidence if the schema permits it, apply 45–93
   unchanged, and add committed Task/Incident rows at migration 93 before
   upgrade. Record nonzero legacy NULL birth markers where applicable,
   hashes and row totals; apply exactly original 94, then 95, then 96,
   checking each committed prefix catalog, ledger and row preservation.
3. Within the exclusive isolated DB lease, create bounded held writers for
   94/95/96 ACCESS EXCLUSIVE locks, observe the blocked writer and DDL, and
   prove successful/failed outcomes without using a human/shared account.
   Simulate interruption before/within/after transaction COMMIT only on a
   replaceable disposable fixture; always reconnect and reconcile actual
   ledger/catalog before retry. Run two actual Prisma runners with limits and
   classify loser outcomes accurately instead of counting every conflict PASS.
4. Provision a unique ordinary database runtime role through the existing
   canonical script with separate credentials. Assert actual login,
   no elevated role flags/ownership, table and column privileges, denied
   DELETE/UPDATE/DDL/trigger/function bypass, allowed canonical Task/Session
   writes and DB-managed birth-marker immutability. Wrap fixture rows in
   rollback-only transactions.
5. Preserve migrations/triggers and all historical records while rehearsing
   disabled/compatible app rollback. Never drop or down-migrate the shared DB,
   touch API3165 or permit a failed/unknown migration to be `resolve`d by
   assumption. Retain a bounded, independently verified GAP if resources,
   credentials, interruption boundaries or app authority are unavailable.

**Historical W6 results are non-transferable:** a separate disposable
`issue300_r2` database on port 57285 previously passed 0→96 and actual
ordinary-role proof for a different SHA/environment. Those facts do *not*
constitute new independent acceptance for `a0a6fb1c`.

## Repeatable commands and mandatory preconditions (NOT EXECUTED)

Only proceed upon an **explicit new Prime lease** after W7 stops its heavy
work and available RAM is **at least 2 GiB**, with an adequate commit reserve.
No command below has been run in this acceptance attempt. Execute in one
private PowerShell process; do not log shell variables, passwords or URLs.
The Docker image SHA is the locally inspected PostgreSQL 17.10 image.

```powershell
$ErrorActionPreference = 'Stop'
$root = 'D:\kndoom\valet-platform\tmp\issue-300-final-closure-r2'
$sha = 'a0a6fb1c032088be67437e93e8f4b5dbb9461a5a'
if ((git -C $root rev-parse HEAD).Trim() -ne $sha) { throw 'Wrong source SHA' }
$os = Get-CimInstance Win32_OperatingSystem
if ($os.FreePhysicalMemory -lt 2097152) { throw 'RAM < 2 GiB: abort' }
$name='issue300-r2-w6-acceptance-pg17'
$vol='issue300-r2-w6-acceptance-pgdata'
$port=57327
$owner='issue300_r2_w6_acceptance_owner'
$api='issue300_r2_w6_acceptance_api'
$fresh='issue300-r2-w6-acceptance-fresh'
$upgrade='issue300-r2-w6-acceptance-upgrade'
if (docker ps -a --filter "name=^/$name$" --format '{{.Names}}') { throw 'Container exists' }
if (docker volume ls --filter "name=^$vol$" --format '{{.Name}}') { throw 'Volume exists' }
if (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue) { throw 'Port occupied' }
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$ownerPass = ([BitConverter]::ToString($bytes) -replace '-','').ToLower()
$rng.GetBytes($bytes)
$apiPass = ([BitConverter]::ToString($bytes) -replace '-','').ToLower()
$rng.Dispose()
$env:POSTGRES_USER=$owner
$env:POSTGRES_DB=$fresh
$env:POSTGRES_PASSWORD=$ownerPass
$image='sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193'
docker image inspect $image --format '{{.Id}}' | Out-Null
docker volume create --name $vol --label com.vaylet.task=issue300-r2-w6-acceptance | Out-Null
docker run -d --name $name --label com.vaylet.task=issue300-r2-w6-acceptance --label com.vaylet.worker=w6 --label "com.vaylet.sha=$sha" --mount "type=volume,source=$vol,target=/var/lib/postgresql/data" -p "127.0.0.1:$($port):5432" -e POSTGRES_USER -e POSTGRES_DB -e POSTGRES_PASSWORD --memory 384m $image | Out-Null
# WAIT for health, then RE-ATTEST ID/labels/volume/loopback AND actual PG17,
# owner/DB identity, *before* creating upgrade DB or running Prisma.
docker exec $name pg_isready -U $owner -d $fresh
docker exec $name psql -v ON_ERROR_STOP=1 -U $owner -d postgres -c "CREATE DATABASE `"$upgrade`" OWNER `"$owner`";" | Out-Null
$makeUrl = {
  param($db,$user,$pass)
  'postgresql://{0}:{1}@127.0.0.1:{2}/{3}' -f $user,([uri]::EscapeDataString($pass)),$port,$db
}
$env:NODE_ENV='test'
$env:MIGRATION_DATABASE_URL = (& $makeUrl $fresh $owner $ownerPass)
$env:DATABASE_URL = (& $makeUrl $fresh $api $apiPass)
Push-Location (Join-Path $root 'packages\database')
try {
  node .\node_modules\prisma\build\index.js migrate deploy
  if ($LASTEXITCODE -ne 0) { throw 'Prisma failed: do not blindly resume' }
  node .\scripts\provision-runtime-role.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Provision failed; reconcile DB/role' }
} finally { Pop-Location }
```

For the **93→94→95→96** path, construct a *new temporary folder outside all
Git worktrees* copying the unchanged `packages/database` package config,
`prisma.config.ts`, schema and source migration SQL directories 1–93 plus
`migration_lock.toml`, and provide a read-only junction to its existing
`node_modules`. Apply first 1–44, commit eligible pre-45 Audit/Session legacy
fixtures, then add original 45–93 to the staging copy, apply and commit
Task/Incident fixtures at 93. Set the two in-memory URLs to the **upgrade**
database using the same `makeUrl` helper. With `Push-Location $stage`, the
exact unchanged Prisma command for each staged prefix is:

```powershell
node .\node_modules\prisma\build\index.js migrate deploy
if ($LASTEXITCODE -ne 0) { throw 'Stop and reconcile ledger/catalog' }
```

Add migration 94, then 95, then 96 **one at a time to the temporary copy**
and repeat the above command, comparing hashes, committed ledger prefixes,
XID NULL preservation and table row counts at every boundary. Runner
interruption and concurrency require additional disposable resettable
fixtures with bounded `lock_timeout`, `statement_timeout`, measured locks and
fresh ledger/catalog reconciliation; they cannot be claimed from this
sequential recipe. Never kill, reset or rewrite an unrelated instance.

**Resource lease:** W6 has not acquired or mutated any heavy PostgreSQL
resource in this current-SHA attempt; there is therefore nothing to release
or clean up. Final acceptance remains **NOT READY** on the above GAPs.

## Follow-up owner directive: independent W7 P1000 forensic diagnosis

Later Owner instruction prioritizes diagnosing W7's stopped task-owned
PostgreSQL init before W6 creates another instance. The original resource
status and the live-acceptance GAPs above are historical measurements from
the preceding execution, not a waiver or an assertion that new tests ran.

**P1000 root established without retrieving or printing secret values.**
Read-only Docker inspection identified the stopped W7 container
`issue300_r2_w7_acceptance_pg17`, ID
`5fd9494bf6384fe86bd6ee6f4b0ac9de105d760f68b4d37c298031c5326d6a45`,
task label `issue300-r2-w7-acceptance`, its own volume
`issue300_r2_w7_acceptance_pgdata`, expected separate port 58385 (not
published after exit), and PostgreSQL 17.10 image. Compared the *values
in memory only* from W7's task-owned ignored
`tmp/issue300-r2-w7-acceptance-owned/pg-private.json` and Docker's
`Config.Env`:

| W7 property | Result |
| --- | --- |
| Private JSON user matches Prisma requested `issue300_r2_w7_owner` | **YES** |
| Private host is loopback; port equals 58385 | **YES** |
| Docker bootstrap `POSTGRES_USER` equals private requested user | **NO** |
| Docker bootstrap `POSTGRES_DB` equals private requested database | **NO** |
| Docker bootstrap `POSTGRES_PASSWORD` equals private secret | **YES** |
| Docker bootstrap user/database syntactically match safe lowercase SQL identifiers | **NO** |

The Docker entrypoint logs show a *new cluster initialization*, successful
`CREATE DATABASE` and `PostgreSQL init process complete`, then actual
`FATAL: role "issue300_r2_w7_owner" does not exist` at
**2026-10-18T18:54:37Z**, followed by `password authentication failed`
with **DETAIL: Role does not exist** at **18:55:03Z**. These specific
timestamps identify the original W7 role mismatch as the **P1000 cause**.
It is not evidence of a bad password for an *existing* role, unavailable
database port, or failed PG17 initialization. No W7 container, volume,
role or credential was altered or restarted during forensics.

**Safe recovery for Prime/W7 only, when that worker explicitly owns its
lease:** first confirm with W7 whether its disposable DB contains any
needed state; from a guarded W7-only credential setup either (a) connect
using the actual init/bootstrap owner and create the specified test
login/database (after verifying custody), or (b) recreate *only* the
W7-owned disposable container/volume using bootstrap user and database
from the **same** private task config as the Prisma URI. Attest actual
`SELECT current_user,current_database()` from loopback before Prisma.
Simply editing `POSTGRES_USER/DB` in an existing initialized container
does *not* retroactively recreate a login/database. No secret, DSN,
private-file payload or Docker password was included in this report.

**W6 next phase:** use an entirely different
`issue300-r2-w6-acceptance-*` container, volume and 127.0.0.1 port. No
reuse of W7's stopped instance and no activity on human R2 port 57285,
API3165 or Dashboard3114. Send a new owned lease to Prime and run bounded
serial PostgreSQL migrations with a 256–384 MiB Docker memory cap, restrained
connections/Prisma concurrency and verified host headroom. This is a
safe *candidate configuration*, not proof it already ran.
