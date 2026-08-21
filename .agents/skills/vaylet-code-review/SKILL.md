---
name: vaylet-code-review
description: Use this skill to review a VAYLET valet-platform branch, commit, pull request, patch, or local diff after implementation. It performs adversarial repository-contract review for scope leakage, tenant/location authorization, authorization-before-mutation ordering, retry/idempotency and concurrency, database integrity, abstraction compatibility, append-only history, API contract consistency, downstream-consumer contracts, future-model contamination, 300-line architecture compliance, tests, and evidence-backed gate status. Review is read-only unless the user explicitly asks to fix findings.
---

# VAYLET Code Review

Version: 1.5

## Mission

Review the **actual change**, not the implementer's summary.

A passing test suite is evidence, not proof of correct domain/security semantics. A safe database schema is not proof that the application abstraction uses it correctly.

By default this skill is read-only.

## Establish review target

Determine:

- base ref/commit;
- head ref/commit;
- changed files;
- full diff;
- related task/Issue;
- Accepted Decision(s);
- relevant binding docs;
- claimed validation evidence.

If reviewing local changes, inspect `git status`, `git diff`, and staged diff separately.

If reviewing a PR/branch, compare it against the intended base.

Do not review from a prose summary alone.

## Read contracts first

Read:

- `AGENTS.md`;
- task-relevant Accepted Decision(s);
- `docs/06_SECURITY_AND_DATA_RULES.md`;
- `docs/07_DEFINITION_OF_DONE.md`;
- `docs/08_DECISIONS_LOG.md`;
- `docs/17_AGENT_CODE_STRUCTURE_RULES.md`;
- phase execution plan relevant to the task;
- directly relevant schema/migrations/code/tests;
- concrete helper/writer abstractions touched or reused.

## Review passes

Perform all passes in `references/review-matrix.md`.

### Pass 1 — Scope

Confirm every changed file and behavior belongs to the task.

### Pass 2 — Contract fidelity

Compare implementation line-by-line against the Accepted Decision and binding docs. Look for hidden decisions encoded in error handling, DTOs, helper extensions, or tests.

### Pass 3 — Authorization / isolation

Attack tenant/location/user/membership/role and self-vs-other boundaries.

For every protected mutation, perform an **authorization-before-mutation trace** from entrypoint to SQL/write: principal authentication -> persisted target/scope resolution -> operation-specific authorization -> concurrency protection -> mutation -> audit -> commit. Flag any path where mutation can happen before the required ownership/scope proof.

### Pass 4 — Retry / concurrency / persistence

Attack replay semantics, duplicate races, conflicting races, stale state, NULL semantics, composite FKs, guarded updates, migration compatibility, and DB authority.

### Pass 5 — Abstraction compatibility

Verify reused helpers/writers can actually represent the new entity/scope safely. Reject fake/sentinel values, silently weakened types, or generic broadening that was not accepted.

### Pass 6 — Audit / privacy

Verify append-only/atomic history, correct writer/entity scope, and absence of secret/private leakage.

### Pass 7 — Downstream boundary

If the task exists to provide a reusable capability to a later slice, verify that capability exists independently of transport where the accepted architecture requires it.

### Pass 8 — Architecture

Check module responsibility and 300-line rules.

### Pass 9 — Tests

Look for missing negative/retry/race/boundary tests, not just happy-path coverage.

### Pass 10 — Evidence

Verify claimed gates from actual command/CI evidence when available. Never repeat an implementer's “passed” claim as fact without evidence.

### Pass 11 — Internal consistency

Compare docs, error names, event names, API contracts, implementation, and tests. A behavior cannot be simultaneously treated as accepted in code and unresolved in documentation.

### Pass 12 — Production evidence / hostile failure

When the change makes runtime, migration, Docker, CI, queue/worker, external-side-effect, SSRF, secret-handling, or production-readiness claims, read `references/production-evidence-and-failure-gates.md` and verify the evidence level actually reached. Attack claims that are stronger than their evidence.

## Security review posture

Prefer false-positive investigation over silent acceptance for:

- cross-tenant data access;
- cross-location substitution;
- role escalation;
- self-service endpoint mutating another employee without explicit authorization;
- client-controlled scope;
- authorization-by-resource-code/QR;
- mutable audit/custody history;
- race conditions that double-assign physical resources;
- unsafe supervisor override;
- credential/token leakage;
- migration data rewriting that fabricates operational truth;
- incompatible helper reuse that bypasses intended scope invariants.

## Authorization-before-mutation review

This is a merge-blocking security gate for protected writes.

Trace every `INSERT`/`UPDATE`/`DELETE` or equivalent state transition that affects protected tenant/operational data. Verify:

- principal authentication happens through the accepted path;
- target resource and tenant/location scope are resolved from persistence, not trusted from caller claims;
- operation-specific ownership/capability is proven **before** mutation;
- authentication (`User is ACTIVE`) is not mistaken for resource authorization (`this Shift belongs to this User`);
- lock/guard semantics keep the authorization proof valid through the write;
- mutation is not used as the first authorization test;
- `RETURNING`, affected-row count, or a fallback SELECT does not postpone ownership checking until after an unauthorized write was possible;
- retry/re-read convergence proves ownership/scope again before returning protected data;
- foreign/non-owned target behavior remains non-disclosing;
- audit actor/scope is derived from the authorized persisted state.

