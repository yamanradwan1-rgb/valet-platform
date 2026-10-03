# DEC-097 — Incomplete Check-In cancellation and exact continuation

Status: Accepted
Date: 2026-10-03
Owner: VAYLET product owner
Issue: #255

## Authority and scope

Materializes the merged Issue #255 plan's Owner Decision Lock, U-001–U-007,
and the owner's subsequent section-49 Guest compatibility clarification.
Those explicit owner instructions supersede the plan's historical conditional
wording. The complete plan remains the execution and verification map.
Employee Web is excluded. Dashboard presentation changes are limited to
existing Management Audit typed event/state labels. No Guest UI changes.

## Terminal lifecycle

Only `CHECKING_IN -> CANCELLED` is added. CANCELLED is terminal, retained,
non-operational and non-resumable. It never means completed Check-In, parking,
release, handoff, successful service, completed visit, revenue or rating eligibility.
No outgoing transition, hard delete, hidden lifecycle flag, cancellation table,
extra aggregate version, cancellation actor/time columns or automatic expiry.

Cancel requires no current key/parking assignment, assignee, Task or physical
progression/completion fact. Unexpected custody fails closed rather than being
cleared. Condition completion and condition/Vehicle history may already exist
and remain intact. Independent Incident, financial and contact history is retained.

## Authority and concurrency

Continue, Cancel and cancellation-status reconciliation are self-owned: current
actor membership must equal persisted checked_in_by_membership_id, for both
VALET_EMPLOYEE and VALET_SUPERVISOR. Supervisor list visibility grants no override.
Current ACTIVE User, Organization, Location, membership, explicit exact Location
access, permitted operational role and ACTIVE exact Location Shift are required.
Caller expectedShiftId must match the locked current Shift; a replacement Shift
does not authorize an old intent. Loss of authority prevents reconciliation too.

Reuse the existing Location lifecycle shared lock before conflicting row locks,
transaction-aware Shift eligibility share locks held through commit, and exact
session FOR UPDATE. Revalidate ownership and state under that lock before writes.
Existing session version is lifecycle CAS only, not a snapshot of child edits.
Child-first commits are retained; Cancel-first makes subsequent protected
Check-In/Vehicle/condition mutations fail closed. No new child version mirror.

## Transport, errors, audit and reconciliation

POST /v1/staff/check-in/sessions/:sessionId/cancel accepts strictly
{ expectedVersion: positive integer, expectedShiftId: UUID }.
Success is strictly { sessionId, locationId, state: CANCELLED, version }.
GET /v1/staff/check-in/sessions/:sessionId/cancel-status accepts the exact
expectedShiftId query and returns only sessionId/locationId/current state/version.
Both require current ownership/eligibility before exposing current truth.

Precedence: authorization, coherent authorized terminal convergence, otherwise
VERSION_CONFLICT, then INVALID_STATE_TRANSITION/invariants. Reuse existing
non-disclosing authorization and transport validation semantics. HTTP success 200.
Coherent terminal convergence must match durable cancellation transition history.
No second event or version increment. Inconsistent terminal records fail closed.

The guarded transition increments version once, sets updated_at to one PostgreSQL
clock_timestamp, and appends VALET_SESSION_CHECK_IN_CANCELLED atomically.
Use existing custody AuditEvent writer with real Organization/Location/session
and actor membership, same timestamp, ValetSession entity, CHECK_IN family.
Metadata is only fromState/toState/fromVersion/toVersion. No PII, credentials,
reason text, request body or client-authored actor/time. Audit failure rolls back.
Do not set completed_at/completed_by_membership_id/checking_in_completed_at.

One client POST in flight. No outbox, durable operationId, automatic mutation
retry or background queue. Lost/malformed post-dispatch response is unknown.
Exact authorized status establishes CANCELLED success, original CHECKING_IN
version explicit confirmed retry, or changed state/version conflict. Unavailable
status remains unknown. Foreground may reconcile once; never automatically POST.
Logout/scope/generation replacement purges transient intent; process death has
no durable intent to replay. Directory absence never proves success.

