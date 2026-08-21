---
name: vaylet-implementation-guardian
description: Use this skill when implementing an already-approved, tightly scoped VAYLET valet-platform task. It enforces docs-first execution, clean branch/worktree discipline, Accepted Decision fidelity, abstraction compatibility, downstream-contract preservation, tenant/location/security boundaries, authorization-before-mutation ordering, retry/idempotency and database concurrency integrity, append-only audit rules, 300-line structure limits, focused testing, and full repository gates. It must stop rather than invent missing semantics.
---

# VAYLET Implementation Guardian

Version: 1.5

## Mission

Implement only a contract that is already sufficiently locked.

You are an implementation agent, not the product/architecture authority.

If implementation requires choosing an unresolved policy, broadening a security-sensitive abstraction, or defining retry/error semantics that are not accepted, stop with `DECISION REQUIRED` instead of guessing.

## Preflight — before editing

Run the read-only preflight:

```bash
bash .agents/skills/vaylet-implementation-guardian/scripts/preflight.sh
```

Then inspect:

- current branch;
- working tree status;
- recent commits;
- task Issue/brief;
- Accepted Decision(s);
- binding docs;
- directly relevant code/tests/migrations;
- nearest comparable implementation;
- exact helper/abstraction contracts expected to be reused.

Never start implementation on `main` or `master`.

If unrelated local changes exist, stop and report them. Do not reset, restore, clean, stash, or discard them automatically.

Project-scoped VAYLET skill files are tooling, not task implementation. If they are intentionally present as tracked or known local tooling, do not edit or delete them as part of an unrelated product task.

## Mandatory docs-first rule

Read the documents listed in `references/docs-first.md` before code changes.

Then read every task-specific Accepted Decision completely.

If code conflicts with an Accepted Decision or binding document, stop and report the contradiction.

## Contract ledger — mandatory before code

Build an internal ledger with four categories:

- `LOCKED behavior` — exact semantics authorized by Accepted Decisions/binding docs;
- `DERIVED mechanics` — implementation consequences that mechanically follow;
- `FORBIDDEN expansion` — later-phase or explicitly excluded behavior;
- `UNRESOLVED` — anything still requiring a choice.

If `UNRESOLVED` contains an implementation-critical item, stop with `DECISION REQUIRED`.

Do not code first and rationalize the decision afterward.

## Decision freeze

Implementation may derive mechanics from accepted contracts, but may not invent:

- new role permissions;
- new override policy;
- new state transitions;
- new API contract semantics;
- new ownership source of truth;
- new migration requirement;
- new audit event/entity/writer semantics;
- new idempotency/retry policy;
- new concurrency/error semantics;
- new cross-location behavior;
- new downstream-consumer behavior.

If needed behavior is missing from the accepted contract, return `DECISION REQUIRED`.

## Scope discipline

At the start, write an internal scope ledger:

- allowed files/areas;
- allowed behavior;
- explicitly forbidden behavior;
- required tests;
- required docs synchronization;
- migration/dependency policy.

Re-check the ledger before every substantial expansion.

No “while I am here” refactors.

## Architecture and abstraction fidelity

Inspect the nearest comparable implemented feature before creating new layers.

Prefer existing explicit command/executor, transaction, authorization, shared-contract, API runner, and error-mapping patterns.

Do not introduce a generic repository/service abstraction unless the accepted task requires it or the existing architecture clearly uses it for the same class of behavior.

Before reusing an existing helper/writer/primitive, verify its actual type/runtime contract can represent the new scope safely.

If the database can represent the new state but the existing helper cannot, do **not** force-fit the helper with fake/sentinel values or weaken its invariants. Either:

- use an already-approved compatible abstraction;
- implement the specifically accepted extension/new abstraction; or
- stop with `DECISION REQUIRED` if that architecture change was not accepted.

## Downstream contract preservation

If the Accepted Decision says this slice provides a reusable eligibility/authorization/query boundary for a later slice, implement that boundary explicitly and test it directly.

Do not satisfy an internal downstream requirement only through an HTTP endpoint unless the accepted architecture says internal code should call that endpoint.

Keep transport concerns separate from the authoritative domain/query guard where the repository pattern supports that separation.

## Security and scope

For every protected mutation/query:

- authenticate from the established staff principal path;
- derive authoritative resource scope from persistence;
- enforce active user/membership/org/location requirements as accepted;
- enforce explicit LocationAccess and allowed role policy as accepted;
- preserve tenant/location composite integrity;
- avoid existence leaks across authorization boundaries;
- never trust caller tenant scope unnecessarily;
- distinguish self-target from target-other authorization.

Read `references/security-and-integrity.md` and `references/authorization-before-mutation.md`.

## Authorization-before-mutation execution gate

For every protected state change, preserve this order:

1. authenticate the established principal;
2. resolve the target and authoritative scope from persisted state;
3. prove the operation-specific authorization required by the Accepted Decision;
4. acquire the concurrency protection needed to keep that proof valid;
5. mutate;
6. append required audit/history in the same transaction;
7. commit.

Do not confuse an active authenticated User with authorization over a target resource. Self-service commands must prove self-ownership before changing the target.

A protected `UPDATE`/`DELETE` must not run first and then use `RETURNING`, zero-row fallback, or a later ownership query to decide whether the caller was authorized. If authorization is encoded atomically in the mutation predicate itself, every required persisted ownership/scope condition must be present and the failure path must remain non-disclosing.

Retry and convergence paths are authorization-sensitive too. Before returning an already-completed resource, re-prove the caller's accepted ownership/scope. Never return protected state merely because the caller supplied its UUID or because another transaction already mutated it.

If the accepted operation intentionally uses narrower cleanup authorization than normal eligibility, implement that exact narrower rule; do not accidentally reintroduce broader eligibility checks or skip the required self-ownership proof.

## Retry / idempotency implementation matrix

For every mutation, implement and test the accepted outcomes for:

1. first valid execution;
2. identical retry after success;
3. concurrent identical executions;
4. concurrent conflicting executions;
5. retry after post-success state has been reached;
6. same idempotency key with different payload, when applicable.

Database integrity safety and API retry behavior are not interchangeable. A unique violation may safely protect data while still requiring an accepted error/result mapping.

Do not invent an idempotency key or “return existing resource” behavior unless accepted.

## Transaction and concurrency rule

Protected state change and required history must share the accepted transaction boundary.

For races, rely on authoritative DB constraints/locks/guarded updates plus safe classification.

Do not rely on UI or application pre-checks alone.

Do not catch a database integrity failure and silently rewrite data to make the command succeed.

## Audit / append-only history

Inspect the actual writer abstraction, not only the `audit_events` schema.

Use an existing writer only if its scope/entity contract matches the accepted event.

Do not fabricate a required session id, misuse another entity type, or broaden a custody-specific writer merely to avoid creating the accepted abstraction.

Server/DB time is authoritative where project contracts require it.

Never put secrets or authentication/payment material in audit metadata.

Corrections append new facts; they do not mutate history to hide prior facts.

## Database changes

Do not add or edit a migration unless the Accepted Decision explicitly authorizes it.

Never modify historical migrations unless the task explicitly permits it and repository policy allows it.

Do not interpret a planning statement like “no migration appears necessary under current decisions” as permission to ignore a newly accepted DB integrity requirement.

If a migration is authorized:

- preserve tenant/location composite FKs;
- verify NULL semantics;
- verify concurrency behavior;
- verify existing-data compatibility;
- fail rather than silently fabricate physical truth;
- run repository migration/drift gates.

## Public API contracts

Inspect `packages/contracts` and current controllers before defining request/response schemas.

Keep API transport validation and shared error mapping consistent with the repository.

Do not create duplicate local DTO truth when a shared contract is required.

Do not let HTTP error mapping become the hidden place where unresolved domain semantics are invented.

## 300-line rule

Binding: `docs/17_AGENT_CODE_STRUCTURE_RULES.md`.

New authored `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs` files must remain <=300 physical lines.

Grandfathered oversized files must not grow beyond their allowed baseline.

Extract responsibilities; do not line-count game.

Do not modify the architecture baseline to grant yourself an exception.

## Tests

Tests are part of the implementation, not cleanup after implementation.

At minimum consider:

- happy path;
- inactive actor/tenant/location;
- membership inactive;
- role denial;
- self-target vs target-other authorization;
- cross-tenant isolation;
- cross-location isolation;
- identical retry after success;
- duplicate/concurrent identical command behavior;
- conflicting concurrent command behavior;
- stale version/conflicting mutation behavior;
- transaction rollback/atomic audit behavior;
- audit writer scope/entity correctness;
- safe error classification;
- multiple NULL semantics where relevant;
- downstream guard/query boundary behavior;
- forbidden scope remains untouched.

Prefer focused new <=300-line tests over growing giant grandfathered files.

## Validation

Run focused tests first, then the repository gates in `references/quality-gates.md`.

Do not claim a gate passed unless you executed it successfully in the current checkout.

Do not claim a security scan passed unless it was actually run.

For production-affecting work, also read and enforce `references/production-evidence-and-failure-gates.md`. A successful static check, unit test, image build, or simulated failure is not evidence for a stronger runtime/failure/CI claim.

## Git discipline

Follow `AGENTS.md` and `references/git-workflow.md`.

Never:

- work directly on main;
- force push;
- silently reset user work;
- use the same working tree concurrently with another agent;
- merge your own work merely because your tests passed.

Unless explicitly asked, stop after committing/pushing the owned branch; do not create/merge a PR automatically.

## Final self-review

Before commit, inspect the full diff and ask:

- Did I implement any behavior still marked unresolved?
- Did I change behavior not authorized by the task?
- Did I weaken tenant/location isolation?
- Did I introduce client-controlled scope?
- Did I create an application-only concurrency guard?
- Did I handle DB safety but forget accepted retry semantics?
- Did I make history mutable?
- Did I force-fit an incompatible audit/helper abstraction?
- Did I create a secret-bearing audit field?
- Did I satisfy a downstream domain requirement only via HTTP?
- Did I pull a future phase into this slice?
- Did I create a >300-line authored file?
- Did I alter historical migrations or lockfiles without authorization?
- Did I invent a decision while implementing?

If yes, fix or stop.

## Final response

Report:

1. scope implemented;
2. decisions followed;
3. reusable downstream boundary implemented, if applicable;
4. files changed;
5. tests added/changed;
6. retry/concurrency cases proved;
7. focused tests result;
8. architecture/lint/typecheck/test/build result;
9. DB/migration result if relevant;
10. audit abstraction/result if relevant;
11. line-count result;
12. dependency/lockfile result;
13. commit SHA;
14. push result;
15. final git status;
16. any known deferred/non-blocking issue.

Then stop.

## v1.2 execution integrity overlay

These rules override looser wording above.

- Build a `contract ledger` before editing: every implemented route/status/error/event/role/retry/persistence choice must map to an Accepted Decision or binding requirement. If not, STOP.
- Never implement a planner's proposed choice when that same plan marked it UNRESOLVED. Plans are not acceptance authority.
- Preserve identity scope exactly: User, OrganizationMembership, Organization, Location, Shift are not interchangeable. A membership-scoped unique index must not be described or coded as a user-global invariant.
- Do not assume role inheritance from role names.
- Verify literal route convention from current controllers before adding transport.
- For eligibility protecting a write, prove the check-use race is closed by the accepted transaction/locking/guarded-write design. A read helper alone is insufficient.
- Do not fake idempotency by catching a uniqueness violation unless the accepted retry contract and exact raw DB error path support that behavior.
- Do not use Prisma `P2002` in raw-Postgres command paths.
- Missing error/event/helper symbols are not permission to invent them.
- Exact audit events/metadata must be accepted, not inferred from generic auditability.
- Tests must not encode semantics absent from the contract ledger. If a test requires inventing an expected status/event/role behavior, STOP.
- When a later slice owns an atomic write race, implement only the current accepted boundary and document required consumer transaction semantics; do not pull the later model into this slice.

## v1.3 implementation-proof overlay

These rules are mandatory and override weaker implementation guidance above.

### Accepted-policy provenance

Before editing, extend the contract ledger so every concrete behavior has:

- exact behavior/claim;
- source path and Accepted Decision/binding clause;
- scope identity (`User`, `OrganizationMembership`, `Organization`, `Location`, etc.);
- persistence authority;
- retry/concurrency authority;
- audit/privacy authority.

If the implementation would rely only on an existing pattern rather than an accepted policy, STOP when that choice changes domain semantics.

### No semantic repair during implementation

Do not silently correct an ambiguous or unsafe accepted-plan sentence by adding behavior that was never accepted. Report the gap and STOP.

