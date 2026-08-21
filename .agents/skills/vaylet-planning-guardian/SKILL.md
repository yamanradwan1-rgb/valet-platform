---
name: vaylet-planning-guardian
description: Use this skill whenever planning, designing, decomposing, estimating, or proposing implementation for a task in the VAYLET valet-platform repository. It enforces repository source-of-truth precedence, Accepted Decision gates, no-invention rules, abstraction compatibility, architecture discovery, downstream-consumer boundaries, tenant/location/security rules, authorization-before-mutation ordering, retry/idempotency and concurrency analysis, and a strict READY TO IMPLEMENT vs DECISION REQUIRED verdict before code is written.
---

# VAYLET Planning Guardian

Version: 1.5

## Mission

Produce repository-grounded implementation plans without silently inventing product, security, authorization, concurrency, lifecycle, persistence, API, audit, retry, or architecture decisions.

This is a **planning skill**, not an implementation skill.

A plausible design is not the same thing as an accepted project decision. A database capability is not the same thing as an implementation capability. A future consumer requirement is not satisfied merely because an HTTP endpoint exists.

## Non-negotiable behavior

1. Inspect the real repository before proposing architecture.
2. Read the binding documentation before planning.
3. Separate verified facts, mechanical derivations, proposals, and unresolved choices.
4. Classify every implementation-critical behavior as `LOCKED`, `DERIVED`, or `UNRESOLVED`.
5. If an implementation-critical item is unresolved, return `DECISION REQUIRED` and do **not** present the plan as implementation-ready.
6. Never author, mark, or imply that a new DEC is Accepted unless the repository already says it is Accepted or the user explicitly provides an accepted decision in the current request.
7. Never use future-model placeholders as canonical truth without an accepted decision.
8. Never replace repository architecture with a generic pattern merely because that pattern is familiar.
9. Never conclude that a behavior is implementable merely because the database can represent it; inspect the actual helper/abstraction that must execute it.
10. Never declare a final “no migration required” conclusion while an implementation-critical persistence decision remains unresolved.
11. For every state-changing command, explicitly analyze first execution, identical retry, concurrent identical execution, conflicting concurrent execution, and retry after success.
12. When the task exists to provide a boundary consumed by a later task, identify the reusable domain/query/guard contract that the later task will consume. Do not reduce the task to HTTP endpoints.
13. Before finalizing, run an internal consistency pass. A behavior cannot be both binding and unresolved.
14. For every protected mutation, prove **authorization before mutation**: authenticate principal, resolve persisted target/scope, prove operation-specific tenant/ownership/location/role authority, acquire required concurrency protection, then mutate, append required audit, and commit. A mutation may not be used as the first test of whether the caller was authorized.
15. Retry/re-read paths must re-prove the authorization required to return the resource; a successful previous mutation or possession of a UUID is never authority.

## Mandatory repository discovery

Before planning, determine the repository root and inspect:

- `git branch --show-current`
- `git status --short`
- `git log -8 --oneline`
- `AGENTS.md`

Then read the repository documents listed in `references/source-of-truth.md`.

Read all task-specific Accepted Decision files and directly relevant:

- schema and migrations;
- neighboring modules;
- command/executor implementations;
- shared contracts;
- authorization helpers;
- error mapping;
- audit/event writers;
- runtime database helpers;
- tests;
- CI/quality rules.

Do not claim repository behavior from filenames, schema shape, or database nullability alone. Read the implementation path that would actually perform the behavior.

## Source-of-truth precedence

Apply this precedence strictly:

1. Accepted focused Decisions.
2. Binding repository documentation.
3. Database constraints and committed migrations.
4. Existing implemented domain/security behavior.
5. Existing tests that encode intentional behavior.
6. Task/Issue wording.
7. Reasoned inference.

Inference may explain or propose. Inference may **not** silently become policy.

If two higher-precedence sources conflict, return `REPOSITORY CONTRADICTION` with the exact conflict.

## Decision classification

For each important behavior, classify it:

### LOCKED

Explicitly defined by an Accepted Decision or binding contract.

### DERIVED

Mechanically follows from locked rules and verified repository behavior. State the derivation and source paths.

### UNRESOLVED

Requires choosing among valid alternatives, including any choice involving:

- endpoint or command shape;
- caller-supplied vs server-derived scope;
- role permissions;
- supervisor/admin override authority;
- cross-location behavior;
- lifecycle transitions;
- open-work definition;
- ownership source of truth;
- task eligibility;
- idempotency/retry behavior;
- concurrency/error semantics;
- database schema or migration semantics;
- audit event meaning, entity, writer, or metadata;
- handoff/reassignment semantics;
- public/shared contract placement;
- security/privacy behavior;
- downstream consumer interface.

Use the detailed gate in `references/decision-gates.md`.

For protected operations, also apply `references/authorization-before-mutation.md`.

## No-invention rules

Unless locked or mechanically derived, do not invent:

- HTTP paths;
- HTTP status codes;
- DTO/request/response shapes;
- error-code names;
- authorization roles;
- override rules;
- state transitions;
- ownership semantics;
- idempotency/retry semantics;
- migrations;
- audit event names;
- audit entity types;
- metadata fields;
- reassignment rules;
- new architectural layers;
- data retention rules;
- guest-visible fields;
- downstream domain interfaces.

When a choice is reasonable but unaccepted, label it `UNRESOLVED` and explain the minimum decision needed.

## Abstraction compatibility rule

For every proposed behavior that uses an existing helper, writer, service, command primitive, or module:

1. inspect its actual function/type contract;
2. verify it can represent the new entity/scope/transaction semantics;
3. verify required fields are compatible;
4. verify its security assumptions still hold;
5. if it cannot represent the behavior, report an **architecture gap** instead of pretending the helper is reusable.

Example principle: a nullable database foreign key does not prove an existing audit writer can emit a non-session event if that writer's scope type requires a session id or restricts entity types.

Do not broaden a security-sensitive helper generically unless the task/decision explicitly justifies that architecture change.

## Architecture discovery rule

Before proposing files/layers, inspect at least one nearest comparable implemented feature.

Do not automatically introduce `controller -> service -> repository`.

Prefer the repository's actual established pattern unless a binding decision requires otherwise.

For every new layer, answer:

> Why is this layer necessary instead of following the nearest existing repository pattern?

Read `references/repository-patterns.md` as a navigation aid, then verify the current files because patterns can evolve.

## Shared contract rule

Before creating transport DTOs or validators:

1. inspect `packages/contracts`;
2. inspect how current controllers consume contracts;
3. inspect shared API error mapping;
4. inspect route-prefix conventions;
5. inspect staff principal/authentication resolution.

Do not duplicate public API contracts inside `apps/api` when the current repository contract expects shared schemas.

## Authorization decomposition

Never write “authorized” as one opaque step. Evaluate separately:

- authenticated user identity;
- user status;
- organization membership existence;
- membership status;
- organization status;
- location status;
- explicit location access;
- membership role;
- operation-specific permission;
- target-self vs target-other semantics;
- resource scope derived from authoritative persistence.

Prefer server-derived tenant/location/member scope over trusting caller input whenever authoritative derivation exists.

For ongoing eligibility, explicitly ask whether authorization is evaluated only when a record is created or dynamically at the time eligibility is consumed. If the repository does not lock this, classify it `UNRESOLVED`.

## Command retry/idempotency gate

For every state-changing command, explicitly classify:

1. first valid execution;
2. immediate identical retry after success;
3. two identical executions racing concurrently;
4. a conflicting command racing concurrently;
5. retry after the resource has moved to the post-success state;
6. duplicate request with different payload, if a client idempotency key exists or is proposed.

State the authoritative persistence/transaction mechanism for each race.

Do not equate “unique constraint rejects duplicate” with a fully accepted API retry contract. Database safety and user-visible idempotency semantics are separate questions.

If retry behavior is implementation-critical and not locked, classify it `UNRESOLVED`.

## Concurrency analysis

For every mutation, answer:

1. What happens if the same command runs twice concurrently?
2. What happens if conflicting commands run concurrently?
3. Which database constraint, lock, guarded update, or transaction makes the result authoritative?
4. How is the loser classified safely?
5. Is a read-before-write check alone insufficient?

If concurrency semantics are required but not locked, classify them `UNRESOLVED`.

## Persistence / migration conclusion rule

Distinguish:

- `No migration appears necessary under current locked decisions`;
- `Migration is required by an Accepted Decision`;
- `Migration requirement is UNRESOLVED`.

