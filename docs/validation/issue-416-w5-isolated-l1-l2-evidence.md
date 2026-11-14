# Issue #416 — Worker 5 isolated L1/L2 implementation evidence

Status: **PARTIAL / ISOLATED OFFLINE CODE ONLY**. Not an admission implementation
in deployed SQL, not operator identity proof, not a production cutover. Source
baseline: `9b873610f00d5d520c9553d4a5185b9598e0fdb5` on the dedicated
`cos/issue416-impl-w5` branch; worker-5 owns only the new isolated
`apps/api/tools/issue416-{legacy,rehearsal}/` trees and this evidence file.
Follow-up review compared the pinned W5 source against Prime's
`b841fe566172f8f1eb64f111e73494df7ab2b2cf` contracts and W2's
isolated migration `20261113011300_issue416_vap1_private_foundation`.
These are **source snapshots**, not PG17/runtime acceptance.

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
| `issue416-legacy/typed-admission-key.mjs` | Canonical `0x01 + UUID16` keys for singletons; `0x02 + orgUUID16 + membershipUUID16 + locationUUID16` for composite Location grants; exactly the 13 SQL `object_kind` strings from migration 113; strict audience, rank and scope validation. | Static parity with W2 schema only, not real SQL `bytea` execution/locking. No DB lookup. |
| `issue416-legacy/selective-baseline.mjs` | Missing independently signed per-object case defaults to HOLD; exact material digest, generation, scope, duplicate/extra-case checking; digestible T0 **candidate** manifest; sorted pre-elected S/X lock intent, denial of empty/cross-audience/duplicate requirements and gate rechecks. | Cannot independently prove the supplied inventory is complete; cannot acquire SQL locks or issue SQL proofs. Output status expressly does not authorize admission. |
| `issue416-legacy/verified-recovery-case.mjs` | Checks domain-separated synthetic case signature bytes, bounded body, expected material/admission version, time window and two distinct Ed25519 synthetic-role signatures with different public-key fingerprints against a separately passed trust store. | This is a **synthetic fixture verifier only**, NOT a selected production operator authentication provider/root; different keys do not by themselves prove different humans. Actual independent Company contact/roster, operator authorization, role/approver policy and trusted key distribution are EXTERNAL—NOT VERIFIED. |
| `issue416-legacy/controlled-transition.mjs` | Offline compare-and-swap transition plan with case reference, expected object material/version, mandatory monotone checkpoint intent and explicit required SQL/receipt/audit safeguards. | `executeControlledRecovery` refuses unconditionally. No online operator mutation or signed SQL writer is exposed. A caller-supplied `attested=true` remains *only a planning fixture*, not security evidence. |
| `issue416-legacy/older-backup-fence.mjs` | Stale, missing, mismatched, pending-deny and complete-looking older snapshots **all remain HOLD**; 12 explicit monotone dimensions (codes, accepted TOTP, sessions/refresh, invitations/reset, roles/entitlements, keys, audit, anti-abuse and admission versions). | Caller-declared coverage and matching versions are not proof of an independent ledger; no ADMIT is ever returned and no real restore occurs. |
| `issue416-rehearsal/disposable-pg17-preflight.mjs` | Pure shape guard for uniquely named `issue416_w5_*` target, PostgreSQL 17, different runtime/admin roles, dedicated labels/volume, localhost high port; explicitly excludes existing QA `45432` and default `5432`. | `allowed` is now **always false**, including a shape match; supplied Docker/SQL JSON observations do **not** attest reality. `refuseUnattestedPg17Run` always refuses. |
| `issue416-rehearsal/writer-closure-contract.mjs` | No-DB model for **all 35** source families A01–A11, M01–M15, P01–P05, R01–R03, X01; explicitly separates signed writers from A10/A11/M07/R01 reads, M14/M15/P01/P02 controlled operators, M13/P05 bounded maintenance and P03/P04 nonproduction. Enumerates six MFA/reset audit event names and the generic CONTROLLED_OPERATOR exclusion. | No executable role privileges, function/overload ACLs, audit runtime denial or operator provenance attested. Even declared complete input returns `canDeclareProductionClosure=false`. |
| `issue416-rehearsal/cutover-plan.mjs` + `plan-only.mjs` | Offline C0–C6 checklist, 18 gated readiness categories, including old auditor SQL forgery, 35 writers, unsafe limiter COUNTED→IGNORED, external entitlement writers, old SQL overloads and P05/P03/P04 separation. | `L2_EXECUTION_NOT_AUTHORIZED` always; never accesses Docker, DB, application, secrets, backups, workers or production. |

