# DEC-077 — Employee Incident Process-Death Recovery

Status: Accepted
Date: 2026-09-12
Task: MOB-023B-INCIDENT-RECOVERY-CONTRACT
Implementation child: MOB-023B-INCIDENT-RECOVERY-IMPLEMENTATION
Audited base: `91e458cdf88b4e34525614a08eb10c2f14ceb2ed`
Branch: `codex/mob-023b-incident-recovery-contract`

## 1. Accepted decision

Use a narrow **actor-bound server recovery intent**, created before a
recovery-enabled Native Incident POST may be dispatched, plus a minimal encrypted
device marker and an actor-bound canonical recovery read.

The server, rather than UUID secrecy or device-asserted membership data, owns the
binding between an Incident operation ID and its original Organization, Location,
ValetSession and reporting OrganizationMembership. The existing Incident POST
must enforce that binding for every recovery-enabled Native operation. A later
explicit retirement makes an unused reserved ID terminal. Neither cold start nor
reconnect sends a reservation, retirement or Incident mutation automatically.

This Accepted contract supersedes the earlier Proposed retirement-only
recommendation. That design correctly rejected a bare missing Incident row as
definitive absence, but it allowed any otherwise authorized same-Location reporter
who learned an unused ID to retire it. Its durable `BLOCKED_REDACTED` sentinel
could also prevent all future Incident reporting on an installation without an
accepted repair path. Neither property is part of the Accepted contract.

The Accepted contract adds one small table, one reservation command, one
explicit retirement command, one canonical read and a reservation admission
check in the existing Incident POST. It stores no Incident draft or payload and
adds no queue, journal, worker or replay mechanism.

This Accepted decision establishes the implementation authority described below.
The acceptance branch changes no production files, schema, migrations,
dependencies or runtime grants. Its concise canonical summary is synchronized in
`docs/08_DECISIONS_LOG.md`.

## 2. Context and current failure

Incident lifecycle remains independent of ValetSession custody lifecycle. The
unresolved failure is:

1. Process A sends the existing Incident POST.
2. Incident and `INCIDENT_OPENED` commit atomically.
3. The response is lost.
4. Process A dies before Native receives the report result.
5. Process B has neither the original in-memory UUID nor a canonical Employee
   recovery surface.

A timeout or disconnect does not prove rollback. Generating a new UUID can create
a second legitimate Incident because multiple Incidents per session are allowed.
Success must come only from the authoritative committed row for the exact ID.

The existing PostgreSQL advisory transaction lock is necessary but insufficient
to prove a negative. It serializes transactions that have acquired the same lock;
it cannot exclude an original request that is still before lock acquisition or
has not yet arrived at the API. Therefore “no Incident row” is never, by itself,
definitive ABSENT.

The actor-bound intent fixes both missing facts. It establishes positive server
evidence about who owns the ID before Incident dispatch, and its terminal state
is a durable admission fence against delayed POSTs.

## 3. Existing binding authority and source audit

Authority reviewed at the audited base:

| Source | Current status / relevant authority |
| --- | --- |
| `AGENTS.md`; `docs/17_AGENT_CODE_STRUCTURE_RULES.md` | Binding authority-before-disclosure/mutation, atomic audit, tenant isolation, independent Incident lifecycle, one writer and authored-code size rules |
| `docs/20_EMPLOYEE_NATIVE_EXECUTION_PLAN.md` | Binding execution envelope; MOB-017A/MC-17 owns Incident; MOB-023A owns auth/network; MOB-023B/MC-22 owns process death; R-07 permits command-specific recovery rather than generic replay |
| Plan §§2–3, §7 A/R-07, §8 common task-card contract, B6/G7 and dependency graph | Requires truthful recovery, fresh authority, no secrets/free text in diagnostics, EN/AR and platform proof; MOB-023A → MOB-023B; MOB-023B and MOB-024B → G7 |
| [DEC-059](DEC-059_PHASE7_INCIDENT_RUNTIME_READ_AUTHORITY.md) | **Accepted** in its focused file; gives the API runtime Incident SELECT for Dashboard and separately accepted Employee INSERT. It does not authorize Employees to use Dashboard reads |
| [DEC-063](DEC-063_EMPLOYEE_OFFLINE_OPERATION_POLICY.md) | **Accepted** in its focused file; permits Incident `MANUAL_RETRY_EXISTING_IDEMPOTENCY`; permits only in-memory drafts; requires a separate durable storage/privacy decision; prohibits generic journals/outboxes/replay |
| [DEC-071](DEC-071_MOBILE_PLATFORM_REPOSITORY_ARCHITECTURE.md) | **Accepted**; one Expo application, portable orchestration, Native adapters, Android-first proof and same-source iOS |
| [DEC-072](DEC-072_NATIVE_STAFF_AUTHENTICATION_ARCHITECTURE.md) | **Accepted**; access tokens remain memory-only; dedicated SecureStore refresh envelope; installation generation; restore before work; explicit purge and storage failure taxonomy |
| [DEC-032](DEC-032_SHIFT_OPERATIONAL_ELIGIBILITY.md) | **Accepted**; membership-specific Shift and locked current eligibility. Its own-Shift cleanup exception does not grant Incident disclosure after membership or Location revocation |
| [DEC-066](DEC-066_EMPLOYEE_BOTTOM_NAV_PRODUCTION_WIRING.md) | **Accepted**; workflow/identity isolation; directory visibility does not grant Incident authority |
| DEC-023 in `docs/08_DECISIONS_LOG.md` | **Accepted** in its canonical entry; principal proves User only, exact Bearer transport, no role inheritance |
| DEC-024/025/026/027/029 | Their focused files are **Accepted** and bind shared-auth abuse boundaries, runtime TLS/privilege separation, common infrastructure, feature ownership and controlled provisioning |
| DEC-031/033/034/035/036/037/039/042/043/052/065/068 | Their focused statuses are **Accepted**; they bind custody, Task and terminal-state inputs used by current Staff authorization. This proposal changes none of their transitions |

The accepted Stream-A implementation is the current Incident reporting authority,
as DEC-059 §9 and DEC-063 §6 recognize. Its relevant provenance is
`551c45b4717763ade598eca78feb1c8059768bfa` and actor-bound retry hardening
`9535e40bf44bb604d443e2705ef5c471ec25c4b8`. Commit history supports the source
trace; it does not establish decision status.

The current [MOB-023B evidence](../reference/employee-native-mob-023b-evidence.md),
especially “MOB-023B-INCIDENT-RECOVERY CONTRACT CHILD REQUIRED,” identifies this
remaining block. This decision neither closes MOB-023B nor starts MOB-024A.

### Source-grounded implementation trace

