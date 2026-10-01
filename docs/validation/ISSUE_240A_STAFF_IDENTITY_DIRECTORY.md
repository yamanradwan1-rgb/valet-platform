# Issue #240 / T05-A validation record

Scope: canonical membership-owned staff identity and the existing Company Admin
server-filtered Employees directory only. This does not complete Issue #240.

Branch: `fix/240a-staff-identity-directory`.
Starting SHA: `7135e8c33305c31aeae567c4c7d46f4c670ebe91`.
Remote target: `origin/fix/240a-staff-identity-directory` at
`https://github.com/veletpro0-lgtm/valet-platform.git`.
Final commit SHA and post-push clean status are recorded in the completion message.
No worktree, PR, merge, main update, or issue edit was performed.

## Identity, database and API contract

Forward migration: `20261001004900_mgt_240a_staff_identity`.
Nullable TEXT `first_name` / `last_name` belong to OrganizationMembership.
User email remains global and unchanged. No name-writing HTTP command, new identity
table, fabricated backfill or account-lifecycle expansion was added.

Each non-null component is trimmed/nonblank and bounded to 100 Unicode code points,
with matching PostgreSQL checks for the ECMAScript whitespace set. No structured
person-name bound existed; 100 per component is a conservative implementation
constant below the existing 200-character management-label convention. Arabic,
diacritics, punctuation and astral characters are preserved; Unicode is not reduced
to ASCII. The 048→049 actual Prisma upgrade preserves membership, User and grant
facts; fresh deployment, repeat deployment/provisioning, constraints, and runtime
read-only privileges were exercised. Existing migration files were not modified.

One shared `staffManagementIdentitySchema` requires nullable firstName/lastName and
valid email. Exported `staffManagementDisplayName` displays both complete names
joined by one space, otherwise the real email. List, detail, table and drawer use
that representation. Named rows show email separately; legacy rows do not invent
names. Email is isolated LTR and names use automatic bidi direction.

The existing GET directory route remains strict, with default limit 50/max 100.
Search trims surrounding whitespace, treats empty as absent, and accepts at most
200 Unicode code points. Parameterized ILIKE performs literal case-insensitive
substring matching over first name, last name, complete full name and User email;
backslash, percent and underscore are escaped. Exact role/status and Organization-
owned Location predicates apply before keyset LIMIT+1. User joins participate before
LIMIT; grant counts apply only to the bounded returned page. Ordering remains
(created_at,id), including equal timestamps.

V2 cursors contain staff domain, Organization, tuple and SHA-256 effective-filter
fingerprint. Fingerprint normalization trims/empty-normalizes search, preserves its
case (avoiding assumptions about PostgreSQL locale folding), uses exact enums and
lowercase Location UUIDs. Limit is excluded. Raw names/email/search are absent.
Old versions, wrong domains, malformed tuples and tenant/filter mismatches fail
validation. A differently cased search requires a new first page, while SQL matching
remains case-insensitive.

## Authority, races, requests and privacy

The existing persisted Company Admin guard, Management MFA, commercial entitlement,
current User/membership/Organization checks and atomic transaction are retained.
Foreign/missing Location failures are the same concealed 404; inactive membership,
Organization or denied entitlement also returns 404, disabled User 401, and missing
Management assurance 403. A global User shared across two Organizations retains
separate membership names. Existing role/status/grant commands and audits remain
unchanged and their six integration tests pass. No Location Manager authority was
expanded: browser tests observe zero Employees business reads for LM, Supervisor,
Employee and unauthenticated users, and zero reads when entitlement denies access.

The existing authoritative-read lifecycle is reused, with identity generation,
session generation, selection revision, authority/scope, effective filters, cursor
and local query generation. Success/failure tests cover Organization A→B→A, filter
A→B→A, pending page2 after filter/scope reset, logout, replacement sessions and
pending Employee detail. Filter changes clear history/cursor/detail; Next/Previous
preserve filters. No shared auth/fence framework or shell behavior was changed.

