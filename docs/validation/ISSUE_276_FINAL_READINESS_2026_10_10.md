# #276 — Live Operations historical staff attribution: final technical review

Date: 2026-10-10. **Engineering checkpoint: PASS on scoped code and tests.**
**Release/merge gate: conditional; U-004 Owner-approved in chat on
2026-10-10, but database rollout and commit/merge are not authorized.**
This document supersedes the earlier P1 performance disposition in
`ISSUE_276_DENSE100_HTTP_STRESS_2026_10_10.md` while preserving that original
failure evidence. No production connection, commit, push, PR, merge or deploy.

## 1. Protected worktree, isolation and decision contracts

- Protected Windows WIP: `D:\kndoom\valet-platform\tmp\issue-276-worktree`,
  `fix/issue-276-live-operations-staff-history`, HEAD `6545d6f0`.
  Main is `698bcb60`; all prior uncommitted work retained.
- All test DDL, setup and drop operations targeted **only** fresh, individually
  owned child DBs on the verified isolated PostgreSQL 17.11 cluster
  `127.0.0.1:55449`; exact data directory pinned in HTTP test setup.
  The original DEC-103 source fixture and unverified local `5432` were not
  changed; no Production exists for this development project.
- DEC-102 fail-closed historical evidence and read authorization and DEC-103
  discoverability rules remain authoritative. A page limit is NOT a cap on
  historical Audit/Task evidence.

## 2. Root cause of the intermittent Dense100 HTTP 503

An indexed 100-session/4,000-Audit NestJS HTTP benchmark reproduced a
`503 INTERNAL_ERROR` at 16 requests from the **same** bearer: one of 16
failed. The original runtime pool snapshot showed `pool.max=4`, 2-second
acquisition budget, nonzero acquisition failures, and PostgreSQL active
Lock waiters; Audit sequential scans had already been eliminated.

Beyond the staff-management Organization SHARED lock, the reader had
inadvertently retained writer-intent locks via common security helpers:

1. `staff-user-security` **EXCLUSIVE** advisory per User;
2. `staff_auth_sessions FOR UPDATE` for the same Staff session;
3. `organization_memberships FOR UPDATE` for current viewer;
4. for CA, `FOR UPDATE OF session, staff_user` in MFA assurance.

As a result concurrent *reads* blocked one another and occupied the four
limited runtime pool leases while other HTTP requests awaited acquisition.
The 503 is a real database-admission/latency failure, not authorization
loss, missing indexes or permission to increase global runtime budgets.

### Focused repair (no change to other readers or writer contracts)

Only `apps/api/src/modules/dashboard/live-history-read-authorization.ts`
uses a dedicated purpose-specific **read** lock sequence:

`staff-user-security SHARED` -> `Staff session FOR SHARE` ->
CA `session + staff_user FOR SHARE` and current MFA factor `FOR SHARE`
when applicable -> `staff-management-org SHARED` ->
existing `shift_presence_lock_management_entitlement` SECURITY DEFINER
session+subscription SHARE -> current viewer membership/Organization/Location
and LM grant `FOR SHARE` -> exact bounded Live page -> complete
Task/Dispatch/Audit proof under a shared statement snapshot -> COMMIT.

All native refresh/logout/role/grant/Location/MFA mutation paths keep their
required conflicting EXCLUSIVE advisory and/or FOR UPDATE row locks.
The shared reader cannot proceed across a mutation that is already
committing, and a mutation cannot pass an already validated read until it
releases those locks. The generic
`lockAndRecheckStaffSessionContext()` and generic MFA mutation/security
helpers remain untouched.

Runtime keeps its normal strict pool, lock, statement and transaction
budgets. **No global pool increase, timeout widening, privileged table
grant, new index or schema migration was used for this repair.**

## 3. Reverified tests

