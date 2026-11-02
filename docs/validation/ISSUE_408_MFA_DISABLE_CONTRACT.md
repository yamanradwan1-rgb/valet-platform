# Issue #408 — Owner-approved MFA disable contract

Status: Accepted by Owner Yaman Radwan, 2026-11-01; implementation authorized locally.
Authority: Owner Implementation GO explicitly accepts revised C1, exact C3, amended C4,
and unchanged C2. This is the task amendment record, not a new DEC number.
Base: 0a1d7420c9690d15c9765f9624e6d8e7c2470294.

## Contract and scope ledger

- LOCKED U-001: prohibit disable for any ACTIVE ORG_ADMIN membership in an ACTIVE Organization.
- LOCKED U-002: own-account enrollment/management for every ACTIVE authenticated Staff User;
  no business permission expansion, platform Super Admin/Customer identity changes or bypass.
- LOCKED U-003: fresh, unused, server-verified TOTP only; assurance/recovery alone insufficient.
- LOCKED U-004: preserve base Staff sessions and Native/Push; retired factor cannot supply assurance.
- LOCKED U-005: reuse ENROLLMENT_REQUIRED and truthful not-enabled/re-enrollment presentation.
- LOCKED U-006: self-derived target, authorization/proof before mutation, one transition,
  retired recovery unusable, atomic one-event success, fresh authorized read reconciliation.
- LOCKED C2: MFA_TOTP_DISABLED; USER actor = subject; no metadata; one event only for
  committed retirement, append-only existing account-security writer/function in the same transaction.
- DERIVED mechanics: same-User factor and session checks; existing TOTP crypto/step/limiter;
  current-factor assurance predicates and RR fence remain authoritative after retirement.
- FORBIDDEN expansion: business grants, MFA bypass, generic auth coordinator, unrelated redesign,
  history deletion, credential persistence, unrelated Native changes, production/release operations.
- UNRESOLVED implementation-critical contracts: none. COS review may be blocked by connectivity;
  missing independent review is reported honestly and never replaced with invented approval.

Affected entities: User, OrganizationMembership, Organization, StaffAuthSession,
UserMfaTotpFactor, AntiAbuseEvent, AccountSecurityAuditEvent. No custody, Task/Dispatch,
Location policy, Shift, token rotation or Push lifecycle transitions.
Prime owns all files in this isolated worktree; no concurrent writer.

The following transport and concurrency text records the selected revised package.
Alternatives describe the reviewed design history and are not implementation authority.

### C1 — exact additive transport

**Approved: GET `/v1/staff/auth/mfa/disable`**, authenticated exact Staff bearer session.
Strict empty query, no request body. HTTP 200 has exactly one of these strict objects:

| Authoritative snapshot condition, in precedence order   | Exact body                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| Any active ORG_ADMIN membership in active Organization  | `{"availability":"MFA_REQUIRED_BY_POLICY"}`                |
| No such mandate and current own factor ACTIVE           | `{"availability":"AVAILABLE","expectedFactorId":"<uuid>"}` |
| No such mandate and no ACTIVE factor, including PENDING | `{"availability":"MFA_NOT_ENABLED"}`                       |

UUID uses exported `staffMfaFactorIdSchema`. No other keys accepted; no nullable UUID.
The read derives User, exact current token/session validity and factor from persistence,
and evaluates all memberships. Use one SQL statement/MVCC snapshot for these facts.
It performs no writes, limiter reservation, audit, factor creation, activity update,
assurance renewal, token refresh or mutation recovery. Row existence outside the
caller account is never queried by an input factor UUID. Current User/session failure
uses the existing neutral authentication error, not an availability response.

Responses, including errors, are private and non-cacheable:
`Cache-Control: private, no-store`; `Pragma: no-cache`; no cookie/token issuance.
This tightens the new endpoints' header value; the existing helper currently emits
`no-store`, which is not falsely described as including the literal `private` directive [S5].
Compatibility obligation within this C1 proposal: register both new operations in the
existing Staff-auth operation route list and preserve these headers in the exception
filter, including malformed JSON before controller execution and rate/unavailable errors.
Do not rely solely on controller-set headers. This is narrow existing infrastructure
wiring, not a second error/authentication coordinator.
The global Staff GET User-revalidation interceptor can reject after the controller
returns; that rejection also needs the exact shared authentication envelope and these
headers. Test the complete pipeline, not only a direct controller invocation.

