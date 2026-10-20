# W8 U-004 — Test-only portable load instrumentation (source review)

**Status: IMPLEMENTED / STATIC-VERIFIED ONLY.** This is not evidence of
100k/1m U-004 acceptance. There are no latency, writer-impact or cold-cache
measurements from this branch. No application, PostgreSQL schema/migration,
human account, current R2:57285, G2:55480, W6 or W7 DB is modified.

## W9 P1 follow-up — source-only fixes, still no U-004 PASS

W9 found that the original SQL planner supplied the wrong snapshot keys,
allowing a null cutoff/database snapshot and empty, falsely fast EXPLAIN.
W8 now captures the exact UTC microsecond cutoff and PG snapshot together;
it checks Search/Timeline fence parameter positions, positive EXPLAIN
root rows, the independent actual-role four-source fixture count, and
the independently attested Session/source/event IDs of SQL result rows.

The HTTP reader now requires an independently produced, detached
**Ed25519-signed source oracle** (Prime-pinned public-key fingerprint)
binding SHA, lease, DB, container, source hash, expected Search/Timeline/
Detail identities, and a recent independently attested API listener/
bundle/port record. It pins the exact three controller route shapes,
tenant, Location, query keys and IDs. HTTP200 with an empty or unrelated
Search/Timeline/Detail payload **cannot** produce a successful sample.

Additional W9 P1s: PG bind source path must match the **exact** manifest
PGDATA path (not just a D-drive substring); Incident writer checks
tenant/location/Session/actor, incident and Audit identity, immutable birth,
and HTTP idempotent replay; each slot writer verifies *new* source IDs, not
cumulative custody count. The cold verifier checks **60 unique, guest-origin
signed** boot certificates with an independently pinned issuer and the
correct guest VM/container/bundle identity; it refuses bare
`cacheResetVerified=true` flags. The reader waits for the live writer
envelope artifact after completing its 600-second measured phase instead
of failing early or claiming missing writer overlap.

**Only static/negative validation was executed.** No DB, service, external
session, load, signed live Oracle, actual writer or physical cold-reset
execution has been performed in this correction. U-004 is **GAP** pending
Prime's exclusive capacity lease and independent review.

## W9 re-audit — broad 100k/1m and skewed Key Slot acceptance

The formerly pinned single-Session Search is **not** accepted as U-004
Search performance. Four separately measured HTTP workloads are mandatory,
**per tier (100k and 1m), per 600-second 2W/5R and 8W/25R phase**:

- `search`: broad, no `sessionId`, no `keySlotId`, 100-item first page,
  independently signed actual Session + source/event ID within that page
- `busySlotSearch`: independently proven high-skew `keySlotId`, no
  `sessionId`, 100-item first page, independently signed
  `KEY_CUSTODY` event matched specifically as `KEY_SLOT`
- `timeline`: actual scoped Session timeline + source/event ID
- `detail`: exact event detail + independently signed source/event ID

The independently signed oracle must bind the **same UTC from/to window** to
both broad Search routes, an exact busy-slot ID, at least `tier/4` persisted
custody events and `tier/100` independently counted Sessions for that
slot. The runtime ordinary role independently recounts the deterministic
source rows and verifies actual distinct Sessions for the busy slot. Full
current-source SQL `EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON)` measures
**four** queries: broad Search with parameter `sessionId=NULL`,
slot-filtered broad Search with `sessionId=NULL`, Timeline and detail.
Every plan requires nonzero root rows, actual returned rows containing the
signed expected Session/source event and an exact plan/query SHA.

Each of the four HTTP workloads requires **≥1,000 independently checked
nonempty HTTP 200/no-store samples**, with p95 per workload:
`search<=1500 ms`, `busySlotSearch<=1500 ms`, `timeline<=750 ms`,
`detail<=400 ms`. Cold trials require **20 independently rebooted and
independently signed guest boots per workload** (80 total per tier), p95
limits `3000/3000/1500/800 ms`. A distinct independent timing witness must
sign the **entire** cold trial: reset receipt/timestamp, exact boot and API
process, workload path/source ID, response digest/status, observed elapsed
and start/finish clocks; boot signature alone cannot certify cold p95.
Missing trial signer or producer = **GAP**, never a substitute warm number.

The signed writer cohort must pin client IDs, protected commands, Session
IDs, balanced Incident/KeySlot command mix and roster SHA256 for **2W and
8W**. Baseline and loaded writer proof must match exactly in these
dimensions, independently log two persisted source IDs for every accepted
operation, maintain productive output by every client in every 30-second
interval, and avoid >20% throughput loss per command family. Relative and
absolute writer p95 gates remain in force.

