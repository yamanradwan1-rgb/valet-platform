# Authorization Before Mutation — Reviewer Attack Guide

Treat any protected write before operation-specific authorization as a **BLOCKER**.

## High-risk shapes

### Mutate, then authorize

```text
UPDATE protected_resource WHERE id = supplied_id RETURNING ...
if no row: load owner / classify authorization
```

If the successful UPDATE path did not prove ownership first, a foreign UUID may mutate another actor's row.

### Authentication mistaken for ownership

```text
require active user
UPDATE shift WHERE id = :shiftId
```

Active authentication proves identity, not ownership of `shiftId`.

### Retry leaks

A second request finds an already-completed resource and returns it without re-proving that the caller may see that resource.

### Rollback rationalization

Code intentionally mutates first, checks authority later, and relies on throwing/rollback when unauthorized. Reject it. Authorization must precede a write that could affect a foreign resource.

## Safe patterns

- load + lock target and persisted owner/scope, authorize, then mutate; or
- one guarded write that includes the full accepted persisted authorization predicate, followed by non-disclosing failure classification.

Do not require one universal SQL mechanism. Review the Accepted Decision and nearest repository concurrency pattern.