| Boundary | Source / observed behavior |
| --- | --- |
| Native ID and transport | `apps/valet-native/src/incident/native-incident-session.ts` keeps one nullable `incidentId`, generates a CSPRNG UUID lazily in `submit`, reuses it on same-process failure, and clears it on success, `open` or `clear` |
| Draft and result | `src/incident/native-incident-form.tsx` owns in-memory type, severity and description; current success presentation also depends on session detail, which recovery must decouple |
| Routing and process restart | `src/shell/native-contextual-route.ts` is transient; `native-production-bootstrap.ts` creates a fresh runtime; `native-workflow-scope-retirement.ts` clears Incident state; `src/auth/native-auth-runtime.ts` composes Incident and registers identity purge |
| Auth storage | `src/auth/native-auth-storage.ts` uses Expo SecureStore for the refresh envelope and an app-private installation file. `identity-state-boundary.ts` awaits purge handlers. None is authority to store an Incident body |
| Portable contracts | `packages/contracts/src/incidents.ts` defines a strict four-field request: incidentId, severity, type and trimmed 1–500-character description. `ReportIncidentResponse` omits description |
| Portable client | `packages/employee-client/src/employee-client.ts` transports the command and `recovery-policy.ts` retries safe GET/HEAD only after refresh. There is no durable Incident recovery helper |
| API | `incident-reporting.controller.ts` validates the request and exactly one Staff Authorization header; service delegates to `createReportIncidentCommandExecutor` with the runtime pool |
| Authorization | `staff/custody-staff-authorizer.ts`, `shifts/shift-operational-eligibility.ts` and `staff/staff-valet-session-{authorization,queries}.ts` establish persisted scope, active rows, exact Location access, Employee task relationship and Supervisor exception under locks |
| Existing reads | `staff/staff-valet-session.service.ts` returns custody detail, not Incident results, and requires Shift/task eligibility. Dashboard Incident reads select description and cannot be reused as an Employee recovery surface |
| Transaction | `incident-reporting-command.ts` uses one PoolClient: BEGIN; authorization/Shift/task checks; description normalization; Organization-plus-incidentId advisory transaction lock; prior Incident check; Incident plus audit INSERT; COMMIT; rollback on failure |
| DB | `packages/database/prisma/schema.prisma` and `20260809001300_incident_foundation/migration.sql` define Incident with UUID primary key, tenant/Location/session/reporter FKs and `(location_id,status)` index. No per-session/payload/time uniqueness exists |
| Runtime privileges | `packages/database/scripts/runtime-table-privileges.mjs` and verifier grant incidents SELECT/INSERT and deny UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER. `audit_events` is append-only |
| Evidence | `apps/api/test/staff-incident-reporting.integration.test.ts` proves exact retry, changed-payload and cross-actor conflicts, scope/Shift/terminal denial, and one Incident/`INCIDENT_OPENED`. Native process-death suites expose the in-memory identity boundary |

No live deployment-role verification or real PostgreSQL race experiment was run
in this documentation task. Future implementation must prove repository
assumptions with the real runtime role and genuine PostgreSQL transactions.

### Current facts A–K

| Fact | Verified result |
| --- | --- |
| A | Native generates one stable incidentId per logical in-memory submit attempt |
| B | It survives repeated attempts only while that NativeIncidentSession retains it; `open`, `clear`, success or process death removes it |
| C | A fresh NativeIncidentSession starts with no old incidentId and has no restore input |
| D | POST uses incidentId, severity, type and description. Exact actor/session/type/severity/normalized-description reuse is idempotent, subject to current authorization running first |
| E | Same ID with changed normalized payload conflicts when execution reaches the idempotency check |
| F | Existing exact retry is bound to the original `reported_by_membership_id` |
| G | There is no accepted canonical Employee GET/list/by-ID surface for a lost Incident result |
| H | DEC-059's runtime SELECT does not authorize VALET_EMPLOYEE to use Dashboard reads and does not define process-death recovery |
| I | DEC-063 permits Incident `MANUAL_RETRY_EXISTING_IDEMPOTENCY` |
| J | DEC-063 does not authorize a durable Incident draft across restart |
| K | Generic command journals, outboxes and background replay remain prohibited |

## 4. Options considered

| Option | Security and recovery properties | Cost / disposition |
| --- | --- | --- |
| A: minimal local identity plus canonical read | Minimal local metadata and exact positive recovery; no content. A bare no-row cannot exclude a later POST or prove actor ownership of an unused ID | Incomplete alone. Its device marker and narrow GET remain components of the selected contract |
| B: actor-bound server recovery intent | Server binds actor/session/scope before dispatch. Active intent means PENDING; committed Incident means FOUND; retained retirement means definitive ABSENT. No body is stored | **Selected narrow solution.** One table/migration, reservation/retirement/read commands and POST admission |
| B1: one guarded intent row | A migration-owned database trigger permits only initial RESERVED insertion and one `RESERVED → RETIRED` transition while keeping all binding/time fields immutable. Incident existence supplies FOUND | **Accepted representation.** Existing migrations use focused transition/immutability triggers. This is the smallest design that makes terminality a database invariant rather than an application convention |
| B2: immutable reservation plus immutable retirement fact | Insert-only facts avoid UPDATE privilege and retain event history | Rejected as unnecessary here. It needs two relations or a typed event table, additional invariants and joins. Retirement is internal reliability state, not an append-only business event |
| C: durable full draft plus same-ID retry | Stores description, type and severity; exact retry possible only while current POST authorization remains valid | Rejected. Free-text PII, encryption/key access, backup, retention, account purge and edited-draft UX require a separate contract prohibited by current Accepted policy |
| D: discovery without recovered ID | Latest/list/payload/time matching cannot identify one operation when multiple reports, repeated values, devices or reporters exist | Rejected as ambiguous and broader disclosure. No list/search/latest endpoint |
| E: generic durable command journal/outbox | Persists arbitrary commands and enables generalized replay | Rejected by Accepted policy; not designed |

The earlier immutable retirement-only row is rejected because the first actor to
claim an unseen ID became its owner. UUID entropy lowered accidental discovery
but did not create server evidence of actor ownership. The pre-dispatch intent
removes that authority gap.

## 5. Accepted server intent contract

The fields, protocol rules and response semantics below are binding. Route/file
names described as conceptual may be refined during implementation only when the
Accepted security and recovery behavior remains exact.

### Smallest server object

Add one `incident_recovery_intents` table / `IncidentRecoveryIntent` model with:

- `incident_id UUID` and `organization_id UUID`, composite primary key;
- `location_id UUID`;
- `valet_session_id UUID`;
- `reporting_membership_id UUID`;
- `state`, constrained to `RESERVED` or `RETIRED` and defaulting to RESERVED;
- `created_at TIMESTAMPTZ(3)`, set from database time;
- `expires_at TIMESTAMPTZ(3)`, set from database time plus 15 minutes;
- `retired_at TIMESTAMPTZ(3) NULL`.

Tenant-safe composite foreign keys mirror the Incident Organization, Location,
session and membership relationships with restrictive deletion. Constraints
require `retired_at IS NULL` for RESERVED and non-null for RETIRED. No list index
is authorized; exact primary-key lookup is the product surface.

