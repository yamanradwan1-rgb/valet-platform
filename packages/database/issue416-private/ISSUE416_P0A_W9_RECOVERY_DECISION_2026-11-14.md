# Issue #416 P0-A — W9 isolated PG17 recovery decision record

**Decision:** `BLOCKED — NO DATABASE RECOVERY AUTHORIZED OR EXECUTED`.
**Evidence cutoff:** 2026-11-14, source-only and attested read-only inspection.
**Owner directive:** Inspect the existing isolated W9 fixture and Prime source.
Do not resolve, reapply, reset, clean, write SQL, invoke Prisma, or substitute a
different execution path. A source patch cannot clear a failed migration row.

## Exact provenance

| Item | Read-only observation |
| --- | --- |
| Repository | `yamanradwan1-rgb/valet-platform` |
| Prime worktree | `tmp/issue-416-recovery-prime`, clean, `cos/issue-416-recovery-prime` |
| Prime source HEAD | `b841fe566172f8f1eb64f111e73494df7ab2b2cf` |
| W9 worktree | `tmp/issue416-impl-w9`, clean before this document, `cos/issue416-impl-w9` |
| W9 source HEAD before this document | `d968019f97f672c8fb039c9770b393dc7ef7f9e9` |
| Docker container | `vaylet-issue416-w9-pg17`, running `postgres:17-alpine` |
| Docker ID | `188f2f28df10bce811b38568f59e8482daa78f14f31f68cc1563346c7b2a758f` |
| Fixture | `issue416_w9_db`, `127.0.0.1:55416`, dedicated W9 volume/network |
| PG17 attestation | Existing `diagnose-migration.mjs --read-only` passed its parent/sanitized-child Docker and three-role SQL identity gates |
| Distinct W9 logins | `issue416_w9_test`, `issue416_w9_migration`, `issue416_w9_runtime` (synthetic test-only) |
| Unrelated targets | QA `45432`, default `5432`, and any production DB NOT accessed |

### Source fingerprint and owner/default-ACL boundary

`packages/database/prisma/migrations/20261113011300_issue416_vap1_private_foundation/migration.sql`
at the **Prime HEAD above** is 262 physical lines. Raw on-disk SHA256:
`55faf42491358f9273aff6b99b5c6a13d921c64a7ecc61f030c4703fdb5f8090`;
SHA256 after CRLF-to-LF normalization:
`4978f3388b650211a6d588af0c67dcd46a0e31cc2bbecda2589338b44aafffba`.
The normalized digest matches the source guard pin in W9. Both fingerprints
describe the *current source*, not a successfully applied DB migration.

- Line 3 opens `BEGIN`; line 262 ends `COMMIT`.
- Lines 13–15 define `vap1_proof_owner` as `NOLOGIN NOINHERIT`, with no elevated
  login, database-create, role-create, replication, or Bypass RLS permissions.
- Lines 35–38 grant only the migrator `SET TRUE, INHERIT FALSE` membership in
  the private owner role. Line 42 creates `auth_proof_private` with that owner.
- Lines 45–48 prepare the `auth_proof_crypto` schema/pgcrypto and scoped usage.
  Lines 52–53 grant the proof owner narrowly scoped legacy FK REFERENCES.
- Line 55 performs `SET ROLE vap1_proof_owner`; line 56 then revokes PUBLIC
  schema privileges. Lines 59–60 alter *that owner's* default function EXECUTE
  privilege only after switching role. Lines 259–261 revoke private table/
  sequence privileges from PUBLIC and reset the session role.
- This is a **source-ordering correction**, not runtime verification of
  effective ACLs, default privileges, dependency resolution, or full SQL safety.

## Live W9 history (attested read-only SELECT)

All timestamps below are UTC and from `public._prisma_migrations`.

| Migration | Exact row UUID | Checksum SHA256 | State |
| --- | --- | --- | --- |
| `20261113011200_issue416_reserved_security_audit` | `71081ef4-0946-4c65-90de-b14169c08007` | `4a5071b4f8d2fc6d2e5679a63f82353aee3876e17c9908b05da62d4504ca7df8` | Started `2026-11-13 20:50:14.48293+00`; finished `20:50:14.500594+00`; `rolled_back_at=NULL`, 1 applied step |
| First `20261113011300_issue416_vap1_private_foundation` | `2b7ff130-f66b-4aed-9b02-7190b4365980` | `d938b237b846b7429bcaae980b6c1519a941852bdd57e719aa1ab3682fafddc9` | Started `20:50:14.506337+00`; `finished_at=NULL`; **rolled back at `21:09:34.483501+00`**, 0 steps; retained 42501 error log |
| Second `20261113011300_issue416_vap1_private_foundation` | `7b89a31b-782f-4c1c-9748-e7fd784428fb` | `746ce2403987eaadddebb816adea24c92b4ba9720a8da4ed007b890e0a1f8d36` | Started `21:09:49.969868+00`; **`finished_at=NULL`, `rolled_back_at=NULL`, `applied_steps_count=0`, `logs=''`** |

