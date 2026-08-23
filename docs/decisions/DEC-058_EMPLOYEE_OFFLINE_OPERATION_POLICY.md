# DEC-058 — Employee Offline Operation Policy

Status: Accepted  
Date: 2026-08-23  
Task: VUI-008 — MVP Hardening + E2E Gate

## Context

The Founder/Product Blueprint requires the Employee experience to be offline-friendly, but the repository does not yet contain an accepted persistent client-side outbox, durable offline mutation queue, Background Sync, or automatic replay architecture.

Current Employee operations already use a mixture of stable logical-operation identity, optimistic versions, authoritative read-after-ambiguity recovery, and server-enforced current Staff/Organization/Location/Shift/Task authority. Secure handoff and final vehicle release additionally depend on short-lived proof, current ownership, current financial release policy, and current server state.

Treating every field command as a generic offline mutation that may be stored and replayed later would therefore be unsafe. The MVP still needs truthful behavior when connectivity disappears and a clear command-by-command policy so later implementation does not invent replay semantics ad hoc.

## Decision

### 1. Meaning of "offline-friendly" for the Employee MVP

For the current sellable Employee MVP, offline-friendly means:

- the live UI may truthfully detect and display loss of browser connectivity;
- the UI must never fabricate a server-owned success while offline;
- transient form input may remain usable in the current page/session where it does not create authoritative state;
- after connectivity returns, server state remains authoritative;
- retries and continuation must use the command's existing idempotency/version/recovery contract;
- a stale command must fail closed or be rehydrated before the employee continues;
- no generic automatic mutation replay is introduced.

A Service Worker is not required by this decision. PWA installability and an optional future app-shell cache are separate from mutation replay.

### 2. No persistent mutation outbox in VUI-008

VUI-008 must not introduce any of the following:

- IndexedDB mutation outbox;
- `localStorage` or `sessionStorage` mutation outbox;
- Service Worker mutation replay;
- Background Sync mutation replay;
- generic persistent command queue;
- generic automatic replay after reconnect.

Durable offline synchronization remains a later Reliability architecture task.

### 3. Drafts are not authoritative operations

Non-authoritative user input may exist as a transient in-memory draft while the current Employee page remains open. Examples include:

- Check-In form fields before submission;
- plate or resource-code input before submission;
- condition notes before submission;
- incident description before submission.

Such a draft:

- is not a server fact;
- must not display a success state merely because it exists locally;
- must not mutate Task, ValetSession, custody, handoff, incident, payment, or audit state;
- must remain scoped to the current authenticated Employee workspace.

DEC-058 does **not** approve durable persistence of these drafts across browser restarts. A later durable-draft decision must define storage, retention, encryption/privacy stance, identity/location scoping, purge behavior, and conflict UX first.

### 4. Identity, tenant, Location, and Shift boundary

Any transient Employee workflow intent is bound to the current authenticated Staff identity and current authoritative operational scope.

On definitive authentication loss, logout, login as a different Employee, or authoritative workspace re-scope, stale transient operational intent must not carry into the new Employee workspace.

If the active Shift, Location access, Task ownership, or server state changes while a screen is open, the next protected command remains subject to the current server-side authorization and concurrency contract. The client must not treat previously loaded eligibility as continuing authority.

### 5. Protected data must never be persisted for offline replay

The Employee client must never persist the following as offline queue/draft material:

- passwords;
- raw Staff access credentials;
- raw Staff refresh credentials or session cookies;
- Guest bearer credentials;
- Pickup Codes;
- Dynamic QR handoff proofs;
- raw handoff verification proof of any type;
- payment credentials or provider secrets;
- authorization headers;
- other raw authentication or release proof.

Existing auth policy requiring the Staff access token to remain memory-only is unchanged.

### 6. Command policy

The current Employee command classes are classified as follows.

| Operation | Offline policy | Reconnect / ambiguity rule |
| --- | --- | --- |
| Staff login / session restore | ONLINE_ONLY | Must contact the real auth/session boundary. No offline authentication authority. |
| Check-In intake | MANUAL_RETRY_EXISTING_IDEMPOTENCY | Same logical intake may reuse its existing stable intake operation identity only under its accepted contract. No background replay. |
| Vehicle identity update | REHYDRATE_BEFORE_RETRY | Use current server projection/version; stale write conflicts remain authoritative. |
| Condition note/correction/completion | REHYDRATE_BEFORE_RETRY | Preserve existing append-only/correction/version semantics; no local completion claim. |
| Start Parking | REHYDRATE_BEFORE_RETRY | Re-read authoritative session/task state where the existing recovery flow requires it. |
| Confirm Parked | REHYDRATE_BEFORE_RETRY | Do not replay a stale spot/task/session command blindly; current server state and versions decide. |
| Parking/Retrieval task assign or accept | REHYDRATE_BEFORE_RETRY | Current Task ownership and version remain authoritative. |
| Start Retrieval | REHYDRATE_BEFORE_RETRY | Existing authoritative A1/task recovery decides whether the prior attempt committed. |
| Mark Ready | REHYDRATE_BEFORE_RETRY | Existing authoritative session recovery decides whether READY already committed. |
| Handoff initiate | REHYDRATE_BEFORE_RETRY | May be manually retried only after authoritative state recovery; never background replayed. |
| Pickup Code verification | ONLINE_ONLY | Employee must be present and online; proof is ephemeral and must not be queued/persisted. |
| Dynamic QR verification | ONLINE_ONLY | Employee must be present and online; proof is ephemeral and must not be queued/persisted. |
| Supervisor override | ONLINE_ONLY | Requires current authenticated supervisor authority and current handoff state; never queued or replayed in background. |
| Abort handoff | REHYDRATE_BEFORE_RETRY | Manual retry only after authoritative handoff recovery; no background replay. |
| Release Vehicle / complete handoff | ONLINE_ONLY | Requires current owner, current verified proof, current financial-release policy and current server state. Never queued or background replayed. |
| Incident report | MANUAL_RETRY_EXISTING_IDEMPOTENCY | The same logical incident may reuse its existing actor-bound stable incident ID under the accepted contract; no automatic replay. |

