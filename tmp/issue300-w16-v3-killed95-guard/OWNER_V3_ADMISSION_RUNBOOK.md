# Owner-only V3 source-to-live acceptance handoff (W16 Lane B)

**2026-10-20: NOT AUTHORIZED / NOT RUN.** Docker Desktop engine is OFF.
This is a source-derived plan, not a signed lease, live test or resource
admission. Preserve human PG57285/API3165/Dashboard3114 and V2 PG58387.
Do not reboot Docker or start anything without new Owner authorization.

## 0 — Exact isolated sources (no mutation)

- **W16 own worktree**:
  `D:/kndoom/valet-platform/tmp/issue300-w16-ts-deps-isolated`,
  branch `codex/issue300-w16-ts-deps-isolated`.
- Source-only review folder: `tmp/issue300-w16-v3-killed95-guard`.
- Original canonical ignored source (untouched):
  `D:/kndoom/valet-platform/tmp/issue-300-final-closure-r2/tmp/issue300-r2-w6-v3-owned`.
- Exact immutable migration anchor:
  `84e9aafc341fda5848261c4d0c1202a4fe2091b6`.
  Source code `checkSourceBoundary` checks this ancestor, compares all
  `packages/database` files against it and HEAD, including migrations:
  45 `20260919004500_mgt_fix_02_pagination_snapshot_membership`,
  93 `20261015009300_outbound_post_result_phone_fence`,
  94 `20261018009400_issue_300_u05_birth_xid`,
  95 `20261018009500_issue_300_option_b_task_relation_provenance`,
  96 `20261018009600_issue_300_option_b_attribution_freeze`.
- On a quiet host, `node tmp/issue300-w16-v3-killed95-guard/v3-acceptance.mjs --check`
  checks source/migration SQL and concurrency negative oracles
  WITHOUT Docker, PostgreSQL or private keys; it is NOT runtime acceptance.
- Owner must review **exact clean post-commit W16 candidate SHA** and
  these source differences. No data from an older SHA may be reused.

## 1 — Real Owner-signed V3 lease (Owner action REQUIRED)

The consumer is `v3-acceptance.mjs:74-100` and expects ONLY:

`tmp/issue300-r2-v2-prime-owned/W6_V3_OWNER_LEASE.json`
and detached Base64 Ed25519 `W6_V3_OWNER_LEASE.json.sig`, over the
**exact raw JSON bytes**, verified with the immutable source-pinned
Owner SPKI (never source the private PEM from W16).

Exactly these JSON keys, with no extra keys:

| Key | Required value |
| --- | --- |
| `purpose` | `ISSUE300_R2_W6_V3_EXCLUSIVE_MIGRATION` |
| `owner` | literal `worker-6` (fixed legacy consumer expectation; review before issuing for W16) |
| `candidateSha` | exact CLEAN W16 HEAD at execution time |
| `sourceAnchor` | `84e9aafc341fda5848261c4d0c1202a4fe2091b6` |
| `dockerName` | `issue300_r2_w6_v3_pg17` |
| `containerLabel` | `issue300-r2-w6-v3-acceptance` |
| `volume` | `issue300_r2_w6_v3_pgdata` |
| `bind` | `127.0.0.1:58427` |
| `leaseId` | fresh `issue300-r2-w6-v3-...` |
| `issuedAt`, `expiresAt` | canonical UTC ISO-8601; not future/stale; validity >0 and <=5 minutes |

**No V3 Owner lease issuer compatible with these exact fields has been
verified in this isolated tree.** Do not reuse a W17 BUILD lease or
an ephemeral test key. An authorized Owner must prepare and independently
review the matching issuer and ACL/private-key custody, then issue the
real V3 lease. Rotation must use a **new**, later signed `leaseId`:
the runner refuses stale/same ID after phases exceeding 60s.
Lease cannot be extended by editing an unsigned timestamp.

## 2 — Four mandatory resource admission samples

Runner `admissionSamples` takes **four spaced measurements**, 2 seconds
apart, after verifying signed lease and migration SHA and BEFORE creating
a volume/container. EACH must satisfy:

- free physical RAM >= 1844 MiB;
- free virtual/commit headroom >= 3072 MiB;
- CPU load < 70%;
- free C: disk >= 2 GiB.

`noOtherHeavyOwner` rejects unknown concurrent running Docker containers.
Prime/W6 must verify exclusive worker ownership, engine status, exact
absence of pre-existing task name, volume and private credential file,
localhost port available, and the immutable PG 17.10 image digest.
The runner also rechecks signature, lease, source and resources at phase
gates and aborts on pressure. Do not bypass to make a target PASS.

