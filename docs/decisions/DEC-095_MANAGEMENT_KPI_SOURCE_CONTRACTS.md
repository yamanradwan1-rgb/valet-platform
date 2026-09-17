# DEC-095 — Management KPI Source Contracts

Status: Accepted
Date: 2026-09-18
Owner: VAYLET product owner

## Context

DEC-090 defines Management SLA Compliance, Cars per Active Employee, Cars
Handed Off by Employee, and controlled Key Exceptions, but intentionally leaves
historical SLA applicability, the exact work-evidence cohort, and the controlled
Key Exception source open until authoritative persistence can support them.

MGT-BE-10 must close those source contracts without changing DEC-060 analytics
semantics or inventing operational history.

## Decision

### 1. Location SLA target

The SLA target is a typed Location setting measured in integer seconds. Allowed
values are 30 through 3600 inclusive. There is no default target. A Location
without a configured target has no SLA coverage.

The historical applicability anchor is the authoritative
`ValetSession.retrieval_requested_at` transition. When a ValetSession enters the
requested retrieval state and that transition commits, the currently effective
Location SLA target is snapshotted onto that retrieval/session fact in the same
authoritative transaction.

The snapshot is historical truth:

- a request starting with target 300 keeps 300 forever;
- a later target change to 420 affects only later retrieval requests;
- a request started while no target exists snapshots NULL and remains uncovered;
- later configuration never backfills or rewrites an existing request snapshot;
- old visits are not backfilled;
- if an allowed cancellation permits a later new retrieval request, the new
  authoritative request transition snapshots the target current at that later
  transition rather than preserving an obsolete prior-attempt value.

No client-selected SLA timestamp exists.

### 2. SLA setting authority and concurrency

SLA target mutation is Company Admin Management authority only. It requires the
current exact Staff session, active `ORG_ADMIN` authority in the same
Organization, the exact target Location, the existing Management settings
capability, and SENSITIVE exact-session MFA freshness.

Location Manager mutation authority is not extended to this setting.

The request is strict and typed, uses optimistic concurrency, and follows the
existing Management settings mutation discipline:

- a real change advances the authoritative CAS/version fact and appends one
  atomic typed Management AuditEvent;
- an exact desired-state retry converges to current state with no new audit;
- a stale differing request conflicts without mutation or audit;
- ordinary runtime receives no generic UPDATE authority over configuration
  history.

Target change and retrieval-request snapshotting share one deterministic
serialization boundary. If the retrieval request wins first, it snapshots the
old target. If the target change commits first, the later retrieval request
snapshots the new target. Partial or timing-dependent mixed state is forbidden.

### 3. SLA Compliance

SLA duration remains exactly:

```text
retrieval_requested_at -> ready_at
```

A covered qualifying sample requires the exact authorized Organization and
Location, non-null request and READY timestamps, `ready_at >=
retrieval_requested_at`, and a non-null snapshotted SLA target.

A sample meets target when:

```text
duration <= snapshotted target
```

Equality is compliant.

SLA Compliance is:

```text
numerator   = covered qualifying retrievals meeting target
denominator = all covered qualifying retrievals
percentage  = numerator / denominator * 100
```

Aggregation uses exact PostgreSQL numeric arithmetic. A zero denominator
produces `percentage = null`, never zero. The response exposes at least
`numerator`, `denominator`, `percentage`, `missingTargetCount`, and
`invalidOrMissingIntervalCount`.

### 4. Controlled Key Exceptions

The authoritative Key Exception source is the existing Incident row. The
controlled catalog is exactly:

- `KEY_MISSING`
- `WRONG_KEY`
- `KEY_DAMAGED`
- `KEY_LOCKED_INSIDE`

No other Incident type is a Key Exception. `Incident.created_at` is the
authoritative occurrence timestamp, and tenant/Location scope comes from the
Incident's persisted Organization/Location relation. Each qualifying Incident
row counts once.

Normal KeyCustodyEvent movements are never Key Exceptions:

- `SLOT_ASSIGNED`
- `CHECKED_OUT`
- `RETURNED_TO_SLOT`
- `SLOT_CLEARED`
- `RELEASED`

