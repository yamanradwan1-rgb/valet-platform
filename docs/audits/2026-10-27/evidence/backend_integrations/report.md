# Backend integrations and management audit

Baseline: `66968655b8bd90c6681daf53fb9d8da9b9ab9f79`, isolated `<AUDIT_WORKTREE>`. Read-only review. This worker did not fetch, install, deploy, mutate application data, edit repository files, or contact real providers. Formal Codex Security deep-scan coordination was unavailable; no formal security scan or security clearance is claimed.

## Scope and coverage

Owned backend modules: notifications, guest-access, guest-push, guest-push-registration, staff-push, vehicle-photos, locations, organizations, management, map-setup and dashboard. The locations and organizations directories contain only README placeholders; current implementation lives in management/dashboard and related SQL. Employee-client ownership transferred to native reviewer. Source inventory contains 369 tracked files / 38,476 lines. `coverage.json` records each source file, selected corresponding tests/contracts/docs, and conservative actual review status. Reading a complete file counts only as source review, not integration validation. Large parts of management audit investigation, dashboard history/projection/paging and all unlisted tests remain unreviewed; no exhaustive line-level coverage claim.

## Findings register

| ID | Priority | Category | Feature | Finding | Confidence | Evidence | Existing issue |
|---|---|---|---|---|---|---|---|
| INT-001 | P2 | Reliability / concurrency | Staff FCM attention | Expired worker can initiate a new FCM call after a successor already finalized delivery | HIGH; actual worker reproduced in fake DB model | worker 78-94; eligibility 64-69,121-122; claim 32-49 | No matched issue identified in supplied open-issues snapshot; parent must finalize dedup |

### INT-001 — Staff Push does not fence late pre-transport work against lease expiry

1. **ID:** INT-001.
2. **Title:** Expired Staff Push worker can initiate transport after its successor finished.
3. **Severity:** P2, bounded generic attention duplication/avoidable provider traffic, not a vehicle custody or authorization defect.
4. **Confidence:** HIGH source-level; deterministic model uses the actual unmodified worker. Real concurrent PostgreSQL/FCM reproduction NOT RUN.
5. **Category:** Reliability/concurrency; accepted lease-policy contract mismatch.
6. **Affected feature:** Employee retrieval-request FCM notifications.
7. **Paths:** `apps/api/src/modules/staff-push/staff-push-delivery-worker.ts`; `staff-push-eligibility-repository.ts`; `staff-push-claim-repository.ts`; `staff-push-finalization-repository.ts` in the same directory; `docs/decisions/DEC-075_STAFF_PUSH_OPERATIONAL_POLICY.md`.
8. **Relevant lines:** worker 46-61 claims and resolves, 78-94 initiates transport using only intent lifetime; eligibility 64-69 returns only intent lifetime and 121-122 checks state/token without lease expiry; claim 32-49 reclaims expired leases; finalization 34-35 checks token/state after transport. DEC-075 110-120 requires fenced ownership, provider I/O shorter than lease and recognizes ambiguous duplicate outcomes.
9. **Expected:** A worker delayed before any provider I/O should abandon a lease whose remaining time cannot cover bounded provider transport. It should not initiate transport after the row was reclaimed/finalized by another worker.
10. **Actual:** Captured `eligible` material remains usable for the intent's five-minute lifetime, even when the 30-second lease has expired and another worker has sent/finalized the row. Finalization fencing stops a stale DB update but cannot undo the extra FCM POST.
11. **Root cause:** Neither delivery types/eligibility SQL nor transport callback carries/rechecks lease lifetime. The only elapsed-time calculation covers intent lifetime. Guest Push already contains a remaining-lease versus provider-timeout check (`guest-push-delivery-worker.ts` 91-108), demonstrating a local consistency model.
12. **Reproduction/execution path:** Worker A claims at t=0 and completes eligibility; pause A before provider invocation; at t=31s B reclaims the row with a new token, sends and commits `PROVIDER_ACCEPTED`; resume A, which sends the captured message while row is already `PROVIDER_ACCEPTED`; A's finalization affects zero rows. External `late-lease-probe.cjs` transpiles/loads actual source and exercises exactly this sequence against a deterministic fake pool, with no DB/provider I/O. `late-lease-probe.log` records two sends at t=31s, B while LEASED, A while PROVIDER_ACCEPTED, both TTL 269s.
13. **Preconditions:** Sending enabled, recipient otherwise eligible, intent remains live, worker delay beyond lease before transport, and another replica/cycle reclaims. A long process suspension is sufficient; this is not claimed as a normal steady-state path.
14. **Business impact:** Duplicate native attention, extra provider requests, misleading operational retry counts and unnecessary work during recovery. Current canonical queue/domain state is unaffected.
15. **Security/data impact:** Generic payload contains no protected domain data; no cross-account exposure or domain mutation established. Do not label a confirmed security vulnerability.
16. **Affected roles:** Valet employee/supervisor with active registration and shift.
17. **Affected environments:** FCM sending enabled with recoverable leases; multi-replica or overlapping recovering workers.
18. **Existing tests:** `staff-push-worker-ttl.integration.test.ts` covers intent TTL and monotonic delay; crash/recovery tests model ambiguous outcomes; focused policy/payload/retry/ownership tests passed in this audit. The reviewed TTL tests do not assert an expired lease forbids a new provider call.
19. **Missing validation:** Real disposable PG two-worker barrier test and mocked FCM transport boundary; physical Android display duplication not tested. Fake pool reproduces worker behavior, not PostgreSQL execution semantics.
20. **Suggested fix:** Return DB-derived remaining lease budget alongside intent budget and refuse transport when it cannot cover provider timeout; carry the check to the provider's last pre-transport callback. Keep exact token/state finalization and accepted at-least-once semantics. Consider a fresh permit fence if stronger ownership is required; do not promise exactly-once delivery.
21. **Complexity:** Small/medium, roughly 1-2 engineer days including a disposable-PG race regression (estimate only).
22. **Regression risk:** Medium: avoid falsely terminalizing still-live work as EXPIRED when only lease expired; leave reclaim semantics intact.
23. **Related issue:** No matching issue established by this worker; parent owns complete GitHub dedup. This is not a reclassification of the accepted generic duplicate-after-crash residual.