A transaction that later rolls back does not make mutation-before-authorization acceptable. A safe guarded write may encode authorization in its predicate, but the full accepted authority predicate must be in that write and the failure classifier must not leak resource existence.

Read `references/authorization-before-mutation.md` for attack patterns.

## Retry/idempotency review

For every mutation, verify the accepted outcomes for:

- first valid execution;
- identical retry after success;
- concurrent identical requests;
- conflicting concurrent requests;
- retry after the post-success state;
- same idempotency key with changed payload, when applicable.

Distinguish authoritative data integrity from API idempotency. A partial unique index may prevent duplicate rows while the API still mishandles replay semantics.

## Abstraction compatibility review

Whenever the patch reuses or modifies a helper/writer:

- inspect required arguments and type constraints;
- inspect entity/scope assumptions;
- inspect transaction ownership;
- inspect authorization assumptions;
- inspect callers outside the task.

Do not accept broadening a custody/session-specific abstraction into a generic one unless the Accepted Decision or architecture contract supports that change and regression tests protect existing callers.

## Future-model contamination

Check whether the patch promotes an old/read-model field into a future canonical model.

Phase 3 example: do not allow `ValetSession.currentAssigneeMembershipId` to become canonical Hybrid Dispatch ownership unless an Accepted Decision explicitly says so.

## Downstream consumer review

If a later slice is expected to consume this task's capability, verify:

- the reusable boundary is explicit;
- authoritative inputs are well scoped;
- the result expresses the accepted semantics;
- transport is not accidentally the only reusable interface;
- future Task/Dispatch ownership is not pulled backward;
- later work will not have to duplicate weaker eligibility logic.

## API review

Verify:

- route family matches actual application conventions;
- public contracts live in the correct package;
- request scopes are not unnecessarily caller-controlled;
- response does not leak exact key/parking location to guest surfaces;
- error mappings are bounded and consistent;
- controller stays thin when that is the established pattern;
- retry behavior is represented consistently with the accepted command contract.

## Database review

When DB-affecting:

- inspect Prisma/schema and SQL migration, not just one;
- verify migration count/name contract;
- ensure historical migrations are untouched unless authorized;
- inspect partial indexes/check constraints invisible in Prisma;
- test existing-data compatibility;
- inspect runtime-role grants/revokes for append-only tables;
- reject silent dedupe/backfill that invents physical history.

If no migration was added, verify that conclusion against the final Accepted Decision rather than merely repeating the implementation plan.

## Audit review

Inspect both the table shape and the actual writer.

A nullable `audit_events.valet_session_id` does not by itself prove an existing writer supports non-session events.

Verify:

- actor scope;
- organization/location scope;
- entity type/id;
- writer contract;
- occurredAt source;
- atomic transaction boundary;
- safe allowlisted metadata.

## 300-line review

Run the repository architecture check when possible.

For new/modified authored code, check physical line counts and grandfathering rules.

Do not accept architecture-baseline changes used merely to grant an exception.

## Finding severity

Classify each finding:

- `BLOCKER`: merge must stop; security/data/domain contract can be violated.
- `MAJOR`: substantial correctness/maintainability gap; should be fixed before merge.
- `MINOR`: bounded improvement that does not invalidate the task contract.
- `NOTE`: observation or deferred item explicitly outside scope.

Do not inflate severity for style preferences.

## Required output

1. `Review target`
2. `Decision/docs checked`
3. `Findings` ordered BLOCKER -> MAJOR -> MINOR
4. `Security & tenant/location verdict`
5. `Retry/concurrency & DB verdict`
6. `Abstraction compatibility verdict`
7. `Audit/privacy verdict`
8. `Downstream consumer verdict`
9. `Architecture/300-line verdict`
10. `Test adequacy verdict`
11. `Scope leakage verdict`
12. `Gate evidence`
13. `Merge verdict`

Final merge verdict exactly one of:

`BLOCK MERGE`

`MERGEABLE AFTER FIXES`

`CLEAN TO MERGE`

## Read-only rule

Unless the user explicitly asks for a fix, do not modify files, commit, push, merge, or resolve findings automatically.

## v1.2 adversarial consistency overlay

These rules override looser wording above.

Review specifically for **decision leakage**: compare unresolved planning/docs against concrete code and tests. Any route/status/error/event/role/retry/migration behavior implemented without acceptance is a MAJOR or BLOCKER depending on impact.

Require exact identity-scope language and behavior. Flag `per membership` implemented/documented as `per user globally` unless repository constraints prove it.

Do not accept “missing code means contradicted” reasoning. Conversely, do not accept new behavior merely because no code forbids it.

