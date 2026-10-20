# Issue #300 — R2 W6 migration, provisioning, rollback proof

**Result: PARTIAL — actual fresh 0→96 and ordinary runtime role PASS; populated
upgrade/interruption GAP.** This report describes checks of frozen
`ef5a0554fa20fe6ee6fcc0a4ceeffdc83d6e5687` in isolated branch
`codex/issue-300-r2-w6-migrations`. The Owner authorized local R2 execution
and UI-M1; no production, push, PR, merge, deployment or Issue closure.

## Environment and source attestation

Read the approved R2 `ISSUE_300_FINAL_CLOSURE_MASTER_PLAN.md` (revision
`R2 — OWNER-DECISIONS-2026-10-18`) and full Owner execution authorization
from the user's uploaded files; the same verified R2/Owner documents are now
present in the worker's `tmp/issue300-r2-owned` folder. R2 §8.4, §8.8 W6, §10, the original
Issue #300 master plan, AGENTS, structure policy, DEC-034, migration and
provisioner sources determine this scope.

- Git baseline verified clean at the frozen SHA; W6 changes are exclusively two
  new scripts and this new report in its independent worktree.
- **Prime's newly attested NEW PG target:** `issue300_r2_pg17`, Docker ID
  `924db45e509560f642e28d2cdc5781f551e4785d7bb7102e9bcfb2797bfa028b`,
  label `com.vaylet.task=issue300-r2`, volume `issue300_r2_pgdata`,
  exclusive loopback `127.0.0.1:57285`, PostgreSQL **17.10**, database
  `issue300_r2`, owner login `issue300_r2_owner`. W6 attested its Docker
  identity again before *each* SQL proof. Existing `issue300_g2_pg17`
  remained exited/untouched. Neither shared port 5432 nor other processes,
  instances or volumes were touched.
- The directory contains **96** migrations. The frozen TypeScript
  `migration-manifest.ts` contains **93**, ending at migration 93; new
  migrations 94/95/96 are checked as explicit forward additions. This legacy
  manifest mismatch must not be confused with an applied database ledger.
- Existing migration 45 established Audit/Session birth XIDs. Migration 94
  adds Custody/Dispatch/Incident birth XIDs atomically; migration 95 Task
  birth plus source-parent immutable relationships; migration 96 supplementary
  Audit/Session attribution locks. Existing files remain byte-identical.
- Repository's actual provisioning command is
  `node packages/database/scripts/provision-runtime-role.mjs`, using a
  separate migration credential and ordinary `DATABASE_URL` account. It
  grants Task/Session SELECT+INSERT+UPDATE and Incident/Custody/Dispatch
  SELECT+INSERT, while Audit has SELECT and column-limited INSERT. Append-only
  evidence UPDATE must remain unavailable to the ordinary role.

## New independently runnable proof entrypoints

1. `node scripts/issue300-closure-migration-proof.mjs --check` verifies the
   93+94+95+96 source inventory offline. `--execute` first requires the
   exact new database to be genuinely **empty**, tests version/login and the
   reserved role's absence, and compares all 96 migration SQL bytes between
   the W6 frozen checkout and Prime's installed Prisma tooling worktree.
   It invokes the real Prisma migration runner and verifies **96/96** applied
   migration SHA256 checksums, all six `xid8` column/default/INSERT+UPDATE
   trigger catalogs and all six enabled Option B immutable identity/attribution
   triggers. Writer `ROW EXCLUSIVE` versus DDL `ACCESS EXCLUSIVE` returned
   the expected PostgreSQL `55P03` lock timeout. All checks actually ran.
   Populated 93→96, interruption and concurrent-runner tests are separate GAPs.
2. `node scripts/issue300-closure-runtime-role-proof.mjs --check` validates
   its static entrypoint; `--execute` invoked the **real** existing runtime
   provisioner on the now fully migrated named R2 DB with a reserved unique
   login `issue300_r2_w6_runtime`. Its separate runtime connection checks
   login, privileged flags, object ownership, actual table permissions,
   trigger-function EXECUTE/PUBLIC revocation, disabled-trigger/DDL/DML/lock
   denial and a transactional fixture. Using the exact runtime role, it checks
   Task/Session operational updates, immutable identity failures and server
   replacement of a supplied Task birth XID, explicit NULL Incident birth,
   allowed Audit append and seven denied immutable field rewrites. It passed
   all checks; the fixture transaction ended in `ROLLBACK`: **no test rows
   remain**.