Do not state `zero migrations`, `no schema changes`, or equivalent as a final guaranteed task property if an unresolved decision could still require database integrity work.

Always inspect committed SQL for partial indexes/checks not represented in Prisma before proposing new schema work.

## Future-model contamination guard

Do not repurpose transitional or denormalized fields as future canonical models.

In Phase 3 specifically, `ValetSession.currentAssigneeMembershipId` must not silently become canonical Task / Hybrid Dispatch ownership.

If a later slice owns the canonical model, preserve that boundary and state what the current persistence can and cannot prove.

## Open-work rule

Do not equate “assigned ValetSession” with “open Task” unless an Accepted Decision explicitly does so.

If Task persistence does not yet exist, the plan must distinguish:

- physical-session evidence available now;
- actual Task ownership that does not exist yet;
- any temporary safety rule that requires explicit acceptance.

Do not invent handoff/reassignment behavior before the owning slice exists.

## Downstream consumer contract

If the task's purpose is to create a capability used by a later slice, name that capability explicitly.

The plan must answer:

- What authoritative inputs does the downstream consumer provide?
- What reusable domain/query/guard result does it receive?
- What security/tenant/location checks are guaranteed by that boundary?
- What does the boundary intentionally **not** decide?
- Is it internal domain code, an application query, a command guard, or a transport endpoint?

Do not make a future internal consumer depend on calling the project's own HTTP endpoint unless that is an accepted architecture decision.

## Audit/Black Box rule

For protected mutations, inspect both:

1. the database model/constraints; and
2. the actual audit/event writer abstraction that would emit the event.

Determine whether atomic append-only history is required and whether the existing writer can represent the intended entity/scope safely.

Never propose secret-bearing audit metadata. Prohibited examples include:

- Authorization values;
- bearer credentials;
- passwords;
- refresh/access tokens;
- OTPs;
- pickup codes;
- PAN/CVV;
- payment provider secrets.

If a new audit event/entity/writer contract is needed and not locked, classify it `UNRESOLVED` or an architecture gap as appropriate.

## Internal consistency pass

Before the verdict, compare these sections against each other:

- Binding requirements;
- LOCKED decisions;
- DERIVED conclusions;
- UNRESOLVED decisions;
- Proposed implementation plan.

A concrete behavior, event name, role permission, route, error code, migration guarantee, or override rule may not appear as both accepted/binding and unresolved.

When evidence is ambiguous, downgrade to `UNRESOLVED` unless a higher-precedence source proves it locked.

The proposed implementation plan must not quietly assume a value that the UNRESOLVED section says is undecided.

## 300-line architecture rule

Treat `docs/17_AGENT_CODE_STRUCTURE_RULES.md` as binding.

Do not propose new authored `.ts`, `.tsx`, `.js`, `.mjs`, or `.cjs` files above 300 physical lines.

Do not solve the limit through line-count gaming.

Do not casually grow grandfathered oversized files.

## Planning workflow

Perform these passes in order:

### Pass A — Repository facts

Collect verified facts only.

### Pass B — Binding contracts

Extract task-relevant binding requirements.

### Pass C — Pattern and abstraction discovery

Inspect comparable implementation patterns **and the concrete helper contracts** that would be reused.

### Pass D — Decision matrix

Classify each behavior as LOCKED / DERIVED / UNRESOLVED.

### Pass E — Retry/concurrency matrix

Analyze command replay and race outcomes separately from database safety.

### Pass F — Downstream boundary

Identify the reusable capability later slices are expected to consume.

### Pass G — Boundary attack

Look for tenant, location, authorization, concurrency, audit, privacy, lifecycle, abstraction mismatch, and future-model contamination risks.

### Pass G2 — Authorization-before-mutation proof

For every protected command/query that mutates state, write the operation order explicitly and verify there is no mutation before operation-specific authority is proven. Distinguish principal authentication from resource authorization. Verify all retry/fallback/re-read branches repeat the required ownership/scope proof before returning protected data.

### Pass H — Plan

Only after the previous passes, produce the proposed file/behavior/test plan. If decisions remain unresolved, the plan may describe likely affected areas and decision-dependent alternatives, but must not masquerade as a frozen implementation contract.

### Pass I — Internal consistency pass

