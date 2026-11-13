# Issue #416 — Worker 5 isolated L1/L2 implementation evidence

Status: **PARTIAL / ISOLATED OFFLINE CODE ONLY**. Not an admission implementation
in deployed SQL, not operator identity proof, not a production cutover. Source
baseline: `9b873610f00d5d520c9553d4a5185b9598e0fdb5` on the dedicated
`cos/issue416-impl-w5` branch; worker-5 owns only the new isolated
`apps/api/tools/issue416-{legacy,rehearsal}/` trees and this evidence file.

## Facts and binding decisions

Read `AGENTS.md`, Accepted DEC-023/024/025/029/072/075/076/078/079/080/081/088,
and current `issue-416-option-a-{authentication-provenance,writer-inventory,key-custody,locks,cutover}.md`.
L1/L2 are proposed admission/cutover policies under the Owner's **new
implementation authorization**, but no live operator, keys, SQL schema,
session change, production backup or deployment are proven. VAYLET does not
perform physical vehicle custody; no ValetSession, Task, Shift, Dispatch,
payment, entitlement, guest or key custody state is changed here.

The actual protected registry schema, migration, SQL privileges, parent
row-lock ordering, trusted operator command SQL and disposable PostgreSQL
project belong **only to Worker 2**. Worker 5 requested the ABI and exclusive
lease through Prime. This branch does **not** modify any Prisma/schema, SQL
migration, provisioner, runtime Auth/MFA service or existing application route.

## Authored boundaries and what they do

| File group | Verified capability | Critical limitation |
| --- | --- | --- |
| `issue416-legacy/typed-admission-key.mjs` | Canonical `0x01 + UUID16` keys for singletons; `0x02 + orgUUID16 + membershipUUID16 + locationUUID16` for composite Location grants; explicit kind/rank and lossless deterministic display. | Must be compared with W2 authoritative SQL `bytea` canonicalization. No DB lookup. |
| `issue416-legacy/selective-baseline.mjs` | Missing independently signed per-object case defaults to HOLD; exact material digest, generation, scope, duplicate/extra-case checking; digestible T0 **candidate** manifest; sorted pre-elected S/X lock intent and simulation of prepare/execute rechecks. | Cannot independently prove the supplied inventory is complete; cannot acquire SQL locks. Output status expressly does not authorize admission. |
| `issue416-legacy/verified-recovery-case.mjs` | Checks bounded case body, expected material/admission version, time window and two distinct Ed25519 synthetic-role signatures against a separately passed trust store. Tampering or missing signer fails. | This is a **synthetic fixture verifier only**, NOT a selected production operator authentication provider/root. The actual independent Company contact/roster, operator authorization, role/approver policy and trusted key distribution are EXTERNAL—NOT VERIFIED. |
| `issue416-legacy/controlled-transition.mjs` | Offline compare-and-swap transition plan with case reference, expected object material/version, mandatory monotone checkpoint intent and explicit required SQL/receipt/audit safeguards. | `executeControlledRecovery` refuses unconditionally. No online operator mutation or signed SQL writer is exposed. A caller-supplied `attested=true` remains *only a planning fixture*, not security evidence. |
| `issue416-legacy/older-backup-fence.mjs` | Stale, missing, mismatched, pending-deny and complete-looking older snapshots **all remain HOLD**; flags reconciliation candidates without reviving authority. | External independent monotone ledger and recovery-key escrow absent; no real database restore. |
| `issue416-rehearsal/disposable-pg17-preflight.mjs` | Pure shape guard for uniquely named `issue416_w5_*` target, PostgreSQL 17, different runtime/admin roles, dedicated labels/volume, localhost high port; explicitly excludes existing QA `45432` and default `5432`. | Supplied Docker/SQL JSON observations do **not** themselves attest reality. `refuseUnattestedPg17Run` refuses without verified exclusive lease. |
| `issue416-rehearsal/cutover-plan.mjs` + `plan-only.mjs` | Offline C0–C6 checklist and 12 gated readiness categories; JSON report always refuses any real cutover. | Never accesses Docker, DB, application, secrets, backups, workers or production. |

## Exact W2 contract required before integration

