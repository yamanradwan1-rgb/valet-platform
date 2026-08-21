# Production evidence & failure-mode gates — v1.0

Use this reference for production-affecting VAYLET work: deployable services, Docker/CI, migrations, background jobs, queues, webhooks, payments, external HTTP, authentication/authorization, secrets, or concurrency-sensitive state.

## Evidence ladder

Never collapse these evidence levels into one another:

1. **IMPLEMENTED** — code/config exists.
2. **STATIC VERIFIED** — lint/typecheck/schema validation passed.
3. **LOCAL COMMAND VERIFIED** — tests/build/migration command passed locally.
4. **RUNTIME VERIFIED** — the real process/container stack started and the real path was exercised.
5. **FAILURE VERIFIED** — the real failure mode was induced and recovery observed.
6. **CI VERIFIED** — the actual remote CI run completed successfully.
7. **PRODUCTION-READY** — remaining risks and operational conditions were reviewed and no blocking condition remains.

A lower level never proves a higher one.

Examples:

- `tsc --noEmit` is typechecking, not linting.
- a Docker image build is not container-runtime verification.
- `docker compose up` is not sufficient without process/health/log/dependency checks.
- a workflow file is not a successful GitHub Actions run.
- `db push`/schema sync is not versioned migration verification.
- a mocked exception is not proof of SIGKILL/OOM/container-loss recovery.
- authentication tests are not object-level authorization/IDOR tests.

## Claim discipline

For every completion/security/reliability claim ask:

- What exact command, runtime observation, test, log, DB record, or CI run proves this?
- Was the test performed against the real boundary named in the claim?
- Is the evidence current for this checkout?
- Does the evidence prove the whole claim or only a sampled case?

Avoid absolute language such as `immune`, `100% secure`, `cannot fail`, `exactly once`, or `production ready` unless the architecture and evidence genuinely justify it.

Prefer bounded language such as:

- `No SQL-injection path was identified in the reviewed query paths.`
- `Object-level authorization was verified for the tested cross-tenant cases.`
- `Runtime startup was verified under Docker Compose.`
- `GitHub Actions was not run; only its local commands were verified.`

## Real migration gate

When migrations are relevant:

- require versioned migration artifacts;
- verify on an empty database;
- verify on representative existing data;
- inspect data preservation and constraints;
- distinguish development schema synchronization from deployment migrations;
- do not edit historical migrations unless repository policy explicitly allows it.

## Real Docker/runtime gate

For a deployable stack, verification should include as applicable:

- build images;
- start the actual stack;
- inspect `compose ps`/container state;
- exercise health/readiness and at least one real business path;
- verify the application connects to its intended database/queue, not a leftover local service;
- inspect startup/runtime logs for fatal/repeating errors;
- verify restart behavior when the task claims restart safety.

Do not reuse an unrelated existing database/container as evidence that the project's declared Compose stack works.

## CI gate

Keep these claims distinct:

- CI workflow **configured**;
- CI commands **verified locally**;
- CI workflow **actually executed remotely and passed**.

Never report the third unless the actual run was observed.

## Authorization / IDOR gate

For object-level authorization, require at least one real negative test with two distinct principals/scopes:

- actor A owns/controls resource X;
- actor B is authenticated but unauthorized for X;
- actor B attempts the protected read/mutation;
- the request is denied without mutating or disclosing protected state.

`GET /me` unauthenticated tests prove authentication, not IDOR protection.

## Concurrency and idempotency gate

When concurrency matters:

- prefer database constraints for impossible states;
- exercise genuinely concurrent transactions/requests where feasible;
- distinguish a logical-record uniqueness guarantee from external-side-effect delivery semantics;
- test stale writers/retries and terminal-state protection;
- do not treat a transaction wrapper alone as proof against lost updates.

For logical uniqueness, verify the database has the relevant constraint (for example a scoped composite UNIQUE), not only application-side checks.

## Dual-write gate

For `database + queue/external side effect` flows, explicitly test or reason through:

1. DB commit succeeds, enqueue/send fails.
2. enqueue/send succeeds, DB commit fails.
3. process crashes between both operations.
4. recovery process races with live processing.

Use an accepted durable pattern such as a transactional outbox or durable pending state plus an idempotent reconciler when required by the invariant.

## Worker crash / lease gate

Graceful shutdown is not crash recovery.

If work moves to `PROCESSING`/in-flight state, hard-crash recovery must not rely on code in the killed process calling `nack`, cleanup, or requeue.

For SIGKILL/OOM/container-loss safety, require an independent recovery mechanism such as:

- queue-native stalled-job recovery; or
- visibility timeout / lease expiration; or
- persisted `locked_by` + `lease_expires_at` + safe sweeper.

A sweeper that simply requeues every `PROCESSING` job can race a healthy worker and duplicate execution. Prove how active work is distinguished from orphaned work.

## External side-effect semantics

Do not claim exactly-once delivery for remote HTTP/webhook/payment/email effects when this sequence is possible:

1. remote system accepts the side effect;
2. local process crashes before persisting success;
3. recovery retries.

Document at-least-once behavior and stable idempotency/event identifiers unless the remote system participates in a stronger protocol.

## SSRF gate for user-controlled URLs

When the application sends requests to user-controlled destinations, test more than direct IPv4 literals.

Consider:

- localhost and loopback;
- RFC1918/private ranges;
- link-local/cloud metadata;
- IPv6 loopback/private/link-local;
- IPv4-mapped IPv6 such as `::ffff:127.0.0.1`;
- hostname resolving to a blocked IP;
- redirects to blocked/private targets;
- redirect chains and maximum hops;
- DNS rebinding / validation-to-connect TOCTOU;
- URL credentials and unsupported schemes.

If DNS is validated separately from the socket connection, state the residual rebinding risk. Production may require socket-level IP pinning, an egress proxy, firewall/security-group controls, or equivalent network enforcement.

## Secret-handling gate

Check both exposure and storage:

- never return long-lived secrets after their allowed one-time reveal;
- redact secrets, Authorization headers, tokens, passwords, signatures, and sensitive headers from logs/audit;
- do not store complete request/response headers blindly;
- a secret needed later for HMAC/decryption cannot be replaced by a one-way hash;
- if recoverable secrets are persisted, prefer approved encryption-at-rest/key-management and document residual conditions if not available.

## Readiness classification

When a task asks for production readiness, use exactly one bounded verdict when appropriate:

- `NOT READY` — a blocker or unverified critical invariant remains.
- `READY WITH CONDITIONS` — core behavior is verified but explicit deployment/security/scale conditions remain.
- `READY` — critical invariants and runtime/failure evidence are complete for the accepted scope and no known blocking production condition remains.

Do not choose `READY` merely because tests/builds are green.