**Disproof and calibration:** DEC-073/075 explicitly permit duplicate generic notification after provider acceptance/crash/unknown results and deny exactly-once guarantees. The issue is narrower: no uncertainty or crashed provider call is required; the stale worker deliberately starts a *new* call after losing its lease. PostgreSQL fencing correctly prevents stale state mutation. Native presentation may deduplicate by intent ID, limiting user impact. These constraints keep this P2 and exclude it from security findings. If owner interprets DEC-075's outliving-lease rule as advisory under arbitrary process suspension, retain as a bounded reliability risk rather than a pilot release blocker.

## Architecture and feature map

| Feature group | Source / chain | Status and concerns | Validation |
|---|---|---|---|
| Guest bearer/browser enrollment/context | Customer entry -> guest/browser-session controllers -> origin/credential admission -> GuestAccessService and GuestBrowserSession/Context services -> `guest_browser_*` SQL -> scoped visit/status | Implemented with separate active/post-visit scope, explicit prepare/switch/reconcile and feature gate. Actual browser navigation/restore and database functions delegated to other reviewers; not proven E2E here. | Source services reviewed; no live cookie/browser/DB test |
| Guest rating | Guest completion UI -> guest-rating controller/service -> locked guest credential -> completed visit check -> guest/browser rating SQL -> immutable rating response | Implemented source path; conflict and invalid-state handling explicit. | Source only |
| Initial WhatsApp guest access | Check-in hook -> server eligibility -> issue token and sealed envelope in intake transaction -> durable intents/deliveries -> restricted sender lease/permit -> Meta template POST -> verified webhook -> provider event SQL | Implemented but operationally gated, not production-cleared by this audit. Unknown transport results are intentionally nonreplayed; only conclusive rate limit rejection retries. | Source adapters/settings/worker reviewed, real Meta NOT RUN |
| Staff retrieval attention | Guest retrieval -> transactional intent/delivery expansion -> fenced claim -> current session/user/member/location/access/shift/task join -> FCM HTTP v1 -> conditional finalize | Implemented bounded best effort with INT-001 delayed-lease gap. Recipient eligibility checks are substantial but post-check generic notification TOCTOU is explicitly accepted. | Pure tests passed; PG/FCM/Android NOT RUN |
| Guest ready web push | Mark-ready -> guest push intent -> restricted SQL eligibility -> endpoint allowlist -> VAPID web-push -> retry/finalize | Implemented; FCM/Apple endpoint set and generic route-intent payload. Guest worker checks remaining lease. Browser permission/service-worker/device behavior owned by customer reviewer. | 2 focused worker/eligibility suites passed |
| Verified condition evidence | Native capture -> upload operation -> decode/normalize -> reserve SQL -> write-once S3 PUT -> exact readback compare -> mark stored/finalize SQL -> verification status -> Dashboard exact session photo viewer | Implemented across independent states; required-photo qualification and provider operational gates remain separate from upload success. `trustedQualificationStore` is test-only (lines 61-65), so production-qualified required-photo check-in cannot be assumed. | Storage/status/qualification suites passed; real S3 NOT RUN |
| Company and Location management | Management UI -> Company Admin context/MFA/commercial authorization -> typed settings/default+override services and lifecycle commands -> SQL authorities/CAS/audit | Implemented; defaults, active/inactive location handling and separate intake control visible. Location creation under strict presence default intentionally blocks (`shift-presence-strict-rollout.integration.test.ts` 204ff); do not file as accidental bug. | Selected source review; SQL implementation owned DB reviewer |
| Staff lifecycle/onboarding | Directory/actions -> scoped Company Admin or LM authority -> complete target grant coverage -> mutation SQL/version -> organization audit; invite token -> fragment activation URL | Implemented with one-time link semantics and link-unavailable replay outcome. Removing a target's last location as LM intentionally forbidden (DEC-081); not a bug. | Source review; onboarding delivery/activation not run |
| Admin force shift end | Staff shift UI -> force-end service -> current staff-management authority -> SQL closure -> pending cash reconciliation response | Implemented separate closure kind; pending state intentionally preserved. | Source review, not live DB |
| Presence configuration | Settings UI -> strict typed policy -> configuration readiness and full company location fanout -> `shift_presence_set_policy`; lifecycle create/activate readiness gate | Implemented source policy; GPS proof and device accuracy outside this worker. | Source review only |
| Dashboard analytics/reports | Report UI -> read capability -> tenant/location SQL -> separate payment/refund/validation/cash cohorts and local-date windows -> bounded CSV/PDF -> fresh export authorization/audit -> artifact | Implemented. CSV cell hardening, visible Unicode codepoint escapes and final export audit present. No finding asserted from subjective PDF style/unsupported historical arbitrary strings. Snapshot details partly reviewed only. | Source review; no export integration test |
| Map setup | Manager UI -> typed point/area commands -> LOCATION_MANAGER + current location grant -> SQL validation/CAS/audit -> projected geometry | Implemented manager-only path with optimistic timestamp checks. Native navigation/maps provider and spatial constraints not fully traced here. | All command/service authorization source read; no map UI/provider |
| Audit investigation | Management/Live UI -> investigation gate -> source identity/snapshot proof -> timeline/search/selector | Main contains explicit local-proof-only gates; ordinary/default HTTP 503 is deliberate pending accepted proof and release gates. Do not mark all displayed audit discovery capability production-ready. | Gate source reviewed; investigation internals mostly unreviewed |

