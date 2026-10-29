# DEC-107 — Emergency Task Takeover

Status: Proposed (Issue #352 Owner policies and Phase B engineering direction are approved; final compatibility review pending)
Date: 2026-10-29
Issue: #352
Source baseline: 0747a677ddf7fc3e1093490b7ef0a7bee9e2d938

## Purpose and accepted authority

Emergency Takeover is a distinct, audited recovery command for an existing
`PARKING` or `RETRIEVAL` Task whose persisted status is exactly `IN_PROGRESS`.
It changes only the canonical operational Task assignee A to a different eligible
employee B. Ordinary `Reassign` remains restricted to its established
`ASSIGNED`/`ACCEPTED` lifecycle and retains its present API and authority.

Only `VALET_SUPERVISOR` with active exact-Location Shift and explicit access, or
`ORG_ADMIN` with active same-Organization membership, active authorized Location,
current Staff session and required sensitive MFA may initiate. The Admin needs
no operational Shift and receives no field, custody, handoff-override or release
permission. No second approval is required. The initiator must give a trimmed,
nonblank, at most 500-character reason with controls rejected; the protected
Dispatch history retains the bounded reason. Do not log secrets or raw request
bodies, and do not expose it through ordinary Task Detail responses.

B must be a different, active employee or operationally permitted supervisor
with the exact Organization/Location grant and an active eligible Shift under
DEC-032. A may have lost Shift eligibility; recovery must not require A to
remain available.

## State and custody contract

| Task | ValetSession | Takeover | Protected downstream behavior |
| --- | --- | --- | --- |
| PARKING IN_PROGRESS | PARKING | permitted | Actual B KeySlot scan/deposit and server-verified DEC-068 confirmation remains required. |
| RETRIEVAL IN_PROGRESS | RETRIEVING | permitted | Mark Ready fails closed without accepted B physical custody evidence. |
| RETRIEVAL IN_PROGRESS | READY | permitted | B may initiate/verify handoff with existing guards; final release requires B custody proof. |
| RETRIEVAL IN_PROGRESS | HANDOFF_PENDING | permitted | Remains HANDOFF_PENDING; old unconsumed proof is terminalized; B needs fresh proof and custody. |

For Retrieval the authoritative `RetrievalRequest` must still be `ACCEPTED`.
Unsupported session/Task combinations and terminal or non-IN_PROGRESS Tasks
reject without effect. Do not reset ValetSession, Task or RetrievalRequest state
to make takeover possible. Preserve `ready_at`, `handoff_pending_at`, parking
and key references. The Task's `current_assignee_membership_id`, never the
ValetSession assignee projection, is the operational owner.

No physical `KeyCustodyEvent` is created by takeover. Its previous custody
event and KeySlot placement remain historical facts about A; reassignment
does not assert that B physically received a key. A new-path Parking Task may
establish a truthful B deposit through the existing exact KeySlot scan during
Confirm Parked (DEC-068), with normal same-transaction slot/custody guards.
Retrieval currently has no accepted in-progress A-to-B physical-key-transfer
proof command; B's custody-dependent Mark Ready/final release must fail closed
until a separate accepted physical-custody mechanism proves B's authority
**after the latest emergency ownership-change epoch**. Matching a historical
`CHECKED_OUT` actor after A→B→A is insufficient.
This limitation does not make the operational takeover falsely succeed at a
physical step. A→B→A must not revive pre-takeover custody authority.

When the session is `HANDOFF_PENDING`, atomically set `consumed_at` on every
unconsumed `HandoffVerification` under the session lock, preserving original
`verified_at`, `verified_by_membership_id` and history. Keep the session's
`HANDOFF_PENDING` state when applicable; do not silently abort to `READY`.
An unexpectedly unconsumed verification outside `HANDOFF_PENDING` is an
integrity conflict and must not be silently normalized by the takeover.
The existing Guest issuance and current Task-owner B verification path can
produce a fresh Standard proof. Release must reject an old-owner Standard
proof; Supervisor override remains DEC-042/043 proof-only and does not confer
physical custody or Admin release power.

## Tracking attribution

An active A movement tracker is closed at the shared database-authoritative
takeover time, and a distinct tracker for B starts only when the session
remains in active movement (`PARKING`/`RETRIEVING`) and the effective inherited
tracking policy is enabled. The operation uses the existing one-active-session
indexes and one-way `ended_at` rule. Nothing starts for `READY` or
`HANDOFF_PENDING`; policy OFF remains OFF.

Each newly created `TaskTrackingSession` stores immutable owner membership
at start, scoped to its Organization. This is provenance, not another source
of future operational authority. Legacy rows without demonstrably
authoritative historical owner remain NULL; a takeover encountering an active
unattributable segment rejects without fabricating A attribution. Historical
GPS rows stay attached to their original segment. Live maps must not join A's
last sample to mutable current Task owner B; B appears only with a genuine B
segment/sample. GPS ingestion rechecks Task owner, Shift and session/segment
identity after locks so A's in-flight submissions cannot survive transfer.
No Guest GPS or continuous employee tracking is introduced.

This exceptional forward-only owner snapshot narrows DEC-046 section 3's
historical no-assignee projection for future provenance. Its existing Task
ownership rule, scope, retention, partial unique indexes and privileges remain.
DEC-048 tracking transitions remain internal to the protected transaction.

## Atomic transaction and identity

The HTTP transport authenticates a single exact active Staff session. Inside
one PostgreSQL transaction, the command resolves Task-to-Session scope using
an untrusted read hint; locks the authoritative ValetSession row before Task
to match physical commands; re-reads and locks the exact Task; rechecks actor,
Location, Organization, User, active Session, MFA, location grant and B Shift
eligibility under compatible concurrency locks; then checks Task version,
state, owner and custody/proof/tracker preconditions. No protected mutation
occurs before these checks. Any competing revocation, Shift end, handoff,
completion or cancellation must serialize or return a safe conflict.

The client supplies only `taskId`, `operationId` (stable UUID),
`expectedVersion` (Task CAS), target membership UUID and normalized reason.
The server derives all Organization, Location, Session, actor and current A
values. Task assignee/version and ValetSession.version each advance once,
with guarded CAS; ValetSession.state is unchanged. The session-version
increment is a fence for concurrent physical/handoff work even if no proof
row existed. Event and segment/proof updates must be atomic with both CAS
writes. Use the same database-authored operation instant for all effects;
never manufacture custody or GPS events.

A new immutable `emergency_task_takeover_operations` receipt is keyed by
`(organization_id,operation_id)` with exact scoped Task/Session/actor/A/B,
old/result Task and Session versions, canonical SHA-256 fingerprint of the
whole normalized actor/task/version/B/reason intent, Dispatch/Audit event
links and final segment identifiers. A receipt exists only for committed
successful takeover, alongside exactly one distinct
`DispatchEvent(EMERGENCY_TAKEOVER)` and
`AuditEvent(TASK_EMERGENCY_TAKEOVER)`; their old/new/initiator/reason/time
and versions remain investigable. Runtime cannot update/delete receipts or
rewrite history. A new forward migration owns the enum, indexes,
relationships and immutable guard; no prior migration may change.

An identical retry, concurrent duplicate or unknown COMMIT outcome first
re-proves the current initiating principal's session/MFA/role/Organization
and Location access to the persisted Task. It then checks the receipt before
rejecting stale expected version/status. A matching UUID and canonical
payload by the same actor replays the bounded **original committed outcome**
without mutations, while the caller must refresh current Task context before
acting. Same UUID with changed actor/task/target/version/reason returns a
non-disclosing `IDEMPOTENCY_CONFLICT` (409). A distinct conflicting takeover
of the same Task version has one winner; the loser receives a safe version
conflict and commits no audit, dispatch, proof, custody or GPS effect. Rollback
leaves no receipt; an explicit same-key retry may then execute. No automatic
network POST replay and no leaked historical protected data after revocation.

## API, Dashboard and verification

Use private `GET /v1/staff/tasks/:taskId/emergency-takeover-context` for one
Task, bounded eligible candidates and safe resource/history details, and
`POST /v1/staff/tasks/:taskId/emergency-takeover` for the command. Both derive
scope from persistence, use no-store and conceal unauthorized object identity.
Return the operation ID, replay marker, committed Task owner/version and
Session version. Dashboard must refresh authoritative Task/history after
success or reconciliation and handle unknown outcome without optimistic
success. Only the new action inside existing Task Details and its focused
EN/AR accessible modal may be visually added. Existing elements, CSS,
navigation, layouts, themes, responsiveness and interactions stay frozen.

**Owner-approved narrow UI Freeze exception:** The existing Dashboard `/tasks`
navigation entry may be shown to `VALET_SUPERVISOR` with its existing icon,
order, labels, styling and geometry. No other existing navigation/UI element
changes. The protected Tasks route must revalidate the selected Supervisor's
exact Organization, active Location, active operational Shift and current
Staff session. Only the existing Tasks list/read endpoint may additionally
serve this role, restricted to `IN_PROGRESS` Parking/Retrieval Task rows in
that exact authorized Location; the operation-specific context GET then
independently verifies each Task's takeover preconditions. Supervisor access
does not confer `LOCATION_DASHBOARD_READ`, other Dashboard management reads,
reports, exports, or commercial entitlements. Company Admin and Location
Manager Tasks access and presentation keep their existing contract.

Real PostgreSQL tests must cover the 30 Issue #352 scenarios and commit/rollback
races; mounted Dashboard E2E must demonstrate all required authorization,
state, keyboard, locale, theme, viewport and unchanged-before/after UI cases.
W7 independently reviews the actual integrated commit. No branch publication
or readiness claim before all required gates pass.