The row contains no Incident content, body hash, client authority, authorization
material, navigation state or generalized command type. It is one command-specific
admission record. Incident existence remains in the existing Incident table;
there is no redundant `COMMITTED` state. If an Incident exists for the matching
reservation, canonical recovery is FOUND regardless of the still-RESERVED row.

Only the transition `RESERVED → RETIRED` is allowed. A CHECK relating state and
`retired_at`, a conditional application UPDATE, and column privileges are not
enough: a buggy query could otherwise set both fields consistently and resurrect
a terminal ID.

The migration must therefore create a focused `BEFORE INSERT OR UPDATE` database
transition guard, following the existing Staff push and tracking-session trigger
conventions. It must:

- permit only INSERT with state RESERVED and null `retired_at`;
- derive `created_at` from authoritative database time and set
  `expires_at = created_at + interval '15 minutes'`;
- permit exactly one RESERVED-to-RETIRED UPDATE;
- set `retired_at` from authoritative database time during that transition;
- reject RETIRED-to-RESERVED, any update after retirement, any removal or rewrite
  of `retired_at`, and any mutation of incident, actor, session, Organization,
  Location, creation or expiry fields.

Runtime receives SELECT, column-limited INSERT of only the binding fields, and
column-limited UPDATE of only `state`. The trigger authors `retired_at`; runtime
does not need direct UPDATE authority over that timestamp. Runtime receives no
DELETE, table ownership, DDL, function-execution grant or TRIGGER privilege. The
guard function is migration-owned, fixes its `search_path`, and revokes PUBLIC
execution following repository convention.

The API still issues `UPDATE ... SET state = 'RETIRED' WHERE state = 'RESERVED'`
under the operation lock, but correctness does not depend on that WHERE clause.
A compromised or buggy normal runtime query using only its granted DML privileges
must be unable to resurrect a terminal Incident recovery ID or rewrite its binding
and timestamps. If implementation cannot prove this guard under the provisioned
runtime role, it must use immutable reservation plus immutable retirement facts
instead of weakening the invariant.

An expired RESERVED row is terminal for admission. Under the operation lock,
POST must reject it based on database time even if a maintenance transition has
not materialized `RETIRED`. A read may project the effective RETIRED outcome
without writing. A later explicit retirement or controlled maintenance pass may
materialize the one-way state change, but no worker is required for correctness.
The tombstone must remain able to reject that exact recovery ID; expiry never
means deletion or ID reuse.

### Recovery-mode identity and downgrade prevention

Current Native calls `globalThis.crypto.randomUUID()`, which returns an RFC 4122/
RFC 9562 version-4 UUID. Recovery-enabled Native must instead produce an RFC
9562-valid, CSPRNG-backed version-8 UUID and use the narrow protocol token
`actor-bound-intent-v1`. The UUID version is the durable server-recognizable mode
selector; a header such as
`Valet-Incident-Submission-Protocol: actor-bound-intent-v1` makes transport intent
explicit but is not authority.

Server admission rules are exact:

1. A version-8 recovery ID requires the exact protocol header and a matching
   active reservation. Missing or different protocol selection is rejected.
2. Supplying the protocol header with a non-recovery ID is rejected.
3. Omitting the header cannot downgrade a version-8 ID to legacy behavior.
4. If any intent exists for an ID, every POST path enforces its actor/session/scope
   binding and terminal state.
5. Existing version-4 requests without the header retain the accepted legacy
   four-field POST behavior.

All non-version/non-variant bits must remain CSPRNG-backed. Do not encode User,
tenant, timestamp, membership or any other business data. No dependency is
approved by this decision. Future implementation must prove the platform can
construct the exact RFC 9562-valid form without weakening entropy and that the
contracts/Zod validator, API parsing and PostgreSQL UUID type all accept it. If
current platform primitives cannot do so without a new dependency, implementation
must stop and return for owner review before changing dependencies.

Before enabling the protocol, a data check must also confirm no current client
has used the selected version/discriminator as a legacy ID; if that assumption is
false, acceptance must choose another fixed recovery-ID discriminator. This is a
narrow protocol marker, not a broad API-version framework.

This dual signal prevents an updated Native client, buggy intermediary or retry
path from treating the same tracked ID as legacy merely by dropping a header.
It does not treat UUID secrecy as actor authorization. The server reservation
does that.

## 6. Commands and canonical recovery read

### Initial reservation command

Conceptual route:

`POST /v1/staff/valet-sessions/:sessionId/incidents/:incidentId/recovery-intent`

It accepts strict recovery-version UUID path parameters, empty query and empty
JSON body, the exact protocol header, and the existing single Staff Bearer header.
The server derives User, OrganizationMembership, Organization, Location and
ValetSession. No actor or scope value from the request body is accepted.

Initial insertion requires all current Incident creation authority: active User,
membership, Organization, Location and exact Location access; role
VALET_EMPLOYEE or VALET_SUPERVISOR; non-COMPLETED session; active exact-Location
Shift; and the current Employee Task/session relationship or Supervisor exception.

Under the shared operation lock:

- no Incident or intent: insert RESERVED and return its server fields;
- exact existing active intent for the same membership/session/scope: return the
  same reservation without creating a second row;
- exact existing expired/RETIRED intent: return terminal conflict;
- Incident already exists or any actor/session/scope binding differs: return a
  uniform non-disclosing conflict/denial; never transfer ownership.

Reservation is idempotent for the exact original binding while current creation
authority still holds. If its response is lost and Shift/session becomes terminal,
Process B uses canonical recovery, which does not require creation eligibility.
The reservation response means only that a submission ID is bound. It never means
an Incident exists and emits no `INCIDENT_OPENED`.

### Existing Incident POST admission

The existing four-field body remains:

```text
incidentId, severity, type, description
```

For recovery-mode IDs, the POST must not commit unless a RESERVED, unexpired
intent exists and exactly matches the authenticated membership plus derived
Organization, Location and ValetSession. The server applies existing creation
authorization first, then obtains the operation lock, reads the authoritative
intent and Incident, and performs existing exact-payload idempotency or insertion.

An absent, expired, RETIRED, foreign or mismatched reservation rejects the POST
before Incident or audit insertion. The caller cannot supply or override a
membership/scope binding. The Incident insert and exactly one `INCIDENT_OPENED`
remain atomic. The intent does not permit creation after a Shift ends or a session
completes; it is an admission prerequisite, not a capability.

Legacy version-4 calls keep current authorization, idempotency and payload rules.
No Web client must reserve an ID for backward compatibility. Recovery guarantees
apply only to the new recovery protocol.

### Canonical recovery read

Conceptual route:

`GET /v1/staff/valet-sessions/:sessionId/incidents/:incidentId/recovery`

It accepts an empty query/body, exact UUID paths and current Staff authentication.
It uses the writer database/pool, not a cache, replica, Dashboard service or
offline response. Set `Cache-Control: no-store`.