## External integration matrix

All “configured” and “production-enabled” values below refer to actual deployed configuration and are UNKNOWN: no real credential content or production runtime was inspected.

| Integration | Implemented | Configured | Mock/source validation in this audit | Real provider in this audit | Production-enabled | Gaps |
|---|---|---|---|---|---|---|
| Meta WhatsApp Cloud API | YES | UNKNOWN | Source review of pinned graph/version, bounded POST, template resolver, callback signature/status correlation and settings | NO | UNKNOWN; feature/durable kill gates and `activationReady:false` visible | #310 / DEC-105 onboarding, consent, fragments, provider/WABA/templates, isolated identities and restore evidence; no automatic SMS fallback |
| Staff FCM HTTP v1 / Google ADC | YES | UNKNOWN | Policy/payload/retry/ownership passed; adapter source reviewed | NO | UNKNOWN | Actual project/ADC permission, token lifecycle, Android permission/channel and real delivery unknown; INT-001 |
| Guest VAPID Web Push | YES | UNKNOWN | Guest worker/eligibility suites passed, endpoint allowlist/adapter source reviewed | NO | UNKNOWN | Real browser subscription, FCM/Apple delivery, service-worker/tap flow unknown |
| S3-compatible private photo store | YES | UNKNOWN | Storage/status/qualification tests passed; write-once/readback/admission source partially reviewed | NO | UNKNOWN; provider approval required and qualification test-only | #288/#290 and #282-285 operational proof: selected bucket, IAM, retention/hold, restore/integrity; no real provider qualification |
| OCR | Provider config/status projection exists | UNKNOWN | Only management integration status source reviewed here | NO | UNKNOWN; status intentionally unavailable outside development/test | Domain/provider implementation belongs backend operations reviewer; no OCR production proof |
| Digital payments | Boundary registry exists | UNKNOWN | Management status reports UNAVAILABLE for unconfigured registry | NO | UNKNOWN | Do not invent a payment provider; backend operations reviewer owns concrete payment implementation |
| Maps/GPS | Setup geometry persists; task GPS elsewhere | UNKNOWN | Setup service/commands read | NO | UNKNOWN | No real map rendering, navigation, location accuracy or physical-device validation |

