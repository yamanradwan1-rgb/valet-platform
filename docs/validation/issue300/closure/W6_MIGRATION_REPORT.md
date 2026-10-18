# Issue #300 — R2 W6 migration, provisioning, rollback proof

**Result: PARTIAL / LIVE PROOF GAP.** This report describes checks of frozen
`ef5a0554fa20fe6ee6fcc0a4ceeffdc83d6e5687` in isolated branch
`codex/issue-300-r2-w6-migrations`. The Owner authorized local R2 execution
and UI-M1; no production, push, PR, merge, deployment or Issue closure.

## Environment and source attestation

Read the approved R2 `ISSUE_300_FINAL_CLOSURE_MASTER_PLAN.md` (revision
`R2 — OWNER-DECISIONS-2026-10-18`) and full Owner execution authorization
from the user's uploaded files, as the advertised local
`tmp/issue300-r2-owned` copy was absent. R2 §8.4, §8.8 W6, §10, the original
Issue #300 master plan, AGENTS, structure policy, DEC-034, migration and
provisioner sources determine this scope.

- Git baseline verified clean at the frozen SHA; W6 changes are exclusively two
  new scripts and this new report in its independent worktree.
- Existing `issue300_g2_pg17`: read-only `docker ps -a` showed **Exited
  (255)**, historically forwarding `127.0.0.1:55480→5432`. No restart,
  reconfiguration, volume action, database request or port operation was made.
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
   93+94+95+96 source inventory offline. `--execute` requires two *already
   provisioned, task-owned* PostgreSQL 17 databases: one entirely empty and
   one **populated** with exactly migrations 1–93 already committed. It uses
   the repository's actual Prisma runner and compares applied migration SHA256
   checksums, all six birth/default/trigger catalogs, six immutable identity
   triggers, preserved history and legacy NULLs. A held ROW EXCLUSIVE writer
   versus ACCESS EXCLUSIVE DDL timeout runs in a rollback-only transaction.
   An incomplete migration ledger causes immediate refusal without recovery.
2. `node scripts/issue300-closure-runtime-role-proof.mjs --check` validates
   its static entrypoint; `--execute` invokes the **real** existing runtime
   provisioner for both owned DBs. Its separate runtime connection checks
   login, privileged flags, object ownership, actual table permissions,
   trigger-function EXECUTE/PUBLIC revocation, disabled-trigger/DDL/DML/lock
   denial and a transactional fixture. Using the exact runtime role, it checks
   Task/Session operational updates, immutable identity failures and server
   replacement of a supplied Task birth XID. The fixture transaction ends in
   `ROLLBACK`: no operational test records remain.

Both default to **offline refusal/safe source checking**. The executing
contract requires `ISSUE300_W6_ENABLE=EXECUTE_OWNED_DISPOSABLE_ONLY`,
`ISSUE300_W6_LEASE_PATH`, and separate
`ISSUE300_W6_{FRESH,UPGRADE}_{MIGRATION,RUNTIME}_URL` values. Prime's
expiring JSON lease must bind its own exact SHA, full Docker container ID,
running container name, isolated issue300_w6 volume, loopback port excluding
5432/55480, two distinct issue300_w6 database names and runtime roles,
and immutable migration 45/94/95/96 SHA256 checksums. Each URL must match
that target exactly. No generic `DATABASE_URL` fallback is permitted.
Any absent/mismatched lease fails before opening PostgreSQL. Role provisioning
mutates cluster-wide role catalog, so role names must be uniquely task-owned.
Prime must attest ownership of **both** role names and the isolated cluster.

The scripted checks are necessarily narrower than R2 §8.4's complete matrix.
They do not intentionally simulate a partially applied migration by tampering
with Prisma's ledger, do not kill a live migrator and never treat a timeout as
evidence of an atomic cutover. Old migration scripts are never modified.

## Gate-by-gate disposition

| Gate | W6 state | Remaining decisive independent evidence |
|---|---|---|
| Static source 45/94/95/96 | **PASS (source only)** after local check | Verify exact migration SHA256 against provisioned DB history |
| Fresh 0→96 | **GAP** | Attested fresh exclusive target, real runner, catalog + ledger and fixture writers |
| Populated 93→96 + migration45 legacy | **GAP** | Populated 93 checkpoint and legacy NULL values, prefix 94/95/96 checks |
| R04 atomic cutover | **GAP** | Held committed/rolled-back writer before, during and after each DDL lock, catalog barriers |
| R05 interruption/unknown outcome | **GAP** | Two runners, controlled interruption at before/inside/after COMMIT, fresh catalog/ledger reconciliation |
| Actual ordinary role, immutability, marker spoof | **GAP** | Existing provisioner, actual runtime login and negative/positive SQL results |
| Allowed operational writers | **GAP** | Real canonical Task, Session, Incident, key/dispatch writers after migration |
| U-005 activation/rollback | **GAP** | Candidate-specific sanitized attestation, disabled/mismatched/expired gate refusal and 503, owned API rollback, no record deletion |
| T43/T65 | **GAP/PARTIAL** | Existing historical Option B SQL proof reusable only with its original SHA/DB; this final-candidate execution pending |

R2's U-005 default is **DISABLED** and the conservative indirect cohort HTTP
503 guard remains active. A schema or static script check does not authorize
loosening this guard. Prime/W7 independently own candidate-specific signed
HTTP cohorts, rollback transport checks and broad T01–T70 acceptance.

## Lease and recovery protocol

Prime first verifies disposable cluster ownership, PostgreSQL 17.10 or later
17.x, exact container/volume/port identity, exclusive heavy-resource lease,
two uniquely named DBs and role names, candidate build/SHA, controlled fixture
state and no co-running DDL. Prepare a fresh empty DB and separately preserve
a populated, committed migration-93 checkpoint. Record hashes and raw logs
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
