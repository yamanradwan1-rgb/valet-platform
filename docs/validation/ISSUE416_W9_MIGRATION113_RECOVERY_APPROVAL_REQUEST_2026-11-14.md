# Issue #416 — W9 Migration 113 official recovery authorization packet

**Status:** PREPARED ONLY — NOT AUTHORIZED / NOT EXECUTED.

**Scope:** one previously denied, officially guarded Prisma failed-history bookkeeping action on the *original* isolated W9 PostgreSQL 17 fixture. This packet does **not** request SQL migration deployment, a new test container, a database reset, or any production/QA action.

## Fresh observable target (2026-11-14)

| Attribute | Attested value |
| --- | --- |
| Docker container | `vaylet-issue416-w9-pg17` |
| Container ID | `188f2f28df10bce811b38568f59e8482daa78f14f31f68cc1563346c7b2a758f` |
| Image ID | `sha256:ab20e934b27ba3ff927c1b4c9ff8cf6c32f315f743efe68dd3441182a87fb085` |
| Compose project | `vaylet-issue416-w9` |
| Labels | `vaylet.issue=416`, `vaylet.environment=isolated-test`, `vaylet.owner=worker-9` |
| Data volume | `vaylet-issue416-w9-pg17-data` |
| Network binding | `127.0.0.1:55416` only |
| Database | `issue416_w9_db` |
| Distinct synthetic roles | `issue416_w9_test`, `issue416_w9_migration`, `issue416_w9_runtime` |
| Database status | Original container healthy; existing parent and sanitized-child PG17 identity preflight PASS |

The original container had stopped after a Docker outage and was restarted *in place* after validating ID, image, labels, port and retained volume. No replacement database/container or volume mutation was used.

## Exact immutable failed-history facts (guarded read-only inspection)

| Migration | Row ID | DB checksum | State |
| --- | --- | --- | --- |
| 112 | `71081ef4-0946-4c65-90de-b14169c08007` | `4a5071b4f8d2fc6d2e5679a63f82353aee3876e17c9908b05da62d4504ca7df8` | SUCCESS |
| First 113 | `2b7ff130-f66b-4aed-9b02-7190b4365980` | `d938b237b846b7429bcaae980b6c1519a941852bdd57e719aa1ab3682fafddc9` | ROLLED BACK |
| Second 113 | `7b89a31b-782f-4c1c-9748-e7fd784428fb` | `746ce2403987eaadddebb816adea24c92b4ba9720a8da4ed007b890e0a1f8d36` | FAILED/UNFINISHED |

Original error: SQLSTATE `42501`, permission denied to change default privileges. The later `25P02` occurred inside the aborted transaction and is not the original failure. Currently there are no `auth_proof_private`/`auth_proof_crypto` schemas, private relations or proof-owner role memberships; fresh full `pg_default_acl` catalog contains 0 rows. No third migration attempt was observed. Existing Migration113 source raw SHA256 `55faf42491358f9273aff6b99b5c6a13d921c64a7ecc61f030c4703fdb5f8090` moves schema REVOKE and owner default-ACL alteration after `SET ROLE`, but its runtime correctness is **NOT VERIFIED**.

**Independent review and subsequent guarded source hardening:** COS worker-14 independently reviewed the original 262-line migration and the pre-hardening recovery adapter and advised DENY because source snapshots did not cover default ACLs or hard-pin the original Docker ID. Prime subsequently changed only the dormant recovery guard. It now requires the exact historical container+image+volume across snapshots, and enforces the original server-start epoch again inside a **purpose-specific Node pre-entrypoint** before Prisma CLI main code. The complete 114-row pre-repair migration history is pinned by ordered JSON SHA256 `3aa0fb1e76a5936f1e31784197c75073852df59a5706e2f8471fb10f0c89662c`; a separately guarded **read-only** W9 snapshot matched all 114 rows and this hash (no migration command). The full `pg_default_acl` catalog must be empty before and unchanged after. Recovery source-unit suite **60/60 PASS**, syntax checks and diff check PASS. Independent worker-17 recommended **YES for source-only hardening, NO for recovery execution**. It has never been run against Prisma.

**Residual operational boundary:** A separate Node --import child attestation narrows but cannot prove atomicity against an uncooperative external database restart/target replacement between child preflight and the Prisma CLI connection. The exclusive fixture lease binds cooperating test runners only, not every conceivable external actor. Therefore this packet remains a **DENIED, not owner-approved** request and does not claim that an irreversible committed bookkeeping mutation can be automatically undone.

## Precise action requiring separate Owner approval

Authorize **only after** the independent SQL reviewer and database owner approve this exact source SHA and confirm the following guard postconditions, and only if the execution environment safety policy explicitly permits it:

`node packages/database/issue416-private/run-resolve-113.mjs --resolve-113`

This repository-owned adapter, not arbitrary `prisma` CLI invocation, must use the W9-only three synthetic URL identities, attested Docker+PG context and exclusive fixture lease. The sole permitted bookkeeping mutation is setting `rolled_back_at` for the **second** already failed Migration113 history row `7b89a31b-782f-4c1c-9748-e7fd784428fb` through the official Prisma `migrate resolve --rolled-back` action. Preserve Migration112, the first rolled-back 113, every other migration row, roles, schema objects, audit and data unchanged.

### Preconditions

1. Re-run exact container/volume/image/loopback/three-role **parent and sanitized-child attestation** immediately before execution.
2. Repeat W9 `REPEATABLE READ READ ONLY` diagnosis: exactly the same three migration rows, checksums and states, no extra failed/partially applied migration, no unexpected role/schema/object/default-ACL change.
3. Confirm reviewed repo Migration113 source and guard fingerprints have not changed; obtain explicit independent SQL/source reviewer sign-off.
4. Confirm the original tool-level execution refusal has been explicitly lifted for this one guarded action. A new general Owner implementation instruction alone is not an override.
5. Reconfirm the test-only exclusive lease is unheld, not stale/foreign, and that no worker is concurrently executing Prisma/SQL migrations.

### Expected postconditions

- Only the previously unfinished Migration113 row becomes officially `rolled_back_at`-marked; all other recorded timestamps/checksums/history remain unchanged.
- No migration SQL, private function/role creation or production/QA mutation happens during this bookkeeping action.
- W9 guard checks both before and after, and refuses on any drift, unexpected checksum/row, lost lease, missing result or safety denial.
- Run a subsequent **separate** read-only diagnosis to verify the exact delta. Do not automatically deploy Migration113 afterward.

### Risks and recovery limits

- This is a historical Prisma bookkeeping mutation on a synthetic **disposable** test fixture; a mistaken target or wrong row would damage test evidence and make migration state unreliable.
- No independently tested snapshot/restore or immutable volume backup for this W9 instance has been attested in this continuation. Do not state that rollback is guaranteed.
- An official Prisma `migrate resolve --rolled-back` does not reverse DDL and does not validate a corrected migration. Independent forward-only SQL application requires its *own* authorization and tests.
- A fresh separate disposable PostgreSQL instance can test *fresh-install migrations* after its own approval, but it cannot replace the original failed-history repair, prove this instance's upgrade path, or preserve its exact audit history.

**Current decision: DENY.** This is an approval-ready request, not permission to run the command. Keep only this affected lane blocked; other isolated source work can proceed without it.