## Safe validation actually executed

Working directory: `<AUDIT_WORKTREE>/apps/api`.

```
<DEPENDENCY_CHECKOUT>/node_modules/.bin/vitest run --project api-non-postgres --maxWorkers=2 test/staff-push-operational-policy.test.ts test/staff-push-payload.test.ts test/staff-push-registration-ownership.test.ts test/staff-push-retry.test.ts test/guest-push-delivery-worker.test.ts test/guest-push-eligibility.test.ts test/condition-photo-private-storage.test.ts test/condition-photo-status-query.test.ts test/condition-photo-qualification-gate.test.ts
```

Result: **9 test files / 67 tests passed**, 4.33s. Log `focused-tests.log`. Existing dependencies reused via ancestor resolution; no install. An earlier invocation returned a session whose handle later was unavailable, so its outcome is not counted separately. The logged invocation is the sole counted run.

```
node <AUDIT_WORKDIR>/backend_integrations/late-lease-probe.cjs
```

Result: deterministic fake-database two-worker model produced two actual worker `provider.send` calls, including a stale call after the model's current row was `PROVIDER_ACCEPTED`. Log `late-lease-probe.log`. This is a model reproduction, not a PostgreSQL/provider experiment.

`git status --short` was empty during review. Source/tests/config untouched.

## Important rejected candidates and gaps

- Different-user takeover of an active native push installation is deliberately rejected even if old owner session is noncurrent (DEC-073 and ownership test). No account-switch bug asserted from `owner_current` being unused.
- Last-location removal by LM would make target out-of-scope and is deliberately forbidden (DEC-081). No mutation rollback defect asserted.
- Strict presence company default blocking creation of an unconfigured location is explicitly tested/accepted. Treat as operational setup constraint, not a surprise defect.
- Missing S3 object read does not authorize blind resend on an unqualified compatible store. Its WAIT response is deliberate conservative integrity behavior.
- Unknown WhatsApp send outcome is not retried as if delivery failed; this prevents duplicate credential messages. Missing automatic retry here is not a bug.
- Test-only photo qualification, audit investigation 503 and WhatsApp activationReady false are existing deferred/gated work, not new regressions. Pilot plan must say which optional features remain disabled and retain safe workflows/workarounds.
- No new confirmed security exploit found or validated in this worker. This does not establish tenant isolation or security completeness; auth core, SQL policies, edge ingress and many controller paths were not fully reviewed here.
- No real database, provider, browser, production origin, Android/iOS device, object-store backups/restore, or deployed operational configuration tested. Exact unreviewed file inventory is preserved in coverage.json.

## Pilot disposition

INT-001 does not by itself block a controlled pilot with canonical queue polling and generic deduplicated attention; fix before scaling independent workers. Required-photo production policy must remain OFF until the repository's explicit qualification/release gates are resolved. Do not promise automatic WhatsApp guest delivery until #310/DEC-105 proof/approval is complete; a pilot needs an approved manual guest-link issuance/delivery path. Core handoff, shift, payment and custody pilot readiness depends on other audit workers and end-to-end/device tests. No general production recommendation follows from this subsystem review.
