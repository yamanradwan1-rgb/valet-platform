# DEC-100 — Shift Presence exception authority at consumption

Status: Accepted
Date: 2026-10-04
Owner: VAYLET product owner
Task: Issue #257 / GPS-B / accepted U-001
Relation: extends DEC-099's exception foundation; no GPS-A scope reopening

## Decision and scope

The owner accepts U-001, previously unresolved in the Shift Presence Management
UI plan. An approved exception is consumable only while its original approver
still satisfies a currently valid accepted approval capability for the exact
Organization/Location at consumption time. The backend owns this decision.
Approval alone never starts or ends a Shift. No Supervisor authority or
same-User self-approval is introduced.

The full implementation plan, including Management UI, is
`docs/NATIVE_261_262_264_257_IMPLEMENTATION_PLAN.md`. This focused decision is the
complete accepted authority contract; the canonical log mirrors it. There is no
separate Management UI planning document or external visualization dependency.

## Authoritative consumption-time predicates

Inside the same authoritative transaction, GPS-B revalidates and protects:

- active requester User/account and active requester membership;
- valid exact requester Location access and authorization for the exact
  START/END action; for END, the exact Shift remains the valid target;
- active original approver User/account and currently valid approval capability:
  Company Admin for that Organization OR exact Location Manager for that Location;
- current eligible Organization and eligible Location lifecycle;
- the exact exception is APPROVED, unconsumed and within its accepted lifetime;
- exact operation/challenge/requester/action/target binding and the ordinary
  cash/open-work and Shift preconditions before any successful consumption.

These active-membership/access predicates apply to **using an approved exception**,
including END. They do not retrofit ordinary safe-own-End with START authority,
remove its existing stale-cleanup path, or convert force-end into ordinary End.
If that recovery is unavailable under a strict policy, keep rollout blocked
until the separately accepted recovery path is usable; never bypass these checks.

The approver's current capability is derived from persisted facts for the
original approver User at the exact Organization/Location, not captured role
text, a different reviewer, another tenant or another Location. A valid current
CA or exact LM capability satisfies the accepted OR predicate; the original
role label need not remain identical if accepted current authority still exists.
Historical reviewer identity/review time remain immutable.

## Approval-time MFA versus consumption-time authority

Sensitive MFA/current session is required when approving. At consumption, the
approver does not need the original browser open, original HTTP session alive,
continued login or the original MFA freshness window. Logout/session expiry alone
does **not** invalidate an already approved exception. Do not require fresh MFA
or a current login from the original approver just to consume that approval.

Real loss of current authority does invalidate future consumption: approver User
deactivation, membership deactivation/removal, Company Admin authority removal,
exact Location Manager authority/access removal, or target Organization/Location
ineligibility. Existing history/deletion constraints remain intact; this decision
does not authorize deleting a referenced membership or rewriting past approval.

## Revoked-authority denial and atomic result

If approver authority is invalid when consumption is attempted, fail closed:

1. Perform NO Start Shift or End Shift mutation and no approval consumption.
2. Transition the exact exception APPROVED -> EXPIRED, preserving original
   reviewer/review time and expiry deadline; record actual terminalization time.
3. Complete the related exact Operation as DENIED with a controlled recoverable
   authority-revocation reason, semantically `APPROVER_AUTHORITY_REVOKED`.
4. Commit exception terminalization, denied operation result and required safe
   history atomically; then return the denial through the accepted HTTP mapping.
   Do not throw through a transaction wrapper that rolls back the required denial.
5. Require a fresh operation/challenge and fresh authorized approval for another
   attempt. No automatic alternate approver, approval or protected mutation replay.

Denial terminalization is a narrow GPS-B result path: authenticate the current
requester, prove immutable owned operation/exception/action/target relationships
before protected terminal writes or disclosure, and grant no Shift mutation
authority from that proof. If current identity/account cannot authorize that
owned result path, conceal/deny to the caller; approved privileged maintenance
handles terminalization separately. No unauthenticated or foreign UUID writer.
Exact public code/HTTP mapping and minimal durable result storage are GPS-B
technical contracts, not permission to expose generic request/security payloads.

