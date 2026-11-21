# Issue 416 — Prime PG17 acceptance preflight hardening (source candidate)

**Status:** UNCOMMITTED PRIME WORKTREE; no independent final source approval,
no W38 restricted-migrator fixture available, and **0/210** actual protected
business-domain concurrency trials. No runtime cutover or production acceptance.

## Source baseline and implementation

- Prime base SHA: `220356707f32a76296f4c6de5268a0b1c5523d5c`.
- Draft PR #464 remote head remains that SHA, Draft and open (verified through
  GitHub API November 15, 2026). This working source has **not** been pushed.
- Source ledger requires exactly 140 committed official Prisma migration names
  and checksums; 29 Issue416 migrations are independently pinned, other
  migration contents must match their Git HEAD blobs (LF or CRLF canonical
  entire-file variants only, reject lone CR and mixed endings).
- Private catalog: exactly 16 ordinary tables, 61 regprocedure signatures of
  kind `f`, exact 61 final `pg_get_functiondef` bodies, ownership by
  `vap1_proof_owner`, exact 50 private indexes and 142 constraints with frozen
  names/definitions/uniqueness/validity, 32 private trigger definitions, and
  exactly 2 noninternal public `account_security_audit_events` A01 integrity
  triggers (including rejection of additional unrelated trigger names). All
  23 private FKs require their actual 92 enabled PostgreSQL internal RI
  triggers, including 14 on referenced `public` tables, so a disabled FK
  guard cannot falsely pass by preserving a constraint definition.
- Actual `pgcrypto` extension namespace and owner, both private schemas,
  effective runtime/PUBLIC rights, direct third-party schema/table/column/
  function/default grants, `vap1_proof_owner` NOLOGIN/NOINHERIT and exact
  migrator role membership are checked. Incoming role grants to the migrator,
  other login roles' effective key access, predefined privileged-role grants,
  and REPLICATION-capable untrusted logins deny acceptance. Elevated role
  membership discovery includes custom NOLOGIN parent roles with CREATEDB,
  CREATEROLE, BYPASSRLS or REPLICATION; it denies even SET-only grants.
- Narrow migration-defined exceptions: the migrator may have only USAGE on
  `auth_proof_private` and SELECT on its `security_boundary` table, which
  migration113 and migration116 intentionally grant; private root key and
  write authorities remain forbidden.
- A W38-only post-migration provisioning SQL script grants `SELECT` on the
  migration ledger only to the restricted W38 test login after the exact
  140 committed migrations; it is not an application/production migration.

## Actual validation (do not conflate proof levels)

- Prime local `node --test packages/database/issue416-races/pg17-acceptance-*.unit.test.mjs`:
  **28/28 PASS**. Focused ESLint, Prettier of newly edited files, Git diff
  whitespace, `pnpm architecture:check` and database TypeScript typecheck PASS;
  architecture reports only preexisting grandfathered line warnings.
- W30 independently ran source catalog queries under `BEGIN READ ONLY`/
  `ROLLBACK` against its own verified, disposable PostgreSQL **17.11** fixture
  `issue416_w30_db`: 140/140 committed, 16 private tables, 61 functions,
  50 indexes, 142 constraints, 32 private triggers, 92 FK internal RI triggers
  (including 14 on public referenced tables) and 2 public A01 audit
  triggers. The private indexes/constraints/triggers, public audit-trigger
  full definition and 61 function-body fingerprint assertions all returned
  PASS against the exact final source pins. W30 confirmed newly expanded
  elevated role membership SQL is valid; it did not prove behavior under a
  maliciously provisioned NOLOGIN high-privilege role.
- W30 evidence (W30-owned separate clean SHA
  `40712af55840076bacc2559798f5ad02f8445fe5`):
  `packages/database/issue416-races/evidence/w30-pg17-private-catalog-20261115.json`,
  SHA256 `bcdd74c3af035bdf888550b618d691565eeb98e9f6c804663b6762cb4760e36b`.
  W30's database owner/migrator is a **superuser**, so this is not proof of
  W38's restricted migrator or its schema/role membership boundaries.
- W38's historical disposable Docker container is absent. Historical
  November 14 evidence for 131 migrations cannot establish the current
  140-migration preflight. A distinct Prime-only PostgreSQL 17.11 tmpfs
  fixture was attested and started, but role-provisioning credentials were
  blocked by execution safety controls. Prime removed **only that exact new
  container** and its temporary credential file without running any
  migrations or touching W9, W30, W40, production or shared volumes.
- Full W38-only `--preflight` and SQL adversarial privilege-negative tests
  are **NOT RUN / BLOCKED** on the current source. `--source-check` reports
  140 migrations, 210 declared trials and **0 domain executed**. `--execute`
  remains hard denied by design.

## Release and integration blockers

1. Independent security reviewer must deliver an exact source approval for
   this stabilized Prime working patch before it is committed or pushed.
2. Recreate and attest a *new* distinct, owned disposable restricted-migrator
   W38/Prime PostgreSQL17 fixture with real all-140 official migrations;
   verify migration ledger `SELECT` provisioning, ACL/role/private functions,
   invariants and negative privilege tests without recycling failed history.
3. A01 still depends on mutable legacy public anti-abuse events before its
   private immutable quota bridge and trusted actual-login writer are wired.
   W29's separately committed SQL165/166 remains dormant and under review.
4. W40 reset SQL162–164 closes several readback/lock/HMAC defects but
   intentionally fails closed for non-User L1 admission and U2 Group16;
   R03 post-commit UNKNOWN resolver, trusted raw-bearer HMAC binding and
   exact app↔SQL ABI remain incomplete. W41 route changes remain unapproved.
5. C3 cannot revoke legacy grants while 23 authenticated writer families
   still lack trusted replacements. No claim of completing 210 real business
   concurrency acceptance trials. All protected routes and flags remain OFF.
6. Remote Draft SHA still fails CI and Security CI: the known PostgreSQL
   teardown unhandled error and 11 new CodeQL findings are not waived.
   W47 teardown and W46 telemetry fixes require exact-SHA independent review
   and subsequent same-SHA CI/Security rerun before any merge decision.

**No main merge, production deployment, original W9 mutation, grant retirement,
protected route activation or remote push occurred in this local hardening.**
