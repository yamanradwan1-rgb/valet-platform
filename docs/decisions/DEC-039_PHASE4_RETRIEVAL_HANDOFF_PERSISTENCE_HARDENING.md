# DEC-039 — Phase 4 Retrieval & Handoff Persistence Hardening

Status: Proposed  
Date: 2026-08-12  
Issue: #129 (`VAL-006A — Retrieval & Handoff Persistence Hardening / Contract Lock`)

## Context

Phase 4 begins from the completed Phase 3 backend and the merged binding execution plan in `docs/19_PHASE4_RETRIEVAL_HANDOFF_EXECUTION_PLAN.md`.

The repository already contains substantial Retrieval and handoff persistence created before Phase 4 command implementation:

- `RetrievalRequest` with requester identity, status and request/cancellation timestamps;
- a PostgreSQL partial unique index allowing at most one active `OPEN`/`ACCEPTED` RetrievalRequest per ValetSession;
- `Task.type = RETRIEVAL` plus the accepted Phase 3 one-active-task-per-`(valet_session_id, task_type)` boundary;
- `HandoffVerification` with `PICKUP_CODE`, `DYNAMIC_QR` and `SUPERVISOR_OVERRIDE` methods;
- hashed standard verification secret storage, expiry, attempt counters, verification/consumption fields and supervisor-override actor/reason fields;
- `KeyCustodyEventType.RELEASED` compatibility;
- ValetSession states/timestamps for `REQUESTED`, `RETRIEVING`, `READY`, `HANDOFF_PENDING` and `COMPLETED`.

VAL-006A must therefore harden and lock this existing persistence rather than recreate it.

A fresh review of the current production least-privilege provisioning also found one concrete runtime dependency: after PR #124, `packages/database/scripts/runtime-table-privileges.mjs` grants ordinary runtime `SELECT, INSERT, UPDATE` only to the explicitly listed operational tables. `retrieval_requests` and `handoff_verifications` are not currently in that list. Because the provisioning script first revokes all runtime privileges on all tables, Phase 4 runtime code cannot safely use those two existing tables until their least-privilege operational grants are explicitly added and verified.

This is a runtime privilege/provisioning defect for the upcoming Phase 4 boundary, not evidence that the schema itself must be redesigned.

## Decision

### 1. VAL-006A is a hardening slice, not a greenfield persistence slice

VAL-006A owns only:

- exact persistence semantics for existing RetrievalRequest rows;
- exact persistence semantics for existing HandoffVerification rows;
- confirmation of the existing RetrievalRequest/Task relationship boundary;
- verification of current database constraints and tenant integrity;
- the narrow runtime-role privilege extension required to let the production API use these stateful Phase 4 tables;
- focused persistence/privilege tests and binding documentation updates needed by this decision.

VAL-006A does not implement any public guest/staff Retrieval or handoff command.

### 2. Database schema remains at exactly 20 forward-only migrations

No migration 21 is authorized by DEC-039.

VAL-006A must not modify:

- `packages/database/prisma/schema.prisma`;
- migrations 1–20;
- RetrievalRequest enum shape;
- HandoffVerification enum/column shape;
- Task/Dispatch enum or relation shape;
- ValetSession state/timestamp shape;
- KeyCustodyEvent enum shape.

The current schema already contains the persistence required for the normal Phase 4 path.

If implementation proves a critical invariant cannot be enforced safely without a schema change, VAL-006A must stop and raise a new focused decision instead of silently creating migration 21.

### 3. RetrievalRequest lifecycle semantics

The existing RetrievalRequest statuses are sufficient and remain exactly:

```text
OPEN
ACCEPTED
CANCELLED
COMPLETED
```

They have the following Phase 4 meanings:

#### `OPEN`

- created by the later successful `request-retrieval` command;
- represents the current active guest/staff request before physical Retrieval has started;
- remains `OPEN` while the Retrieval Task is independently `QUEUED`, `ASSIGNED` or `ACCEPTED`;
- Task assignment or Task acceptance alone does not mutate RetrievalRequest status.

This preserves the accepted separation between request intent, Task/Dispatch assignment and physical ValetSession custody.

#### `ACCEPTED`

- set only when the later `start-retrieval` command successfully performs `REQUESTED -> RETRIEVING`;
- means the request is now being physically fulfilled;
- remains active through `RETRIEVING`, `READY` and `HANDOFF_PENDING` until final completion.

The ValetSession `retrieval_started_at` timestamp is the authoritative start time; no separate `accepted_at` column is introduced.

#### `CANCELLED`

- terminal RetrievalRequest outcome for the accepted early-cancellation flow before physical Retrieval starts;
- later cancellation command must set `cancelled_at` using server/database-authoritative time;
- a cancelled request is not active and permits a later new Retrieval request when the ValetSession has safely returned to `PARKED`.

Cancellation after physical Retrieval has started is not represented by simply changing this row; that remains a separately accepted exception flow.

#### `COMPLETED`

