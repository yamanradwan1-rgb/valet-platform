# Issue #463 W9 — independently owned PG17 shared-role migration proof

## Source and authority

- W2 committed migration checkout: `14238ea441c1317f00df34d1f828adacafc57e41`.
- W9 harness role/CI foundation: `6244dfd41bfabf84fbe200ac0b496b7fb74aa83f`.
- W2 P2 committed LF Git blob SHA256:
  `23213576884348808b85c01bec545787469199e0b8491bbd6ec4fa6d16d05b1a`.
- P2 Windows CRLF checkout checksum (also observed in Prisma SQL receipts):
  `c0d7cc5d711ba6b12ab0d86003ee5142ace196576e7d0dedeec46ceef8dc506c`.
- PostgreSQL 17-alpine exact local image ID:
  `sha256:ab20e934b27ba3ff927c1b4c9ff8cf6c32f315f743efe68dd3441182a87fb085`.

## Replay requirements

The runner requires the separate, clean W2 checkout at
`../issue463-impl-w9-concurrent-proof`. It reads the complete committed W2
migration directory through the installed official Prisma CLI and an isolated
test-only Prisma configuration. It refuses another source HEAD or P2 digest,
an external Docker endpoint, missing pinned image, a non-loopback target,
or an unapproved invocation.

Under a local Docker Desktop Linux engine with the exact cached image, use:

```powershell
$env:ISSUE463_W9_DISPOSABLE='I_OWN_DISPOSABLE_W9'
node scripts/test-harness/issue463-w9-concurrent-proof.mjs
```

Each execution generates a fresh UUID, unique container and database names,
short-lived random test-only credentials and a temporary env-file. It starts
one labeled Docker PG17 container with tmpfs data and a dynamically allocated
127.0.0.1-only port. It validates the image ID, labels, health and system ID.
It preprovisions the exact CI principals: non-superuser NOINHERIT CREATEROLE
database owner `valet`; two NOLOGIN F/P owners; LOGIN passwordless A/E; old
Option C owners; exact ADMIN-only superuser creator and separate SET-only
migrator edges on F/P. The bootstrap login is then disabled.

Two independently empty databases run the **official** Prisma `migrate deploy`
from the same committed W2 directory concurrently. Both must have 157 exact,
successful, complete migration rows with independently checked raw SQL
checksums and the exact same PG17 system ID, tenant-safe owner identity and
role membership graph. After successful official migrations the runner performs
12 additional concurrent repetitions of W2's *exact* F/P SET-only GRANT,
starting distinct backend sessions against the two databases. Each backend
independently executes BEGIN, SET LOCAL lock_timeout 5s, GRANT and COMMIT, without
waiting for the competing GRANT before committing. It verifies all 157
checksums and the role graph again.

Finally, only the newly created, exactly labeled/identified container can be
removed. The runner checks that Docker inspection fails after removal and
discards its temporary env-file. It writes redacted run evidence outside the
Git worktree under `../../issue463-w9-concurrent-evidence`.

## Observations on 2026-11-27

| Fresh run ID | Official DB A/B | Synchronized grant result | Exact cleanup |
| --- | --- | --- | --- |
| `ffd476e92b3e` | 157/157 + 157/157 PASS | Not executed | VERIFIED |
| `d7bfeb7b8227` | 157/157 + 157/157 PASS | INVALID harness: 55P03 | VERIFIED |
| `e5c378351ade` | 157/157 + 157/157 PASS | 12 rounds, 24/24 commits PASS; max 37ms | VERIFIED |

The intermediate 55P03 was a **harness-induced false positive**: a defective
barrier deferred the first transaction's COMMIT until the second blocked GRANT
returned, causing the second to hit the configured 5-second lock timeout.
This did not establish a W2 migration fault. It was reported and explicitly
retracted. The corrected barrier was separately regression-tested with two
mock clients sharing a transactional lock, and the final independent fresh
PG17 run passed.

The results support shared-cluster correctness under the tested PG17 schedule
and creator/member graph. They do not establish production provider, tenant
activation, global deadlock freedom under every workload, legal policy, P5
RELEASE, merge eligibility, or a production deployment.