Ensure no behavior is both binding and unresolved and no proposed file/behavior silently selects an unresolved alternative.

### Pass J — Adversarial self-review

Attack your own plan using `references/adversarial-review.md`.

If a plan is saved to a Markdown file, run:

```bash
python3 .agents/skills/vaylet-planning-guardian/scripts/audit_plan.py <plan-file>
```

Treat script warnings as prompts for re-evaluation, not as substitutes for reasoning.

## Required output format

Always use these sections in this exact order:

1. `Repository facts discovered`
2. `Binding requirements`
3. `Existing implementation patterns`
4. `LOCKED decisions`
5. `DERIVED conclusions`
6. `UNRESOLVED decisions`
7. `Risks / boundary violations`
8. `Proposed implementation plan`
9. `Test matrix`
10. `Files expected to change`
11. `Explicitly out of scope`
12. `Ready-to-implement verdict`

Within `Test matrix`, explicitly cover retry/concurrency semantics for every proposed mutation.

Within `Proposed implementation plan`, identify any reusable downstream boundary required by the task.

For every protected mutation, include an **Authorization-before-mutation proof** showing, in order:

1. principal authentication;
2. persisted target/scope resolution;
3. operation-specific ownership/tenant/location/role proof;
4. required lock/concurrency protection;
5. mutation;
6. required audit append;
7. commit;
8. retry/fallback authorization proof before returning protected state.

For every non-obvious claim, identify its repository source by path.

## Verdict

The final verdict must be exactly one of:

`READY TO IMPLEMENT`

`DECISION REQUIRED`

`REPOSITORY CONTRADICTION`

Never return `READY TO IMPLEMENT` while an implementation-critical `UNRESOLVED` item remains.

## Planning-only safety

Unless the user explicitly asks for edits, do not:

- modify code;
- modify migrations;
- modify decisions/docs;
- commit;
- push;
- create PRs;
- switch branches;
- reset/restore/stash/clean working changes.

This skill is allowed to inspect and plan.

## v1.2 strict reasoning overlay

The following rules override any looser wording above.

### Exact single classification

When classifying stakeholder/task assertions, assign **exactly one** status:

- `LOCKED`
- `DERIVED`
- `UNRESOLVED`
- `CONTRADICTED`

Never use compound labels such as `LOCKED / DERIVED` or `DERIVED / UNRESOLVED`.

`CONTRADICTED` is allowed only when a higher-precedence repository source explicitly forbids, negates, or is logically incompatible with the assertion. **Absence is not contradiction.** A missing route, error code, helper, DTO, table column, or test normally means unsupported/unimplemented or `UNRESOLVED`, not contradicted.

Do not confuse a contradicted candidate assertion with the final verdict `REPOSITORY CONTRADICTION`. The latter is reserved for conflicts between authoritative repository sources themselves.

### No decision leakage

If an item is `UNRESOLVED`, it may not later appear as a selected implementation choice in the plan, test matrix, file list, or examples.

This prohibition includes concrete:

- route/path;
- HTTP status;
- error-code name;
- event name;
- DTO field;
- role allowlist;
- override behavior;
- idempotency behavior;
- migration shape;
- audit metadata schema;
- dynamic-vs-captured authorization policy;
- downstream interface signature.

The plan may present **conditional alternatives** only, clearly labeled `IF DEC-032 chooses A...` / `IF ... chooses B...`.

Tests must preserve uncertainty too. An unresolved behavior cannot have a test asserting a specific 200/409/event/role outcome.

### Evidence discipline

For every non-obvious claim record:

- source path;
- concrete symbol/constraint/controller/helper inspected;
- whether the evidence proves capability, convention, or policy.

Existing code proves current behavior/pattern, but does not automatically elevate that behavior into future product policy.

Do not infer a policy from a missing symbol. Do not infer helper compatibility from database shape. Do not infer user-level scope from membership-level constraints.

### Identity-scope precision

Keep these identities distinct at all times:

`User -> OrganizationMembership -> Organization -> Location -> Shift`

Never translate `per membership` into `per user` or `globally` without proving the mapping. If a User may have memberships in multiple Organizations, say explicitly what the database constraint does and does not prevent.

Never assume a role hierarchy unless an Accepted Decision defines one. Role names such as ORG_ADMIN / MANAGER / SUPERVISOR do not mechanically imply inheritance.

