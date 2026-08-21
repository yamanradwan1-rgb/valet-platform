# Adversarial self-review for a VAYLET plan — v1.1

After drafting a plan, attack it as if reviewing another agent.

For every concrete claim ask:

> What exact repository evidence makes this a fact rather than a reasonable guess?

Downgrade unsupported implementation-critical claims to UNRESOLVED.

## Red flags

Search your plan for these failure modes:

- “Open Questions: None” without an explicit decision matrix.
- proposing a new `DEC-xxx` and calling it Accepted.
- inventing an endpoint path.
- inventing an HTTP status or error code.
- adding `overrideReason`, `force`, or supervisor override behavior without accepted authorization semantics.
- equating `currentAssigneeMembershipId` with Task ownership.
- saying “open tasks” before canonical Task persistence exists.
- trusting `organizationId`, `membershipId`, or `locationId` from the client when it can be derived.
- generic `controller/service/repository` architecture without comparing a neighboring module.
- local API DTOs without checking `packages/contracts`.
- read-then-write concurrency without a DB/transaction guard.
- describing a unique constraint as if it fully defines idempotent API replay behavior.
- omitting identical-retry and concurrent-identical outcomes for a mutation.
- declaring `zero migrations` / `no schema changes` while an implementation-critical DEC is unresolved.
- concluding “audit is supported” from nullable DB columns without inspecting the actual writer type/runtime contract.
- reusing a helper that requires a scope/entity the new operation does not have.
- broadening a custody/session-specific writer into a generic writer without an accepted architecture decision.
- audit events without atomicity or safe metadata analysis.
- a task whose purpose says “boundary consumed by later task” but whose plan only adds HTTP endpoints.
- a future internal consumer that would need to call the application's own HTTP route unnecessarily.
- the same event/error/role/route/migration claim appearing as both binding and unresolved.
- silently expanding scope into Retrieval, Handoff, GPS, Payments, Dashboard, payroll, or timekeeping.
- missing inactive user/membership/org/location tests.
- missing cross-tenant/cross-location tests.
- missing duplicate/concurrent command tests.
- missing retry-after-success tests.
- missing direct tests of the reusable downstream guard/query boundary.

## Required challenge

Before final verdict, answer these privately and use them to correct the plan:

- `The strongest reason this plan could be wrong is...`
- `The most dangerous inferred assumption is...`
- `The repository pattern I verified instead of assuming is...`
- `The helper abstraction most likely to be incompatible is...`
- `The retry case most likely to be underspecified is...`
- `The later slice that consumes this task needs...`

Do not include these sentences in the final output if they add noise; use them to correct the plan first.

## v1.2 attack questions

- Did I give any requirement more than one classification?
- Did I call something CONTRADICTED merely because a symbol is absent?
- Did any UNRESOLVED concept become concrete in sections 8–10 or tests?
- Did I confuse User-global and Membership-scoped uniqueness?
- Did I assume a role hierarchy from names?
- Did I inspect two literal staff controller prefixes before proposing a route?
- Did I analyze check -> concurrent invalidation -> write for eligibility?
- Did I claim a read-only eligibility function solves assignment races?
- Did I invent exact audit event names from a generic audit principle?
- Did I mention P2002 without a Prisma Client execution path?

## OMEGA falsification additions

- For every LOCKED/DERIVED conclusion, write one plausible falsifier and inspect the likeliest source.
- Verify proposition polarity: evidence must support the assertion, not merely a corrected opposite.
- Search for semantic decision leakage: SQL joins/locks/function signatures/tests can select unresolved behavior without repeating the decision wording.
- Challenge every exact concurrency outcome with commit and rollback branches.
- Challenge every free-text audit field: safe metadata key does not make arbitrary user/operator text safe.
- Challenge completion claims with counts: `all`, `every`, `none remain` require measurable evidence.

## Mutation-order attack

For every proposed protected write ask: "If an authenticated attacker knows a foreign UUID, can the write execute before the plan proves that UUID belongs to an authorized target?" Trace the plan in textual/execution order. Principal authentication alone is insufficient. Reject mutate-then-authorize designs even when a transaction would roll back on a later check. Verify retry/re-read paths re-authorize before returning protected state.

## v1.5 production-evidence red flags

Also attack:

- `tsc --noEmit` described as linting;
- schema sync described as deployment migration proof;
- Dockerfile/Compose presence or image build described as runtime verification;
- workflow configuration described as a successful remote CI run;
- authentication tests described as object-level authorization/IDOR proof;
- graceful shutdown logic used as evidence for SIGKILL/OOM recovery;
- orphan-job recovery with no lease/visibility timeout;
- `DB write -> queue add` with no durable reconciliation/outbox analysis;
- exactly-once remote side-effect claims despite crash-after-remote-success windows;
- SSRF tests that stop at direct IPv4 literals and ignore mapped IPv6/redirects/rebinding;
- API/log masking treated as proof that recoverable secrets are securely stored;
- `READY` despite explicitly deferred critical egress/security/reliability controls.

Use `production-evidence-and-failure-gates.md` to downgrade unsupported claims before finalizing the plan.