Strict HTTP 200 outcomes are:

```text
{ outcome: "FOUND", report: ReportIncidentResponse }
{ outcome: "RESERVED", incidentId, sessionId, expiresAt }
{ outcome: "RETIRED", incidentId, sessionId }
{ outcome: "UNKNOWN", incidentId, sessionId }
```

- FOUND requires an exact matching Incident and original reporter membership.
  `ReportIncidentResponse` is safe to reuse because it omits description and acts
  as the original opening receipt.
- RESERVED means no Incident exists and the matching server intent remains active.
  The original outcome is unresolved; no new Incident may be submitted locally.
- RETIRED means no Incident exists and the matching intent is explicitly or
  effectively terminal. Server admission permanently rejects that ID, so this is
  definitive non-success.
- UNKNOWN means neither an Incident nor matching intent is visible after the
  serialized read. It is “protocol not established,” never the general claim
  that an arbitrary Incident operation cannot arrive later.

UNKNOWN is safe for this protocol because a conforming Native process may not
dispatch Incident POST until reservation success. If a reservation request is
still before the lock, it may later create only an intent; Process A could not
have lawfully dispatched the Incident POST without first observing that committed
reservation. Thus UNKNOWN never fabricates Incident success and can close a
local-only attempt. It must not be reused as generic absence proof for legacy IDs.

Foreign report/intent, wrong scope and missing scope use a uniform non-disclosing
denial rather than returning another actor's state. Anonymous/invalid auth follows
the existing 401 convention. Lock timeout, deadlock, transport failure, malformed
response and server failure map to recovery unavailable, never RETIRED/UNKNOWN.

### Explicit retirement command

Conceptual route:

`POST /v1/staff/valet-sessions/:sessionId/incidents/:incidentId/recovery-intent/retire`

It accepts no content and is invoked only by an explicit foreground user action.
Cold start, reconnect and background work never call it automatically.

Under current recovery authorization and the operation lock:

1. Matching Incident exists: return FOUND; do not retire or write an opening audit.
2. Matching active intent and no Incident: transition it once to RETIRED and return
   RETIRED after commit.
3. Matching RETIRED/effectively expired intent and no Incident: return RETIRED.
4. No intent/Incident: return UNKNOWN and write nothing.
5. Foreign binding: uniform non-disclosing denial and no write.

Only the exact original membership may retire. This removes the former same-Location
unused-ID denial-of-service authority. Loss of a retirement response is recovered
by GET; a retry is idempotent. Retirement is not Incident cancellation because no
Incident exists, and it never mutates custody or creates a Task.

## 7. Authorization and disclosure matrix

Recovery common prerequisites are an authenticated active User; the same active
OrganizationMembership recorded by the intent/report; active Organization and
Location; current exact membership Location access; and current role
VALET_EMPLOYEE or VALET_SUPERVISOR. Resolve all scope from the session and server
rows. Locally stored IDs are selectors only.

Recovery of the actor's server-bound intent/report does not require an active
Shift, a non-COMPLETED session or a current Task relationship. Those conditions
are required for initial reservation and every new Incident creation. The narrow
difference preserves truthful recovery after a prior authorized attempt without
reopening custody or granting general history access.

| Actor / condition | Initial reservation / CREATE new Incident | RECOVER read / RETIRE exact prior operation |
| --- | --- | --- |
| Original VALET_EMPLOYEE, same membership and current Location access | Allow only with all current creation predicates, including active Shift and current Task/session relationship | Allow own exact binding; no active Shift/Task required |
| Original VALET_SUPERVISOR, same membership and current Location access | Allow only with current Supervisor creation predicates and active Shift | Allow own exact binding; no active Shift required |
| Different Employee, same Location | May create only their own new ID under current authority | Deny; cannot read, reserve over or retire original ID |
| Different Supervisor, same Location | May create only their own new ID under current authority | Deny; no supervisor override |
| LOCATION_MANAGER | Existing Incident creation denies | Deny; no new recovery authority |
| ORG_ADMIN | Existing Incident creation denies | Deny; no new recovery authority |
| Same User, different OrganizationMembership | Evaluate only the new membership's own new operation | Deny original membership binding |
| Wrong Organization or Location | Deny | Deny without disclosing existence |
| Revoked/inactive membership | Deny | Deny; never map to UNKNOWN/RETIRED |
| Inactive User | Deny | Deny |
| Inactive Organization | Deny | Deny |
| Inactive Location | Deny | Deny |
| Ended Shift after reservation/commit | Deny a new reservation/Incident unless a new qualifying Shift exists | Allow own exact intent/report while common recovery scope remains active |
| COMPLETED ValetSession after reservation/commit | Deny reservation and Incident creation | Allow own exact intent/report; no custody/Task mutation |
| Anonymous | Deny | Deny with existing authentication response |
| Cross-tenant attacker | Deny | Deny without revealing report/intent existence |

No endpoint lists, searches, filters by reporter/time/payload, or delegates to the
Dashboard query. The read returns no description, customer/vehicle/key data,
resolution note or other Incident. Two authenticated processes for the same exact
membership may read the same ID and receive the same authoritative outcome; they
do not acquire mutation rights beyond one explicit idempotent retirement.

## 8. Transaction and serialization contract

Use one shared operation-lock helper and the existing canonical Organization plus
incidentId advisory transaction-lock key for:

- reservation check/insert;
- recovery-mode POST admission, exact retry and Incident insert;
- retirement check/transition;
- canonical recovery read when visibility relative to a lock holder matters.

Every executor uses one PoolClient and explicit transaction. Acquire database
row/advisory locks in this order:

1. active User;
2. ValetSession and its Organization/Location;
3. OrganizationMembership and membership Location access;
4. for reservation/Incident creation only, Shift and Task/operational eligibility
   locks in the current shared authorizer order;
5. operation advisory transaction lock;
6. after acquiring the operation lock, fresh Incident and intent SELECTs as
   separate statements;
7. permitted insert or one-way retirement update, plus Incident audit when and
   only when creating an Incident.

Recovery skips Shift/Task locks but preserves the relative order of every lock it
does acquire. Refactor only enough to share the exact operation key and ordering;
do not create parallel authorization logic.

The implementation must test actual PostgreSQL isolation and visibility before
choosing an isolation level. Under the current READ COMMITTED implementation, the
required property is that separate SELECT statements issued after an advisory
lock wait observe a preceding transaction's commit. This remains an implementation
validation gate until real PostgreSQL integration proves it. A single pre-lock
CTE or mocked mutex is insufficient.

The durable intent supplies the temporal fence that the advisory lock lacks:

| Race | Required result |
| --- | --- |
| Reservation holds lock | recovery waits; after commit sees RESERVED, after rollback sees UNKNOWN |
| POST holds lock | recovery waits; commit gives FOUND, rollback leaves RESERVED |
| Recovery reads before a not-yet-locked reservation | UNKNOWN; later reservation alone cannot open an Incident |
| Retirement holds lock before delayed POST | retirement commits RETIRED; POST then rejects before Incident/audit insert |
| POST holds lock before retirement | POST commits Incident plus audit; retirement then returns FOUND |
| Expired intent and delayed POST | POST atomically recognizes terminal deadline and rejects; expiry never re-enables the ID |

An impossible coexistence, such as matching Incident plus RETIRED intent, is an
internal invariant failure. Fail closed, emit content-free operational telemetry
and never coerce it to FOUND or RETIRED.

## 9. Native local storage and orchestration

Using Expo SecureStore for Incident recovery is a new command-specific use under
this Accepted decision. DEC-072 authorizes auth storage only; it does not silently
authorize operational drafts. Implement a separate `IncidentRecoveryStore`
adapter behind portable interfaces. Add no dependency: the current Expo/native
capability is sufficient in principle and must be verified on Android and iOS.

The marker is encrypted at rest through the platform-backed SecureStore and uses
its own namespaced key and command-specific adapter. On Android, preserve the
repository's backup/device-transfer exclusion so ciphertext is not restored
without its keystore key; uninstall removes app data but is not a recovery action.
On iOS, select a device-only accessibility class and bind the envelope to the
installation generation because Keychain items can survive process restart and
may survive reinstall. A generation mismatch is an identity-bound purge case,
never permission to display or submit. Portable orchestration depends only on the
adapter contract, so the same recovery state machine remains buildable on iOS.

### Exact local marker

One versioned encrypted envelope contains only:

```text
version
protocol = actor-bound-intent-v1
incidentId
sessionId
membershipId
organizationId
locationId
installationGeneration
createdAt
```

This shape deliberately has no `userId`. The actual Staff operational context in
`packages/contracts/src/staff-context.ts` exposes membershipId, Organization,
Location, role and Shift, not a User projection. Do not add `userId` to that
contract for Incident recovery.

All values except local version/protocol/time come from the CSPRNG ID, current
Staff operational context or installation boundary. Local identity binding is the
current authenticated generation/barrier plus exact membershipId, Organization,
Location and installation generation. These fields support local purge/routing;
the API never trusts them for authorization. It derives User from the authenticated
Staff principal and proves that principal still owns the stored
OrganizationMembership. The optional authoritative server `expiresAt` may be
cached after a successful reservation/read, but it is advisory on device and
never proves terminal state.

The store must never contain:

- description, type, severity or any complete/partial Incident body;
- a body/payload hash, draft, edit history or arbitrary serialized command;
- Authorization, access token, refresh token or Staff credential;
- Guest bearer, handoff proof or customer/vehicle/key data;
- navigation stack, generic workflow snapshot, retry counter or replay schedule.

No marker value may appear in analytics or diagnostics beyond allow-listed opaque
correlation already permitted by repository logging rules. Description remains
potentially sensitive free text and stays only in Process A memory and the
existing protected POST/Incident storage path.

### Required ordering

1. Validate the in-memory form.
2. Generate one recovery-mode CSPRNG incidentId.
3. Durably write and confirm the marker.
4. If write/confirmation fails, send **zero network mutations**, including no
   reservation and no Incident POST.
5. Explicitly send the reservation command in foreground.
6. Only after a validated RESERVED response may the same live process dispatch
   the existing Incident POST with the protocol header.
7. Reservation error, timeout or response loss sends no Incident POST. Recovery
   proceeds through canonical GET.
8. Never update the marker with body fields. A marker update is not required to
   make reservation ordering safe.
9. On ordinary POST success or recovered FOUND, retain the marker until the
   receipt is durably presented/acknowledged, then delete it.
10. On canonical RETIRED or safe protocol-not-established UNKNOWN, delete it and
    return to a truthful empty non-success form. Never reconstruct Process-A text.

Only one unresolved marker may exist per installation in this MVP contract.
While it exists, Native blocks another Incident attempt on that installation.
This is a local product guard around an exact operation, not cross-device semantic
deduplication.

### Startup and storage failures

Restore auth and workspace before reading/routing a marker. Validate schema,
installation generation and exact identity/scope before any API call. A matching
marker starts GET-only recovery. RESERVED blocks new submission until explicit
retirement or FOUND. Transport/unavailable response preserves the marker and the
ambiguous state. Cold start never reserves, retires or posts.

A SecureStore read, decode or marker-write failure makes Incident submission
unavailable because the write-before-network invariant cannot be proved. It is a
storage health failure, not a permanent policy sentinel. Retry or repair the
store; do not bypass it.

Delete failure after FOUND, RETIRED or UNKNOWN keeps the UI fenced until secure
cleanup succeeds. A stale readable marker safely re-runs GET and never POST. Do
not claim cleanup until a read confirms the key is absent. There is no
`BLOCKED_REDACTED` value and no installation-wide indefinite anonymous block.

### Logout, account switch and scope retirement

On definitive logout, account replacement, membership retirement or authoritative
Organization/Location access loss:

1. advance the identity generation and fence all old in-memory callbacks;
2. do not query or render the old marker under the new identity;
3. securely delete the old marker as part of the awaited purge boundary;
4. if deletion fails, keep Incident creation unavailable only while secure-store
   cleanup is unconfirmed; retry cleanup through the explicit storage-repair path;
5. after confirmed deletion and healthy storage, a valid new identity may create
   its own operation under current authority.

The server reservation remains bound to the old membership. A new account cannot
read or retire it even if it learns the ID. An old in-flight request is still
subject to the server reservation/admission contract. Shift end and session
completion are not identity purge: keep the marker so the original actor can
recover under §7.

Exact idempotency is membership-and-ID scoped. A new account, device or new ID can
describe the same real-world occurrence; this protocol makes no semantic
deduplication claim across those operations.

## 10. User-visible states and process-death boundaries

| State | Truth and permitted action |
| --- | --- |
| No pending recovery | Store is healthy and empty; a new form may begin under current creation authority |
| Checking previous Incident result | Auth/context restored; canonical GET pending; no mutation or new report |
| Previous Incident confirmed | FOUND proves the exact opening receipt; show it without requiring current custody detail; clear only after acknowledgement |
| Previous attempt reserved / outcome unknown | RESERVED and no Incident; do not show success or allow a new submission; offer GET retry and explicit foreground retirement |
| Previous Incident definitively not committed | RETIRED proves the exact ID cannot later create an Incident; clear marker and return to an empty non-success form |
| Recovery protocol not established | UNKNOWN after canonical serialized read; no Incident and no matching server binding. Because POST dispatch required reservation success, close as non-success without claiming a legacy negative |
| Recovery unavailable | Network/auth-transient/lock/server/storage outcome is ambiguous; retain marker and block duplicate local submission |
| Recovery invalidated by identity/scope | Fence callbacks, hide and purge old marker; new identity cannot access old server operation |
| Local retention deadline reached | Do not call it success/absence and do not delete solely to bypass recovery; follow §11 owner-approved retention handling |

