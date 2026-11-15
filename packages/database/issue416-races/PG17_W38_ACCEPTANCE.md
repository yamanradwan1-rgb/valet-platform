# Issue #416 W38 — independent PostgreSQL 17 race controls

**Business-domain result: BLOCKED, 0/210 trials executed or passed.**

W38 read W30's seven unmerged files without modifying that worktree. The seven
files were copied to branch `cos/issue416-w38-real-races` (based on Prime
`53b91e23cccf635a5b906ded732db61376edcda3`) and corrected for an
independent disposable PostgreSQL 17 target. W30's `obj_description` call was
invalid for shared `pg_database`; the actual fixture marker is read with
`shobj_description`. None of this changes production code or grants.

## Actual isolated fixture identity

| Attribute               | Independently observed value                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Docker ID               | `14edf2d6904c88e677032fd43162fee1ed640f1c175301048ca49ebb50d2d351`                                                  |
| Container               | `vaylet-issue416-w38-20261114-pg17`                                                                                 |
| Image                   | `postgres:17-alpine`, server `17.11`                                                                                |
| Labels                  | `vaylet.issue=416`, `vaylet.owner=issue416-worker-38`, `vaylet.environment=isolated-test`, `vaylet.disposable=true` |
| Published port          | `127.0.0.1:51138 -> 5432/tcp`                                                                                       |
| Database and owner      | `issue416_w38_db`, `issue416_w38_owner`                                                                             |
| Migrator                | `issue416_w38_migrator`, role switch permitted exclusively into `vap1_proof_owner`                                  |
| Restricted test/runtime | `issue416_w38_test`, `issue416_w38_runtime`                                                                         |
| DB comment              | `VAYLET_416_W38_DISPOSABLE_PG17_20261114`                                                                           |

Container creation, Docker ID/labels/port verification and role provisioning
preceded SQL execution. The owner ran the **official Prisma migrate deploy**
against the new W38 database only: `131/131` migrations succeeded. A restricted
SQL preflight independently compared all 131 committed `_prisma_migrations`
checksums with the current 131 migration files and verified private runtime/PUBLIC
ACL denials. Neither original W9 nor any Prime, W33 or W37 fixture was used.

## Executed outcomes (2026-11-14)

| Lane                                       | Verified outcome                                                                             | Business-domain PASS |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- | -------------------- |
| Read-only migration/identity/ACL preflight | PASS, 131/131                                                                                | 0                    |
| W30 physical advisory-lock harness         | 8/8, A/B first × C/R/D/T                                                                     | 0                    |
| Dormant R02 private quota SQL              | 8/8, A/B first × C/R/D/T, actual `pg_locks` and `pg_blocking_pids`                           | 0                    |
| Same-operation conflicting fingerprint     | 2/2, SQLSTATE `23505`; 1 bundle/4 entries                                                    | 0                    |
| Target quota threshold                     | 1/1, fourth new operation denied `P0001`                                                     | 0                    |
| R03 unavailable trusted binder             | 1/1, client and credential attempts each denied `42501`, 0 rows                              | 0                    |
| Runtime/test direct private schema access  | PASS, both restricted identities against every private table (five SQL operations per table) | 0                    |
| Source/coverage unit tests                 | 8/8                                                                                          | 0                    |

The quota suite exercises dormant internal SQL by a narrowly scoped disposable
**migration principal** that explicitly `SET ROLE vap1_proof_owner`. It does not
mint or validate genuine proof signatures, current Company Admin authority,
tenant membership, MFA, or production reset commands. `U` acknowledgment loss
was not injected. The existing R03 client/credential limiter is deliberately
unavailable to an ingress caller pending a genuine trusted binder. Physical
lock observation establishes a wait, not the application's logical rank.

## Remaining 21-family acceptance blockers

`pg17-domain-readiness.mjs` enumerates **all 21 concrete A/B command pairs**,
including the six HOLD races, and records `BLOCKED_PRODUCTION_ABI` for all
`21 × 2 × 5 = 210` trials. Required: real authenticated A/B command bindings,
production rank instrumentation, tenant-scoped current-state revalidation,
atomic domain/receipt/audit assertions, and controlled server-committed lost
acknowledgment. W33's A01 SQL source 137–140 and W34/W35 integrations were
still unmerged into this pinned Prime baseline; they cannot be guessed or
silently substituted. W37 owns the separate legacy StaffOnboarding CI race.

Run from this exact worktree with only the W38 synthetic fixture environment:

```powershell
node --test packages/database/issue416-races/pg17-acceptance-*.unit.test.mjs packages/database/issue416-races/pg17-domain-readiness.unit.test.mjs
node packages/database/issue416-races/pg17-acceptance-cli.mjs --status
$env:ISSUE416_W38_ACCEPTANCE_PG_PASSWORD = '<disposable fixture password>'
node packages/database/issue416-races/pg17-acceptance-cli.mjs --preflight
node packages/database/issue416-races/pg17-acceptance-cli.mjs --smoke
node --test packages/database/issue416-races/pg17-quota-races.pg17.test.mjs packages/database/issue416-races/pg17-private-acl.pg17.test.mjs
Remove-Item Env:ISSUE416_W38_ACCEPTANCE_PG_PASSWORD
```

**Current acceptance preflight contract (140 migration sources):** the restricted
`issue416_w38_test` role needs read-only `SELECT` on the Prisma migration ledger
to compare committed checksums. The original `w38-fixture-provision.sql` runs
_before_ Prisma creates `_prisma_migrations`, so a fresh, separately attested
W38-only fixture must execute `w38-fixture-postmigrate-read.sql` as its migrator
**after** all 140 official migrations and **before** `--preflight`. That script
checks the dedicated database owner, marker, migrator identity, PostgreSQL 17,
and complete 140-row ledger before granting `SELECT` only to the W38 test role.
It grants nothing to W38 runtime, PUBLIC, production, or any older fixture.
The historical 131-migration evidence above must not be reused as a current pass.

The CLI provides no arbitrary URL, SQL, role or container target arguments.
It explicitly rejects `--execute`; the original W9 race-runner remains denied.
