# Issue #300 R2 W8 — U-004 Performance Acceptance, Exact Candidate

**Verdict: NOT QUALIFIED — RESOURCE GAP (safe preflight abort).** No U-004
performance acceptance PASS is claimed. This is a truthful preflight result,
not a failed benchmark, and cannot be used to waive any Owner-approved budget.

## Immutable candidate and ownership

- Exact checked-out clean `HEAD`:
  `a0a6fb1c032088be67437e93e8f4b5dbb9461a5a`.
- Host: Windows, local 2026-10-18, Asia/Amman (+03:00).
- Scope: **performance proof only**; no changes to application, migrations,
  data-access paths, query candidates or indexes.
- Requested **new** solely owned environment prefix:
  `issue300-r2-perf-acceptance` for Docker container, private volume, loopback
  port and isolated PostgreSQL 17 database. **NOT PROVISIONED**: the resource
  admission gate failed before any new container, volume, port or database
  was created. Thus there is no allocated W8 lease or cleanup target.
- Explicitly excluded from W8: existing
  `issue300_r2_pg17:127.0.0.1:57285`, API 3165, Dashboard 3114,
  W6/W7 databases, human LM, any existing container and shared services.
  No DB queries or authenticated HTTP against those targets were made.

## Source and approved budget verification

Source: `tmp/issue300-r2-owned/ISSUE_300_FINAL_CLOSURE_MASTER_PLAN.md`
§8.5 lines 311–335 and approved U-004; current
`scripts/issue300-closure-load-proof.mjs` at exact candidate.

| Proof item | Approved requirement | W8 actual |
| --- | --- | --- |
| Source cohort | Deterministic oracle and separately counted 100k **and** ≥1m mixed persisted source records with tenant/location/skew/noise | **GAP: 0 new W8 source rows; no fixture created** |
| Normal load | 5 readers + 2 real canonical-domain writer clients, 10 min, ≥1000 successful samples **per** Search/Timeline/detail endpoint | **NOT RUN** |
| Warm end-to-end HTTP p95 | Search ≤1500 ms; Timeline ≤750 ms; detail ≤400 ms | **NO DATA / NO PASS** |
| Cold qualification | 20 separately prepared cold trials **per endpoint**, with documented owned-cache resets; p95 ≤3000/1500/800 ms | **NOT RUN** |
| Writer impact | Actual writer-only baseline versus concurrent load; p95 increase ≤20% **and** ≤100 ms; zero unexpected deadlocks/lock timeouts/failed writes | **NOT RUN** |
| Stress | 25 readers + 8 real canonical-domain writer clients, 10 min, saturation/backpressure and errors | **NOT RUN** |
| SQL evidence | Exact final-candidate Search/Timeline/detail EXPLAIN ANALYZE FORMAT JSON, buffers, IO/spills, SQL role and plan hashes | **NOT RUN; no EXPLAIN JSON** |
| Bounded optimization | ≤2 correct query variants, ≤1 evidence-justified index trial | **0 variants and 0 index trials** |

The load-proof runner is hard-gated on a W7-authenticated HTTP bearer, origin,
operational writer attestation and explicit workload paths, and currently
requires `paths.database === "issue300_r2"`. It cannot be redirected unchanged
to a new `issue300-r2-perf-acceptance` resource without changing its
target contract. The earlier small SQL benchmarking entrypoint under
`apps/api/test/issue300-pg/issue300-query-performance.mjs` is similarly pinned
to `127.0.0.1:55480/issue300_g2`. Reusing either unchanged would conflict
with W8 isolation and the Owner's explicit ban on touching shared targets.
No such unsafe execution was attempted. A SQL-only synthetic seed does not
substitute for independently verified operational writers or HTTP responses.

## Resource admission observations (read-only)

| Observation | Measured value |
| --- | --- |
| CPU | AMD Ryzen 5 3600, 6 cores / 12 logical processors |
| Host visible RAM | 16,702,216 KiB, approximately 15.93 GiB |
| Free RAM — first | 424,992 KiB = **415.0 MiB** (2.54%) |
| Free RAM — second | **2,266.8 MiB** (13.90%) |
| Free RAM — third | **1,213.7 MiB** (7.44%), 2026-10-18 21:54:05 +03:00 |
| CPU load observations | **54%, 32%, 46%**; material shared-host activity |
| Docker engine | v29.5.3, 12 allocated CPUs, 8,286,519,296 bytes ≈7.72 GiB assigned |
| D: local disk available | 59,209,687,040 bytes ≈55.14 GiB |
| PostgreSQL of W8 | No W8 instance; minor version / PG settings **not measurable** |
| API/pool/Node profile | No isolated W8 build or processes started; **not measurable** |