Likewise, do not implement the opposite of a contradicted requirement while pretending the original requirement was accepted.

### Concurrency mechanism provenance

Every explicit `FOR UPDATE`, `FOR SHARE`, advisory lock, SERIALIZABLE transaction, guarded mutation, version field, or idempotency mechanism must map to either:

- an Accepted Decision;
- an existing repository primitive that mechanically enforces the same accepted invariant; or
- a narrowly scoped implementation necessity with no policy choice remaining.

If multiple valid mechanisms remain and the choice affects observable behavior or architecture, STOP for decision.

For uncommitted-conflict behavior, add tests/evidence for commit and rollback branches where relevant. Do not assume the losing request always gets a uniqueness error.

### Unknown commit-status retry safety

For client timeout/disconnect or ambiguous commit outcome, do not claim retry safety unless the accepted command contract identifies how the caller/request can distinguish:

- committed success;
- rolled-back attempt;
- conflicting different request.

A uniqueness constraint alone does not provide this transport contract.

### Free-text audit input hardening

Any free-text audit/reason field must have an accepted storage/privacy contract and implementation controls appropriate to it. Check:

- validation/length;
- empty/whitespace normalization;
- secret/credential handling;
- safe metadata allowlist;
- tenant/location scope;
- whether raw text is necessary.

A safe metadata key is not enough.

### Consumer atomicity preservation

If this slice exposes an eligibility/precondition capability for a later write-owning slice:

- implement only the accepted boundary;
- preserve transaction-awareness if accepted;
- document invalidating state and consumer obligations;
- do not fake atomicity with a boolean helper;
- do not implement the future Task/Dispatch write early.

### Evidence-backed completion

Before reporting implementation complete, prove rather than assert:

- every contract-ledger item maps to code/tests;
- every changed observable behavior is accepted;
- concurrency tests include material commit/rollback race branches;
- audit free-text/privacy controls match contract;
- no unresolved behavior was encoded by tests;
- no user-vs-membership identity collapse occurred;
- no exact route/error/event was invented from convention alone.

If any proof is missing, report the gap instead of a clean completion claim.

## v1.4 mutation-order enforcement overlay

Before completing any protected command, trace the concrete call path from controller/application entry to SQL. Record where principal identity is authenticated, where target ownership/scope is proven, where the relevant lock/guard is acquired, and where the first write occurs. If the first write precedes the required target authorization, stop and fix it before tests.

Do not "fix" a foreign-resource mutation by adding an ownership check only to a zero-row/retry path. The successful mutation path must itself be authorized.

When an accepted cleanup command intentionally survives membership/access/Location revocation, preserve that narrow cleanup rule exactly while still proving self-ownership before mutation.

## v1.5 production-proof execution overlay

For deployable services, workers, queues, external HTTP/webhooks, migrations, Docker, CI, secrets, or concurrency-sensitive paths, `references/production-evidence-and-failure-gates.md` is a required completion gate.

Before claiming completion:

1. label each material claim with the strongest evidence level actually observed;
2. execute the real runtime path when the claim is about runtime behavior;
3. induce the real failure when practical when the claim is about crash/outage recovery;
4. inspect logs and authoritative persistence after recovery;
5. downgrade the claim instead of substituting simulation for an untested real boundary.

Specific prohibitions:

- do not call `tsc --noEmit` lint;
- do not treat `db push` or equivalent schema sync as versioned migration verification;
- do not claim Docker works from image build or Compose configuration alone;
- do not claim GitHub Actions passed when only local workflow commands passed;
- do not call authentication-only tests proof of IDOR/object authorization;
- do not implement hard-crash recovery that depends on the killed worker executing cleanup;
- do not add an orphan-job sweeper without a lease/visibility rule that protects active workers;
- do not claim exactly-once remote delivery across an HTTP/payment/webhook boundary unless the receiver participates in a proven idempotent protocol;
- do not call SSRF solved after only direct-IP tests; cover mapped IPv6 and redirect behavior and state DNS-rebinding residual risk;
- do not persist recoverable signing/payment secrets in plaintext merely because they are omitted from API responses/logs; use the repository-approved encryption/key-management path or report a production condition.

If hostile verification disproves an earlier claim, explicitly record the incorrect assumption, root cause, fix, and re-verification.