Why a separate GET: current `/state` is strict and exposes neither availability nor
factor identity [S4]. Changing that shape breaks old parsers. Reusing enrollment/begin
to obtain an ID would mutate state. A new narrow read supplies exactly the precondition
and applicable policy without changing existing state responses or revealing tenant facts.
No broad state-service refactor is part of this proposal.

After reload: restore existing authentication, read `/state` and this new availability
read through the existing MFA client; keep UUID only in the current ceremony's memory.
Refresh availability when explicitly opening confirmation. An altered precondition closes
or resets confirmation for renewed user intent. Fence read, success, error and finally
callbacks by identity/session generation and request/ceremony epoch. Refresh/navigation
may make GETs but cannot POST. Existing PENDING state continues its existing enrollment flow.

**Approved: POST the same path**, strict JSON
`{"expectedFactorId":"<uuid>","code":"<exact six ASCII digits>"}` and empty query.
Uses the existing exported UUID/TOTP schemas. No User/Organization/Location/membership/
session/recovery/assurance/idempotency field. Backend independently resolves authenticated
User and current own ACTIVE factor; only then compares expectedFactorId. That UUID is
a concurrency precondition, never authorization. A foreign/nonexistent/random UUID
receives the same stale-factor result, without probing the foreign factor.

Only after confirmed commit: **200 `{"state":"ENROLLMENT_REQUIRED"}`**, strict object.
This describes that committed transition; a later enrollment may change current state.
The UI uses fresh reads after success and after uncertainty. Confirmation explains
loss of MFA protection and requires explicit submission. Code is memory-only and cleared
after the attempt; existing assurance or a recovery code does not substitute.
The action is shown only on AVAILABLE, including when ordinary session step-up is needed.
Policy prohibition shows a generic own-account reason, without Organization identifiers.

Alternative: version/extend `/state`. It adds a compatibility surface; not recommended.

### C3 — exact shared responses and retry outcomes

Use the existing strict error envelope **`{code: string, message: string, requestId: string}`**.
Add three domain codes to the shared public disable contract and central safe mapping;
retain existing generic API-error compatibility. Accepted status/message values:

| Condition                                                                              | HTTP / code                                    | Exact safe message                                                          |
| -------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------- |
| Malformed JSON, extra keys/query, body on GET, malformed UUID/code                     | 400 `REQUEST_INVALID` (existing)               | `The request is invalid.`                                                   |
| Inactive User, expired/revoked/wrong session, rotated old access token                 | 401 `STAFF_AUTHENTICATION_REQUIRED` (existing) | `Staff authentication is required.`                                         |
| Mandatory-MFA policy applies                                                           | 403 `MFA_DISABLE_NOT_ALLOWED` (new)            | `MFA disabling is not available for this account.`                          |
| Active factor differs from precondition                                                | 409 `MFA_STATE_CHANGED` (new)                  | `Account security changed. Refresh and try again.`                          |
| Already disabled/retired, no factor or only PENDING factor                             | 409 `MFA_STATE_CHANGED` (same new code)        | Same message; no historical/existence disclosure or repeated success.       |
| Contended try-lock/NOWAIT; deadlock/serialization/lock timeout with confirmed rollback | 409 `MFA_OPERATION_BUSY` (new)                 | `Account security is busy. Refresh and try again.`                          |
| Incorrect, expired/out-of-window or consumed TOTP                                      | 403 `MFA_VERIFICATION_FAILED` (existing)       | `MFA verification failed.`                                                  |
| Existing TOTP quota admission rejected                                                 | 429 `MFA_RATE_LIMITED` (existing)              | `Too many requests. Try again later.`; existing integer Retry-After header. |
| Crypto unavailable                                                                     | 503 `MFA_SECURITY_UNAVAILABLE` (existing)      | `Service temporarily unavailable.`                                          |
| Durable limiter unavailable                                                            | 503 `ANTI_ABUSE_UNAVAILABLE` (existing)        | `Service temporarily unavailable.`                                          |
| Expected database lease/deadline exhaustion                                            | 503 `INTERNAL_ERROR` (existing)                | `Service temporarily unavailable.`                                          |
| Unclassified database/COMMIT/network/internal server error                             | 500 `INTERNAL_ERROR` (existing)                | `The operation could not be completed.`                                     |

