# Issue #300 R2 — W19 independent W8 load guard and acceptance reconciliation

**Classification: SOURCE-ONLY PREPARATION / U-004 GAP / 79-row final acceptance GAP.**
No true 100k/1m runtime source-count, current SHA API, p95, 10-minute load,
signed outcome, PG EXPLAIN, or physical cold-start proof was produced in W19.
The source baseline is `0dc7d55e7b34cc598dddbce00a64babc0ff42e14`.
This work belongs to the isolated branch `codex/issue300-r2-w19-load-reconciliation`
and isolated worktree `tmp/issue300-r2-w19-load-reconciliation`. The source
ledger, shared safe-integration worktree and human services were not changed.

## Concrete false-PASS paths closed

| Path | Previously admitted | Current proof requirement |
| --- | --- | --- |
| Writer summary | Arbitrary `p95Ms` in mutable JSON, with aggregate p95 hiding a slow Incident or Key Slot command class | Recompute exact p95 from all raw commands. Enforce both ≤20% and ≤100 ms writer impact separately per command family and overall. Keep ≥80% actual command throughput per family. |
| Writer baseline replay (W22 P1) | A copied 630-second `live` result could also stand in for a `baseline`, making the writer-only impact ratio falsely equal to 1 | Require `baseline.mode=baseline`, `live.mode=normal/stress` consistent with 2/8 writers; strict nonoverlapping baseline end before live start; per-client monotonic real command timestamps; independent run artifact UUIDs and unique persisted source event IDs; distinct raw baseline/live SHA256. The Owner-signed phase seal binds both modes, phase IDs, both intervals and complete raw hashes. |
| Reader cohort | 1,000 successful total samples per endpoint could come from fewer than 5 or 25 actual readers | All declared readers must independently serve all four workloads, stay active throughout ≥600s, show no >45s disappearance and satisfy overall ≥1,000 samples per endpoint. |
| Raw result integrity | JSON report values for baseline/live writers, Search/Timeline/Detail readers, cold trials and SQL plans remained unsigned and could be modified after measurement | Require detached Ed25519 phase seal with all five exact raw SHA256 digests, fixed tier/SHA/lease/PG container/API bundle, independent Owner-pinned producer public-key digest, stage, measured phase boundaries and signed timestamp after completion. No seal = no `PASS`. |
| Exclusive lease | W8 checked lease expiry on startup, then might exceed it during a 600s load or 80 cold resets | Check signed W8 lease before writer commands, each HTTP read, each guest reset, after measurements, and require adequate time at orchestration entry. Expiry = abort/GAP; no automatic renewal or lease bypass. |
| Cross-SHA acceptance | Historical partial evidence could be implicitly mistaken for current result | `issue300-w19-reconcile.mjs <40-hex-candidate-sha>` verifies all exactly 79 distinct rows and produces 79 `GAP` records pinned to that candidate. It never promotes historical PASS/PARTIAL from an older SHA. |

The W8 signed resource manifest is **version 2**
(`PRIME_OWNER_SIGNED_W8_RESOURCE_V2`). Its fifth distinct Ed25519 producer
fingerprint is `phaseSealIssuerKeySha256`. This key must be independent of
source oracle, guest boot, cold timing and API process observer keys; its
SPKI SHA256 must occur in the **real pinned Owner-root-signed** W8 resource
manifest. A signer independently observing the completed raw files must create
the immutable phase-seal JSON and binary `.sig` under the exact task-owned
data directory. The verifier consumes:

```
ISSUE300_W8_PHASE_SEAL_KEY
ISSUE300_W8_PHASE_SEAL_JSON
ISSUE300_W8_PHASE_SEAL_SIG
```

The seal has `provenance=INDEPENDENT_OWNER_SIGNED_W8_PHASE_V1`, `candidateSha`,
`leaseId`, `targetTier`, `sourceFixtureHash`, `containerId`,
`apiBundleSha256`, `stage`, `readerStartedAt`, `readerFinishedAt`,
`writerStartedAt`, `writerFinishedAt`, `signedAt`, and an `artifactSha256`
object with exactly `baseline`, `live`, `readers`, `cold`, `plans` SHA256 hex
digests. The independent signer must actually inspect the complete raw
evidence and sign only valid exact-SHA outcomes; merely possessing a key or
signing a selected sample is not independent validation. Its key does not
exist yet. No source-only fixture creates a production trust root, an Owner
private key, or any real trusted performance signature.

The W22 replay correction additionally mandates the signed fields
`baselineMode`, `liveMode`, `baselineArtifactId`, `liveArtifactId`,
`baselineStartedAt`, `baselineFinishedAt`. The existing `writerStartedAt`
and `writerFinishedAt` describe the distinct concurrent writer phase.
An identical hash, artifact UUID, reused persisted source event or overlapping
interval is a hard failure even if a valid signature was supplied.

No acceptance may depend on detached signatures generated from the same
unsigned mutable claim by an unapproved producer. The verifier additionally
checks the immutable Owner-pinned issuer digest and streams each actual raw
file hash from an owned regular file, rejecting symlink/junction redirection,
hardlinks and byte/size replacement. The separate source oracle retains its
signed positive expected source/event IDs. Whole cold reset-to-HTTP signed
timing and independent API process checkpoints remain mandatory.