## Source regressions found in follow-up (fixed in W5 only)

1. **MAJOR ABI drift:** the first W5 version used short `U/O/.../G` for
   the **SQL object-kind value**; W2 migration 113 explicitly requires
   `USER/ORGANIZATION/.../GRANT`. The new typed key rejects all legacy
   short aliases, invalid audience and cross-audience comparisons, and
   preserves the 17/49-byte key framing.
2. **Significant synthetic admission ambiguity:** an empty `requirements`
   array previously returned `allowed=true`; repeated gate IDs could
   silently replace a committed HOLD with an ADMIT in the input map. Both
   now fail closed. Empty lock dependency sets and duplicate requirements
   are rejected before any positive synthetic result.
3. **Safety-proof overstatement:** matching user-provided Docker/SQL JSON
   formerly returned `allowed=true` (labelled shape-only), which was easy
   to misinterpret as PG17 eligibility. It now **always returns false**
   for execution permission. Supplied older-backup `independentlyVerified`
   and per-dimension data can only mark a *synthetic version-match
   candidate*: all restored identities remain HOLD.
4. **Missing closure gates:** prior L2 plan did not list 35 writer families,
   audit-name forgery through `append_runtime_account_security_audit_event`,
   old EXECUTE overloads, limiter discount privilege, operator-only P02
   or P05/fixture retention as individually reviewable blockers. The
   no-DB manifest and negative tests now surface them; migration 112 and
   effective historical SQL privileges are unchanged by W5.

## Exact W2 contract required before integration

1. W2's current private foundation migration 113 supplies the exact
   `(audience, object_kind, object_key_bytes)` identity, with canonical
   object kinds `USER/ORGANIZATION/ENTITLEMENT/MEMBERSHIP/LOCATION/GRANT/
   SESSION/REFRESH/FACTOR/RECOVERY_SET/INVITATION/PASSWORD_RESET/
   PUSH_REGISTRATION` and a 49-byte grant key. W5's earlier symbolic
   `U/O/E/M/L/G/SS/RC/F/C/I/R/P` strings were **not SQL compatible**;
   corrected in this review. W2 still owns exact SQL writer/lock ABI.
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
| Native `node --test apps/api/tools/issue416-legacy/tests/*.test.mjs apps/api/tools/issue416-rehearsal/tests/*.test.mjs` | **46/46 PASS** (exit 0, deterministic no-DB fixtures); does not prove PostgreSQL locks or live operator evidence |
| `node apps/api/tools/issue416-rehearsal/plan-only.mjs` | **PASS** plan-only output; does not execute C0–C6 and prints `L2_EXECUTION_NOT_AUTHORIZED` |
| `node scripts/architecture-check.mjs` | **PASS** exit 0; existing grandfathered size warnings are unrelated to the authored files |
| Per-new-code-file `300`-line policy | **PASS** all new `.mjs` files at or below 300 physical lines |
| API ESLint/typecheck/build | **NOT RUN** — dependency installation absent in new worktree; standalone tools run under Node 24 |
| Actual PostgreSQL 17 migration / two-connection S/X race | **NOT RUN** |
| Real owner/Company contact verification or case recovery | **NOT RUN / NOT AVAILABLE** |
| Actual T0 admission import, Staff session/refresh/push revocation | **NOT RUN / PROHIBITED** |
| Old credential/provisioner denial / new provisioner twice-run | **NOT RUN** |
| Physical encrypted backup, older-snapshot restore, key escrow, RPO/RTO | **NOT RUN / EXTERNAL—NOT VERIFIED** |
| Source 35-writer/legacy-auditor effective SQL runtime denial | **NOT RUN** — tool only checks offline inventory/proposed evidence shape; old MFA audit-event forgery remains a source-level cutover blocker |
| Production cutover, PR, merge, deploy, feature push | **NOT RUN / NOT AUTHORIZED** |

## Integration / release decision

This branch is independently reviewable **isolated supporting tooling**, not
proof that selective L1 and L2 are operational. Do not merge a live admission
or controlled operator recovery integration until W2 SQL/ABI and S1/U1/U2
signer/privilege/custody contracts are independently accepted, every real
identity/authority proof is verified, and an exclusive disposable PG17 proves
S/X admission races and safe restore. Unverified dependency means HOLD.