No exception may be inferred from movement volume, repeated movement,
reassignment, Task state, slot duration, missing current slot, retrieval
duration, arbitrary Incident text, or Incident severity alone. MGT-BE-10 does
not create a second KeyException table and does not add a per-1000 rate without
separate Accepted authority.

### 5. Cars per Active Employee work evidence

“Actually worked” means a distinct OrganizationMembership with at least one
immutable actor-at-time operational action at the exact Location during the
requested Location-local period.

Approved evidence is exactly:

- `ValetSession.checked_in_by_membership_id` at authoritative session creation;
- `ValetSession.check_in_condition_completed_by_membership_id` at
  `check_in_condition_completed_at`;
- `ValetSession.completed_by_membership_id` at `completed_at`;
- `KeyCustodyEvent.actor_membership_id` at `occurred_at`;
- `ConditionNote.recorded_by_membership_id` at `created_at`;
- `VehiclePhoto.captured_by_membership_id` at `created_at`;
- `HandoffVerification.verified_by_membership_id` at `verified_at`;
- `DispatchEvent.actor_membership_id` at `occurred_at` only for event types
  `ACCEPTED`, `DECLINED`, `IN_PROGRESS`, and `COMPLETED`.

`DispatchEvent` actor rows for `QUEUED`, `ASSIGNED`, and `REASSIGNED` are not
work evidence. Neither staff-directory membership, Shift presence, current Task
assignee, nor assignment/reassignment target identity qualifies by itself.

Historical evidence does not join to today's mutable membership role/status to
decide qualification. The action's accepted write-time command authority is the
historical proof, so later role changes, disablement, or membership status
changes do not erase prior work.

For the KPI:

```text
numerator   = completed ValetSessions in the requested Location-local period
denominator = COUNT(DISTINCT membership_id) from the approved evidence union
value       = numerator / denominator
```

With denominator zero, `value = null`. Numerator and denominator are explicit.
This metric is not payroll, compensation, performance scoring, or employee
ranking.

### 6. Cars Handed Off by Employee

The authoritative source remains `ValetSession.completed_by_membership_id`,
with cohort timestamp `ValetSession.completed_at`. Current Task assignee,
checked-in actor, key actor, Shift owner, and latest DispatchEvent actor do not
substitute for the final completing membership.

Null completion actor remains unattributed and is exposed through truthful
missing-attribution coverage. Later role/status changes do not rewrite history.

### 7. Guest Rating analytics

`guest_ratings` from MGT-BE-09 is the only authoritative rating source.
Location-period visit cohort membership is determined by the completed
ValetSession's `completed_at`; `rated_at` is submission time only. A late rating
does not move a visit into a later analytics visit period. Aggregates must expose
sample/coverage truthfully and contain no raw Guest bearer, contact, or Customer
identity.

Returning Contact aggregation is not introduced by this decision.

## Consequences

DEC-095 completes the source-contract gaps intentionally left open by DEC-090.
MGT-BE-10 may add the minimum typed persistence needed for current SLA target
configuration and immutable per-retrieval SLA snapshots, while Key Exceptions
reuse Incident persistence and Cars per Active Employee derives only from the
explicit approved actor-at-time evidence union.

DEC-060 metric semantics remain unchanged. All analytics remain exact
Organization/Location scoped, Location-local for period boundaries, bounded,
read-only, and free of analytics-read AuditEvents.

## Security and privacy considerations

SLA target mutation remains SENSITIVE Company Admin Management authority with
current-state revalidation, MFA, optimistic concurrency, narrow database
authority, and atomic safe audit. Analytics expose no secrets, raw contact,
raw GPS, unrestricted staff directory data, payroll interpretation, or employee
score.

## Supersedes/amends references

Amends and completes the source contracts intentionally deferred by DEC-090. It
does not rewrite DEC-090 and does not alter DEC-060's previously accepted metric
formulas.

## Affected docs/code

`docs/01_PRODUCT_SCOPE.md`, `docs/02_DOMAIN_MODEL.md`,
`docs/03_DATABASE_SCHEMA.md`, `docs/06_SECURITY_AND_DATA_RULES.md`,
`docs/08_DECISIONS_LOG.md`, `docs/23_MANAGEMENT_BACKEND_216_EXECUTION_PLAN.md`,
Management settings, retrieval request persistence, Dashboard analytics,
contracts, database migration/runtime privilege verification, and focused tests.
