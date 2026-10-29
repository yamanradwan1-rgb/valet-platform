# RB-003 — W1 targeted Staff Push dependency-impact audit

Status: independent static source/diff review complete; NO runtime tests; no product or docs mutations.
Old source: d67b2a4a4897b4a73d21aba630fc5ab52ff9169b.
New pinned source: 0747a677ddf7fc3e1093490b7ef0a7bee9e2d938; Git tree 9fbe93fe55b5ef7c42888a874cc7217a594ccace.
Worktree: tmp/cos-audit-20261029-rb003-source (clean detached).
Scope: four modified Staff Push API files, all three added race tests, and direct dependency and cross-app impact only.
All seven target files were read to EOF, plus git diff from old to new. No observed runtime evidence is claimed.

## Changed source contract (new line numbers)

1. apps/api/src/modules/staff-push/staff-push-provider.ts:40-45 extends StaffPushProvider.send with optional async mayStartTransport; message and result unions remain the same (1-38).
2. apps/api/src/modules/staff-push/staff-push-eligibility-repository.ts:25-44 adds DB-clock lease budget, with exact delivery id, state LEASED and opaque lease token fence. Existing comprehensive eligibility resolves current organization/location, authorized active membership, active staff session/shift and access, unassigned QUEUED retrieval task, registration and settings in 61-171.
3. apps/api/src/modules/staff-push/staff-push-delivery-worker.ts:79-110 recalculates DB-authoritative lease time after potentially stalled eligibility/hook; monotonic elapsed subtraction and strict remaining lease > configured provider timeout. Lines 111-132 pass pretransport callback to provider and check lease and intent TTL again before wire payload. Lines 133-139 distinguish lost lease from actual intent freshness loss and leave the former LEASED for later reclaim.
4. apps/api/src/modules/staff-push/fcm-http-v1-adapter.ts:81-88 still validates the allowlisted message before OAuth; 95-114 fetches ADC token under abort timeout; 115-132 awaits optional DB preflight and freshness/payload checks before 133-144 FCM POST. DB-preflight throws propagate (154-159), so a failed fence check cannot be recorded as a transport attempt. The original FCM response mapping (145-153) is unchanged.

New source test evidence reviewed in full:
- apps/api/test/staff-push-expired-lease-race.integration.test.ts:1-291. Cases 123-192 pause A, allow B reclaim/send and make A skip; 194-252 combine deactivation/settings/shift changes with expired lease, then reclaim; 254-278 retries UNKNOWN; 280-291 ordinary send.
- apps/api/test/staff-push-fcm-token-delay-race.integration.test.ts:1-139. With OAuth held, replacement worker B sends; obsolete A's POST is suppressed before wire.
- apps/api/test/issue358-stale-scope-denial.integration.test.ts:1-54. This is #358 tenant/location scope 404/200 API behavior and has no direct Staff Push worker/provider import.

## Strict RB003 invalidation: previously credited, unchanged paths

1. apps/api/src/modules/staff-push/staff-push-lifetime.ts (original-audit credit, unchanged SHA256 8483f46d94e4fadecb1173101e868f090f369a3188d232fd474c35998fa3a523). MUST reopen semantic usage/security review: the helper at lines 1-18 previously served intent TTL and is newly called to authorize the lease transport fence at changed delivery-worker.ts:85-106, as well as intent TTL at 119-124. Its numerical preconditions (finite values, monotonic order, positive rounded residual) are now security properties governing whether an old worker can start external FCM I/O. A prior file-only review confined to payload/intent TTL is materially incomplete for the new caller, although no defect in unchanged helper is asserted. Confidence: high dependency impact; severity: no confirmed vulnerability.
2. apps/api/test/staff-push-worker-ttl.integration.test.ts (original-audit credit, unchanged SHA256 26f85e0c510582fad574055e611ad286a83811731894ff2a300311ab76fc4b01). MUST re-evaluate semantic test-coverage claim: lines 149-165 arrange an unconditional synthetic EXPIRED_BEFORE_TRANSPORT result and assert EXPIRED. In the new worker at 133-139 the identical provider signal now has two causes: actual intent expiry -> EXPIRED, or lease budget/fence lost -> leave LEASED for reclaim. This preexisting test still covers the former scenario, but can no longer be used as complete evidence of behavior for all EXPIRED_BEFORE_TRANSPORT cases. New race tests cover separate lost-lease cases; report is a credit-scope refresh, not a claim the preexisting assertion fails. Confidence: high; severity: coverage gap P3 only if new race tests are excluded from validation.

