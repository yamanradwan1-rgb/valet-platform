# Security and integrity implementation checklist — v1.1

## Identity and authorization

- Authenticate through the established staff principal path.
- Active user is distinct from active membership.
- Active membership is distinct from role permission.
- Organization/location status is distinct from explicit LocationAccess.
- Operation-specific permission must be accepted, not inferred from title alone.
- Self-target and target-other operations require separate authorization analysis.
- Use persisted resource scope to avoid foreign-tenant existence leaks.
- For eligibility consumed later, enforce the accepted dynamic-vs-frozen semantics; do not assume Shift creation permanently proves current access.

## Tenant/location isolation

Where persistence is tenant/location-owned, prefer composite scope at the database boundary.

Review every foreign key and query predicate for cross-tenant and cross-location substitution.

## Retry/idempotency

For each mutation prove the accepted outcomes for:

- first execution;
- identical retry after success;
- concurrent identical requests;
- conflicting concurrent requests;
- retry after post-success state;
- idempotency-key payload conflict, if applicable.

A unique/partial unique index protects integrity but does not automatically define the API result of a replay.

## Concurrency

A successful pre-read does not reserve a resource.

Use one or more authoritative mechanisms as appropriate:

- unique/partial unique constraint;
- composite FK/CHECK;
- row lock;
- guarded UPDATE with expected state/version;
- transaction isolation/locking behavior already established by the repository.

Classify loser outcomes safely and deterministically.

## Abstraction compatibility

Before reusing a security-sensitive helper or writer:

- inspect required scope/entity fields;
- inspect transaction ownership;
- inspect authorization assumptions;
- inspect all existing callers before broadening it.

Never fabricate a session id, tenant id, or entity type to satisfy an incompatible helper signature.

## Time

Use server/database-authored time where existing contracts require it. Do not accept security/custody timestamps from clients unless explicitly allowed.

## Audit/history

Protected mutations and required append-only history should commit atomically when accepted.

Inspect the actual audit writer contract, not only the table schema.

Never write:

- Authorization headers;
- raw tokens or credentials;
- passwords;
- OTP/pickup codes;
- raw PAN/CVV;
- payment provider secrets;
- hidden resource secrets

into audit metadata.

## Downstream boundaries

When a later server-side slice consumes an eligibility/authorization result, prefer a directly reusable internal boundary consistent with the accepted architecture. Do not duplicate weaker authorization logic in the later slice or force it through HTTP without an explicit reason.

## Privacy

Guest surfaces must not expose exact KeySlot, ParkingZone/ParkingSpot, or exact operational coordinates unless an accepted contract explicitly changes that boundary.

## v1.3 free-text and concurrency additions

- Audit metadata key allowlists do not sanitize values. Treat operator-entered reason/note text as potentially secret-bearing or sensitive.
- Do not persist arbitrary free text without accepted bounds/privacy semantics.
- For eligibility-dependent writes, a pre-check is not authorization proof at commit time unless the accepted transaction invariant closes invalidation races.
- When an uncommitted uniqueness conflict is part of retry semantics, prove both competing commit and rollback branches before mapping the loser to a transport outcome.

## Authorization-before-mutation ordering

For protected operational writes, authenticate first, resolve persisted target/scope, prove the exact operation-specific authority, preserve that proof through the concurrency boundary, and only then mutate. A later ownership query or rollback cannot retroactively authorize an earlier write. Retry/re-read responses must re-prove ownership before returning protected state.