## Exact forward execution: no reduced targets

Owner and Prime must first enroll the real pinned Owner Ed25519 root and
approve the additional independent producer trust roots, allocate genuinely
exclusive and sufficient capacity, and issue a **valid signed W8 lease** with
the exact integrated Git HEAD and API build SHA256. One stage at a time, prove
normal and stress for each complete source tier:

| Requirement | 100k | 1m |
| --- | --- | --- |
| Persisted synthetic four-source cohort | 25k each source, 1k Sessions | 250k each source, 10k Sessions |
| Independent runtime role counts | all four families and complete time window | all four families and complete time window |
| Busy-slot skew | 25k custody events, 1k distinct Sessions | 250k custody events, 10k distinct Sessions |
| Broad Search and busy-slot Search | no `sessionId`; independent expected source/event IDs | same full broad workload |
| Long Timeline and exact Detail | signed expected source/event IDs | same with deep Timeline pagination checked independently |
| Writer-only baseline | 2-client and 8-client actual domain-command cohorts, ≥600s each | fresh 2-client and 8-client baseline, ≥600s each |
| Normal load | **2 real writers + 5 active readers**, ≥600s; ≥1,000 success samples per endpoint | repeat in full |
| Stress | **8 real writers + 25 active readers**, ≥600s | repeat in full |
| Cold | 20 distinct guest OS boots **per each of 4 endpoints** (80 signed trials) | additional 80 signed trials |
| SQL plans | four actual-runtime-role source-derived full EXPLAIN ANALYZE JSON plans, nonempty witnesses | remeasure for 1m |
| Warm p95 budgets | broad/slot ≤1500ms; Timeline ≤750ms; Detail ≤400ms | same |
| Full cold p95 budgets | broad/slot ≤3000ms; Timeline ≤1500ms; Detail ≤800ms | same |
| Writer p95 and throughput | both p95 ≤20% relative AND ≤100ms absolute delta; no failed/locked commands, ≥80% throughput per command family | same |

The deterministic fixture records are **synthetic history only**, never
canonical writer evidence. Real writer clients use protected operational
HTTP commands, independently read back committed source IDs and idempotency,
and must overlap the live HTTP reader phase. The signed phase seal is issued
after completion and binds the exact five raw files. A separate Owner-signed
stage authorization is needed if any previous signed lease expires.

### Resource admission — no active authorization on this host

Prime's 2026-10-20 read-only inventory: physical RAM **15.9 GiB**, transient
free RAM **4.3 GiB**, CPU **21%**, D: **52.1 GiB free**, C: **5 GiB free**;
Docker Desktop Linux engine **stopped**. The old Docker memory quota was
**8,286,519,296 bytes = 7.72 GiB**, and its VHD resides on the space-limited
C: drive. Recheck those values rather than treating an old quota as current.
No task-owned 1m PG data or independently signed disk/heap/index/WAL sizes
exist, so an empirically exact minimum hardware figure cannot be derived.

The existing W8 capacity design reserves **40 GiB owned VM/PG/WAL/index/temp
+ 10 GiB untouched headroom = 50 GiB**, explicitly an estimate. D: has
only **2.1 GiB above that preliminary reservation** before artifacts,
builds, 160 cold trials and other overhead. Free RAM **4.3 GiB** cannot
guarantee an isolated PostgreSQL + guest OS + exact-SHA API + 33 concurrent
clients without harming shared services. Practical *admission planning*
target: **8 dedicated vCPUs, 32 GiB physical RAM with ≥16 GiB stable free,
≥100 GiB truly free dedicated SSD space**. This is an engineering safety
target, **not** a measured minimum or permission to use an unapproved host.

Require four spaced read-only admission samples for free host RAM, CPU,
disk, guest quota and current ownership before any heavy lease. The approved
single-heavy-lane rule remains binding. If capacity becomes viable, start
with a privately owned 100k cohort, measure `pg_total_relation_size`, WAL,
index amplification, guest image and cold snapshot storage, then calculate
the 1m upper bound with headroom before opening a second tier. Neither local
VMs/WSL/Docker contexts nor an SSH alias establish independent spare
hardware or permission to run. No database, Docker, service, build, HTTP,
or cold-reset work was performed by W19.

## T01–T70 / U05-R01–R09 current-candidate framework

Read-only command after a reviewed commit:

```
node scripts/issue300-w19-reconcile.mjs <exact-40-char-Git-SHA>
```

It parses all nine `U05-R01`…`U05-R09` and all seventy `T01`…`T70` rows from
`R2_ACCEPTANCE_TRACKER.md`. The output contains one row per criterion,
`sourceLedgerSha256`, exact requested `candidateSha`, category, and its
original source-line SHA256. It strictly returns **79 GAP / 0 full PASS**, with
U05-R09/T62/T63/T64 tagged `W8_SIGNED_REAL_LOAD`. Source-only tests,
historical successes, and synthetic data never certify the current SHA.

Real per-row promotion later requires new independent authenticated proof,
matching integrated SHA, signed runtime/actual writer/HTTP/DB/Browser artifacts
for that individual criterion, a separate reviewer, and an explicit Owner
decision. The GAP emitter has no command-line mechanism to self-certify PASS.
In particular, a W8 U-004 performance result alone is insufficient to mark
all 79 rows PASS or close Issue #300.
