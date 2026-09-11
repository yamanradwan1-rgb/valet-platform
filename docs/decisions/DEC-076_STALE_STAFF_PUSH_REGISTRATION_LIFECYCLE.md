# DEC-076 — Stale Staff Push Registration Lifecycle

Status: Accepted
Date: 2026-09-11
Owner: VAYLET product owner

## 1. Context

DEC-073 accepted the provider-neutral Staff Push registration lifecycle and the
terminal registration states `DISABLED`, `PROVIDER_INVALID`, and `SUPERSEDED`.
DEC-075 later accepted `activeRegistrationStaleDays = 30` and required MOB-020D
to stop rather than invent or misuse a terminal state if the existing lifecycle
could not truthfully represent age-only stale-endpoint maintenance.

MOB-020D implementation review reached exactly that stop condition. An ACTIVE
registration can be older than the accepted confirmation window without any
provider proof that its endpoint is invalid. `PROVIDER_INVALID` is therefore
incorrect, and `SUPERSEDED` is incorrect unless another registration actually
replaced it.

This focused decision resolves only that lifecycle gap. It supplements DEC-073
and DEC-075. All other Staff Push authority, payload, retry, retention,
provider, privacy, and fencing rules remain unchanged.

## 2. Decision

A Staff Push registration whose `last_confirmed_at` is at least 30 days old is
operationally stale and is no longer eligible for provider send.

For policy version 1, the exact stale threshold remains the DEC-075 value:

```text
activeRegistrationStaleDays = 30
```

Staleness is evaluated from database-authoritative time and persisted
`last_confirmed_at`.

At or after the threshold, an ACTIVE registration must not be treated as a
healthy send endpoint merely because its state has not yet been reconciled.
Send-time eligibility therefore requires both:

```text
state = ACTIVE
last_confirmed_at > current_database_time - 30 days
```

A stale registration produces no provider I/O for a newly rechecked delivery.
The delivery follows the existing safe `SUPPRESSED` path.

## 3. Existing terminal state selected

Trusted server maintenance may terminalize an age-stale ACTIVE registration as:

```text
state = DISABLED
terminal_reason_class = STALE_CONFIRMATION_TIMEOUT
```

This decision deliberately extends the accepted meaning of `DISABLED` to cover
one additional trusted server-maintenance reason: expiry of the accepted
endpoint-confirmation freshness window.

This does **not** mean the Staff account, StaffAuthSession, membership, Shift,
or domain authority was disabled. It means only that this stored push endpoint
binding is no longer trusted as current enough to receive attention.

No new registration enum state is introduced.

## 4. Required terminalization effects

When stale maintenance wins the row lock for an ACTIVE registration and the
stale predicate still holds, the transition must atomically:

- set registration state to `DISABLED`;
- clear the raw `provider_token`;
- set `terminal_at` from database-authoritative time;
- set `terminal_reason_class = 'STALE_CONFIRMATION_TIMEOUT'`;
- update `updated_at`;
- never change immutable registration identity or token-hash fields; and
- suppress unsent `PENDING` and `RETRY_WAIT` deliveries for that exact
  registration using the existing delivery state machine.

The maintenance path must not rewrite a currently fenced `LEASED` delivery.
If maintenance wins before that worker's send-time eligibility recheck, the
worker observes the registration as no longer eligible and suppresses without
provider I/O. If eligibility was already rechecked before the maintenance
transition, the existing DEC-073 post-check/provider TOCTOU rule applies: a
privacy-safe generic attention may still arrive, and tap/refetch remains the
canonical protection.

## 5. Concurrency with app re-confirmation

Stale maintenance and desired-state registration confirmation must serialize on
the same registration row or an equivalent canonical lock.

If authenticated app confirmation wins first and refreshes `last_confirmed_at`,
maintenance must recheck the stale predicate under lock and leave the
registration ACTIVE.

If stale maintenance wins first, the old row becomes terminal `DISABLED` and
must never be reactivated. A later authenticated desired-state PUT follows the
existing registration contract and creates/reconciles a new ACTIVE registration
for the current StaffAuthSession/installation/token as allowed by current
uniqueness and account-switch rules.

The stale registration's installation ID, token hash, or prior session never
grants authority to the later caller.

## 6. Provider-invalid semantics remain strict

Age alone is never provider invalidation.

`PROVIDER_INVALID` remains reserved for a provider result that conclusively
invalidates the exact current endpoint/token version under DEC-073.

Therefore stale maintenance must never:

- set `PROVIDER_INVALID`;
- fabricate an FCM `UNREGISTERED` result;
- claim the app was uninstalled;
- claim the provider rejected the token; or
- use endpoint age as provider evidence.

Likewise, `SUPERSEDED` remains reserved for an actual winning replacement row.

## 7. Retention

A stale-terminalized registration enters the existing DEC-075 terminal
registration troubleshooting-retention window:

```text
terminalRegistrationRetentionDays = 30
```

The raw provider token is already cleared at terminalization. Safe token hash
and terminal metadata may remain only as already permitted by DEC-073/075 and
may be purged after the retention window once referential preconditions allow.

## 8. Maintenance safety

Stale reconciliation is maintenance, not a correctness timer and not a domain
command.

It must be:

- restart-safe;
- idempotent;
- batch-bounded;
- safe under multiple workers using row locking/skip-locked behavior or an
  equivalent bounded mechanism;
- least-privileged; and
- independent of Task, RetrievalRequest, ValetSession, DispatchEvent, and
  AuditEvent mutation.

A missed maintenance run cannot authorize a stale send because send-time
eligibility independently enforces the same 30-day freshness predicate.

Exact cleanup/maintenance batch size remains an implementation safety guard,
not U-004 capacity policy or an SLO.

## 9. Observability and privacy

Safe operational telemetry may count stale-endpoint suppression and
`STALE_CONFIRMATION_TIMEOUT` terminalization as controlled low-cardinality
reason classes.

It must not emit provider token/hash, installation ID, registration ID,
StaffAuthSession/User/membership IDs, tenant/location/task identifiers, payload
body, or customer/vehicle information.

No per-registration stale-maintenance AuditEvent is introduced. Push
registration maintenance remains operational bookkeeping, not custody history.

## 10. Consequences for MOB-020D

MOB-020D may now complete stale-endpoint handling without a new registration
state:

1. send-time eligibility excludes an ACTIVE registration at/after the 30-day
   confirmation threshold;
2. the bounded maintenance path terminalizes stale ACTIVE rows to `DISABLED`
   with `STALE_CONFIRMATION_TIMEOUT`, clearing the raw provider token;
3. unsent PENDING/RETRY_WAIT deliveries for that endpoint are suppressed;
4. current LEASED work remains protected by its fence and normal send-time
   eligibility/TOCTOU contract; and
5. later authenticated registration creates/reconciles a fresh ACTIVE row and
   never reactivates the stale terminal row.

This decision does not change U-004 capacity ownership, U-006 deployment
ownership, MOB-021 Native token acquisition, or MOB-022 device lifecycle/tap
proof.

## Decision firewall

DEC-076 resolves only stale Staff Push registration lifecycle. It does not add a
new push kind, new domain authority, provider evidence, client-supplied policy,
background domain synchronization, generic notification platform, or new
registration state. Any different stale threshold or materially different
terminal lifecycle requires a new focused decision.