Free RAM varied by more than **1.8 GiB** across short preflight reads and
approached **415 MiB**, while multiple shared services were already active.
Prime separately reported an independent W7 PostgreSQL worker near
**97.5% CPU** and confirmed W6 paused; that is coordination evidence of
ongoing contention, **not** a W8-owned independent CPU measurement.
Starting a second PG17, application servers, 100k–1m writers and 7–33
concurrent clients, or repeated cold restarts on this live shared host would
create material memory/CPU contention risk. The Owner explicitly directed
abort on contention and report a valid resource GAP. Consequently, W8
**aborted before provisioning**, rather than degrade human LM/W6/W7 or report
invalid measurements under paging pressure. No CPU/RAM/time cap was
violated because no workload started.

## Unmet gate and reproducible follow-up

The Owner must supply or approve a **separate, measured stable-capacity**
local worker with free RAM and disk headroom sufficient for DB, final candidate
API, legitimate operational writer clients and 25-reader stress. Then W8 can
create exclusively labelled/limited PG17 container, volume, database and
loopback port, positively attest custody **before mutations**, provision
93→96 via the approved frozen migrations, build exactly the candidate SHA,
obtain independent legitimate CA/LM MFA test authentication, seed **actual
counted** deterministic 100k then 1m mixed source rows and exercise actual
canonical writer commands. The load-script target/lease binding must be
configured for that isolated resource before execution; do not weaken checks
to point at another agent's DB. Record verified rollback/cleanup.

Require same-hardware writer-only baseline, >=10-minute normal and stress
phases with specified client mix and ≥1000 successful responses/endpoint,
20 separately reset cold trials/endpoint, retained full SQL JSON plans,
CPU/RAM/pool utilization, exact source counts/skew, raw HTTP latency data,
writer effects and outcome reconciling every budget. Stop on contention and
record the exact phase. If full requirements cannot complete, preserve **GAP**
without calling a reduced smoke test PASS.

## Lease and cleanup

No W8 Docker/PG resource was created, no volume/port was allocated, no
credentials were copied/logged, and no task data was inserted. Thus **no W8
database connections, jobs, processes or cleanup resources remain**. The
pre-existing human/shared/W6/W7 services were neither touched nor stopped.
Prime owns scheduling any fresh performance lease on an adequately isolated
host. Candidate readiness remains **NOT READY** for U-004.

## 2026-10-18 22:14–22:22 +03:00 — Owner follow-up: alternate-capacity discovery only

**Directive:** no permanent resource deferral. Find only **already authorized**
capacity without touching it, prepare a sequential single-heavy-lease replay,
and **do not start** a workload or new DB before Prime's separate explicit
exclusive lease. This section is a static/read-only discovery and execution
recipe, not load evidence. The checkout remains
`a0a6fb1c032088be67437e93e8f4b5dbb9461a5a`; rebind after any Prime
integration rather than reusing this SHA's attestation for a changed build.

### Fresh measured hardware / storage / runtime inventory

| Surface | Read-only command and measured evidence | Capacity conclusion |
| --- | --- | --- |
| Windows OS / CPU / RAM | `Get-CimInstance Win32_OperatingSystem,Win32_ComputerSystem,Win32_Processor`: Windows 10 Pro N build 19045; Ryzen 5 3600, 6 physical / 12 logical CPUs; physical/visible 15.93 GiB; 2026-10-18 22:14:35 local CPU 49%, free RAM **1710 MiB**, free virtual **4.61 GiB** | No reserved 6–8 GiB headroom; high transient contention |
| Recheck | Same CIM query: free **1794 MiB**, ~11% (later read); no test jobs started | Still insufficient stable headroom for 1m + 33 clients |
| Final recheck | Same read-only CIM query at **2026-10-18 22:21:09 +03:00**: **800 MiB** free (4.9%); no W8 job started | Fresh observation independently reinforces safe single-heavy-lease hold |
| System drive | `Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3'`: C: 203.4 GiB total, **3.0 GiB free** | Unsafe for an additional substantial Docker volume |
| Secondary drive | Same query: D: 953.9 GiB total, **56.2 GiB free** | Possible *owned* scratch/VM target **after** lease, size planning and owner approval; does not confer extra CPU/RAM |
| Docker | `docker info --format ...`: Engine **29.5.3**, overlayfs, 12 assigned CPUs, **8,286,519,296 bytes** (~7.72 GiB) assigned RAM, root `/var/lib/docker`; `docker context ls`: `default` and `desktop-linux` Windows named pipes for the local host | Two contexts are **not** two independent computers |
| Docker storage | Read-only search beneath `%LOCALAPPDATA%\Docker\wsl`: `docker_data.vhdx` **16.51 GiB on C:**; `ext4.vhdx` **0.10 GiB on C:**. `docker system df`: images 6.251 GB, volumes 5.036 GB, 47 total volumes | Default new PG volume would grow scarce C: virtual disk; do not prune, relocate or restart shared Docker |
| WSL | `wsl --list --verbose`: `docker-desktop` and `Ubuntu-24.04` both **Running**, WSL2 | Same hardware, already occupied; do not launch jobs or stop distros |
| VirtualBox | `VBoxManage --version`: **7.2.16r174877**. Read-only `list vms`, `list runningvms`, `showvminfo --machinereadable` | Four registered VMs, **none running**: two Windows VMs (4096 MiB/2 vCPU each), one named `server` (4096 MiB/2 vCPU, powered off), Kali (5058 MiB/4 vCPU, saved). All draw from **same host RAM/CPU**; do not boot or repurpose them without owner lease |
| Hyper-V | `Get-Command Get-VM` present; `Get-VM` returned no registered VMs | No pre-provisioned independent Hyper-V capacity found |
| SSH | `ssh.exe` available; only metadata read: user SSH config present with **one Host alias** and 6 known-host lines | A configured alias does **not** prove authorization, spare RAM/disk, or isolation. **No SSH connection or remote command attempted** |

