# DEC-075 — Staff Push Operational Policy

Status: Accepted
Date: 2026-09-11
Owner: VAYLET product owner

## 1. Context

DEC-073 accepted the Employee Native push architecture, including dedicated
`StaffPushRegistration`, `StaffPushIntent` and `StaffPushDelivery` persistence,
FCM HTTP v1 for the initial Android adapter, strict registration/session binding,
creation-time and send-time eligibility checks, bounded retry, short database
leases with fencing, generic privacy-safe payloads, cleanup, retention and
provider-neutral shared concepts.

DEC-073 intentionally did **not** choose deployment values for TTL, retry count,
lease duration, provider timeout, backoff or retention. The Employee Native
execution plan therefore kept U-005 unresolved and blocked MOB-020D deployment
implementation on an owner-approved typed policy.

MOB-020A through MOB-020C are now merged. MOB-020C already requires explicit
creation-time policy values for `policyVersion`, retrieval-intent TTL and maximum
attempts, with no runtime defaults. This decision closes U-005 by selecting the
initial operational values for the one currently accepted push kind:
`EMPLOYEE_RETRIEVAL_REQUESTED`.

This decision supplements DEC-073. It does not replace or weaken any DEC-073
state, authority, payload, privacy, eligibility, fencing or provider rule.

## 2. Decision summary

Policy version 1 is accepted with the following values:

| Policy item | Accepted value |
| --- | ---: |
| Policy version | `1` |
| Retrieval intent TTL | `300 seconds` |
| Maximum provider attempts | `4 total` |
| Provider-call timeout | `10 seconds` |
| Database lease duration | `30 seconds` |
| Retry minimum/floor | `10 seconds` |
| Exponential retry cap | `60 seconds` |
| Retry jitter | Full-jitter behavior with the 10-second minimum preserved |
| HTTP 429 without valid `Retry-After` | `60 seconds`, still bounded by TTL/attempt budget |
| Android FCM priority | `HIGH` |
| FCM provider TTL | Remaining StaffPushIntent lifetime only |
| Intent/Delivery retention | `7 days` |
| Terminal registration troubleshooting retention | `30 days` |
| Active-registration stale threshold | `30 days` since `last_confirmed_at` |
| Cleanup evaluation cadence | `24 hours` |

All values are server/deployment policy. They are not tenant or Location policy
and are not configurable by Employee Native clients.

A material change to TTL, attempt budget, lease/timeout relation, retry timing,
retention or stale-endpoint policy requires a new policy version and focused
review. Version-1 semantics must not be silently changed in place.

## 3. Attention freshness

`EMPLOYEE_RETRIEVAL_REQUESTED` has a five-minute business freshness window:

```text
intentTtlSeconds = 300
```

No delivery attempt may begin at or after `StaffPushIntent.expires_at`.
Expiration ends only the optional push-attention attempt. It never cancels,
reassigns or mutates the canonical RetrievalRequest, Task, ValetSession,
DispatchEvent or AuditEvent.

The Task queue remains the source of truth. A delayed push that arrives after the
work has changed is less useful than no push, so the provider must never inherit
FCM's long default message lifespan for this workflow.

Every FCM send must set provider TTL to the positive remaining intent lifetime at
the moment of send. A retry does not restart a fresh five-minute TTL. When the
remaining lifetime is non-positive, MOB-020D must perform the existing `EXPIRED`
terminal behavior without provider I/O.

## 4. Attempt budget

The maximum is four total provider attempts per delivery:

```text
maxAttempts = 4
```

The first provider call consumes attempt 1. At most three later attempts may
occur. Attempt count is incremented atomically at successful claim as specified
by DEC-073.

No retry may be scheduled when either:

- the attempt budget is exhausted; or
- another attempt cannot begin before intent expiry.

This remains bounded best-effort attention. The policy makes no exactly-once
provider or device-display promise.

## 5. Lease and provider timeout

The accepted values are:

```text
providerCallTimeoutSeconds = 10
leaseDurationSeconds = 30
```

The claim transaction must commit before provider I/O. Every claim receives the
unique fenced lease token required by DEC-073. Finalization must match the exact
delivery, `LEASED` state and current lease token.

The provider timeout is intentionally shorter than the database lease. Policy v1
does not require lease renewal for a normal provider call. A worker must not
intentionally allow provider I/O to outlive the lease.