The last two rows reflect the actual mapper [S5], not an invented service-unavailable
code. A transport may have no HTTP response at all. Every ambiguous completion uses
read reconciliation. Never turn an unavailable COMMIT/rollback outcome into the busy
code, an assurance grant or a known failure claim. Existing errors are reused only for
their actual semantics; tenant `AUTHORIZATION_DENIED` concealment is not repurposed.

Validation precedes service execution as in existing controllers. After initial auth
and existing attempt admission, locked User/session authentication is re-proved, then
policy, then current-factor/precondition, then fresh proof. Contention before those
checks complete can return busy; it does not disclose later policy/factor details.
Rate admission can independently reject before locked business checks. Only proof
failure counts as a TOTP failure; confirmed non-proof rollback releases/ignores the
reservation through existing finalization after business locks are released.
Successful finalization is inside the protected transaction. On uncertain outcome,
retain bounded PENDING admission state rather than running an ambiguous second
finalization or masking the original result; ordinary expiry/cleanup applies [S8/S22].

| Required mutation case                             | Exact accepted result                                                                                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1. First valid execution                           | One committed transition and approved event; 200 above.                                                                                |
| 2. Identical retry after success                   | 409 state-changed, no second success/event.                                                                                            |
| 3. Concurrent identical execution                  | At most one committed success; loser busy while locked or state-changed after winner commit.                                           |
| 4. Conflicting MFA commands                        | No replacement factor retirement; busy, state-changed or generic proof failure based on freshly re-proved facts.                       |
| 5. Retry after post-success state or re-enrollment | Original UUID cannot match replacement; state-changed. Policy/auth may independently deny first.                                       |
| 6. Reused request identity with different payload  | No command identity/idempotency-key contract. Request ID is correlation only; each explicit request reauthorizes/proves independently. |

If a competitor rolls back, an explicit new request may proceed only with current
authorization and still-in-window unused proof. No transparent POST or transaction retry.
After timeout/lost response, read existing state plus availability. Absence confirms
current absence, not which command caused it. PENDING or a different ACTIVE factor is
reported truthfully; never resubmit the old intent against it. If reads fail, outcome
remains unknown and submission stays blocked until a fresh explicit ceremony.
TOTP replay identity is factor + accepted timestep, not a global blacklist of six-digit
strings. Step-up/reissue consumption invalidates that step for a later same-factor disable.

Alternative: durable operation/digest/success replay. It requires unnecessary new
storage/retention/security policy for this ceremony and is not recommended.

### C4 — fail-fast transaction boundary and membership-only index

**Approved: raw-pg READ COMMITTED, existing namespace keys, nonblocking contested
acquisitions.** Reuse exported helpers/predicates only where compatible. The blocking
MFA session/advisory helpers cannot be called blindly inside this new command [S6].

Accepted transaction acquisition order, all locks retained through outcome:

1. Try `staff-user-security:<own User>` transaction advisory key (existing hash scheme).
2. Own User `FOR UPDATE NOWAIT`; confirm ACTIVE. This conflicts with new membership FK checks.
3. Exact authenticated Staff session `FOR UPDATE NOWAIT`; recheck User, session ID,
   current access hash, creation identity, revocation and database expiry.
4. Try existing `mfa-user:<own User>` advisory key.
5. **All** own membership rows, ordered by ID, `FOR SHARE NOWAIT`, regardless of role/status.
6. **All** distinct referenced Organizations, ordered by ID, `FOR SHARE NOWAIT`, including inactive.
   Recompute the complete active-CA prohibition from the locked rows.
