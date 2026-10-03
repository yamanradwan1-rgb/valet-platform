# DEC-098 — Pre-custody Parking cancellation

Status: Accepted
Date: 2026-10-03
Owner: VAYLET product owner
Issue: #261

Materializes owner-approved U261-L/A/T in the merged Native implementation plan
and the owner's implementation packet. Amends DEC-034/035/036 and the session
state machine. DEC-097 stays incomplete-intake-only with its no-Task invariant.

## Lifecycle and authority

Opening, claiming or accepting Parking work never starts custody. Only explicit
Start Parking performs AWAITING_PARKING -> PARKING, ACCEPTED -> IN_PROGRESS and
sets parking_started_at. Already-started work reopens without another mutation.
Withdrawal permits AWAITING_PARKING -> CANCELLED and exact Parking Task
QUEUED / ASSIGNED / ACCEPTED -> CANCELLED in one transaction. Retain completed
intake, final Task assignee and history. No outgoing terminal edge or IN_PROGRESS
cancellation. Require completed intake and null parking/retrieval/ready/handoff/
completion timestamps, completion actor, legacy session assignee, key/zone/spot.
Reject key custody, tracking, RetrievalRequest or HandoffVerification history
requiring release. Never clear facts. Independent condition, Vehicle, Incident,
financial, contact and Guest history remains.

Current ACTIVE User, operational membership (VALET_EMPLOYEE/VALET_SUPERVISOR),
Organization, Location, explicit exact Location grant and exact current ACTIVE
Shift matching expectedShiftId are required. Derive scope from persistence.
QUEUED requires no assignee and original intake owner. ASSIGNED/ACCEPTED requires
current Task assignee. Supervisor self-work follows the same rule; no override
or ORG_ADMIN/LOCATION_MANAGER field authority. Reauthorize terminal reads/retries.

## Locks and atomicity

Concealed scope discovery is read-only. Acquire existing Location lifecycle
SHARED guard, session FOR NO KEY UPDATE, exact scoped Parking Task FOR UPDATE, then
current eligibility FOR SHARE proof through commit. Resolve actor membership
without early eligibility locks; recheck owner/status/versions/facts before
the first write. Existing compatible paths: Start Parking session -> Task ->
eligibility; Dispatch Task -> eligibility; End Shift Shift -> nonlocking Task
read. Location lifecycle EXCLUSIVE precedes drain checks. No new exclusive
settings lock, update-as-authorization-probe or automatic deadlock replay.

The session lock intentionally uses NO KEY UPDATE because this command does not
change referenced keys. It conflicts with Start Parking/session writes but allows
the KEY SHARE lock required by Dispatch/Audit foreign-key inserts. FOR UPDATE
would create a session -> Task / Task -> session-FK lock cycle with Accept/Reassign;
real PostgreSQL barrier tests falsified that stronger lock and verify this remedy.

Guard both versions. Increment each once, update both terminal states and append
one DispatchEvent(CANCELLED) plus one VALET_SESSION_PRE_CUSTODY_CANCELLED custody
audit atomically. One PostgreSQL operation time supplies both updated_at and
history occurred_at values. Dispatch previous/new assignee both retain the final
Task assignee, reason null. Any failure rolls everything back. Queue creation's
locked AWAITING_PARKING predicate prevents regeneration after cancellation.

## Transport and history proof

POST /v1/staff/valet-sessions/:sessionId/cancel-before-parking strictly accepts
{taskId, expectedSessionVersion, expectedTaskVersion, expectedShiftId}. Shared
UUID validation; versions positive integers. HTTP 200 response strictly contains
{sessionId, sessionVersion, state:CANCELLED, taskId, taskVersion,
taskStatus:CANCELLED, cancelledAt}. No client scope, actor, role or state authority.

GET /v1/staff/valet-sessions/:sessionId/parking-cancellation-status strictly accepts
{taskId, expectedShiftId}. Read exact Task including terminal rows. Response:
{outcome:CANCELLED, ...terminal projection} or {outcome:NOT_CANCELLED, sessionId,
taskId, sessionVersion, taskVersion, classification:PRE_CUSTODY|ADVANCED}.
PRE_CUSTODY proves safe current source states and no custody facts; ADVANCED
forbids cancellation. Concealed/unavailable authority uses
TASK_NOT_FOUND_OR_FORBIDDEN (404). Incoherent terminal pair/history uses
INVALID_STATE_TRANSITION (409).