A provider timeout, transport loss or crash after provider acceptance can be an
ambiguous outcome. The system may retry after lease recovery within the same
TTL/attempt bounds and therefore may produce a duplicate generic notification.
It must never claim remote exactly-once delivery.

## 6. Retry schedule and jitter

The accepted retry policy is:

```text
retryMinimumSeconds = 10
retryCapSeconds = 60
strategy = exponential backoff + jitter
```

Immediate retry is prohibited. The effective randomized delay must never be
below 10 seconds, never exceed 60 seconds, and never schedule the next attempt at
or after intent expiry.

For policy v1, the exponential windows are conceptually:

| Retry after failed attempt | Permitted jittered window |
| --- | --- |
| first retry | 10–20 seconds |
| second retry | 10–40 seconds |
| third retry | 10–60 seconds |

MOB-020D may choose the exact testable random-number implementation, but
production jitter must avoid synchronized retry storms and tests must be able to
inject deterministic randomness/fake time.

The implementation must preserve DEC-073's full-jitter intent while also
respecting Firebase's minimum retry interval. A valid implementation may sample
from the exponential range and clamp upward to the 10-second minimum.

## 7. Rate limiting and `Retry-After`

For FCM rate limiting / HTTP 429:

1. parse a valid `Retry-After` when supplied;
2. if it is absent, use 60 seconds;
3. clamp scheduling to the configured 60-second retry cap and remaining intent
   lifetime;
4. do not exceed the remaining attempt budget; and
5. never busy-loop or retry at/after expiry.

Malformed provider retry metadata must normalize to safe bounded handling. It
must never create an unbounded delay or bypass the attempt/TTL limits.

## 8. Provider-result behavior

DEC-073's result classes remain unchanged:

- `ACCEPTED`
- `TRANSIENT`
- `RATE_LIMITED`
- `INVALID_ENDPOINT`
- `PERMANENT`
- `CONFIGURATION`
- `UNKNOWN`

Policy v1 confirms the following operational treatment without changing the
state machine:

| Result | Operational treatment |
| --- | --- |
| `ACCEPTED` | Terminal `PROVIDER_ACCEPTED`. |
| `TRANSIENT` | Retry only when TTL and attempts permit. |
| `RATE_LIMITED` | `Retry-After`/bounded retry only when TTL and attempts permit. |
| `INVALID_ENDPOINT` | No delivery retry; terminal delivery failure plus conditional exact-registration/token-version invalidation per DEC-073. |
| `PERMANENT` | No retry. |
| `CONFIGURATION` | Never invalidate a registration; fail-closed provider circuit/urgent operations signal; any retry remains inside normal TTL/attempt bounds. |
| `UNKNOWN` | Bounded retry is permitted; provider acceptance may have happened and duplicate generic attention is possible. |

Provider-specific mapping must be exhaustive and tested in MOB-020D. A generic
HTTP status is not enough to invalidate an endpoint when the provider response
does not conclusively prove endpoint invalidity.

## 9. Android provider presentation policy

The initial Android retrieval attention uses:

```text
FCM Android priority = HIGH
```

This is limited to the time-sensitive, user-visible
`EMPLOYEE_RETRIEVAL_REQUESTED` workflow. It does not automatically apply to any
future push kind.

MOB-021/MOB-022 must still respect Android permission/channel behavior and prove
truthful presentation. Permission denial or OS suppression never changes
canonical Task state or server authority.

Policy v1 does not define a shared retrieval collapse key. Distinct retrieval
Tasks have distinct StaffPushIntents, and a generic collapse key could replace
one still-useful retrieval alert with another.

## 10. Retention and cleanup

Push persistence is operational coordination, not custody/audit history.

### Intent and delivery retention

Accepted retention:

```text
intentDeliveryRetentionDays = 7
```

After the bounded troubleshooting window and only when state/referential
preconditions allow it, StaffPushIntent/StaffPushDelivery rows become eligible
for cleanup. Active investigations or explicit operational/legal holds may
extend retention; they never shorten it.

### Terminal registration retention

Accepted troubleshooting retention:

```text
terminalRegistrationRetentionDays = 30
```

Terminal registrations must already have `provider_token = NULL`. Their token
hash and safe terminal metadata may remain for the bounded troubleshooting
window. Cleanup may remove the row only after retained delivery foreign-key
references no longer require it.

### Active registration staleness

Accepted stale threshold:

```text
activeRegistrationStaleDays = 30
```