**Discovery conclusion:** **No confirmed already-authorized independent spare
host.** VirtualBox/WSL/Docker are alternate runtimes, not extra physical
capacity; an SSH alias is only a possible follow-up requiring **specific
Owner/Prime permission and non-production classification**. The D: disk
could support a *new task-owned isolated VM disk* (not a shared Docker Desktop
reconfiguration), but only when other heavy workloads finish, human sessions
are unaffected and a fresh admission check confirms adequate RAM. Do not
borrow an existing VM, VPS, production host, paid cloud or W6/W7 resources.

### Storage / single-heavy-lease placement plan — estimates, not measurement

Before creating a DB, independently measure `pg_total_relation_size` by source
on a **newly owned** 100k sample, WAL growth, checkpoints, temporary disk,
autovacuum, index amplification and disk free space; extrapolate with a
conservative safety factor to 1m. In absence of a measured pilot, **reserve
40 GiB exclusively for the new W8 VM/PG+WAL+index/temp envelope and at least
10 GiB additional free headroom** (planning allowance, **not** a guaranteed
1m footprint). D:'s observed 56.2 GiB is only a tentative one-instance
candidate and requires repeat space checks; C:'s 3 GiB is disqualified for
Docker Desktop's current VHD. Never resize/move existing Docker VHD or delete
other people's images/volumes. Bound the new *owned* VM/PG to an agreed RAM,
CPU, disk, IOPS and connection-pool budget and abort on host contention.

Run **one heavy lane at a time**, only after Prime explicitly assigns a W8
exclusive lease and unique names/ports: (1) independently owned PG17 and
fresh 0→96 migrations, actual ordinary-role attestation and approved API
build at exact *new* SHA; (2) 100k mixed source fixture, actual source ID
oracle and writer-only latency baseline; (3) normal **2 real canonical
writers + 5 readers for ≥600s** and **≥1000 successful samples per Search,
Timeline, detail**; (4) independently reset cold cache **20 trials for each
endpoint**; (5) stress **8 real canonical writers + 25 readers for ≥600s**
with saturation metrics; (6) independently reseed/verify **at least 1m**
mixed source records (not 1m Sessions unless facts substantiate that),
repeat writer baseline, normal, 20-trial cold and stress; (7) retain full
EXPLAIN JSON/buffers/p95 and clean up **only** proven task-owned W8
containers, volumes, DB and processes after custody checks. No simultaneous
W6/W7/Prime heavyweight job, no parallel tier seeding and no borrowed human
LM database or browser session. No artificial workload downscaling counts
as U-004 compliance.

**Synthetic scale versus actual writers:** A reproducible 100k/1m seeder may
generate historical source rows in the owned DB as **synthetic fixtures**
(allowed by Master §8.5). Independently attest counts by
`audit_events`, `key_custody_events`, `dispatch_events`,
`incidents`, scoped tenant/Location/Session and skew (busy location,
reused slot, long timeline, equal timestamps, sparse/inactive actor,
foreign noise). For reproducibility, pin deterministic PRNG/IDs and keep a
source-fixture hash, query SHA and S0 snapshot. **Synthetic INSERT loops are
not the 2/8 actual domain writers.** Their separate worker clients must
call real check-in/key/parking/dispatch/incident/retrieval commands through
the protected API or exact domain services and verify effects, commits,
idempotency and failed-command counts independently.

### Existing writer and reader code: precise reuse boundaries

