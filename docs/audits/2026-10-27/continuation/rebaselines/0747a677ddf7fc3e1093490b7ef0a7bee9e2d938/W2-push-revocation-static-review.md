# RB-003 W2 — Independent Staff Push revocation/FCM TOCTOU validation

## Scope and verdict

- Candidate: **RB003-W1-CAND-P2-STAFF-PUSH-POST-ELIGIBILITY-REVOCATION** (descriptive identifier; W1's exact candidate ID was not supplied).
- Immutable source: commit `0747a677ddf7fc3e1093490b7ef0a7bee9e2d938`, tree `9fbe93fe55b5ef7c42888a874cc7217a594ccace`; locally inspected clean detached `tmp/cos-audit-20261029-rb003-source`. Compared to `d67b2a4a4897b4a73d21aba630fc5ab52ff9169b`.
- Method: **independent static source/control/sink trace and old/new diff**, with existing integration tests inspected. **No runtime, FCM, browser, or database tests were run**.
- **Reachability: YES, high confidence.** A live, same-token `LEASED` delivery can remain transport-eligible after its initially eligible recipient loses a StaffAuthSession, device registration, Shift, task queue status, or authorization. The worker snapshots eligibility once, then asynchronously obtains OAuth credentials; its new transport preflight only refreshes the delivery's lease fence and DB-clock budget, not recipient eligibility. A generic notification can therefore be POSTed to FCM after revocation.
- **P2 security regression: NO / SUPPRESSED under current accepted product contract (high confidence).** This is the **pre-existing, explicitly accepted** post-check/provider race in Accepted DEC-073 and DEC-076, not introduced by RB-003. Payload contains no vehicle/guest/location details or privileged action; authorization and canonical refetch still govern any tap. Optional **P3 test/clarification gap**: no focused live-same-lease OAuth interleaving test proves/documents the accepted boundary. If the owner newly requires *zero HTTP POST after a committed revocation*, that changes the Accepted decision and would require a design decision and implementation work; it is not the existing requirement.
- Actual remote FCM acceptance/OS presentation after an unlucky interleaving remains **unproved** here (static-only; provider/OS may delay, drop, or deliver).

## Five-part validation rubric

- [x] Identify a realistic user-visible revocation path and the state mutation.
- [x] Trace exact recipient eligibility read, transaction/lock lifetime, and retained data.
- [x] Trace async OAuth gap, last pre-transport guard, FCM POST, and finalization controls.
- [x] Compare old `d67b2a4a` with RB-003 `0747a677` and inspect relevant race/negative tests.
- [x] Evaluate impact/severity against Accepted decisions, payload fields, and tap/refetch boundary.

## Concrete reachable same-lease interleaving

1. The worker claims a due delivery with fresh UUID `lease_token` and `lease_expires_at = now + 30s`, `staff-push-claim-repository.ts:18-65`; worker starts at `staff-push-delivery-worker.ts:45-63`.
2. `resolveEligibleStaffPushDelivery` uses a short `inPostgresTransaction` and `READ COMMITTED` second statement, with shared settings advisory transaction lock at `staff-push-eligibility-repository.ts:61-84`. Its SQL checks the *current* delivery lease token, unexpired intent, ACTIVE fresh registration/token, unrevoked StaffAuthSession, active staff/user/membership/organization/location/policy, exact queued unassigned retrieval task, explicit location access and ACTIVE exact-location Shift (`...eligibility-repository.ts:84-157`). Returned `providerToken`, `intentId`, locale and remaining TTL are **snapshotted** at `159-170`. The transaction and its advisory lock have completed when `resolveEligibleStaffPushDelivery` resolves; no lock spans the provider call.
3. At `staff-push-delivery-worker.ts:79-114`, new RB-003 checks only the same claim's `lease_token` / `LEASED` state and remaining DB-clock lease budget. Worker invokes `provider.send` with the cached `eligible` fields (`111-130`). The FCM adapter awaits `tokens.accessToken()` at `fcm-http-v1-adapter.ts:95-114`, a real asynchronous gap.
4. In parallel, a legitimate employee logout from `auth/staff-auth-logout.ts:9-29` commits `revokeStaffSessionAndDisablePush`: `auth/staff-session-revocation.ts:13-27` marks `staff_auth_sessions.revoked_at` and sets matching ACTIVE `staff_push_registrations` to DISABLED with cleared token. **No delivery state/lease-token update occurs.** The worker still holds its old in-memory `providerToken`. Alternatively a server-side task cancellation changes `tasks.status` to CANCELLED (`retrieval/guest-retrieval-cancellation-command.ts:155-186,206-235`); a valid Shift end changes `shifts.status` to ENDED (`shifts/end-shift-command.ts:216-250`); dispatch assignment changes task status/assignee (`dispatch/task-mutation.ts:23-51`). These mutations are outside the delivery lease row.
5. OAuth resolves before timeout, while the 30s lease has more than the 10s provider-call timeout remaining (`staff-push-operational-policy.ts:25-36`). RB-003's `mayStartTransport` calls `currentStaffPushLeaseBudgetMilliseconds`; SQL inspects **only** delivery ID, LEASED state, token and lease expiry (`staff-push-eligibility-repository.ts:29-44`). It returns positive despite revoked session/disabled registration/cancelled task. The local remaining-lease and intent-TTL checks (`staff-push-delivery-worker.ts:85-130`) also pass. The FCM adapter submits the retained token and generic attention to `messages:send` (`fcm-http-v1-adapter.ts:115-144`).
6. After provider call, finalization is fenced to the same delivery ID / `LEASED` / lease token (`staff-push-finalization-repository.ts:12-30`). This prevents another worker's finalization takeover; **it does not undo a provider POST after recipient revocation**. Expired lease reclaim (`staff-push-claim-repository.ts:27-65`) and maintenance suppress only PENDING/RETRY_WAIT (`staff-push-maintenance-repository.ts:44-65`) and do not stop the same valid lease. Registration's direct `disableRegistration`/`supersedeRegistration` likewise do not cancel a leased delivery (`staff-push-registration-repository.ts:75-92,148-167`).

The earliest relevant point for this finding is **after** the initial eligibility SQL has completed and **before** the adapter's POST. Revocation before the eligibility SQL is correctly suppressed; reclaimed, expired, missing, or insufficient-budget lease before transport is now correctly blocked by RB-003. Revocation after POST cannot be retroactively canceled.

## RB-003 change versus pre-existing behavior

Diff `git diff d67b2a4a... 0747a677... -- apps/api/src/modules/staff-push/{staff-push-eligibility-repository.ts,staff-push-delivery-worker.ts,fcm-http-v1-adapter.ts,staff-push-provider.ts}` was inspected:

- **New** `currentStaffPushLeaseBudgetMilliseconds`, `staff-push-eligibility-repository.ts:29-44`, reads exact lease owner and DB-clock time; existing eligibility SQL `61-171` is unchanged.
- **New** worker budget refresh before provider and callback after OAuth, with monotonic check and conservative `> providerCallTimeoutSeconds` threshold, `staff-push-delivery-worker.ts:80-132`.
- **New** FCM adapter `mayStartTransport` invoked after token acquisition, immediately before building the message/POST, `fcm-http-v1-adapter.ts:115-144`; preflight DB errors propagate fail-closed at `154-158`.
- **Unchanged residual**: no second joined recipient/session/registration/task/Shift eligibility query occurs after OAuth; mutable eligibility was snapshotted in old and new code. These changes improve expired/reclaimed-lease safety and do **not introduce** the revocation TOCTOU.

## Security impact and binding product decision

- `staff-push-payload.ts:45-66,79-99` strictly validates and sends only generic bilingual title/body, opaque intent UUID, `EMPLOYEE_RETRIEVAL_REQUESTED` kind, `TASK_QUEUE` route and schema version. No plate, customer, location, staff secret, or domain-action argument is serialized.
- **DEC-073_NATIVE_PUSH_ARCHITECTURE.md:3,390-402,782,786-791** is Accepted and expressly allows a generic post-check alert if eligibility changes, including a generic race-window alert after StaffAuthSession revocation. The native tap must authenticate and refetch current authorized state; alert receipt does not authorize action. `DEC-073:404-438` further defines fenced lease semantics and bounded attempts.
- **DEC-076_STALE_STAFF_PUSH_REGISTRATION_LIFECYCLE.md:3,70-90** is Accepted and says not to mutate currently LEASED deliveries during stale-registration maintenance, expressly preserving the DEC-073 post-check/provider TOCTOU. This is strongest counterevidence against elevating the generic post-check alert to a new P2 defect.
- The accepted contract does not guarantee zero POST after a concurrent revoke; it guarantees suppression for **new** eligibility checks and canonical API protection on tap. A strict zero-send interpretation of the shorter DEC-073 risk row 788 would conflict with its explicit race-window exception and DEC-076:84-90.

## Tests reviewed and proof gaps

- New `staff-push-fcm-token-delay-race.integration.test.ts:92-138`: holds OAuth and proves stale worker A cannot POST **after its lease is forcibly expired/reclaimed** by B. It does not revoke a registration/session with A retaining its live lease.
- New `staff-push-expired-lease-race.integration.test.ts:194-251`: covers revoked session, disabled notification policy/device, ended Shift only **after A's lease is expired and worker B suppresses**. Not a same-lease eligibility race.
- Existing `staff-push-worker-eligibility.integration.test.ts:99-150` and following negative cases invalidate eligibility **before** the worker's eligibility read. Supports fail-closed upfront checks, not post-check behavior.
- FCM mapping `staff-push/fcm-result-mapper.ts:54-114` handles provider HTTP classifications; there is no downstream reauthorization before provider I/O. Real FCM delivery timing and native post-logout handling were not exercised.
- Minimal optional P3 documentation/regression test: hold the real adapter's OAuth promise after eligibility while delivery remains LEASED; commit logout/disable/shift change; document that current accepted contract **can** still issue one generic POST and that tap/refetch stays denied. Alternatively, if product policy changes, an extra recipient-eligibility preflight and an accepted architectural decision would be required; even a query immediately before POST has an unavoidable smaller post-query race absent serialization through transport.

## Final disposition

| Validation instance | Root control / transport sink | Reachable | Disposition | Confidence |
| --- | --- | --- | --- | --- |
| W1 candidate: same-live-lease post-eligibility revocation | `staff-push-eligibility-repository.ts:29-44` vs full eligibility `:84-156` → `fcm-http-v1-adapter.ts:115-144` | Yes, for a generic post-check alert | **Suppressed as P2 defect; accepted pre-existing residual**, optional P3 test/contract clarity | High (~0.9) static reasoning; remote OS delivery unproven |

No source/docs/CI/Issue/PR/DB/browser changes or tests performed. Report file is W2 scratch only. The evidence supports an accepted residual with a finite, bounded opportunity, not an RB-003 regression or unauthorized domain access.