An `ACTIVE` row not confirmed for 30 days is stale operationally. Staleness is
not domain authority and is not proof that the provider endpoint is invalid.
Therefore stale cleanup must **not** use `PROVIDER_INVALID` unless the provider
has conclusively returned the accepted invalid-endpoint result.

MOB-020D must use an existing accepted terminal lifecycle for stale maintenance.
If the current state vocabulary cannot represent trusted stale cleanup without
changing DEC-073, implementation must stop and request a focused decision rather
than inventing a new state or abusing `PROVIDER_INVALID`.

### Cleanup cadence

Accepted evaluation cadence:

```text
cleanupIntervalHours = 24
```

Cleanup is maintenance, not a correctness timer. A missed cleanup run must not
make an otherwise-ineligible registration eligible, authorize a send, or alter
Task/Shift/session authority.

Cleanup must be tenant-safe, batch-bounded, restart-safe and idempotent. Exact
batch size, worker count and cleanup concurrency are deliberately not selected
here; they require measured capacity evidence under U-004/MOB-025.

## 11. Provider and deployment boundary

The selected initial provider remains direct **FCM HTTP v1**. No Expo Push
Service, legacy FCM server-key protocol, provider topic fanout, generic message
broker, Redis queue or Kafka path is accepted.

The sender targets the exact current registration endpoint. FCM authentication
uses server-side OAuth 2.0/ADC-compatible credentials with the Firebase Messaging
scope:

```text
https://www.googleapis.com/auth/firebase.messaging
```

The deployment principal must use least privilege. The relevant message-send
permission is `cloudmessaging.messages.create`; broad Owner/Editor access must not
be granted merely for convenience.

If implementation proves another permission is technically required, the exact
need must be documented and reviewed before granting it.

## 12. Environment isolation

Development, staging and production real-provider environments must use separate
Firebase projects/provider environments before their respective real-device
proof/deployment.

Production credentials must never be reused by development or staging. Every
environment requires explicit target-project configuration and an independent
credential identity/device-registration population. No environment may silently
fall back to another Firebase project.

Real project IDs are deployment data and must not be committed as architecture
policy values.

## 13. Credential custody

Provider credentials are deployment secrets. They must never appear in:

- source control;
- `.env.example` values;
- application database rows;
- StaffPushRegistration/Intent/Delivery data;
- logs, traces, metrics or AuditEvent;
- API responses;
- Native bundles; or
- Expo public configuration.

Use short-lived OAuth access tokens for HTTP v1. Prefer an ADC-compatible
server-side credential source backed by organization-controlled secret/workload
identity infrastructure.

If a service-account key file is operationally unavoidable in the chosen host,
it must be injected or mounted by accountable deployment secret management and
must never be committed or embedded in an application artifact.

The exact secret-store product, named custodian and recovery process remain
release-ownership inputs under U-006 unless another Accepted decision already
locks them.

## 14. Fail-closed configuration

Production provider sending must fail closed when required policy/provider
configuration is absent or invalid. Examples include:

- missing Firebase target-project configuration;
- unavailable credential source;
- malformed policy value;
- non-positive TTL/attempt/lease/retention values;
- provider timeout greater than or equal to lease duration;
- retry minimum below 10 seconds; or
- retry cap below retry minimum.

A push configuration/provider failure must never roll back or mutate an already
committed RetrievalRequest, Task, ValetSession, DispatchEvent or AuditEvent.
Polling/refetch remains the recovery path.

`CONFIGURATION` provider outcomes must never mark a device registration
`PROVIDER_INVALID`.

## 15. Policy-v1 validation invariants

The typed runtime policy must reject missing or inconsistent values. The binding
version-1 values are:

```text
policyVersion = 1
intentTtlSeconds = 300
maxAttempts = 4
providerCallTimeoutSeconds = 10
leaseDurationSeconds = 30
retryMinimumSeconds = 10
retryCapSeconds = 60
intentDeliveryRetentionDays = 7
terminalRegistrationRetentionDays = 30
activeRegistrationStaleDays = 30
cleanupIntervalHours = 24
```

No runtime default may silently replace a missing deployment value.

The existing MOB-020C creation-time policy variables remain explicit and should
receive the accepted deployment values rather than new hard-coded defaults:

```text
STAFF_PUSH_RETRIEVAL_POLICY_VERSION=1
STAFF_PUSH_RETRIEVAL_INTENT_TTL_SECONDS=300
STAFF_PUSH_RETRIEVAL_MAX_ATTEMPTS=4
```