## Consumer compatibility

Exclude both terminals from operational directory, competing-vehicle uniqueness,
active physical resource context and Location drain session blockers. Preserve
independent Shift/Task blockers and non-null key/spot uniqueness. Use staged
forward enum and predicate/check/function migrations; old migrations are immutable.
Operational financial overview excludes both terminal custody states while
retaining all underlying financial facts and independent financial reporting.
Completed-visit and completion/revenue/KPI formulas remain positive COMPLETED.
Operational overview retains its existing active states and completed count;
cancelled attempts do not inflate that existing operational count projection.
Authorized historical visit associations may carry CANCELLED as truthful history
with completedAt null; completedVisitCount and Returning Contact remain unchanged.
New incident creation rejects CANCELLED; existing incidents are not auto-closed.
Explicit Task/parking/retrieval/handoff state guards remain narrow.

## Guest compatibility — explicit owner clarification

Both resolveGuestAccessWithDatabase and resolveAndLockGuestAccessSession reject
CANCELLED with GUEST_ACCESS_INVALID before projection. This applies to downstream
Guest token-backed commands as well as the Guest read. GuestSafeSession and
guestSafeSessionResponseSchema remain unchanged; no cancelled Guest presentation.
After authoritative staff scope/authorization and session lock, ISSUE_OR_ROTATE
and REISSUE_REVOKED reject CANCELLED with GUEST_ACCESS_INTENT_CONFLICT before
token generation, mutation or audit. Explicit revoke retains existing idempotency.
Cancellation never changes customer_access_token_hash/customer_access_expires_at/
customer_access_revoked_at and never appends GUEST_ACCESS_REVOKED. Stored credential
and prior audit history remain; authoritative terminal state makes access unusable.
COMPLETED and existing revoked/expired/rotated-token behavior remain unchanged.

## Directory and Native integration

Vehicles is one bounded list. Prioritize eligible self-owned CHECKING_IN candidates
before unrelated candidates under the existing 100-row cap, then display the
selected rows in existing newest-first order. Overflow remains explicit through
the existing truncation warning, including more than 100 owned drafts. No second
list, duplicate card, detail fan-out or fake Task. Negotiate check-in-actions-v2;
legacy and visibility-v1 responses retain exact strict shapes and masking.
Only minimal canContinueCheckIn/canCancelCheckIn hints are added to v2; never authority.

Continue makes one exact authorized detail read, validates selected id/Location/
CHECKING_IN, hydrates existing persisted Vehicle/condition/version, then navigates
to the existing prepared Check-In owner/route. No discovery/startNew/intake.
Full auth generation/Organization/member/Location/Shift/role plus attempt revision
fences all asynchronous work, including A->B->A. Return refreshes Vehicles once.

Native Vehicles composition/styles/header/navigation/normal states are frozen.
Only eligible expanded-row explanation, Continue/Cancel, existing-pattern modal
confirmation and necessary feedback may be added. Existing details and collapsed
badge geometry remain. EN/AR, identifier LTR, accessibility and Back behavior apply.
No dependencies, config/plugins/permissions/native source changes. Physical Android
acceptance remains the owner Native batch gate; no per-issue APK is required.

## Required proof

Real PostgreSQL success/authority/CAS/atomic-audit/concurrency/rollback tests,
fresh and forward-upgrade migrations/runtime privileges, strict compatibility,
directory coverage, exact hydration, no replay, request budgets, generation and
lifecycle fencing, Native render/style freeze and narrow Audit labels. Evidence
levels remain separate; fixture proof is not physical, CI or production proof.

## Amendments

Amends state-machine abandoned-intake prohibition only for this dedicated command,
DEC-066 directory capability/coverage and DEC-082 audit catalog. Guest clarification
narrows terminal bearer/issuance behavior without changing DEC-064 transport.
Other completion, Task, payment, incident and Guest workflows remain independent.