For eligibility/authorization used before a protected write, review the complete check-use race. Ask whether Shift end/access revocation/status disable can commit after the check and before assignment/write. A read-only guard with no accepted consumer transaction contract is not sufficient proof.

Verify route literals against at least two existing staff controllers when route convention is claimed.

Flag role-hierarchy assumptions not explicitly accepted.

Flag Prisma-specific error handling in raw PostgreSQL paths.

Audit exact event names and metadata against binding evidence; generic audit requirements do not authorize invented event contracts.

Tests are executable policy: if tests assert an unresolved 200/409/event/override result, treat that as hidden decision implementation.

## v1.3 OMEGA review overlay

These rules are mandatory and override weaker review guidance above.

### Proposition/policy provenance review

For each externally observable behavior introduced by the diff, identify the exact Accepted Decision or binding clause that authorizes the **same proposition**.

Flag code that implements a corrected/qualified version of an unaccepted requirement while claiming the original requirement was accepted.

Treat existing code patterns as convention evidence, not automatic authorization for new domain policy.

### Semantic decision-leakage review

Search beyond exact names. Compare unresolved decisions to semantic equivalents in:

- SQL predicates;
- lock clauses;
- role arrays;
- route decorators;
- DTO schemas;
- error mappings;
- audit event strings;
- function signatures;
- tests.

Examples of hidden leakage:

- unresolved dynamic eligibility implemented through status/access joins;
- unresolved locking policy implemented through `FOR SHARE`;
- unresolved route accepted by adding a concrete controller;
- unresolved retry semantics encoded only in tests.

### Concurrency proof review

For every material race, require evidence for the full transaction interaction, not only a unique index or a `transaction()` wrapper.

Check commit and rollback branches for conflicts involving uncommitted rows. Check unknown client commit status when retry behavior is claimed.

Reject unsupported statements such as `second request always gets 23505` unless exact PostgreSQL semantics/tests prove it for that statement pattern.

### Mechanism-authorization review

Flag selected `FOR UPDATE`, `FOR SHARE`, advisory locking, SERIALIZABLE, version columns, or idempotency keys when architecture/policy was unresolved and the mechanism is not mechanically forced by accepted invariants.

A technically sound lock can still be an unauthorized architecture decision.

### Free-text audit/privacy review

For any reason/note/comment written to audit or history, review both metadata keys and values.

Check length, normalization, secret-bearing values, sensitive-data exposure, and whether raw free text is actually required. Do not accept `the key is allowlisted` as sufficient privacy proof.

### Falsification and completion-claim review

When an implementation/plan claims complete coverage, verify the count/evidence behind that claim.

Examples:

- all accepted behaviors have tests;
- all concurrency scenarios are covered;
- no unresolved decisions remain;
- all audit findings were resolved.

If the evidence only samples a few cases, downgrade the claim and file a finding proportional to risk.

### Identity-scope regression review

Always trace `authenticated user -> membership -> organization/location -> resource` explicitly for Shift/Dispatch work. A user may have multiple memberships; a membership-scoped invariant must not become user-global through API/query assumptions.

## v1.4 mutation-order review overlay

For every protected write in the diff, identify the exact source line/function where target authority becomes true and the exact source line where the mutation can first occur. If mutation precedes authority, report **BLOCKER** even if the transaction would later roll back or the endpoint is authenticated.

Explicitly attack opaque-ID self-service endpoints by substituting a foreign resource UUID in the reasoning. Verify the successful mutation path cannot affect it. Then repeat the attack on retry/already-completed paths for disclosure.

## v1.5 production-claim review overlay

These rules are mandatory for production-affecting reviews. Read `references/production-evidence-and-failure-gates.md`.

Treat evidence inflation as a correctness issue, not a wording nit. Examples:

- typecheck reported as lint;
- schema sync reported as migration verification;
- image build/config file reported as Docker runtime success;
- local CI commands reported as an actual CI run;
- authentication coverage reported as IDOR coverage;
- simulated worker cleanup reported as SIGKILL recovery;
- green tests reported as production readiness despite a known network/security condition.

For queue/worker changes, attack the exact hard-crash window: remote work/queue pop succeeds, process dies before local acknowledgement/state commit. Verify recovery is independent of the dead process and uses safe lease/visibility semantics so a healthy worker is not requeued as orphaned.

For remote side effects, flag exactly-once claims when success can occur remotely before local success persistence. Require stable idempotency identifiers and bounded at-least-once semantics unless a stronger receiver protocol is proven.

For SSRF defenses, explicitly test/review IPv4-mapped IPv6, redirects to private targets, redirect chains, DNS resolution behavior, and DNS-rebinding/TOCTOU. If socket-level pinning or network egress enforcement is absent, ensure the residual risk is stated rather than hidden behind an absolute claim.

For persisted signing/payment secrets, verify both redaction and at-rest storage. A recoverable HMAC secret cannot be one-way hashed; plaintext persistence without an accepted encryption/key-management boundary is a production risk.

When a report uses `READY`, verify that no known blocking/critical production condition remains. Otherwise require `READY WITH CONDITIONS` or `NOT READY` proportional to risk.