7. Own current live factor `FOR UPDATE NOWAIT`; require ACTIVE and matching precondition.
8. Own server-created limiter reservation row `FOR UPDATE NOWAIT`, guarded by ID/scope/key/PENDING.
9. Try the fresh server-generated audit-event UUID advisory key used by the existing writer.
   The writer then reacquires its own key reentrantly instead of introducing a late blocking wait.
10. Read fresh database time; decrypt/verify current factor TOTP against last accepted step.
    Recheck current session/expiry and proof window immediately before mutation if asynchronous
    work crossed the verification boundary. No network/provider I/O inside the transaction.
11. Guarded own ACTIVE-factor transition advances accepted step and sets RETIRED/retired_at;
    finalize admission and append approved account-security audit with the same database
    operation time. No base session/token/Push mutation. COMMIT, then success response.

Preliminary eligibility is never the authority boundary. The first protected write
is step 11, after all persisted ownership/policy/proof checks. Reservation admission is
separate anti-abuse bookkeeping, not permission to mutate a factor. No DELETE, recovery
code falsification, new disabled field or session-wide timestamp rewrite is proposed.

**Check-to-write proof.** Existing member updates/deletes conflict with member SHARE.
Existing Organization status changes conflict with Organization SHARE. New memberships,
or reparenting into the User, require the nondeferrable FK's parent KEY SHARE, conflicting
with User UPDATE. Insert-first makes the User NOWAIT fail; after competitor commit a
new explicit transaction reads its membership, after rollback it reads its absence.
Lock only ACTIVE/current-admin rows would leave promotion/activation gaps: expressly
excluded. FK definitions, columns and probes use the actual migrated schema [S20/S21].

**Lock-order compatibility, not a fictional uniform legacy order:**

| Existing writer / actual order                                                                                              | Proposal's interaction                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login/refresh: account-security advisory -> User/session/refresh rows [S12]                                                 | Same account key first serializes; a try-lock loser rolls back before mutation. No refresh credential lock needed by disable.                                                         |
| Controlled global disable: operation key -> account-security -> User -> all sessions -> Push -> audit [S13]                 | Disable never takes operation or Push resources; shared account key excludes same-User overlap.                                                                                       |
| Logout: refresh/session -> revoke -> Push [S12]                                                                             | If logout owns current session, session NOWAIT fails. If disable owns it, logout follows after commit/rollback. No Push lock is requested by disable.                                 |
| Existing MFA: session/User joined UPDATE -> MFA advisory -> factor [S6/S9]                                                  | Joined lock order cannot be assumed. If a legacy writer holds session while waiting for our User, our session NOWAIT fails and releases User. Existing keys/predicates are preserved. |
| Management: actor session/User -> Organization advisory -> actor/target membership -> optional admin factor SHARE [S14/S15] | Disable takes no Organization advisory; policy/factor NOWAIT fails on a held resource instead of waiting while blocking the writer. It never touches another User's factor/session.   |
| Onboarding: email -> sorted account-security keys -> Org/actor -> target User/member/invitation [S16]                       | Own account key excludes overlap; User parent lock also protects direct FK insertions. No email/invitation locks added.                                                               |
| Activation: email -> account-security -> Org -> Organization SHARE -> membership UPDATE -> User UPDATE -> invitation [S17]  | Own account key excludes it first; membership/User NOWAIT is defense for persisted row conflicts.                                                                                     |
| Assurance RR reader: prior auth locks -> exact factor SHARE through commit [S9]                                             | Factor UPDATE NOWAIT fails while held. Later RR authorization cannot use retired factor; existing serialization handling remains.                                                     |
| Account audit: event-ID advisory -> insert and same-User FKs [S10]                                                          | Pre-acquired identical advisory, own User already locked, random event ID; no new late audit-key wait.                                                                                |
| Staff TOTP admission finalizer: own pending row UPDATE [S22]                                                                | Reservation row pre-acquired; non-Guest path has no additional address/advisory lock.                                                                                                 |

