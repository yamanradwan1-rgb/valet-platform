# Decision gates — v1.1

Use this checklist before calling a plan READY TO IMPLEMENT.

## Product/lifecycle gate

Ask whether the task requires choosing:

- a new command;
- a new state transition;
- a new eligibility rule;
- a new ownership rule;
- a new override rule;
- a new correction/reassignment rule;
- a new guest-visible behavior.

Any unaccepted choice is UNRESOLVED.

## Authorization gate

Ask:

- Who may invoke the command on self?
- Who may invoke it on another staff member?
- Which roles are explicitly allowed?
- Is access organization-wide or location-scoped?
- Must the actor have explicit LocationAccess?
- Can ORG_ADMIN bypass LocationAccess? Do not assume.
- What happens for inactive user, membership, organization, or location?
- Is foreign-tenant existence concealed?
- Is eligibility evaluated dynamically when consumed or frozen at Shift creation time?

If the repository does not answer an implementation-critical question, the plan is not ready.

## Scope derivation gate

Ask which values are authoritative:

- authenticated user id;
- membership id;
- organization id;
- location id;
- target employee/member id;
- resource id.

Prefer authoritative persistence. Flag unnecessary client-supplied tenant scope.

## Retry/idempotency gate

For every mutation explicitly classify:

- first execution;
- identical retry after success;
- two identical requests racing;
- conflicting requests racing;
- retry after post-success state;
- same idempotency key with changed payload, if applicable.

Ask whether the accepted result is:

- same success result;
- conflict;
- not found/concealed denial;
- invalid state;
- another explicitly accepted outcome.

A DB unique constraint can provide safety without defining user-visible idempotency. Do not conflate the two.

## Concurrency gate

For each mutation ask:

- identical race outcome;
- conflicting race outcome;
- DB guard/index/lock/update predicate;
- error classification;
- retry/idempotency behavior.

A “check then insert/update” algorithm is not enough by itself.

## Abstraction compatibility gate

For every existing helper/writer proposed for reuse ask:

- Does its type contract accept the new scope/entity?
- Does it require fields that do not exist for this operation?
- Does it assume a ValetSession, Vehicle, Task, or other specific entity?
- Does it own the transaction or expect one?
- Does it embed authorization assumptions?
- Would reuse require fake/sentinel data or broadening security-sensitive types?

If the DB supports a behavior but the current helper does not, report an architecture gap. Do not call the behavior “already supported.”

## Audit gate

Ask:

- Is an Audit/Black Box event required?
- What event name is accepted?
- Who is actor?
- Which entity is audited?
- Which metadata is safe and allowlisted?
- Must mutation and event commit atomically?
- Can the current audit writer represent that entity/scope?

Do not invent event semantics or assume writer compatibility from table nullability.

## API gate

Ask:

- Is an HTTP route part of this slice?
- What route family does the current repo use?
- Are contracts shared in `packages/contracts`?
- Are query/body/path values necessary or derivable?
- Is the response shape accepted?
- Is the HTTP/error mapping already defined?
- Does the transport expose or distort retry semantics?

Do not invent route/status/DTO details because they are conventional.

## Persistence/migration gate

Ask:

- Does the task actually require schema change under the **current locked decisions**?
- Is a migration explicitly authorized by an Accepted Decision?
- Are partial indexes/DB checks already present but invisible in Prisma?
- Can the current schema support the behavior safely?
- Could any still-unresolved decision require additional integrity work?

Use careful language:

- `No migration appears necessary under current locked decisions` is allowed.
- `Zero migrations` / `No schema changes required` is not final while a persistence-relevant decision is unresolved.

Never propose a migration merely to make application code easier.

## Downstream consumer gate

If the task exists to provide a boundary for later work, ask:

- Which later slice consumes it?
- What authoritative inputs are required?
- What reusable result/guard/query is provided?
- Can internal callers use it without calling the project's own HTTP endpoint?
- What later ownership/lifecycle decisions remain intentionally outside this boundary?

A task is not complete merely because transport endpoints exist if its binding purpose includes a reusable operational boundary.

## Future-model gate

Ask whether the proposal is using a temporary field as the canonical model for a later task.

Phase 3 example:

- `ValetSession.currentAssigneeMembershipId` is not canonical Hybrid Dispatch Task ownership.

If current persistence lacks the future concept, say so instead of redefining it.

## Internal consistency gate

Before final verdict compare:

- Binding requirements;
- LOCKED decisions;
- DERIVED conclusions;
- UNRESOLVED decisions;
- proposed API/event/error/migration/file plan.

The same behavior cannot be both binding and unresolved.

If the evidence is ambiguous, downgrade to UNRESOLVED unless a higher-precedence source proves it locked.

## v1.2 strict gates

- Exactly one classification per assertion; no slash labels.
- Missing implementation != CONTRADICTED.
- UNRESOLVED values may not be selected in plan/tests/files.
- Distinguish User vs OrganizationMembership invariants.
- Verify at least two literal controller prefixes before claiming route convention.
- Analyze eligibility check-use races, not just the SELECT.
- Never assume role hierarchy.
- Exact audit event names need exact binding evidence.
- Do not cite Prisma Client errors in raw PostgreSQL paths.
- Under DECISION REQUIRED, section 8 must stay conditional.
