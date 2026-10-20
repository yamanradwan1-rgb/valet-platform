# Issue #300 — Vehicle-filter Search pagination: final source disposition

**Date:** 2026-10-20

**Source boundary reviewed:** `21a213348bd5e4f13fa988237dc0a536fb692518`
**Classification:** **P1 bounded functionality gap; NOT RESOLVED.** No confirmed
authorization bypass or leaked historical association. Do not label U03/G1,
U05-R07, or full #300 product acceptance PASS because CI is green.

## Three distinct behaviors — not one generic cursor failure

1. **Filters changed while reusing a signed cursor:** the recomputed HMAC
   filter digest differs, so `decodeInvestigationCursor` refuses the token
   with a validation error (**HTTP 400**). This is a *correct* denial, not the
   multi-page defect. The exact staff session, role, Organization, Location,
   purpose, Location Incident policy, lifetime and normalized filters are
   bound, and current authorization/MFA must be rechecked independently.
2. **Unchanged current vehicle filter, more than one page:** for a CA/LM with
   a valid scoped query whose current `make`, `model`, `plate` or
   `plateCountry` matches **26 sessions with limit 25**, the service returns
   **HTTP 503 `AUDIT_INVESTIGATION_SNAPSHOT_UNAVAILABLE`** rather than issue
   page one with an unsafe `nextCursor`. No concurrent mutation or malformed
   cursor is needed to reproduce. With 25 or fewer matching sessions it can
   return a current-label first page and `nextCursor: null`. Thus this is a
   **real supported multi-page workflow limitation**, not a claim of complete
   vehicle-filter pagination.
3. **Unproven indirect historical Audit cohort:** a *different* fail-closed
   check applies to keyset continuations where a NULL-direct
   Task/Incident/Vehicle/PARKED relation lacks safe historical parent
   provenance. That guard must remain independent; fixing vehicle labels
   must not make its response `200` or synthesize a Session association.

## Why birth-XID and signed filters do not solve case 2

- `apps/api/src/modules/management/audit-investigation/search/search-page-query.ts:100-115`
  uses the **current** `vehicles.make/model/plate_country/plate_number_normalized`
  for every page's SQL predicate; historical event and Session
  `pagination_birth_xid` only fence creation, not mutations to Vehicle.
- `search/audit-investigation-search.service.ts:72-95` detects
  `mutableVehicleFilter && hasMore` or an attempted continuation and returns
  503 before cursor issuance. Supported non-vehicle keyset pagination continues
  to enforce `requireU05StableIndirectCohort`.
- `audit-investigation-cursor.ts:77-157` signs *filter parameters*, not
  the set of qualifying Vehicle/Session IDs or a mutable-identity epoch.
  HMAC integrity cannot turn present-day labels into past-day snapshots.
- `apps/api/src/common/database/postgres-transaction.ts:36-40` uses a
  normal `BEGIN` and per-request COMMIT (default READ COMMITTED). A separate
  check of `vehicles.updated_at`, a simple maximum date/UUID or a
  separate unlocked hash query is not a reliable, concurrency-safe
  cross-request revision fence; direct writes, initially nonmatching rows,
  deletions, transaction interleaving and time-ordering must be considered.
- U03 in `docs/plans/ISSUE_300_AUDIT_INVESTIGATION_MASTER_PLAN.md:343-353`
  explicitly forbids pretending that the U05 event-insertion snapshot freezes
  **CURRENT** vehicle-filter membership; only a tested revision/restart
  mechanism or an explicitly truthful weaker live-current contract qualifies.

## Narrowest safe forward implementation and resource dependency

Do **not** disable the production feature, remove the 503, weaken MFA,
skip signed cursors or change historical witness SQL. A bounded *future*
revision/restart solution requires:

1. A transactionally updated, **Organization-scoped** monotonically
   incremented Vehicle-filter membership epoch, enforced for *all* relevant
   insert/update/delete paths (including vehicles that previously did **not**
   match); an atomic DB trigger/lock contract, restricted runtime DML/ACL and
   an append-only migration. Never derive the epoch from wall-clock
   `updated_at` alone.
2. Capture the epoch under a row lock held through the first-page
   filter-and-keyset query; bind it into a versioned HMAC cursor. On each next
   page, reauthorize the exact CA/LM session, lock/re-read that same
   Organization epoch through the query, and reject/restart if it changed.
   Keep U05 witness insertion-XID, original signed snapshot, indirect cohort
   veto and current Incident/Location policy binding unchanged. Never reuse a
   cursor after epoch mismatch.
3. Prove two-connection races: matching→nonmatching and nonmatching→matching,
   update between epoch-read and page SELECT, write lock/rollback/timeout,
   overlapping tenants, expired/revoked Staff sessions, filter edits, cursor
   tampering, inactive Location, legacy rows and PostgreSQL role boundaries.
   Measure extra lock/scan cost before release.

**Smallest external dependency:** a task-owned disposable PostgreSQL 17
instance with isolated admin/migration and runtime roles, enough resources for
concurrent writers and readers, and a separately reviewed *forward-only*
epoch migration/deployment admission. The general CI #514 PostgreSQL PASS
tests the **existing** 94–96 schema; it did **not** execute this proposed
epoch design. The Owner already approved U03's consistency goal, so this
states an engineering prerequisite rather than inventing a new UI/product
decision.

**Approved but strictly weaker alternative (U03):** the master plan also
permits explicitly disclosed **live-current** matching across pages, with
restarts wherever an identity change is detectable. This cannot claim a
complete immutable result set: a previously nonmatching Vehicle can become a
match **behind** a signed keyset boundary and be silently missed. The current
dashboard notice says that *labels* are CURRENT; it does not adequately
disclose that the *matching set itself* may change, and its post-read
current-plate comparison does not use the SQL normalization/exact-equality
rule. Therefore removing the 503 alone is not production-safe. An in-scope
code-only alternative first needs accurately aligned API/UX semantics,
matching-set disclosure, restart on observable mismatch, and real controlled
mutation tests, without modifying Concept A/UI-M1 layout or relaxing U05.

## Verification and decision

Source-only focused execution on this exact source: `pnpm --filter
@valet/api exec vitest run --config vitest.config.mjs --project
api-non-postgres test/issue300-search/search-query.test.ts
test/issue300-security/investigation-cursor.test.ts
test/issue300-production-safe-cohort.test.ts
test/issue300-production-route-registration.test.ts`:
**31/31 PASS in 4 files**. Existing test cases verify overfull
make/model/plate/country refusal, safe first-page response, HMAC normalized
filter/session/Location/Incident-policy mismatch and production-mode Nest
registration with **mocked** Staff/database services. Those are not real MFA,
dynamic DB identity race or historical acceptance results.

**Decision for PR #307:** keep the source intact and the narrow fail-closed
behavior truthful. #302/#303 fixes and original Android evidence remain
unchanged. The fully usable multi-page current-vehicle Search obligation
remains **P1 OPEN**; do not claim that #300 is fully functionally accepted
or ready for unconditional production merge solely because CI #514 passed.
The Owner signing exception remains **NOT CRYPTOGRAPHICALLY VERIFIED**;
original 79 rows stay 57 BLOCKED and 22 NOT RUN.