Relative lock-order inversions **exist in current paths**; claiming otherwise would
be false. The amended mechanism prevents the new command from adding a waiting edge
on those contended row/advisory resources. Thus it cannot complete a new wait cycle
with those ordinary writers: it releases instead. Controlled opposing-order probes
confirmed release and subsequent writer progress. This is the basis proposed for
approval, rather than a claim that every legacy writer has one global order.

NOWAIT concerns row locks, not every PostgreSQL relation/internal wait. Runtime has no
DDL authority. Concurrent privileged DDL, table-lock upgrades or database faults retain
existing finite lock/statement/lease budgets, rollback/error handling, and unknown-outcome
reconciliation. No unbounded waiting or automatic replay is accepted. This proposal
does not refactor the global legacy lock graph or promise immunity from all deadlocks.

**Required policy races, all owned by #408's proposed boundary:**

In each row A is disable; B is the named competitor. A linearizes the policy/factor
decision only while holding the full boundary, with success at COMMIT. A read before
that boundary is insufficient. Mechanism status remains **LOCKED C4**, and
the security invariant is already LOCKED.

| B / authoritative resources                                         | Unsafe interleaving and missing current protection                                  | Accepted sequence and commit/rollback/unknown branches                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA membership creation; User FK + new member                        | Plain member query misses insertion after check                                     | A User UPDATE before member scan blocks FK insert. B insertion first makes A busy. B commit -> next explicit A sees prohibition; B rollback -> fresh A can evaluate; B unknown -> read current persisted policy, never assume absence. A first -> later membership creation is ordered after disable. Ordinary onboarding permits only lower roles; privileged CA insertion was tested separately. |
| Promotion; existing member + factor                                 | User lock alone permits LM -> CA after check                                        | A SHARE on every member conflicts with B canonical role UPDATE. B first -> busy then commit sees CA / rollback sees prior role. A first -> B waits, then may promote after A commit, requiring re-enrollment for Management. Existing promotion does not require target active factor; no usable-admin or MFA bypass is inferred. Unknown B -> fresh reads.                                        |
| Membership activation; INACTIVE/PENDING member + account/invitation | Filtering ACTIVE rows misses activation                                             | Lock all statuses. Canonical status writer / pending invitation activation first -> conflict; commit exposes ACTIVE, rollback preserves old status; A first -> later activation ordered afterward. Unknown -> fresh reads.                                                                                                                                                                         |
| Organization activation; inactive Organization + existing CA member | Locking only ACTIVE Organizations misses mandate becoming true                      | Lock referenced inactive Organizations too. B UPDATE first -> busy, then commit makes mandate true / rollback leaves inactive. A first -> activation follows A outcome. Unknown -> re-read; ordinary runtime cannot directly change Organization status.                                                                                                                                           |
| Role/status revocation; member + last-usable-admin factors          | Stale snapshot may misclassify authority, shared User with another CA can be missed | A locks all own members/Organizations; B canonical writer first -> busy then current facts after commit/rollback. Revocation can remove a prohibition only after commit; another active CA membership still prohibits. A first holds the old policy until outcome. Unknown -> re-read.                                                                                                             |
| Step-up/reissue; User/session/MFA key/factor step                   | Two proofs can consume same step without serialization                              | Shared User/MFA/factor boundary; B commit consumes step -> A proof fails; rollback leaves it unused subject to time; A commit retires -> B cannot establish active assurance. Unknown -> current state only.                                                                                                                                                                                       |
| Recovery/enrollment; current factor/live uniqueness                 | A might retire replacement or leave old recovery usable                             | Current User/factor locking and original-factor comparison. B commit replaces/retires -> stale precondition; rollback -> original facts; A commit -> old recovery unavailable and later enrollment new factor only. Unknown -> read both safe states.                                                                                                                                              |
| Refresh/logout/global User disable; User/session/account key        | Stale access/hash/session can survive preflight                                     | Locked exact token/session and shared account key. B commit invalidates access/session/User as applicable; rollback preserves prior facts; A first orders before B, while retirement never refreshes assurance. Unknown -> auth restore + authorized reads, not command replay.                                                                                                                    |
| Second disable; same resources/step                                 | Two success events for one factor                                                   | Try-lock loser is busy; later original-factor recheck sees no matching active factor after A commit. A rollback leaves no event/transition; explicit fresh attempt can qualify. Unknown -> reads; no success replay.                                                                                                                                                                               |