The production-build browser budget test asserts one initial directory read, one
per effective change, one 300 ms debounced search read, immediate clear without a
later duplicate, preserved filters on Next/Previous, and no hidden cursor loop or
writes. Ten intentional directory reads are counted in the full scenario. Detail
reads occur only after a row is selected. The Location picker uses the existing
Company Admin discovery API, lazily and one bounded page at a time; explicit Next
loads the next page without an Employee read. Selected-scope context does not carry
an entire Location inventory. It neither fans out nor claims its first page is the
complete inventory. Names/email/search sentinels produce no localStorage,
sessionStorage, IndexedDB or Cache Storage matches. No new PII logging or audit
metadata was introduced.

## Visual freeze and measured query plans

Four before and four after captures use identical synthetic fixtures, three rows,
and the selected employee: EN/light/1440×900 table+drawer and AR/dark/480×900
RTL table+drawer, including long Arabic names and null legacy names.
The measured heading, search, table and drawer boxes match the baseline exactly.
Rows remain 69 px; table heights remain 251.5 px; desktop table width is 1114 px,
narrow scrollable table width 768 px, drawer width 448 px, and document width stays
1440/480 px. Manual visual inspection reviewed all required modes. Intentional
content deltas are name+email, identity heading/search wording, Location filter,
removal of loaded-page wording, and server-result states. Existing intrinsic column
sizing remains; no column, color, typography, badge, action, drawer or shell system
was replaced. The new five-line scoped mobile rule sizes only the new Location
control, preserving the previous toolbar footprint. Existing staff CSS is unchanged.
Shifts render/rows/Next/Previous functions are identical after formatting; the
existing Shifts presentation and Arabic/time/ID tests pass.

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) used the actual SQL with 3000 tenant staff,
3000 outside staff and one scoped Location grant per membership:

| Scenario | Execution ms | Observed plan |
| --- | ---: | --- |
| Baseline | 0.937 | directory index + users PK + grant PK, 51 returned rows |
| Sparse absent substring | 12.484 | hash join/sort; 3000 tenant memberships and 6000 User rows scanned; no output |
| Search+role+status+Location | 1.002 | directory index + users PK + scoped grant PK, 51 returned rows |

This measured local sample did not justify a new index/extension. Existing
`organization_memberships_org_created_id_idx` and
`membership_location_access_pkey` are retained; no pg_trgm/speculative indexes
were added. The sparse case remains scan-based; these timings are not a production
scale/load guarantee.

Captures, geometry JSON and sanitized plan JSON are preserved outside Git in:
`C:/Users/LP/.codex/visualizations/2026/10/01/01a0f7da-9292-7b70-8734-9e7fd722afd1/t05a-evidence`.

## Exact focused successful validation

Real PostgreSQL tests use the existing .env privately through:
`$env:DOTENV_CONFIG_PATH=(Resolve-Path .env).Path`.
The database is isolated and the owned harness reports zero databases/roles/children
remaining after cleanup. Browser HTTP responses are fixture-controlled; they are
not claimed as real database proof. Database/API integration tests are real PostgreSQL.

| Command | Passed |
| --- | ---: |
| `pnpm --filter @valet/contracts exec vitest run src/staff-management.test.ts` | 6 |
| `pnpm --filter @valet/dashboard exec vitest run src/features/administration/staff/staff-presentation.test.ts src/features/administration/administration-api.test.ts` | 10 |
| `pnpm --filter @valet/api exec node -r dotenv/config ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/staff-directory-cursor.test.ts` | 4 |
| `pnpm --filter @valet/api exec node -r dotenv/config ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/staff-directory-filters.integration.test.ts` | 13 |
| `pnpm --filter @valet/api exec node -r dotenv/config ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/staff-directory-filters.integration.test.ts test/staff-management-directory-pagination.integration.test.ts` | 15 (13 filter + 2 existing pagination) |
| `pnpm --filter @valet/api exec node -r dotenv/config ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/staff-directory-plan.integration.test.ts test/staff-management.integration.test.ts` | 7 (1 plan + 6 existing mutations) |
| `pnpm --filter @valet/database exec node -r dotenv/config ../../scripts/test-harness/run-owned-tests.mjs database vitest.config.mjs src/staff-identity-migration.integration.test.ts` | 3 |

With `E2E_BASE_URL=http://localhost:3103`, the exact final command was:

`pnpm --filter @valet/dashboard exec playwright test e2e/issue240a-visual.spec.ts e2e/issue240a-directory-races.spec.ts e2e/issue240a-directory-detail-races.spec.ts e2e/issue240a-directory-budget.spec.ts e2e/administration-r05-employees-generation.spec.ts e2e/administration-r05-employees-scope-cursor.spec.ts e2e/administration-r05-employees-session.spec.ts e2e/administration-r05-employees-pagination.spec.ts e2e/administration-r05-employees-page-scope.spec.ts e2e/administration-r05-employees-controls.spec.ts e2e/administration-r05-employees-presentation.spec.ts e2e/administration-r05-authority-budget.spec.ts e2e/administration-r05-presentation.spec.ts e2e/administration-concurrency.spec.ts --grep 'T05-A|staff role|R05' --reporter=line`

Result: **28 passed**, including the final visual capture. There are 73 unique
focused tests overall; repeated invocations above are not counted twice.

Other successful checks: each of `pnpm --filter @valet/contracts typecheck`,
`pnpm --filter @valet/api typecheck`, `pnpm --filter @valet/dashboard typecheck`,
`pnpm --filter @valet/database typecheck`;
`pnpm --filter @valet/database exec node -r dotenv/config node_modules/prisma/build/index.js validate`;
`pnpm architecture:check`; `git diff --check`;
`pnpm exec eslint` and `pnpm exec prettier --check` with only the changed/new
applicable files listed below. Architecture has only unchanged grandfathered-file
warnings; no baseline allowance was edited. Targeted
`$env:API_ORIGIN='https://api.example.com'; pnpm --filter @valet/dashboard exec next build`
also passed; its local production build was served on port 3103 for request proof.
Contracts were built once for the existing Dashboard contract alias; no broad build
wrapper was used.

Intentionally NOT run: root pnpm typecheck/lint/format:check; entire root/unit/API/
database test suites; all PostgreSQL suites; root production/verification build
wrappers; full unrelated Operations/Locations/Payments/Analytics suites; full
Dashboard E2E/visual suites; Docker/production deployment; remote repository CI.
These skipped gates are not marked PASS and production readiness is not claimed.

Initial environment/setup failures were resolved: unconfigured default database
credentials/missing migration URL used the existing private .env; a development
preview returned 404 and development effect replay was unsuitable for strict request
counts, so the targeted production build was used. New fixture cursor lengths,
UUID parameter casts, pool-budget setup, modal/hidden-pagination expectations and
exact denial assertions were corrected. The genuine legacy email bidi defect found
by the RTL test was fixed. No focused failure remains; no failure was excused as
unrelated baseline debt. The standalone next-start warning is not a deployment claim.

## Hostile review against the starting SHA

Review used the VAYLET code-review skill and the owner's 22-point checklist.
Accepted contracts checked include DEC-078/080/081/082/088 and the Issue #240 plan;
schema, security, scope/domain, structure and collaboration rules were reconciled.
Scope/contract/tenant/location, retry/persistence, abstraction, privacy, downstream
boundary, architecture, tests, evidence and internal consistency passes found no
remaining code blocker. Protected name reads follow persisted authorization;
existing name-independent commands/audit semantics are unchanged. No global User
identity became tenant-mutable, old migration changed, scope predicate went missing,
raw search entered a cursor/log/storage, stale read repainted, or N+1 detail request
was added. Local code-review verdict: CLEAN TO MERGE; actual merge remains subject
to repository CI and human cross-review and was not performed.

No Task01–04 production behavior/file changed. Updates to older R05 test files are
limited to identity fixture compatibility, exact server-filter semantic expectations,
current Organization-selector actions, useful existing race assertions, scoped
extraction and required formatting. No onboarding/invite/LM authority/Shift History/
MFA/Force End Shift work was pulled forward. The pushed task diff is T05-A only.

## Exact changed files and physical counts

48 intentional files. Counts below are physical lines after Prettier.
Every changed/new authored implementation/test file is at or below 300 lines.
CSS is included for completeness. Documentation, Prisma schema and migration SQL
are outside the authored-code ceiling.

