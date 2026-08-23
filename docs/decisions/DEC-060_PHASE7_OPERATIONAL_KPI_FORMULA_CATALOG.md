# DEC-060 — Phase 7 Operational KPI Formula Catalog

Status: Accepted
Date: 2026-08-22
Task: VAL-009D — Core Operational Analytics / KPI Foundation
Issue: #183

## Context

Phase 7 gate G5 required an accepted formula catalog before any aggregation
could ship. This decision records the Project Owner-approved catalog for
VAL-009D. All metrics compute from committed authoritative rows only, are
read-only, write no AuditEvent on read, and are scoped to one exact Location
through the VAL-009A Dashboard authorization primitive (ACTIVE User, ACTIVE
`LOCATION_MANAGER` membership, ACTIVE Organization, ACTIVE Location, explicit
`membership_location_access`; no Shift required). Company-wide or cross-Location
rollups remain MFA-gated and are not part of this catalog.

## Period contract

Period routes require `from=YYYY-MM-DD` and `to=YYYY-MM-DD`:

- both required; strict calendar-date shape;
- the target Location's persisted IANA timezone is authoritative; no
  caller-supplied timezone is accepted;
- local dates are inclusive; the SQL UTC interval is
  `[from local midnight, day-after-to local midnight)` computed with PostgreSQL
  `AT TIME ZONE` so DST transitions are correct;
- `from <= to`; inclusive range maximum is 31 local calendar days;
- invalid date, wrong order, or range above 31 days fails with
  `REQUEST_INVALID`;
- responses echo `locationId`, `timezone`, `from`, `to`.

The persisted timezone is read only after authorization succeeds, never as an
existence oracle.

## Duration metrics

For every duration metric only valid non-negative complete intervals count
(`end >= start`, both present). Cohort inclusion uses the metric's end
timestamp inside the period window.

| Metric | Formula | Cohort timestamp | Naming |
|---|---|---|---|
| Check-in Time | `checking_in_completed_at - created_at` | `checking_in_completed_at` | official |
| Parking Time | `parked_at - parking_started_at` | `parked_at` | official |
| Retrieval Wait | `ready_at - retrieval_requested_at` | `ready_at` | OFFICIAL — the only metric allowed to carry this name |
| Retrieval Start Latency | `retrieval_started_at - retrieval_requested_at` | `retrieval_started_at` | explicitly AUXILIARY; must never be labeled or aliased as Retrieval Wait |
| Handoff Time | `completed_at - ready_at` | `completed_at` | official |

Output per metric: `sampleCount` and `averageSeconds`. With zero samples,
`averageSeconds = null`; a zero average is never fabricated for an empty cohort.
`averageSeconds` is computed from epoch seconds and presented as a decimal
string with exactly 3 fractional digits, rounded half-away-from-zero at response
presentation only; no float arithmetic persists or accumulates values.

## Cars handled per local day

Count sessions whose `completed_at` falls in each local calendar day of the
period (`completed_at AT TIME ZONE location-tz` bucketing). One completed
session equals one handled car. Every day from `from` through `to` is returned,
including legitimate zero-count days. This is deliberately not
"Cars per Employee".

## Active queue snapshot

Point-in-time summary with no period input: `RetrievalRequest.status IN
('OPEN','ACCEPTED')` at the exact Location. Returns `depth` and
`oldestAgeSeconds` measured against database server time (`clock_timestamp()`),
never a client clock. Empty queue returns `oldestAgeSeconds = null`.

## Financial period metrics

All money uses exact decimal strings grouped by the immutable Payment currency;
currencies are never combined; no floating-point arithmetic.

1. **Paid collection cohort** — Payment rows with `status = 'PAID'` whose
   `paid_at` is inside the period, per currency:
   `paidPaymentCount`, `collectedAmountTotal = SUM(amount_paid)`,
   `tipAmountTotal = SUM(tip_amount)`.
2. **Digital Payment Rate** — within the paid cohort restricted to
   `collection_method IN ('CASH','DIGITAL')` (NONE excluded): numerator =
   DIGITAL count, denominator = CASH + DIGITAL count, percentage =
   numerator / denominator × 100 presented with 2 fractional digits
   (half-away-from-zero). Denominator 0 → `percentage = null`.
   Numerator 0 with positive denominator → legitimate `"0.00"`.
3. **Succeeded refunds** — Refund rows with `status = 'SUCCEEDED'` whose
   `completed_at` is inside the period, joined to their Payment for exact
   Location scope and immutable currency, per currency:
   `succeededRefundAmountTotal = SUM(refund.amount)`.
4. **Validation Rate** — denominator: sessions with `completed_at` inside the
   period that have the canonical single Payment row; numerator: that Payment
   has a current Validation (`is_current = true`,
   `mode IN ('FULL','PARTIAL')`). Validation is never inferred from amount;
   FULL/PARTIAL counts even when amount = 0. Superseded/non-current rows never
   count. Percentage follows the same nullable/zero rules as the digital rate.
   Per payment currency also `currentValidationAmountTotal` = SUM of current
   FULL/PARTIAL Validation amounts over the same completed-session cohort.
5. **Cash reconciliation** — Shift rows with `status = 'ENDED'`, `ended_at`
   inside the period, and immutable close snapshots present
   (`cash_expected IS NOT NULL`), grouped by `cash_currency`:
   `cashExpectedTotal`, `cashReportedTotal`, `cashVarianceTotal` with signed
   variance (no absolute value).

## Incident metrics

Cohort: `incident.created_at` inside the period at the exact Location.
Returns `incidentCount`, counts by persisted severity, counts by raw persisted
type string (no normalization), and `incidentsPer1000` =
`incidentCount / completedSessionsInPeriod × 1000` where the denominator is the
count of sessions completed in the same period; denominator 0 → value null.
Numerator and denominator are echoed alongside the value. Value is presented
with 3 fractional digits, half-away-from-zero.

## Explicitly absent metrics

SLA compliance (G4 open); Cars per Employee (no accepted immutable historical
per-employee attribution persistence); Key Exceptions per 1000 (no accepted
controlled definition of "key exception"; normal custody events are not
exceptions); Guest Rating and Repeat Guest (persistence/consent representation
absent); employee adoption/friction; manager-reliance measures; predictive or
demand analytics; company-wide/cross-Location rollups pre-MFA. These remain
structurally absent from VAL-009D schemas and responses — not zero-filled and
not null placeholders.

## Consequences

VAL-009D can implement bounded, index-friendly aggregates without inventing
facts, adding persistence, caching layers, or report/export behavior. Any new
metric family requires its own focused decision amendment. The optional
migration-30 indexes-only authorization from Issue #183 remains conditional on
EXPLAIN evidence; absent demonstrated need, no migration ships.