Mandatory CA policy applies at this ordered boundary, not forever after retirement.
A later legitimate promotion/activation may require MFA re-enrollment; Management
still denies without current assurance. Preventing all future role changes would be
a different policy and is not proposed. A last usable active Company Admin is denied
by the same account-wide prohibition; no last-admin exception is introduced.

**Index proposal — precisely `organization_memberships(user_id,id)`, nonunique,
all roles/statuses**, suggested name `organization_memberships_user_id_id_idx`.
Existing factor `user_mfa_totp_factors_user_id_id_key` is reused unchanged.
The member indexes in Prisma/SQL/catalog start with Organization or the PK ID;
none provides the account-wide ordered scan [S20/S21]. Actual proposed locking query:
`SELECT id, organization_id, role, status FROM organization_memberships WHERE user_id=$1 ORDER BY id FOR SHARE NOWAIT`.
No partial predicate: inactive/pending/lower-role rows are essential to the race boundary.

Disposable 100,000-member EXPLAIN ANALYZE: sequential scan, 1,430 shared hits,
4.510 ms before; index scan, 5 shared hits, 0.129 ms after; 4,980,736-byte index.
This demonstrates query support, not production latency/capacity. Artifact includes
full plans historical local index evidence (separate review artifacts).

Conditional migration shape for this C4 proposal: a forward-only index-only migration,
Prisma/schema/docs/manifest synchronization, no new runtime privilege. Reuse migration
079's safe empty-bootstrap/nonempty-preinstalled pattern [S23]: verify exact valid ready
catalog shape; create transactionally only under verified-empty table lock; fail safely
on nonempty data unless a separately authorized operator concurrently preinstalled the
exact index. Never run CONCURRENTLY inside Prisma's transaction or silently skip a
wrong/invalid same-name index. This adds an operational prerequisite on existing databases;
deployment/application of it is not authorized by design approval. The canonical implementation migration is
`20261101010700_issue408_mfa_disable_policy_index`; the original review performed no migration write. The disposable trial verified actual concurrent build on existing data,
25001 for concurrent build inside transaction, and ordinary index rollback. The proposed
guard/migration is verified by the focused migration tests and implementation report.

Alternative: blocking locks in existing helpers without full order remediation is
not recommended. Serializable isolation alone still needs proof/replay/error policy
and compatibility work. An index-free query is correct but scans tenant-wide membership
storage for an account operation; measured account-leading index is recommended.

## Evidence and references

Existing architecture references are the AuthModule, StaffMfaController, shared staff-mfa
contracts, account-security-audit-writer, migration 035/036/106, existing transaction/outcome
wrapper, runtime role grants, and migration 079 guarded online-index pattern. Implementation
evidence is recorded separately; baseline probes are not feature acceptance.

Source references (all pinned main; anchors identify inspected symbols):

