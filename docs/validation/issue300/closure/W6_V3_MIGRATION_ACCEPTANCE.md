# Issue #300 R2 — W6 isolated V3 PostgreSQL 17 acceptance

## Final source-only rework pending new independent reviewer

W9 additionally identified a **false concurrent-migration PASS**: an
earlier predicate accepted any second Prisma nonzero exit if the first
completed, while elapsed process overlap did not prove PostgreSQL
advisory-lock contention. The revised V3 harness arranges an actual
held-writer table lock on `incidents`, starts the first Prisma migrator
and independently observes its **granted** PG advisory lock; starts
the second and must observe a distinct backend PID waiting with an
**ungranted matching advisory lock** and `wait_event_type='Lock'`. It
releases the writer before the 5-second DDL lock timeout, requires
**both** CLI processes exit zero, and independently verifies the exact
96-row migration ledger/checksums and enabled catalog. The offline
test oracle rejects second-worker exit1/auth failure, exit-9/crash and
missing live lock proof; these unit checks do not themselves replace
the actual PostgreSQL run.

W9's second P1 was that a near-expired five-minute Owner lease might
allow an up-to-110-second child migration. The runner now requires
imminent phase budget **plus 15 seconds** of remaining signed lease
life, kills owned Prisma children on lease expiry, revalidates exact
SHA, owner signature and host resources at every major phase, and
accepts only a **new independently signed, monotonically later
lease ID** for extension. Phases actually lasting beyond 60 seconds
require this renewed lease before continuation. Any missed mandatory
gate exits nonzero and never reports overall PASS.

On the latest source-only validation, `node --check` and
`node .../v3-acceptance.mjs --check` both passed; the latter
executed three negative race-oracle checks. Integrated HEAD had
advanced to `f657bc7e1ec83cf8b273cebe614ed0ffa2e0cf68`, with
`packages/database` unchanged from anchored migration source
`84e9aafc`. **W9 did NOT clear the prior version**; Prime has been
asked to obtain a fresh independent W12/new-reviewer read-only
P0/P1 audit of the corrected version before issuing a signed lease.
**No V3 container, volume, DB, private credentials, migration run, or
test PASS occurred as of this paragraph.**

## Current evidence supplement — W9 P1 source fixes, still NO V3 DB

Independent W9 P1 review identified unsafe reliance on a single
`freemem()` sample, an unsigned/unchecked Prime lease, exit-zero on
partial tests, and incomplete historical source families. W6 revised
**only its ignored V3 test harness**. The new guarded path:

- Requires Owner-provided Ed25519-signed **exact raw JSON** at
  `tmp/issue300-r2-v2-prime-owned/W6_V3_OWNER_LEASE.json` and its
  Base64 detached `.sig`; verifies against the existing source-pinned
  Owner public SPKI without ever reading a private signing key. Enforces
  exact signed resource name/label/volume/port, SHA, worker, issuance
  and expiry no more than five minutes, and no symlinked input.
- Requires **four spaced measurements** each with >=1.8 GiB available
  physical RAM, CPU below 70%, at least 3 GiB commit reserve, and
  2 GiB disk space, with unknown concurrent Docker workers rejected.
  Source SHA/lease and resource metrics are rechecked before phases;
  child runner has bounded timeouts and pressure-abort checks.
- All mandatory migrations, simultaneous Prisma processes, true writer
  lock timeout/SQLSTATE, explicit failed-94 reconciliation + rollback
  and successful recovery, process-kill under observed DB lock, runtime
  login/ACL and rollback-only writes are required for overall PASS;
  any missing/failed gate exits nonzero. Only the own V3 container
  can be stopped by the harness.
- Populates **six independent historical source tables** by migration
  93: Audit, Session, Task, Incident, Key Custody (with valid KeySlot
  FK), and Dispatch (with matching Task/Session parent).
  Checks preservation of all six scoped source IDs and the four NULL
  legacy XIDs introduced by 94–95. Tests all four migration96
  supplemental attribution denials under owner rollback-only
  transactions; checks ordinary runtime TRUNCATE denial and restricted
  trigger function execution.
- Verifies staged migration SQL SHA256 and config/schema/runner-policy
  hashes against the immutable repository source. The offline
  `--check` mode remains read-only and **does not substitute for any
  actual PostgreSQL test**.

Latest source-only checks: `node --check` **PASS** and
`node .../v3-acceptance.mjs --check` **PASS**, 96/96 source files and
unchanged `packages/database` between anchor `84e9aafc` and
integrated HEAD `1515cb8ec78f4e287dccf8a88b24541f4fec22ad`.
**No signed Prime V3 lease had yet been issued; Docker instance/volume
and V3 credential files were absent at the check. All runtime acceptance
gates below remain GAP until the W9 re-audit and fresh safety gate pass.**

## Scope, source identity, safety status