Invalidation above is a dependency-semantic credit recommendation, not a claim these unchanged Git blobs differ. Both retained blob hashes match the current pinned source. The four directly modified files require their own new-source review independently of these two unchanged-path impacts. The three newly added test paths had no old source credit.

## Explicitly cleared unchanged importers/helpers — credits remain valid

- apps/api/src/modules/staff-push/staff-push-claim-repository.ts:18-67 claims with transaction/row locks, increments attempt and changes token; 69-112 terminalizes only expired/exhausted leases. New pretransport check READS existing fence but claim/reclaim transition and CAS contract are unchanged. No invalidation.
- apps/api/src/modules/staff-push/staff-push-finalization-repository.ts:12-31,33-81,84-121 predicates remain exact id + lease token and state LEASED. Changed caller now skips finalization on lease-budget loss; original finalization semantics remain valid. No invalidation.
- apps/api/src/modules/staff-push/staff-push-operational-policy.ts:25-37 and 111-142 define 30-second lease, 10-second provider timeout, and reject timeout >= lease. New caller exercises this existing invariant, without changing policy semantics. No invalidation.
- apps/api/src/modules/staff-push/fcm-http-v1-config.ts:1-30 maps accepted timeout to milliseconds and validates project ID. The provider still enforces same total timer; callback does not alter config. No invalidation.
- apps/api/src/modules/staff-push/staff-push-delivery-types.ts:1-22 retains claim/eligible token and lifetime shapes. No invalidation.
- apps/api/src/modules/staff-push/staff-push-payload.ts:19-67,69-99 continues only generic VAYLET + intent ID/kind/TASK_QUEUE/schemaVersion payload; both pre and post OAuth validation still use the same shape. No invalidation.
- apps/api/src/modules/staff-push/fcm-result-mapper.ts:54-114 maps same HTTP FCM outcomes; extra preflight rejection never enters mapper. No invalidation.
- apps/api/src/modules/staff-push/staff-push-retry.ts:6-31 uses unchanged result class (no new class); no invalidation.
- apps/api/src/modules/staff-push/staff-push-observability.ts:3-65 maps unchanged event/result union; early lease budget exits produce no invented provider result. No invalidation.
- apps/api/src/modules/staff-push/staff-push-maintenance.ts and staff-push-maintenance-repository.ts: existing stale claim/expiry maintenance remains responsible for any LEASED row left by fence loss; no direct changed API or state transition. No invalidation.
- apps/api/src/modules/staff-push/staff-push-registration-repository.ts, staff-push-registration.service.ts, registration test paths: current registration/session/shift eligibility query continues to check their unchanged persistence representation; callback adds no altered registration contract. No invalidation.
- packages/contracts/src/staff-push.ts and staff-push.test.ts: portable schema for FCM provider enum, generic notification route data and results remain unchanged; the server-only StaffPushProvider.send interface is unrelated to the schema type of the same name. No invalidation.
- No direct imports of these four runtime modules from apps/valet, apps/customer or apps/dashboard were found. Cross-app generic notification remains kind EMPLOYEE_RETRIEVAL_REQUESTED, routeIntent TASK_QUEUE and intentId; client must refetch through authorized API. No downstream cross-app invalidation.

## Direct importer/caller inventory

