# Issue #240 / T05-B validation record

Scope: Location Manager authority over existing staff plus complete bounded
Location-grant management only. This does not complete Issue #240.

Branch: `fix/240b-lm-staff-authority`.
Starting SHA: `2c2e5a09d2347cc4c371ed2df55bc6209e27002c`.
Forward migration: `20261001005000_mgt_240b_lm_staff_authority`.
Final commit SHA and remote branch SHA are recorded in the completion report.
No PR, merge, main update, or Issue #240 edit is part of this task.

## Authority and database boundary

Company Admin staff-management authority remains on the existing
`authorizeCompanyAdminManagement` path. T05-B adds an operation-specific staff
authority boundary for Location Managers; it does not broaden unrelated Management
features. A Location Manager target must be a different membership with role
`VALET_EMPLOYEE` or `VALET_SUPERVISOR`, and the target's complete current persisted
Location grant set must be non-empty and fully covered by the actor's current
persisted grants to `ACTIVE` Locations in the same active Organization. Mixed,
outside, zero-grant, elevated-role and self targets use concealed staff-management
denial semantics.

Migration 050 forward-recreates the existing role, status and Location-access
command functions without changing their signatures. It preserves the migration-37
Company Admin, last-usable-admin, CAS, desired-state no-op and handover-blocker
logic, while adding private LM authority/coverage helpers. Staff commands keep the
existing `staff-management-org:<organization>` serialization. LM active grants and
their active Location rows are protected in deterministic order with row locks;
the staff path does not acquire `location-lifecycle` advisory locks after the staff
Organization lock. This preserves the accepted lifecycle lock order while forcing
authority to be rechecked through commit. New helpers are SECURITY DEFINER with a
fixed `pg_catalog, public` search path, denied to `PUBLIC`, and are not runtime
entrypoints.

LM role changes are limited to Employee <-> Supervisor. LM status changes preserve
every existing deactivation blocker. Grant/revoke remains one explicit 1-50 unique
Location command using one `expectedVersion`; submitted LM Locations must be in the
actor's current active grant set and the resulting target set must remain non-empty
and fully covered. A mixed target cannot be repaired through revoke.

## Directory, detail, paging and privacy

The existing staff directory route remains the only directory. For LM reads, the
lower-role/complete-coverage predicate is inside the server query before keyset
LIMIT. Existing search, role, status and Location filters remain server-side. An LM
Location filter outside current authority is concealed. Detail performs the same
complete-coverage authorization before returning identity, role, status, version,
grant rows or counts.

Company Admin staff cursors remain the existing v2 form. LM directory cursors use
an authority-scoped version bound to Organization, normalized filter fingerprint,
page tuple and a SHA-256 identity of the current LM grant scope. Grant and assignment
candidate cursors bind Organization, target membership, authority kind, grant-scope
fingerprint, cursor domain and ordering tuple. Cursor payloads contain no Location
names or staff PII.

Target grant browsing is now a bounded cursor page under the existing staff API
family. Rows show Location name, code and status. The assignment candidate page is
also target-scoped and bounded; for LM it contains only the actor's current granted
ACTIVE Locations plus whether each bounded candidate is already granted to the
authorized target. Neither endpoint auto-crawls pages, and neither the UI's loaded
page nor the legacy detail first-100 projection is authorization input. Focused API
evidence exercised a target with more than 100 grants across explicit pages.

The Dashboard stores staff/grant state in memory only. Focused browser proof checks
localStorage, sessionStorage, IndexedDB and Cache Storage for staff and Location
sentinels. No target grant IDs were added to audit metadata or denial messages.

## MFA, audit and client concurrency

The existing MFA ceremony was Company-Admin-account-only, so T05-B narrowly extends
ceremony eligibility to a User with an active `LOCATION_MANAGER` membership in an
active Organization. It reuses the same TOTP factor storage, recovery codes,
StaffAuthSession assurance, server clock and freshness limits. Supervisor/Employee
eligibility is unchanged. MFA eligibility alone grants no Company Admin or unrelated
Management capability. LM role/status/grant commands remain `SENSITIVE`.

Existing audit event families remain unchanged. A changed command writes one atomic
event in the mutation transaction; an authorized desired-state no-op writes none.
Grant audit metadata uses bounded counts/version rather than raw hidden grant IDs.

The Dashboard reuses the existing generation-fenced read/mutation infrastructure.
T05-B also deduplicates the exact same in-flight authoritative read across React
development Strict Mode remounts. The dedupe key still contains read revision and,
for protected Administration reads, identity generation, session generation,
selection revision and selected authority/scope. Focused browser races cover
Organization A->B->A, target switching, late grant success/failure, MFA callback
after target change and conflict reconciliation. The final focused browser command
completed with exit code 0 after the duplicate-directory-read defect was fixed.

## Dashboard freeze and visual evidence

The existing Employees table, drawer, Administration shell, shared styles, badges,
spacing and typography are reused. Intentional T05-B additions are LM access to the
Employees tab, Employee/Supervisor-only LM role controls, human-readable paginated
grant rows, and the bounded Location assignment dialog. LM still enters the Shifts
tab by default; the original Shifts subtitle and Shifts rendering remain intact.
No shell/sidebar/topbar, staff reference CSS or StaffShiftDrawer file changed.

Physical before/after visual capture is **VISUAL ENVIRONMENT BLOCKED**. The one
permitted baseline attempt used a separate checkout at the required starting SHA,
but its Next development server could not resolve the repository contract package's
compiled `.js` exports (for example `./api-errors.js` and `./check-in.js`). The test
therefore failed before the Sign-in surface was available. Per closure instruction,
the baseline server was stopped and the visual attempt was not retried. This is not
recorded as a visual PASS. Code-level hostile freeze review found no unauthorized
Shifts/shell/style change.

## Focused evidence and skipped gates

Real PostgreSQL evidence already completed before closure-only mode:

- migration 049 -> 050 / DB authority proof: 4/4 passed;
- focused API authority + MFA/grant paging proof: 8/8 passed;
- deterministic race coverage includes actor grant revoke, target mixed/zero grant,
  conflicting expectedVersion commands and Location deactivation versus a waiting
  LM command.

Final bounded closure evidence:

- `git diff --check`: PASS;
- `pnpm architecture:check`: PASS with unchanged grandfathered-file warnings only;
- contracts, API, Dashboard and database package typechecks: PASS;
- `pnpm --filter @valet/database prisma:validate`: PASS;
- `pnpm --filter @valet/contracts exec vitest run src/staff-management.test.ts`:
  8/8 passed;
- changed/new T05-B ESLint: PASS;
- changed/new T05-B Prettier check: PASS;
- focused T05-A regressions + T05-B Dashboard browser specs: final command exit 0.

The non-race API test timeout added during development was removed. The dedicated
PostgreSQL race file retains the repository's existing 30-second race-test bound;
its synchronization and lock/CAS assertions were not weakened.

Intentionally skipped in closure: root typecheck/lint/format, full API PostgreSQL,
full database PostgreSQL, full Dashboard E2E, root/full production build and all
unrelated suites. These skipped gates are not marked PASS. No timeout/harness hang
is treated as a product PASS.

## Scope and structure closure

Every changed/new authored TS/TSX/MJS file is at or below 300 physical lines; the
largest focused browser race file is 299 lines. No architecture-baseline allowance
was changed. No previously applied migration changed; 050 is the only new migration.
No Create Employee, invitation, onboarding, activation, Shift History, Force End,
Force Start, payroll, scheduling or Live Operations behavior was implemented.