`ONLINE_ONLY` means the action must be performed against the live authoritative server while the Employee is actively present. It does not mean the UI may assume success merely because the browser reports `navigator.onLine = true`.

`REHYDRATE_BEFORE_RETRY` means the client first adopts current authoritative state according to the existing operation flow before issuing another protected command when the previous result is ambiguous or state may have changed.

`MANUAL_RETRY_EXISTING_IDEMPOTENCY` means an already-accepted stable logical-operation identity may be reused for a user-visible retry of the same logical command, but it is not permission to create a generic replay queue.

### 7. Connectivity UX

The live Employee UI must use connectivity information only as a user-facing hint.

When the browser reports loss of connectivity, the UI may show a message equivalent to:

> No network connection. Reconnect to refresh and continue.

It must not claim:

- that actions were queued;
- that actions will automatically sync;
- that a protected operation succeeded;
- that the API/server is healthy merely because `navigator.onLine` becomes true.

When connectivity returns, the app may invoke the existing safe authoritative refresh/revalidation boundaries. Reconnect itself must not mark any operation successful.

Prototype-only offline simulation may remain prototype-only and must not be exposed as live synchronization behavior.

### 8. Conflict and stale-state behavior

Offline/reconnect support does not weaken existing optimistic concurrency or authorization.

After reconnect, any of the following may make old intent invalid:

- Employee identity change;
- ended/missing Shift;
- removed Location access;
- Task reassignment;
- Task/session version change;
- operation completion by another actor;
- changed parking resource availability;
- changed handoff state;
- expired or rotated proof;
- changed financial release state/policy.

The correct behavior is to rehydrate or fail closed using the existing command contract. The client must not bypass conflicts simply because an operation originated before connectivity loss.

### 9. Future durable offline architecture requirements

A future Reliability/offline synchronization decision is required before durable offline command storage or automatic replay is implemented.

That decision must explicitly define at minimum:

1. storage medium and encryption-at-rest/privacy stance;
2. exact allowlist of queueable command classes;
3. which commands may auto-replay versus require user confirmation;
4. per-command TTL/staleness policy;
5. User/membership/Organization/Location/Shift scoping;
6. logout/auth-loss/identity-change purge semantics;
7. conflict and stale-version UX;
8. crash/restart recovery semantics;
9. ordering and deduplication semantics;
10. audit/telemetry privacy requirements;
11. treatment of transient PII in durable drafts;
12. explicit confirmation that handoff proof, supervisor override, and final vehicle release are not silently replayed.

Until that decision is Accepted, persistent offline mutation queues are prohibited.

## Reason

This policy delivers the MVP benefit that matters in unreliable connectivity—truthful state, preserved safe input where practical, and recoverable server-authoritative continuation—without turning short-lived field commands into delayed background authority.

Parking, retrieval, custody and handoff operate in a multi-actor system. A command that was valid when the device lost connectivity may be invalid minutes later because ownership, Shift, resource occupancy, proof validity, payment release state, or lifecycle state changed. Rehydration and explicit retry preserve those invariants; blind replay does not.

## Consequences

- VUI-008 may add a truthful live connectivity banner and reconnect revalidation without implementing a persistent offline framework.
- VUI-008 must not reuse prototype wording that promises actions will sync automatically.
- Current stable idempotency identities remain narrow command-specific retry tools, not a general offline queue contract.
- Secure handoff verification, supervisor override and final release remain live online operations.
- Transient in-memory drafts are allowed where they remain clearly non-authoritative; durable drafts require another decision.
- A later Reliability phase may supersede or extend this policy with an explicit durable offline architecture.

## Affected docs/code

- `docs/decisions/DEC-058_EMPLOYEE_OFFLINE_OPERATION_POLICY.md`
- `docs/08_DECISIONS_LOG.md` summary/index mirror when updated
- `apps/valet/**` Employee connectivity/recovery behavior
- future Reliability/offline architecture work
