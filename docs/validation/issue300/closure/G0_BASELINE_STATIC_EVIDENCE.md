# Issue #300 R2 — G0 Baseline Static Evidence

**Candidate:** `4a0f38f55dc26e608c3b61f0cfa3b8926af812bf` (documentation-only commits over frozen `ef5a0554fa20fe6ee6fcc0a4ceeffdc83d6e5687`). **Scope:** fresh isolated Prime Windows worktree, Node 24.19.0 and pnpm 10.34.5; no application source delta, no database, HTTP, role or browser acceptance.

| Command | Verified result | Boundary |
|---|---|---|
| `pnpm install --frozen-lockfile --prefer-offline` | PASS, 1022 workspace dependencies | Existing ignored native build scripts reported; no production-runtime proof |
| `pnpm --dir apps/api typecheck` | PASS (`tsc --noEmit`) | Existing frozen code, not integrated R2 |
| `pnpm architecture:check` | PASS, pre-existing grandfathered overlength source warnings | No exemption for newly authored R2 source |
| `pnpm --dir apps/api exec vitest run test/issue300-search --project=api-non-postgres --reporter=dot` | PASS 4 files, 18 tests | Pure/non-Postgres subsets only |
| `node --test apps/api/test/issue300-timeline/*.test.mjs apps/api/test/issue300-qa/*.test.mjs` | PASS 30 tests | Node tests, not signed live HTTP |
| `node scripts/validation/issue300/verify-live-ui-exceptions.mjs . D:\kndoom\valet-platform\tmp\issue-300-prime-integration\tmp\issue300-g0\FROZEN_UI_MANIFEST.json` | PASS protected-file hash inventory: 119/124 unchanged and exactly five previously authorized source exceptions | **Not** physical 200% zoom, human diff acceptance or future UI-M1 approval verification |

**Database:** historical G2 is preserved but not currently live because host port 55480 is reserved. A new **different** disposable PostgreSQL 17.10 database `issue300_r2` runs on `127.0.0.1:57285`, initially migration-free. W6 holds the sole heavy-DB lease; no G0 query/role/HTTP correctness acceptance is claimed.

**Next proof boundary:** W1 source-independent oracle; W4 actual-role detail reproduction; W6 migration/catalog/role attestation; W2/W3/W5 focused corrections; W7 independent signed HTTP, performance and genuine browser checks on a pinned integrated SHA.
