# VAYLET adversarial review matrix — v1.1

## Scope

- Any file unrelated to task?
- Any future phase pulled early?
- Any dependency/lockfile change not authorized?
- Any docs claiming completion before evidence?
- Any implementation choice that was still unresolved in the Accepted Decision?

## Authorization / tenant / location

- User active?
- Membership active?
- Organization/location active?
- Explicit LocationAccess required and enforced?
- Allowed role exactly matches accepted contract?
- Self vs target-other semantics correct?
- Cross-tenant IDs concealed safely?
- Cross-location resource substitution impossible?
- Caller supplying organization/member/location identifiers unnecessarily?
- Dynamic eligibility re-check semantics honored where accepted?

## State / ownership

- Explicit command rather than generic state patch?
- Required state checked?
- Target state accepted?
- Version/stale-write protection correct?
- Future Task ownership kept separate from ValetSession current assignee?

## Retry / idempotency

- First execution correct?
- Identical retry after success correct?
- Concurrent identical requests correct?
- Conflicting race correct?
- Retry after post-success state correct?
- Idempotency-key payload conflict handled when applicable?
- DB integrity outcome distinguished from API replay semantics?

## Concurrency

- Duplicate command race?
- Conflicting command race?
- Unique/partial unique constraint semantics?
- Multiple NULL behavior?
- Guarded update/row lock behavior?
- Database violation classified safely?

## Abstraction compatibility

- Existing helper/writer actually accepts the new scope/entity?
- Any fake/sentinel id used to satisfy a narrow interface?
- Any security-sensitive helper generalized without accepted architecture?
- Existing callers/regressions covered if helper changed?
- Transaction ownership remains correct?

## Database

- Composite tenant/location FK where required?
- CHECK constraints required for cross-field invariants?
- Partial indexes already exist but invisible to Prisma?
- Old migrations untouched?
- New migration deterministic and compatible?
- No silent dedupe/backfill/fabrication?
- Runtime role privileges least-privilege?
- If no migration: does the final Accepted Decision support that conclusion?

## Audit / Black Box

- Correct actor?
- Correct organization/location/session/entity scope?
- Actual writer supports that scope/entity?
- Server-authoritative occurredAt?
- Atomic with protected mutation?
- Append-only?
- No secret/private metadata?
- Corrections preserve prior history?

## Downstream consumer boundary

- Task's required reusable capability actually exists?
- Later slice can consume it without duplicating authorization logic?
- Internal consumer is not forced through HTTP without accepted reason?
- Boundary does not pull future Task ownership backward?

## API/contracts

- Current route prefix verified?
- `packages/contracts` used when public/shared?
- Request/body/query validated?
- Authentication principal resolved by established mechanism?
- Error code/status mapping established?
- Retry behavior consistent with command contract?
- Guest response excludes exact KeySlot/Zone/Spot/location coordinates?

## Architecture

- New files <=300 physical lines?
- Grandfathered files not grown improperly?
- No baseline gaming?
- One responsibility per file?
- No generic abstraction added without need?

## Tests

- Happy path?
- inactive user/membership/org/location?
- role denial?
- self vs target-other?
- cross-tenant?
- cross-location?
- identical retry after success?
- duplicate/concurrent identical command?
- conflicting concurrent command?
- stale state/version?
- rollback atomicity?
- audit writer scope/entity proof?
- database constraint proof?
- downstream reusable boundary tested directly?
- runtime privilege proof if relevant?
- no scope-leak tests missing?

## Internal consistency

- Docs and code agree on event/error/route names?
- Nothing treated as LOCKED in code while docs say UNRESOLVED?
- Test names do not smuggle in unaccepted policy?
- Migration/no-migration claim matches final decision?

## Authorization-before-mutation proof

For each protected mutation, record the exact first point where operation-specific authority is proven and the exact first point where state can change. Authority must come first. Include retry/re-read paths. If only principal authentication precedes the write but ownership/scope proof follows it, classify as BLOCKER.

## Production evidence / hostile failure

- Is lint truly lint, distinct from typecheck?
- Are versioned migrations verified rather than only schema sync?
- Is Docker runtime actually exercised, with container state/health/logs/dependency connectivity?
- Is CI merely configured/local-verified, or was the actual remote run observed?
- Do IDOR claims include two distinct principals/scopes and a protected object?
- Do hard-crash claims use SIGKILL/OOM/container-loss semantics rather than graceful cleanup?
- Can processing/in-flight jobs be orphaned, and is recovery lease/visibility-based?
- Can a sweeper race a healthy worker?
- Is DB+queue/external dual-write failure handled durably?
- Are exactly-once remote side-effect claims overstated?
- Does SSRF defense cover mapped IPv6, DNS-resolved private IPs, redirects, and rebinding residual risk?
- Are recoverable secrets protected at rest as well as redacted in API/logs?
- Does any `READY` claim remain valid after known production conditions are considered?
