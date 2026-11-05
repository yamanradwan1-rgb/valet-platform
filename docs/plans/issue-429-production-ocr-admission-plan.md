# Issue #429 — Lean Production OCR MVP + Manual Plate Capture

Status: **Proposed engineering plan — DECISION REQUIRED**

- Revision date: 2026-11-05 (Asia/Amman).
- Source baseline: `ac758ffff7181efa6cad1311c40aca731171770e` (`origin/main`, freshly fetched).
- Existing planning branch: `plan/issue-429-production-ocr-admission`.
- Previous remote planning HEAD: `201173e67d2c8e6d7578555a870aa54bb2d1ee98`.
- Issue: [#429](https://github.com/yamanradwan1-rgb/valet-platform/issues/429).
- Delivery: revise this original Markdown document, validate, commit, push the same branch, stop. No implementation or activation authorization.

## 1. Executive Summary

Production OCR is deliberately unavailable: `PlateOcrCostGuard.acquire()` permits only development/test, before provider I/O. Valid HTTPS provider configuration does not bypass it. This is DEC-074 §22.3 safety behavior, not proof of a provider outage. HTTP operation `SUCCESS` does not imply OCR `MATCH`.

The primary recommendation is now **Lean MVP**, conditional on the remaining decisions in §31: reuse PostgreSQL and the existing authorization transaction for atomic shared admission, issue one immediate nonqueued provider request outside any DB lease, then perform one short completion/release operation. Evaluate this two-transaction candidate first. The former three-transaction admission/dispatch/settlement design is retained only as a decision-dependent alternative if a distinct dispatch authorization/marker is necessary. Neither architecture is accepted by publishing this plan.

Preserve authoritative `Organization + Membership + target Location`, identity limits of one concurrent call, 5/10 seconds and 20/60 seconds; add only global and Organization lookup quotas, explicit OFF/kill controls and minimal owned recovery state. Fail closed on shared-store failure. Never automatically repeat a potentially billable HTTP request, refund uncertain consumption, or recycle remote exposure on TTL alone. Keep manual intake independent of OCR.

The second workstream replaces timed scanning with **employee-triggered Capture**. Camera opening/readiness only presents preview. One explicit press owns one bounded camera/ROI operation and at most one OCR HTTP attempt; failure may produce zero requests. There is no 1.2-second capture timer, five-attempt automatic cycle, or automatic NO_MATCH retry in the desired final workflow. Preserve editable Confirm Plate, explicit human Confirm, exact returning recognition, Manual Plate and No Plate.

Strict visual freeze: the sole additive visual control is one existing-style `CheckInButton` (wrapping `EmployeeButton`). Only its localized label and minimally necessary truthful scanner guidance may change. Preserve the 260px viewport, ROI, Torch, tokens, header, existing controls and other screens. Source inspection cannot establish screenshot parity or acceptable small-screen footprint; visual/device evidence is a release gate.

Keep backend Issue #429 and Native implementation separately owned, reviewed and rolled back. Recommend a separately linked Native issue and separate implementation branches/reviews; create neither here. The original security research on tenant isolation, remote uncertainty, TLS/egress, restore-lost usage and least privilege is retained. Extensive billing/reconciliation infrastructure, extra quota tiers and a generic limiter platform are deferred.

## 2. Latest Main and Planning Branch Evidence

### Repository facts discovered

| Evidence                                      | Verified revision state                                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Origin                                        | `https://github.com/yamanradwan1-rgb/valet-platform.git` for fetch and push                                                                       |
| Initial worktree                              | `D:/kndoom/valet-platform`, branch `main`; two unrelated untracked runbooks preserved                                                             |
| Fetch order                                   | Status/remotes, then `git fetch origin main`, SHA and last eight commits, then fetch existing planning branch                                     |
| Latest fetched main                           | `ac758ffff7181efa6cad1311c40aca731171770e`, merge PR #431 (management alerts Phase 2/3)                                                           |
| Existing remote planning HEAD before revision | `201173e67d2c8e6d7578555a870aa54bb2d1ee98`                                                                                                        |
| Safe checkout                                 | New local tracking ref for the existing remote branch in `D:/kndoom/valet-platform/tmp/issue-429-plan-revision`; no new remote branch             |
| Synchronization                               | `HEAD...origin/main` = `1 0`; normal `git merge --no-edit origin/main` returned `Already up to date.` No history rewriting or merge commit needed |
| Original artifact                             | Entire original 1,038-line plan reviewed and revised in place; prior commit remains its parent history                                            |
| Issue                                         | Current #429 OPEN, zero comments, updated 2026-11-04T16:14:15Z; body read through GitHub connector; not edited                                    |
| Schema inventory                              | 109 committed `migration.sql` files; no OCR admission schema exists at this baseline                                                              |
| Evidence level                                | Source/test/document inspection and documentation validation only; no fresh feature runtime, load, device, CI or production proof                 |

The original plan used this same main SHA. Therefore this revision changes recommendations and Native scope, not the source baseline. Historical clone/worktree facts from its first authorship are replaced by the actual revision evidence above. Recheck main before push; if it advances, integrate safely and re-review relevant differences. Final check result is recorded in §34.

## 3. Confirmed Owner Decisions and Binding Requirements

### Binding requirements

These directions are **LOCKED by the latest owner request**, not questions to reconfirm:

| ID    | Established direction                                      | Consequence                                                                                  |
| ----- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| OD-01 | MVP only; preserve existing OCR/Check-In architecture      | Focused production admission and manual trigger; no rebuild                                  |
| OD-02 | PostgreSQL-first evaluation; Redis conditional on evidence | Compare incremental cost fairly; do not install Redis or assume PG faster                    |
| OD-03 | Protect Check-In speed and minimize DB transactions        | Evaluate combined authorization/admission plus completion before adding dispatch transaction |
| OD-04 | Fail closed; no automatic paid-provider retry              | No local-memory bypass, guessed refund, paid health probe or resend                          |
| OD-05 | Employee Capture is the only new attempt initiator         | Readiness, timers, remounts, NO_MATCH and UNAVAILABLE initiate zero new attempts             |
| OD-06 | One press permits at most one external OCR HTTP call       | Local failure yields zero; safe existing hardware fallback cannot add an OCR call            |
| OD-07 | Strict visual freeze, one additive existing-style control  | No palette/type/geometry/Torch/header redesign; minimal localized copy only                  |
| OD-08 | Human Confirm/Edit and Manual/No Plate stay permanent      | OCR never invokes `confirmIdentity()` or gates manual completion                             |
| OD-09 | Planning Markdown only, same branch commit/push            | No application/tests/schema/config/DEC/Issue edits, PR, main merge or deployment             |

Repository binding authority remains [AGENTS.md](../../AGENTS.md), docs/00–18 and focused Accepted decisions indexed in §34. DEC-012/020/069/072/074 keep assistance, unknown-plate identity, exact human-confirmed returning recognition and auth/lifecycle safety. DEC-083 keeps Company default → nullable Location override; `false` is a real override. Tenant OCR ON cannot override provider, privacy, distributed budget or kill controls.

Latest owner instruction supersedes DEC-074's automatic-capture product direction for this requested future change. Its focused text and log still describe automatic acquisition; §20 proposes the precise synchronization. This is disclosed source drift, not permission to edit the actual DEC during planning. Other Accepted protections remain binding.

## 4. Current Backend Architecture and Existing Implementation Patterns

### Existing implementation patterns

Evidence E01–E13/E16–E21 in §34 proves current behavior/capability, not acceptance of new policy:

1. `PlateOcrAuthGuard` authenticates before bounded multipart allocation, sets no-store, and carries only `plateOcrUserId`. The principal resolver checks persisted session expiry/revocation and active User but drops exact session context from its returned principal.
2. `PlateOcrController` validates strict metadata/country, JPEG MIME, ≤1 MiB, buffer-size agreement and SOI/EOI markers; zeros the received buffer in `finally`. Signature checks are not a complete JPEG decode.
3. `PlateOcrService.recognize()` opens a PostgreSQL transaction, calls exported `authorizeCheckInLocation(..., true)`, locks exact-Location Shift eligibility and reads `COALESCE(location override, Organization default)`. It commits/releases before local cost admission and provider I/O.
4. `PlateOcrCostGuard` uses a bounded process-local map (default 1,024 identities), one in flight and exact 10s/60s timestamp histories. Non-development/test modes deny. Replicas/restarts do not share state.
5. `PlateRecognizerSnapshotProvider` performs one multipart POST with redirects rejected, HTTPS in production, default 4s timeout (allowed 100–10,000ms), 64 KiB response cap, at most 100 candidates and deterministic threshold/tie-break selection. No paid-provider retry exists.
6. `PlateOcrProvider.recognize()` exposes only the neutral response. It does not expose non-sensitive readiness, dispatch/completion certainty, cancellation from caller, or billing evidence; §15 identifies this internal abstraction gap.
7. `management-integrations-status.ts` independently maps configured production OCR to UNAVAILABLE from NODE_ENV. Future truthful readiness must remove that redundant inference under approved integration semantics, without a Dashboard redesign or paid probe.

`CheckInModule` imports Auth, ConditionPhotoAdmission, RuntimeDatabase and HttpInfrastructure modules; wires feature providers, the guard and provider factory, operation runner and per-controller RequestId middleware. Preserve this composition and explicit transaction/executor conventions; do not add a generic controller/service/repository stack. `complete-check-in-command.ts` is the nearest command/transaction reference.

Literal routes verified: PlateOcrController and StaffCheckInController use `@Controller("v1/staff/check-in")`; ShiftController uses `@Controller("v1/staff/shifts")`. Preserve `POST /v1/staff/check-in/plate-ocr`, HTTP 200 for valid neutral results, existing auth/input error mappings, no-store and request-ID behavior. No new public route is proposed.

`AntiAbuseService` has real transaction-aware count/reserve/finalize methods, but fixed 15-minute windows, a closed non-OCR scope union and no owned remote concurrency or global/tenant budget model. Its PENDING event is counted use, not an HTTP lease. ConditionPhotoAdmission demonstrates all-or-none checks in one transaction but disclaims being a lease limiter. Reuse patterns, not unrelated scope meanings or photo grants. The custody audit writer requires ValetSession/Vehicle scope and cannot emit standalone OCR control history unchanged.

The existing bounded PG pool is shared infrastructure. `inPostgresTransaction` detects uncertain COMMIT and discards unusable connections. No extra OCR pool/singleton is justified. Production capacity settings are mandatory; fixed pool acquisition/lock/statement budgets are 2s/2s/3s, with 5s transaction/6s operation defaults for bounded paths; general lease budgets are validated deployment values. These ceilings are not acceptable routine OCR latency targets. Inspect the actual operation scope and lease configuration during implementation rather than assuming all routes use identical deadlines.

## 5. Current Native Camera Flow

`NativeCaptureStep` renders `NativePlateCameraStep` in the existing capture presentation. `useFocusEffect` binds lifecycle and opens the controller once. Camera permission, supported picture sizes, optional picture-size remount and ROI preview metadata validation precede `controller.ready()`.

Current chain (historical/current behavior only, to replace):

```text
focus/open → permission → camera mount → ROI metadata ready
→ controller.ready(): phase preview + ocr.start(generation)
→ setTimeout(1200) → capture → recognize → cleanup
→ NO_MATCH: schedule another attempt, maximum five
→ MATCH or terminal no-read/unavailable: close and finish
```

`NativePlateOcrLoop` provides one operation across generations and no queued frames; cancellation deletes known files without waiting for an uncooperative HTTP promise. `NativePlateOcrAdapter.accept()` sets the editable draft and enters review only. `recognizeNativePlate()` uses the VAYLET API, 15s timeout, AbortSignal and auth-generation check. NativeProtectedTransport and EmployeeClient recover authentication but do not replay this POST as a safe read. No idempotency key exists for OCR.

Current controls: viewport/message; preview guidance; failed-only primary Retry; Manual Entry secondary; denied/non-askable camera Settings secondary; No Plate ghost; Close ghost. Idle has Open primary, Manual secondary and No Plate ghost. Torch appears inside preview. There is **no dedicated Capture/Shutter button** in this Plate screen and no reserved shutter slot.

## 6. Verified Capture-Button and Design-System Evidence

| Source/symbol                                   | Verified capability or current convention                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `native-check-in-primitives.tsx::CheckInButton` | Wrapper around EmployeeButton, passes busy/disabled/accessibility and variants; primary defaults large               |
| `employee-controls.tsx::EmployeeButton`         | `busy` implies disabled; ActivityIndicator, guarded onPress, theme label/pressed colors, accessibility busy/disabled |
| `employee-tokens.ts`                            | Heights large 56, standard 44, compact 36; min touch target 48; primary radius 16; spacing lg 16/screen 20           |
| `employee-typography.ts`                        | Button Plus Jakarta Sans, 15px, semibold; established human/identifier direction helpers                             |
| `employee-palette.ts`                           | Existing semantic Light/Dark roles; primary action #176BFF with theme-aware surrounding surfaces/text                |
| `native-condition-photo-camera.tsx`             | Existing manual Capture EmployeeButton gated by ready/permission/busy; component reuse reference only                |
| `native-plate-camera-step.tsx`                  | Viewport height 260, primary radius, inverseElevated, overflow hidden; no Capture control                            |
| `native-check-in-styles.ts`                     | Parent body padding screen=20, gap lg=16; do not change tokens to fit a new layout                                   |
| `native-plate-torch-control.tsx`                | Existing top/right sm=8 position, 48 touch dimensions, form radius; preserve                                         |

No live device screenshot or rendered before/after comparison was taken. Component/source evidence proves reusable styling and current hierarchy, not pixel parity. Do not copy the condition-photo full-screen Modal, 220px camera, toolbar or styles into the Plate screen.

## 7. Root Causes and MVP Problems

Backend: the intended shared durable admission capability is absent, so production denial is correct. Memory multiplication across replicas/restart cannot enforce total cost. Missing readiness/completion observations prevent precise internal settlement even though public results are sufficient for Native.

Native: camera readiness currently grants timed capture and up to five potential paid lookups without a distinct employee press. Owner direction removes that trigger to avoid surprise captures, unnecessary attempts and positioning friction. Manual capture reduces avoidable requests, but is not backend anti-abuse authority: a modified client can call the endpoint directly.

Planning: the original Candidate P made three transactions, dual admission/dispatch event histories and about ten persistence families the primary recommendation before showing need. It doubled authorization work and widened MVP scope. Keep its security lessons; evaluate the smaller design before paying that complexity cost. No benchmark proves either design fast enough today.

## 8. Scope and Explicit Non-Goals

### Explicitly out of scope

Workstream A (Issue #429): shared identity/global/Organization admission, minimal owned uncertainty/release, conservative quota units, typed enable/kill, truthful private diagnostics/readiness and safe release evidence.

Workstream B (focused Native ownership): explicit trigger, remove timed OCR initiation/repetition, one Capture button, necessary EN/AR guidance, busy fencing, test migration, camera/ROI/privacy and visual/device proof. Recommend a linked issue; do not silently expand #429's backend acceptance checklist or create/edit issues here.

Affected persisted entities now: User, StaffAuthSession, OrganizationMembership, MembershipLocationAccess, Organization, Location, Shift and typed OCR policy are read/locked for authority. Candidate new operational entities: quota/control and attempt/ownership records, dependent on U-007. Native changes transient controller/operation/draft presentation only. No new ValetSession or Task/Dispatch transition; no Vehicle/Customer/payment/custody mutation or canonical recognition change.

Explicit non-goals: AI recognition/accuracy/ROI redesign, billing platform, customer charges, advanced financial alerts/BI, generic limiter/queue/outbox, management budget UI, new authentication, automatic retries, new camera/native dependencies, new screens/modals/icons, unrelated photo/guest/auth quotas, production configuration/activation. Existing no-plate and other MVP distinctions remain unchanged.

## 9. Decision Classification Matrix

Each proposition has exactly one classification. Existing behavior is not automatically future policy.

### LOCKED decisions

| ID    | Atomic proposition                                                                | Classification | Authority/evidence and falsifier checked                                   |
| ----- | --------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------- |
| L-001 | Current production remains denied until approved shared admission/release         | LOCKED         | DEC-074 §22.3; config/service/guard expose no bypass                       |
| L-002 | Cost identity is server-derived Organization+Membership+Location                  | LOCKED         | DEC-074 §22.1; strict schema and persisted authorizer reject tenant claims |
| L-003 | Identity limits remain one concurrent, 5/10s, 20/60s                              | LOCKED         | DEC-074 §22.3 and owner request; no later relaxed limit found              |
| L-004 | Current operational Staff, exact Location/Shift and policy authority precede cost | LOCKED         | DEC-032/074/083; no admin-role inheritance in authorizer                   |
| L-005 | Only explicit human confirmation authorizes returning recognition                 | LOCKED         | DEC-069/074 §3/15; adapter calls review, never confirmIdentity             |
| L-006 | Preserve public MATCH/NO_MATCH/UNAVAILABLE and safe auth/input mappings           | LOCKED         | Owner compatibility direction, shared schema/controller                    |
| L-007 | Images/plates/secrets do not enter limiter/log/audit history                      | LOCKED         | DEC-074 §8/14/22, security rules; no history authorization found           |
| L-008 | Existing AntiAbuse/photo scope meanings remain separate                           | LOCKED         | DEC-024/074 §22; scopes/SQL lack approved OCR meaning                      |
| L-009 | Fail closed and never automatically retry potentially paid HTTP                   | LOCKED         | OD-04; provider has one fetch/no retry                                     |
| L-010 | Readiness waits for Capture; no automatic timed capture or NO_MATCH retry         | LOCKED         | OD-05/06 explicitly supersede DEC-074 automatic direction for future scope |
| L-011 | Keep single-flight, generation fencing, cleanup and permanent fallbacks           | LOCKED         | OD-08 and DEC-074 safety; lifecycle/ROI files inspected                    |
| L-012 | One existing-style additive Capture control; visual freeze                        | LOCKED         | OD-07; no authorization for redesign                                       |

### DERIVED conclusions

| ID    | Atomic proposition                                                               | Classification | Authority/evidence and falsifier checked                                             |
| ----- | -------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------ |
| D-001 | Production UNAVAILABLE is intentional guard denial, not provider outage proof    | DERIVED        | E01–E05; verified configured path cannot bypass guard                                |
| D-002 | AntiAbuse cannot directly satisfy OCR windows/ownership unchanged                | DERIVED        | E09–E11; fixed 900s SQL and no lease/budget semantics                                |
| D-003 | PG is existing infrastructure; repository does not establish Redis deployment    | DERIVED        | E12/E18; packages/Compose/infra/stack checked                                        |
| D-004 | No Plate Capture exists, but CheckInButton reuse is available                    | DERIVED        | E22–E24; JSX/components inspected rather than inferred from copy                     |
| D-005 | Authorization can mechanically share its transaction with admission              | DERIVED        | E02/E07/E08 accept exported transaction-aware helpers; policy adequacy remains U-008 |
| D-006 | Expired local ownership cannot prove remote stop or free budget                  | DERIVED        | Provider abort/interface offers no remote cancellation acknowledgement               |
| D-007 | Existing custody audit writer cannot represent standalone OCR controls unchanged | DERIVED        | E20 scope requires valetSessionId/limited entity types                               |
| D-008 | Existing OCR POST has no transparent idempotent replay contract                  | DERIVED        | Strict request/client contain no key; POST not refreshed/replayed                    |

### Contradicted assertions

| ID    | Atomic proposition                                                   | Classification | Authority/evidence and falsifier checked                  |
| ----- | -------------------------------------------------------------------- | -------------- | --------------------------------------------------------- |
| X-001 | Change NODE_ENV or use memory to permit production                   | CONTRADICTED   | DEC-074 §22.3 forbids this substitute                     |
| X-002 | Final workflow must automatically capture when ready                 | CONTRADICTED   | Latest owner OD-05 overrides this historical DEC behavior |
| X-003 | TTL automatically cancels remote processing or permits resend/refund | CONTRADICTED   | OD-04 explicitly forbids this assumption                  |
| X-004 | OCR may confirm identity or return quota denial as NO_MATCH          | CONTRADICTED   | DEC-074 trust and neutral availability contract           |
| X-005 | Adding Capture permits a camera/UI redesign                          | CONTRADICTED   | Strict owner visual freeze                                |

Falsification coverage: **20/20 L+D propositions checked by source inspection** against the specific falsifiers listed above. This is reasoning coverage, not executed tests. D-005 proves composition capability only; it does not close U-008. X-002 describes the superseded future requirement, not a claim that current source is already manual.

### UNRESOLVED decisions

| ID    | Remaining proposition/choice                                                               | Classification | Dependent envelope                                                             |
| ----- | ------------------------------------------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------ |
| U-001 | Select final PG architecture after evidence; Redis remains alternative                     | UNRESOLVED     | §10–12/22 backend choice; PostgreSQL-first evaluation itself is locked         |
| U-002 | Exact global/Organization units, periods, concurrency and any verified account rate        | UNRESOLVED     | Quota controls and activation values                                           |
| U-003 | Approve conservative lookup unit and fresh-attempt/replay semantics                        | UNRESOLVED     | Accounting and explicit retry contract; no automatic retry is already locked   |
| U-004 | Remote uncertainty, finite recovery evidence, permit age and kill boundary                 | UNRESOLVED     | Owned completion/quarantine and liveness                                       |
| U-005 | Provider account/limits/privacy/country and deployment evidence                            | UNRESOLVED     | External activation, not permission for a paid probe                           |
| U-006 | Who may change quotas/kill/reconcile, channel and atomic history                           | UNRESOLVED     | Operator-only controls and authority                                           |
| U-007 | Minimal schema, grants, lock mechanism, retention and recovery owner                       | UNRESOLVED     | Conditional migration/function design                                          |
| U-008 | Combined transaction sufficiency, exact-session recheck and bounded dispatch authorization | UNRESOLVED     | Lean A vs Lean B; no silent removal of mandatory revalidation                  |
| U-009 | Private provider/admission observations and truthful readiness contract                    | UNRESOLVED     | DI, settlement facts, Management projection                                    |
| U-010 | Approve latency/load/recovery SLO and monitoring recipients                                | UNRESOLVED     | Benchmark and operating envelope                                               |
| U-011 | Record DEC amendment, implementation GO, later activation approval                         | UNRESOLVED     | Future execution; product manual direction is already locked                   |
| U-012 | Separate linked Native issue and minimal placement acceptance                              | UNRESOLVED     | Tracking and visual footprint; not permission to revisit Capture/visual freeze |

**Decision firewall:** below, “Lean candidate” means **IF U-001/003/004/006/007/008/009 choose the recommended alternatives**, the conditional envelope applies. Concrete candidate states/layouts are proposals for approval, never existing Accepted policy. If a choice changes, update affected tests/files before implementation. U-002/005/010/011 additionally gate actual activation. No remaining choice blocks delivery of this document.

## 10. Lean PostgreSQL Proposal

**Primary proposal, conditional on U-001/003/004/007/008/009:** one combined authorization/admission transaction A, one outbound call, one short settlement operation S. This replaces the original primary A/B/C design; it does not silently claim that a DB reservation proves dispatch happened.

```text
Capture press → transient validated JPEG → existing authenticated OCR API
→ A: persisted Staff/Location/Shift/policy + global/org/identity checks + reserve/debit
→ known COMMIT → release connection → local current/deadline check → one HTTPS request
→ S: guarded owned completion/release or uncertainty → neutral result + cleanup
```

Use the existing runtime pool and feature-owned thin service → focused executor/policy pattern. Do not keep an SQL transaction/connection while cropping, waiting for employee input, preparing multipart bytes or performing provider HTTP. Validate readiness/input before debit without calling a paid endpoint. Prepare everything possible before A to minimize commit-to-fetch delay. No queue and no deferred send permit.

The admission write can be moved into the transaction already used by PlateOcrService because both authorizers accept `PostgresTransaction`, and the exact-Location Shift helper explicitly requires retention through the protected write. This is a verified capability. Exact session context is currently lost at the guard: IF U-008 requires close session revalidation, pass the existing server-resolved `StaffSessionContext` internally and call exported `lockAndRecheckStaffSessionContext` inside A. That changes an internal boundary, not the public OCR body. Its lock order must be reconciled first (§12).

### Minimal persistence envelope — not an accepted schema

IF U-007 selects the recommended PG shape, target **three table families**, rather than the original roughly ten:

| Candidate family                               | Why needed / minimal information                                                                                                                                                    | Trade-off and guard                                                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Global/provider-account period + typed control | Stable nonsecret account identity, enabled/kill/version, period bounds, integer quota/spent, optional approved aggregate capacity                                                   | One global hot row; singleton/account scope must not fake an Organization; starts disabled/zero                             |
| Organization allocation + typed control        | Period/account+Organization key/FKs, enabled/version, integer quota/spent, approved capacity                                                                                        | Allocation cannot be raised by tenant OCR ON; no per-Location financial tier                                                |
| Attempt/reservation                            | Random ID, full Organization/member/Location, period/account relation, DB admission time, one consumed unit, controlled ownership/state/deadline and sanitized terminal observation | One row supplies exact recent rate history and conservative exposure; no separate rate or usage ledger per lookup initially |

This is a minimization target, not a promised exact table count. IF U-006 requires a distinct append-only control/recovery history table because no existing compatible writer can carry it, add only that fourth family with its accepted provenance/retention. Do not force control history into the custody writer. Freeze exact types/function signatures only after U-007; no runnable DDL is approved here.

Admission facts (scope, period, timestamp, consumed unit) are immutable; terminal/recovery transitions cannot alter the original debit or erase operational history. Required control corrections append history. A single guarded terminal update is simpler than an extensive per-attempt accounting ledger; IF separate append facts are required by the accepted audit contract, approve the smallest additional representation. No vendor invoice importer, money conversion engine or automatic financial reconciliation is required for MVP.

Candidate constraints/indexes under U-007: composite tenant FKs to member/Location and Organization allocation; period/account linkage; positive/bounded integral values and explicit NULL rejection; unique internal attempt ID; partial unique full identity over active **and uncertain** states; identity+admission-time index for 10s/60s counts; unresolved-state/deadline index for bounded recovery; period/Organization/state index for capacity. No time-dependent partial predicate such as `expires_at > now()`. Do not index or store plate/image/digest. DB-authored timestamps are sampled after waits. Retain recent exact windows and unresolved exposure; terminal history retention/archive remains a decision, never wholesale deletion of operational evidence.

Global+Organization counters, identity count/slot and attempt insertion commit all-or-none. A rejected request consumes no partial dimension and writes no durable per-denial row. Count active/unknown exposure from bounded indexed attempt rows initially; add a denormalized active counter only if EXPLAIN/load proves need and its reconciliation is approved. Ongoing row growth is bounded by quota/active limits plus an approved retention/archival policy, not a memory-size assertion.

Keep platform/account kill authority stable across period rollover; a per-period flag alone must not leave old send-capable work outside the kill boundary. The exact control-row representation remains U-007. Use one stable provider-account binding initially; rotating credentials for the same billing account cannot reset its quota. Multiple accounts, borrowing, quota rollover engines and Location budgets are deferred. A minimal explicit next-period provisioning operation is still required; no implicit unlimited refill.

## 11. PostgreSQL and Redis Comparison

Both candidates **still pay current PostgreSQL Staff/Location/Shift/policy authorization**. Redis does not make OCR database-free. No end-to-end benchmark exists for either candidate, and repository artifacts do not establish an available vetted Redis service. These are architecture comparisons, not measured speed claims.

| Dimension           | Lean PG A + S                                                     | Redis admission alternative                                                                              | Reason/trade-off                                                               |
| ------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Existing auth cost  | Existing PG proof retained in A                                   | Existing PG proof retained, then Redis hop                                                               | Compare incremental work, not Redis RAM operations vs all SQL auth             |
| Atomic decision     | Global/org/identity and authorization share A                     | Lua/function can atomically check Redis keys, not current PG authority                                   | Cross-store check-use and kill/revocation interval needs explicit U-008 policy |
| Normal operations   | Existing auth transaction extended; S adds one short operation    | PG auth + atomic Redis reserve + Redis completion; durable SQL accounting may add more                   | Instrument statements/network round trips; no numeric speed claim              |
| PG pressure         | Extra writes/window queries/row waits in current pool             | Can reduce high-frequency limiter writes if Redis is sufficient durable authority                        | If SQL debit/ledger remains, include its load and dual-write protocol          |
| Hot global state    | Budget row serializes all tenants; keep critical section bounded  | Shared global key/script also serializes; Redis Cluster related keys need compatible placement           | Higher throughput possible, never assumed free of global bottlenecks           |
| Durability          | Committed PG authority; verify WAL/fsync/failover/restore reality | Configure AOF/fsync, persistence storage and safe failover; no volatile reset                            | Neither datastore name proves no lost paid allowance                           |
| Failure             | DB/pool/lock failure denies; no memory fallback                   | Network/Redis/partition failure denies; no PG or memory bypass unless separately approved                | Additional dependency can reduce availability                                  |
| Restart/failover    | Do not re-enable from stale restored spent counters               | AOF every-second can lose recent writes; asynchronous replication/WAIT is not a no-loss guarantee        | Lost quota state must disable OCR and reconcile conservatively                 |
| Expiry              | Deadline ends local ownership, not remote exposure                | TTL expires a key, not provider work                                                                     | Neither solves remote uncertainty                                              |
| Eviction/key growth | Quotas/indexed bounded scans/retention                            | No eviction of authoritative quota state; scripts/key namespaces/ACL and memory bounds                   | Cache-style eviction is unsafe for cost authority                              |
| Operations/cost     | Existing backup/TLS/roles/metrics; additive migration/grants      | New service or verified managed deployment, TLS/ACL, monitoring, backups, failover and ownership         | Verify actual service availability/cost before recommending                    |
| Migrations          | PG candidate requires approved new objects                        | Redis-only may avoid OCR SQL, but requires proved durable cost authority; hybrid usually still needs SQL | Migration requirement is decision-dependent                                    |

Official capability references rechecked 2026-11-05: [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/) and [replication](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/). RDB snapshots can lose intervening writes; AOF fsync policy changes durability/latency. Replication is asynchronous by default, and WAIT alone does not prevent every failover loss. These facts require a tested deny/reconcile policy for lost admission state, not a blanket rejection of Redis.

Recommendation: benchmark Lean PG first at the intended pilot envelope (§22). Redis becomes justified only by measured material PG contention, a verified existing deployment meeting durability/security needs, or a binding technical constraint. If PG is materially slower, investigate indexed query count, critical-section length and configured caps before selecting another service; do not hide a failed latency gate. Evaluate Redis under the same end-to-end workload and equivalent durability. No installation or infrastructure provisioning is authorized here.

Extending existing AntiAbuse with an OCR-specific scope remains a deferred alternative: its transaction-aware pattern is useful, but fixed 900s windows and separate leases/budgets mean it is not a drop-in simplification. Provider quotas/WAF remain defense in depth and cannot replace tenant/identity admission.

## 12. Atomic Admission / Authorization Ordering

### Lean A versus Lean B

| Candidate                        | Correctness / revocation boundary                                                                           | Work / failure implications                                                                                                                  | Recommendation status                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Lean A: combined A + S           | Current proof and protected admission commit together; immediate bounded provider continuation after commit | No separate dispatch-marker transaction; crash after A before HTTP is conservatively send-possible; one fewer transaction and repeated proof | Preferred for review IF U-008 accepts the bounded paid-dispatch interval and U-004 accepts ambiguity |
| Lean B: A + final dispatch B + S | Rechecks exact session/Location/Shift/policy/kill near dispatch, separate reserved-to-send marker           | Additional checkout/BEGIN/queries/COMMIT, longer latency; RESERVED before B can be proved not sent; B-to-fetch gap still exists              | Use IF U-008 requires this fresh proof or measured recovery needs justify it                         |

DEC-074 requires current authority **before provider I/O**, and current code commits authorization before its local guard/provider call. DEC-108 expressly accepts bounded pre-authorized response completion after LocationAccess revocation; it does not independently accept OCR paid dispatch, logout/role/Shift semantics or every new authorization decision. No inspected rule specifically mandates two distinct OCR pre-send transactions, but absence is not approval. U-008 must approve the combined proof and exact-session behavior, or retain a fresh B. Do not silently generalize DEC-108 or invent an absolute last-byte/remote-send fence.

### Actual existing order, not an invented canonical entity list

Current service path: active User row share lock → Location lifecycle shared advisory boundary → persisted Location lookup → Organization management-settings shared advisory boundary → membership row share lock → Organization/Location row share locks → exact LocationAccess row share lock → exported Shift helper (lifecycle boundary and joined membership/User/org/Location/access/ACTIVE Shift share locks) → effective policy read. This is more specific than saying “User, member, org, Location, Shift.”

If exact-session recheck is selected, `lockAndRecheckStaffSessionContext` first takes the Staff user-security boundary and session row update lock. Integrate it consistently with existing logout/rotation/emergency-disable and Check-In writers before acquiring OCR resources. Candidate new order after authority: shared control/account period → Organization allocation → identity serialization → attempt transition. Settlement/recovery resolves scope by a nonlocking internal lookup, then follows the same OCR order; it must never hold an OCR lock and reach backward into Staff/Shift/settings locks. Candidate row locks, advisory identity lock or guarded writes remain U-007 choices. PostgreSQL's [lock documentation](https://www.postgresql.org/docs/17/explicit-locking.html) supports these capabilities; it does not accept the design.

Deadlock analysis: Transaction A can hold authority shares while waiting for the global OCR row; invalidator B may wait for authority exclusive locks. B must not hold the OCR row then wait for A's authority share. An operator control/recovery writer must never call back into operational authorizers after taking OCR locks. Test actual role/grant/Shift/settings/session writers, not just two admission functions. Bound lock, statement, acquisition and total operation waits; timeouts/deadlocks roll back and deny without paid HTTP. Default MVP proposal has no automatic DB transaction retry; IF later approved, only definitively rolled-back pre-I/O work may be retried within a finite bound. An ambiguous COMMIT never authorizes sending/retrying.

### Authorization-before-mutation proof

| Protected mutation                  | Authenticate → resolve → operation authority                                                                                                                                                                                                                           | Protect → mutate → required history → commit                                                                                                                                                               | Retry/fallback proof                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A admission                         | Guard resolves persisted Staff; internally recheck session IF U-008 selects it; target Location derives Organization/member; prove active User/member/org/Location, exact grant, employee/supervisor role, exact eligible Shift, accepting_intake and effective policy | Retain authority boundaries; take approved OCR control/budget/identity protection; all checks before atomic debit+attempt; immutable admission fact in same transaction; known commit before usable permit | New request repeats current authority; no budget read/disclosure before proof; unknown commit sends zero                       |
| S settle/release                    | Trusted internal service capability; load persisted attempt full scope; validate random owner/epoch/state and observation provenance                                                                                                                                   | Same OCR order, guarded once-only terminal transition, retain debit; atomic required recovery/history under U-006/007; commit                                                                              | Duplicate same outcome no extra release/history; conflicting/stale owner cannot rewrite terminal state or another tenant's row |
| Recover uncertainty                 | Restricted maintenance/operator identity; persisted target scope and fixed DB-time predicates; U-004 remote proof                                                                                                                                                      | Same OCR order; fence ownership before state change; append coded reconciliation history if required; commit; never send                                                                                   | Repeat converges; caller cannot select arbitrary tenant/time or reclaim merely from UUID                                       |
| Change kill/limits/provision period | Approved U-006 operator identity, persisted exact control/Organization/account authority; no employee policy privilege                                                                                                                                                 | Serialize version/control and period boundaries; bounded typed mutation plus required append-only history atomically; commit                                                                               | Re-prove operator read/write scope; same operation replay vs stale conflicting CAS distinguished by approved contract          |
| B dispatch IF selected              | Same current request and persisted owned reservation, fresh complete authority proof                                                                                                                                                                                   | Authority then OCR order, one-use state change/history; known commit, release before HTTP                                                                                                                  | No send on lost commit, cancellation or stale permit; no automatic resend                                                      |

Tenant and role proof must precede any quota write, not use UPDATE RETURNING as the first ownership probe. Internal handle UUID alone is not authority. A runtime DB role is trusted application infrastructure; execute grants do not protect against arbitrary impersonation by a fully compromised server. Test actual scope predicates and grants without claiming impossible protection.

## 13. Distributed Quotas and Cost Accounting

IF U-002/003 approve the Lean accounting proposal, consume **one conservative integer lookup unit at A**, globally and in its Organization, before any possible HTTP. Keep that debit on MATCH, NO_MATCH, provider 429/5xx, malformed response, timeout, client cancellation, uncertainty and proven no-send after commit. Config/input/auth denial or rolled-back A consumes zero. No automatic refund, overage purchase, retry or provider call at settlement.

Five distinct facts must not be conflated:

| Measure                  | What proves it                                         |
| ------------------------ | ------------------------------------------------------ |
| Admitted unit            | Committed DB attempt and atomic global/org debit       |
| Outbound attempt         | Adapter fetch-start observation; may be lost on crash  |
| Provider processing      | Remote evidence; not inferred from local abort         |
| Potentially billable use | Conservative admitted/uncertain units                  |
| Vendor-confirmed billing | Actual account export/invoice; unverified in this task |

Keep one authoritative shared identity `organizationId + membershipId + targetLocationId`: maximum one live/uncertain owned call and exact rolling admission histories 5/10s and 20/60s. One User in two Organizations has distinct membership identities; do not collapse it to a User-global limiter. An employee Capture does not bypass these limits. Global/Organization quotas cover aggregate traffic across replicas, restarts and any enabled caller/worker; no endpoint alias or token rotation gets a new allowance.

Under U-004/007, propose a persisted last-decision time floor plus detected clock/failover anomaly denial: a backward clock step cannot manufacture fresh allowance or extend an old permit, and a forward step cannot recycle remote uncertainty. Define tolerance, detection and operator recovery before activation; test logical DB-time fixtures without changing a shared host clock. Use PG time sampled after contention and strict cutoff semantics corresponding to current `time > now-window`; no fixed-window approximation. Admission time and actual remote start are different. Lean A uses an immediate nonqueued bounded-age permit; arbitrary process pauses can move a send across a wall-clock window. U-004/008 must approve the exact admission/permit-age interpretation or select Lean B with near-dispatch windows. Even B cannot prove exact remote TCP start timing under arbitrary pauses. Do not claim strict external wall-clock rate proof from a DB timestamp alone.

Minimal new controls: platform quota, Organization allocation, explicit kill/OFF; approved small global/Organization capacity if needed to bound total provider work. Add an account-wide short rate only if verified provider limits justify it. No Location finance quota, speculative tiers, borrowing, customer billing or dashboard balances. Recommend fixed allocations with no borrowing for predictable MVP cost; exact amounts, aggregate capacities and fairness envelope remain U-002. Low-volume tenant deprivation under global saturation is a measurable residual, not a fairness guarantee.

Recommend disabled, zero allocations, no enabled period and no automatic refill until approved. Keep Company default → Location override only for the existing typed `ocrAssistEnabled` policy; cost controls are separate server-owned ceilings, not new ordinary Dashboard configuration. Missing/invalid/negative/fractional/overflow quota denies. Use checked integers/bigint handling; never JavaScript unsafe-number or floating-point money. No price is invented.

U-002/003 must bind explicit UTC half-open period bounds to verified vendor attribution/cycle. Do not assume calendar month or reset counters in place. New approved periods preserve old spent facts and outstanding remote liability; uncertain old-period processing may consume a new period and must be conservatively carried once or block period activation pending resolution. Until attribution/carry is decided, rollover stays disabled/manual, rather than silently gifting fresh capacity. Reducing a quota below spent denies future calls; increasing it requires operator authority/history. Do not encode a CHECK that prevents a safe lower cap.

Conditional exposure calculation: controlled variable cost ≤ admitted units plus separately counted cross-period liability, multiplied by a verified upper unit price, plus actual fixed fees/extras. Do not double-count liability already included in spent units. This assumes no out-of-band account calls, unaccounted provider fan-out or lost committed allowance; provider plan/taxes/overages remain unverified. Minimal MVP reconciliation is an operator comparing aggregate vendor usage with restricted app totals and recording a coded correction/evidence reference. Unexplained excess kills new sends; no automatic downward adjustment or tenant attribution from an aggregate delta.

## 14. Minimal Leases and Failure Recovery

IF U-004/007 approve the Lean model, a reservation is never transferred for another provider call. Use internal random ownership and a fenced revision/generation; terminal attempts cannot be revived. No renewal is needed for a bounded synchronous call unless evidence demonstrates it. Exact deadlines, states, owner-token representation and recovery SLO remain proposals, not accepted SQL enums.

Candidate conceptual states:

| State           | Meaning / recovery                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| Send possible   | A committed; zero or one fetch may occur. Holds identity and applicable capacity even after execution deadline       |
| Completed       | Approved definitive transport/provider-completion observation settled once; release capacity, keep debit             |
| Proven not sent | Same live owner definitively cancelled before fetch and cannot later send; release only through fenced S; keep debit |
| Unknown         | Expired owner, timeout/lost response/crash/failed settlement without remote proof; quarantine, never resend          |
| Reconciled      | Restricted guarded resolution backed by approved drain/completion evidence; preserve original admission/history      |

There is intentionally **no durable RESERVED-before-send distinction in Lean A**. A crash after A before fetch is indistinguishable from a crash after sending; treat it as send-possible/unknown. This overcounts and can block capacity. Lean B can recover definitely not-dispatched RESERVED before B more precisely, at one extra transaction. This is the central recovery/latency trade-off to approve, not a hidden omission.

HTTP status and billing certainty are orthogonal. A received 200/201 or 429/5xx may prove transport completion only if the selected provider contract makes that a safe release boundary. Timeout, abort or network failure after fetch never proves remote stop. The internal provider contract must convey a safe completion observation; public UNAVAILABLE alone is insufficient to choose release.

Minimal recovery owner: prefer a small bounded module lifecycle sweep following existing maintenance convention, callable after restart/by another API replica; select exact ownership under U-007. No broker, payload queue or new standalone worker by default. Bounded batch, scan limit, non-overlap, shared guarded updates and backlog/oldest-age metrics are required. If every API is down, recovery resumes at restart; this liveness limitation must be accepted. Recovery resolves state; it never dispatches OCR. Cleanup/archive is separate and cannot delete live/unknown exposure or erase debit history.

Strict remote single-flight and unconditional finite automatic recovery cannot both be proved against an uncooperative provider. Recommended U-004 alternative: quarantine unknown identity/capacity, notify assigned operator, disable affected scope, fence/terminate all old send-capable owners, prove provider drain/completion or an enforceable remote processing bound, then reconcile capacity with coded evidence. Target a finite **operator response** SLO under U-010; do not promise finite remote clearance without evidence. If no proof exists, keep affected OCR OFF while Manual/No Plate works. This is explicit availability loss, not an undisclosed permanent lock.

IF the owner instead accepts a finite hold without remote proof, the amendment must explicitly narrow the remote-overlap guarantee and bound potential exposure. Redis TTL does not improve that proof. No stale owner may release a successor, reset a terminal attempt or send after a recovered permit. A paused process needs local age/cancel checks and owner fencing; database fencing alone cannot retract an HTTP capability already held in memory. Recovery must fence old processes before reusing uncertain capacity.

## 15. Backend API and Native Compatibility

Keep shared `packages/contracts/src/plate-ocr.ts` and employee-client exports. Quota denial remains UNAVAILABLE, never false NO_MATCH or budget balance/reason. Preserve auth/media/authority errors instead of blanket-catching them as availability success. An outage at the new admission stage after valid authority yields safe UNAVAILABLE; an earlier auth/database failure may retain centralized error mapping.

Under the recommended U-003 fresh-attempt alternative, identical images sent again after completion are new potentially charged requests. Same-identity overlapping requests are denied while occupied; no queue, replay cache or image fingerprint. Every explicit new attempt reauthorizes and pays applicable limits. Server ownership is not an end-to-end idempotency key. IF stable client keys are selected instead, approve key scope, differing-payload handling, in-flight response, retention, replay authorization, older clients and plate-retention privacy before adding any field. That extension is deferred unless necessary; it does not create remote exactly-once.

Internal reusable downstream boundary, IF U-009 accepts it: the Check-In OCR executor receives trusted resolved Staff context, persisted/revalidated Location scope and valid media; atomically returns deny or an opaque one-use owned permit with known-commit semantics. The provider adapter consumes that permit once outside DB ownership, returns public neutral data plus a private bounded dispatch/completion observation for S. Management consumes only safe readiness/capability, never provider credentials, handles, quotas or balances; it does not call the OCR HTTP endpoint internally. This boundary owns no Vehicle, Task, identity confirmation or tenant policy administration.

Exact internal signatures and readiness status selection remain U-009. The present adapter supports none of these observations unchanged; do not parse logs as authoritative settlement. Preserve the provider parser, country hints and one-fetch implementation. Any caller AbortSignal extension is private and best effort. `resolvePlateOcrConfig` can supply config readiness without a paid health call; configured syntax never proves health. Preserve DEC-087 safe status vocabulary (including UNKNOWN for unverified health), no new Dashboard fields/screen.

Backend A can be delivered disabled independently of Native B. Old clients may still perform their historical bounded automatic cycle; server caps must be safe even then. Manual-only client behavior is guaranteed only for the new Native artifact. If reduced lookup demand is required to meet the chosen launch budget, rollout must restrict launch to the qualified client population before activation; do not assume all installed clients updated. Native B can use today's development/test API or return UNAVAILABLE in production until A is approved and activated.

## 16. Manual Capture State Machine

Desired product behavior is locked by OD-05/06; the following minimal integration is the proposed Native implementation envelope, with presentation/placement acceptance under U-012. These are conceptual states, not new public domain enums.

| State/event                                         | Required action                                                                                                           | Next state / external request count                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Enter Scan Plate                                    | Existing focus/open, permission, picture-size selection, mount and ROI metadata validation                                | Starting → ready preview; zero pictures, zero OCR requests                        |
| Final readiness or foreground/theme rerender        | Show existing preview/guide; wait for employee                                                                            | Ready; zero capture/OCR, even after arbitrary timer advancement                   |
| Capture before ready, during remount or invalid ROI | Disabled button plus synchronous controller guard                                                                         | No operation, zero requests                                                       |
| Valid explicit Capture                              | Atomically claim one local operation before awaiting; pin generation/mount/ROI/current scope                              | Capture/encode/upload busy; at most one OCR POST                                  |
| Double/rapid press while active                     | Reject at controller/operation boundary, not only React disabled state                                                    | No overlap, no queued tap/frame                                                   |
| Hardware picture-size fallback                      | At most the existing one local fallback remount/capture on typed CameraCaptureFailure, within the same explicit operation | Still at most one OCR POST; fallback readiness must never start another operation |
| Compression fallback                                | Existing two bounded encodes of the same cropped image, no fresh image or HTTP retry                                      | One validated JPEG or zero requests                                               |
| MATCH after cleanup and current-generation check    | Retire operation/camera; populate editable draft and review                                                               | Existing Confirm Plate; `confirmIdentity()` untouched                             |
| NO_MATCH                                            | Finish and clean once; no timer or next operation                                                                         | Existing no-match presentation, explicit retry/open then Capture required         |
| UNAVAILABLE/capture/crop/upload/cleanup failure     | Existing safe unavailable/error presentation and fallback                                                                 | No automatic restart or resend; explicit retry/open then Capture                  |
| Manual/No Plate/Close/Back/scope exit               | Invalidate generation, abort best effort, cleanup; existing transition                                                    | Late data cannot populate draft/review or restart camera                          |

Recommend preserving the **existing terminal no-match/unavailable close-and-reopen presentation**: current controller closes after finish, and failure UI already offers Retry. Under the new flow that Retry only opens the camera; it never captures. Employee must press Capture once preview is ready. This preserves existing error hierarchy and camera disposal but costs an extra reopen action after failure. Keeping preview open with Capture immediately available would reduce taps but changes current failure/mount lifecycle and requires new status semantics; defer that alternative unless owner review selects it under U-012. Neither alternative may auto-read.

Remove the loop's scheduling responsibility and five-attempt logic in future code; retain one-operation ownership, abort, cleanup and result fences. Do not emulate manual capture by starting a timer and changing its maximum to one. A direct explicit operation may still use bounded **deadlines** to cancel work, never a timer to initiate a picture/provider request. A second valid employee press after a completed operation creates a fresh bounded attempt subject to backend admission. A stale render, permission return or remount cannot create an operation.

Busy remains owned through capture, any local fallback, upload/response and cleanup. Never release the local slot on cancellation until an uncooperative previous operation is safely retired; fallback remains usable. Preserve the distinction between logical one Capture action and a narrowly bounded local hardware retry: it may take a second physical still after a pre-upload hardware failure, but cannot perform two external OCR requests. If that fallback cannot retain original safety/cleanup, fail locally and require another explicit press instead of introducing automatic scanning.

## 17. Capture Button Visual Freeze Contract

Only one additive existing-design-system control is allowed. Recommend, subject to U-012 visual footprint review, `CheckInButton` primary/default large immediately **after existing preview guidance and before Manual Entry** in the existing action stack. Render in the opened scanner shell, disabled during permission/starting/remount/not-ready states and busy during the owned capture operation. Keep failure Retry and Settings in their existing conditional order; do not add another Retry control. No custom shutter/icon, floating overlay, bottom toolbar or new modal.

Current ready order: 260px viewport (ROI + Torch) → preview status → Manual secondary → No Plate ghost → Close ghost. Proposed ready order adds only Capture primary between status and Manual. Failed states retain existing message/Retry/manual/settings/no-plate/close order; the proposed Capture control, if retained in that shell, is disabled until preview is ready. A single control instance must not be duplicated in multiple branches.

There is **no reserved empty slot**. In the ready state, a 56px button plus the existing 16px parent gap adds approximately **72px** of stack footprint; content below moves and may require more scrolling. This estimate is mechanically derived from existing tokens, not screenshot proof. The viewport, ROI and Torch positions need not change, but reachability of Manual/No Plate on small displays can be materially affected. U-012 requires owner acceptance of this precise additive footprint after screenshots; if unacceptable, stop layout implementation and propose the smallest owner-reviewed alternative. Do not shrink controls/viewport, alter spacing tokens, or overlap ROI to conceal displacement.

Reuse unchanged height/radius/type/theme/press/accessibility rules from §6. `busy` disables Pressable and uses existing ActivityIndicator; also gate synchronously in the controller. No new stylesheet should be needed for stack insertion. Do not restyle manual/no-plate, change header/navigation/cards, add decorative icon, or copy condition-photo camera UI. Preserve focus/read order and accessibility label from the localized text. Any additional UI request requires separate owner authorization.

Visual acceptance: before/after matched state screenshots on the same device/build dimensions for EN/AR × Light/Dark; ready, busy, denied, no-match/unavailable and MATCH review; compare viewport 260px, ROI frame mapping, Torch coordinates, header, colors, font/radii and control variants. Inspect small screen, large accessibility text, keyboard/manual path and scrolling reachability. Expected delta is only Capture footprint/busy content and necessary truthful copy. Never regenerate frozen baselines to hide a redesign; do not claim pixel-perfect parity from unit/source checks.

## 18. Light/Dark and Arabic/English Requirements

Use `native-dictionary-en-check-in.ts`, `native-dictionary-ar-check-in.ts`, their existing dictionary composition and `getNativePlateCameraCopy`. `NativeEmployeeDictionary` maps the English keys and requires Arabic parity. Add one Capture label key through that convention, not hard-coded JSX or an unrelated dictionary system. Proposed copy: English **Capture Plate**, Arabic **تصوير اللوحة**. These are review copy, not a frozen new contract.

Both dictionaries currently describe automatic preview reading; replace only that misleading guidance with positioning + press-Capture guidance in the same CheckInStatus style. Proposed ready copy: “Position the plate in the frame, then press Capture Plate.” / “ضع اللوحة داخل الإطار ثم اضغط تصوير اللوحة.” Use a short truthful busy message only if necessary within the existing status presentation; no new explanatory card/modal.

Preserve existing text alignment and human RTL/LTR helpers; plate identifiers remain LTR under Arabic, as does ROI coordinate geometry. Button label stays the current centered EmployeeButton convention. Theme changes must not remount/reopen the camera, reset ownership or trigger capture. Light/Dark use existing palettes; no palette, typography, icon, shadow or token modification is authorized. Verify label fit and screen-reader busy/disabled announcements in both languages with actual visual/device evidence.

## 19. Camera Lifecycle / ROI / Privacy

Preserve `bindNativePlateCameraLifecycle` and its reused QR auth/AppState fences. It pins initial phase/identity generation/Location and permanently retires invalidated workflows. Preserve the permission-dialog special handling; returning from an OS permission prompt is not a Capture action. Foreground after background may require existing explicit reopen, and still requires Capture.

| Invalidation/failure boundary                                             | Required retained behavior                                                                                        |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Close, Back, Manual, No Plate, navigation/unmount                         | Camera closes, Torch off, generation invalid; late result cannot change Check-In                                  |
| Workflow phase, Location, identity/auth generation, logout/account switch | Retire old operation and scope; no new recognition or stale draft/review                                          |
| Background/inactive during capture/upload                                 | Abort best effort and cleanup; foreground never resurrects old operation or starts timed capture                  |
| Camera replacement, picture-size remount, ROI layout/revision change      | Pin mount/ref/metadata ownership; disable Capture until current geometry validated; no old ready callback capture |
| Missing/oversize/invalid image, crop/metadata error                       | Zero HTTP when invalid before upload; existing truthful failure/fallback                                          |
| Late native render/save or provider response                              | Own late-created files and delete; ignore stale result, never restart/confirm/recognize                           |
| Cleanup failure                                                           | Bounded safe failure/diagnostic, no new capture/provider retry; no sensitive URI logging                          |

Keep the existing capture pipeline: rear muted nonmirrored CameraView → validated generation/mount/revision/preview metadata → ROI mapping/crop → source deletion → render/encode existing 0.6 then 0.45 fallback if oversized → ≤1 MiB validated cropped JPEG only → API → delete handed-off JPEG in finally/cancel. Source quality remains 1, target selection 1280×720 with existing 1024×576 lower candidate; these are current source facts, not authorization to tune accuracy or geometry. Preserve native metadata/rotation patches and adapter boundaries. No gallery/media history, object storage, persistent image/digest or condition-photo record is introduced.

Keep no queued frames, local fallback bounds and cleanup ownership across generations. Torch remains usable in current preview under existing generation/mount proof; do not change its 48px appearance or treat requested enabled as proof the physical lamp activated. Human Confirm remains separate from every acquisition stage. Manual/No Plate must remain responsive during provider failure and uncertainty; no global busy overlay may trap them.

Native temporary deletion and API buffer zeroing reduce retention but cannot prove immediate erasure of every HTTP/runtime copy. Provider privacy is separate (§21), and physical tests must verify the actual cleanup/lifecycle behavior.

## 20. Proposed DEC-074 Amendment — NOT ACCEPTED / NOT EDITED

The latest owner request establishes the new manual product direction. The repository focused decision and canonical log still prescribe automatic acquisition; future authorized docs synchronization must remove those contradictions before changing code/tests. Do not mark this proposal Accepted or modify the actual DEC/log in this task.

Proposed focused replacement text:

> **§4 Required Native flow:** New Vehicle → Scan Plate → rear camera preview ready → employee positions plate → employee presses Capture → one bounded camera/ROI/OCR operation → MATCH enters existing editable Confirm Plate → explicit human Confirm only → existing exact returning recognition and Check-In. NO_MATCH/UNAVAILABLE require another deliberate Capture after existing retry/open recovery, or permanent Manual Plate/No Plate. Opening/readiness never captures or invokes OCR. One existing-style Capture control is required under the owner visual freeze.
>
> **§6 Explicit attempt policy (replaces automatic policy):** only an explicit employee Capture initiates acquisition. One press permits at most one OCR HTTP attempt and may yield zero if preflight/capture fails. Remove the approximately 1.2-second start/retry timer and five-attempt automatic generation. Retain single-flight across generations, no queued frames, bounded deadlines and existing narrowly bounded local hardware/compression fallback only when it cannot add an external OCR attempt. No automatic retry after NO_MATCH, UNAVAILABLE, timeout or failure.
>
> **§7 Generation/cancellation:** retain all current invalidations and stale-result fences. Camera generation/mount readiness is necessary but insufficient; a current explicit operation owner is required. Permission return, reopen/retry, foreground, geometry remount or theme change cannot start OCR. Cancel/close must cleanup current and late-created files; stale results cannot update draft/review, confirm identity, restart camera or run returning recognition.
>
> **§19 Required proof:** replace ready-triggered/five-attempt assertions with readiness plus indefinite timer advancement yielding zero capture/HTTP; one press yielding one bounded operation/at most one POST; double-tap/remount fencing; NO_MATCH/UNAVAILABLE requiring a new explicit action; MATCH review without confirmIdentity; preserve manual/no-plate, ROI/Torch/cleanup/auth and EN/AR/Light/Dark evidence. Physical proof requires deliberate Capture, Edit/Confirm, failure/retry and cleanup with frozen-design screenshots.

Production admission addition, conditional on the accepted U-decisions:

> **§13/§18/§22.3/§22.5 narrow production exception:** Issue #429 may introduce only focused shared OCR quota/control/owned-attempt state and reviewed forward migrations/grants sufficient for the approved architecture. Production remains OFF until authorization, shared global/Organization/identity limits, fail-closed store behavior, conservative uncertainty/recovery and release gates are proven. Preserve server-derived identity, one concurrent call and 5/10s + 20/60s. Never automatically resend potentially billable HTTP or refund uncertain consumption. Preserve provider-neutral responses and permanent manual/human workflows. This is no authorization for OCR images/history, generic queues/outboxes/limiter or billing platforms. Actual values, exact session/dispatch interval and remote recovery follow recorded decisions; activation remains separately approved.

Also synchronize §1 automatic-acquisition context, §5 still-sample initiation, §16 automatic-reading wording, §20 capability description, §22.2 Native-five-attempt reference, any physical “automatic-read” proof language and canonical DEC-074 log summary. Preserve original historical context as history where useful, never a second active automatic requirement. Shared auth/guest/handoff/photo scopes, Human Confirm, provider-neutral adapter, no image persistence and QR behavior remain unchanged.

No formal DEC-108 change is assumed. IF U-008 cannot fit existing contracts, record a narrow OCR-specific authority decision instead of silently reinterpreting LocationAccess response semantics.

## 21. Security and Tenant Isolation

Preserve all current authentication, active User/member/Organization/Location, explicit LocationAccess, operational-role, accepting-intake, active exact-Location Shift and effective-policy checks before paid cost. No client-selected tenant/member/role/account/budget scope. ORG_ADMIN and LOCATION_MANAGER do not inherit operational OCR rights. Manual paths retain their own existing guards; do not add an OCR Shift/budget precondition to unrelated manual commands.

| Attack/risk                                               | Required future negative proof                                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Foreign Location/member/Organization submitted            | Strict schema plus persisted scope proof; two distinct authenticated tenants; no budget mutation or provider receive                  |
| Spend/read another Organization allocation                | Composite FK/exact tenant predicates, scoped internal handles, no employee budget endpoint/projection                                 |
| Guess attempt UUID or stale token                         | Internal random owned capability plus full persisted scope/state/revision; stale/foreign release cannot mutate                        |
| Revoke/disable/logout/Shift end/settings write during A/B | Genuine concurrent writer tests; proof retained through admission, accepted bounded continuation only                                 |
| Retry/cancel/restart to reset cost                        | Shared committed debit/uncertainty survives; no refund/replay, one fetch per owned permit                                             |
| Change tenant policy to increase paid cap                 | Company/Location OCR policy cannot administer platform allocations/kill                                                               |
| Infer tenant consumption                                  | Neutral UNAVAILABLE/no balances/reasons/Retry-After budget disclosure; shared timing/availability side channel acknowledged           |
| Weak DB grants/functions                                  | Real runtime-role direct positive/negative tests; fixed safe search_path, qualified SQL, no dynamic selectors, PUBLIC execute revoked |
| Restore stale spent counters                              | OFF after suspected lost state; fence old senders and reconcile vendor/external watermark before enabling                             |

Under recommended U-007 least privilege, private OCR tables and narrow feature-specific privileged functions enforce immutable facts/guarded changes. Separate runtime, operator and maintenance capabilities; runtime cannot enable/raise budgets, delete/truncate, alter schema or execute unrelated helpers. Inspect owners, inherited/table/column/function ACL and grant option, not only table-level checks. No fake ValetSession for audit; approve compatible minimal control/recovery history under U-006. Coded reasons and bounded evidence references are safer than unreviewed free text; even a safe key can contain pasted secrets/PII. No broad generic writer expansion.

No image, raw plate/candidate, image digest, customer identity, token/access hash, Authorization, sensitive file URI, endpoint secret, raw provider body or arbitrary error text in budget/control records, logs, metrics, traces or crash capture. MATCH candidate is allowed only in the existing transient/public candidate path. Runtime multipart copies exist; verify sinks/body-capture settings instead of claiming perfect memory erasure.

### Provider research preserved, with freshness and evidence limits

The original plan's official provider references remain useful planning sources, not verified VAYLET account facts. The [Snapshot FAQ](https://guides.platerecognizer.com/docs/snapshot/faq/) was re-opened for this revision: published subscription-anniversary reset/no rollover, Cloud hosting/retention and account request throttling are deployment concerns requiring account-specific verification. No published quota/price is adopted as VAYLET's allocation, and NO_MATCH is not assumed free.

Preserved research links: [Terms & Privacy](https://platerecognizer.com/terms-of-use-privacy-policy/), [pricing](https://platerecognizer.com/pricing/), [Snapshot API](https://guides.platerecognizer.com/docs/snapshot/api-reference/), [country codes](https://guides.platerecognizer.com/docs/tech-references/country-codes/) and [interactive Cloud reference](https://api.platerecognizer.com/v1/api-reference/). The original research reported US Cloud processing, 30-day rolling dashboard image retention, published trial/paid request limits, optional paid MMC and Middle East engine/deployment distinctions. These are **historical research observations**, not freshly verified terms/account entitlement; verify all current terms and selected deployment before external activation. Interactive schema extraction was incomplete; no usage API schema, billing-per-error rule, price, invoice, quota hard-stop/overage, country entitlement, retention exception or remote stop guarantee was verified here. An administratively closed #325 is not deployment security clearance; #213 physical evidence is not re-certified by this plan.

Preserve HTTPS-only production configuration, certificate/hostname trust, redirect:error, token validation, timeout and body cap. Endpoint is trusted operator config, not a public client URL; this is a deployment egress boundary, not a confirmed public SSRF finding. HTTPS alone does not forbid private/metadata destinations. U-005/006 must bind approved hosts/account/on-prem endpoints and egress restrictions. Future tests cover loopback/private/link-local, IPv6/mapped IPv6, redirects/chains/downgrade, TLS failures and DNS validation-to-connect rebinding; an approved on-prem private address is an explicit allowlist exception. Cloud requires explicit privacy/data-use/residency approval; on-prem adds license/hardware/auth/TLS/operations costs and still needs cost controls.

### Minimal observability and runbooks

Use existing bounded structured logs/metrics, not a new platform. Distinguish admission deny class, fetch-start, safe HTTP class (including 429), timeout/network/shape, OCR result and operation SUCCESS. Record duration stages, quota utilization summary, unknown count/oldest age, stale release and recovery backlog. No tenant/member/Location/reservation/request IDs as metric labels; request ID may remain safe bounded log correlation. No hashed high-cardinality identifiers disguised as low-cardinality metrics.

U-010 selects thresholds/recipients and proves actual ingestion. Minimum launch alerts: quota exhausted/unexpectedly unavailable, shared-store admission failure, sustained unknown exposure or recovery failure, repeated provider 429/timeouts, and OCR DB pressure affecting Check-In. Use tiny synthetic QA allocations for alert exercises, never paid probes. The original 80%/90% utilization and p95/ratio thresholds are deferred tuning proposals, not required financial-alerting infrastructure. Existing infra/monitoring README says target policy/log streams do not prove deployed Prometheus/alert ingestion.

Runbooks: exhaustion keeps Manual/No Plate and investigates totals without reset; provider/store failure stops new sends and has no retry storm; unknown exposure fences/drains before reconcile; cleanup/archive never clears uncertainty; usage anomaly kills scope and preserves evidence; re-enable needs current controls, owner and release-specific limits. Record operator response/escalation, recovery and audit evidence without credentials/images.

## 22. Performance Budget and Benchmark Design

**Unmeasured proposals:** no runtime, load or device benchmark is performed during planning. PostgreSQL vs Redis remains unmeasured end-to-end. Owner speed target is normal Check-In roughly 15–20 seconds without required photos, a KPI rather than a rejection threshold.

Measure separately: camera open/readiness; press-to-image; local hardware fallback; ROI crop/encode/cleanup; upload; initial Staff authentication; authorization/Shift/policy SQL; incremental admission; commit-to-fetch age; provider; parsing; S/response; total tap-to-candidate; full employee Check-In including positioning, retry, human Edit/Confirm and manual fallback. Removing a scheduled wait removes deliberate timer delay; it does not prove physical Check-In is faster after adding a press.

DB cost comparison baseline: current dev/test path already performs a Staff session query plus one authorization transaction. Lean A retains that transaction with quota/attempt SQL and adds S, **not two extra pre-provider transactions**. Lean B adds B and repeated proof. A one-statement autocommit S can still be a transaction; count actual protocol operations. BEGIN/function/COMMIT is at least three protocol exchanges unless explicitly pipelined; existing authorizers add several awaited statements. No unverified 9–35 round-trip estimate is retained as a design fact. Instrument exact SQL count, pool setup/acquire and per-stage waits for each implementation.

| Proposed acceptance envelope (U-010)                                                         | Why / limitation                                                                              |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Incremental admission p95 ≤50ms, p99 ≤100ms at approved pilot load                           | Keep shared admission small relative to existing auth/provider; proposal, not measured SLA    |
| Added total DB admission+settlement p95 ≤100ms, p99 ≤250ms                                   | Compare against identical baseline including new exact-session proof if selected              |
| Normal manual/complete Check-In p95 degradation ≤5%, p99 ≤10% under mixed steady load        | Protect operational paths; low-latency baseline also report absolute ms/sample uncertainty    |
| No unbounded waiter/lock queue, no provider wait under DB lease, no quota/capacity overshoot | Correctness and bounded resource acceptance override a latency-only pass                      |
| OCR network/provider/DB deadlines fit 15s Native timeout with margin                         | Existing 10s max provider leaves limited budget; independently stacking DB ceilings is unsafe |

Thresholds need owner approval with traffic/device/hardware envelope. A short mock-provider tap-to-result target such as p95 ≤2s may be evaluated only for a specified device/network/100ms mock; it is not a real vendor SLA. Report genuine provider time separately. If targets fail, reduce safe pilot load/feature enablement or revise admission; never loosen accounting/security or switch stores without evidence.

Future benchmark: verified isolated owned PostgreSQL 17, actual production-built API and mock **HTTPS** provider, synthetic images/test credentials, no commercial egress. Compare current dev/test baseline, Lean A and Lean B on same source/hardware/data/traffic with clear mode differences; compare Redis only in separately authorized equivalent-durability experiment. Capture warmup, at least three repeated steady runs, enough admitted samples for credible p99 (target ≥10,000 per aggregate variant), cooldown and seed; preserve counts when denials make sample small. Report denied and allowed distributions separately, never average fast denials into allowed latency.

Workloads: 1 and 2 independent API processes at same aggregate load, optional 4 for hot-row characterization; 2/10/50 synthetic Organizations; many employees at one Location plus low-volume tenant; load sweep 0.5/1/2/5 requests/sec and 100-request bursts under explicitly synthetic allocations; mixed normal intake/complete/auth/Guest traffic at approved baseline; 100ms/4s/10s/overdeadline provider; database contention/disconnect/restart; global final-unit contention; recovery backlog. These numbers are QA vectors, not approved production quotas.

Record p50/p95/p99, allowed/denied/failure counts, auth vs incremental SQL latency, SQL/transaction round trips, pool acquisitions/leased/waiters, lock waits/deadlocks, CPU/memory, WAL/write bytes, table/index growth, provider active/receive counts, no retry amplification and manual/Check-In latency. Use existing pool telemetry and `pg_stat_activity`/safe query plans; no production load generator. EXPLAIN representative quota/window/recovery queries with skewed histories and realistic indexes in QA.

Capacity model: mean OCR DB occupancy ≈ arrival rate × total DB-held seconds; provider concurrency ≈ admitted rate × provider seconds. Slow HTTP must increase reservations, not DB connections. Global lock service time sets a serialization ceiling; measure rather than shard away the global cap. One attempt row per lookup reduces write amplification versus the original reservation+two rate+multiple usage rows, but exact bytes/WAL and retention remain unmeasured. All workload/resource/cleanup budgets require a bounded launch envelope and operations owner.

## 23. Native Test Migration

Future authorized implementation replaces obsolete automatic-trigger expectations with manual-trigger coverage; **no test is edited/run here**. Keep security/cleanup/geometry assertions, rather than deleting inconvenient tests. Existing test source proves intended current behavior, not a new passing run.

| Existing exact test area                                                                  | Migration / retained proof                                                                                                                                             |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `native-plate-ocr-loop.test.ts`                                                           | Replace readiness+interval and five NO_MATCH retries with readiness/timer-zero, explicit one-shot, double press and explicit repeat only                               |
| `native-plate-ocr-loop-telemetry.test.ts`                                                 | One outcome per explicit operation; retain capture vs provider stage distinction, rotation-code sanitization and cleanup; no five-attempt terminal aggregation         |
| `native-plate-camera-step.test.ts`                                                        | Replace “does not require a capture button”; test one existing component, disabled/busy/ready gating; retain auto-OPEN once, 260px/muted rear viewport/manual/no-plate |
| `native-plate-camera-step-fallback.test.ts`                                               | Preserve denied/settings/error/reentry/manual/no-plate; retry/open alone yields zero capture                                                                           |
| `native-plate-camera-step-test-fixture.ts`                                                | Separate ready from explicit press; fixture must not auto-press when invoking cameraReady                                                                              |
| `native-plate-ocr-confirmation.test.tsx`                                                  | Explicit press instead of advancing 1200ms; MATCH review/Edit then human Confirm; returning lookup never before Confirm                                                |
| `native-plate-ocr-capture.test.ts`                                                        | Preserve ROI-only single upload, source deletion, local compression fallback, oversize/metadata zero-call negatives                                                    |
| `native-plate-camera-lifecycle.test.ts`                                                   | Insert explicit operation where needed; preserve auth/identity/Location/phase/background/unmount and permission-flow fencing                                           |
| `native-plate-camera-trace-ui.test.ts` and trace adapter/capture/ROI/lifecycle tests      | Correct stage sequencing for explicit trigger; never log file/image/plate/credentials or invent provider work after capture failure                                    |
| `native-appearance-camera.test.ts`                                                        | Light/Dark/EN/AR changes do not remount or initiate capture; Torch remains correct                                                                                     |
| `native-appearance-style-freeze.test.ts`                                                  | Preserve pushed style-sheet/token baseline; no baseline-capture env to mask regressions; separately assert additive control                                            |
| ROI/crop/cleanup/geometry/binding/viewport/rotation tests                                 | Keep original mapping, metadata identity, late file ownership and safe fallback bounds                                                                                 |
| `native-plate-torch.test.ts`, `native-plate-torch-control.test.ts` and localization tests | Preserve appearance, 48px touch behavior, generation/mount guard and complete dictionary keys                                                                          |

Required independent assertions (17 groups):

1. Open, permission return, final ready and repeated ready callbacks produce zero pictures/requests.
2. Advance fake timers well beyond old intervals/cycles and all pending scheduling: zero capture/HTTP without press.
3. One valid press starts one bounded operation and exactly one OCR POST when preflight succeeds; otherwise zero.
4. Two rapid/same-tick presses cannot overlap or enqueue; guard holds before await/render.
5. NO_MATCH never starts another image/HTTP; explicit new press after recovery may start one.
6. UNAVAILABLE/capture failure/timeout never restarts; explicit retry/open alone only readies preview.
7. MATCH enters existing editable Confirm Plate with correct selected country.
8. `confirmIdentity()`/returning lookup remain untouched until employee Confirm; Edit remains supported.
9. Manual Plate and No Plate remain available in every scanner/failure/busy state.
10. Stale generation/mount/ROI/auth result cannot change plate, review, recognition or Check-In.
11. Background/logout/account/scope/navigation/unmount cancels and cannot auto-resume.
12. Successful/failing/cancelled/late-created temporary files are cleaned with original ownership.
13. ROI framing/crop/rotation/preview metadata and size validation remain unchanged.
14. Existing bounded hardware/compression fallback belongs to one press and at most one POST.
15. Torch retains position, style, generation guards and cleanup behavior.
16. EN/AR × Light/Dark copy, direction and busy/disabled accessibility remain correct.
17. No design-regression/security negative test is weakened to accept unrelated changes; screenshots/device proof are separate.

## 24. Backend / Multi-Process Test Matrix

### Test matrix

All expected new state behaviors below are conditional on accepted U-decisions. For Lean A, oracle = committed attempt/debits plus independent mock-provider receive/active counts. If Lean B is chosen, also prove reserved-to-send transitions and its separate authorization boundary. No single-process spy substitutes for shared-state tests.

### Failure, retry and recovery scenarios

| ID  | Scenario                                                 | Lean candidate expectation / proof                                                                                           |
| --- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| F01 | First valid production request                           | A known commit, one HTTPS receive, S once; global/org debit one; neutral parse                                               |
| F02 | Identical retry after success                            | IF U-003 fresh attempts: new reauthorized charged request, no cached candidate; all windows apply                            |
| F03 | Concurrent identical request                             | Same identity serialization allows at most one live/uncertain attempt; loser no debit/send/queue                             |
| F04 | Conflicting bytes/country same identity                  | Still one slot; no payload-specific bypass or invented fingerprint/conflict code                                             |
| F05 | Two independent API processes                            | Same aggregate quotas/identity state; no per-process multiplication or restart reset                                         |
| F06 | Two Organizations/principals                             | Own allocation only plus shared global cap; foreign reads/writes denied                                                      |
| F07 | Last global unit raced                                   | One committed admission or none if winner rolls back; no overspend/partial debit                                             |
| F08 | Last Organization unit across Locations                  | Atomic global+org check; losers consume no partial dimension                                                                 |
| F09 | Cancel before/during A                                   | Rollback consumes none if definitive; unknown commit no HTTP, persisted state conservatively retained                        |
| F10 | Cancel after provider receives                           | Best-effort abort/stale discard; debit stays; unknown remote work not silently released                                      |
| F11 | Crash before/after reservation commit, before HTTP       | Before commit none; after Lean A commit send-possible/unknown, not automatically “never sent”                                |
| F12 | Crash after dispatch/response before S                   | Persisted exposure survives; independent recovery, no resend/refund                                                          |
| F13 | Provider timeout or network/TLS failure                  | UNAVAILABLE, debit retained after A; remote uncertainty held unless completion proved                                        |
| F14 | Provider 429                                             | Safe internal rate-limit class, public UNAVAILABLE, no retry/refund; billing unverified                                      |
| F15 | Provider config/malformed/5xx                            | Invalid config before A zero; post-A malformed/body/5xx retains debit, approved completion rule decides release              |
| F16 | DB failure at BEGIN/write/COMMIT                         | Fail closed/no local fallback; uncertain commit never permits outbound                                                       |
| F17 | DB outage during S                                       | No in-memory release or repeat HTTP; durable exposure reconciles on restore                                                  |
| F18 | Lease expiry while remote active                         | Deadline alone neither cancels nor frees capacity; no overlap via TTL                                                        |
| F19 | Stale owner release/resurrect                            | Full scope/owner/state guard; old process cannot release another/terminal attempt                                            |
| F20 | Restart/failover/restore                                 | Preserve spent/unknown; suspect lost watermark disables; reconcile before re-enable                                          |
| F21 | Period boundary/account rotation/clock jump              | No reset/implicit allocation; old liability carried once or new period blocked under U-002/003/004                           |
| F22 | Platform/org/policy kill racing dispatch                 | Block new admitted permissions under serialized control; already-authorized interval explicitly accepted; no last-byte claim |
| F23 | Revoke/logout/Shift end/user/member/org/Location disable | Full current scope/session behavior and commit-order schedule; zero send when required proof fails                           |
| F24 | Duplicate/concurrent settlement/recovery                 | One permitted terminal release/history, zero extra debit/refund/send; conflict cannot rewrite                                |
| F25 | Simultaneous first identity/period use                   | Scoped initialization cannot overwrite counters or create duplicate slots; missing period denies                             |

### Required real boundaries

| Group           | Required cases and acceptance evidence                                                                                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-PROD/CONFIG   | Production-enabled HTTPS mock only with real shared gates; production OFF default; missing/invalid controls/account/period/token/URL deny; no guard override                                                            |
| T-RATE          | One in flight; fifth/sixth at 10s and twentieth/21st at 60s; 9,999/10,000 and 59,999/60,000ms edges, uneven exact sliding history, multiple member/Location identities, clock discontinuity                             |
| T-BUDGET        | Global+org all-or-none, last unit, zero/missing quota, overflow/bigint/fractional/negative/NULL, cap lowered below spent, no guessed refund, rollover/carry counted once                                                |
| T-AUTH          | Real persisted session expiry/revocation/rotation/disabled User, inactive/PENDING member, inactive org/Location, absent grant, foreign Location, wrong/no Shift, disallowed role, intake stopped, policy false override |
| T-INPUT         | Missing/extra/query metadata, duplicate files, unsupported country, bad MIME/JPEG markers/size mismatch/over 1 MiB; no provider/debit; buffer zeroed                                                                    |
| T-PROVIDER      | 200/201 MATCH/empty NO_MATCH/low score, deterministic tie, >100 results, malformed JSON/shape/null, >64 KiB/missing body, 403/429/5xx, slow peer, DNS/socket/TLS/redirect errors; one fetch max                         |
| T-DB/PRIV       | Real forward migration empty+representative DB; scoped FK/check/partial unique and immutable fields, runtime/operator/maintenance/PUBLIC/inherited/function/column ACLs; direct NULL/foreign/stale-owner negatives      |
| T-CRASH/LEASE   | SIGKILL, constrained OOM, container loss separately from graceful stop; lost COMMIT/response, noncooperative provider, expiry/live recovery race; no replay                                                             |
| T-MULTI         | At least two actual API OS processes, shared PG, distinct principals, barrier races, burst/restart/first use; independent provider active counter/debit observer                                                        |
| T-PRIVACY/OBS   | Canary bytes/plate/customer/token/Authorization/URI/raw response absent from DB/log/trace/audit/metrics; bounded labels, truthful admit/fetch/process/billing distinctions; actual alert ingestion/delivery             |
| T-CLEANUP       | Bounded maintenance/backlog, multiple invokers converge, no unknown/recent-window/history erasure or stale-handle revival; approved archival preserves counters/history                                                 |
| T-KILL/CONTROL  | Operator scope and history, versioned no-reset limits/periods/kill, both replicas observe, in-flight exception and safe re-enable, staff cannot raise caps                                                              |
| T-COMPAT/NATIVE | Stable API union, old client failure compatibility plus new §23 manual tests/device proof; manual intake survives quota/store/provider failure                                                                          |
| T-CAPACITY      | §22 incremental and mixed Check-In benchmarks with real pool/lock/SQL/WAL telemetry and oracle correctness                                                                                                              |

### Concurrency schedules and mutation replay

Every conditional write must test first execution, identical retry, concurrent identical, conflicting concurrent and retry after success/terminal; integrity uniqueness is not a public replay policy.

| Mutation / Transaction A versus B     | Resources and unsafe interleaving                                                                  | Candidate protection / linearization / decision owner                                                                                                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A admit vs another A                  | Both read last global/org unit or empty identity before either writes                              | Existing tenant FKs/Shift index do not protect OCR spend. IF U-007 chooses ordered budget locks+identity guard, check/debit/insert under them; successful commit is admission point; Issue #429 owns                             |
| A authority proof vs invalidator B    | B revokes grant/ends Shift/disables User/member/org/Location/changes policy between read and debit | Existing exported helpers retain transaction locks only while A remains open. Combine write under those boundaries; invalidator-first means proof fails, A-first permits only accepted bounded continuation; U-008 owns interval |
| A vs operator kill/period provision B | Cached control permits after kill, or reset grants fresh allowance                                 | Candidate shared control/version order and DB-time period checks; serialize authorization grant, retain old exposure. U-002/004/006/007 own exact mechanism                                                                      |
| S vs S/recovery B                     | Both release same slot, stale B changes new/terminal state                                         | Persisted full scope+owner/revision/source-state CAS under OCR order; one committed terminal transition, exact retry converges; U-004/007                                                                                        |
| Recovery A vs live/paused sender B    | A expires row and permits new work while B still holds a send capability                           | Deadline not sufficient; quarantine and fence B+remote drain before safe release. No DB primitive proves remote stop; U-004 owns                                                                                                 |
| Control/provision A vs conflicting B  | Lost cap update, overlapping period, repeated correction/history                                   | Approved operator scope first, version/unique operation guards and atomic append history; U-006/007 choose retry identity, never infer success from unique error                                                                 |

For every contested transaction: if A commits, B rechecks the committed predicate; if A rolls back, B may proceed only if all current checks pass; if A's caller loses COMMIT outcome, it sends zero and must not guess rollback. A deadlock/lock-timeout loser rolls back and returns current safe mapping. Unknown S retries use the same internal attempt/observation identity and cannot double release. Operator/control replay identity and exact conflict outcomes remain conditional, not invented HTTP codes. Raw PG SQLSTATE/driver semantics apply, not Prisma Client P-codes on raw SQL paths.

Use repository owned-target preflight and harness manifests for all future DB tests. New tests/fixtures ≤300 lines each; register classified suites rather than bypass safety checks. Focused tests first, then required architecture, lint, typecheck, test and build gates, real migration/privilege/production path, and actual observed remote CI. No destructive benchmark, migration command or real provider call is run during planning.

## 25. File-by-File Change Map

### Files expected to change

**DEFINITELY RELEVANT** means source proves the area must be reviewed/updated or its no-change conclusion verified, not that every listed file must change. Exact new file names/signatures and SQL artifacts remain **CONDITIONAL ON DECISION**. **NOT JUSTIFIED YET** areas are excluded.

| Current exact path / family                                                                                                                                                                                                               | Future change and reason                                                                                 | Classification / dependency                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/check-in-api/plate-ocr.service.ts`                                                                                                                                                                                  | Thin orchestration consumes approved A/one-provider/S; preserve validation/neutral response              | DEFINITELY RELEVANT; U-001/008/009                                                          |
| `plate-ocr-cost-guard.ts`, `check-in.module.ts` in same directory                                                                                                                                                                         | Replace sole memory authority/wire shared owner without NODE_ENV bypass or duplicate pool                | DEFINITELY RELEVANT; U-001/009                                                              |
| `plate-ocr-auth.guard.ts`, `plate-ocr.controller.ts`                                                                                                                                                                                      | Keep auth-before-upload/buffer cleanup; internal exact session/signal IF chosen                          | DEFINITELY RELEVANT review; U-008/009                                                       |
| `plate-ocr-config.ts`, `plate-ocr-provider.ts`, `plate-recognizer-snapshot.provider.ts`, `plate-ocr-boundary-diagnostics.ts`                                                                                                              | Preserve parser/config, add only safe private readiness/completion/diagnostics IF accepted               | DEFINITELY RELEVANT; U-009                                                                  |
| `check-in-location-authorization.ts`, `../shifts/shift-operational-eligibility.ts`, `../auth/staff-session-revalidation.ts`                                                                                                               | Reuse exported transaction helpers; verify writer order, avoid unrelated refactor                        | DEFINITELY RELEVANT review; U-008                                                           |
| `apps/api/src/modules/management/management-integrations-status.ts`                                                                                                                                                                       | Replace independent production inference with truthful safe capability, no probe/UI                      | DEFINITELY RELEVANT; U-009/DEC-087                                                          |
| `apps/api/src/modules/check-in-api/plate-ocr-admission/`                                                                                                                                                                                  | Focused executor, SQL/window/ownership policy and small maintenance/metrics only as needed               | CONDITIONAL ON DECISION U-001/004/007/009; no default separate dispatch module under Lean A |
| `packages/database/prisma/schema.prisma`, new `migrations/<approved-id>/migration.sql`                                                                                                                                                    | Approved minimal objects, integrity/functions/revokes; new IDs only at implementation                    | CONDITIONAL ON DECISION U-001/007; PG candidate requires forward migration                  |
| `packages/database/scripts/runtime-table-privileges.mjs`, `verify-runtime-table-privileges.mjs`, focused new OCR privilege module                                                                                                         | Narrow composition/grant verification; parent is 293 lines, extract before growth                        | CONDITIONAL ON DECISION U-007                                                               |
| `apps/api/test/plate-ocr-cost-guard.test.ts`, `plate-ocr-http.integration.test.ts`, `plate-ocr-http-context.ts`                                                                                                                           | Real shared DI/production positive and preserved denial tests                                            | DEFINITELY RELEVANT; U-001/008/009/011                                                      |
| `apps/api/test/plate-ocr-provider.test.ts`, `plate-ocr-provider-diagnostics.test.ts`, `plate-ocr-boundary-diagnostics.integration.test.ts`                                                                                                | Preserve one-fetch/privacy, add safe observation tests                                                   | DEFINITELY RELEVANT; U-009                                                                  |
| Focused new API/DB race/ACL/production-QA tests and `apps/api/tools/` harness files                                                                                                                                                       | F01–F25, real HTTPS/PG/process barriers and §22 metrics                                                  | CONDITIONAL ON DECISION U-007/010; avoid giant fixtures; harness registration mandatory     |
| `apps/valet-native/src/check-in/native-plate-camera-controller.ts`                                                                                                                                                                        | Ready only readies; expose explicit guarded operation/busy; preserve size fallback/Torch/generation      | DEFINITELY RELEVANT; 294 lines today, scoped extraction before meaningful growth            |
| `native-plate-ocr-loop.ts` in same Native directory                                                                                                                                                                                       | Remove initiating timers/five-cycle retry; retain one-shot ownership/cancel/cleanup                      | DEFINITELY RELEVANT; OD-05/06                                                               |
| `native-plate-camera-step.tsx`, `native-plate-camera-copy.ts`                                                                                                                                                                             | Single reused Capture, disabled/busy and truthful localized guidance; no stylesheet redesign             | DEFINITELY RELEVANT; U-012 footprint                                                        |
| `native-check-in-capture-step.tsx`, `native-plate-ocr-adapter.ts`, `native-plate-ocr-client.ts`                                                                                                                                           | Review Confirm/manual and one POST; minimal binding changes only                                         | DEFINITELY RELEVANT review; public schema unchanged under U-003 fresh attempt               |
| `native-plate-camera-lifecycle.ts`, `native-plate-roi-binding.ts`, `native-plate-roi-viewport.tsx`, `native-plate-roi-capture.ts`, `native-plate-roi-crop-adapter.ts`, `native-plate-capture-policy.ts`, `native-plate-torch-control.tsx` | Retain mechanics/geometry/cleanup; change only trigger integration if necessary                          | DEFINITELY RELEVANT review; no ROI/Torch/native-patch redesign                              |
| `apps/valet-native/src/i18n/native-dictionary-en-check-in.ts`, `native-dictionary-ar-check-in.ts`, `native-employee-dictionary.ts`                                                                                                        | Add Capture label through current mirrored keys; replace automatic preview guidance                      | DEFINITELY RELEVANT; copy review only                                                       |
| `native-check-in-primitives.tsx`, `native-check-in-styles.ts`, `apps/valet-native/src/employee-ui/employee-controls.tsx`, `employee-tokens.ts`, `employee-typography.ts`, `src/appearance/employee-palette.ts`                            | Reuse unchanged design system; no token/style changes intended                                           | DEFINITELY RELEVANT reference; freeze                                                       |
| `apps/valet-native/test/` exact §23 inventory                                                                                                                                                                                             | Replace only automatic assumptions; preserve negatives/styles; new press fixtures/visual/device evidence | DEFINITELY RELEVANT; owner manual direction + future DEC sync                               |
| `packages/contracts/src/plate-ocr.ts`, exports/employee-client                                                                                                                                                                            | Expected unchanged under recommended fresh attempts; keyed alternative requires explicit compatibility   | CONDITIONAL ON DECISION U-003; no casual field addition                                     |
| `docs/decisions/DEC-074_NATIVE_ASSISTIVE_PLATE_OCR_ANPR.md`, `docs/08_DECISIONS_LOG.md`                                                                                                                                                   | Future narrow amendment/mirror before code                                                               | DEFINITELY RELEVANT future docs; U-011; unchanged now                                       |
| `docs/03_DATABASE_SCHEMA.md`, security/traceability, future validation/runbook Markdown                                                                                                                                                   | Approved persistence/authority/test/release mapping; no production certification                         | CONDITIONAL ON DECISION U-007/010/011                                                       |
| `.env.example`, `apps/api/README.md`, `infra/monitoring/README.md`                                                                                                                                                                        | Future nonsecret approved defaults/controls/runbooks; actual environments untouched                      | CONDITIONAL ON DECISION U-006/010                                                           |

Near-ceiling current files rechecked: controller 294, Native adapter 258, Plate camera step 225, ROI capture 230, CheckIn primitives 248, EmployeeButton controls 197, runtime privilege parent 293, OCR service 98 lines. Extract controller operation/ownership responsibility into one focused helper if needed; do not split unrelated code or compress lines. Each new authored file ≤300 physical lines; legacy oversized files cannot grow. Common→feature dependency inversion, extra singleton pools and generic helper dumping grounds remain prohibited.

NOT JUSTIFIED YET: Redis client/manifests absent a decision/evidence, standalone OCR worker, dispatch executor under Lean A, generic financial ledger/importer, new Management budget API/UI, Native screens/modals/custom shutter, generic custody audit expansion. Current planning delta is only this Markdown file.

## 26. Two-Workstream Implementation Plan

### Proposed implementation plan

This is a **decision-dependent implementation envelope**, not authorization to code. Use separate backend A and Native B implementation branches/reviews after U-011, not additional planning branches. Recommend separate linked Native issue under U-012 because #429's existing acceptance is backend production admission. Share contract/decision synchronization and integration evidence; do not make one large unrelated PR. No branch/issue/PR is created by this plan.

### Phase 0 — Decisions and scope synchronization (A + B)

- **Goal/dependencies:** resolve implementation-critical U-items, record owner dispositions, prepare §20 focused DEC/log synchronization; confirm current main/issue before code.
- **Files/scope:** future decision/log/schema/security/traceability planning docs, not runtime; establish separately owned slices and review boundaries.
- **Security/functional impact:** lock exact-session/dispatch/uncertainty and permanent manual/human behavior without redefining unrelated authority.
- **Performance:** select two-transaction candidate for evidence or retain B if required; approve measurable latency/load envelope, not an assumed winner.
- **Tests:** documentary classification, conflict/mirror and file/test inventory review.
- **Acceptance/blockers:** every critical U-item has owner/evidence/disposition; missing account/privacy can block activation separately but cannot be guessed for dependent code.
- **Rollback:** withdraw unaccepted proposals; no runtime effect.

### Phase 1 — Lean shared admission (A)

- **Goal/dependencies:** IF U-001/002/003/006/007/008 choose Lean PG after Phase 0, implement minimum atomic authority+quota+attempt boundary, disabled by default.
- **Files/scope:** §25 backend executor/SQL/grants and required schema docs/new migration; one coordinated migration owner; no historical migration changes.
- **Security/functional impact:** current proof before all writes; same-tenant constraints, minimal restricted functions, typed OFF/zero, public result unchanged.
- **Performance:** reuse existing transaction/pool; indexed bounded windows and short global critical section; instrument added statements.
- **Tests:** empty/representative versioned migration and real restricted-role integrity/ACL; T-RATE/BUDGET/AUTH/DB, F03–F08/F25.
- **Acceptance/blockers:** all dimensions commit or roll back together; no over-admit across genuine transactions; no schema/privilege decision left implicit.
- **Rollback:** unused additive objects retained, old production guard still denies; no destructive down migration.

### Phase 2 — Minimal recovery and budgets (A)

- **Goal/dependencies:** Phase 1 and approved U-004/007; implement guarded S, unknown classification, period/exposure handling and small bounded restart recovery.
- **Files/scope:** focused ownership/settlement/maintenance and operator-control history only as approved; no queues/billing importer/worker by default.
- **Security/functional impact:** stale/foreign owner cannot release; debit remains; manual fallback keeps working under quarantine.
- **Performance:** one S per completed call, bounded indexed batch maintenance; no polling unbounded attempt history.
- **Tests:** F09–F24, late/stale/concurrent terminal transitions, DB disconnect/unknown COMMIT, SIGKILL versus graceful stop, noncooperative peer and clock/rollover fixtures.
- **Acceptance/blockers:** usable documented drain/reconcile procedure and approved liveness limitation/SLO; no TTL refund/resend or silent indefinite lock.
- **Rollback:** shared OFF and preserved exposure; retain compatible reconciliation while old sends drain.

### Phase 3 — Backend production integration (A)

- **Goal/dependencies:** Phases 1/2 plus U-009; replace unconditional production denial only behind real shared gates.
- **Files/scope:** thin OCR service/module/guard/provider observation/readiness and Management safe projection; preserve provider/parser and public API.
- **Security/functional impact:** known A (and B IF chosen) commit before one provider call; config invalid or admission unavailable never sends; no provider health probe.
- **Performance:** no DB connection over HTTP; bounded exact-session cost included in instrumentation; no repeated final transaction without accepted reason.
- **Tests:** production HTTPS-mock positive and all existing input/authority/policy negatives, safe observation/no-retry/diagnostics and DI path.
- **Acceptance/blockers:** actual production artifact reaches mock only when enabled/quota available; deployment/real activation still OFF.
- **Rollback:** wire old fail-closed policy, keep additive data and reconciliation; no memory fallback.

### Phase 4 — Native manual Capture (B)

- **Goal/dependencies:** manual product decision recorded via Phase 0; accepted minimal footprint U-012; can proceed independently against mock/dev API.
- **Files/scope:** controller/one-shot operation, Plate camera step/copy, mirrored EN/AR dictionaries and test fixtures; one reused button only.
- **Security/functional impact:** explicit press is necessary, one operation/max one POST; preserve auth/scope/generation, ROI/cleanup, Torch, Confirm/manual/no-plate.
- **Performance:** remove intentional capture scheduling; immediate press action, no capture on remount; maintain local single-flight through cleanup.
- **Tests:** §23 17 groups and frozen styles; no weakened negative assertions or baseline reset; require zero timer-triggered captures.
- **Acceptance/blockers:** test one press versus readiness distinctly; 294-line controller extraction if needed; screenshot placement acceptance before final UI approval.
- **Rollback:** stop rollout/revert Native artifact independently; OCR can remain disabled/manual. Historical client rollback may restore old automatic behavior, so never claim manual-only fleet afterward; server still caps all traffic.

### Phase 5 — Focused security and lifecycle tests (A + B, separate ownership)

- **Goal/dependencies:** selected implementation slices exist; adversarial review of actual boundaries.
- **Files/scope:** focused tests/harness manifests and evidence, no unrelated refactor; §23/24 plus control/transport/privacy tests.
- **Security/functional impact:** two-principal tenant/Location negatives; exact-session/invalidation races; human-confirm and late-file cleanup; immutable history/ownership.
- **Performance:** check cancellation does not leak DB leases or create hidden retries; no global UI busy trap.
- **Tests:** auth/input/TLS/SSRF deployment boundary, direct SQL NULL/ACL, F01–F25 and Native capture/cancel/fallback matrix.
- **Acceptance/blockers:** no paid/tenant bypass, no semantic decision drift, no unhandled uncertain transition; all failures block release.
- **Rollback:** production stays OFF; return only authorized fixes to owning slice.

### Phase 6 — Multi-instance and performance validation (A + integration)

- **Goal/dependencies:** Phase 5 and approved U-010 workload; actual two-process PG/HTTPS-mock aggregate proof and §22 incremental comparison.
- **Files/scope:** safe owned QA harness/barriers/metrics and redacted report; no shared/production benchmark target.
- **Security/functional impact:** caps hold across processes/restarts/cancels/rollovers; old clients cannot multiply quota; manual intake unaffected.
- **Performance:** measure allowed vs denied p50/p95/p99, SQL/locks/pool/WAL/Check-In degradation; evaluate Redis only if separately justified/authorized.
- **Tests:** global hot-row bursts, many employees/Organizations, slow peer/store outage/backlog, mixed normal operations and hard crash.
- **Acceptance/blockers:** approved latency/resource envelope and zero overshoot; no fabricated throughput/p99 from inadequate sample; record rejected alternatives fairly.
- **Rollback:** terminate only owned QA resources; reduce/disable candidate activation if evidence fails.

### Phase 7 — Visual and physical-device QA (B + integration)

- **Goal/dependencies:** Native slice, §17 placement candidate and Phase 5; exact qualified artifact/device and mock endpoint.
- **Files/scope:** validation screenshots/device records only, no new camera layouts or baseline overwrite.
- **Security/functional impact:** manual Capture, failure/retry, human Edit/Confirm, Manual/No Plate during outage, lifecycle/Torch/privacy on device.
- **Performance:** time readiness, positioning/press/ROI/tap-to-candidate/full Check-In; prove fallback controls remain reachable under 72px addition.
- **Tests:** EN/AR × Light/Dark before/after, ready/busy/failure/Confirm, small display/text scale, permission/background/logout/unmount/late result; Android physical proof, portable iOS smoke per existing policy.
- **Acceptance/blockers:** only allowed additive delta/truthful copy, unchanged ROI/Torch/header/tokens; no pixel parity or real-Android claim without evidence. Real commercial calls require separate controlled authorization, not this mock QA.
- **Rollback:** halt Native distribution; retain manual path or disable OCR; restore prior artifact only acknowledging automatic behavior.

### Phase 8 — Independent review and release readiness (A + B separately)

- **Goal/dependencies:** all applicable prior gates, actual repository CI and owner release decisions.
- **Files/scope:** evidence ledger/runbook/qualification record; review schema/grants/cost separately from frozen UI; no self-merge.
- **Security/functional impact:** verify production-mode mock path, controls, remote uncertainty, account/privacy prerequisites, mixed-version compatibility and restore/drain.
- **Performance:** approved pilot cap and alert/response envelope backed by measurements; no infrastructure assumption.
- **Tests:** §27 QA, §28 gates, rollback/restore rehearsal, actual observed remote CI and independent human/security review.
- **Acceptance/blockers:** implementation completion differs from production readiness; explicit release/environment/limits/owner required for activation.
- **Rollback:** shared kill → fence/drain → preserve counters/history → compatible fail-closed app rollback; no data reset or schema down migration.

## 27. Production-Mode QA

Future QA must prove genuine production admission, not a replaced guard/provider service or development NODE_ENV:

1. Verify owned isolated disposable QA PG17 target through repository harness admission; no reused unknown database/container. Apply real forward migrations on empty and representative fixtures. Use restricted runtime TLS credentials, separate migration/operator/maintenance credentials and owned volumes.
2. Build actual production API, run two independent OS processes with NODE_ENV=production and finite validated pools/deadlines. Check real process health/dependencies/logs; Docker build/config presence alone is insufficient.
3. Use an owned mock **HTTPS** provider with synthetic JPEGs/test secrets, trusted test CA through normal trust path; never disable certificate verification. Network egress must make commercial recognition unreachable. Mock stores counters/timings/active-work only, no sensitive real images/plates.
4. Defaults OFF/missing allocation/kill produce neutral UNAVAILABLE and zero mock receives. Provision tiny approved QA-only periods/limits through the real selected control path.
5. Persist real fixture Staff/LocationAccess/Shift/policy. Valid request reaches exactly one mock 200/201 MATCH/NO_MATCH; immutable debit and S agree with independent oracle. Invalid auth/input/config/policy/quota/storage cases produce zero sends and no unauthorized mutation.
6. F01–F25 races, disconnects, unknown COMMIT, hard crashes, restart/expiry/slow noncooperative provider and recovery are induced. Graceful shutdown results are recorded separately.
7. Run new Native artifact against QA: open/ready/timers zero calls; explicit Capture at most one; human Confirm/manual/no-plate; camera cleanup/visual suite. Old client behavior tested separately for server cap compatibility.
8. Capture immutable build SHA, PG/schema/runtime role, trust/mode/control shape, fixture/process ownership, barrier timestamps, provider counts, performance distributions and sanitized logs. No secrets in report. Tear down only verified owned QA resources.

These are planned requirements, not tests run here. Physical commercial-provider accuracy/country support requires a separately authorized controlled check if needed for activation; mock tests do not prove actual billing/privacy/accuracy.

## 28. Deployment and Rollback Gates

| Gate                              | Required evidence                                                                            | Current status                    |
| --------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------- |
| G01 Decisions/scope               | Critical U dispositions, narrow DEC-074/log synchronization, separate A/B ownership          | Not accepted/implemented          |
| G02 Quota/accounting              | Exact global/org/identity limits, periods/carry, conservative unit/retry semantics           | Values/semantics pending          |
| G03 Provider account              | Actual account limits/cycle/overages/error charging/country/remote completion facts          | Unverified                        |
| G04 Privacy/egress                | Chosen deployment retention/data use/residency/notices/TLS/allowed hosts                     | Unapproved                        |
| G05 Migration/security review     | Minimal approved schema, SQL constraints/immutability/functions/grants, no old SQL rewrites  | Future                            |
| G06 Real DB proof                 | Fresh+representative migrations, runtime/operator/maintenance ACL negatives                  | Not run                           |
| G07 Multi-process correctness     | Independent API processes, aggregate provider/DB oracle, all quotas                          | Not run                           |
| G08 Recovery                      | Crash/uncertain response/DB outage/stale owner/period/clock/restore induced                  | Not run                           |
| G09 Production path               | Real NODE_ENV=production build, HTTPS mock, no admission override                            | Not run                           |
| G10 Kill/control                  | All replicas, accepted in-flight exception, safe re-enable and atomic history                | Not run                           |
| G11 Observability                 | Real ingestion/recipient alert/recovery and bounded privacy-safe dimensions                  | Unverified                        |
| G12 Performance                   | Approved §22 envelope, mixed Check-In responsiveness and storage impact                      | Unmeasured                        |
| G13 Native function/lifecycle     | Explicit Capture, human Confirm, ROI/Torch/manual/no-plate/cleanup                           | Source-inspected; future evidence |
| G14 Visual/device                 | Four locale/theme comparisons, footprint acceptance and real device/build                    | Not performed                     |
| G15 Compatibility/rollback        | Old/new clients, N/N-1 OFF defaults, fence/drain/restore watermark preserved                 | Not run                           |
| G16 Independent review/activation | Actual passing remote CI, cross-review and explicit release/environment/limit owner approval | Not granted                       |

Stage future rollout: additive migrations/grants while OFF → disabled compatible API → isolated production-mode mock qualification → Native test/visual review and staged artifact → account/privacy/performance/ops evidence → owner-approved tiny allocation/pilot/window → deliberate activation → compare usage/exposure and observed Check-In KPIs → deliberate expansion only. Do not auto-enable from merge or configured credentials. No customer billing, payments/push/messaging activation is bundled.

Relevant surfaces: Nest API/PG directly; maintenance only if selected; Management projection safe vocabulary; Employee Native changed manual control and old-client compatibility; Employee/Customer Web and independent workers require regression/pool/config checks only if redeployed with shared artifacts. Preserve their independent credentials/roles/activation gates. Repository Compose/infra files are not proof of deployed topology, monitoring or backups. Same-host staging is not independent failure isolation; OOM/load/restore drills require owned isolated resources.

Rollback: persist platform OFF, verify new permissions denied, fence old send-capable owners, abort best effort and prove remote drain/completion before release; keep counter/attempt/control history and compatible reconciliation. Old app returns production UNAVAILABLE and must not reinterpret new rows as memory allowance. No automatic destructive schema rollback. If a restored snapshot may precede paid calls, keep OCR OFF, compare restore watermark/vendor/external release evidence and conservatively carry or exhaust uncertain quota. Database choice alone does not prove failover durability. Native rollback is independent and may restore old automatic scanning; OCR OFF/Manual fallback is the safe immediate mitigation under that ambiguity.

Evidence ladder: IMPLEMENTED → STATIC VERIFIED → LOCAL COMMAND VERIFIED → RUNTIME VERIFIED → FAILURE VERIFIED → CI VERIFIED → PRODUCTION-READY are separate claims. Current feature is **NOT READY**; document validation cannot promote it.

## 29. Ranked Risks and Mitigations

### Risks / boundary violations

| Rank       | Risk / boundary violation                                                | Mitigation / decision                                                                                                      |
| ---------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 1 Critical | Lost/duplicate/uncertain paid send; TTL frees remote work                | Known commit/one-use permit, no resend/refund, conservative exposure, U-004 drain/fencing; disclose liveness limit         |
| 2 Critical | Cross-tenant or stale authority before debit/send                        | Full persisted proof retained through write, exact-session decision U-008, tenant FKs/predicates, two-principal/race tests |
| 3 High     | Lean A ambiguity or combining proof violates required dispatch semantics | Explicit Lean A/B comparison and U-008 gate; no silent security removal; benchmark extra transaction if needed             |
| 4 High     | Global row/authority locks starve Check-In                               | Minimal indexed short work, bounded pool/waits, mixed benchmark/kill; no HTTP DB lease                                     |
| 5 High     | Cloud retention/country/account costs misunderstood                      | Actual U-005 evidence, keep OFF until privacy/billing/region approved; no assumed NO_MATCH-free or external deletion       |
| 6 High     | New button displaces permanent fallbacks; UI redesign hidden as capture  | 72px estimate disclosed, U-012 screenshots/small-screen review, immutable viewport/Torch/tokens                            |
| 7 High     | Stale Native result or fallback remount starts another request           | Synchronous owner guard, no timers, generation/mount/ROI fencing, one-press tests and device proof                         |
| 8 High     | Stale backup/failover/account rotation restores allowance                | OFF on suspect state, stable account identity, watermark reconciliation and no counter reset                               |
| 9 Medium   | Conservative holds/charges exhaust legitimate quota                      | Explicit overcount trade-off, operator response/drain procedure, Manual/No Plate, no guessed refund                        |
| 10 Medium  | Unsafe privileged helper or audit mismatch                               | Narrow grants/functions, direct runtime negatives, compatible minimal history, no fake custody scope                       |
| 11 Medium  | Old clients still auto-cycle or distributed retries multiply usage       | All clients share backend caps; no automatic POST replay; fleet rollout evidence, no assumption of universal update        |
| 12 Medium  | Unbounded histories/identities/recovery or label cardinality             | Quota-bounded writes, no per-denial row, indexed bounded sweep/approved archival, safe fixed labels                        |
| 13 Medium  | Mixed period liability/fairness/clock discontinuity bypass               | Explicit period provision/carry policy, DB-authoritative time, missing state denies; load/failure evidence                 |
| 14 Medium  | “Configured” or HTTP SUCCESS misreported as provider health              | Neutral public outcome, private observations, truthful Management projection/no probe, evidence ladder                     |
| 15 Medium  | Overbuilt ledger/config/worker/Redis undermines MVP                      | Three-family target, only necessary history; defer unused tiers/importers/worker; new dependency only with evidence        |

Strongest remaining assumption: selected provider/account supports usable completion/drain evidence for strict recovery. Neither PG nor Redis can invent it. Strongest Native uncertainty: the added existing-style button fits small-screen access without an owner-unacceptable displacement; source review cannot close that gap.

## 30. Deferred Post-MVP Capabilities and Historical Alternative

Keep the original deeper proposal as a **historical alternative**, not a second active plan. Its pushed source is commit `201173e67d2c8e6d7578555a870aa54bb2d1ee98` at this same path. Security findings are carried into §§12–15/21/24/28; no need to duplicate contradictory old requirements.

| Deferred original capability                                                      | Why deferred / when reconsider                                                                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Separate admission A, dispatch B, settlement C                                    | Retain as Lean B only if U-008 or recovery evidence justifies extra proof/marker; not default neatness                    |
| Separate rate events, per-attempt usage-fact ledger and multiple billing tables   | Attempt timestamp/immutable debit can serve MVP windows/exposure; add facts only if accepted history need cannot fit      |
| Vendor reconciliation importer, exact financial estimator, automated credits      | No verified account contract; operator aggregate comparison is enough for initial controlled quotas                       |
| Location quotas, borrowing, rollover/rollup engine and multiple provider accounts | Extra policy/state not needed for fixed global/Organization pilot; explicit next-period control remains necessary         |
| Dedicated OCR recovery worker or lease renewal platform                           | Short synchronous work and bounded restart sweep first; justify actual operational need before new process                |
| Advanced financial alerting, budget Management UI and operator dashboards         | Minimal safe logs/exhaustion/unknown/store alerts and narrow operator control first                                       |
| Redis or generic limiter framework                                                | No verified deployment/bottleneck; equivalent-durability benchmark/accepted decision required                             |
| Stable client idempotency/replay cache                                            | Existing no-key POST and transient plate privacy favor fresh explicit attempts; separate compatibility decision if needed |
| Keep-preview-after-failure UX                                                     | May reduce retry taps, but changes failure camera lifecycle/status; existing reopen+Capture is less intrusive             |

No deferred item weakens fail-closed cost/tenant/privacy/ownership safety, permanent manual fallback or the locked explicit Capture behavior. Existing ROI/native patches, OCR provider/parser and Check-In architecture remain in scope only for preservation/integration.

## 31. Owner Decision Sheet

Do **not** reconfirm MVP scope, PostgreSQL-first evaluation, conditional Redis, speed, fail closed, no paid retry, manual-only capture, visual freeze or human/manual/no-plate workflows: those are already owner directions. Publication/push approval is not implementation or activation approval.

| ID    | Truly remaining choice                                                                         | Recommended review option / trade-off                                                                                                                                                  | Blocks                                                                   |
| ----- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| U-001 | Final shared architecture after evidence                                                       | Lean PG primary; Redis only justified by measured/verified need; existing PG auth remains in both                                                                                      | Backend architecture                                                     |
| U-002 | Exact global/org quota/capacity, any verified account rate, period/initial allocation/fairness | Fixed integer allocations/no borrowing/Location tier; explicit vendor-aligned periods; disabled/zero until chosen                                                                      | Values, rollover, activation                                             |
| U-003 | Accounting unit and distinct retry behavior                                                    | One conservative lookup unit at admission, no automatic refund; explicit fresh requests subject to caps rather than replay cache                                                       | Accounting/retry implementation                                          |
| U-004 | Unknown remote work, permit age, release proof, finite recovery and kill interval              | Quarantine, fence old senders and prove remote drain; minimal restart sweep plus finite operator response SLO. Without proof, affected OCR stays OFF                                   | Recovery/strict concurrency and liveness                                 |
| U-005 | Actual provider deployment/account/limits/billing/countries/privacy/egress                     | Verify actual contract/account; keep OFF until external image processing accepted; no inferred subscription facts                                                                      | Real provider activation; dependent assumptions                          |
| U-006 | Control/reconcile operator, safe channel and history                                           | Narrow versioned typed operator-only control; no new product UI; compatible append-only control/recovery record                                                                        | Privileged controls/history                                              |
| U-007 | Minimal objects/locks/functions/grants/retention and recovery owner                            | Three-family PG envelope plus history only if required; scoped constraints, bounded indexed sweep, no default separate worker                                                          | Migration/security mechanism                                             |
| U-008 | Combined authority/admission and exact-session paid continuation                               | Prefer Lean A if bounded immediate continuation is explicitly accepted; include internal session recheck if required. Otherwise Lean B with repeated proof/marker and measured latency | Protected executor/session boundary                                      |
| U-009 | Private provider observations/readiness/Management truth                                       | Minimal nonsecret configured/dispatch/completion observation, opaque permit; preserve public union; UNKNOWN is not health                                                              | Wiring/settlement projection                                             |
| U-010 | Performance/pilot envelope, operations owner/alerts/response SLO                               | Approve §22 targets with measured distributions and assigned recipient; actual delivery/recovery test                                                                                  | Launch qualification                                                     |
| U-011 | Record decision synchronization and separately authorize code/activation                       | Accept narrow §20 text via future docs-first workflow; scoped implementation GO first, release-specific activation only after gates                                                    | Implementation and later production activation                           |
| U-012 | Separate Native tracking and minimal placement footprint                                       | Recommend linked issue/separate review and status→Capture→Manual stack, approx 72px delta; owner accepts after visual evidence or reviews smallest alternative                         | Tracking not a security gate; unacceptable footprint blocks UI placement |

Architecture can be approved for disabled implementation without nonzero launch values once all code-affecting choices are resolved. Activation facts remain separate gates. If owner chooses another alternative, revise affected envelope/tests/files before coding; do not treat a recommended value/lock/state as already accepted.

## 32. Evidence Gaps

- No actual admission schema/implementation, measured PG/Redis latency, SQL count, lock/CPU/WAL footprint or full Check-In impact exists from this revision. Proposed budgets are not measurements.
- No screenshots, rendered Capture prototype, physical Android/iOS device run or before/after visual evidence was produced. The viewport/control/style facts and 72px footprint are source-derived only.
- No provider credentials/account/invoice, private usage endpoint, selected engine/country entitlement, billing/error/overage facts, signed retention/privacy agreement, cancellation acknowledgement or enforceable remote processing bound was inspected.
- Original official research remains linked with freshness limits; FAQ re-opened, other provider research observations are historical. No paid recognition or authenticated account call was made.
- No live production PostgreSQL role/persistence/failover/restore/network/secrets/monitoring topology was inspected. 109 migration files exist; they were not executed by planning. Repository absence of Redis configuration is not proof no external service exists.
- No new application/unit/integration/security/multiprocess/build/runtime/benchmark/device/CI test was run. Prior issue-reported 28/28 and historic provider observations are not this revision's validation.
- DEC-074/log still prescribe automatic scanning and no slice migrations; actual amendment is deferred to future authorized docs-first execution. Latest manual product direction is established, remaining implementation semantics are not.
- Exact new artifacts, schema/grants, retention/archival, control provenance, operator/recovery owner, dispatch/session/unknown policies and nonzero production values remain unapproved.
- #213 physical framing/accuracy and #325 administrative closure are not fresh production/security certificates. No unrelated product-surface readiness is established.
- Markdown/audit tools are heuristics; successful formatting cannot prove SQL linearizability, remote cost correctness, accessibility or production readiness. Actual results/dispositions are recorded below.

## 33. Final Planning Verdict

### Ready-to-implement verdict

**DECISION REQUIRED**

The revised Lean MVP plan is complete for review and branch delivery. It preserves essential security research and replaces the primary overbuilt/automatic workflow with conditional Lean admission and locked explicit Capture direction. Critical schema, dispatch/session, cost/recovery and internal-contract decisions still require recorded approval before code; account/privacy/performance/operations and explicit activation gates remain before production.

The planning deliverable can be committed/pushed with those decisions open. Keep production OCR fail-closed and Manual/No Plate usable. This verdict is not an implementation GO, feature test pass or production-readiness claim.

## 34. Appendix: Exact Source and Test References

### A. Mandatory repository documentation

Paths are relative to this plan; line references below describe the inspected baseline, not a promise that future main has identical line numbers.

| Source                                                                                              | Task-relevant authority / inspection anchor                                                                                                          |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AGENTS.md](../../AGENTS.md)                                                                        | §§2/3/5–13: real hierarchy, docs-first, modular monolith, tenant/security/audit/Git/structure rules                                                  |
| [00_SOURCE_OF_TRUTH.md](../00_SOURCE_OF_TRUTH.md)                                                   | Accepted decision authority, fast check-in, privacy/reliability/configuration/change rules                                                           |
| [01_PRODUCT_SCOPE.md](../01_PRODUCT_SCOPE.md)                                                       | Staff roles, OCR/manual flow, typed policy, management vs field authority                                                                            |
| [02_DOMAIN_MODEL.md](../02_DOMAIN_MODEL.md)                                                         | User/member/Location/Shift identities, Vehicle assistive OCR, prospective config                                                                     |
| [03_DATABASE_SCHEMA.md](../03_DATABASE_SCHEMA.md)                                                   | :215 global conventions; :268 tenant integrity; :339 runtime; :747 AntiAbuse; :784 memberships; :924 grants; :953 Shift; Issue #215 lease foundation |
| [04_VALET_SESSION_STATE_MACHINE.md](../04_VALET_SESSION_STATE_MACHINE.md)                           | :88 complete-check-in; :146 OCR confidence not required; no new physical state                                                                       |
| [05_ENGINEERING_RULES.md](../05_ENGINEERING_RULES.md)                                               | PostgreSQL, protected executor, validation, transport, logging/configuration and testing                                                             |
| [06_SECURITY_AND_DATA_RULES.md](../06_SECURITY_AND_DATA_RULES.md)                                   | Staff/Check-In auth, tenant isolation, transient OCR, mutable-policy checks, private logs, least privilege and deployment evidence                   |
| [07_DEFINITION_OF_DONE.md](../07_DEFINITION_OF_DONE.md)                                             | Database/security/concurrency/test/operational/quality gates                                                                                         |
| [08_DECISIONS_LOG.md](../08_DECISIONS_LOG.md)                                                       | :213 DEC-007; :306 DEC-012; :390 DEC-017; :437 DEC-020; :588 DEC-023; :817 DEC-024; :1168 DEC-025; :3857 DEC-074                                     |
| [09_TECH_STACK.md](../09_TECH_STACK.md)                                                             | Locked PostgreSQL/Nest/REST/native/container modular architecture                                                                                    |
| [10_REPOSITORY_STRUCTURE.md](../10_REPOSITORY_STRUCTURE.md)                                         | Common infrastructure vs feature ownership, check-in-api and provider boundaries                                                                     |
| [11_REQUIREMENTS_TRACEABILITY.md](../11_REQUIREMENTS_TRACEABILITY.md)                               | OCR assist/manual/no-plate, auth/AntiAbuse, Shift and production DB contracts                                                                        |
| [12_AGENT_EXECUTION_PLAN.md](../12_AGENT_EXECUTION_PLAN.md)                                         | Focused phases and production/pilot evidence distinct from historical entry gates                                                                    |
| [13_COLLABORATION_WORKFLOW.md](../13_COLLABORATION_WORKFLOW.md)                                     | Owner/branch, scope, migration owner, docs-first and cross-review rules                                                                              |
| [14_PROJECT_STATUS.md](../14_PROJECT_STATUS.md)                                                     | Nonbinding historical handoff; production OCR still fail-closed; stale migration/repository snapshot not used                                        |
| [15_BLUEPRINT_V1_REBASELINE.md](../15_BLUEPRINT_V1_REBASELINE.md)                                   | MVP assistive OCR, configuration inheritance, no autonomous AI/privacy invention                                                                     |
| [16_PRODUCTION_DATABASE_DEPLOYMENT_CHECKLIST.md](../16_PRODUCTION_DATABASE_DEPLOYMENT_CHECKLIST.md) | Separate source-enforced/runtime/network/secret/backup evidence                                                                                      |
| [17_AGENT_CODE_STRUCTURE_RULES.md](../17_AGENT_CODE_STRUCTURE_RULES.md)                             | <=300 authored-code lines, ownership/dependency/extraction rules; Markdown exempt                                                                    |
| [18_PHASE3_OPERATIONS_EXECUTION_PLAN.md](../18_PHASE3_OPERATIONS_EXECUTION_PLAN.md)                 | Reusable transaction-aware eligibility, separate Task/ValetSession state; no dispatch expansion here                                                 |

### B. Focused decisions

- [DEC-074 Native Assistive Plate OCR](../decisions/DEC-074_NATIVE_ASSISTIVE_PLATE_OCR_ANPR.md): complete trust/native/provider/privacy contract (automatic initiation is superseded for the proposed future workflow by the latest owner direction); §13 pre-cost authority; §22 accepted identity/limits/production fail-closed and scoped freeze.
- [DEC-024 durable AntiAbuse](../decisions/DEC-024_SHARED_DURABLE_ANTI_ABUSE.md) and canonical log §DEC-024/T3 amendment: DB-time, HMAC scopes, transaction/maintenance/runtime boundaries; 900-second helper not OCR concurrency.
- [DEC-025 production DB](../decisions/DEC-025_PRODUCTION_DATABASE_CONNECTION_HARDENING.md): canonical log contains full TLS/role/credentials/deployment contract.
- [DEC-026 shared infrastructure](../decisions/DEC-026_SHARED_API_INFRASTRUCTURE_OWNERSHIP.md), [DEC-027 feature ownership](../decisions/DEC-027_FEATURE_MODULE_OWNERSHIP.md), [DEC-030 structure](../decisions/DEC-030_AGENT_CODE_STRUCTURE_LIMITS.md): preserve common/feature direction and bounded files.
- [DEC-032 Shift eligibility](../decisions/DEC-032_SHIFT_OPERATIONAL_ELIGIBILITY.md): §§3/10/11 active persisted exact-Location operational predicate and retained transaction proof.
- [DEC-058 typed config](../decisions/DEC-058_PHASE7_TYPED_LOCATION_CONFIGURATION_AUTHORITY.md), [DEC-083 settings](../decisions/DEC-083_MANAGEMENT_SETTINGS_SCOPE.md): typed inheritance, narrow writes, OCR ON independent gates.
- [DEC-063 offline policy](../decisions/DEC-063_EMPLOYEE_OFFLINE_OPERATION_POLICY.md), [DEC-067 camera](../decisions/DEC-067_EMPLOYEE_CAMERA_QR_ARCHITECTURE.md), [DEC-069 returning recognition](../decisions/DEC-069_RETURNING_CHECK_IN_RECOGNITION.md), [DEC-072 Native auth](../decisions/DEC-072_NATIVE_STAFF_AUTHENTICATION_ARCHITECTURE.md): no blind replay, lifecycle, human-confirmed exact recognition and identity-generation fences.
- [DEC-080 Management authority](../decisions/DEC-080_COMPANY_ADMIN_AUTHORITY.md), [DEC-081 Staff lifecycle](../decisions/DEC-081_STAFF_ROLE_AND_ACCESS_LIFECYCLE.md), [DEC-087 integrations](../decisions/DEC-087_READ_ONLY_INTEGRATIONS.md), [DEC-094 Location lifecycle](../decisions/DEC-094_LOCATION_LIFECYCLE.md), [DEC-108 practical revocation](../decisions/DEC-108_LOCATION_ACCESS_REVOCATION_DELIVERY.md): field authority remains distinct, prospective configuration/intake gate and bounded in-flight response contract.

### C. Preserved source evidence index (same main baseline)

| ID  | Exact source / symbols / baseline lines                                                                                                                                                                                                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E01 | [plate-ocr-cost-guard.ts](../../apps/api/src/modules/check-in-api/plate-ocr-cost-guard.ts#L11), acquire :20–50                                                                                                                                                                                                                                                                                                  |
| E02 | [plate-ocr.service.ts](../../apps/api/src/modules/check-in-api/plate-ocr.service.ts#L27), recognize :32–96                                                                                                                                                                                                                                                                                                      |
| E03 | [check-in.module.ts](../../apps/api/src/modules/check-in-api/check-in.module.ts#L26), providers :49–63 and middleware :67–74                                                                                                                                                                                                                                                                                    |
| E04 | [plate-ocr-config.ts](../../apps/api/src/modules/check-in-api/plate-ocr-config.ts#L17), resolvePlateOcrConfig/readPlateOcrConfig                                                                                                                                                                                                                                                                                |
| E05 | [plate-recognizer-snapshot.provider.ts](../../apps/api/src/modules/check-in-api/plate-recognizer-snapshot.provider.ts#L48), parseResult :48–98, boundedJson :100–125, recognize :163–222; [provider interface](../../apps/api/src/modules/check-in-api/plate-ocr-provider.ts)                                                                                                                                   |
| E06 | [plate-ocr.controller.ts](../../apps/api/src/modules/check-in-api/plate-ocr.controller.ts#L69), multipart :79–97, validations/finally :105–148; [auth guard](../../apps/api/src/modules/check-in-api/plate-ocr-auth.guard.ts); [shared contract](../../packages/contracts/src/plate-ocr.ts)                                                                                                                     |
| E07 | [staff-session-context.ts](../../apps/api/src/modules/auth/staff-session-context.ts), DatabaseStaffSessionContextResolver/DatabaseStaffPrincipalResolver; [auth.module.ts](../../apps/api/src/modules/auth/auth.module.ts); [Location authorizer](../../apps/api/src/modules/check-in-api/check-in-location-authorization.ts); [Staff authorizer](../../apps/api/src/modules/staff/custody-staff-authorizer.ts) |
| E08 | [shift-operational-eligibility.ts](../../apps/api/src/modules/shifts/shift-operational-eligibility.ts), exported lockShiftOperationalEligibility; [settings lock](../../apps/api/src/common/database/management-settings-lock.ts); [lifecycle lock](../../apps/api/src/common/database/location-lifecycle-lock.ts); [session revalidation](../../apps/api/src/modules/auth/staff-session-revalidation.ts)       |
| E09 | [anti-abuse.service.ts](../../apps/api/src/modules/anti-abuse/anti-abuse.service.ts), transaction/lock/currentCount/decision/reserve/finalize; [key contract](../../apps/api/src/modules/anti-abuse/anti-abuse-key.ts)                                                                                                                                                                                          |
| E10 | [anti-abuse-maintenance.ts](../../apps/api/src/modules/anti-abuse/anti-abuse-maintenance.ts); [anti-abuse.module.ts](../../apps/api/src/modules/anti-abuse/anti-abuse.module.ts); SQL references below                                                                                                                                                                                                          |
| E11 | [condition-photo-admission.ts](../../apps/api/src/modules/vehicle-photos/condition-photo-admission.ts), uploadStart/statusRead; [module](../../apps/api/src/modules/vehicle-photos/condition-photo-admission.module.ts)                                                                                                                                                                                         |
| E12 | [postgres.ts](../../apps/api/src/common/database/postgres.ts); [transaction helper](../../apps/api/src/common/database/postgres-transaction.ts); [pool policy](../../apps/api/src/common/database/runtime-postgres-policy.ts); [deadline](../../apps/api/src/common/database/runtime-database-deadline.ts); [bounded pool](../../apps/api/src/common/database/bounded-postgres-pool.ts)                         |
| E13 | [schema.prisma](../../packages/database/prisma/schema.prisma), Organization/Location/OrganizationMembership/Shift; committed SQL and privilege links below                                                                                                                                                                                                                                                      |
| E14 | [native-plate-ocr-client.ts](../../apps/valet-native/src/check-in/native-plate-ocr-client.ts); [native-plate-ocr-loop.ts](../../apps/valet-native/src/check-in/native-plate-ocr-loop.ts), NativePlateOcrLoop and constants                                                                                                                                                                                      |
| E15 | [native-plate-ocr-adapter.ts](../../apps/valet-native/src/check-in/native-plate-ocr-adapter.ts); [camera controller](../../apps/valet-native/src/check-in/native-plate-camera-controller.ts); [camera lifecycle](../../apps/valet-native/src/check-in/native-plate-camera-lifecycle.ts)                                                                                                                         |
| E16 | [boundary diagnostics](../../apps/api/src/modules/check-in-api/plate-ocr-boundary-diagnostics.ts); [operation observability](../../apps/api/src/common/observability/operation-observability.ts); [runtime metrics](../../apps/api/src/common/observability/runtime-metrics-pulse.ts)                                                                                                                           |
| E17 | [monitoring README](../../infra/monitoring/README.md); [limiter maintenance metrics](../../apps/api/src/common/observability/limiter-maintenance-metrics.ts)                                                                                                                                                                                                                                                    |
| E18 | [API package](../../apps/api/package.json); [root package](../../package.json); [Compose](../../docker-compose.yml); pnpm-lock.yaml; infra directory                                                                                                                                                                                                                                                            |
| E19 | [management-integrations-status.ts](../../apps/api/src/modules/management/management-integrations-status.ts), plateOcrStatus/projectManagementIntegrations                                                                                                                                                                                                                                                      |
| E20 | [custody-audit-event-writer.ts](../../apps/api/src/modules/audit/custody-audit-event-writer.ts), PersistedCustodyAuditScope/CustodyAuditEntity/appendCustodyAuditEvent                                                                                                                                                                                                                                          |
| E21 | [complete-check-in-command.ts](../../apps/api/src/modules/valet-sessions/complete-check-in-command.ts), explicit transaction/executor and current session revalidation pattern                                                                                                                                                                                                                                  |

### D. Committed SQL, grants and test sources

- [Tenant/staff migration 1](../../packages/database/prisma/migrations/20260808000100_tenant_staff_foundation/migration.sql): same-tenant composite FKs, unique membership per Organization/User and partial active Shift index.
- [AntiAbuse migration 18](../../packages/database/prisma/migrations/20260810001800_shared_durable_anti_abuse/migration.sql): original scope/state/hash constraints and cleanup; later [migration 75](../../packages/database/prisma/migrations/20261008007500_guest_t3_classified_anti_abuse/migration.sql) bounds cleanup; [migration 81](../../packages/database/prisma/migrations/20261015008100_issue_215_photo_anti_abuse_scopes/migration.sql) and [migration 98](../../packages/database/prisma/migrations/20261021009800_issue309_photo_view_anti_abuse_scope/migration.sql) extend accepted photo scopes without an OCR scope.
- [Photo migration 80](../../packages/database/prisma/migrations/20261014008000_issue_215_verified_condition_photo_p1/migration.sql): concrete owned leases, scoped operations, partial indexes and function patterns; [migration 83](../../packages/database/prisma/migrations/20261015008300_issue_215_condition_photo_policy_recovery_finish/migration.sql): owner/expiry checks.
- [Runtime privileges](../../packages/database/scripts/runtime-table-privileges.mjs), [photo privileges](../../packages/database/scripts/condition-photo-runtime-privileges.mjs), [photo privilege policy](../../packages/database/scripts/condition-photo-privilege-policy.mjs), [privilege verifier](../../packages/database/scripts/verify-runtime-table-privileges.mjs): actual restricted table/function composition, not inferred from Prisma.
- [Guard tests](../../apps/api/test/plate-ocr-cost-guard.test.ts): limits/window edges/bounded keys/production denial; [HTTP integration tests](../../apps/api/test/plate-ocr-http.integration.test.ts): persisted authority/input/tenant policy/production denial and concurrent provider proof; [HTTP context](../../apps/api/test/plate-ocr-http-context.ts): existing fixture wiring.
- [Provider tests](../../apps/api/test/plate-ocr-provider.test.ts), [provider diagnostic tests](../../apps/api/test/plate-ocr-provider-diagnostics.test.ts), [boundary tests](../../apps/api/test/plate-ocr-boundary-diagnostics.integration.test.ts): current no-retry, config, parsing and secret-safe classification.
- [Native loop tests](../../apps/valet-native/test/native-plate-ocr-loop.test.ts), [client tests](../../apps/valet-native/test/native-plate-ocr-client.test.ts), [capture tests](../../apps/valet-native/test/native-plate-ocr-capture.test.ts), [confirmation tests](../../apps/valet-native/test/native-plate-ocr-confirmation.test.tsx).
- [Owned test harness](../../scripts/test-harness/run-owned-tests.mjs), [PostgreSQL projects runner](../../scripts/test-harness/run-postgres-projects.mjs), [architecture gate](../../scripts/architecture-check.mjs), [CI definition](../../.github/workflows/ci.yml): future safe verification/quality integration.

### E. Added Native and authorization evidence

| ID  | Exact source / concrete symbol                                                                                                                                                                                                                                                                                                                                                                   | Evidence kind                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| E22 | [Plate camera step](../../apps/valet-native/src/check-in/native-plate-camera-step.tsx), NativePlateCameraStep rendered control order and stylesTheme.viewport                                                                                                                                                                                                                                    | Current behavior: no Capture, 260px viewport, automatic open                                    |
| E23 | [Camera controller](../../apps/valet-native/src/check-in/native-plate-camera-controller.ts), ready/open/waitForCaptureFallback/close; [OCR loop](../../apps/valet-native/src/check-in/native-plate-ocr-loop.ts), start/schedule/run                                                                                                                                                              | Current behavior to replace: ready-triggered 1200ms/five sequence; retain ownership/fences      |
| E24 | [CheckInButton](../../apps/valet-native/src/check-in/native-check-in-primitives.tsx), [EmployeeButton](../../apps/valet-native/src/employee-ui/employee-controls.tsx), [tokens](../../apps/valet-native/src/employee-ui/employee-tokens.ts), [typography](../../apps/valet-native/src/employee-ui/employee-typography.ts), [palette](../../apps/valet-native/src/appearance/employee-palette.ts) | Capability/convention: existing buttons/busy/disabled/Light/Dark/accessibility                  |
| E25 | [Condition-photo camera](../../apps/valet-native/src/check-in/native-condition-photo-camera.tsx), manual EmployeeButton; [parent capture](../../apps/valet-native/src/check-in/native-check-in-capture-step.tsx), NativeCaptureStep                                                                                                                                                              | Reuse reference and existing manual/no-plate boundary, not camera-layout permission             |
| E26 | [ROI binding](../../apps/valet-native/src/check-in/native-plate-roi-binding.ts), capture/ready/validate; [viewport](../../apps/valet-native/src/check-in/native-plate-roi-viewport.tsx), NativePlateRoiViewport; [ROI capture](../../apps/valet-native/src/check-in/native-plate-roi-capture.ts), capturePlateRoi                                                                                | Capability/current behavior: validated metadata/crop/owned cleanup, no geometry change          |
| E27 | [Crop adapter](../../apps/valet-native/src/check-in/native-plate-roi-crop-adapter.ts), renderPlateRoi; [capture policy](../../apps/valet-native/src/check-in/native-plate-capture-policy.ts); [Torch](../../apps/valet-native/src/check-in/native-plate-torch-control.tsx)                                                                                                                       | Current bounded encode/size/torch behavior to preserve                                          |
| E28 | [English](../../apps/valet-native/src/i18n/native-dictionary-en-check-in.ts), [Arabic](../../apps/valet-native/src/i18n/native-dictionary-ar-check-in.ts), [dictionary](../../apps/valet-native/src/i18n/native-employee-dictionary.ts), [camera copy](../../apps/valet-native/src/check-in/native-plate-camera-copy.ts)                                                                         | Current copy automatic; future label/guidance needs narrow localization                         |
| E29 | [Session recheck](../../apps/api/src/modules/auth/staff-session-revalidation.ts), lockAndRecheckStaffSessionContext; [Native transport](../../apps/valet-native/src/auth/native-protected-transport.ts), execute; [EmployeeClient](../../packages/employee-client/src/employee-client.ts)                                                                                                        | Exported capability: close exact-session proof IF chosen; current OCR POST is not auto-replayed |

Native test references (reviewed source; not executed):

- [Loop](../../apps/valet-native/test/native-plate-ocr-loop.test.ts), [telemetry](../../apps/valet-native/test/native-plate-ocr-loop-telemetry.test.ts), [screen](../../apps/valet-native/test/native-plate-camera-step.test.ts), [fallback](../../apps/valet-native/test/native-plate-camera-step-fallback.test.ts), [fixture](../../apps/valet-native/test/native-plate-camera-step-test-fixture.ts): explicit historical automatic/no-Capture assertions to replace.
- [Confirmation](../../apps/valet-native/test/native-plate-ocr-confirmation.test.tsx), [capture](../../apps/valet-native/test/native-plate-ocr-capture.test.ts), [lifecycle](../../apps/valet-native/test/native-plate-camera-lifecycle.test.ts), [trace UI](../../apps/valet-native/test/native-plate-camera-trace-ui.test.ts): retain human trust/ROI/cleanup/identity boundaries, migrate trigger setup.
- [Appearance camera](../../apps/valet-native/test/native-appearance-camera.test.ts), [style freeze](../../apps/valet-native/test/native-appearance-style-freeze.test.ts), [ROI cleanup](../../apps/valet-native/test/native-plate-roi-cleanup.test.ts), [ROI binding](../../apps/valet-native/test/native-plate-roi-binding.test.ts), [ROI viewport](../../apps/valet-native/test/native-plate-roi-viewport.test.ts), [Torch](../../apps/valet-native/test/native-plate-torch.test.ts), [Torch control](../../apps/valet-native/test/native-plate-torch-control.test.ts): preserve geometry/themes/ownership.

### F. Revision self-review and validation record

Review scope: source precedence/proposition polarity, 20 L+D falsifiers, 12 U-decision firewall concepts, 25 F-scenarios and their commit/rollback/unknown branches, authorization-before-write ordering, stale owner/remote uncertainty, privacy/value-level metadata, minimal architecture/file predictions, Native readiness/timer/press separation, exact button reuse/footprint and DEC mirror drift. Counts describe this document and source reasoning, not feature test execution.

The most dangerous original assumption was treating expired local ownership as proof that remote work stopped. The Lean revision retains conservative exposure and explicitly states its reduced definitely-not-sent precision without a dispatch transaction. Its second challenge is treating DEC-108 response completion as blanket permission for paid dispatch; U-008 remains open. The third is hiding Capture's added footprint behind unchanged style tokens; §17 discloses displacement and requires visual acceptance.

Only this Markdown file is intentionally modified. No application, native component, stylesheet, test, schema, migration, runtime environment, secret, production config, Accepted DEC/log or GitHub Issue is edited. No provider call, new PR, main merge, deployment or activation is performed. Git synchronization of latest main on this existing planning branch used the permitted normal merge check, which was a no-op.

Actual documentation command results are recorded after validation below. No implementation test result or production readiness is inferred from those checks.

### G. Actual revision validation results

- Final main re-fetch before commit/push returned `ac758ffff7181efa6cad1311c40aca731171770e`, unchanged. Existing planning remote still `201173e67d2c8e6d7578555a870aa54bb2d1ee98` before revision commit. Main was already an ancestor; no merge conflict or history rewrite occurred.
- Structure/local-link/table validation: 34/34 numbered sections in sequence, 148 existing local link targets, zero missing targets, zero inconsistent table column counts and balanced code fences. Matrix inventory: 12 L, 8 D, 5 X, 12 U, 25 F and 16 G entries; counts are documentation coverage, not executed feature tests.
- Planning guardian audit v1.5: initial heading/compound-title warnings were corrected by explicit classification subsections and a single-label matrix. Final run reports **no heuristic red flags**, exit 0. This does not prove semantic correctness.
- Prettier 3.9.6 formatted/checked only this file, with an explicit empty ignore-path override because the repository ordinarily ignores `docs/` in Prettier. Final formatting check passed. No dependency, formatter configuration or lockfile changed.
- Complete planning diff reviewed with scope/inventory and automatic/manual/retry/transaction terminology checks. Automatic/five-attempt references are current/historical behavior, replacement instructions or old-client rollback caveats, never the desired new workflow. No unfinished-section markers or contradictory active automatic-capture requirement remains in the reviewed plan.
- Adversarial review retained unknown-remote quarantine, no paid resend/refund, authorization-before-mutation, session/revocation interval decision, exact tenant identity, locked quotas, scoped runtime privileges, period/account/clock/restore hazards and safe observation contracts. Native review retained single-flight, fallback, human confirmation, ROI/Torch/privacy and disclosed button footprint.
- `git diff --check` passed; changed/staged scope is verified as this original planning Markdown file only before commit. The isolated worktree is expected clean after the documentation commit; commit/remote SHA verification is reported in final delivery rather than self-embedding a commit SHA in its own content.
- No application tests/builds, migration, benchmark, physical-device QA, paid/provider/account request, production operation or Issue mutation was performed. No actual GitHub Actions run was executed or inspected for this revision. Outstanding evidence and decisions are explicit in §§28/31/32.