The exact names for additional MOB-020D configuration keys may follow the
repository's existing configuration conventions, but they must map unambiguously
to this one typed policy and must not create a second policy source.

## 16. Capacity values deliberately not selected

U-005 does **not** choose:

- number of worker processes;
- worker concurrency;
- claim batch size;
- maximum sends per second;
- CPU/RAM allocation;
- backlog SLO;
- end-to-end latency SLO; or
- fleet/pilot throughput limits.

Those require measured evidence and remain U-004/MOB-025 capacity inputs. MOB-020D
may expose bounded mechanics needed for correctness but must not claim unmeasured
production capacity from this decision.

## 17. Payload and privacy remain unchanged

DEC-073's safe provider payload remains the only accepted payload:

```text
schemaVersion = 1
kind = EMPLOYEE_RETRIEVAL_REQUESTED
intentId = <opaque intent UUID>
routeIntent = TASK_QUEUE
```

The provider payload and localized notification copy must not include User,
membership, StaffAuthSession, Organization, Location, Task, ValetSession,
RetrievalRequest, guest/customer, phone, plate, vehicle, parking, key, GPS,
payment, handoff, pickup code, authentication credential, provider token/hash or
client/domain-derived free text.

The fixed generic EN/AR copy and current-server-state refetch behavior remain
DEC-073 authority.

## 18. Operational basis and rationale

The selected values combine external provider guidance with VAYLET's own product
freshness requirements:

- Firebase recommends bounded exponential retry with jitter rather than immediate
  retry and documents a minimum retry interval of about 10 seconds for server
  sends.
- For HTTP 429, Firebase requires honoring `Retry-After`; when absent, a
  60-second delay is the documented safe baseline.
- FCM permits message lifetimes far longer than a valet retrieval workflow needs,
  so VAYLET deliberately selects a five-minute freshness window instead of
  inheriting the provider default.
- Android `HIGH` priority is appropriate only for genuinely time-sensitive,
  user-visible notifications such as this retrieval attention.
- Firebase token-management guidance treats approximately one month without
  refresh as a reasonable stale-registration signal.

The following values are **VAYLET owner-approved operational choices**, not
Firebase, Uber, Lyft, DoorDash or other-company guarantees:

- five-minute intent TTL;
- four total attempts;
- 30-second lease;
- seven-day intent/delivery retention; and
- 30-day terminal-registration retention.

External operational references used during this decision:

- Firebase Cloud Messaging — Scale FCM / retry guidance:
  https://firebase.google.com/docs/cloud-messaging/scale-fcm
- Firebase Cloud Messaging — Set message lifespan:
  https://firebase.google.com/docs/cloud-messaging/customize-messages/setting-message-lifespan
- Firebase Cloud Messaging — Android message priority:
  https://firebase.google.com/docs/cloud-messaging/android-message-priority
- Firebase Cloud Messaging — Manage registration tokens:
  https://firebase.google.com/docs/cloud-messaging/manage-tokens
- Google Cloud IAM — Firebase Cloud Messaging permissions/roles:
  https://cloud.google.com/iam/docs/roles-permissions/firebasecloudmessaging

These links support provider behavior and operational rationale. The VAYLET
numbers remain product-owner decisions.

## 19. Consequences for the execution plan

U-005 is resolved by this Accepted decision.

MOB-020D is unblocked with respect to operational-policy selection once its
other dependencies, MOB-020B and MOB-020C, are satisfied. MOB-020D must implement
and prove the DEC-073 worker/provider contract using this policy without changing
its values or silently adding capacity policy.

G6 remains open. Closing U-005 does not prove worker/provider behavior, Native
registration, OS notification presentation, background/terminated lifecycle,
provider sandbox operation, physical-device behavior, CI or production readiness.

## 20. Affected docs/code

Documentation authority:

- `docs/08_DECISIONS_LOG.md` — canonical summary mirror to be synchronized;
- `docs/20_EMPLOYEE_NATIVE_EXECUTION_PLAN.md` — U-005/MOB-020D status mirror to be
  synchronized; and
- `docs/decisions/DEC-073_NATIVE_PUSH_ARCHITECTURE.md` — remains the unchanged
  architecture authority supplemented by this decision.

Implementation follows in MOB-020D. This decision itself changes no runtime
code, schema, migration, dependency, Firebase resource, provider credential or
application behavior.