The latest 113 UUID above is the **unresolved** record. Two distinct 113
attempts are observed. There is **no evidence of a third attempt**; this is
not a claim that any third attempt was executed or passed. Historical 113
checksums differ because different source revisions were attempted; neither
equals a guarantee about the current fixed source.

## Original failures and observed effects

1. First 113: Prisma row contains SQLSTATE `42501`, `permission denied for
   schema auth_proof_private`. PostgreSQL Docker server logs confirm its
   error at `2026-11-13 20:50:14.529 UTC` (PID 1778). The older source
   had a private-schema `REVOKE` before `SET ROLE`.
2. Second 113: PostgreSQL server log confirms **first actual error** at
   `2026-11-13 21:09:50.204 UTC` (PID 4600): `permission denied to change
   default privileges` (`42501` owner context). The `25P02` message
   `current transaction is aborted` followed at `21:09:50.209 UTC` during
   Prisma's `UPDATE "_prisma_migrations" SET "logs" = $1 WHERE "id" = $2`.
   That secondary failure explains why the second Prisma `logs` column is
   empty; it is **not** the original SQL failure.
3. Read-only catalog result: `public` exists, owned by `pg_database_owner`;
   `public._prisma_migrations` exists, owned by `issue416_w9_migration`.
   `auth_proof_private` and `auth_proof_crypto` are **absent**, as is
   `vap1_proof_owner`. No private relations or proof-owner memberships were
   found. The test runtime role has no owner role; the migration role is
   `NOINHERIT`, `CREATEROLE`, nonsuperuser and cannot bypass RLS.
4. Since the proof owner is absent, its current role-specific default ACL
   cannot be in force. **No independent full `pg_default_acl` inventory or
   effective-grant test was executed**; absence of that owner must not be
   misconstrued as exhaustive privilege verification for the database.

## Recovery disposition and executable gate

**Current disposition: DENY.** The environment's safety checks already
blocked the second targeted recovery attempt; that action was not executed.
This record grants no permission to retry it, to alter migration bookkeeping
directly, to reset the fixture, to use a generic Prisma tool, to run a SQL
equivalent through another shell/client, or to have someone run a substitute.

Before any future *separately authorized and tool-permitted* action, the
responsible Owner, Prime and W2 must independently re-evaluate all of:

1. The latest explicit Owner authorization and actual tool safety permit the
   precise recovery action; a previous blocked operation stays blocked.
2. The dedicated Docker container, port, volume, DB owner, three isolated
   role identities, and parent+sanitized-child attestation remain unchanged.
3. Fresh read-only history matches the three exact row UUIDs/checksums above;
   the first 113 is already rolled back and **only the second** is unfinished;
   no third attempt or unknown/unresolved migration exists.
4. Fresh catalog still has no private owner, schemas, relations, memberships,
   or unexpected effects; any mismatch is an immediate STOP, not an automatic
   cleanup instruction. Preserve the immutable prior 112 result and both
   historical 113 rows, timestamps, checksums and diagnostic provenance.
5. W2 and independent SQL reviewers approve **the exact** pinned 113 source
   and its role/default-privilege semantics; new source SHA means fresh review.
6. An approved change must be limited to the explicitly identified unresolved
   synthetic W9 ledger entry and have an independently reviewable postcondition
   that no other migration history, objects, roles or grants changed. A failed
   precondition or safety-tool refusal means **STOP; no alternate mechanism**.

Even satisfying these predicates does **not** authorize a third SQL apply,
production/QA migration, password-reset implementation, merge or deployment.
Those need distinct authorization, actual PostgreSQL execution proof and
independent same-SHA security acceptance.

## Independently permissible checks in the current read-only phase

- Re-read exact Prime Git object/source SHA; compare historical decisions,
  SQL statements and fixture setup files; inspect worktree status and diff.
- Run only existing W9 `diagnose-migration.mjs --read-only` under the exact
  three synthetic URLs and its internal parent+child attestation; compare all
  observed ledger UUIDs and object counts without changing state.
- Review the existing isolated container's PostgreSQL error log without
  executing SQL; distinguish original `42501` from subsequent `25P02`.
- Validate Markdown and run pure source-only or mocked unit tests, syntax,
  static architecture checks and `git diff --check`. Such tests do not prove
  PG17 migration success or production readiness.

**Explicitly NOT RUN:** a second recovery, direct SQL repair, migration
reapply/third attempt, schema or role writes, disposable reset, alternate
client or operator workaround, DB privilege integration test, production
provisioning, PR, merge or deployment. This document is an evidence and
decision record only, not a successful recovery attestation.

**Evidence locations:** Prime migration113 source lines 3–60, 259–262;
Prime `docs/validation/ISSUE_416_IMPLEMENTATION_EXECUTION.md` lines 23–29,
59, 66, 70–83; W9 `target-contract.mjs`, `target-preflight.mjs`,
`read-only-diagnostics.mjs`, and the two read-only outputs above; existing
isolated W9 PostgreSQL Docker server logs at the exact timestamps quoted.
