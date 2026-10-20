# VAYLET #300 / #302 / #303 — Verified combined-source validation

## PR #307 CI remediation update — 2026-10-20 (later than the source report below)

At remote HEAD `e0f877d61989c7461e72f929837291430b3db4bb`, GitHub
Actions run #512 (39363140046) **FAILED**. Windows/Ubuntu platforms,
static-build, Employee E2E and Issue215 PG passed. The API unit lane misrouted
six native Node `node:test` `.test.mjs` suites into Vitest; PostgreSQL DB
assertions expected pre-94/95/96 schema and error families; API standard,
compound and race tests still rewrote Session origin or Task type after INSERT
despite approved immutable triggers. The race lane also timed out one
40,000-row Shift History plan test at the unrelated default 5-second limit.
The downstream quality job failed because required lanes failed.

The corrective integration patch retains every immutable DB trigger, original
migration SQL, runtime permissions and existing security verifier. It routes
native Node tests through `node --test`, updates exact migration expectations,
seeds immutable provenance at INSERT, and generates independent Task fixtures
for negative compatibility cases. On the uncommitted patch, local Node suites
40/40 and API non-PG Vitest 1048/1048 (6 skipped) passed; TypeScript, ESLint,
architecture, V3 **source-only** guard passed. These are **not** final
PostgreSQL CI or genuine V3 acceptance results. Original dated SHA-specific
results below remain intact. The final pushed SHA and GitHub CI must be
verified separately before merge.

**Owner decision remains in force:** ordinary CA/LM Investigation routes and
Dashboard tab are production-enabled, per the Owner correction linked below.
Only optional U005 *proof/certification* remains isolated, with the Owner
signing exception explicitly **NOT CRYPTOGRAPHICALLY VERIFIED**. Mutable
make/model/plate/country-filter Search spanning multiple pages remains
fail-closed (503) because no DB-backed vehicle identity revision/membership
epoch has been approved or verified. No false partial 200 or signed cursor
claim is made. The original 79 full #300 criteria remain 57 BLOCKED /
22 NOT RUN; real MFA/CA/LM, actual V3 93→96/killed95, UI-M1 34-browser and
100k/1m load/cold acceptance are not promoted to PASS by CI source results.

**Dated Owner product-decision supersession:** The former `#300 production
disabled` integration posture below has been overridden. See
[`OWNER_ISSUE300_PRODUCTION_AVAILABILITY_2026-10-20.md`](OWNER_ISSUE300_PRODUCTION_AVAILABILITY_2026-10-20.md)
and [`PR_300_302_303_FINAL.md`](PR_300_302_303_FINAL.md). The old results
remain attributable to their earlier SHA, not silently reclassified as tests
run on the corrected SHA. The genuine Owner certificate exception remains
*not cryptographically verified*.

**Status: LOCAL SOURCE INTEGRATION VERIFIED; OWNER MERGE/RELEASE STILL PENDING.**

This addendum records commands **actually executed on the new combined
release-candidate worktree**, not source-lane history and not remote CI.
To identify the exact final reviewed source, run `git rev-parse HEAD` in
`D:/kndoom/valet-platform/tmp/issues-300-302-303-release-candidate`.
No build artifact or local PASS substitutes for the original 79 #300 full
acceptance gates (57 BLOCKED / 22 NOT RUN) or an Owner-signed historical
U005 proof; the Owner-signed **build certification** exception remains
**NOT CRYPTOGRAPHICALLY VERIFIED**.

## Verified Git provenance

| Boundary | Commit SHA | Meaning |
| --- | --- | --- |
| Fetched `origin/main` | `6d7bd5991e66d8f5d93978512352a52c72bdc7f6` | Local source integration baseline, remote verified with `git fetch origin main` |
| Native #302/#303 source tip | `e92f7f0c732ee53f26ccc45361c69b66f7296cfb` | Four QA-provenance / CSPRNG / native awaited-copy commits |
| Native first merge | `6982e168459f858bfe894a253490ba1bfca5344e` | Two-parent merge without conflict |
| Issue #300 R2 source tip | `38ec1e40dfc754c5e2f83e25866735421ec2f4d2` | Owner exception, 79-row ledger, 300 implementation/source and reviews |
| Combined source merge | `ecc7b3a2563a7a017d3ad299594bb2549e601ff1` | Two-parent merge without conflict and 0 common changed files vs base |
| Reviewed production/default-OFF gates | `678ee8dc3a1eaa2c4e7ec6ad9a53a765b5271fda` | API+UI registration off on production, wrapper migrations deferred |
| CI local-target and unknown-env defenses | `a91be687f2922bf57ba5d9e24a7b47d4536ac539` | Ensures CI `NODE_ENV=test`, rejects remote migration masquerade |
| V3 architecture split | `b8523a838b7ddbdb24fdecbe3062192a5539b0cc` | 924-line source split, source signer/DB kill/stop gates preserved |