Both default to **offline refusal/safe source checking**. The executing
contract requires `ISSUE300_W6_ENABLE=EXECUTE_OWNED_DISPOSABLE_ONLY`.
Following Prime's explicit W6 sole lease, the scripts read only the exact
Prime-owned `../issue-300-final-closure-r2/tmp/issue300-r2-owned/pg.env`
in process memory; its contents/URLs are never logged. They validate
Docker name, running state, **exact task label**, dedicated volume and
loopback 57285 plus `POSTGRES_DB/USER/PGHOST/PGPORT`, before any DB connection.
The actual runtime role is uniquely named `issue300_r2_w6_runtime`; its
separate local password is deterministically derived using HMAC-SHA256 keyed
by the secret `POSTGRES_PASSWORD`, message
`issue300-r2:actual-ordinary-runtime:v1`. Thus W4/Prime can reconstruct
the runtime connection privately from the same restricted `pg.env`
and the W6 helper, without logging or copying a password.

This exact R2 target replaces the first W6 draft's hypothetical two-database
lease convention. The original guard correctly refused generic/non-attested
targets but could not recognize Prime's *actual* new label/volume/DB and
single dedicated database. Only W6-owned scripts were adapted; no existing
migration or provisioner was edited. The fresh script deliberately refuses
re-execution now that migration history exists; do not rerun or reset it.

The scripted checks are necessarily narrower than R2 §8.4's complete matrix.
They do not intentionally simulate a partially applied migration by tampering
with Prisma's ledger, do not kill a live migrator and never treat a timeout as
evidence of an atomic cutover. Old migration scripts are never modified.

## Gate-by-gate disposition

| Gate | W6 state | Remaining decisive independent evidence |
|---|---|---|
| Static source 45/94/95/96 | **PASS (source+real ledger)** | Applied migration SHA256 and 96/96 completed |
| Fresh 0→96 | **PASS (real DB)** | Prisma deploy exit 0, PG17.10 real owner role, 96/96, 12 birth triggers, 6 immutability triggers |
| Populated 93→96 + migration45 legacy | **GAP** | Populated 93 checkpoint and legacy NULL values, prefix 94/95/96 checks |
| R04 atomic cutover | **PARTIAL** | Actual writer/DDL lock timeout `55P03` passes; activation-time held-INSERT and per-migration commit/rollback still GAP |
| R05 interruption/unknown outcome | **GAP** | Two runners, controlled interruption at before/inside/after COMMIT, fresh catalog/ledger reconciliation |
| Actual ordinary role, immutability, marker spoof | **PASS (focused actual role)** | Real provisioner/login, grants, 7 protected update denials, DDL/replica denial, Task/Session operations, birth spoof & NULL overwrite, Audit append |
| Allowed operational writers | **GAP** | Real canonical Task, Session, Incident, key/dispatch writers after migration |
| U-005 activation/rollback | **GAP** | Candidate-specific sanitized attestation, disabled/mismatched/expired gate refusal and 503, owned API rollback, no record deletion |
| T43/T65 | **PARTIAL** | Real fresh catalog and actual-role grants PASS; populated legacy cohort, interruption/concurrent cutover still GAP |

R2's U-005 default is **DISABLED** and the conservative indirect cohort HTTP
503 guard remains active. A schema or static script check does not authorize
loosening this guard. Prime/W7 independently own candidate-specific signed
HTTP cohorts, rollback transport checks and broad T01–T70 acceptance.

## Lease and recovery protocol

Prime already verified exclusive task ownership for this **single** named
R2 disposable cluster and granted W6 the sole lease. W6 completed both
actual proofs and releases the database resource to Prime for W4's next
lease. If a separate populated 93→96 upgrade is required, Prime must assign
a distinct owned fixture/target and fresh lease; this proven DB is now at
96 and must not be rolled back to 93. Record hashes and raw logs
only in sanitized local evidence. After any Prisma error/interrupt, freeze
further writes, connect through a separately attested fresh connection and
compare migration table, columns, functions, triggers/defaults/privileges
and locks; resolve no Prisma migration or partial state blindly. A completed
prefix remains immutable while the new feature stays disabled.

Rollback retains all additive migrations and evidence records, disables the
local proof gate, and exercises a reviewed compatible application build.
The real ordinary role must still run permitted operational writers; no
old history is dropped, rewritten, reattributed or backfilled. If proof
cannot be attested, final disposition remains **NOT READY — TECHNICAL
ACCEPTANCE INCOMPLETE**, not optimistic acceptance.