| Authored file | Physical lines |
| --- | ---: |
| `apps/api/src/modules/management/staff-directory-query.ts` | 68 |
| `apps/api/src/modules/management/staff-directory.service.ts` | 108 |
| `apps/api/src/modules/management/staff-management-cursor.ts` | 75 |
| `apps/api/src/modules/management/staff-management-projection.ts` | 83 |
| `apps/api/test/staff-directory-cursor.test.ts` | 105 |
| `apps/api/test/staff-directory-filter-fixture.ts` | 67 |
| `apps/api/test/staff-directory-filters.integration.test.ts` | 266 |
| `apps/api/test/staff-directory-plan.integration.test.ts` | 84 |
| `apps/dashboard/e2e/administration-concurrency.spec.ts` | 242 |
| `apps/dashboard/e2e/administration-r05-authority-budget.spec.ts` | 241 |
| `apps/dashboard/e2e/administration-r05-cursor-generation.spec.ts` | 223 |
| `apps/dashboard/e2e/administration-r05-employees-controls.spec.ts` | 70 |
| `apps/dashboard/e2e/administration-r05-employees-generation.spec.ts` | 91 |
| `apps/dashboard/e2e/administration-r05-employees-page-scope.spec.ts` | 88 |
| `apps/dashboard/e2e/administration-r05-employees-pagination.spec.ts` | 92 |
| `apps/dashboard/e2e/administration-r05-employees-presentation.spec.ts` | 118 |
| `apps/dashboard/e2e/administration-r05-employees-scope-cursor.spec.ts` | 112 |
| `apps/dashboard/e2e/administration-r05-employees-session.spec.ts` | 131 |
| `apps/dashboard/e2e/administration-r05-presentation.spec.ts` | 185 |
| `apps/dashboard/e2e/issue240a-directory-budget.spec.ts` | 159 |
| `apps/dashboard/e2e/issue240a-directory-detail-races.spec.ts` | 87 |
| `apps/dashboard/e2e/issue240a-directory-races.spec.ts` | 187 |
| `apps/dashboard/e2e/issue240a-visual.spec.ts` | 113 |
| `apps/dashboard/e2e/support/administration-fixtures.ts` | 125 |
| `apps/dashboard/e2e/support/administration-r05-fixtures.ts` | 56 |
| `apps/dashboard/e2e/support/staff-directory-ui.ts` | 24 |
| `apps/dashboard/src/features/administration/administration-copy.ts` | 285 |
| `apps/dashboard/src/features/administration/staff/staff-api.ts` | 111 |
| `apps/dashboard/src/features/administration/staff/staff-detail-drawer.tsx` | 254 |
| `apps/dashboard/src/features/administration/staff/staff-directory-filter.module.css` | 5 |
| `apps/dashboard/src/features/administration/staff/staff-directory-location-filter.tsx` | 91 |
| `apps/dashboard/src/features/administration/staff/staff-employees-body.tsx` | 244 |
| `apps/dashboard/src/features/administration/staff/staff-page.tsx` | 259 |
| `apps/dashboard/src/features/administration/staff/use-staff-directory-query.ts` | 86 |
| `packages/contracts/src/staff-management.test.ts` | 108 |
| `packages/contracts/src/staff-management.ts` | 142 |
| `packages/database/src/migration-manifest.ts` | 51 |
| `packages/database/src/staff-identity-migration.integration.test.ts` | 249 |

Other intentional changed/new files:

- `docs/01_PRODUCT_SCOPE.md`
- `docs/02_DOMAIN_MODEL.md`
- `docs/03_DATABASE_SCHEMA.md`
- `docs/06_SECURITY_AND_DATA_RULES.md`
- `docs/08_DECISIONS_LOG.md`
- `docs/23_MANAGEMENT_BACKEND_216_EXECUTION_PLAN.md`
- `docs/decisions/DEC-081_STAFF_ROLE_AND_ACCESS_LIFECYCLE.md`
- `docs/validation/ISSUE_240A_STAFF_IDENTITY_DIRECTORY.md`
- `packages/database/prisma/migrations/20261001004900_mgt_240a_staff_identity/migration.sql`
- `packages/database/prisma/schema.prisma`
