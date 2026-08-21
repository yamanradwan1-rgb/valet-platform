# Authorization Before Mutation — Planning Gate

A protected mutation is safe only when the caller's operation-specific authority is proven **before** the mutation can change protected state.

## Required order

For each mutation plan, prove this order inside the authoritative transaction boundary where applicable:

1. authenticate the principal using the repository's accepted principal path;
2. resolve the target and authoritative tenant/resource scope from persistence;
3. prove the exact authorization required by this operation (self-ownership, tenant, Location, role/capability, active-state policy as accepted);
4. acquire the concurrency protection required to keep that proof valid through the protected write;
5. perform the mutation;
6. append required audit/history atomically;
7. commit;
8. on retry/fallback/re-read, re-prove the authorization required before returning protected state.

Principal authentication is not resource authorization. `User is ACTIVE` does not prove that a Shift, Vehicle, Task, Payment, or other target belongs to that User or is inside their authorized scope.

## Forbidden planning patterns

Reject plans that:

- execute `UPDATE`/`DELETE` first and inspect `RETURNING` to discover whether the caller owned the row;
- mutate a row by opaque UUID and check ownership only after a zero-row or retry branch;
- use the mutation itself as an authorization probe;
- rely on transaction rollback to make an unauthorized mutation attempt acceptable;
- return an already-mutated/already-ended resource on retry without re-proving ownership/scope;
- treat possession of a UUID as authority;
- use a broad authorization error name that contradicts the actual operation semantics merely to obtain a concealed HTTP mapping.

## Acceptable shapes

Two common safe shapes are:

- **locked proof then mutation**: load/lock target + persisted ownership/scope, authorize, then mutate that proven target;
- **authorization encoded in the write predicate**: one guarded mutation whose SQL predicate/join itself proves all required persisted ownership/scope conditions, with non-disclosing failure classification that does not leak existence.

Which shape to use must follow the Accepted Decision and nearest repository pattern. Do not invent a generic rule that every mutation must use one specific SQL lock primitive.

## Retry/fallback rule

A retry path is a fresh authorization decision. If the command re-reads an already-completed resource, it must verify the same self/tenant/ownership boundary required to reveal that resource before returning it.

## Planning evidence

For each protected command, include a short proof table:

| Stage              | Repository/decision evidence | Planned action |
| ------------------ | ---------------------------- | -------------- |
| Authenticate       | ...                          | ...            |
| Resolve target     | ...                          | ...            |
| Authorize target   | ...                          | ...            |
| Lock/protect proof | ...                          | ...            |
| Mutate             | ...                          | ...            |
| Audit              | ...                          | ...            |
| Commit             | ...                          | ...            |
| Retry/re-read      | ...                          | ...            |