Never say “queued” or “will sync.” Never show success before FOUND. Never
automatically reserve, retire or POST. Recovery must work without the old route,
session-detail permission or Process-A free text. Presentation requires EN/AR and
RTL identifier isolation through existing employee UI boundaries.

| Case | Required proof / disposition |
| --- | --- |
| A: marker written, reservation never sent | Incident POST was not legal to dispatch. GET returns UNKNOWN; close as truthful non-success after cleanup, with zero Incident/audit |
| B: reservation never commits | No RESERVED response exists, so Native dispatches no POST. Any recovery-mode POST without a committed matching reservation is rejected |
| C: reservation commits, response lost | Process B GET finds exact actor-bound RESERVED; no Incident success is shown |
| D: reservation commits, POST never sent | GET RESERVED; explicit original-actor retirement commits RETIRED and produces definitive non-success |
| E: reservation and Incident commit, response lost | GET FOUND for exact ID; exactly one Incident and `INCIDENT_OPENED` |
| F: Incident POST in flight | Shared operation lock makes recovery wait if POST holds it; otherwise RESERVED remains ambiguous until POST or retirement wins |
| G: retirement wins before delayed POST | RETIRED commits first; delayed POST must reject and cannot insert Incident/audit |
| H: Incident POST wins first | Incident plus audit commit first; recovery/retirement returns FOUND |
| I: transaction rollback | Reservation rollback gives UNKNOWN; Incident rollback leaves RESERVED; neither produces fake success |
| J: API unavailable | Keep marker and ambiguous state; no new Incident and no automatic replay |
| Caller disconnects | Disconnect proves nothing; use the corresponding reservation/POST recovery state |
| Different account | Purge/hide local marker; server denies old intent/report; healthy new account is not permanently disabled |
| Membership/Location revoked | Deny recovery and purge local marker after authoritative scope loss; never convert denial to absence |
| Shift ended | Recover own RESERVED/RETIRED/FOUND without active Shift; new reservation/Incident still requires current creation authority |
| Session COMPLETED | Recover own exact result/intent; no Incident creation, custody reopening or Task creation |
| Multiple Incidents | Exact ID returns only its report; no latest/list/payload matching |
| Changed type/severity/description | Process B has no old body. Retire/resolve old operation first, then enter a new form/new ID. Same committed ID with changed payload still conflicts |
| Store write fails before POST | Send zero network mutation |

## 11. TTL and retention

The Accepted contract fixes two separate retention values.

`T_server_active` is **15 minutes**. The database computes `created_at` and
`expires_at = created_at + interval '15 minutes'` when reservation is inserted.
Reservation occurs immediately before Incident POST. A matching recovery-enabled
POST is admitted only while the intent is RESERVED and authoritative
`database_now < expires_at`. At or after expiry, the ID is terminal for Incident
admission forever: delayed POST is rejected and canonical recovery projects
effective RETIRED. Expiry never deletes, reopens or permits reuse of the ID.

`T_local` is a **24-hour soft recovery deadline**, absolute and non-sliding from
marker `createdAt`. It is device scheduling/presentation metadata, not server
authority and not proof of non-commit. Native cannot promise exact action at 24
hours while the OS is terminated or the device is offline.

After the soft deadline, same-identity Native must obtain canonical online
recovery before clearing the old marker for new Incident work. FOUND, RETIRED or
protocol-safe UNKNOWN resolves according to §9–10. RESERVED still requires an
explicit foreground retirement or a later authoritative terminal result. If the
API is unavailable, the UI remains truthfully recovery-unavailable; it does not
clear the marker, infer absence or enable a new Incident automatically.

The privacy rationale is that the device retains only operation metadata, never
Incident content or free text. The availability rationale is that 24 hours covers
the selected field/support recovery window without treating the marker as a
long-lived draft.

Server RETIRED and effectively expired rows are retained indefinitely as minimal
exact-ID tombstones for MVP. There is no automatic cleanup worker. Any future
compaction requires a separate decision proving old recovery IDs can never be
admitted again.

After logout or identity/scope retirement, local deletion follows §9 regardless
of outcome; the old actor-bound server row remains inaccessible to the new actor.
Uninstall or app-data loss may erase local recovery identity and therefore the
ability to display a prior result. It does not delete, retire or authorize the
server intent, and it is not a recovery or duplicate-prevention mechanism.

## 12. Audit, database, privileges and rollout

### Audit

Incident creation keeps exactly one append-only `INCIDENT_OPENED`, atomic with
the Incident insert. Exact retry and every recovery-intent operation add zero
opening events. Existing audit metadata may include incidentId, severity, status
and type but never description.

The owner selects **no Black Box event for reservation and no Black Box event for
retirement or expiry**. Recovery intents are reliability/admission metadata. They
do not assert that an Incident occurred, change custody, affect a guest, create a
Task or exercise a business Incident lifecycle transition. The retained intent
row already records actor membership, scope, creation, expiry and retirement
timestamps and contains no description/content. Adding events for abandoned forms
would incorrectly make them appear to be business Incidents.

Exactly one `INCIDENT_OPENED` is written only when an Incident actually commits.
If future support or threat evidence establishes a separate durable intent-audit
need, it requires a new minimal event review; free text remains forbidden.

### DB and runtime privileges

Future implementation requires one forward-only coordinated migration for
`incident_recovery_intents`, the constraints/FKs in §5, and the migration-owned
transition guard. This is compatible with repository convention: existing Staff
push and tracking-session migrations use focused `BEFORE INSERT OR UPDATE` or
`BEFORE UPDATE` trigger functions to enforce immutable identity and terminal
state. No Incident, audit, custody or Task schema change and no new Incident index
is authorized. The shared lock and mandatory writer checks enforce cross-table
state; two unrelated primary keys alone do not.

DEC-059's existing incidents SELECT is sufficient for canonical lookup, so no new
Incident-table privilege is needed. The new table needs runtime SELECT, INSERT
on only the binding columns, and column-limited UPDATE of only `state`. The
database trigger authors all timestamps. Deny direct timestamp/binding UPDATE,
DELETE, broad UPDATE, TRUNCATE, REFERENCES, TRIGGER, function-management/DDL and
PUBLIC function execution. Provisioning remains separate from migration. Tests
must use the provisioned runtime role.

Compared with immutable reservation plus retirement facts, this one-row design
adds a narrowly scoped state UPDATE grant and migration-owned guard but removes a
second table, second insert path, join and cross-table uniqueness rule. The guard,
column privileges, operation lock and retained terminal row provide the actual
database invariant with less surface. A normal runtime attempt to reverse or
rewrite terminal state must fail with a database constraint-class error.

### Backward-compatible deployment

A recovery-aware Native client must never send traffic while any API replica may
ignore its admission rule. Safe order:

1. Deploy migration and least-privilege grants; verify them.
2. Deploy API code to every replica with recovery-ID recognition, reservation,
   read/retirement routes and mandatory recovery POST admission. Keep Native
   protocol enrollment disabled.