| Evidence | Last verified result |
|---|---|
| #276 scoped native Nest HTTP + modeled isolated PG concurrency combined | **26/26 PASS**, 3 test files |
| Real native HTTP writer operations incl login, refresh, logout, CA MFA, grant/revoke, role/deactivation, Location lifecycle and real read-first revoker | **9/9 PASS** |
| PostgreSQL writer-first/reader-first simulated lock races, including MFA retirement/Organization/subscription/session/grants | **16/16 PASS** |
| Direct current-authority unit assertions, including shared user/session/membership and CA MFA/factor locking + denied-scope MFA oracle | **7/7 PASS** |
| Dense100 100 sessions / 4,000 canonical Tasks, Dispatches and Audits with indexed complete PROVEN projection | **PASS** |
| 16 concurrent **same-bearer LM HTTP** Dense100 reads | **16/16 HTTP 200**, group 1.93s |
| 16 concurrent **same-bearer CA HTTP** Dense100 reads after real MFA enrollment/step-up | **16/16 HTTP 200**, group 1.53s |
| Dense100 anomalous wrong-Location Task-ref + unrelated foreign Organization Audit | **99 PROVEN, 1 UNVERIFIABLE parkedBy=null**, no tenant contamination |
| Mounted Chromium Live/Queue scope, drawer/focus, EN/AR Light/Dark and responsive matrix | **6/6 PASS** |
| Dashboard attribution + DTO transport Vitest | **6/6 PASS** |
| API, Dashboard, Contracts TypeScript; scoped API ESLint; diff whitespace; scoped files <=300 physical lines | **PASS** |
| Independent read-only security/lock-order review (worker-4) | **PASS, no P0/P1 identified in reviewed paths** |

The passing 26/26 combined native PG test reproduced **zero HTTP 503**,
with runtime pool snapshot rejected=0, failures=0,
lockTimeouts=0, statementTimeouts=0, transactionTimeouts=0.
Two consecutive combined 26/26 runs passed: one covering LM at 16, a later
one also covering 16 concurrent CA readers after the focused MFA patch.

**Limits:** These are local synthetic warm-cache bursts, *not* a statistically
measured 95th percentile, a guaranteed service level or a Production load
test. Under very low Windows free RAM (~1.2 GiB of 16 GiB, with a large
VirtualBox VM and Chromium browser processes running), an intermediate
pre-final isolated 503 also occurred, and a 200/503 tail varied significantly.
The change demonstrably removes **self-inflicted same-bearer reader
serialization**, but external host saturation or extreme Audit cardinality
can still produce legitimate admission errors. No model of arbitrary
unbounded history can guarantee constant processing cost.

### Actual browser visual evidence and constraints

Twelve synthetic screenshots in
`tmp/issue276-u004-evidence/`:
EN/AR × Light/Dark × desktop 1440×900 / narrow 480×900 / a
720×450 CSS-layout-viewport **proxy for 200% browser zoom**.
The 6-test Playwright matrix passed with no Live drawer DOM nesting errors,
the six frozen column headers, long historical names and focus restoration.
Chromium headless Ctrl+Plus did **not** modify browser zoom, so 720×450 is
**only a layout/reflow approximation, not actual UI zoom**. U-004 retains
the explicit **Owner visual approval** gate. The existing Queue's separate
`<div>` under `<tbody>` hydration warning was observed; do not claim
the separate preexisting Queue issue is fixed.

## 4. Security review details and remaining lifecycle qualification

The independent reviewer inspected actual source lock order and found no
P0/P1 deadlock or new MFA/tenant oracle:

- Refresh obtains EXCLUSIVE `staff-user-security` first and then locks
  refresh/session rows. Logout takes refresh/session UPDATE only and does not
  invert the Live read lock order.
- MFA enrollment/recovery/step-up takes session+user UPDATE before factor
  mutation. Live CA read takes the same resources SHARED, plus current
  factor SHARE, preventing factor retirement TOCTOU without serializing
  independent readers. Deferred CA MFA errors are released only *after*
  locked current authority is proven.
- Staff management mutation paths use EXCLUSIVE org advisory before role,
  grant and status writes. Current Organization/Location/entitlement rows
  stay locked across proof and release after COMMIT.
- Existing SECURITY DEFINER entitlement helper has fixed search_path,
  current exact Staff session + management role + subscription SHARE check,
  with runtime-only EXECUTE grant and PUBLIC denied. Do not remove or
  semantically alter this helper without coordinating #276.

**Remaining integration evidence qualification:** Native organization
subscription/lifecycle toggles are not currently exposed by a supported
production management writer endpoint in the inspected API source. Their
read/write races are tested through actual PostgreSQL writer SQL using
the accepted advisory/row lock protocol (16-case suite), **not** as
nonexistent HTTP product commands. Revalidate if future writer APIs arrive.
No extra migration authorization was inferred.

## 5. Merge/release decision and explicit remaining owner gates

**Issue #276 code-first functionality, security lock semantics and focused
test matrix: PASS / ready for final Owner inspection.**

**Owner U-004 approval recorded 2026-10-10:** the Owner responded
"اعتمد" to the request to approve the current interface and its 12
mounted screenshots. This is acceptance of the presented visual design;
headless Chromium provided a 200%-layout proxy, not real browser zoom.
It is not authorization for schema DDL, commit, push or merge.

