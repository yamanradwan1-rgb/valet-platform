# Race & identity precision — v1.2

## Identity ladder

Always distinguish User, OrganizationMembership, Organization, Location, and Shift.

A unique index on `membership_id` means one active row per membership identifier. It does not prove one active Shift per User across multiple organization memberships.

## Check-use race

For any guard used by a later write, diagram:

`read eligibility -> concurrent invalidation -> protected write`

Consider invalidators such as:

- Shift ends;
- LocationAccess removed;
- membership/user disabled;
- Organization/Location disabled;
- competing assignment accepted.

A SELECT returning true is not an atomic guarantee unless the write transaction/invariant closes the race.

## Ownership of the race solution

If the current slice only defines the eligibility boundary and a later slice owns assignment, document:

- what the guard guarantees at evaluation time;
- what transaction/locking assumptions a consumer must satisfy;
- what remains for the later slice.

Do not pull Task persistence early just to solve the future race.

## v1.3 additions

### Uncommitted conflict branches

When one transaction encounters another transaction's uncommitted row/index entry, analyze:

- winner commits;
- winner rolls back;
- caller cannot tell whether winner committed due to timeout/disconnect.

Do not state an exact loser error without proving the precise PostgreSQL statement behavior.

### Concurrency answer schema

For every requested race scenario record Tx A, Tx B, rows/resources, sequence, unsafe interleaving, existing protection, missing protection, linearization point if known, decision status, and owning task.

### Lock mechanism neutrality

`FOR UPDATE`, `FOR SHARE`, advisory locks, SERIALIZABLE, guarded writes, and version columns are not interchangeable implementation details. If the accepted contract does not choose or force one, present them as conditional alternatives rather than selecting one.