Runtime:
- apps/api/src/staff-push-worker.ts:7-15 imports FcmHttpV1Adapter and StaffPushDeliveryWorker; 38-61 reads accepted policy/config, constructs adapter and worker; 64-85 runs periodic runOnce. Exact direct runtime caller. Its current rebaseline status is tool_only/not full-credited, so it must be examined when reviewed but cannot be listed as a previously credited unchanged invalidation.
- staff-push-delivery-worker.ts:1-22 is the sole runtime importer of changed staff-push-eligibility-repository.ts and provider send interface, plus unchanged claim/finalization/lifetime/payload/policy/retry/observability.
- fcm-http-v1-adapter.ts:3-10 imports provider interface, config, payload and FCM mapper.
- staff-push-retry.ts, staff-push-finalization-repository.ts, staff-push-payload.ts, staff-push-observability.ts, fcm-result-mapper.ts import only unchanged data/result types from provider; optional mayStartTransport does not affect them.

Direct legacy test consumers (all paths under apps/api/test/):
- fcm-http-v1-adapter.test.ts (adapter; 1-176: tests direct calls with omitted optional preflight, still supported).
- staff-management-push-deactivation.integration.test.ts, staff-push-cleanup.integration.test.ts, staff-push-crash-recovery.integration.test.ts, staff-push-finalization-outage.integration.test.ts, staff-push-invalid-endpoint.integration.test.ts, staff-push-management-policy-race.integration.test.ts, staff-push-stale-maintenance.integration.test.ts, staff-push-worker-eligibility.integration.test.ts, staff-push-worker-results.integration.test.ts, staff-push-worker-ttl.integration.test.ts (worker direct import).
- fixtures/staff-push-crash-child.ts (worker direct import).
- staff-push-provider-test-value.ts (only result data typing).
- New two Staff Push race test paths above also directly import worker/adapter; #358 test has unrelated API location auth behavior.

All direct callers discovered with repository-wide TypeScript and TSX import/identifier scans; no runtime or tests executed for RB003.

## Attack surface, authorization, concurrency and bounded limitation

Source-only evidence supports defense against the stale old-worker transport boundary after claim expiry: claim repo:18-67 produces opaque token; eligibility repo:29-44 checks current token/LEASED under DB clock; worker:100-132 checks both pre-provider and after delayed OAuth; adapter:115-143 gates actual FCM POST. The explicit DB preflight throws fail closed before network; worker claims are not finalized spuriously if lease budget is lost.

DEC-073_NATIVE_PUSH_ARCHITECTURE.md (Accepted) lines 364-368 and 672-678 expressly allows current eligibility to change after the last recheck and before provider acceptance. Generic payload plus authorized tap-time refetch is the documented containment. Thus a revocation in that tiny post-check window is a known residual TOCTOU, NOT a newly confirmed P2 vulnerability. DEC-075 accepted 30-second lease and 10-second transport timeout (lines 101-120) supports the strict threshold.

Possible P3 operational follow-up, confidence medium: worker.runOnce can reject if the new post-OAuth DB preflight itself throws (adapter:119-121,154-159; worker:111-132); the top-level apps/api/src/staff-push-worker.ts:64-85 does not catch runOnce inside its loop, so the process may exit and rely on supervisor/restart. However existing other database failures already propagate from claim/eligibility/finalization, so this is no evidence of a new RB003-specific defect. No standalone finding ID proposed.

Historical cross-feature note docs/audits/2026-10-27/continuation/evidence/C002-cross-feature.json:41-57 (XINT-PUSH) predates added rechecks and its characterization of missing provider-boundary fence must be annotated as superseded during audit-note synchronization. That historic note has coverage_credit false, is not a previously credited path, and this W1 task does not edit docs.

## Final recommendation

Invalidate exactly two previously credited unchanged semantic reviews: staff-push-lifetime.ts and staff-push-worker-ttl.integration.test.ts. The unchanged code/contract importers enumerated above remain credited. Treat the four modified modules and three newly added test files under ordinary changed/unreviewed-source rules. No new confirmed P0/P1/P2 from this static, bounded dependency review.
