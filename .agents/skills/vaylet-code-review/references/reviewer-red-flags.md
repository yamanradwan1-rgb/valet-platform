# Reviewer red flags — v1.1

Investigate these aggressively:

- New API route says `/api/v1/...` without verified global prefix.
- New public DTOs live only under `apps/api` while current clients use `@valet/contracts`.
- `currentAssigneeMembershipId` described as Task ownership.
- “open tasks” query reads only ValetSession without an accepted transitional rule.
- supervisor override introduced without explicit role/location/target semantics.
- target shift/member id supplied by employee self-service endpoint without need.
- organization id supplied by client and trusted.
- check-then-insert duplicate protection without DB authority.
- DB unique constraint treated as if it automatically defines idempotent replay behavior.
- no test for identical retry after successful mutation.
- audit event written after transaction commit.
- nullable `audit_events.valet_session_id` used as proof that a session-specific audit writer supports Shift events.
- fake/sentinel ValetSession/entity id supplied to reuse an incompatible audit/helper abstraction.
- custody/session-specific helper broadened generically without accepted architecture or regression tests.
- audit metadata includes reason/free-form text without checking allowed content/sensitivity.
- task is supposed to provide an eligibility/availability boundary but implementation only exposes HTTP endpoints.
- later server code would have to call its own HTTP endpoint to reuse a domain eligibility rule.
- Prisma looks safe but migration SQL has weaker FK/index/check behavior.
- migration silently backfills physical custody/location truth.
- `no migration required` repeated from a pre-decision plan despite a later Accepted Decision changing integrity requirements.
- new >300-line test/service/controller.
- architecture baseline changed to excuse the new file.
- test summary claims broad coverage but omits retry/race/negative paths.
- event/error/route named as accepted in code while decision docs still mark it unresolved.

## v1.3 red flags

- candidate assertion classified from evidence that actually proves its opposite;
- `UNRESOLVED` dynamic/captured policy but mandatory current-status joins appear later;
- `UNRESOLVED` locking policy but concrete `FOR SHARE`/`FOR UPDATE` appears in code;
- exact loser SQLSTATE claimed without commit/rollback branch evidence;
- safe audit metadata inferred only from the field name while arbitrary free-text values are stored;
- exact new route/function/file treated as mandatory under DECISION REQUIRED;
- `all/every/no findings remain` claim with only sampled evidence.

- Protected UPDATE/DELETE executes before self-ownership/tenant/location/capability is proven.
- Code uses mutation `RETURNING` or affected-row count as the first authorization check.
- Active-user authentication is treated as proof that a target UUID belongs to the caller.
- Retry/re-read path returns an already-mutated foreign resource without re-proving ownership.
- Implementation relies on transaction rollback to excuse mutation-before-authorization.

## Production-evidence red flags

- `Passed` claim with no command/run evidence.
- Docker image built, but no running-stack proof.
- CI YAML exists, but no distinction between configured/local/remote execution.
- `db push` or equivalent used as migration evidence.
- Authenticated-route test labeled IDOR/authorization coverage.
- SIGKILL recovery that calls cleanup from the killed process.
- Processing queue recovery with no age/lease/visibility semantics.
- SSRF guard that validates once and then auto-follows redirects.
- SSRF guard that misses IPv4-mapped IPv6.
- HMAC/signing secret masked from responses but stored plaintext without an accepted at-rest protection boundary.
- `exactly once` language for external HTTP side effects.
- `READY` while a known critical production mitigation is deferred.