- terminal RetrievalRequest outcome written only by the later successful vehicle-release/session-completion transaction;
- ValetSession `completed_at` is the authoritative completion timestamp; no redundant RetrievalRequest `completed_at` column is introduced.

### 4. Existing one-active RetrievalRequest constraint is final for VAL-006A

The current PostgreSQL partial unique index remains authoritative:

```text
one active RetrievalRequest per ValetSession
where status IN (OPEN, ACCEPTED)
```

No second active-request flag, projection table or duplicate-suppression column is introduced.

The later `request-retrieval` command must compose this database constraint with a locked ValetSession transaction and semantic retry handling. UI suppression is never a substitute for this database boundary.

### 5. RetrievalRequest and Retrieval Task remain related through ValetSession, not a new direct foreign key

DEC-039 does not add `retrieval_request_id` to Task or `task_id` to RetrievalRequest.

The authoritative active-operation relationship is:

```text
RetrievalRequest.valet_session_id
Task.valet_session_id
Task.task_type = RETRIEVAL
```

combined with:

- at most one active RetrievalRequest for the session; and
- at most one active Retrieval Task for `(valet_session_id, RETRIEVAL)`.

The later command that creates the request must create/queue the Retrieval Task in the same protected transaction so the active pair cannot split into two competing operations.

Historical cancelled/completed request/task rows remain explainable through ValetSession scope plus append-only Audit/Dispatch chronology. The Blueprint does not require a new direct Request-to-Task persistence relation, so VAL-006A does not invent one.

### 6. HandoffVerification is retained stateful security persistence, not an append-only Black Box table

`HandoffVerification` rows are retained security records whose controlled fields must change during verification lifecycle processing.

They are not classified as append-only event rows because later Phase 4 commands must be able to:

- increment `attempt_count`;
- set `verified_at` and `verified_by_membership_id`;
- set `consumed_at` when the verification is terminalized/non-reusable.

Black Box/Audit evidence remains append-only in `AuditEvent`; HandoffVerification rows must not be hard-deleted to hide their history.

### 7. `verified_at` and `consumed_at` have distinct meanings

For every HandoffVerification row:

- `verified_at` means the submitted proof/override was successfully accepted by the protected verification command;
- `verified_at` does **not** by itself mean the vehicle was released;
- `consumed_at` means that verification row is terminalized and must never be accepted again.

The normal happy path is:

```text
created
-> verified_at set
-> complete-handoff succeeds
-> consumed_at set atomically with release/completion
```

A safe abort, rotation/reissue or terminal attempt-lockout may also terminalize a row by setting `consumed_at` before another credential becomes authoritative. The later handoff command decision owns those exact transitions and required AuditEvents.

An expired standard verification is unusable even if `consumed_at` is still null. Reissue logic must safely terminalize/supersede any prior authoritative attempt before a replacement can be used.

### 8. No new HandoffVerification active-row unique index is introduced in VAL-006A

The current schema does not need a speculative `is_active` field or new partial unique index before the handoff command contract is finalized.

The later `begin-handoff` / verification issuance boundary must serialize authority by locking the ValetSession and guarding the accepted state/version transition into `HANDOFF_PENDING`. A verification row must never be issued through a loose standalone path that bypasses that protected session transition.

This gives one authoritative handoff attempt per successful protected begin/rotation transaction while allowing expired/consumed historical rows to remain retained.

If VAL-006F later proves that its accepted issuance policy requires a database-enforced concurrent-method uniqueness shape that cannot be expressed safely with the existing columns and session lock, that requirement must receive its own focused schema decision. It is not guessed in VAL-006A.

### 9. Standard handoff secret persistence remains fail-closed

The existing fields are sufficient for later Standard pickup-code / Dynamic-QR verification provided the command layer obeys these rules:

- raw pickup code / QR bearer material is never persisted;
- only the accepted cryptographic verifier/hash is stored;
- standard secrets require server-authoritative expiry;
- pickup-code attempts are bounded by positive `max_attempts`;
- failed verification updates attempt state transactionally and must fail closed at the accepted limit;
- expired, consumed or otherwise terminalized rows cannot verify;
- plaintext secret, bearer material and verification input must never enter logs or Audit metadata.

Exact code length/format, secret-generation algorithm, TTL, rate-limit window and user-facing errors belong to VAL-006F and are not invented here.

### 10. Supervisor override persistence is structurally sufficient

The existing database guard already requires a `SUPERVISOR_OVERRIDE` row to contain:

- `verified_by_membership_id`; and
- a non-empty trimmed `override_reason`.

No schema change is required in VAL-006A.

Later VAL-006F must still enforce command-level authorization, same tenant/Location scope, server-authoritative verification time and append-only Audit evidence. Database field presence does not grant override authority.

### 11. Runtime database privileges must be extended narrowly

The current least-privilege provisioning intentionally revokes all runtime privileges and then grants explicit table capabilities.

VAL-006A must add exactly these existing tables to the stateful operational runtime privilege set:

```text
retrieval_requests
handoff_verifications
```

The ordinary runtime role receives only:

```text
SELECT
INSERT
UPDATE
```

on those two tables.

It must not receive:

```text
DELETE
TRUNCATE
DDL
ownership
```

This is required because both rows are stateful lifecycle persistence, unlike append-only `audit_events`, `dispatch_events` and `key_custody_events`, which remain under their existing `SELECT, INSERT` append-only privilege boundary.

The provisioning verifier and integration tests must explicitly prove the intended RetrievalRequest/HandoffVerification capabilities and forbidden destructive capabilities.

### 12. Runtime privilege extension does not authorize Phase 4 commands early

Granting production runtime access to the two existing tables only makes the persistence usable by later accepted commands.

VAL-006A must not expose new controller routes, command executors or service methods that implement:

- request-retrieval;
- cancel-retrieval;
- Retrieval Task assignment/acceptance/reassignment;
- start-retrieval;
- mark-ready;
- begin/verify/abort handoff;
- complete-handoff.

Those remain VAL-006B through VAL-006G.

### 13. Tenant and referential integrity remain unchanged

The existing composite/restrictive relationships remain authoritative:

- RetrievalRequest belongs to the same Organization as its ValetSession and requester;
- HandoffVerification belongs to the same Organization as its ValetSession and optional verifying membership;
- no destructive cascade is introduced;
- Organization/Location/actor authority remains server-derived by later application commands.

No client-supplied organization/location/requester/actor field may establish authority merely because the database relation exists.

### 14. No Configuration First schema is introduced

The Blueprint makes release policy configurable, but VAL-006A does not invent a generic settings blob or typed release-policy table.

Exact Standard method selection, stronger policies and Company-default/Location-override storage are owned by the later focused handoff policy decision when command behavior requires them.

### 15. Required implementation changes for VAL-006A

If DEC-039 is Accepted, the implementation slice is expected to be narrow:

1. extend production runtime least-privilege table configuration for `retrieval_requests` and `handoff_verifications` with `SELECT, INSERT, UPDATE` only;
2. extend the runtime privilege verifier/integration tests to prove those exact capabilities and continued DELETE/TRUNCATE denial;
3. add focused persistence regression tests only where existing RetrievalRequest/HandoffVerification constraints are not already covered;
4. update binding database/domain docs with the exact lifecycle semantics locked here where needed;
5. leave Prisma schema and migrations unchanged.

No feature API is expected in VAL-006A.

### 16. Required verification

VAL-006A must prove at minimum:

1. migration count remains exactly 20;
2. Prisma schema is unchanged;
3. an active `OPEN` or `ACCEPTED` RetrievalRequest still excludes a second active request for the same ValetSession;
4. terminal `CANCELLED`/`COMPLETED` history does not block a later valid active request;
5. requester-type consistency remains database-enforced;
6. standard HandoffVerification requires the existing hash/expiry fields required by its method;
7. supervisor override field-presence constraints remain enforced;
8. runtime role can SELECT/INSERT/UPDATE `retrieval_requests`;
9. runtime role can SELECT/INSERT/UPDATE `handoff_verifications`;
10. runtime role cannot DELETE/TRUNCATE either table;
11. append-only Audit/Dispatch/KeyCustody privilege boundaries remain unchanged;
12. no Retrieval/handoff controller or command behavior is introduced.

Repository checks remain:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

### 17. Explicitly out of scope

DEC-039 / VAL-006A do not define or implement:

- guest request API and guest response contract;
- semantic retry/error precedence for request-retrieval;
- early cancellation command authorization;
- Retrieval Dispatch command composition;
- key checkout / `REQUESTED -> RETRIEVING`;
- READY command;
- exact handoff TTL, code format, QR format, verification rate limit or anti-abuse policy;
- exact release-policy Configuration First storage;
- payment/validation release guards;
- incident blocking policy;
- GPS/maps/tracking;
- messaging delivery;
- UI/PWA;
- offline replay;
- V2/Enterprise behavior.

## Consequences

Positive:

- Phase 4 reuses existing persistence instead of duplicating it;
- no unnecessary migration is added;
- RetrievalRequest lifecycle is cleanly separated from Task acceptance and physical session state;
- HandoffVerification keeps proof acceptance separate from actual vehicle release;
- production least privilege is restored for the exact Phase 4 tables that need stateful runtime mutation;
- later Phase 4 tasks receive a stable persistence boundary.

Trade-offs:

- HandoffVerification active-attempt serialization relies on the later protected ValetSession state/version transaction rather than a new speculative database active flag/index;
- exact credential rotation/abort concurrency semantics remain intentionally owned by VAL-006F;
- no direct Request-to-Task foreign key is added, so historical composition relies on ValetSession scope plus Task type and append-only chronology.

## Implementation boundary

Implementation may begin only after this decision is marked `Accepted` and mirrored in `docs/08_DECISIONS_LOG.md` according to repository decision-log rules.