- S1: [StaffMfaController](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/apps/api/src/modules/auth/mfa/staff-mfa.controller.ts#L52).
- S2: [StaffAuthController](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/apps/api/src/modules/auth/staff-auth.controller.ts#L84).
- S3: [AuthModule](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/apps/api/src/modules/auth/auth.module.ts#L35).
- S4: [staff MFA schemas](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/packages/contracts/src/staff-mfa.ts#L7), state at line 84; `packages/contracts/src/index.ts` and package exports inspected.
- S5: [auth transport](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/apps/api/src/modules/auth/staff-auth.transport.ts#L23), [error mapper](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/apps/api/src/common/http/api-errors.ts#L211); `common/http/api-operation-runner.ts`, contracts `api-errors.ts`.
  Also `common/http/staff-auth-operation-routes.ts`, `api-exception.filter.ts` (`routedOperation`, Staff-auth headers and `isBadRequest` path); unknown route currently falls back to BaseExceptionFilter.
- S6: [MFA session locks/eligibility](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/apps/api/src/modules/auth/mfa/mfa-session-repository.ts#L17), advisory at line 64.
- S7: [factor repository](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/apps/api/src/modules/auth/mfa/mfa-factor-repository.ts#L19); migrations `20260916003600_mgt_be_02_complete_mfa/migration.sql` and `20261030010600_issue363_session_bound_pending_mfa/migration.sql`.
- S8: [TOTP verifier](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/apps/api/src/modules/auth/mfa/mfa-totp.ts#L30); `mfa-anti-abuse.ts`, `mfa-secret-protection.ts` in the same directory.
- S9: [assurance policy](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/apps/api/src/modules/auth/mfa/mfa-assurance-policy.ts#L39); `mfa-rr-factor-fence.ts`, `mfa-recovery.service.ts` in the same directory.
- S10: [account-security writer](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/apps/api/src/modules/audit/account-security-audit-writer.ts#L31); [migration 035 audit function](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/packages/database/prisma/migrations/20260916003500_mgt_be_01_audit_foundation/migration.sql#L112).
- S11: [transaction wrapper](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/apps/api/src/common/database/postgres-transaction.ts#L12); `postgres-transaction-outcome.ts`, `runtime-postgres-policy.ts`, `bounded-postgres-query.ts` in the same directory.
- S12: [account lock](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/apps/api/src/modules/auth/staff-user-security-lock.ts#L8); [refresh](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/apps/api/src/modules/auth/staff-auth.service.ts#L183); [logout](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/apps/api/src/modules/auth/staff-auth-logout.ts#L15).
- S13: [global User-disable persistence](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/apps/api/tools/security-disable/persistence.ts#L52).
- S14: [current role writer, migration 051](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/packages/database/prisma/migrations/20261001005100_mgt_240c_staff_onboarding_invites/migration.sql#L249), status at line 325; authorization helper in migration 050; admin factor SHARE in migration 037 line 150.
- S15: [Management mutation service](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/apps/api/src/modules/management/staff-management-mutation.service.ts#L35); `staff-management-authorization.ts`, `management-authorization.ts` and their current session/factor consumers inspected.
- S16: [onboarding identity lock, migration 051](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/packages/database/prisma/migrations/20261001005100_mgt_240c_staff_onboarding_invites/migration.sql#L55).
- S17: [activation SQL, migration 053](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/packages/database/prisma/migrations/20261001005300_mgt_240d_staff_activation/migration.sql#L15); full `docs/validation/ISSUE_240D_STAFF_ACTIVATION_UI.md`.
- S18: [runtime lock-enabling column grants](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/packages/database/scripts/runtime-table-privileges.mjs#L118), `mfa-runtime-privileges.mjs`, actual `provision-runtime-role.mjs`.
- S19: [Dashboard MFA client](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/apps/dashboard/src/lib/mfa/dashboard-mfa-client.ts); `lib/api/dashboard-api-client.ts`; `components/security/account-security-panel.tsx`, `use-account-security-ceremony.ts`, `account-security-access-provider.tsx`.
- S20: [Prisma membership indexes](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/packages/database/prisma/schema.prisma#L925); factor composite unique at line 837; migration 001 membership FKs/indexes, migration 037 directory index, later presence identity unique.
- S21: Canonical catalog and old-migration preservation are exercised by `packages/database/src/mfa-disable-migration.integration.test.ts` and the isolated real-engine upgrade recorded in the implementation report.
- S22: [anti-abuse finalization](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/apps/api/src/modules/anti-abuse/anti-abuse.service.ts#L269); migration 018 cleanup and current rolling admission query.
- S23: [migration 079 safe index rollout pattern](https://github.com/yamanradwan1-rgb/valet-platform/blob/0a1d7420c9690d15c9765f9624e6d8e7c2470294/packages/database/prisma/migrations/20261010007900_live_history_parked_audit_indexes/migration.sql#L1).
