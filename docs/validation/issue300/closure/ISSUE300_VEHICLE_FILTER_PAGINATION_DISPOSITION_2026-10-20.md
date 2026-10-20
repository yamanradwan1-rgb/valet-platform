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

**Remaining engineering and release dependency:** A task-owned isolated
PostgreSQL 17 sandbox is now available and was used for a **synthetic** race
proof below. However, the proposed *forward-only migration 97*, hardened
writer-trigger/reader-lock function, runtime role ACL, new strict signed Search
cursor version, real two-session authenticated API paging, migration upgrade
and rollback/lock admission have **not** been implemented or independently
certified. The original W16/V3 source guards expressly pin migrations 1–96;
changing this tree would invalidate prior reviewed proof and requires a
separately reviewed new migration/acceptance baseline. A synthetic schema
cannot substitute for that evidence. The Owner already approved U03's
consistency goal; this is an engineering proof dependency, not another UI
product decision.

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

### Additional authentic PostgreSQL 17.10 experiment (2026-10-20)

Created **only** in a new isolated `postgres:17-alpine` Docker container, with
192 MiB ephemeral tmpfs data, a 256 MiB process-memory limit and **no host
port published**. It had three **synthetic** Vehicle/Session/Event rows and
an immutable event `birth_xid xid8 DEFAULT pg_current_xact_id()`; it did not
connect to any VAYLET, shared, human, or production database. Each `docker
exec psql` invocation used a distinct database connection.

- Captured snapshot `S0=756:756:`. Page one of `make='Toyota'` with
  descending event time and `LIMIT 1` returned **S1 (11:00)**; S2 (12:00)
  initially had current make BMW, and S3 (10:00) Toyota.
- Between HTTP-equivalent database reads, committed `UPDATE vehicles SET
  make='Toyota'` for S2. Page two with **the same S0 birth-XID filter and
  keyset strictly before (11:00,S1)** returned **only S3**.
- A full read under the **same S0 birth filter**, using the new current make,
  correctly showed **S2, S1, S3**. Thus removing the current filter-503
  without an epoch would silently omit S2; this is an **executed PostgreSQL
  counterexample**, not a source-test conjecture. Event insertion-XID
  fencing did not freeze mutable Vehicle identity.
- Separately prototyped an **unshipped** synthetic per-Organization revision
  row, trigger and `SECURITY DEFINER ... FOR SHARE` reader. With the reader's
  transaction holding the row lock, a concurrent vehicle update timed out
  inside its trigger while attempting to bump the revision; the writer did
  **not** commit silently. A restricted proof role could call the narrowly
  granted reader, but direct epoch `UPDATE` returned `permission denied`.
  A later committed Vehicle update advanced revision **1 -> 2**, making an
  earlier revision-1 continuation invalid. This demonstrates the possible
  lock primitive, **not** a production-ready security/rollout design.

**Evidence limits:** these short SQL experiments did not migrate the real
1–96 schema, prove all VAYLET Vehicle write paths, verify Pg roles/owner
definers for migration 97, run real CA/LM MFA HTTP or cover legacy NULL
cohorts and operational lock/load latencies. Docker startup was successful
for the synthetic proof; it is no longer correct to call the absence of a
PostgreSQL engine the blocker. The outstanding gate is **validated production
integration of a new identity-revision mechanism**, with non-forgeable DB
updates, signed cursor and complete W16/V3 rebaseline.

Source-only focused execution on this exact source: `pnpm --filter
@valet/api exec vitest run --config vitest.config.mjs --project
api-non-postgres test/issue300-search/search-query.test.ts
test/issue300-security/investigation-cursor.test.ts
test/issue300-production-safe-cohort.test.ts
test/issue300-production-route-registration.test.ts`:
**31/31 PASS in 4 files** on the previously unchanged source, then **32/32
PASS in the same 4 files** after adding an isolated production-mode HTTP
transport test. This new test sends a real Nest request through the real
Search pagination guard and verifies `503` with 26 synthetic matches. Its
database result rows and Staff resolver are deliberately mocked, not a
disposable PostgreSQL-backed authenticated application request. Existing cases verify overfull
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