The owned guest listener is now independently signed at least once every
30 seconds throughout the **full 600-second reader phase**, plus pre/post,
with fixed PID, startup time, compiled bundle SHA, port, container, lease,
tier and source fixture hash. Missing or stale checkpoints, process restart,
unexpected listener PID/compiled hash, or any alternate service fails.
This is **test-only source instrumentation**, not proof that an external
source-Oracle/guest-timing/continuity issuer has been provisioned. Those
signers must be independently reviewed/authorized; absent trusted actual
evidence the harness remains deliberately in U-004 **GAP**.

## Ownership and fail-closed envelope

- New independent D-drive worktree branch
  `codex/issue-300-r2-w8-load-portable` from exact baseline
  `a0a6fb1c032088be67437e93e8f4b5dbb9461a5a`.
- Dedicated test-only `issue300-r2-w7-acceptance-*` resource, owned
  `D:\kndoom\valet-platform\tmp\issue300-r2-w7-acceptance-*\data\`,
  unique PG/API/Dashboard loopback ports, exact Docker container ID and
  labels, PG **17.10**, known bundle SHA256, 96 completed migrations,
  dedicated guest VM and approved runtime/fixture roles.
- `issue300-w8-target.mjs` enforces test NODE_ENV, opt-in, exclusive
  unexpired W8 lease, Prime-approved capacity flag, clean committed source
  SHA, exact compiled API bundle bytes, Docker identity and D-drive bind,
  no legacy/shared ports. Missing evidence fails before connecting.
- Private DB URL and bearer/roster are **environment/file inputs only**;
  do not commit or print them. Only expected source statistics and timing
  metadata enter reports; original `tmp/` is gitignored.
- Base `scripts/issue300-closure-load-proof.mjs` is reused, with strict
  owned W7 DB/port/candidate/lease/bundle binding in place of legacy
  `issue300_r2:57285`. Existing default production/U05 guards are untouched.

## Entry points (all under 300 physical lines)

| File | Function / truthful evidence |
| --- | --- |
| `issue300-w8-target.mjs` | Rejects non-owned resource, stale lease, human ports, dirty SHA, wrong API build and container |
| `issue300-w8-fixture.mjs` | Deterministic PostgreSQL **synthetic-only** four-source history generator at exactly 100k or 1m; counted and tier-tagged |
| `issue300-w8-oracle.mjs` | Independent runtime-role READ-ONLY exact-source-ID count and born-XID verification at tier, with Session count |
| `issue300-w8-paths.mjs` | Scoped endpoint/fixture count → strict W7 load-path artifact, explicitly marked synthetic |
| `issue300-w8-writer-clients.mjs` | Distinct real staff API clients, supported Incident POST and key-slot assignment, persisted Incident/Audit or custody evidence; 2 or 8 actual client IDs |
| `issue300-w8-run.mjs` | One single heavy lease at a time: separately measured 600s writer-only baseline, then 630s real writers enveloping 600s genuine HTTP readers |
| `issue300-w8-cold.mjs` | **20 owned guest OS resets per endpoint**, distinct boot IDs and container identity, exactly one first post-boot HTTP GET; rejects PG-only restart and repeats |
| `issue300-w8-plans.mjs` | Three actual-runtime-role `EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON)` plans from current source SQL; statement/plan SHA256, IO/buffers/spills |
| `issue300-closure-load-proof.mjs` | W7 reused 600s/5 or 25 HTTP readers, ≥1,000 successes per endpoint, p95 budgets, real writer baseline ≤20% **and** ≤100ms increase, full cold/plan requirements |
| `issue300-w8-harness.test.mjs` | No-DB negative tests for target isolation, supported tiers, real writer roster and cold-boot evidence |

### Staging and replay contract

Only after Prime integrates the reviewed commit and explicitly grants an
**exclusive fresh W8 lease** with adequate stable capacity:

1. Build/test the **exact integrated candidate SHA**, generate an API bundle
   checksum, provision a new W7-labelled PostgreSQL 17.10 inside a genuinely
   W8-owned guest on D:, apply **fresh migrations 0→96**, check ordinary-role
   grants/trigger security and create an Owner-attested local-only resource
   manifest with `candidateSha`, `leaseId`, `lease` (owner, exclusive,
   issued/expires), `resource` (container ID/name, labels, D: bind and
   volume ID, ports, PG minor, role identities, bundle digest and VM UUID),
   `scope`, `fixtureSeed`, `targetTier`, `endpoints` and `planProbe`.
   Never point this harness at old W7:58385, human :57285/3114/3165 or G2.
2. Provision safe CA/LM assurance, test-only staff authorization, 2 or 8
   uniquely named writer credentials and independently created per-client
   Sessions/slots with actual canonical prior state. Private bearer and
   passwords remain in ignored D-drive files, never in the manifest/reports.
3. For **100k**: run `issue300-w8-fixture.mjs` once with
   `ISSUE300_W8_FIXTURE_ACK=SYNTHETIC_ONLY` and independent, limited fixture
   DB role. Require four source counts of **25,000** each and **1,000**
   deterministic Sessions, plus evidence-born XIDs. Keep all SQL-generated
   source history labelled synthetic; **do not** count it as domain writes.
   The ID oracle rechecks the actual rows at runtime.
4. Bind the source hash and independently authorized HTTP paths in the W8
   manifest. Generate `issue300-w8-paths.mjs` output. Run
   `issue300-w8-plans.mjs` under the ordinary runtime role and save unredacted
   JSON plans in task-private ignored local artifacts; do not paste sensitive
   SQL parameters or bearer into visible logs.
5. Run `issue300-w8-cold.mjs` **without concurrent writers**, after the
   approved guest's boot evidence writer is installed. Each endpoint requires
   20 distinct **guest OS** boot IDs, matching PG container identity, isolated
   boot timestamp and one first request, **not** 20 warm retries. Never
   flush global host caches or restart shared Docker/WSL.
6. Run `issue300-w8-run.mjs` in `baseline` with **two writer clients** for
   ≥600s, then `normal` with **two writer clients and five independent
   HTTP readers** for ≥600s. Require ≥1,000 HTTP200/no-store samples each
   for Search/Timeline/detail and zero writer failures/deadlocks/lock
   timeouts. Continue separately with eight-client writer-only baseline
   (set `ISSUE300_W8_BASELINE_WRITERS=8`) and `stress`: **eight real writer
   clients + 25 readers for 600s**. The runner overlaps actual writers,
   not background SQL fixture insertion.
7. Increase the same owned deterministic seed from 100k to **1,000,000**
   synthetic source rows, each source count now **250,000**, Sessions
   **10,000**; independently verify the count and reissue tier-bound
   artifacts. Repeat steps 4–6. Keep stage runs sequential, not overlapping
   the other agents' DB or human services.
8. For every tier and phase save: candidate SHA, data hash, PG identity,
   migration checksums/role evidence, real writer effects and p95 baseline/
   delta, raw HTTP samples, plan JSON, CPU/RAM/IO/pool waits, cold boot
   IDs and actual source counts/skew. Mark **GAP** if *any* required evidence
   is absent. Delete/release only the exact owned VM/PG/volume after verifying
   exclusive custody.

Warm HTTP p95 thresholds: Search **≤1,500ms**, Timeline **≤750ms**,
detail **≤400ms**. Cold p95 after independent reset: **≤3,000/1,500/800ms**.
Concurrent operational writer p95 must degrade **≤20% and ≤100ms** versus
the **same** tier/client-count writer-only baseline; zero unexpected
deadlocks/lock timeouts/failed commands. Stress is a capacity characterization
and never substitutes for normal acceptance.

### Important limits — independent review required

- A prepared external resource manifest is an attestation **input**, not
  proof of live lease authorization or capacity. Prime must issue one.
- Incident and key-slot endpoints are actual supported domain commands,
  but writer credentials/active shifts and permitted initial Session/slot
  fixtures still require W7-authenticated operational setup.
- The synthetic generator does not create one million real check-ins, nor
  does it attest foreign-noise/inactive-actor distribution without a separate
  independently audited skew fixture. Full U-004 mix/skew qualification
  therefore remains **GAP** until the live oracle demonstrates it.
- The detail SQL plan captures the same persisted timeline source lookup
  used by detail; separately measured HTTP detail includes any other read
  stages. The three SQL plans must **not** be portrayed as whole HTTP plans.
- Cold certification presupposes a guest-generated boot attestation tying
  the very same PG container to the same dedicated VM. An external Docker
  Desktop container plus an unrelated VM reset cannot pass as cold.
- No U-004 test run, seeded database, 600-second reader/writer period or
  20-reset series was executed as part of this code-only change. These
  require independent review and Prime's exclusive capacity lease.