The historical record continues to show approval was valid when granted;
EXPIRED here means no longer usable, not that the past reviewer acted illegally.
Keep the existing five Exception statuses. No REVOCATED lifecycle enum is added.

## Serialization and failure proof

Use DEC-099's settings shared -> lifecycle shared -> existing authority/Shift
locks -> Operation -> Challenge -> Exception graph. Protect current requester
and approver User/member/access/capability/Organization/Location state through
the terminal decision and commit. Join the existing staff-management invalidation
boundary **before** membership/Shift locks; never take it late from a locked Shift.
Recheck database wall-clock after waits. Approver proof uses persisted authority
rows, not the old session/MFA row. No external provider/network call under locks.
Bounded nonblocking acquisition/rollback for a contended second-principal proof
is a DERIVED compatible implementation recommendation, not an owner-selected SQL
literal; GPS-B must prove its composition with existing invalidators. Contention
is not proof of revocation.

Revocation commits first: current proof fails, exception expires and operation
is denied with zero Shift/consumption effect. Valid consumption commits first:
one real action/decision/consumption/history commits; later revocation affects
future attempts, never rewrites that consumed history. A contender rollback leaves
no ghost terminalization, consumption, Shift or audit. Unknown response reconciles
the exact committed result under fresh authorization; it never auto-replays.
Test approval followed by logout/expiry as still consumable when all current
authority/lifetime predicates remain valid, separately from real revocation races.

## GPS-A compatibility and GPS-B forward work

GPS-A is completed/merged foundation only at verified main
`b086a14eec5d5085ac713e4ed22aaee431a5044e`. Its SQL OFF-only gate remains unchanged.
No enforcement, management route, Native, Dashboard or Employee Web work is
implemented by recording this decision.

Migration 058's existing `shift_presence_exceptions_state_check` requires
EXPIRED.terminal_at >= expires_at. Its transition guard allows APPROVED -> EXPIRED
but the CHECK prevents the new early-authority-invalid terminalization. GPS-B must
add a **new forward migration** to represent accepted early invalidation safely,
with the narrow command/constraint provenance needed to distinguish valid timed
expiry from valid authority invalidation. Preserve review identity, actual times,
one-way terminal behavior, positive revision CAS, exact scope and runtime least
privilege. Do not fake terminalAt/expiresAt, wait until expiry to enforce revocation,
rewrite migration 058/059 or weaken every expiry path into an arbitrary state setter.

Operation currently stores terminal status/minimal result linkage, without a
recoverable denial-reason contract. GPS-B supplies the smallest typed minimal
denial result boundary needed to reconcile this accepted outcome. Never put it in
an evidence classification enum by analogy or retain a generic request/fix blob.
Any resulting forward schema change updates schema docs, fixtures and invariant
tests in GPS-B. The present task changes documentation only.

Raw employee coordinates, exact accuracy/distance, capture time, request/operation
fingerprints and challenge security internals remain excluded from Management UI,
ordinary logs/audit and durable history under DEC-099. Its retention clocks still
apply, including actual terminalAt for Exception history and terminal result
recovery/tombstone limits. GPS-B supplies operational retention execution before
activation; no new queue/scheduler/archive is approved here.

## Acceptance and ownership

GPS-B owns current-authority protection, early-invalidation forward constraints,
atomic denied result, exact reconciliation, safe audit/history and real SQL/HTTP
race/rollback/unknown-response proof. GPS-C consumes stable server results within
its existing scope; GPS-D displays canonical states/results through the binding
Management contract. Neither client decides authority locally.

Owner product decisions unresolved for Shift Presence: **0**. Implementation,
physical #262/GPS-C, map deployment, retention/recovery and rollout evidence gates
remain; their absence is not a new owner decision or a claim of implementation.