| Current entrypoint | Actual implementation | Isolation and missing step |
| --- | --- | --- |
| `apps/api/test/issue300-pg/issue300-operational-checkin-key-writer.mjs` | **Actual** HTTP intake, condition completion, check-in, slot A→B→C and Parking queue/assign/accept/confirm; asserts custody/Dispatch/Audit birth facts, optional retrieval-handoff extension | One-shot proof; line 14–19 refuses DB except `issue300_g2:55480` and API other than :3162/:3163; not yet safe for W8 |
| `apps/api/test/issue300-pg/issue300-operational-dispatch-writer.mjs` | **Actual** task assign/reassign via staff API, verifies persisted Dispatch; prerequisite membership/shift SQL only | One-shot G2-bound :55480 and :3162; no sustained 2/8-worker orchestration |
| `apps/api/test/issue300-pg/issue300-operational-incident-writer.mjs` | **Actual** protected Incident POST/idempotency, DB Incident+Audit verification | One-shot G2-bound; does not supply independent 10-minute writer baseline or concurrency |
| `apps/api/test/issue300-pg/issue300-u05-http-held-writers.mjs` | Two PG connections deliberately insert adversarial delayed source SQL to exercise S0/S1 | Explicitly **NOT actual domain writers**, G2-bound; do not count toward 2/8 |
| `scripts/issue300-closure-load-proof.mjs` | 5 or 25 actual HTTP reader clients for 600s; collects raw Search/Timeline/detail samples and verifies *separately supplied* writer, cold, plans and fixture evidence | Does **not** launch writers; hard-requires `database=issue300_r2`, existing W7 token/origin/manifest/lease. Must not point at forbidden DB or forge artifact inputs |
| `apps/api/test/issue300-pg/issue300-query-performance.mjs` | Small SQL witness benchmark with EXPLAIN | Hard-pins G2 DB port 55480 and lacks authenticated HTTP writers; no scale PASS |

**Instrument gap:** No verified already-existing script performs independently
attested **concurrent** 2/8 real canonical writer clients for ten minutes
under a **fresh W8-only** resource binding. After Prime's exclusive W8 lease,
review an *owned task-local harness* composing the above real domain command
flows with bounded per-client work queues, issued/committed/failed command
logs and source-ID reconciliation; obtain a reviewed isolated-target guard
for new DB+API+origin rather than silently removing G2/W7 pinning. HTTP
readers run in parallel with separate writer processes only within that
lease. Capture writer-only p95 for **each tier** then require simultaneous
writer p95 increase ≤20% **and** ≤100ms; no unexpected deadlock, lock
timeout or failed accepted command. Keep all data in the disposable target.

### Cold-cache truth requirements

A PostgreSQL process restart alone does **not** clear a shared host OS cache.
Twenty trials per endpoint/tier must each document verified independent
preparation of PostgreSQL buffer cache **and** guest OS page cache, while
avoiding host-global cache flush, shared daemon restarts or another tenant's
data. A dedicated W8-only VM with its own guest kernel/disk (if capacity
later allows) is preferable for honest cold evidence; an owned guest reset
may be considered **only with Prime's lease** and no shared guest workloads.
Log cache-reset method, checkpoint/boot identity, cache-hit/read counters,
trial times and reasons for exclusion; 20 nominally repeated warm HTTP
requests are **not** 20 cold trials.

### Commands actually executed (discovery only) and future execution boundary

```powershell
# Completed, READ ONLY, Windows PowerShell 5.1 — no app/DB requests:
git rev-parse HEAD
git status --short --branch
Get-CimInstance Win32_OperatingSystem
Get-CimInstance Win32_ComputerSystem
Get-CimInstance Win32_Processor
Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3'
docker info --format 'Engine={{.ServerVersion}} NCPU={{.NCPU}} MemoryBytes={{.MemTotal}} Root={{.DockerRootDir}}'
docker context ls
docker system df
docker ps --format '{{.Names}}|{{.Status}}'
wsl --list --verbose
& 'C:\Program Files\Oracle\VirtualBox\VBoxManage.exe' list vms
& 'C:\Program Files\Oracle\VirtualBox\VBoxManage.exe' list runningvms
& 'C:\Program Files\Oracle\VirtualBox\VBoxManage.exe' showvminfo 'server' --machinereadable
```

**NOT executed / Prime lease required:** creating a new W8 VM, Docker volume,
port, DB, schema, staff accounts, credentials, source fixtures or processes;
running canonical writers, HTTP reader clients, any cold restart, SSH
authentication, load/EXPLAIN. Before any future command, Prime must assign
unique W8 resources and an authorized capacity placement; revalidate SHA,
available host RAM, ≥50 GiB truly usable isolated storage and exclusive
lease, plus verify *no* conflicts with human/W6/W7 ports or workspaces.
The current result is **CAPACITY INVENTORY COMPLETE / LOAD WAITING LEASE /
U-004 GAP**, not permanent abandonment and not performance PASS.