**Do not merge or deploy yet** until the remaining conditions:

1. ~~Owner U-004 screenshot approval~~ — **approved 2026-10-10**. An
   actual 200% browser zoom test remains unverified but the Owner accepted
   the visual samples with the proxy limitation disclosed.
2. **COMPLETED for this Windows development database on 2026-10-10.**
   After the Owner's subsequent approval, the configured `DATABASE_URL` and
   `MIGRATION_DATABASE_URL` target `127.0.0.1:5432/valet` was positively
   verified (PostgreSQL 17.11, expected data directory). A full custom-format
   pre-DDL backup was archived and checked with `pg_restore --list`; the
   two accepted DEC-103 indexes were created independently using
   `CREATE INDEX CONCURRENTLY`, analyzed and confirmed valid/ready.
   `valet_runtime` read access also passed. See
   [ISSUE_276_DEC103_WINDOWS_DEV_APPLIED_2026_10_10.md](ISSUE_276_DEC103_WINDOWS_DEV_APPLIED_2026_10_10.md).
   **This only clears the configured Windows development database gate.**
   Any other database still needs an independently verified migration plan
   and rollback, and a version-controlled delivery mechanism remains to
   be finalized before general release.
3. Reviews the protected dirty WIP as a whole and explicitly authorizes
   commit/merge. Nothing in this record authorizes unilateral PR, push,
   migration, deployment or issue closure.

The **full repository** `pnpm architecture:check` still fails for two
**unrelated existing files**:
`packages/database/src/guest-browser-session-context-switch-failures.integration.test.ts`
(328 physical lines) and
`packages/employee-client/src/employee-shift-presence-local-provenance.test.ts`
(portable Employee client references `window`). #276 scoped source and
tests are below the 300-line per-file limit; avoid scope-creeping these
unrelated failures into #276 without a separate owner decision.

## 6. Final integration-handoff checkpoint (2026-10-10)

The Owner explicitly requested completing the repeatable DEC-103 delivery,
reviewing the full protected #276 WIP and preparing fast-forward integration
without a PR. A new, reviewed and version-controlled delivery path is ready:

- `packages/database/scripts/dec103-online-index-rollout.sql` is the
  **operator-authorized, separate concurrent rollout** for a nonempty database,
  with fail-stop enabled, strict index-definition pre/postflight and rollback
  instructions. No blanket Prisma migrate was run on real Windows 5432,
  where unrelated Guest Push migration 078 is still pending.
- Migration `079` is **one transactional DO** that supports the actual
  Prisma/CI greenfield bootstrap with safe ordinary CREATE INDEX only after
  checking the Audit table is empty, acquiring SHARE ROW EXCLUSIVE and
  checking again under READ COMMITTED. Populated databases missing either
  index fail closed before a blocking build; wrong/invalid existing indexes
  fail closed. The independent reviewer found no P0/P1 in the revised path.
- Isolated disposable PostgreSQL tests covered fresh creation, existing
  indexes, missing index, wrong-name definition and migration SQL executed
  as one `pg.Client.query`. The real API harness also successfully deployed
  all migrations to greenfield child DBs through 079, and completed
  **26/26** focused native HTTP/Dense100/authority races on the final
  pre-handoff run (LM and CA 16-request bursts).
- Lab-only test suites now require explicit Windows 55449 configuration and
  verify the physical PostgreSQL directory; they skip rather than touch
  Linux GitHub Actions' unrelated 5432 service. No test source contains an
  embedded database password. Local API typecheck, targeted ESLint,
  standalone non-PG 42/42, Contracts 5/5 and Dashboard 6/6 passed.
- All 49 changed/new #276 files were staged explicitly for review, with
  `git diff --cached --check` PASS and generated
  `apps/dashboard/next-env.d.ts` excluded. No commit, push or merge occurred
  at this checkpoint. The dirty main checkout, unrelated worktrees and
  untracked docs/plans remain untouched.

**Remaining repository-wide gate:** `pnpm architecture:check` still exits
nonzero for the two pre-existing, unrelated source files listed above.
The broad schema integration suite reached **418/421**, with two historic
hardcoded migration-list assertions (not updated beyond 057 despite 078 on
main) and one pre-existing Audit SQL privilege expectation (`42501` vs
`23502`). Those tests and files were not modified under #276. Therefore
the mandatory whole-repository completion gate is **not green** even though
scoped #276 code/security/migration validation passed. This is a documented
release/integration exception that the Owner must explicitly resolve or
authorize; do not represent the work as merged or the repository as fully
green.
