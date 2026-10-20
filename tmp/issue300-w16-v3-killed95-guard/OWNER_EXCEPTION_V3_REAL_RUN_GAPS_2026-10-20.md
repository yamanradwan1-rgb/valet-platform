# Issue #300 R2 — W16 Owner signing exception: authentic V3 evidence disposition

**2026-10-20 — BLOCKED/GAP, NOT A V3 LIVE PASS.**
Owner accepts missing Owner signing **as an administrative exception, not a
cryptographic verification**. Existing signed verification in
`v3-acceptance.mjs` and all product/runtime gates remain unchanged.
No signing engineering, real Owner PEM read, issuer execution, fake lease,
test key used for production, bypass, database mutation or Docker restart.

## Exact scope, reference and separately committed observations

- Task worktree: `D:/kndoom/valet-platform/tmp/issue300-w16-ts-deps-isolated`;
  branch `codex/issue300-w16-ts-deps-isolated`. Prior committed source HEAD
  `b3123b586895e1451dbe0a9fea3cb2ae25919cab`.
- Owned report: this Markdown plus
  `OWNER_EXCEPTION_V3_REAL_RUN_GAPS_2026-10-20.json` (unsigned,
  operator-observed source/host evidence, NOT an attested Owner runtime proof).
- Source anchor:
  `84e9aafc341fda5848261c4d0c1202a4fe2091b6`. Read-only
  `git diff --exit-code <anchor> HEAD -- packages/database` exited zero,
  protecting all 96 migrations, including #45, #94, #95, #96.
- Read-only `node tmp/issue300-w16-v3-killed95-guard/v3-acceptance.mjs --check`
  reported `mode=OFFLINE_ONLY`, 96 migrations, three race-negative oracles,
  immutable source SHA, and `mutatedDocker=false`.
- Five local mock-test suites finished **51/51 PASS**. These are
  **not PostgreSQL acceptance proof**.

## Safety admission: four actual independent read-only host observations

Host sample times UTC, spaced apart by approximately 3 seconds:

| UTC time | Free RAM MiB | Free commit MiB | CPU % | C: GiB | Admitted? |
| --- | ---: | ---: | ---: | ---: | --- |
| 01:23:41.6007 | 1652 | 12158 | 27 | 4.978 | **NO** |
| 01:23:44.8031 | 1723 | 12215 | 35 | 4.978 | **NO** |
| 01:23:47.9515 | 2047 | 12533 | 49 | 4.978 | Yes |
| 01:23:51.0617 | 1998 | 12525 | 21 | 4.981 | Yes |

Source `v3-acceptance.mjs:119–152` requires **four of four** safe:
RAM >=1844 MiB, commit >=3072 MiB, CPU <70%, C: >=2 GiB.
Only **two of four** passed. Therefore **resource admission REFUSED**;
improved later samples do not retroactively pass the first two.

## Additional independent blockers

1. In the **own W16 worktree** the Owner issuer folder
   `tmp/issue300-r2-v2-prime-owned` and its required Ed25519
   `W6_V3_OWNER_LEASE.json[.sig]` were absent. The isolated
   `tmp/issue300-r2-w6-v3-owned` resource/manifest/private credentials
   folder was also absent. No file was created as a substitute.
2. `com.docker.service` reported **Stopped**; no restart attempted.
   There were **eight existing `postgres`/`pg_ctl` host processes**:
   provenance not attested to W16; none were accessed or altered.
3. Windows PostgreSQL 17 binaries exist at
   `C:/Program Files/PostgreSQL/17/bin`, product version **17.11**.
   The W6 V3 Docker proof specifies pinned **17.10**; a new native
   17.11 cluster, even if later authorized, would be an **ordinary
   separate PG test**, never the exact W6 V3 attestation.
   Native cluster **not started** because host admission failed.
4. This own worktree does not have
   `packages/database/node_modules/prisma/build/index.js` or
   `packages/database/node_modules/pg`. Genuine Prisma `migrate deploy`
   is not presently executable from the isolated package.
5. `packages/database` defines normal
   `migrate:deploy` / `runtime:provision`, but both require a real,
   permitted, authenticated **disposable target**. `test:postgres`
   uses a harness whose default URL is
   `postgresql://valet:valet@127.0.0.1:5432/valet` when explicit
   ownership is not supplied, and could target a human service.
   **No command using that default was run.** The other available
   `verify-issue215-p5-local.mjs` owns a different Issue215 DB resource,
   not the approved Issue300 W6 V3 target.
6. `v3-acceptance.mjs:763–769` requires a genuinely signed Owner
   V3 lease and four safe samples **before** resource creation;
   `:153–172` revalidates on every phase. The Owner's accepted
   signing exception is explicitly **not** a cryptographic signature
   and **cannot** be used to sidestep these gates.

## Accurate requested lane results

| Lane | Real status | Reason |
| --- | --- | --- |
| Task-owned PostgreSQL start / identity | **BLOCKED/GAP** | Signed V3 lease absent; 2/4 host samples failed; engine off, no owned V3 resource |
| Fresh independent Prisma 0→96 | **BLOCKED/GAP — NOT RUN** | No safely admitted owned PG target or Prisma runtime |
| Populated historical 93→94→95→96 | **BLOCKED/GAP — NOT RUN** | Same; no live ledger or six-row survival evidence |
| Canonical ordinary runtime ACL / login | **BLOCKED/GAP — NOT RUN** | No actual isolated DB/authenticated ordinary role |
| Child-correlated killed95 / rollback | **BLOCKED/GAP — NOT RUN** | Requires signed guarded harness and actual tagged backend + holder drain proof |
| Heavy concurrent/performance campaign | **NOT RUN** | Excluded by Owner directive |
| Signed W6 V3 acceptance / overall | **NOT VERIFIED / NO PASS** | Administrative exception does not satisfy Ed25519 cryptographic verifier |

**Final safety disposition:** No PG/Docker cluster/resource, schema,
human/V2 service, private key, process, ACL or signing state was modified.
No actual database migration/ACL/killed95 acceptance claim exists.
The result is a reproducible **read-only admission refusal** with offline
source validation, separately recorded from any acceptance receipts.