Precedence: authorization, coherent exact terminal convergence, VERSION_CONFLICT
(409), TASK_INVALID_STATE / INVALID_STATE_TRANSITION (409). REQUEST_INVALID is
400; existing principal errors remain. POST convergence requires original exact
expected versions, actor, Shift and target from the event; changed payload must
conflict. Status requires current authority plus exact event actor/Shift.
Both terminal rows, exact versions, shared time, one audit/Dispatch event and no
other active Task prove success. Absence from active reads never proves success.

Use existing custody writer, ValetSession entity and persisted scope/actor.
Metadata allowlist: taskId, shiftId, fromSessionState/toSessionState,
fromSessionVersion/toSessionVersion, fromTaskStatus/toTaskStatus,
fromTaskVersion/toTaskVersion. No reason text, PII, credential, token, body,
payment or tracking data. Management Audit recognizes this SESSION-family event
through existing typed catalog, safe projection and EN/AR labels.

## Persistence and consumers

Forward migration 057 replaces valet_sessions_cancelled_intake_only_check with
valet_sessions_cancelled_pre_custody_check. Accept existing incomplete-intake OR
completed-intake shape; both require no physical/current-resource facts. Existing
migrations are immutable. No enum/column/index/grant/replay table change.
Guest resolution and issue/reissue/rotation reject CANCELLED, retaining stored
credentials/history without fabricated revoke. Active Vehicles/queue exclude
terminal work. Cancelled Tasks stop blocking Shift End; other work still blocks.
Cancelled session/Task stop blocking Location drain; active Shifts independently
block. New operational incidents reject CANCELLED; history remains. No completed
service, visit, revenue success, parking/retrieval/handoff success or rating is
fabricated. Positive COMPLETED and Returning Contact predicates stay authoritative.

## Native workflow and UI freeze

Both Task and completed Check-In entry stop at authoritative accepted pre-start
work. Preserve single-flight, identity/scope/target checks and canonical reads.
The existing Parking session exposes a monotonic workflow revision across bind,
clear and background fencing. Entry awaits compare it, so identical IDs after
A -> B -> A cannot revive an old navigation. A narrow response-identity guard
extraction keeps that session below its pre-existing 300-line ceiling.
Clear Check-In only after safe Parking handoff. Use existing pre-start panel and
explicit Start Parking. Only add Cancel Service, existing-pattern confirmation,
narrow feedback and EN/AR copy. Existing Tasks/cards/styles/shell/navigation/
typography/themes/RTL geometry remain frozen. Protect Back during submission and
uncertainty; accessible confirmation, focus entry/return, busy/disabled and recovery announcements.
Optional refs/onShow on the existing button/sheet support this focused accessibility
path without changing geometry, styles, colors or behavior for other callers.
Separate cancellation session binds auth generation, Organization, membership,
Location, Shift, session/Task IDs, both versions and monotonic request generation.
One POST in flight. No automatic mutation replay. Lost/malformed response is
uncertain; exact status alone proves cancellation. Safe current pre-custody
versions permit explicit reconfirmed retry. Start-won becomes conflict.
Authority/identity/Shift replacement retires intent, including A -> B -> A.
Background before dispatch invalidates intent; after dispatch retains only exact
uncertain target. Foreground revalidates authority before GET, never POST.
Process restart uses canonical truth. Success retires Parking/confirmation
targets, fences old reads, returns via existing Tasks path and refreshes once.

## Deployment and legacy false starts

Deploy migration/API before the Native action. Old PARKING/IN_PROGRESS rows stay
ineligible. Do not infer physical truth from persistence or mass-rewrite rows.
Separate remediation requires authorized operator real-world custody confirmation
and an approved protected coherent repair with append-only before/after actor,
reason/time history. Preserve actual resource/custody evidence. No remediation
is implemented or exposed as Cancel Service. Physical Android proof is deferred
to the owner batch gate; this code pass does not close Issue #261.