3. Prove every serving replica reports the narrow capability
   `incident-recovery-intent-v1` and rejects an unreserved recovery ID. This may
   be a deployment readiness check; it is not a general API-version framework.
4. Only then enable/release recovery-aware Native generation and storage.
5. Existing Web and old Native version-4 calls continue unchanged throughout.

An updated Native process may use legacy behavior only for an operation begun as
legacy before recovery-protocol enrollment. Once it writes a recovery-mode marker,
that exact version-8 ID can use only the reservation-required path. It cannot
fall back after timeout, ambiguity, restart or a missing header.

Rollback disables new Native protocol enrollment and the new recovery UI first.
The recovery-ID admission check and table/tombstones must remain on every writer
for IDs already issued. Do not roll back to an API that treats version-8 tracked
IDs as legacy, drop the table, delete terminal rows or route around the guard.

## 13. Exact implementation child handoff

`MOB-023B-INCIDENT-RECOVERY-IMPLEMENTATION` is authorized to begin from this
Accepted contract, subject to the §15 implementation validation gates. Fetch fresh
main, coordinate the migration owner and preserve focused file ownership/size
rules. No new dependency is expected. This acceptance commit does not begin that
implementation child.

Paths marked new are required future implementation files, not files created by
this acceptance branch.

| Area | Exact future scope |
| --- | --- |
| Contracts | New `packages/contracts/src/incident-recovery.ts`: protocol token/header, recovery-ID validator, reservation/retirement params and strict FOUND/RESERVED/RETIRED/UNKNOWN response union; reuse `ReportIncidentResponse`; focused tests and `src/index.ts` export. Keep `src/incidents.ts` four-field body |
| Portable client | New `packages/employee-client/src/incident-recovery-{types,store,state,transport}.ts` with the exact no-userId marker/store interfaces, binding to the current Staff membership context, protocol ID generation/validation and explicit reserve/read/retire calls; focused tests/exports. Do not extend generic `recovery-policy.ts` to mutations |
| API shared operation | New `apps/api/src/modules/incidents/incident-operation-lock.ts` and focused authorization helper; keep one canonical advisory key/lock order |
| API intent | New `incident-recovery-intent-command.ts`, `incident-recovery-retirement-command.ts`, `incident-recovery-query.ts`: actor-derived binding, one-way state, expiry and exact result projection |
| API transport | New focused `incident-recovery.controller.ts` and `incident-recovery.service.ts`; wire through existing `apps/api/src/modules/staff/staff.module.ts`, principal resolver, runtime pool and error boundary |
| Existing POST | Update `incident-reporting.controller.ts` for strict protocol header handling and `incident-reporting-command.ts` for recovery-ID detection, matching active-intent admission, terminal rejection and shared lock. Preserve legacy v4 and exact-payload behavior |
| API proof | New `apps/api/test/incident-recovery-{authorization,intent,serialization,rollout}.integration.test.ts` and focused harness changes; extend current Staff Incident tests for legacy and required-mode admission |
| Native store | New `apps/valet-native/src/incident/expo-incident-recovery-store.ts`, using namespaced SecureStore, the exact §9 fields without userId, and current platform backup/device behavior; auth storage remains separate |
| Native orchestration | New `src/incident/native-incident-recovery.ts`; integrate `native-incident-session.ts` with marker-before-reservation-before-POST ordering, v8 generation, singleton pending guard and explicit retirement. Integrate awaited purge/fencing in `src/auth/native-auth-runtime.ts`, `identity-state-boundary.ts`, `native-production-bootstrap.ts` and scope-retirement owners |
| Native presentation | Focused changes to `native-incident-{types,screen,form,copy}.ts(x)` and shell composition for the §10 states, EN/AR, receipt independent of custody detail and recovery after Shift/session terminality |
| Native proof | New `test/native-incident-recovery-{store,process-death,scope,parity}.test.ts(x)`; extend process-death routing/recovery, Incident lifecycle and identity-purge suites |
| DB | Update `packages/database/prisma/schema.prisma`; add one coordinated `prisma/migrations/<timestamp>_incident_recovery_intents/migration.sql` containing the table, constraints and transition-guard function/trigger; add provisioned-runtime reverse-transition, immutability and deterministic expiry proof; update `scripts/runtime-table-privileges.mjs` and verifier for exact column grants and denied trigger/DDL authority |
| Docs | This acceptance commit synchronizes DEC status and the concise decision-log summary. The implementation child updates database/security/recovery docs and MOB-023B evidence only after implementation and independent review; decision acceptance alone does not close MOB-023B or G7 |

## 14. Deterministic future test matrix

Use genuine PostgreSQL with separate clients and gates at known transaction
points. Observe blocking/visibility, release the gate, then assert persisted rows
and responses. Unit lock simulation and timing sleeps are insufficient. Process B
is a fresh production owner sharing only the permitted SecureStore marker and
server state.

1. Actual adapter serialization contains exactly the §9 fields and no `userId`.
   Membership/context matching uses the current `staff-context.ts` shape.
2. Forged local membershipId, Organization or Location values grant no server
   authority; authenticated principal ownership and persisted scope decide.
3. Marker write/confirmation failure causes zero network mutations: no reservation
   and no Incident POST.
4. Instrumented Native proves marker commit precedes reservation and validated
   reservation response precedes Incident POST dispatch.
5. Process death before reservation sends no POST; GET UNKNOWN closes as truthful
   non-success with zero Incident/audit.
6. Reservation transaction rollback or database failure leaves no intent; any
   recovery POST is rejected and GET is UNKNOWN.
7. Reservation commits but its response is cut; fresh Process B GET returns the
   exact actor-bound RESERVED row without automatic POST.
8. Reservation commits, Process A dies before Incident dispatch; GET RESERVED;
   explicit retirement yields RETIRED and no Incident/`INCIDENT_OPENED`.
9. Death immediately after Incident transport dispatch is exercised before API
   transaction start, before operation lock and while holding it.
10. Incident plus `INCIDENT_OPENED` commit, response is lost, Process A dies;
    Process B GET returns FOUND and exactly one of each row/event exists.
11. Pause delayed POST before operation lock; retirement commits first; resumed
    POST sees RETIRED and inserts zero Incident/opening audit.
12. POST obtains operation lock first; retirement blocks, then returns FOUND after
    commit. Repeat with POST rollback, which leaves RESERVED and allows retirement.
13. One valid RESERVED-to-RETIRED transition succeeds; concurrent retirements
    converge on the same terminal row and cannot reverse or rewrite it.
14. Reservation holds lock while recovery starts: commit yields RESERVED; rollback
    yields UNKNOWN. Prove fresh post-lock SELECT visibility.
15. Same actor/membership/session/scope reservation retry is idempotent; two API
    processes create one row. Response loss remains recoverable.