### Literal route verification

Before proposing a route convention, inspect at least **two current staff controllers** and report their literal `@Controller(...)` prefixes. If examples differ, do not invent a normalized route family; mark the route contract unresolved unless another binding source settles it.

### Race / check-use contract gate

A reusable eligibility query is not automatically concurrency-safe.

For any eligibility/authorization predicate that protects a later mutation, analyze the full **check -> use/write** interval:

1. What transaction contains the eligibility evaluation and protected write?
2. What rows/constraints/locks make a concurrent Shift end, access revocation, membership disable, or Location disable visible or mutually exclusive?
3. Can the predicate become false after it is read but before assignment/write commits?
4. Does the accepted design require row locks, guarded write predicates, serializable isolation, advisory locking, or a different authoritative invariant?
5. What is the loser outcome?

If the later consumer (for example VAL-005E) owns the write-side race solution, VAL-005B must state the boundary and preconditions without pretending its read helper alone proves atomic assignment eligibility.

### Audit-event evidence gate

Do not call an exact event mandatory unless a binding source requires that mutation/event semantics. A general “important mutations are auditable” principle does not by itself lock `SHIFT_STARTED`, `SHIFT_ENDED`, or any metadata schema.

### Error-code absence rule

`X does not exist in api-errors.ts` means the proposed error code is not currently implemented. It does **not** prove the behavior is forbidden. Classify according to higher-precedence policy evidence.

### Prisma/raw-SQL precision

Do not cite Prisma Client error identifiers such as `P2002` unless the inspected execution path actually uses Prisma Client for that mutation. When the repository uses raw PostgreSQL, reason from PostgreSQL SQLSTATE/driver behavior or leave exact classification unresolved.

### Decision-required plan purity

When final verdict is `DECISION REQUIRED`, section 8 is a **decision-dependent implementation envelope**, not a frozen implementation plan. It may list likely modules/areas and alternatives, but it must not select unresolved semantics.

Run `references/decision-leakage-and-classification.md`, `references/race-and-identity.md`, and the audit script before finalizing.

## v1.3 OMEGA reasoning-closure overlay

These rules are mandatory and override any weaker wording above.

### Proposition-polarity gate

Classify the **claim that was actually asserted**, not the corrected behavior you prefer.

For every candidate assertion:

1. restate the atomic proposition without changing its meaning;
2. identify evidence that supports or negates that exact proposition;
3. only then assign `LOCKED`, `DERIVED`, `UNRESOLVED`, or `CONTRADICTED`.

If the assertion says `use application Date.now()` and binding evidence says `use database-authoritative time`, the assertion is `CONTRADICTED`; it is not `DERIVED` merely because you can describe the correct opposite behavior.

Never silently repair a proposition by adding qualifiers such as `when validated`, `if safe`, `for the same tenant`, or `subject to access checks`. If those qualifiers are necessary, the original proposition must be classified on its original meaning and the corrected alternative discussed separately.

### Current-pattern versus new-policy firewall

Existing implementation proves current behavior and architecture, not automatically future product policy.

Examples:

- a custody authorizer proves how current custody commands authorize;
- it does not by itself lock Shift operational-eligibility semantics;
- current route literals prove convention;
- they do not by themselves accept the exact new Shift route;
- an audit writer proves current helper capability;
- a generic auditability principle does not accept exact new event names.

Whenever deriving from existing code, state whether the evidence proves:

- `CAPABILITY`;
- `CONVENTION`;
- `CURRENT POLICY`;
- `NEW TASK POLICY`.

Only the last category may close a new task decision, and only when source-of-truth precedence actually supports that derivation.

### Decision firewall with stable IDs

When three or more implementation-critical items are unresolved, assign stable identifiers `U-001`, `U-002`, ... inside `UNRESOLVED decisions`.

Before finalizing, search every later section for each U-ID's concept, including semantic equivalents rather than exact words.

An unresolved concept may not later be selected through:

- a concrete route;
- status/error code;
- exact event name;
- exact role allowlist;
- exact DTO field set;
- exact function signature;
- exact persistence column;
- exact retry outcome;
- exact lock/isolation mechanism;
- exact dynamic/captured authorization rule;
- exact file claimed as definitely required solely by that unresolved choice.

If a later section needs to discuss it, use a conditional envelope:

`IF U-00X is resolved as A, then ...`

`IF U-00X is resolved as B, then ...`

Do not select A or B.

### Concurrency scenario completeness gate

For each material race, especially when the user explicitly requests scenarios, provide all of:

- `Transaction A`;
- `Transaction B`;
- `authoritative rows/resources`;
- `read/write/lock sequence`;
- `unsafe interleaving`;
- `existing database protection`;
- `missing protection`;
- `possible linearization point`, if derivable;
- `decision status` (`LOCKED`/`DERIVED`/`UNRESOLVED`);
- `owning slice/task` for the final mechanism.

A statement such as `the database handles it`, `use a transaction`, or `the unique index rejects one` is incomplete.

### Commit / rollback / unknown-outcome branching

When reasoning about a request blocked by or racing with an uncommitted transaction, explicitly consider at least:

1. competing transaction commits;
2. competing transaction rolls back;
3. client times out or disconnects and commit outcome is unknown to the caller.

Do not claim the waiting request always receives a uniqueness violation or always succeeds unless PostgreSQL behavior plus the exact statement/transaction pattern proves that outcome.

Database integrity and caller-visible retry semantics remain separate.

### Mechanism-selection firewall

Mechanisms such as:

- `FOR UPDATE`;
- `FOR SHARE`;
- `SKIP LOCKED`;
- advisory locks;
- SERIALIZABLE isolation;
- guarded `UPDATE`/`INSERT` predicates;
- version columns;
- idempotency keys;

are architecture choices unless already required by binding repository evidence or mechanically forced by an accepted invariant.

If concurrency policy/mechanism is unresolved, do not write `must use FOR SHARE` or an equivalent selected mechanism. List candidate mechanisms conditionally and state what invariant each would protect.

### Linearizability boundary rule

A read-only eligibility function does not prove that a later assignment remains valid.

For any `check -> use/write` flow, identify the state that can invalidate the predicate between the check and the protected write, including:

- Shift end;
- LocationAccess revocation;
- membership deactivation;
- User disable;
- Organization disable;
- Location disable.

Then identify whether the current task owns the write-side atomicity, merely defines a precondition/consumer contract, or must defer the final lock/write mechanism to a later slice.

Do not pull Task persistence or assignment writes into VAL-005B merely to close a race owned by VAL-005E.

### Free-text audit/privacy gate

A safe metadata **key** does not prove a free-text **value** is safe.

Any operator-entered reason, note, comment, label, or free-text metadata must be evaluated for:

- credentials/secrets pasted into the value;
- personal or sensitive data;
- length bounds;
- normalization/empty-string rules;
- retention/privacy expectations;
- whether raw text belongs in append-only audit at all;
- whether a coded reason plus optional bounded note is safer.

Do not call `overrideReason` automatically safe merely because the key does not contain `token`, `password`, or another prohibited term.

### Falsification coverage accounting

For every `LOCKED` and `DERIVED` conclusion, perform a falsification check:

1. state what repository fact would make the conclusion false;
2. search the most likely source for that falsifier;
3. record the result.

For large/adversarial plans, report coverage:

`Falsification coverage: N / N LOCKED+DERIVED conclusions checked.`

Do not claim `every conclusion was falsified/tested` when only examples were checked.

If a `DERIVED` conclusion cannot survive this pass, downgrade it to `UNRESOLVED`.

### Artifact-prediction firewall

When verdict is `DECISION REQUIRED`, file predictions must be split into:

- `DEFINITELY RELEVANT` — current architecture/source-of-truth proves the area/file family is touched;
- `CONDITIONAL ON DECISION` — exact file/new helper/schema/route depends on a U-ID;
- `NOT JUSTIFIED YET` — speculative architecture or future-phase work.

Do not mark an exact new file as definitely required merely because it is a reasonable implementation choice.

### Completion-claim evidence rule

Claims such as:

- `all requirements classified`;
- `all races analyzed`;
- `all audit warnings resolved`;
- `all LOCKED/DERIVED conclusions falsified`;
- `no legitimate findings remain`;

must be supported by explicit counts or command output where applicable.

A heuristic audit exit code of 0 is not proof of semantic correctness.

### Extended self-review order

Before the verdict, run these checks in order:

1. proposition polarity;
2. source-precedence correctness;
3. exact single classification;
4. identity-scope precision;
5. current-pattern vs new-policy separation;
6. decision-firewall leakage scan;
7. concurrency scenario completeness;
8. commit/rollback/unknown-outcome branching;
9. mechanism-selection firewall;
10. free-text audit/privacy review;
11. downstream check-use boundary;
12. falsification coverage accounting;
13. test-purity review;
14. artifact-prediction review;
15. plan-audit script.

Use `references/omega-reasoning-closure.md` as the concise checklist for these gates.

### Candidate proposition retention

When classifying numbered stakeholder requirements, do not output only `R32 | DERIVED | rationale`.

Retain the exact atomic proposition (or a faithful, meaning-preserving paraphrase) in the classification row/entry:

`R32 | <proposition> | <classification> | <evidence/rationale>`

Without the proposition text, proposition-polarity review cannot verify whether the evidence supports the original assertion or only its corrected opposite.

## v1.4 authorization-order overlay

These rules are mandatory and override weaker wording above.

### Authorization-before-mutation proof

For every protected mutation, distinguish **principal authentication** from **target authorization**. An active authenticated User is not proof that a supplied target UUID belongs to that User or is inside their accepted tenant/Location/capability scope.

The plan must show the first point at which operation-specific authority is proven and the first point at which protected state can change. Authority must come first.

Allowed shapes are:

- load/lock authoritative target scope, prove authority, then mutate; or
- one guarded write whose persisted predicate itself proves the entire accepted authority condition.

Forbidden shapes include mutate-then-authorize, ownership checks only in zero-row fallback, `RETURNING` as the first authority probe, and reliance on later rollback to excuse an unauthorized write attempt.

Retry/re-read paths must re-prove ownership/scope before returning protected state.

### Error-semantic fidelity

Non-disclosing HTTP behavior does not authorize a semantically false domain permission check. Reuse an existing concealed mapping only when its domain meaning matches the failed authority boundary, or derive/add the accepted domain error according to repository contracts.

### Architecture-execution fidelity

When the nearest repository feature uses thin API service -> explicit command executor -> transaction, do not collapse domain SQL into a new service-owned command layer without evidence. Verify module imports, middleware, operation runner, request-ID/error infrastructure, and public-contract exports against the actual nearest module rather than only naming controller/service files.

Before proposing a new Nest module/controller family, inspect a nearest current `.module.ts` and record its imports, providers, middleware, request-ID/error/observability wiring, and runtime database/auth dependencies.

Before referencing an existing helper/schema symbol from a new file, verify that symbol is actually exported from its declaring module/package. A local `const` in another file is not a reusable public helper merely because its name is visible during repository inspection.

## v1.5 production-evidence and hostile-failure planning overlay

These rules are mandatory for production-affecting plans and override optimistic completion language above. Read `references/production-evidence-and-failure-gates.md`.

Before calling a plan implementation-ready, classify every relevant verification claim by evidence level: IMPLEMENTED, STATIC VERIFIED, LOCAL COMMAND VERIFIED, RUNTIME VERIFIED, FAILURE VERIFIED, CI VERIFIED, or PRODUCTION-READY. Never design a verification plan that treats one level as proof of the next.

For deployable services, queues, external HTTP/webhooks, payments, migrations, Docker, CI, secrets, or concurrency-sensitive work, the plan must include the real boundary tests required by that reference. In particular:

- distinguish real versioned migrations from schema synchronization;
- distinguish lint from typechecking;
- distinguish Docker build/configuration from actual stack runtime;
- distinguish local CI commands from an observed remote CI run;
- require two-principal object-level authorization tests for IDOR claims;
- analyze DB+queue/external dual-write failure windows;
- analyze SIGKILL/OOM/container loss separately from graceful shutdown;
- require a lease/visibility/stalled-job model before proposing orphan-job recovery;
- avoid exactly-once claims for remote side effects unless the remote boundary participates;
- expand SSRF analysis to IPv4-mapped IPv6, redirect chains, DNS rebinding/TOCTOU, and network egress controls;
- distinguish secret redaction from secure recoverable-secret storage;
- use `READY WITH CONDITIONS` when important production controls are explicitly deferred to deployment infrastructure.

A plan that says a critical invariant will be verified only by simulation when the real failure can reasonably be induced is incomplete.