Owner authorizes **migration acceptance exclusively**, not the shared human
PG at port 57285, API3165, Dashboard3114, W7 V2 at 58387, or any previous
W6/W7 instance. Current V3 migration-source anchor:
`84e9aafc341fda5848261c4d0c1202a4fe2091b6`. The R2 integrated HEAD
subsequently advanced to `89ed723455a0f105d21ff3f968e160eb0bce6737`
(docs-only); source comparison
`git diff 84e9aafc..89ed7234 -- packages/database`
returned **zero changed files**. No DB-result evidence can be transferred
from older W6 or W7/V2 databases to the new V3 fixture.

**Initial admission NOT GRANTED:** Windows RAM-free samples
500/542/528 MiB, CPU 90/83/82%, commit headroom 4.3 GiB, C: disk free
2.89 GiB. Prime explicitly declined a new heavy DB lease while memory was
approximately 549 MiB and mandated read-only preparation. A later sample
showed about 1.46 GiB free, still below the V3 harness's own 1.5 GiB
admission threshold. These observations do **not** demonstrate a safe
stable window. No V3 PostgreSQL creation, migration or role proof has
occurred yet. Do not count harness/source inspection as acceptance PASS.

## Unique V3 fixture reserved for an authorized future exclusive lease

| Field | W6-owned V3 only |
| --- | --- |
| Name | `issue300_r2_w6_v3_pg17` |
| Docker task label | `com.vaylet.task=issue300-r2-w6-v3-acceptance` |
| Exclusive volume | `issue300_r2_w6_v3_pgdata` |
| Exclusive port | `127.0.0.1:58427` |
| Owner migration role | `issue300_r2_w6_v3_owner` |
| Ordinary runtime role | `issue300_r2_w6_v3_runtime` |
| Upgrade fixture DB | `issue300_r2_w6_v3_upgrade` |
| Two-runner fixture DB | `issue300_r2_w6_v3_race` |
| Held-writer+recovery DB | `issue300_r2_w6_v3_interrupt` |
| Process-kill fixture DB | `issue300_r2_w6_v3_kill` |
| Resource cap | PostgreSQL 17.10, 384 MiB memory, 0.7 CPU |

No above name refers to V2 on port 58387, prior W6 on 57327 or the
shared human PG on 57285. V3 must be created once from a locally
verified immutable PG17.10 image only after the host RAM/CPU/disk
measurements and a **new explicit Prime exclusive heavy lease** allow it.

## Harness and acceptance matrix

Exclusive ignored task-only harness:
`tmp/issue300-r2-w6-v3-owned/v3-acceptance.mjs`. Execute from integration
worktree with `node tmp/issue300-r2-w6-v3-owned/v3-acceptance.mjs --run`
**only after** the new Prime handoff. It guards the exact new Docker
name/label/volume/caps/loopback and verifies SHA ancestry and byte-identical
`packages/database`. Docker init values are explicitly set to real
`POSTGRES_USER=...`, `POSTGRES_DB=...` and `POSTGRES_PASSWORD=...`, never
PowerShell hashtable interpolation. Credentials must remain in an
OS-restricted ignored task-only file, never in logs/report/chat.

| Owner V3 acceptance demand | Initial status |
| --- | --- |
| Independent PG17.10 identity/volume/loopback/owner before mutation | **GAP — no exclusive resource started** |
| Populated legacy 93→94→95→96 Prisma migrations, exact ledger checksums | **GAP — not run** |
| Audit/Session/Task/Incident source row survival, historical NULL Task/Incident XIDs | **GAP — not run** |
| Two real concurrent Prisma migrate deploy runners on 93 schema, final 96 checksums | **GAP — not run** |
| Held operational writer versus 94 ACCESS EXCLUSIVE lock, verified lock timeout/rollback | **GAP — not run** |
| Explicit failed 94 reconciliation, safe Prisma resolve --rolled-back, retry to 96 | **GAP — not run** |
| Real child process killed while waiting under 95 DDL writer lock; verify no partial DDL | **GAP — not run** |
| Canonical ordinary role provision, real login, no privileged flags/ownership/trigger function execute | **GAP — not run** |
| Allowed canonical Task/Session updates and denied evidence mutations + rollback | **GAP — not run** |

When actually executed, the runner writes one sanitized JSON object per
step to ignored `tmp/issue300-r2-w6-v3-owned/V3_RAW_SANITIZED_EVIDENCE.jsonl`
plus a private V3-only resource manifest and credentials file. A
failed/unknown migration state must be reconciled before a narrowly scoped
resolve and never blindly resumed. On memory pressure, kill only the task's
active Prisma child and stop only the label/volume-attested V3 container.
Preserve all shared human services, other worker private resources and
all applied migrations. The V3 heavy lease must be expressly released to
Prime once work finishes or is safely aborted.