16. Different Employee and different Supervisor cannot read, overwrite, reserve
    over or retire the ID; responses disclose no foreign state.
17. Same authenticated principal under a different OrganizationMembership is
    denied. Wrong Organization/Location, revoked membership/access, inactive User/
    Organization/Location, management role, anonymous and cross-tenant callers
    are denied.
18. End Shift after reservation and after Incident commit: exact original actor
    can recover/retire, but cannot create without a new qualifying Shift.
19. Complete ValetSession after reservation and after Incident commit: exact
    recovery/retirement works; reservation/new Incident/custody/Task mutation does not.
20. Multiple legitimate Incidents on one session return only the requested exact
    ID, including repeated type/severity/description values.
21. Same ID plus same exact normalized payload retains current same-process retry
    behavior; changed type/severity/description conflicts after applicable current
    authorization.
22. API unavailable at reservation or recovery leaves marker ambiguous, blocks a
    new local submission and causes zero automatic mutation/replay.
23. Logout/account switch fences callbacks, hides old data and purges marker. New
    membership cannot read/retire the old intent and can report after confirmed
    store cleanup.
24. Secure deletion failure keeps only the local Incident surface unavailable
    until cleanup succeeds; recovery after store repair proves there is no durable
    `BLOCKED_REDACTED` sentinel or permanent policy brick.
25. Authoritative membership/Location revoke races with GET/retirement; lock order
    observes the winner and never discloses after revocation.
26. The absolute 24-hour local deadline alone never produces server ABSENT/
    RETIRED, clears the marker, or enables a new Incident. Offline at the deadline
    stays recovery-unavailable.
27. Online recovery after the local deadline still resolves FOUND and RETIRED;
    RESERVED requires explicit retirement and protocol-safe UNKNOWN resolves only
    under the ordering proof.
28. With deterministic database-controlled timestamps rather than sleeps, a valid
    matching POST at 14:59 after reservation is admitted and a POST at 15:00 or
    later is rejected by the exact `database_now < expires_at` predicate.
29. Expired reservation projects effective RETIRED and remains terminal across
    later POST, GET, retirement, restart and arbitrary elapsed time; no row is
    deleted or reopened.
30. Existing Web and old Native version-4 requests pass throughout rollout and
    preserve their four-field contract/idempotency.
31. Recovery version-8 ID without the exact protocol header, protocol header with
    wrong ID class, absent intent, foreign intent, expired intent and RETIRED intent
    all reject before Incident/audit insertion.
32. Exact Native-generated UUIDv8 values are RFC 9562-valid and accepted by the
    contracts/Zod/API/PostgreSQL path; every non-version/non-variant bit is sourced
    from current platform CSPRNG primitives and encodes no business data.
33. A tracked Native attempt cannot downgrade to legacy by omitting the header or
    using the legacy transport path with the same ID.
34. Two API replicas with a mixed rollout fail the deployment capability gate;
    no recovery Native traffic is enabled until every writer enforces admission.
35. Real PostgreSQL proves reservation/POST/read/retirement races under the chosen
    isolation level and exact User/session/membership/access/Shift/Task/operation
    lock order without deadlock.
36. Using the provisioned runtime role, direct RETIRED-to-RESERVED, clearing or
    changing `retired_at`, and updates to actor/session/Organization/Location/
    created/expiry binding all fail at the database transition guard.
37. Provisioned runtime can SELECT intents, INSERT only binding fields and UPDATE
    only state. It cannot directly author timestamps, delete rows, manage/disable
    triggers/functions, broaden Incident/audit access or use PUBLIC privileges.
38. Exactly one Incident and `INCIDENT_OPENED` exist across retries, response loss,
    two authenticated same-actor readers and competing retirement. Reservation,
    retirement and expiry emit no opening or Black Box business audit.
39. Actual SecureStore writes, backup artifacts, logs, diagnostics and navigation
    persistence contain no userId, description/type/severity/body/hash,
    Authorization, access/refresh token, Guest proof or customer/vehicle/key data.
40. Cold start, reconnect, foregrounding and network restoration issue canonical
    GET only. They never auto-reserve, auto-retire, auto-POST or schedule replay.
41. Recovery transport rejects body/query extras and exposes no list, search,
    latest, payload matching, Dashboard delegation or other reporter's result.
42. Android process-death/storage/backup behavior and iOS same-source SecureStore,
    installation-generation and build smoke pass. Automated checks are not
    physical evidence.
43. Uninstall/app-data loss is documented as lost local recovery capability, not
    as server retirement or a supported ambiguity reset.

Run targeted contracts/API/database, portable and Native tests, lint, typecheck,
builds, architecture checks and Prettier under the plan's task
profiles. Record CI separately. Future EN/AR, physical process-death/SecureStore
evidence and iOS proof retain their existing gates; this Accepted DEC claims none.

## 15. Owner selections, consequences, rollback and non-goals

The Accepted decision records the owner's selected retention and audit inputs:

1. `T_server_active` is 15 minutes from authoritative database creation time.
2. `T_local` is an absolute, non-sliding 24-hour soft recovery deadline with the
   online-resolution behavior in §11.
3. Terminal server rows are retained indefinitely for MVP with no cleanup worker.
4. Reservation, retirement and expiry emit no Black Box event; Incident commit
   emits exactly one `INCIDENT_OPENED`.

No retention or audit value remains open. Owner and independent architecture
review are complete. Implementation must still validate the database guard,
PostgreSQL locking/visibility, exact UUIDv8 discriminator, existing-client data
and strict rollout floor specified by this contract. Failure requiring a new
dependency, different discriminator or weakened invariant returns for a focused
owner amendment rather than silently expanding scope.

Benefits are actor-owned unused IDs, exact positive recovery, definitive terminal
non-success, no Incident content on device or intent table, no permanent anonymous
installation sentinel, and truthful recovery after Shift/session terminality.
Costs are one migration/table, a normal-path reservation round trip, a small
retained server tombstone, a migration-owned transition guard, narrow state-only
UPDATE privilege, explicit foreground retirement and coordinated rollout.

Until the implementation child passes independent implementation review, retain
the current truthful blocked process-death state. Do not generate a new ID to hide
ambiguity, call Dashboard as Employee, persist a body, weaken POST admission or
fabricate success. If an implementation validation gate fails, amend or supersede
this decision explicitly; do not weaken the Accepted contract in code.

Non-goals: durable drafts, generic queue/journal/outbox, automatic or background
mutations, Incident list/search/edit/resolve lifecycle, custody/Task/payment/auth
policy changes, Guest proof persistence, new dependencies, third-party services,
cross-device/account semantic deduplication, MOB-024A, release acceptance or
physical-evidence claims.

**MOB-023B remains BLOCKED pending implementation and independent implementation
review. Its remaining child is MOB-023B-INCIDENT-RECOVERY-IMPLEMENTATION. G7
remains OPEN. Physical evidence remains: DEFERRED — owner deferred physical
evidence gate.**