1. W2 confirms stable enum/typings for `(audience, object_kind,
   object_key_bytes)` and the special 49-byte grant key. The current
   model's source-verified symbolic kinds are `U/O/E/M/L/G/SS/RC/F/C/I/R/P`.
2. W2 owns the private gate and accepted-security-material registry schema,
   unique constraints, protected monotone `admission_version`, typed material
   digest/provenance/parent keys, and SQL-held missing-row fail-close behavior.
   A changed material version must have an atomic approved successor or fail.
3. W2/S1 implement true operation-scoped, independent operator authority. A
   `caseId`, `operatorRef`, JWT-like claim, unsigned case, synthetic key
   or SQL-visible password/session/MFA hash never grants a new ADMIT/credential.
   Human verification is an externally documented, accountable real ceremony.
4. U2 ranks 09–14: lock all domain parents first at each rank, then its private
   admission gates and accepted-material rows in `(object_kind, decoded UUID
   tuple)` order; **S unchanged, X pre-elected if updated**, all on same
   backend through prepare/sign/execute/COMMIT. HOLD COMMIT denies later
   prepared/signed commands, except prior commands actually committed before
   the HOLD barrier. W2/U2 must prove this in real two-connection PostgreSQL.
5. Independently durable outside-backup monotone deny intent is a **separate
   external operator design gate**; a DB column or self-asserted JSON
   `attested` field is not sufficient. No insecure distributed commit
   workaround, proof signer oracle or rollback resurrection is authorized.

## Dedicated PostgreSQL policy and test status

**Existing `vaylet-test-postgres`, `127.0.0.1:45432`, localhost default
`5432`, shared QA and all production connections are strictly prohibited.**
No generic `pnpm test:postgres` or repository harness was invoked: its
environment fallback/lease path might select and clean up existing databases
or roles. Before any future PG17 execution W2 must create and attest an
exclusive isolated Docker project/labels/container/volume, unique high
loopback port and DB, **separate disposable runtime and migration roles**,
checked real Docker identity and SQL server/user/database/owner. Sanitize
`DATABASE_URL`, `MIGRATION_DATABASE_URL`, `TEST_DATABASE_URL`,
environment defaults and all child process env values to the same disposable
target; a private preflight must run **before** any generic harness import,
including any potentially destructive lease cleanup. No such actual lease,
container, or SQL provenance was supplied to Worker 5.

| Check | Result |
| --- | --- |
| Native `node --test apps/api/tools/issue416-legacy/tests/*.test.mjs apps/api/tools/issue416-rehearsal/tests/*.test.mjs` | **29/29 PASS** (exit 0, synthetic offline only); no PostgreSQL or live operator evidence |
| `node apps/api/tools/issue416-rehearsal/plan-only.mjs` | **PASS** plan-only output; does not execute C0–C6 and prints `L2_EXECUTION_NOT_AUTHORIZED` |
| `node scripts/architecture-check.mjs` | **PASS** exit 0; existing grandfathered size warnings are unrelated to the authored files |
| Per-new-code-file `300`-line policy | **PASS** all new `.mjs` files at or below 300 physical lines |
| API ESLint/typecheck/build | **NOT RUN** — dependency installation absent in new worktree; standalone tools run under Node 24 |
| Actual PostgreSQL 17 migration / two-connection S/X race | **NOT RUN** |
| Real owner/Company contact verification or case recovery | **NOT RUN / NOT AVAILABLE** |
| Actual T0 admission import, Staff session/refresh/push revocation | **NOT RUN / PROHIBITED** |
| Old credential/provisioner denial / new provisioner twice-run | **NOT RUN** |
| Physical encrypted backup, older-snapshot restore, key escrow, RPO/RTO | **NOT RUN / EXTERNAL—NOT VERIFIED** |
| Production cutover, PR, merge, deploy, feature push | **NOT RUN / NOT AUTHORIZED** |

## Integration / release decision

This branch is independently reviewable **isolated supporting tooling**, not
proof that selective L1 and L2 are operational. Do not merge a live admission
or controlled operator recovery integration until W2 SQL/ABI and S1/U1/U2
signer/privilege/custody contracts are independently accepted, every real
identity/authority proof is verified, and an exclusive disposable PG17 proves
S/X admission races and safe restore. Unverified dependency means HOLD.