## 3 — Exact isolated resource contract (runner creates ONLY after admission)

| Item | Value |
| --- | --- |
| Container | `issue300_r2_w6_v3_pg17` |
| Docker label | `com.vaylet.task=issue300-r2-w6-v3-acceptance` |
| Docker owner/anchor | `com.vaylet.owner=w6`, `com.vaylet.source-anchor=84e9aafc...` |
| PG port | loopback `127.0.0.1:58427:5432` |
| Volume | `issue300_r2_w6_v3_pgdata` |
| PG owner/runtime role | `issue300_r2_w6_v3_owner` / `issue300_r2_w6_v3_runtime` |
| Image | exact source-pinned `sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193` |
| Caps | 384 MiB RAM; 0.7 CPU; 512 MiB swap |
| Private files | ignored task-owned `pg-private-v3.json`, `pg-resource-v3.json` |

No human or V2 port/DB/volume/service may be restarted, reused,
altered, stopped or used for credentials.

## 4 — One explicit Owner-authorized future run sequence

Only AFTER conditions 0–3 hold and an independent source security review:

```powershell
# Safe source-only check; no live service and NOT an acceptance receipt.
node tmp/issue300-w16-v3-killed95-guard/v3-acceptance.mjs --check
# LIVE MUTATION — DO NOT EXECUTE until all Owner gates actually verify.
node tmp/issue300-w16-v3-killed95-guard/v3-acceptance.mjs --run
```

The run is gated by the source itself and MUST cover, in order:

1. Signed lease, exact source, four host samples, owned PG bootstrap,
   independent resource and ordinary-role identity checks.
2. **Fresh 0→96** on new `issue300_r2_w6_v3_fresh`, ledger 96 and
   expected six XID columns, twelve birth triggers, six immutable triggers.
3. **Populated historical upgrade** 0→93, actual six-source fixture;
   then 93→94→95→96 with checksum/readback, legacy NULL-XID and
   relational evidence integrity and immutable attribution rollback.
4. **Least privilege**: canonical runtime-role provisioning, actual
   nonprivileged login, restricted Evidence DML/TRUNCATE/function ACL,
   permitted Task/Session updates under rollback.
5. **Concurrent race**: separate DB 0→93, two genuine Prisma deploy
   children and matching advisory lock holder+contender, final 96 ledger.
6. **Failed 94 held-writer**: separate DB 0→93; lock/SQLSTATE 55P03,
   persisted failed ledger, explicit Prisma `resolve --rolled-back`,
   retry 96, exact rollback and ledger 97-count check.
7. **Killed 95**: fourth DB 0→94; held `public.tasks` writer;
   unique-tagged actual migration95 PG lock backend; real SIGKILL,
   two independent exact PID/start + nonce drain samples and held-lock
   lease/lock check BEFORE releasing lock; no partial 95 ledger/catalog;
   explicit failed-95 rollback declaration if needed, successful
   recovery to 96, final ledger/catalog reconciliation before PASS.
8. Only after all mandatory stages, immutable source/lease checks and
   absence of ANY GAP/UNKNOWN may a final `v3_overall PASS` be considered.

## 5 — STOP, UNKNOWN, QUARANTINE

- The held-writer's modified SQL watchdog refuses SQL on signed lease
  expiry/revocation. It attempts independently verified OWNED V3 PG stop
  BEFORE intentionally destroying holder socket; if stop fails, no
  voluntary socket destroy. This is NOT a proof against external
  networking failures or abrupt process death.
- No witnessed nonce, dead Prisma CLI but live backend, failed signal,
  missing independent backend read, expired lease, lost held lock,
  quarantine failure or pressure => GAP/UNKNOWN. Never count a
  nonzero CLI exit alone as killed95 evidence.
- Do not run retries/resolve after UNKNOWN until Owner establishes
  real-resource isolation, no active orphan backend, 93/94/95/96
  ledger state and DDL catalog independently. Never reset human PG.
- **CRITICAL limit:** A process crash or external network disconnect
  may release the held lock before any JS stop callback. Source cannot
  guarantee quarantine under such faults; require a separate Owner
  resource-level watchdog/fence for live acceptance.

Run results, if ever authorized, belong to the ignored W16 task-only
`V3_RAW_SANITIZED_EVIDENCE.jsonl`; never print credentials or claim
that this source-only handoff is execution evidence.