Additional documentation merges `75e17d49` (#300/consolidated), `905b517e`
(#302/#303) were imported as independent traceable commits. The current
release-candidate also contains a narrow V3 source-boundary fix: only
**all Prisma schema/migration bytes**, not added fail-closed database
deployment scripts, are required unchanged relative to the V3 approved
source anchor; 49 negative/positive V3 source tests verify this. This is
not a genuine PostgreSQL migration result or new Owner signed lease.

## Actual combined validation

| Command or check | Verified result | Scope / limitation |
| --- | --- | --- |
| `pnpm install --offline --frozen-lockfile --ignore-scripts` | **PASS** | Lockfile resolution exact, 1023 cached packages, zero downloads; lifecycle hooks deliberately disabled |
| Contracts TypeScript and `pnpm --filter @valet/contracts test` | **PASS; 473/473, 66 files** | Source schemas, Audit Investigation, Incident/photo contracts |
| Employee Client TypeScript and `pnpm --filter @valet/employee-client test` | **PASS; 843/843, 100 files** | #302/#303 portable incident/photo and workflows, full source suite |
| `pnpm --filter @valet/api typecheck` | **PASS** | Full application compiler |
| Focused API `vitest --project api-non-postgres` | **PASS; 137/137, 19 files** | #300 Search/Timeline/authorization, cursor, proof-model and existing Audit Events; no actual database or HTTP |
| `pnpm --filter @valet/dashboard typecheck` and `pnpm --filter @valet/dashboard test` | **PASS; 947/947, 132 files** | Includes existing Audit Events, Management UI and #300 frozen source tests, not real browser PNG parity |
| `pnpm --filter @valet/valet-native typecheck` | **PASS** | Native app compiler with CSPRNG and awaited-copy source |
| Full `pnpm --filter @valet/valet-native test` (initial) | **FAIL: 1690/1692** | Two 5-second Appearance/visual test timeouts under high worker concurrency; no assertion mismatch witnessed |
| Focused original Appearance/visual tests, `--maxWorkers=2` | **PASS; 4/4** | Original 5-second individual timeout retained |
| Full Native `pnpm --filter @valet/valet-native exec vitest run test --maxWorkers=2` | **PASS; 1692/1692, 239 files** | 83.18 sec; previous failed run remains in history, not overwritten |
| `pnpm --filter @valet/database typecheck` | **PASS** | Database source, not live PG privileges or migration deployment |
| Contracts, Employee Client, API builds | **PASS** | Compiler outputs under exact candidate worktree, no production deploy |
| Dashboard `pnpm --filter @valet/dashboard build` | **PASS with required `API_ORIGIN=http://127.0.0.1:3167`** | 26 Next routes; subsequent exact-worktree Turbopack-root build also PASS; no API contacted |
| `node scripts/architecture-check.mjs` | **PASS** | W21 split bounded V3 modules, only unrelated grandfathered legacy warnings |
| V3 `--check` plus 5 focused offline mock suites | **PASS; 49/49** | Source guard/prisma invariants, signed kill/lease mocked; *not* PG runtime acceptance |
| #300 production-off + CI migration helper Node tests | **PASS; 7/7** | Source policy only; genuine Nest route-map in production, direct Prisma CLI and deployed binary still require review |
| `git diff --check` | **PASS on code reviewed** | Whitespace safety; repeat on final commit |

The full CI service tests, real Android rebuild/signature/physical install,
PostgreSQL 93→96 and killed95 runtime, real staff MFA, U005 signed S0→S1,
the 34 real Playwright cases and 100k/1m stress/cold acceptance were **NOT
RUN** on this combined candidate. Historical #303 persistence consists of
two separately verified QA DB rows and matching private MinIO objects on
the source branch only; no new private storage access was performed.

## Production OFF and migration-deployment caveat

- In API ManagementModule, the new Investigation controllers register only
  for explicit `development` or `test` NODE_ENV; no direct route is registered
  in `production`, unset or staging. Existing Audit Events controllers remain.
- Dashboard Investigation switch is likewise restricted to dev/test, even
  with `?investigationDemo=1`; old Audit Events is the default.
- U005 independent signed-provenance verifier and all existing tenant/MFA
  checks remain unchanged and fail closed; Owner exception does not waive them.
- Default migration runner stops production, unset and staging environments
  until an explicit later Owner migration stage. Test/development migration
  wrappers require a loopback PostgreSQL URL. CI's disposable E2E PostgreSQL
  migration is explicitly test-mode. This **temporarily blocks unrelated
  production database migrations** too. Direct manual Prisma CLI invocation
  can bypass the supported wrapper and remains outside approved deployment.
- The source contains migrations 94–96; do not execute a production migrate
  workflow until separately approved checksums, runtime privileges, lock,
  commit uncertainty, fresh/populated upgrade and rollback are certified.

## Independent review and outstanding owner gates

W20 reviewed the original combined source and identified the production
route P1. W22 separately found the production migration/CI env P1; both
were addressed locally in the new integration candidate with negative
tests, followed by the bounded V3 structure fix. **A new independent final
SHA read-only security/tenant/privacy/feature review and GitHub CI must be
completed before requesting an actual merge**. Review accepted DEC-077 and
DEC-104, Incident exactly-once behavior, private photo custody, migration
94–96 backward compatibility and client/contract version cohesion.

Recommended classification, subject to final independent review:
**#300 SOURCE INTEGRATED / PRODUCTION DISABLED / LIVE ACCEPTANCE PENDING;
#302 PHYSICAL QA RESOLVED / COMBINED REGRESSION VERIFIED;
#303 PHYSICAL QA+PERSISTENCE VERIFIED / COMBINED REGRESSION VERIFIED.**

No production migration, feature enablement, deployment, GitHub issue closure
or PR merge is authorized by these local checks. PR is review-only, and
without verified final SHA/CI this document does **not** claim `READY FOR
OWNER MERGE REVIEW` yet.
