# Employee Native Execution Plan — v2 Rebaseline

## 1. Repository facts discovered

### A–C. Status, authority, outcome and merged baseline

Status: canonical execution plan; decision-dependent implementation envelope.
Synchronized: 2026-09-05. Baseline: `6c965a17fcc1a699270a189c38c52ec67079099a`.
This replaces the old sequence as a whole; historical MOB IDs remain traceable.
The plan grants no new product, security, schema, provider or release policy.

The outcome is one server/domain product, one Employee Web client and one
Employee Native client: a reliable Android field terminal with the same VAYLET
product identity, minimum migration loss and a credible iOS path. Employee Web
in `apps/valet` is the visual/product reference. Native is adaptation, not redesign.

Fresh remote-ref inspection before branch creation found `origin/main` and
`origin/codex/mob-010-native-check-in-returning-parity` at the baseline above,
with ahead/behind `0 / 0`. The latest intake/OCR implementation is merged. Work
starts on `codex/employee-native-plan-v2-rebaseline`, never on main. Two unrelated
untracked review patches are excluded from this documentation branch.

Authority read: `AGENTS.md`; docs 00–11, 13, 15, 17; applicable focused Accepted
Decisions including DEC-063, DEC-066–074 and the custody, dispatch, tracking,
finance and handoff decisions referenced below. `docs/14_PROJECT_STATUS.md` is
informational. Focused Accepted DECs outrank their shorter log mirrors; DEC-074's
missing mirror is repaired alongside this plan. Neither old plan status nor Git
history alone proves physical or production readiness.

| Area / inspected evidence | Current merged capability | Evidence limit / remaining owner |
| --- | --- | --- |
| `apps/valet-native/app/index.tsx`, `src/foundation/foundation-shell.tsx` / `FoundationShell` | Expo Router entry composes auth, task, intake, QR and development POC panels | Foundation composition, not a completed production navigation graph; MOB-028 |
| `apps/valet-native/package.json`, app configuration; DEC-071 | Expo SDK 57 / React Native 0.86, Hermes, New Architecture, CNG | Configuration/code evidence; current signed-build/device evidence remains required |
| `src/auth/native-auth-runtime.ts`, `native-auth-storage.ts`; portable `native-auth-session.ts` | Native Staff login/restore/refresh/logout, secure refresh adapter, memory access boundary | IMPLEMENTED; physical restore, SecureStore failure and revocation proof must be reconciled by MOB-010B |
| `src/tasks/**`; portable `employee-operational-session.ts` | Scoped operational context, task reads/actions, foreground/manual refresh | IMPLEMENTED; current Native has no proven periodic five-second polling loop; production queue closure is MOB-029 |
| `src/scanner/**` | Native QR parsing/camera and fallback boundaries | IMPLEMENTED; repeated frames, device permission/lifecycle proof belongs to MOB-010B and each consumer |
| `src/check-in/**`; portable `employee-check-in-*.ts` | New/returning intake, plate country/identity/confirmation, recovery, OCR camera path | IMPLEMENTED, not a future reimplementation of MOB-010; condition/completion and downstream custody remain MOB-011 onward |
| `src/employee-ui/employee-{frame,back-header,controls,fields,feedback,icons,tokens,typography}.*` | Shared Web-aligned presentation, Plus Jakarta Sans / Space Grotesk, semantic tokens | Reuse this foundation; inspect rendered parity, do not create another design system |
| `native-plate-ocr-client.ts`, `native-plate-camera-controller.ts`, API check-in OCR providers; DEC-074 | Assistive OCR, Expo File multipart repair, supported-size camera retry and privacy-safe development diagnostics | Local tests do not prove current physical multipart/provider success. Production provider remains fail-closed without accepted shared cost guard |
| `apps/api/src/modules/**`, `packages/contracts/src/**`, `packages/database/prisma/**` | Existing employee domain commands, authorization, audit, constraints; 31 versioned SQL migrations at baseline | Native must reuse these capabilities. No StaffPush persistence/worker implementation found; DEC-073 is accepted design, not delivered push |
| Remaining production flows | No completed Native parking/retrieval/handoff/directory/incident/guest-access/shift-summary production flow found in the audited Native feature tree | NOT STARTED or supporting POC capability only; mapped below |

Merged history anchors (implementation provenance, not acceptance certificates):
`760fe10` foundation; `91d8561` portable client; `10370c9` auth; `b77a6ff`
operational tasks; `43cea12` QR; `588995e`, `09b26b8`, `64e4bb3` intake;
`5fa5bb0`, `09b9ce3`, `08d084c`, `6698179`, `d78f873`, `3620849`, `3246948`,
`486159f` presentation/parity; `3c14092`, `063bb1e`, `c1c0b5a`, `06f9e23`,
`6c965a1` OCR and capture/transport repairs. Use full Git objects when preparing a task.

Local baseline checks executed during rebaseline:
`corepack pnpm --filter @valet/valet-native test` — 43 files / 373 tests passed;
`corepack pnpm --filter @valet/employee-client test` — 15 files / 143 tests passed.
These are LOCAL COMMAND VERIFIED. No current real Android comparison, signed
release, real API/DB failure exercise, load run or full-shift soak was performed
by this documentation task. The queried baseline workflow-run list was empty;
CI VERIFIED is not claimed. Historical device claims need artifact/SHA matching.

Evidence levels are separate: IMPLEMENTED, STATIC VERIFIED, LOCAL COMMAND
VERIFIED, RUNTIME VERIFIED, FAILURE VERIFIED, CI VERIFIED, PRODUCTION-READY.
A level never implies the next. Task states: NOT STARTED; BLOCKED ON named gate;
IMPLEMENTED — EVIDENCE OPEN; REVIEW READY; DONE; DEFERRED BY OWNER only for an
explicitly approved conditional scope difference. DONE requires merged reviewed
code plus the task's specified evidence. A parent closes only when every required
child and gate closes. Accepted decision work is complete as policy, not as its
future implementation. No application is declared production-ready here.

## 2. Binding requirements

### E–L. Architecture, migration-loss, visual, field and portability covenants

Backend commands remain canonical. Preserve public contracts, operation-specific
authorization, tenant/Location isolation, optimistic versions, accepted idempotency,
Task/Dispatch separation from physical ValetSession state, parking/key custody,
financial release guards, append-only audit, constraints and recovery semantics.
No Native-owned authorization/state transition, mobile backend rewrite, second
schema, WebView wrapper, mechanical DOM port, speculative API fork, generic durable
mutation queue or blind replay. Any future server change requires a demonstrated
parity/transport/integrity/performance gap or an Accepted Decision, in its own
bounded task. Reuse portable nonvisual logic only where semantics actually match.

Employee Web is the visual source of truth. Default classification is `MATCH WEB`.
Each materially different state is incomplete until matched or documented as
`MATCH WEB + NATIVE ADAPTATION` or
`INTENTIONAL PRODUCT/CAPABILITY DIFFERENCE — OWNER/ACCEPTED DECISION`.
Personal preference, an unevidenced claim of a React Native limitation, and a
fixable implementation discrepancy cannot justify a deviation. No new numeric
parity score is accepted by this plan; retain any applicable accepted threshold
and still fix every unexplained material difference. No numeric score overrides
the owner's material-match requirement.

### H. Per-flow visual execution protocol (V)

1. Before code, inspect the exact current Web screen, its live router/controller,
   shared components, CSS/tokens, assets, copy and locale dictionaries. Record Web
   commit, paths/symbols, logical state/fixtures and every visible state. Prototype
   markup without its production state owner is insufficient.
2. Produce a reference sheet covering shell; semantic colors; font family, weight,
   size and line height; spacing/gutters; cards/radii/borders/shadow; buttons and
   action hierarchy; fields/selectors; badges/status; icons/assets; grouping and
   information hierarchy. Include loading, empty, errors, ambiguity/recovery,
   success/continuation, disabled/busy and permission states, not just happy paths.
3. Lock existing domain/security behavior. Reuse `src/employee-ui/**`; add only a
   focused missing primitive. Keep auth, API calls, session ownership, commands,
   authorization and mutation recovery out of presentation components. Prevent
   duplicate feature colors, spacing, buttons, card languages, typography or RTL helpers.
4. Implement EN/AR and RTL/LTR with the flow. Preserve LTR plate/phone/code/identifier
   islands in RTL; verify back direction and icons intentionally. Adapt safe areas,
   keyboard, scanner/camera and native touch behavior only with evidence.
5. Capture matched Web and Native renders with the same business state, fixture,
   content, locale, direction and comparable logical viewport. Record pixel/logical
   dimensions, font scale, device/OS, build SHA and capture method. Compare hierarchy,
   geometry, copy and state transitions side-by-side; annotate every difference.
6. Use deterministic render regression where reliable, including stable fixtures
   and animation/time controls. These supplement real Android rendering. Require
   physical Android proof, keyboard and large-font proof, TalkBack/focus labels,
   touch targets and readable non-color-only states for the affected flow.
7. Store/link the reference sheet, matched state pairs and deviation rows in the
   task evidence. Reviewer checks each state; missing render evidence is EVIDENCE
   OPEN. Resolve defects before merge/completion; MOB-018B is cross-flow closure,
   never permission to postpone feature parity.

### I. Visual deviation register

No blanket deviation is approved in this rebaseline. Each task maintains rows:

| ID / task / screen-state | Classification | Web behavior and Native behavior | Why exact parity is infeasible; measured platform evidence | Security/performance effect | Owner/Accepted DEC if product changes | Visual impact and acceptance evidence | iOS impact / owner / disposition |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Template only; create stable VD IDs per actual difference | MATCH WEB by default | Capture both | Safe area, keyboard, touch, accessibility, lifecycle or measured platform constraint | Explicit or none | Required for capability/policy divergence | Matched images and bounded geometry/content difference | Candidate, defect, accepted adaptation or resolved; no implicit approval |

### J. Field UX

Preserve a clear current task and one dominant action per operational stage,
minimal typing and interaction count, large accessible targets, readable statuses,
fast scan/manual fallback, context during requests, visible recovery and truthful
success. Do not add unnecessary confirmations or decorative complexity. Measure
check-in against the Blueprint's roughly 15–20-second normal low-friction intent
when photos are not required; this is product intent, not an invented API SLO.

### K. Cross-platform covenant

DEC-071 fixes one Expo application and portable TypeScript boundaries. Contracts,
validation, orchestration, workflow/recovery state, formatting/localization and
neutral route/scanner/notification intents belong in portable code when reusable.
Camera, permissions, secure storage, push, lifecycle, privacy, native configuration
and signing stay behind narrow adapters. No Android/FCM names in shared concepts.
Retain the 85–95% nonvisual Android/iOS reuse aspiration as an engineering goal,
not a quota or acceptance score. Measure added platform coupling per task. iOS
config/build smoke is mandatory before final Android pilot completion.

### L. Offline/recovery and hard-zero invariants

DEC-063 and command-specific decisions own retry behavior. Show stale/offline and
unknown outcomes truthfully. Prevent overlapping sends, preserve only permitted
nonsecret context, and re-read authoritative state before continuing when required.
A timeout, 408, disconnect or process death may hide a committed effect. Never
convert uncertainty to success or blanket retry. Distinguish 401 auth recovery,
403 scope denial, 409 stale/conflict, 429 bounded waiting and 5xx/unavailability
using the existing contract; do not invent universal HTTP-to-domain mappings.

Hard-zero release blockers: cross-tenant or unauthorized cross-Location access;
unauthorized custody/release; duplicate successful protected effect; fabricated or
broken key custody; bypassed financial guard; altered/lost/fabricated audit;
client, scan, OCR, push or offline state becoming server authority. Access tokens
remain memory-only; refresh uses DEC-072 secure storage and rotation/replay rules.
Purge sensitive workflow state on logout, revocation and identity/scope change.
Never log secrets, pickup proofs/codes, provider tokens or raw sensitive payloads.

## 3. Existing implementation patterns

### Inspected boundaries and reusable downstream contracts

`apps/api/src/modules/dispatch` staff controller uses literal `@Controller("v1/staff")`;
check-in uses `@Controller("v1/staff/check-in")`; Native Staff auth uses
`@Controller("v1/staff/auth/native")`. These prove current routes, not a normalized
new route convention. Consume exact existing exports from `packages/contracts/src`
and `packages/employee-client/src/index.ts`; inspect exports before referencing a
helper. Native-specific transport must preserve the same domain semantics.

The current check-in module imports AuthModule, RuntimeDatabaseModule and HTTP
infrastructure and wires request-ID middleware, OCR providers and thin HTTP
services into explicit command/transaction boundaries. Follow the actual nearest
module's imports/providers/middleware, error mapping, operation runner and runtime
DB/auth wiring if an accepted gap requires API work. Do not put domain SQL in a
new controller or collapse executors into a service-owned command layer.

`apps/api/src/modules/valet-sessions` protected custody executor and
`complete-check-in-command.ts`, `apps/api/src/modules/parking` confirm-parked
commands, and `apps/api/src/modules/retrieval/complete-handoff-command.ts` prove
current authorization/lock/guard/write/audit patterns. Shift eligibility reads
are preconditions; they do not independently prove a later dispatch write is
atomic against revocation. Preserve the owning transaction's contract.

Portable sessions own nonvisual state and recovery; Native adapters own transport,
secure storage, camera and lifecycle. At baseline `native-auth-session.ts` is 299
lines and `employee-operational-session.ts` is 295: inspect current authored-line
counts and extract focused responsibility before additions near the 300-line
ceiling. Do not compress code or introduce speculative frameworks to evade it.

### Explicit entity and transition ledger

Affected entities are User, OrganizationMembership, Organization, Location,
LocationAccess, Shift, Vehicle, Customer, ValetSession, Task/Dispatch, parking
zone/spot and key-custody records, handoff verification, independent payment,
incident/photo/tracking records and append-only audit. DEC-073 adds its dedicated
StaffPushRegistration/Intent/Delivery entities in the push children only.

| Owning Native slice | Existing authoritative transition / no-transition boundary |
| --- | --- |
| MOB-010 baseline, MOB-011A/B | Intake establishes CHECKING_IN; Vehicle identity/detail and condition commands preserve custody state until complete-check-in performs CHECKING_IN → AWAITING_PARKING |
| MOB-029/012A/B | Task assignment/acceptance are separate; start-parking performs AWAITING_PARKING → PARKING, confirm-parked performs PARKING → PARKED with accepted atomic spot/key effects |
| MOB-013 | Guest request creates PARKED → REQUESTED and retrieval work; Native consumes authoritative Task and start-retrieval performs REQUESTED → RETRIEVING, mark-ready performs RETRIEVING → READY |
| MOB-014A/B | Begin handoff READY → HANDOFF_PENDING; verification/override do not release; abort HANDOFF_PENDING → READY; complete handoff HANDOFF_PENDING → COMPLETED |
| MOB-015A/B | Shift lifecycle is separate; accepted start/end commands cannot substitute for Task or custody transitions |
| MOB-016/017A/B/019/020–022 | Read/navigation, incident, Guest Access, tracking and attention do not invent custody transitions; each retains its own accepted lifecycle |

Source: `docs/04_VALET_SESSION_STATE_MACHINE.md` and the named current command
executors. Do not infer support for a new correction/exception route merely from
a conceptual state-machine edge. Guest cancellation and any focused return-to-
parking/correct-ready flow require their existing accepted command/entry boundary;
Native must render server changes safely without fabricating new employee actions.
Task assign/accept/decline/reassign semantics and actor roles come from current
dispatch contracts. MOB-029 audits all live Web entry points and preserves them;
it does not invent supervisor controls that are only backend capabilities.

### Exact Web audit entry points

All paths below are relative to `apps/valet/src`. These are verified locators;
V still resolves their live state owner, shared styling and copy at the task SHA.

| MC rows | Screen and orchestration locators |
| --- | --- |
| MC-04–08 | `components/screens/check-in-flow.tsx`, `components/screens/check-in/check-in-{plate-camera,returning-vehicle,vehicle-details}-step.tsx`, `check-in-intake-steps.tsx`, `check-in-late-steps.tsx`; `features/check-in/check-in-{controller,mutations,api}.ts` and resume-identity tests |
| MC-09–10 | `components/screens/parking-flow.tsx`, `parking-spot-confirm-step.tsx`, `parking-key-return-step.tsx`; `features/parking/parking-{controller,task-runner,api}.ts` |
| MC-11–13 | `components/screens/retrieval-flow.tsx`, `retrieval/retrieval-live-steps.tsx`, `retrieval-handoff-live-steps.tsx`, `retrieval-handoff-live-release-steps.tsx`; `features/retrieval` and `features/handoff` controllers/API/recovery |
| MC-14–18 | `components/screens/shift-start-screen.tsx`, `shift-summary-live.tsx`, `vehicles-list-live.tsx`, `incident-live-form.tsx`, `guest-access/guest-access-flow.tsx`; corresponding feature loaders/commands and shell gates |
| MC-19/23 | `components/screens/scan-hub-live.tsx`, `components/shell/employee-live-router.tsx`, `employee-navigation.ts`, `components/ui/employee-primitives.tsx`, current icon/token/locale sources |

Use production/live references rather than prototype success controls. In
particular current live handoff consumes the financial release guard; prototype
cash/tip displays do not prove a live Employee cash-collection capability. MOB-014B
must preserve every actual live financial entry/status it finds and identify any
accepted-MVP gap separately, without silently adding a payment processor or
treating a prototype as financial authority. Parking evidence includes DEC-068
in-flight compatibility; do not strand an existing session created under the
accepted earlier custody mode.

### F. Web → Native migration coverage matrix

Each MC row is one capability contract. The two tables join on MC ID; together
they record authority, target, reuse, adapter, status, difference, missing work,
security/concurrency, tests, visual evidence and decision gate. Web paths are
rooted at `apps/valet/src`; API paths at `apps/api/src/modules`. Inspect the exact
current live screen/controller before each task; a directory name is an audit
entry point, not sufficient visual evidence.

| ID / Web capability and reference | Current backend authority | Native target / portable reuse | Platform adapter | Current parity / missing work / intentional difference |
| --- | --- | --- | --- | --- |
| MC-01 Login/restore; staff auth and `components/shell/employee-access-gate.tsx` | Native Staff auth, DEC-072 | Existing native-auth session; MOB-028 | SecureStore, lifecycle | Transport implemented; production access presentation/evidence open; accepted cookie-vs-Native-token transport difference only |
| MC-02 Organization/Location/active Shift; `components/shell/employee-operational-gate.tsx` | Staff operational context/access/Shift | Existing employee-operational session; MOB-028/015A | Foreground | Context implemented; production scope routing and shift entry missing; no product difference |
| MC-03 Task queue/accept/refresh; `features/task-queue`, `components/screens/task-queue-screen.tsx` | Dispatch/Task commands and versioned projections | Existing operational client; MOB-029 | Foreground/attention | POC tasks implemented; production queue, polling policy adaptation and render closure missing |
| MC-04 New/manual/no-plate intake; `features/check-in`, check-in screens | Check-in/ValetSession, DEC-068/069 | Existing employee-check-in client; MOB-010B | Keyboard | Merged; current physical/render evidence open; no intentional capability loss |
| MC-05 Plate camera/OCR; check-in plate scan screens | DEC-074 OCR boundary | Existing candidate/confirm loop; MOB-010B/010C | Camera, multipart File | Implemented; real device proof open; production provider intentionally unavailable pending U-001 |
| MC-06 Returning vehicle/customer; check-in discovery/returning screens | DEC-069 scoped discovery/confirmation | Existing portable discovery/identity state; MOB-010B | Keyboard | Merged implementation; matched returning/no-match/conflict proof open; OCR is not returning identity authority |
| MC-07 Vehicle identity/detail/condition; check-in details, identity correction and condition screens | Vehicle identity/details and ValetSession condition commands | MOB-011A/011B; extract compatible validation/recovery | Camera/manual identity; photo child separately | Missing Native continuation/correction flow; no historical rewrite or autonomous identity |
| MC-08 Condition-photo policy/upload; condition UI | Configured policy; `vehicle-photos/README.md` is a placeholder, not a byte pipeline | MOB-011C/011D conditional U-002 | Camera/private byte upload | No verified Native byte pipeline established; metadata alone cannot satisfy required evidence |
| MC-09 Complete check-in/start parking; parking screens | Complete-check-in/start-parking commands, DEC-068 | MOB-011B/012A; command adapters | Lifecycle | Missing; never bind key during intake |
| MC-10 Parking zone/spot and key assignment; parking confirmation UI | Confirm parked plus parking/key constraints, DEC-068 | MOB-012B; validation/command recovery | QR/manual input | Missing; park confirmation binds spot/key atomically; no split local custody |
| MC-11 Retrieval/checkout/Mark Ready; retrieval screens | Retrieval/keys/dispatch domain commands | MOB-013; shared workflow state | QR/lifecycle | Missing; Task state remains separate from custody |
| MC-12 Pickup code/Dynamic QR/abort/override; handoff screens | Handoff commands/proof/attempt limits | MOB-014A; neutral scanner intent | Camera, privacy, keyboard | Missing; no authority from scan or stale proof |
| MC-13 Final release/payment guard; handoff completion UI | Complete handoff, financial guard, DEC-057 | MOB-014B; command recovery | Lifecycle | Missing; payment remains separate; no new cashier/processor product invented |
| MC-14 Shift start/active; shell start-shift panel | Shift commands/eligibility | MOB-015A; operational session | Foreground | POC/context support exists; production start/access presentation missing |
| MC-15 Shift summary/end; `components/screens/shift-summary-live.tsx` | Shift summary/end commands | MOB-015B; accepted recovery | Lifecycle | Missing production flow; no local end-of-shift authority |
| MC-16 Vehicle directory/lookup; `features/vehicles-directory` | Staff scoped directory/projections | MOB-016; bounded loader/view model | Keyboard | Missing; rows are navigation hints, never mutation authorization |
| MC-17 Incident reporting; incident screens/features | Incident commands, independent lifecycle | MOB-017A; validation/recovery | Keyboard; approved photo path only | Missing; no damage AI/ClaimShield |
| MC-18 Guest Access; guest-access screens/features | Staff issuance/rotation command, DEC-063 | MOB-017B; route/token lifecycle | QR display/native presentation | Missing; no ordinary storage/logging of raw bearer material |
| MC-19 Shell/nav/scan hub; `components/shell/employee-live-router.tsx`, `employee-navigation.ts` | DEC-066 and fresh backend projections | MOB-028/018A; neutral route/scan intent | Router/back/safe area/camera | Foundation shell only; production graph/scan dispatch missing |
| MC-20 Retrieval attention/notifications; `employee-retrieval-alert.tsx` | DEC-073, retrieval/dispatch authority | MOB-029/020A–D/021/022; neutral notification intent | FCM/notifications; later APNs | Web foreground alert exists; Native durable push missing; accepted platform attention difference |
| MC-21 Maps/task tracking; tracking/map feature boundaries | DEC-045 and related tracking decisions | MOB-019A/B; portable policy projection | Native location/maps | Native sensor contract/pilot scope U-003; no shift-wide surveillance |
| MC-22 Offline/recovery and identity changes; feature controllers + shell connectivity | DEC-063, DEC-072, each command contract | MOB-023A/B across all portable sessions | Network/lifecycle/SecureStore | Partial implemented foundations; integrated process-death/full-shift proof missing |
| MC-23 EN/AR, RTL/LTR, accessibility, all visible states | DEC-071, Web copy/tokens, Blueprint | Every flow plus MOB-018B | Native text/focus/keyboard | Shared presentation exists; cross-flow closure missing; no deferred translation pass |

| MC ID | Security / concurrency implication | Test evidence at baseline → required proof | Visual evidence at baseline → required proof | Decision |
| --- | --- | --- | --- | --- |
| MC-01 | Refresh rotation, auth generation, logout purge | Portable/Native local suites → physical restore/failure and two-principal scope tests | Unverified current production access render → V | None for accepted auth |
| MC-02 | User ≠ membership ≠ Organization ≠ Location ≠ Shift | Existing context tests → invalidation during workflow | POC → V all access/no-shift states | None |
| MC-03 | Version conflict, assignment eligibility, refresh races | Existing task tests → actual concurrent accept/reassign + reconnect load | POC → V queue/empty/stale/conflict | U-004 only for final SLO |
| MC-04–06 | Server scope, duplicate intake, candidate not identity, provider bounds | Local intake/OCR tests → physical bytes, unknown outcome, no-plate/returning races | Shared primitives/source alignment → matched actual Android intake pairs | U-001 production OCR only |
| MC-07 | Vehicle identity/detail expected version, condition/completion and append-only correction audit | Backend capability exists → adapter + live concurrent identity/custody/condition command tests | No Native production proof → V detail/edit/unknown-to-known/condition/error | None |
| MC-08 | Private bytes, ownership, type/size, verified completion | No qualifying Native upload proof → real storage boundary tests conditional on U-002 | No Native proof → conditional V capture/upload/failed/retry | U-002 |
| MC-09–10 | Atomic custody, contested spot/key, null key until parked | Existing commands → duplicate/stale/cross-scope real DB tests | No Native proof → V stage/scan/conflict/continuation | None |
| MC-11 | Assigned actor, key checkout, terminal/version guards | Existing commands → multiple employee race + response loss | No Native proof → V each retrieval stage | None |
| MC-12–13 | Single-use expiring proof, role-specific override, financial release | Existing guards → two principals, proof replay/expiry + payment race | No Native proof → V denied/pending/verified/release | None |
| MC-14–15 | Membership-scoped Shift, task/end race | Existing Shift authority → actual invalidation/unknown end result | POC support → V start/blocked/summary/end recovery | None |
| MC-16 | Bounded tenant/Location projection; stale row | Existing Web loader tests → IDOR/read freshness/large list | No Native proof → V loading/empty/search/error | None |
| MC-17–18 | Independent incident lifecycle; bounded free text; secret issuance | Backend capability → duplicate/ambiguity, cross-scope, secret purge | No Native proof → V form/result/expired/recovery | None unless byte upload U-002 is needed |
| MC-19 | Reauthorize intent; no secret route params | Web navigation tests → invalid/dead intent + process restore | Foundation → V full route graph/back/scan | None |
| MC-20 | Push attention only; registration ownership; durable bounded attempts | No Native push stack → migrations, hard kill/lease, device tap/provider outage | No Native proof → OS + in-app comparisons; generic payload | U-005 deployment values |
| MC-21 | Config default OFF; task scope only; no local policy authority | Accepted backend capability → conditional sensor/privacy/stop tests | No Native proof → conditional V permission/tracking states | U-003 |
| MC-22 | No blanket retry or durable command queue | Local session tests → induced real disconnect/kill/revocation | Partial foundation → V ambiguity/stale/reconnect | None; U-004 thresholds |
| MC-23 | Accessible truthful state; identifiers retain meaning | Existing presentation tests → per-flow EN/AR/a11y regression | Source alignment only → physical matched matrix | No numeric score selected |

No capability is silently dropped. Conditional rows remain explicit pilot blockers
if required by the selected Location policy; optional default policy is not permission
to fake uploaded evidence, enable OCR without cost protection, or invent tracking.

## 4. LOCKED decisions

These are atomic policy propositions, each with exactly one classification.
The last column records the falsification search performed against the named
source; current implementation is not silently promoted to future policy.

| ID / proposition | Classification | Source and evidence type | Falsifier searched / result |
| --- | --- | --- | --- |
| L-01 Backend commands own custody; Task/Dispatch is separate | LOCKED | AGENTS §6, docs 04, protected custody executors; CURRENT POLICY | Generic client-settable state authority in binding rules: forbidden |
| L-02 Web is Native visual source; material unexplained differences block completion | LOCKED | Owner task §§7–9, DEC-071 §10; NEW TASK POLICY | Permission for Native redesign/deferred feature parity: none; explicit opposite |
| L-03 Use the existing Native presentation foundation without domain ownership | LOCKED | Owner task §9, `src/employee-ui/**`; NEW TASK POLICY + CAPABILITY | Requirement for a second system: none; current primitives exist |
| L-04 One Expo app, portable TypeScript, platform adapters, same product identity | LOCKED | DEC-071 §§4–10/14; CURRENT POLICY | Accepted separate Android/iOS product fork: none |
| L-05 Android floor API 29, compile/target 36; prescribed OS/OEM matrix | LOCKED | DEC-071 §§8/15; CURRENT POLICY | Lower framework technical floor as product support policy: explicitly distinguished |
| L-06 Native Staff auth uses memory access and secure refresh with rotation/purge | LOCKED | DEC-072; `native-auth-*`; CURRENT POLICY | Ordinary storage/access token persistence exception: none |
| L-07 No generic durable mutation queue or blind replay | LOCKED | DEC-063, owner §§6/11; CURRENT POLICY | Generic offline replay permission: explicitly prohibited |
| L-08 Key binding occurs at parked confirmation, not intake | LOCKED | DEC-068; parking/key commands; CURRENT POLICY | Check-in key assignment requirement: replaced by post-parking policy |
| L-09 OCR is assistive; production needs shared cost guard preserving accepted limits and otherwise fails closed | LOCKED | DEC-074 §22; OCR provider/limiter boundary; CURRENT POLICY | Process-local limiter accepted for production: explicitly excluded; public limits remain binding |
| L-10 Push is attention only with dedicated durable delivery and bounded duplicate possibility | LOCKED | DEC-073; CURRENT POLICY | Push command authority/exactly-once display/general outbox: explicitly excluded |
| L-11 Task tracking obeys configured task scope, default OFF | LOCKED | DEC-045, AGENTS §6; CURRENT POLICY | Shift-wide default surveillance: forbidden |
| L-12 Web coexistence, org-controlled signing, OTA disabled, iOS smoke before final pilot | LOCKED | DEC-071 §§9/10/16/17; CURRENT POLICY | Automatic Native-primary cutover or Web deletion: not authorized |

## 5. DERIVED conclusions

| ID / proposition | Classification | Source / evidence type | Falsifier searched / result |
| --- | --- | --- | --- |
| D-01 Rebaseline can start from merged main, without merging implementation work | DERIVED | Fresh refs at `6c965a1`, Git ancestry; CAPABILITY | Native feature ahead of main: comparison `0 / 0` |
| D-02 MOB-006–010A must not be described as unimplemented | DERIVED | Git anchors and Native/portable feature tree in §1; CAPABILITY | Absent merged implementation: files/commits present; proof remains a separate question |
| D-03 Production navigation and downstream custody flows need bounded new slices | DERIVED | `FoundationShell`, Native route/feature inventory; CAPABILITY | Completed production Native graph/parking/handoff screens: not found in current tree |
| D-04 Five-second polling is a Web load hypothesis, not verified Native behavior | DERIVED | Web `task-queue-controller.ts` default 5000; Native task panel/operational session; CAPABILITY | Equivalent active Native periodic loop: not found; manual/foreground refresh present |
| D-05 Push implementation and physical readiness cannot be inferred from accepted DEC/code tests | DERIVED | DEC-073 vs schema/API search; §1 evidence ledger; CAPABILITY | StaffPush tables/worker or current device/CI artifact: not found in inspected baseline evidence |

Falsification coverage: 17 / 17 LOCKED+DERIVED conclusions checked. This counts
these propositions, not every possible runtime claim or repository file. Candidate
claims “Native may redesign,” “push can authorize commands,” and “local tests prove
physical readiness” are CONTRADICTED by the owner/DEC-073/evidence rules respectively.
An absent Native capability remains implementation work; authority conflicts require affirmative conflicting policy evidence.

## 6. UNRESOLVED decisions

### V. Stable owner/decision gates

| ID / unresolved proposition | Classification | Evidence required / accountable gate | Affected work and allowed envelope |
| --- | --- | --- | --- |
| U-001 Which production OCR shared/durable cost guard and deployment approval satisfy DEC-074? | UNRESOLVED | MOB-010C: inspect existing anti-abuse semantics, cross-process enforcement and privacy/provider configuration; accepted public limits are already locked, only mechanism/enablement remains open | IF a mechanism is Accepted, MOB-010D implements only it; otherwise retain production UNAVAILABLE and manual/no-plate fallback. Do not repurpose existing scopes silently |
| U-002 What verified condition-photo byte pipeline is available, and what pilot photo policy must Native support? | UNRESOLVED | MOB-011C: trace current object-storage/initiation/verification/ownership contracts against actual Web; owner resolves missing material upload/retention semantics before MOB-011D | IF existing accepted byte pipeline suffices, adapt it; IF a new contract is needed, decision first. Photo-required pilot cannot pass on metadata or an unverified URI |
| U-003 What Native tracking acquisition/permission/sampling contract and pilot inclusion implement accepted task-scoped policy? | UNRESOLVED | MOB-019A: reconcile DEC-045 and related tracking decisions with mobile lifecycle/battery/privacy and current adapters; owner accepts only missing Native details | IF included, MOB-019B implements the Accepted adapter contract; IF excluded from pilot by owner, retain explicit scope/defer record. Core task-scoped policy is already accepted; no re-vote on server authority |
| U-004 What measured pilot capacity and performance/SLO thresholds are accepted? | UNRESOLVED | MOB-025A: present measured baselines, hardware/cohort assumptions, latency/staleness/error/recovery and soak results; owner records thresholds before go/no-go | Use proposed experiments, not invented pass numbers. Correctness hard-zero requirements remain binding regardless of threshold |
| U-005 What typed push retry/TTL/lease/retention/provider deployment values satisfy DEC-073? | UNRESOLVED | MOB-020D with release owner: choose validated finite values, timeout shorter than lease, secret custody and provider environment; record approved deployment configuration | DEC-073 selects state machine/FCM/fencing; values remain unset here. No new payload fields, provider service or persistence semantics inferred |
| U-006 Which release environments, accountable account/signing custodians, pilot Locations/devices/cohort and go/no-go owners are approved? | UNRESOLVED | MOB-026A then MOB-027A/B: owner records names, recovery/access, provisioning evidence, cohort, support and rollback thresholds | DEC-071 fixes ownership/OTA/product IDs. No production identifiers, credentials, provisioning or cutover is selected or performed by this plan |

DEC-074 §22 already locks the later production cost identity to server-derived
Organization + Membership + target Location, one call in flight, at most five
calls per 10 seconds and 20 per 60 seconds per key, and fail-closed behavior when
authoritative limiter state is unavailable. U-001 does not reopen these values;
only a later Owner Decision could change them.

These gates stop only their dependent implementation/release assumptions. They do
not prevent documentation completion or the immediate evidence-reconciliation task.
No Proposed choice below is an Accepted Decision. No new exact route, DTO, role
allowlist, error/event, schema column or lock mechanism is chosen for U-001–006.

## 7. Risks / boundary violations

### Authorization-before-mutation proof (A)

Every protected operation below inherits this ordered proof and supplies its
operation-specific target/authority test in its task: (1) authenticate principal;
(2) resolve persisted target and scope; (3) prove the accepted operation-specific
ownership, tenant, Location and role authority; (4) apply the existing required
concurrency protection, loading/locking scope earlier where necessary; (5) mutate;
(6) append the required accepted audit record in the same transaction; (7) commit;
(8) on retry, fallback or protected re-read, re-prove scope before returning state.
A guarded write is acceptable only when its persisted predicate proves the entire
accepted authority condition before change. Never mutate-then-authorize, use
RETURNING as the first ownership probe, or excuse an unauthorized write with rollback.

Apply A to intake/vehicle identity/detail correction/condition/completion, Task accept/reassignment, start/confirm
parking and key custody, retrieval/ready, handoff issue/verify/abort/override/release,
Shift start/end, incident creation, Guest Access issuance/rotation and tracking
writes if included. Auth/session and push registration/delivery use their specific
Accepted auth/privacy contracts; no new audit event is invented just because an
operation is sensitive. Inspect the existing writer's supported entity/metadata
scope; a safe key does not make a free-text reason safe.

Identity stays `User -> OrganizationMembership -> Organization -> Location -> Shift`.
Membership uniqueness does not imply global per-User uniqueness across Organizations.
Roles do not mechanically inherit one another. Test two real authenticated
principals for object-level denial as well as anonymous authentication failure.

### Races and check-use intervals

Each row states Transaction A/B, resources, sequence, unsafe interleaving, existing
protection, missing proof, possible linearization, decision classification and owner.
Mechanisms listed as existing are evidence to re-check in the exact command, not
permission to impose that mechanism on a different unresolved feature.

| Race / Transaction A and B | Resources / read-write-lock sequence and unsafe interleaving | Existing protection / missing proof / linearization | Classification / owner |
| --- | --- | --- | --- |
| R-01 A accepts/reassigns Task; B ends Shift or revokes access/disables User, membership, Organization or Location | A authenticates/resolves scope, evaluates eligibility, then writes Task; B invalidates between read and write | Dispatch command transaction/version/eligibility guards exist; a read helper alone is insufficient. Reproduce each invalidator against actual write path and inspect locks/guarded predicates. Existing protected command commit is candidate linearization only if the race proof holds | DERIVED current boundary; MOB-029 + MOB-015B own proof; any newly discovered semantic gap requires decision, not client compensation |
| R-02 A confirms parking; B claims same spot/key or updates same session | Resolve authorized session/spot/key, run existing locks/guards, write custody + audit; stale free-space read can lose race | `parking` confirm-parked and `keys/parking-key-custody.ts`, DB occupancy/key integrity enforce current contract. Need real overlapping transactions, rollback and lost-response tests. Protected atomic commit is linearization | LOCKED custody invariant, existing mechanism revalidated; MOB-012B |
| R-03 A starts retrieval/marks ready; B reassigns Task or mutates session/key | A checks actor/version/custody then writes; B changes assignment/key before A uses stale projection | Existing retrieval/dispatch command locks, versions and terminal guards; test live overlap and no double checkout. Commit with accepted guards is linearization | LOCKED domain contract; MOB-013 |
| R-04 A releases vehicle; B consumes/expires proof or changes financial/policy state | Auth target, lock/guard proof/session/payment as current executor requires, release+audit; stale verified UI must not bypass B | `complete-handoff-{command,locks,guards}.ts`, `handoff-release-guard.ts`; test exact time/policy/financial boundary and two callers. Guarded release commit is linearization, not UI verification | LOCKED; MOB-014A/B |
| R-05 A starts/ends Shift; B starts competing Shift or assigns protected work | Membership/Shift/access/Task resources; A resolves authority and existing Shift transaction; B writes between eligibility read and use | Existing Shift constraints/commands and dispatch consumer contract; test per-membership scope, not invented global User uniqueness. Commit/constraint outcome depends on actual statement path | DERIVED proof obligation; MOB-015A/B and MOB-029 |
| R-06 A refreshes; B logs out/revokes or rotates same session | Native auth session/token generation, secure refresh storage; stale A response may repopulate cleared identity | DEC-072 server rotation/replay and portable generation guards exist; physical SecureStore failure/process kill proof missing. Server rotation/revocation commit plus client generation guard protect different boundaries | LOCKED; MOB-010B/023A |
| R-07 A creates intake/incident/Guest Access or corrects vehicle identity/details/condition; B repeats or changes target before response | Persisted session/Vehicle scope + command-specific idempotency/version; concurrent identity/custody edit can invalidate the checked version, and response lost after commit must not create a second protected effect | DEC-063 and individual executors including `vehicles/vehicle-identity-command.ts` and `vehicle-details-command.ts`, not a generic retry wrapper. Real duplicate/unknown-result/purge and expected-Vehicle-version tests needed; accepted command commit is linearization | LOCKED existing command semantics; MOB-010B/011A/B/017A/B/023B |
| R-08 A sends OCR; B sends on another process or identity scope | Authenticated scope and provider budget; per-process read/count cannot bound cross-process spend | DEC-074 development limiter only; production fail-closed. Shared protection and any persistence/atomic mechanism missing until U-001; no selected production linearization | UNRESOLVED mechanism U-001; MOB-010C |
| R-09 A claims/sends push; B reclaims expired lease or token rotates/logout occurs | Persist intent with business transaction, claim short DB lease, commit before provider I/O, fence finalization; crash after acceptance can duplicate attempt | DEC-073 requires durable states, lease/fence and fresh eligibility; not implemented. No claim of remote exactly-once. DB claim/finalize linearize local state, provider acceptance is separate | LOCKED architecture; U-005 values; MOB-020A–D/021/022 |
| R-10 A uploads condition photo or samples tracking; B changes ownership/policy/task/lifecycle | Existing accepted target authority must precede bytes/point acceptance; stale client context cannot authorize | Trace actual upload/tracking boundary first. Native adapter/required missing contract and exact new mechanism remain conditional U-002/U-003; no selected new linearization | UNRESOLVED Native gap; MOB-011C/019A/B |

For R-01–05 and R-07, exercise all three competing-transaction branches: B commits
(A must observe/reject/reconcile according to the existing command), B rolls back
(A re-evaluates under the existing isolation/constraint behavior), and A or B loses
its response (caller outcome unknown, authoritative re-read/accepted idempotent
retry with renewed authorization). Do not promise a universal conflict code or
uniqueness error. Database integrity and caller-visible outcome are separate.
For R-06 add crash before/after secure-store write. For R-08 fail closed before
provider I/O until U-001 closes. R-09 tests DB commit/send failure, send acceptance/
finalize failure, crash between them and recovery racing a live worker; bounded
at-least-once attempts may duplicate attention, never a domain command. R-10's
commit/rollback/unknown tests follow the eventual Accepted boundary, not invented
upload/tracking semantics.

Free-text incident/override reasons require accepted length/normalization rules,
PII/secret handling, retention and audit necessity review. Never copy raw notes,
headers, images, tokens, plates or phone data into diagnostic breadcrumbs. Provider
URLs stay controlled by adapters; if a later decision admits user-supplied URLs,
its security gate must cover redirects, private/IPv4-mapped IPv6 destinations,
DNS rebinding/TOCTOU and network egress, not only a string URL validator.

## 8. Proposed implementation plan

### D. Old plan → New plan traceability map

Old IDs remain historical parent IDs. Suffixes are new bounded execution children;
new MOB-028/029 repair missing program structure. A completed old policy decision
is not reopened by splitting its implementation. No previously merged MOB-010
presentation repair is relabeled unfinished implementation.

| Old task | Actual current state | New owner of remaining work | Disposition |
| --- | --- | --- | --- |
| MOB-001 platform decision | Accepted DEC-071, later amended | MOB-026A/027B enforce release policy | Historical decision complete |
| MOB-002 Native auth decision | Accepted DEC-072 | MOB-010B/023A verify transport | Historical decision complete |
| MOB-003 push decision | Accepted DEC-073 | MOB-020A–D/021/022 | Historical decision complete; implementation pending |
| MOB-004 integration architecture | Merged foundation/portable architecture | Every child preserves boundaries | Historical design absorbed; do not recreate |
| MOB-005 Expo foundation | Merged implementation | MOB-010B physical foundation reconciliation | IMPLEMENTED — EVIDENCE OPEN |
| MOB-006 portable employee client | Merged `packages/employee-client` | MOB-010B baseline; feature children extend it | Implemented baseline absorbed, not NOT STARTED |
| MOB-007 Native Staff auth | Merged transport/session/adapters | MOB-010B/028/023A | Implemented baseline; production presentation/evidence remains |
| MOB-008 operational bootstrap/tasks | Merged scoped context/task panel | MOB-028/029/015A | Implemented baseline; production closure split |
| MOB-009 native QR | Merged scanner/camera/fallback | MOB-010B/018A and each consuming flow | Implemented baseline; device evidence open |
| MOB-010 check-in/returning parity | Merged intake, shared presentation and repairs | MOB-010B evidence; MOB-011A/B downstream continuation | Implemented baseline; never replay old repair plan |
| MOB-010A assistive plate OCR | Accepted DEC-074 and merged implementation/repairs | MOB-010B physical evidence; MOB-010C/D production decision/implementation | Implemented baseline; production guard intentionally unavailable |
| MOB-011 identity/condition | Native continuation work not started | MOB-011A/B/C/D | Split identity/detail corrections, condition/completion, photo decision and conditional verified byte adapter |
| MOB-012 parking/key/spot | Native production work not started | MOB-012A/B | Split launch from atomic parked confirmation |
| MOB-013 retrieval/ready | Native production work not started | MOB-013 | Preserved bounded parent |
| MOB-014 handoff/release | Native production work not started | MOB-014A/B | Split verification/abort/override from final release |
| MOB-015 Shift | Context/POC support only | MOB-015A/B | Split start from summary/end |
| MOB-016 directory | Native production work not started | MOB-016 | Preserved |
| MOB-017 incident/Guest Access | Native production work not started | MOB-017A/B | Split independent capabilities |
| MOB-018 UI/localization/accessibility | Shared intake presentation merged; cross-flow closure missing | MOB-018A/B plus per-feature V | Navigation/scan closure and final cross-flow audit; no late parity dump |
| MOB-019 tracking | Accepted backend policy; Native acquisition unresolved | MOB-019A/B | Decision gate then conditional adapter |
| MOB-020 backend push | Accepted architecture; no implementation found | MOB-020A/B/C/D | Split schema, registration, intent, worker/provider |
| MOB-021 Native push integration | Not started | MOB-021 | Preserved |
| MOB-022 push lifecycle | Not started | MOB-022 | Preserved |
| MOB-023 lifecycle/recovery | Foundations present; integrated hardening missing | MOB-023A/B | Split identity/network from protected workflow/process death |
| MOB-024 observability | Request IDs/development diagnostics exist; production program missing | MOB-024A/B | Split instrumentation from operations/runbooks |
| MOB-025 production validation | No current full program proof | MOB-025A/B | Split baseline/thresholds from adversarial/soak acceptance |
| MOB-026 release | Policy accepted; release evidence not established here | MOB-026A/B | Split ownership/config gate from signed distribution |
| MOB-027 pilot/cutover | Not started | MOB-027A/B | Split controlled pilot from owner cutover/rollback decision |

### Q–T. Batch map, dependency graph, gates and safe lanes

| Batch | Tasks | Exit gate |
| --- | --- | --- |
| B0 Evidence and production shell | MOB-010B, MOB-028, MOB-029, MOB-015A | G0: baseline device/parity evidence reconciled; G1: authenticated scoped production shell/queue/start works with truthful recovery |
| B1 Intake continuation and parking | MOB-011A/B, MOB-012A/B; conditional MOB-011C/D | G2: intake → parking/key custody demonstrated end-to-end; required photo policy cannot bypass U-002 |
| B2 Retrieval, release and Shift closure | MOB-013, MOB-014A/B, MOB-015B | G3: actual multi-actor full custody cycle + secure guarded release and Shift closure |
| B3 Supporting workflow and visual closure | MOB-016, MOB-017A/B, MOB-018A/B | G4: coverage matrix has no unexplained capability loss; all required screen/state V evidence reviewed |
| B4 Conditional capability gates | MOB-010C/D, MOB-019A/B, MOB-011C/D when applicable | G5: U-001/002/003 disposition explicit; included capabilities have accepted implementation and proof |
| B5 Push | MOB-020A/B/C/D, MOB-021, MOB-022 | G6: real DB/provider/lease failures and physical lifecycle/tap proof; U-005 configuration approved |
| B6 Cross-cutting reliability and operations | MOB-023A/B, MOB-024A/B | G7: integrated failure/recovery and redacted support/runbook evidence |
| B7 Capacity and release qualification | MOB-025A/B, MOB-026A/B | G8: U-004/006 settled, signed candidate, required device matrix, iOS build smoke, release provenance and rollback drill |
| B8 Controlled pilot and cutover | MOB-027A/B | G9: owner evidence-based go/no-go; Web remains available |

Dependency graph (AND means all listed prerequisites, conditional edges apply only
to an included capability):

```text
MOB-010B -> MOB-028 -> MOB-029 AND MOB-015A -> G1
G1 -> MOB-011A -> MOB-011B -> MOB-012A -> MOB-012B -> G2
G2 -> MOB-013 -> MOB-014A -> MOB-014B -> MOB-015B -> G3
G1 + MOB-011A -> MOB-016
G2 -> MOB-017A; G2 -> MOB-017B
G3 + MOB-016 + MOB-017A/B -> MOB-018A -> MOB-018B -> G4
MOB-010B -> MOB-010C (U-001) -> MOB-010D if accepted
MOB-011B -> MOB-011C (U-002) -> MOB-011D if accepted and included
MOB-011D -> G2 when photo policy requires it
G1 -> MOB-019A -> [U-003 inclusion] MOB-019B
U-001/002/003 dispositions + all included MOB-010D/011D/019B -> G5
G1 -> MOB-020A -> MOB-020B AND MOB-020C -> MOB-020D (U-005)
MOB-020B + MOB-028 -> MOB-021
MOB-020D + MOB-021 + MOB-029 -> MOB-022 -> G6
G1 -> MOB-024A -> MOB-024B
G4 + G6 + included G5 work -> MOB-023A -> MOB-023B
MOB-023B + MOB-024B -> G7
G1 -> MOB-025A baseline; G7 + U-004 -> MOB-025B
MOB-024B -> MOB-026A (U-006)
MOB-025B + MOB-026A -> MOB-026B -> G8
G8 -> MOB-027A -> MOB-027B -> G9
```

Batches are gate groups, not a demand to postpone observability or failure testing.
MOB-024A starts after G1; every earlier feature already includes safe diagnostics
and failure proof. MOB-025A collects early baseline, then refreshes only affected
measurements when integrations change. Production OCR remains unavailable until
U-001's accepted follow-on implementation is complete, even if B1–B3 proceed.

Safe independent planning/review lanes: read-only Web reference audits; device
qualification/evidence indexing; backend push design after DEC-073; operations
planning; supporting Native feature branches after their dependencies. There is
one writer per working tree. Any parallel implementation requires separate owned
branches/worktrees and explicit coordination before shared edits. Serialize
`employee-ui`, portable session exports, Native shell/routes, contracts, API module
wiring and all AGENTS high-contention docs/config/schema/lockfiles. One migration
owner; never parallel schema allocation. Integrate each branch only after independent
ChatGPT GitHub review and actual passing CI; Codex pushes its branch and stops.

### Complete task-card contract

Each future card below is the combination of its explicit fields and the mandatory
common fields in this table. Inheritance is deliberate: it avoids repeating the
same security/visual protocol while retaining every prompt-generation field.
A card's explicit scope narrows these defaults; it cannot weaken A, V, authority
or hard-zero gates. Decision-only/evidence-only cards explicitly identify code,
DB and device checks that are not applicable to that branch.

| Required field | Common value for every future task unless explicitly narrowed below |
| --- | --- |
| TASK ID / TITLE / STATUS / RELATIVE SIZE | Heading and card values; S = one focused proof/adapter, M = one flow or backend boundary. Split again before work if scope exceeds one reviewable feature branch |
| OBJECTIVE / WHY / USER/FIELD OUTCOME | Card objective, operational reason and outcome |
| DEPENDENCIES | Card prerequisites plus graph; evidence/owner gates are real blockers |
| READ FIRST | AGENTS, docs 00/07/13/17, this plan §§1–9, relevant current Accepted DECs, exact card Web/API/contract/portable paths and adjacent tests |
| CURRENT IMPLEMENTATION BASELINE | §1 and matching MC row, revalidated at fresh merged SHA; card states the delta |
| CORRESPONDING EMPLOYEE WEB REFERENCE | Card MC IDs and their exact Web entry points in §3; V requires resolved screen/controller/token/copy paths before code |
| IN SCOPE / OUT OF SCOPE | Card boundary; all other flows and §11 excluded; do not mix presentation repair with capability expansion |
| DOMAIN / BACKEND AUTHORITY | Matching MC authority and A; client cannot invent rules or transitions |
| EXISTING API / CONTRACT REUSE | Exact currently exported staff contracts and command transport for that MC; no fork, route/error/event invention |
| PORTABLE CLIENT LOGIC | Compatible nonvisual validation/state/orchestration/recovery in `packages/employee-client`; verify exports and extract near-ceiling files first |
| NATIVE PRESENTATION WORK | `src/employee-ui` plus focused feature composition; never domain/API/recovery ownership inside primitives |
| WEB VISUAL PARITY REQUIREMENTS / ALLOWED MOBILE DEVIATIONS | Full V before and after implementation; default MATCH WEB; only evidenced register rows permitted |
| EN/AR / RTL/LTR / ACCESSIBILITY | EN and AR implemented together, LTR identifier islands, keyboard/focus/TalkBack/large font/touch targets; all visible states |
| SECURITY INVARIANTS / AUTHORIZATION / TENANT / LOCATION IMPACT | A and hard-zero rules; fresh persisted target scope, no role hierarchy assumption, two-principal negative boundary tests |
| CONCURRENCY / IDEMPOTENCY / RECOVERY | Card R rows + existing command-specific DEC-063 semantics; duplicate/stale/commit/rollback/unknown outcomes, no blanket replay |
| CAMERA / SENSOR / PUSH / LIFECYCLE IMPACT | Card names active adapter; all workflows cancel stale async work and purge on identity/scope change; otherwise no new sensor/push behavior |
| EXPECTED FILE AREAS | Card families + their tests; new exact artifacts require target inspection; §10 artifact firewall applies |
| DB IMPACT / DEPENDENCY IMPACT | None by default. Proven gap or Accepted change requires explicit scoped plan; no dependency for convenience; pin/audit only when necessary and authorized |
| ANDROID REQUIREMENTS | Development Build, supported API/OEM matrix proportional to changed boundary, real device for affected native capability; final matrix M below |
| IOS PORTABILITY | Identify portable additions, Android adapter, likely iOS counterpart, accidental coupling and effort. Default no Android coupling; same Expo/TypeScript path |
| PERFORMANCE / FIELD-PRESSURE RISKS | Repeated actions/refresh, stale responses, slow API, list/input responsiveness; card adds specific pressure; thresholds follow U-004 |
| OBSERVABILITY | Safe request correlation, operation/outcome class, build/lifecycle context; no raw secrets/PII; operational telemetry separate from tenant audit |
| AUTOMATED TESTS | Focused portable, Native, contract and existing regression tests for affected behavior; do not mirror implementation with tautological tests |
| API/DB INVARIANT TESTS | Existing command integration tests plus real concurrent/two-principal cases for changed/consumed protected paths. For read-only UI, prove scoped projection and no accidental writes |
| REAL-DEVICE PROOF / VISUAL PARITY PROOF | Physical Android affected states + V matched pairs; automated screenshots/emulator never substitute. Evidence-only tasks reconcile artifacts; pure backend/decision tasks specify downstream device gate |
| FAILURE / RECOVERY PROOF | Real boundary failures where inducible; stale/duplicate actions, response loss, identity invalidation, lifecycle/purge; card names critical cases |
| LOAD / SOAK PROOF | Focused repeated-use trace per feature; relevant queue/provider/DB load and full-shift aggregate in MOB-025; no invented numeric pass threshold |
| VALIDATION COMMANDS | Profile C-UI, C-API or C-DOC below, plus named real boundary procedure. Record exact command/SHA/result and distinguish local from remote CI |
| REVIEW RISKS | Card risks plus authority drift, hidden scope, token leakage, unexplained visual differences and false evidence claims |
| ROLLBACK / FALLBACK | Revert isolated feature before release or restore tested signed binary; authoritative re-read and Employee Web fallback, never local data migration or audit deletion |
| DEFINITION OF DONE | Objective in scope delivered, focused checks green, required V/A/failure/device evidence reviewed, no hard-zero/material parity defect, merged after independent review + CI. Owner-gated branches cannot close dependent gates by assertion |

Validation profiles (resolve current scripts before each task; do not invent a
missing test command):

- C-UI: `corepack pnpm --filter @valet/employee-client test`,
  `corepack pnpm --filter @valet/valet-native test`, corresponding package `lint`
  and `typecheck`, `corepack pnpm architecture:check`, targeted Prettier and
  `git diff --check`. If portable Web consumers change, run affected Web tests,
  lint/typecheck/build too. Execute configured repository CI gates before merge.
- C-API: C-UI where affected, plus contracts/API/database package scripts from
  their current manifests, real PostgreSQL integration/concurrency tests and
  versioned migration checks on empty and representative existing data when
  schema changes. Schema sync is not migration proof; raw SQL paths use actual
  driver/SQLSTATE semantics, not assumed Prisma Client errors.
- C-DOC: targeted `corepack pnpm exec prettier --check` on changed docs,
  `python .agents/skills/vaylet-planning-guardian/scripts/audit_plan.py` for a changed
  plan, reference/decision mirror review and `git diff --check`/scope inspection.
- Real device/build/load procedures are evidence records, not fabricated package
  scripts. Use existing `corepack pnpm mobile:poc` only for its supported development
  harness; it does not prove a release binary. Build/config success is not runtime,
  graceful shutdown is not hard-kill recovery, and local CI commands are not a
  remotely observed passing workflow.

### MOB-010B — Merged intake/OCR and foundation evidence closure

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; S evidence branch; merged baseline
  including MOB-010A. This is the exact immediate next task (W).
- **OBJECTIVE / WHY / OUTCOME:** Reconcile existing MOB-005–010A evidence against
  current code so field capability is neither discarded nor falsely declared DONE.
  Read DEC-071/072/074, native auth/tasks/scanner/check-in and MC-01–06. No rewrite
  of the merged MOB-010 repair work. Produce a SHA/device/state evidence ledger.
- **SCOPE / FILES / REUSE:** Evidence and focused documentation only; Native and
  portable source/test families are read targets. DB/dependencies: none. Any defect
  becomes a separately bounded repair child before G0 closes, not an unreviewed
  expansion of this evidence branch. Domain/API behavior remains unchanged.
- **PROOF / RISK:** C-DOC plus rerun affected C-UI baseline; physical login/restore,
  QR repeated frames, camera open/close, returning/manual/no-plate paths and OCR
  multipart acceptance/HTTP result under permitted development configuration.
  Demonstrate candidate confirm/edit and production fail-closed. R-06/07/08;
  no raw image/plate/token logs. V covers all merged intake states in EN/AR.
- **PLATFORM / DONE / FALLBACK:** Real Samsung/mid-range device and recorded OS/build;
  iOS impact is documenting adapter gaps, no platform code. Record short repeated
  use/failure traces; final soak remains MOB-025B. G0 closes only with required
  evidence or a named repair child completed; Web remains available.

### MOB-028 — Production shell, access and context routing

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M; MOB-010B/G0.
- **OBJECTIVE / WHY / OUTCOME:** Replace foundation composition as production entry
  with coherent login/access/Location/active-Shift routing while preserving working
  intake. Employee always sees a truthful current scope. MC-01/02/19; read DEC-066,
  DEC-071/072 and Web active shell/live router/access gates.
- **SCOPE / FILES / REUSE:** Native `app/**`, focused shell/auth composition,
  `employee-ui` extensions and portable neutral route intent only. Reuse auth and
  operational sessions; do not grow their near-ceiling files. No new auth/API/DB,
  dependencies, task commands or capability redesign. Dedicated POC tools stay
  development-only and cannot be a production navigation destination.
- **PROOF / RISK:** C-UI, V login/restoring/denied/no-Location/no-Shift/active/error,
  Android back/keyboard/large-font, R-06 stale auth response and scope switch with
  an open workflow. Test cold intent before auth, no token route params, no protected
  state flash. Startup/readiness and repeated navigation traces; safe correlation.
- **IOS PORTABILITY / DONE:** Portable route intents, Expo Router composition and
  lifecycle adapter; future iOS safe-area/back/Keychain proof remains explicit.
  Physical production graph and scope purge must pass before G1; revert shell
  slice/Web fallback on failure.

### MOB-029 — Production task queue and foreground attention

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M; MOB-028; G1 also needs MOB-015A.
- **OBJECTIVE / WHY / OUTCOME:** Turn merged task functionality into the Web-aligned
  field queue with fresh status, accepted actions, foreground retrieval attention
  and measured refresh behavior. MC-03/20; Web task queue controller/cards/alert,
  dispatch decisions/contracts and DEC-063/073 are read first.
- **SCOPE / FILES / REUSE:** Native tasks and focused portable operational selectors/
  orchestration; existing dispatch endpoints/versions only. No backend push, new
  dispatcher rules, DB or dependency. Audit Web five-second timer; adapt scheduling
  to foreground/network without inventing a background polling service.
- **PROOF / RISK:** C-UI plus real API R-01/R-03 accept/reassign/stale refresh and
  two-principal scope tests. V queue states, badges, cards, dominant action and
  attention dismissal. Induce repeated refresh, 429/5xx, reconnect burst, background
  and Location/Shift invalidation; coalesce in-flight reads and prevent stale writes.
- **PLATFORM / DONE:** Physical list responsiveness and notification-independent
  freshness evidence; no FCM public coupling. iOS uses same queue/state with its
  lifecycle adapter. Measure request rate/staleness, do not claim five-second Native
  behavior until implemented/proven; restore Web if freshness becomes unsafe.

### MOB-011A — Vehicle identity, detail and intake continuation

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M; G1.
- **OBJECTIVE / WHY / OUTCOME:** Carry merged intake into a truthful vehicle detail
  view, accepted identity/detail correction and next operational stage. MC-07/19;
  read Web `check-in-vehicle-details-step.tsx`, `check-in-controller-resume-identity`
  tests, Staff projections, `vehicles/vehicle-identity-command.ts`,
  `vehicle-details-command.ts`, DEC-020/063/069 and navigation decisions.
- **SCOPE / FILES / REUSE:** Native detail/edit composition, portable scoped loader,
  validation and existing correction transport. Preserve human plate confirmation,
  unknown-to-known correction, expected Vehicle version and append-only audit.
  No condition mutation, photo upload, automatic Vehicle merge/recognition, parking
  or API/DB/dependency change. Server owns permitted fields and mutable session state.
- **PROOF / RISK:** C-UI + real API A/R-07: two-principal read/write denial, conflicting
  identity, concurrent custody/edit, stale Vehicle version, identical retry and
  unknown result. V detail/edit/confirmation/conflict/loading/continuation in EN/AR.
  Physical keyboard/manual/scan fallback, back/context preservation and repeated
  navigation/slow responses must not mix sessions or rewrite historical facts.
- **IOS PORTABILITY / DONE:** Shared validation/correction recovery, existing camera
  adapter only if invoked; no new sensor abstraction. Reviewed matched correction
  and continuation states close this slice; condition remains in MOB-011B.

### MOB-011B — Condition and check-in completion

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M; MOB-011A.
- **OBJECTIVE / WHY / OUTCOME:** Record accepted vehicle condition and complete
  check-in using existing server commands. MC-07/09; read Web condition/completion,
  `check-in-condition-command.ts`, `complete-check-in-command.ts`, DEC-063/068.
- **SCOPE / FILES / REUSE:** Native condition/completion feature and portable command
  state/validation; no photo byte implementation (MOB-011C), early key assignment,
  new condition policy, DB or dependency. Show configured photo requirements
  truthfully; block unsupported required evidence rather than fabricate completion.
- **PROOF / RISK:** C-UI + C-API existing command invariants, A/R-07 duplicate send,
  stale version, committed response loss and cross-scope denial. V condition,
  required-evidence block, busy, ambiguous, success/continuation. Physical repeated
  actions and background during submit; recovery re-reads canonical session.
- **IOS PORTABILITY / DONE:** Portable command classification; no sensor unless
  U-002's separate child is enabled. Measure interaction count/latency; no fake
  success. Default optional-photo path may close, required-photo G2 remains gated.

### MOB-011C — Verified condition-photo capability decision gate

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; S decision/audit to resolve U-002;
  MOB-011B. Approved implementation belongs to MOB-011D.
- **OBJECTIVE / WHY / OUTCOME:** Prove real private bytes satisfy configured photo
  policy. MC-08; read Web condition/upload, current storage and verification
  contracts, photo policy and privacy authority. Metadata is not upload success.
- **SCOPE / FILES / REUSE:** Audit Native camera, current API/storage/contracts and
  evidence. IF existing accepted byte pipeline suffices, plan its Native adapter;
  IF missing semantics exist, obtain Accepted decision before exact API/schema/
  retention/artifact selection. No implementation choice is made here. C-DOC for
  gate; MOB-011D owns conditional C-UI/C-API. No DB/dependency change in this branch.
- **PROOF / RISK:** Conditional real storage initiation/bytes/verification/ownership,
  type/size rejection, wrong principal, expired access, duplicate callback, interrupted
  upload and cleanup proof; R-10. V capture/review/upload/failed/required-block on
  physical Android, no private media in telemetry or ordinary persistent storage.
- **IOS PORTABILITY / DONE:** Assess camera/private file lifetime and iOS counterpart;
  no Android-specific public media contract. Gate closes only with recorded U-002
  resolution; photo-required pilot waits for verified child, not this audit alone.

### MOB-011D — Accepted private condition-photo byte adapter

- **STATUS / SIZE / DEPENDENCIES:** BLOCKED ON U-002 acceptance and pilot inclusion;
  M; MOB-011C and MOB-011B. Split any separately required server boundary into an
  explicitly reviewed child before implementation, using the resolved contract.
- **OBJECTIVE / WHY / OUTCOME:** IF required by accepted scope, capture and submit
  real private evidence whose server-verified completion satisfies photo policy.
  Read the U-002 decision, exact current Web/storage/API contract and MC-08.
- **SCOPE / FILES / REUSE:** Conditional Native camera/file/upload adapter and
  portable nonsecret progress/recovery; API/storage/DB only if the accepted scope
  proves a gap. No selected new route, object schema, retention interval or upload
  dependency here. No fabricated completion from a local URI or metadata record.
- **PROOF / RISK:** Conditional C-UI/C-API, real storage bytes/type/size/ownership,
  two principals, expired authorization, concurrent completion, interrupted upload
  and R-10 commit/rollback/unknown outcomes under the resolved contract. Physical
  camera, private-file lifetime, background/kill and permission revocation; V all
  capture/review/progress/failure/required-evidence states, with redacted telemetry.
- **IOS PORTABILITY / DONE:** Neutral media intent/state, Android camera/file adapter
  and explicit iOS counterpart; measure memory/network/capture cost. Required-photo
  policy cannot pass G2/G5 until actual verification and recovery evidence passes.
  If owner excludes this capability from the cohort, record the policy restriction
  and defer status; never silently mark unsupported required photos complete.

### MOB-012A — Parking task entry and start

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M; MOB-011B.
- **OBJECTIVE / WHY / OUTCOME:** Launch assigned parking work from completed intake
  and queue with one clear start action. MC-09; read Web parking task, start-parking
  command and DEC-068. Keep Task acceptance separate from physical state.
- **SCOPE / FILES / REUSE:** Native parking start and portable command/recovery;
  reuse existing dispatch/parking contracts. No spot/key confirmation, new API/DB
  or dependency. Starting parking must not fabricate key custody or assign a key.
- **PROOF / RISK:** A, C-UI plus real current command R-01/R-02 checks: wrong actor,
  stale Task/session, duplicate tap, response lost after commit and scope invalidation.
  V entry/assigned/busy/conflict/started states; physical navigation back/foreground
  preserves authoritative context. Measure action latency under repeated use.
- **IOS PORTABILITY / DONE:** Shared start orchestration, standard lifecycle adapter;
  no Android-only logic. Start command and render proof close this child; parking
  completion stays unavailable until MOB-012B is delivered.

### MOB-012B — Atomic parked spot and key custody

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M; MOB-012A.
- **OBJECTIVE / WHY / OUTCOME:** Confirm real spot/zone/key assignment atomically,
  including QR/manual paths. MC-10; read Web parked-confirmation, DEC-068, parking
  confirm commands and `keys/parking-key-custody.ts` with constraints/migrations.
- **SCOPE / FILES / REUSE:** Native confirmation/scanner composition, portable
  parse/validation/command recovery; same server command and expected versions.
  No split key/spot writes, custody model rewrite, hardware/NFC/BLE or dependencies/DB.
- **PROOF / RISK:** A/R-02 with two employees truly racing for same key and spot,
  B commit/rollback, stale session and lost response; verify one allowed custody
  effect and audit in real DB. V selected/conflict/scanner/manual/busy/ambiguous/
  parked continuation. Physical rapid QR frames, camera reopen/permission denial.
- **IOS PORTABILITY / DONE:** Neutral scanner intent plus camera adapter reusable
  on iOS; measure camera readiness and repeated parking cycles. G2 requires actual
  intake-to-parked custody proof, not only UI tests; fallback re-reads/Web, never
  locally guesses a key location.

### MOB-013 — Retrieval, key checkout and Mark Ready

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M; G2.
- **OBJECTIVE / WHY / OUTCOME:** Execute assigned retrieval through valid key
  checkout and ready state. MC-11; read live Web retrieval and API retrieval/key/
  dispatch commands. If branch spans separate server changes, split before code.
- **SCOPE / FILES / REUSE:** Native retrieval feature, portable workflow/recovery
  and existing scan adapter. Reuse accepted start/ready/custody commands; no handoff,
  payments, dispatch redesign, DB or dependencies.
- **PROOF / RISK:** C-UI + existing C-API invariants, A/R-03 concurrent reassignment,
  wrong employee, stale version, duplicate checkout/ready and response loss. V each
  operational stage, unavailable key/conflict, busy/unknown result. Physical repeated
  scan/manual cycles, background while holding task and role/Shift changes.
- **IOS PORTABILITY / DONE:** Portable stage intent and command state, camera and
  lifecycle adapters only. Measure queue-to-ready field latency and lost-response
  recovery; no double key effect or stale actor continuation; Web fallback preserves
  canonical custody.

### MOB-014A — Secure handoff verification, abort and authorized override

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M; MOB-013.
- **OBJECTIVE / WHY / OUTCOME:** Present accepted pickup code/Dynamic QR verification,
  abort and authorized reasoned override, without treating verification as release.
  MC-12; read Web handoff plus issue/verify/abort commands and accepted handoff policy.
- **SCOPE / FILES / REUSE:** Native handoff stages, portable proof-state/recovery and
  neutral scanner parsing. Existing API/proof/attempt limits and exact role checks;
  no new override privileges, final release, DB/dependency or secret persistence.
- **PROOF / RISK:** A/R-04: two principals, replay/expiry/attempt limit, invalid proof,
  logout, stale verification response and operator reason privacy. V code/QR/manual,
  verification busy/error/expired/override/abort; real camera/keyboard/privacy and
  app-background purge. Codes/proofs never enter route params/logs/screenshots used
  outside controlled sanitized evidence.
- **IOS PORTABILITY / DONE:** Neutral proof intent, camera/privacy/keyboard adapters;
  record iOS privacy behavior gap. Measured repeated scans remain bounded; final
  release is gated by MOB-014B, not inferred from this child's success screen.

### MOB-014B — Guarded final vehicle release

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M; MOB-014A.
- **OBJECTIVE / WHY / OUTCOME:** Release only after authoritative handoff and financial
  guards pass. MC-13; read Web completion, DEC-057 and `complete-handoff-*` executors/
  locks/guards. This is the highest-risk custody action.
- **SCOPE / FILES / REUSE:** Native final-release/blocked/recovery presentation and
  portable existing command transport. No new payment processor, price/override
  policy, DB/dependency or client-calculated release eligibility.
- **PROOF / RISK:** C-UI + live C-API A/R-04, competing proof consumption/release,
  payment/policy change, duplicate request, audit atomicity, unauthorized actor and
  lost response after commit. V verified-but-blocked, busy, unknown, released and
  safe return-to-queue. Physical background/network drop at final action.
- **IOS PORTABILITY / DONE:** Shared orchestration with lifecycle boundary, no new
  platform coupling. Zero unauthorized/duplicate release and truthful recovery are
  mandatory; a local success badge is not evidence. Record field release latency;
  Web fallback rehydrates before any subsequent attempt.

### MOB-015A — Production Shift start and active-Shift presentation

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M; MOB-028. Runs before G1 closes.
- **OBJECTIVE / WHY / OUTCOME:** Make existing operational context/Shift capability
  a production start/active experience. MC-02/14; read Web start-shift panel,
  operational gates and current Shift commands/eligibility decisions.
- **SCOPE / FILES / REUSE:** Native Shift entry, shell integration, portable current
  context and command state. No global per-User Shift rule, new role hierarchy,
  summary/end flow, DB or dependency. Reuse exact accepted Staff Shift contract.
- **PROOF / RISK:** C-UI plus actual API A/R-05: competing start, different membership
  scope, access revocation, stale response and unknown outcome. V no-Shift/start/
  active/denied/busy/recovery, physical keyboard/back and foreground revalidation.
  Rapid start taps cannot fabricate eligibility or enter a stale Location.
- **IOS PORTABILITY / DONE:** Portable context with lifecycle adapter; no new sensor.
  Record startup-to-operational readiness and safe errors. G1 requires this flow
  and MOB-029; Web fallback re-reads membership/Shift rather than copying local state.

### MOB-015B — Shift summary, end and recovery

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M; MOB-014B and MOB-015A.
- **OBJECTIVE / WHY / OUTCOME:** Close a real shift with the Web's summary and
  accepted end-shift eligibility/recovery. MC-15; read `shift-summary-live.tsx`,
  Web end-shift recovery panel, Shift summary/end command and dispatch consumers.
- **SCOPE / FILES / REUSE:** Native summary/end feature, portable bounded projection
  and end-command state. No reporting product expansion, new eligibility rule,
  fabricated local Shift end, DB or dependency.
- **PROOF / RISK:** A/R-01/R-05, C-UI and real end-vs-assignment tests including B
  commit/rollback, response loss, access change and refreshed summary. V summary,
  blocked end, busy/ambiguous, ended and re-entry; physical full custody cycle then
  end/restart. Metrics distinguish end denial, conflict and unknown outcome.
- **IOS PORTABILITY / DONE:** Shared state/formatting with lifecycle adapter;
  repeated summary refresh remains bounded. G3 needs secure release and truthful
  end evidence; recovery/Web fallback never treats timeout as successful end.

### MOB-016 — Bounded vehicle directory and safe operational lookup

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M; G1 and MOB-011A.
- **OBJECTIVE / WHY / OUTCOME:** Find authorized active vehicles and navigate safely
  into current detail/workflow. MC-16; read `features/vehicles-directory`, Web row
  cards and current Staff directory projection contract.
- **SCOPE / FILES / REUSE:** Native directory, portable bounded loader/selectors and
  query formatting. No new search backend, unbounded export, key-location disclosure,
  custody commands, DB or dependency. A row never grants mutation authority.
- **PROOF / RISK:** C-UI, actual two-principal tenant/Location read-denial and stale
  row navigation tests. V loading/empty/results/error/search/large content in EN/AR;
  real keyboard/large font/TalkBack. Rapid query changes, slow results, scope purge
  and representative large list must avoid stale-result mixing or frozen input.
- **IOS PORTABILITY / DONE:** Portable projections and native list/keyboard behavior,
  no platform-specific data model. Measure rendering/memory/request rate; safe
  empty/error states and V close the slice, with Web lookup as fallback.

### MOB-017A — Incident reporting

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M; G2.
- **OBJECTIVE / WHY / OUTCOME:** Record operational exceptions without changing
  custody or inventing claim handling. MC-17; read Web incident live flow, accepted
  incident policy and current incident command/audit boundaries.
- **SCOPE / FILES / REUSE:** Native form/result, portable validation and accepted
  command recovery. No AI damage assessment, ClaimShield or new photo pipeline;
  any required media uses only U-002's approved child. DB/dependencies none by default.
- **PROOF / RISK:** A/R-07, C-UI + real duplicate/unknown result and cross-scope
  command tests; incident lifecycle remains independent. Review bounded reasons,
  normalization, privacy and actual audit writer semantics. V validation/busy/error/
  ambiguous/success with keyboard and long Arabic text on physical Android.
- **IOS PORTABILITY / DONE:** Portable form/recovery, standard keyboard/lifecycle;
  conditional camera impact follows U-002. Repeated submits cannot create duplicate
  protected effects. No raw notes in telemetry; Web incident flow remains fallback.

### MOB-017B — Employee Guest Access issuance and display

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M; G2.
- **OBJECTIVE / WHY / OUTCOME:** Issue/display the accepted guest access link/QR
  without leaking bearer material. MC-18; read Web Guest Access, DEC-063 and
  `valet-sessions/guest-access-command.ts` with issuance/rotation authority.
- **SCOPE / FILES / REUSE:** Native issuance/result/expiry presentation and portable
  command/token-lifetime state; existing Staff endpoint. No guest app rewrite,
  ordinary token storage, new share/channel product, DB or dependency by default.
- **PROOF / RISK:** C-UI + API A/R-07 wrong principal/Location, duplicate/response
  loss, expiry and rotation; follow accepted recovery instead of automatic reissue.
  V issue/busy/ambiguous/display/expired, real QR readability, background/logout/
  scope purge and privacy behavior. Test logs/navigation/telemetry for secret absence.
- **IOS PORTABILITY / DONE:** Neutral token intent, native QR/privacy adapter where
  justified; evaluate iOS screen/background handling explicitly. Measure repeated
  issuance bounds. Completion needs reviewed secret lifetime and render evidence;
  Web fallback uses its own fresh authorized command, never copied persisted token.

### MOB-018A — Cross-flow navigation and scan hub closure

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M; G3, MOB-016 and MOB-017A/B.
- **OBJECTIVE / WHY / OUTCOME:** Complete coherent route/back/scan entry across all
  delivered workflows. MC-19; read DEC-066, Web live router/navigation and scan-hub
  tiles. MOB-028 already supplies the shell; this closes integrated routing gaps.
- **SCOPE / FILES / REUSE:** Native routes/shell/scan dispatch and portable neutral
  intents. No new business capability, scan-derived authority, backend/DB change
  or global-state framework. Extend existing shared presentation only when missing.
- **PROOF / RISK:** C-UI, V every top-level route, contextual back, disabled entry,
  malformed/unsupported scan, unavailable target and recovery. Real repeated scan,
  camera close/reopen, hardware back, cold start and scope changes. Re-resolve
  authoritative target before command entry; no sensitive route parameters.
- **IOS PORTABILITY / DONE:** Common intent/parser graph, native navigation/camera
  adapters, documented iOS back/safe-area behavior. Trace interaction count and
  resource cleanup. No dead end or stale-scope route remains; revert isolated route
  slice/Web fallback if navigation becomes unsafe.

### MOB-018B — Cross-flow visual, localization and accessibility closure

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M audit/repair slice; MOB-018A.
- **OBJECTIVE / WHY / OUTCOME:** Review all MC-01–23 applicable screen states as one
  product, closing residual shared inconsistency. Per-feature V already passed;
  this does not postpone earlier parity obligations.
- **SCOPE / FILES / REUSE:** Evidence matrix and focused `employee-ui`/copy/layout
  fixes only. Separate any domain/functional defect into its owning child. No
  second design language, API/DB/dependency or speculative redesign.
- **PROOF / RISK:** C-UI and complete matched Web/physical Android V matrix: fonts,
  geometry, iconography, hierarchy, copy, EN/AR, RTL identifiers, large fonts,
  TalkBack/focus, keyboard and all busy/error/empty/unknown states. Review every VD
  row for evidence and authority; fixable deviations stay defects.
- **IOS PORTABILITY / DONE:** Audit shared text/layout roles and platform adaptations,
  document remaining iOS physical work. Repeated route/render trace checks memory
  and responsiveness; G4 needs no unexplained material visual/capability gap.
  No new numeric parity acceptance threshold is introduced.

### MOB-010C — Production OCR cost-guard decision and implementation handoff

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; S decision branch to resolve U-001;
  MOB-010B. Only production implementation is blocked on the decision.
- **OBJECTIVE / WHY / OUTCOME:** Resolve safe production provider availability while
  preserving merged assistive OCR. MC-05, DEC-074 and actual anti-abuse/provider
  paths are read first. Manual/no-plate continues while this gate is open.
- **SCOPE / FILES / REUSE:** Evidence/options/Accepted-decision handoff only; current
  APIs, budget enforcement and privacy inspected. IF U-001 accepts a mechanism,
  MOB-010D supplies the separately scoped implementation with exact files/schema/tests;
  IF no mechanism is accepted, production remains UNAVAILABLE before provider I/O.
  No speculative migration, cache, provider change or limiter-scope reuse here.
- **PROOF / RISK:** C-DOC, R-08 options analysis across processes/restarts/concurrent
  principals, bounded spend, provider timeout/outage and fail-closed paths. The
  later child must induce real multi-process races/provider failure and prove
  production configuration; development diagnostics are not production proof.
- **PLATFORM / DONE:** No UI/sensor implementation in decision branch; downstream
  V/device proof covers unchanged confirm/edit/manual and availability states.
  iOS retains neutral OCR contract. DB/dependencies conditional on accepted U-001.
  G5 cannot call production OCR available until accepted child evidence is complete.

### MOB-010D — Accepted production OCR shared cost guard

- **STATUS / SIZE / DEPENDENCIES:** BLOCKED ON U-001 and MOB-010C; M.
- **OBJECTIVE / WHY / OUTCOME:** IF a production mechanism is Accepted, enforce
  DEC-074's server-derived scope and locked cost limits across replicas/restarts
  before enabling provider I/O. Read full DEC-074 and U-001 resolution, MC-05/R-08.
- **SCOPE / FILES / REUSE:** Conditional API limiter/provider integration, configuration,
  tests and approved persistence/migration or external adapter only as resolved.
  Preserve one in-flight, five/10 seconds, 20/60 seconds per accepted key and
  fail closed when authoritative state is unavailable. No silent reuse of login,
  guest or handoff scopes, client budget authority or new OCR product behavior.
- **PROOF / RISK:** C-API and C-DOC plus real multi-process/restart/concurrent budget
  tests, two-principal scope checks, provider acceptance/timeout and limiter loss.
  If persistence changes, real empty/existing-data migrations and privilege tests;
  if an external mechanism is selected, real outage/recovery and secret custody
  proof. No exact new lock/schema/provider mechanism is selected by this card.
- **PLATFORM / DONE:** Existing neutral OCR response/confirm/manual flow preserved;
  C-UI if adapter behavior changes and physical V availability/confirm/fallback
  evidence. iOS retains the same contract. Measure bounded spend/latency without
  logging keys/images/plates. Until accepted deployment and proof pass, retain
  production UNAVAILABLE; manual/no-plate and Web operation remain fallback.

### MOB-019A — Native task-tracking contract and pilot decision

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED, implementation gated by U-003; S; G1.
- **OBJECTIVE / WHY / OUTCOME:** Resolve Native acquisition/permissions/sampling and
  pilot inclusion against already accepted task-scoped backend policy. MC-21;
  read DEC-045 and related accepted tracking/privacy/provider decisions and Web map/
  tracking code. Do not reopen default OFF or authorize shift-wide surveillance.
- **SCOPE / FILES / REUSE:** Decision/evidence only; enumerate actual backend/portable
  capabilities and mobile gaps. IF included, define accepted Native adapter boundary
  before MOB-019B; IF excluded from pilot, owner records defer/cohort policy. No
  chosen new route, sample interval, permission scope, schema or dependency here.
- **PROOF / RISK:** C-DOC; evidence on task start/stop, background/permission revocation,
  battery, OEM behavior, provider/privacy/retention and iOS restrictions. R-10
  remains conditional; no specific unresolved point acceptance test is selected.
- **PLATFORM / DONE:** Decision branch needs no new device implementation, but
  evidence informing the decision distinguishes real tests from vendor/config
  claims. U-003 closes by owner decision; MOB-019B remains required if included.

### MOB-019B — Accepted Native task-tracking adapter

- **STATUS / SIZE / DEPENDENCIES:** BLOCKED ON U-003 inclusion and MOB-019A; M.
- **OBJECTIVE / WHY / OUTCOME:** IF tracking is included, implement only its accepted
  Native acquisition contract with truthful permission/policy state. MC-21; read
  the resulting Accepted decision before selecting concrete artifacts.
- **SCOPE / FILES / REUSE:** Conditional Native location/maps adapter, portable policy/
  lifecycle orchestration and existing backend contract. DB/dependencies only if
  the Accepted decision proves necessity. No whole-shift tracking, client-owned
  policy, new analytics or Android-specific shared concepts.
- **PROOF / RISK:** Conditional C-UI/C-API, A/R-10 target/scope/task expiry, revocation,
  duplicate/late samples and commit/rollback/unknown outcomes per accepted contract.
  Physical permission/background/OEM/battery and provider outage tests are required;
  V permission/disabled/active/stopped/error states. Stop behavior must be real.
- **IOS PORTABILITY / DONE:** Explicit Android adapter and accepted likely iOS
  counterpart, measured battery/network impact. If excluded, mark this child
  DEFERRED BY OWNER with U-003 reference, never silently complete it; G5 records
  disposition and any pilot policy restriction.

### MOB-020A — Dedicated push persistence and public contract foundation

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M; G1 and Accepted DEC-073.
- **OBJECTIVE / WHY / OUTCOME:** Establish the dedicated durable push model needed
  for reliable attention. MC-20; read full DEC-073, current schema/migrations,
  contracts exports and nearest API module wiring. No StaffPush implementation
  exists at baseline; accepted architecture is not a migration artifact.
- **SCOPE / FILES / REUSE:** Dedicated registration/intent/delivery schema and public
  contracts exactly per DEC-073, new versioned migration, schema docs/fixtures and
  invariant tests. No external-notification table reuse, generic outbox/event
  platform, worker/provider send or Native dependency. Coordinate one migration owner.
- **PROOF / RISK:** C-API, real migration on empty and representative existing DB,
  constraints/indexes/ownership/state invariants and least-privilege grants. R-09
  persistence semantics; no invented U-005 values embedded as policy. Test data
  preservation; schema sync is insufficient. Secrets/tokens excluded from audit.
- **PLATFORM / DONE:** No direct UI/camera work; downstream MOB-021/022 own V/device
  proof. Provider-neutral entities admit APNs and Native intent. Rollback is an
  reviewed compatible deployment plan, not deleting applied migrations/history;
  runtime remains disabled until later children integrate.

### MOB-020B — Push registration, rotation and session lifecycle API

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M; MOB-020A.
- **OBJECTIVE / WHY / OUTCOME:** Bind usable device registrations to the exact
  authenticated StaffAuthSession with DEC-073 rotation/account-switch/logout
  behavior. Read DEC-072/073, auth lifecycle and new accepted contract exports.
- **SCOPE / FILES / REUSE:** Thin API boundary, explicit registration commands,
  runtime DB/auth module wiring, contract adapters/tests. No client-supplied session
  authority, provider send or new payload/role semantics. DB only corrections proven
  necessary to accepted schema, in new migrations; dependencies none by default.
- **PROOF / RISK:** C-API and A adapted to registration authority before write;
  R-06/R-09 two authenticated sessions/principals, token rotation, account switch,
  concurrent register/logout/revoke, stale result and unknown outcome. Prove raw
  provider value and equality hash never enter logs, errors, metrics or audit.
- **PLATFORM / DONE:** Neutral registration concepts, no FCM naming in portable
  APIs; token acquisition belongs to MOB-021, APNs later adapter. No direct visual
  proof required here; downstream registration/error/lifecycle device gate remains.
  Reversible feature disable must not mutate domain custody.

### MOB-020C — Transactional retrieval push intent and recipient eligibility

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M; MOB-020A.
- **OBJECTIVE / WHY / OUTCOME:** Create only DEC-073's initial retrieval attention
  intent at the accepted domain boundary, so a committed event cannot be lost
  between DB and send. Read retrieval request command, dispatch eligibility and
  complete DEC-073 recipient/suppression contract.
- **SCOPE / FILES / REUSE:** Existing retrieval transaction integration and dedicated
  push intent/recipient projection; no push-as-command, new push kinds, generic
  outbox or domain state changes. Contract/persistence from MOB-020A; dependencies
  none. Do not treat a read-only eligibility helper as a write-side race solution.
- **PROOF / RISK:** C-API, R-01/R-09 actual rollback/commit, repeated retrieval,
  no duplicate active retrieval Task, eligibility invalidation and no unauthorized
  projection. Assert business write and intended durable record atomically follow
  DEC-073, no provider I/O inside the transaction. Audit semantics stay existing.
- **PLATFORM / DONE:** Provider-neutral intent; no direct UI/sensor change; downstream
  MOB-022 proves fresh queue navigation. Record intent/suppression metrics without
  sensitive labels. Domain transaction must still work under accepted push failure
  policy; no unaccepted coupling or discarded committed intent.

### MOB-020D — Bounded push worker, FCM adapter and operational recovery

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M; resolve U-005 operational values
  before dependent configuration/deployment implementation;
  MOB-020B and MOB-020C. Split worker and provider repair if review scope grows.
- **OBJECTIVE / WHY / OUTCOME:** Deliver bounded attention attempts with real
  crash recovery. Read DEC-073 states, lease/fencing, provider timeout, suppression,
  expiry, retention and safe token storage requirements; MC-20.
- **SCOPE / FILES / REUSE:** Dedicated worker/provider adapter/config/metrics and
  tests, approved direct FCM HTTP v1 boundary; no Expo Push Service, generic queue,
  Kafka or exactly-once claim. U-005 supplies finite typed values before deployment.
  Dependencies and DB changes only where accepted implementation requires them.
- **PROOF / RISK:** C-API, real DB/provider integration, R-09 DB commit/send failure,
  provider acceptance/finalize failure, SIGKILL/OOM/container loss, lease expiry,
  stale-fence rejection, healthy-worker/reclaimer race, timeout/429/5xx, invalid token,
  TTL expiry and recovery burst. A graceful stop or mocked throw is insufficient.
- **PLATFORM / DONE:** Generic fixed EN/AR payload with opaque attention/route intent,
  no vehicle/tenant/proof data; later APNs adapter uses same concepts. No direct
  screen work; MOB-022 physical proof required. Measure backlog age, attempts,
  suppression and provider outcomes; bounded duplicates do not authorize a command.
  Feature disable and provider outage runbook preserve queue/Web operation.

### MOB-021 — Native permission, device registration and push lifecycle adapter

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M; MOB-020B and MOB-028.
- **OBJECTIVE / WHY / OUTCOME:** Register native device tokens with truthful
  permission and account lifecycle. Read DEC-071–073, Web foreground attention,
  existing auth purge and Expo configuration; MC-20.
- **SCOPE / FILES / REUSE:** Native notifications/permission/token adapter and
  portable registration orchestration; approved Expo Notifications native token
  integration where required, pinned/audited through task scope. No backend send,
  new push service, domain action or speculative iOS infrastructure.
- **PROOF / RISK:** C-UI + real registration boundary, R-06/R-09 permission deny/
  grant/revoke, token rotate, logout/revoke/account switch and stale async response.
  Physical Android permission/channel/OEM/settings behavior and V in-app states;
  system UI deviations documented, not restyled into invented product flows.
- **IOS PORTABILITY / DONE:** Provider-neutral token/permission intent, Android
  adapter/config explicit; APNs/Keychain-side lifecycle effort recorded. No token
  telemetry/storage leakage; repeated registration stays bounded. Notifications
  may be denied without falsely disabling authoritative queue operations.

### MOB-022 — Push foreground, background and terminated attention proof

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M; MOB-020D, MOB-021 and MOB-029.
- **OBJECTIVE / WHY / OUTCOME:** Tap/receive attention safely from every lifecycle
  state and refetch authoritative queue. MC-20; read DEC-073 payload/route intent,
  Native auth/shell lifecycle and Web alert behavior.
- **SCOPE / FILES / REUSE:** Neutral notification intent dispatch, Native lifecycle
  glue and evidence; no command from payload, guessed Task/session identity,
  new push kind, schema or dependency by default.
- **PROOF / RISK:** C-UI + actual provider/device chain: foreground, background,
  terminated, locked, duplicate/stale tap, signed-out, wrong current Location,
  revoked account, permission disabled, expired intent and offline reconnect.
  R-09 stale registration/worker overlap remains server-owned. V queue/attention/
  loading/denied states; no secret payload or lockscreen PII.
- **IOS PORTABILITY / DONE:** Shared intent, Android lifecycle adapter with explicit
  likely iOS notification delegate counterpart. Measure tap-to-fresh-queue, burst
  deduplication of attention and cleanup; G6 needs real physical evidence, not
  emulator-only or simulated notification callbacks. Queue/Web remains fallback.

### MOB-023A — Auth, network and lifecycle hardening across production flows

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M; G4, G6 and included G5 capability.
- **OBJECTIVE / WHY / OUTCOME:** Preserve identity and truthful state through real
  network/lifecycle failure. MC-01/02/22; read DEC-063/072, portable session ownership
  and Native adapters. Earlier per-flow failure gates remain mandatory.
- **SCOPE / FILES / REUSE:** Focused portable generation/cancellation/recovery and
  Native lifecycle/network/storage fixes demonstrated by tests. No generic offline
  queue, new auth policy, global state replacement, schema or dependency by default.
- **PROOF / RISK:** C-UI + real API/auth boundary; R-06 and scope invalidators:
  Wi-Fi/mobile switch, airplane/captive network, 401/403/408/409/429/5xx, slow API,
  repeated foreground, screen lock, permission revoke and SecureStore failures.
  Induce process death during restore/logout, never let stale response restore secrets.
  V all offline/restoring/denied/ambiguous UI in both locales on physical OEM device.
- **IOS PORTABILITY / DONE:** Portable lifecycle state, isolated Android events,
  explicit iOS process/Keychain behavior to verify. Record recovery times/crash/ANR
  evidence and request IDs; no blanket retries. Revert focused fixes or use Web
  while preserving server truth.

### MOB-023B — Protected-command recovery and full-shift process death

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M; MOB-023A.
- **OBJECTIVE / WHY / OUTCOME:** Demonstrate recovery across every custody/Shift/
  incident/Guest Access stage after unknown outcomes and killed processes. MC-22
  and R-01–10; read each command's Accepted idempotency/version/recovery contract.
- **SCOPE / FILES / REUSE:** Fault/evidence harness and bounded fixes in owning
  portable/Native workflow. Any server invariant defect gets its own scoped child;
  no speculative backend change or durable local command journal.
- **PROOF / RISK:** C-UI/C-API as affected, actual response cut after server commit,
  before commit, rollback and caller disconnect; force-stop/low-memory kill/cold
  start at intake, parking, retrieval, handoff and end shift. Include multiple
  employees, stale versions, logout/revocation and required media/tracking if included.
  V recovery must never display unverified success or replay stale release.
- **PLATFORM / DONE:** Physical Samsung/mid-range and reference behavior, repeated
  full workflow cycles, memory/resource cleanup and safe diagnostic bundle. iOS
  recovery logic portable; adapter limits recorded. G7 requires all protected
  mutations' evidence dispositions and no unresolved hard-zero failure.

### MOB-024A — Production-safe observability and correlation

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M; G1; extend alongside later flows.
- **OBJECTIVE / WHY / OUTCOME:** Make field failures diagnosable before pilot.
  Read API request-ID/error infrastructure, current Native development OCR diagnostics,
  security/privacy authority and release provenance. Development console traces
  alone are not a production observability system.
- **SCOPE / FILES / REUSE:** Focused error boundaries, safe request/build/lifecycle
  correlation and adapter instrumentation for auth, mutation ambiguity, network,
  camera/OCR, push and crashes/ANR where supported. Inspect existing tooling first;
  no unapproved telemetry vendor/dependency or raw payload capture.
- **PROOF / RISK:** C-UI/C-API as touched; deliberately trigger each error class and
  inspect actual collected/redacted output. Test token/header/proof/code/payment/
  free-text/PII exclusion including error paths. Crash/ANR claims require actual
  device evidence, not only a boundary unit test. Operational metrics stay separate
  from append-only tenant audit. V applies only if user-facing error UI changes.
- **IOS PORTABILITY / DONE:** Neutral event vocabulary and platform collectors;
  iOS crash/lifecycle collection gap explicit. No schema by default. Measure overhead
  under repeat failures; support can correlate a sanitized report to build/request
  without accessing secrets. Disable faulty telemetry without disabling operations.

### MOB-024B — Support, outage and Web fallback runbooks

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; S; MOB-024A.
- **OBJECTIVE / WHY / OUTCOME:** Let an operator/support owner diagnose and recover
  without daily developer intervention. Read current operational configuration,
  DEC-071 release/fallback and DEC-073/074 provider failure policy.
- **SCOPE / FILES / REUSE:** Documentation/evidence runbooks for API/DB outage,
  auth/revocation, camera/OCR/push provider failure, bad Location configuration,
  broken release, signed rollback and Web fallback. No app/API/DB/dependency change
  or provisioning. Name escalation and safe diagnostic fields through U-006.
- **PROOF / RISK:** C-DOC; tabletop plus actual bounded drill against a test cohort:
  detect symptom, gather redacted build/request evidence, restore config/service or
  fallback, re-read authoritative custody, verify recovery. No secret-bearing
  screenshots or destructive history repair. Link required device/release drill
  owners; this documentation branch does not itself prove signed distribution.
- **IOS PORTABILITY / DONE:** Separate shared runbook from Android install/permission
  steps and future iOS distribution equivalents. Operational owner can execute
  development/test procedures. Signed rollback steps remain EVIDENCE OPEN for
  MOB-026B; their later drill blocks G8, not MOB-026A's ownership planning.

### MOB-025A — Measured capacity baseline and owner threshold gate

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M evidence/tooling slice; G1 for
  baseline, integrated candidate before final U-004 acceptance.
- **OBJECTIVE / WHY / OUTCOME:** Establish measured capacity and propose pilot
  thresholds without presenting hypotheses as SLOs. Read §9 N, current Web/Native
  refresh behavior, repository test scripts and real API/DB/provider topology.
- **SCOPE / FILES / REUSE:** Existing test tooling first, focused reproducible load
  harness only when repository fit is proved, evidence and U-004 proposal. No
  default k6/tool selection, production load, new infrastructure or schema. A needed
  test dependency requires separate explicit scope and audit before installation.
- **PROOF / RISK:** C-DOC and harness checks; actual concurrent sessions/Locations,
  auth/reconnect/queue/protected commands with sanitized representative data. Record
  hardware/config/build, p50/p95/p99, throughput, staleness, pool/DB pressure,
  retries/duplicate effects and recovery. Mock response speed is not API capacity.
  Mobile startup/camera/list/memory measurements use physical devices; V changes none.
- **IOS PORTABILITY / DONE:** Shared workload/metrics, Android adapter measurements
  separated from portable cost; future iOS baseline explicit. Owner accepts U-004
  before production qualification. Load abort limits protect test environment;
  any hard-zero defect blocks independently of throughput thresholds.

### MOB-025B — Adversarial qualification and representative full-shift soak

- **STATUS / SIZE / DEPENDENCIES:** BLOCKED ON U-004 thresholds; M evidence slice;
  G7 and MOB-025A. Defects return to separately reviewed owning repair branches.
- **OBJECTIVE / WHY / OUTCOME:** Prove the integrated candidate survives a real
  operational shift under pressure. Read all MC rows, race/test matrices and device
  policy, current release-like build and approved experiment thresholds.
- **SCOPE / FILES / REUSE:** Qualification evidence/harness only, no silent functional
  expansion. Run configured repository tests/lint/typecheck/build/architecture and
  actual CI for candidate; C-UI/C-API/C-DOC as applicable. DB changes none in this
  proof branch; test versioned migrations if prior children changed persistence.
- **PROOF / RISK:** Full custody cycle with multiple employees, photo/tracking policy
  when included, scan bursts, provider outage/recovery, auth/reconnect waves,
  API/DB degradation and hard kills. Physical OS/OEM matrix M, signed/release-like
  performance, full-shift memory/battery/crash/ANR and repeated unknown-result recovery.
  Repeat V only for changed renders plus integrated critical route checks.
- **IOS PORTABILITY / DONE:** Same portable logic, record measured reuse and coupling,
  iOS configuration/build smoke evidence must be current before G8/final pilot.
  No hard-zero/material parity defect; accepted U-004 thresholds met for recorded
  cohort. Unobserved CI/device/load evidence stays open; Web fallback drill required.

### MOB-026A — Release ownership, configuration and pilot preparation decision

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; S decision/operations plan to resolve U-006;
  MOB-024B. Implementation/provisioning follows only approved bounded release scope.
- **OBJECTIVE / WHY / OUTCOME:** Turn DEC-071's accepted ownership/signing policy
  into accountable release inputs. Read DEC-071 §§14–17, configuration/secret
  practices, U-005 if push and U-001 if production OCR are included.
- **SCOPE / FILES / REUSE:** Record environment separation, exact accountable owners,
  organization-controlled Google Play/Firebase/Apple custody, independent recovery,
  least-privilege release access, pilot cohort and support/rollback responsibility.
  No credentials, new product IDs, provisioning or CI behavior in this decision
  branch; exact release artifacts conditional on U-006 resolution.
- **PROOF / RISK:** C-DOC, ownership/recovery access evidence and reviewed configuration
  checklist without secrets. Verify `com.vaylet.employee` identity and OTA-disabled
  policy are preserved. Decisions do not constitute successful builds or account
  recovery drills; link subsequent release proof owner.
- **IOS PORTABILITY / DONE:** Same app identity/organization-controlled Apple path;
  no speculative separate iOS pipeline. U-006 accepted inputs unlock MOB-026B;
  production remains blocked while accountable ownership/recovery is unproven.

### MOB-026B — Signed internal distribution and rollback rehearsal

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M; MOB-025B and MOB-026A.
- **OBJECTIVE / WHY / OUTCOME:** Produce a traceable signed Android candidate and
  prove installation/update/fallback on the approved devices. Read accepted release
  configuration, DEC-071 and operations runbooks.
- **SCOPE / FILES / REUSE:** Only approved signing/build/distribution configuration
  and evidence; organization-owned secrets remain outside Git/app bundle. No OTA
  enablement, new identifiers, store policy invention, schema or domain change.
  Dependency changes only if separately proven necessary to accepted release setup.
- **PROOF / RISK:** Build and actual signed binary install/cold start/update on
  physical devices; verify API environment, version/SHA/runtime provenance,
  permission/secure-storage lifecycle and no development-only data/tools. Observe
  actual CI/release execution, not configuration alone. Rehearse tested previous
  build or Web fallback, authoritative state rehydration and support escalation.
- **IOS PORTABILITY / DONE:** Current iOS config/build smoke from same Expo source,
  signing path recorded without claiming full iOS physical readiness. Release
  smoke includes V critical states and real push/camera/auth; G8 requires rollback
  evidence, accepted threshold results and no unresolved production control.

### MOB-027A — Controlled Location/device pilot

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; M evidence/operations slice; G8.
- **OBJECTIVE / WHY / OUTCOME:** Measure real valet operations with an owner-approved
  cohort before Native-primary use. Read U-004/006 records, runbooks and full MC
  coverage; keep Employee Web operational throughout coexistence.
- **SCOPE / FILES / REUSE:** Execute only approved Locations/devices/roles/Shift
  cohort, collect sanitized operational KPIs and incidents, validate support and
  rollback triggers. No automatic cohort expansion, code/schema/dependency change
  or client-to-client data migration. Defects get separate reviewed branches.
- **PROOF / RISK:** Actual signed build, full representative shift, check-in field
  time, custody correctness, retrieval/ready/release, queue freshness, crash/ANR,
  camera readiness, battery/memory and recovery vs accepted thresholds. Record
  denominator/sample/cohort; no feature-count success claim. Verify Web fallback
  under a realistic outage without duplicate protected actions.
- **IOS PORTABILITY / DONE:** Confirm same-source iOS smoke remains current; record
  adapter debt, no Android-only shortcuts. C-DOC for evidence; actual runtime/failure
  records and affected regression/CI for any repairs. Pilot completion does not
  itself authorize cutover; owner reviews MOB-027B.

### MOB-027B — Owner go/no-go, Native-primary cutover and rollback decision

- **STATUS / SIZE / DEPENDENCIES:** NOT STARTED; S decision/evidence slice; MOB-027A.
- **OBJECTIVE / WHY / OUTCOME:** Make Native-primary adoption an explicit evidence-
  based owner decision with reversible operation. Read pilot incident/KPI report,
  deviation register, coverage/race evidence and all U-ID dispositions.
- **SCOPE / FILES / REUSE:** Record go/no-go, accepted cohort, staged expansion,
  support ownership, rollback triggers and Web coexistence. No Web deletion,
  irreversible migration, automatic release promotion or product/schema change.
- **PROOF / RISK:** C-DOC, exact signed candidate/remote CI/runtime/failure/pilot
  evidence; named owner accepts residual conditions. Hard-zero or material visual
  failures force no-go. Rehearsed rollback/fallback must preserve authoritative
  session/key/payment/audit state; no local history rewriting.
- **IOS PORTABILITY / DONE:** Confirm DEC-071 iOS smoke and explicit remaining iOS
  physical/release work. G9 closes only with recorded owner decision; if no-go,
  retain Web and create bounded remediation tasks. No code completion tally can
  substitute for this decision.

### W. Exact next task and prompt handoff

After this documentation branch is independently reviewed and merged, execute
**MOB-010B — Merged intake/OCR and foundation evidence closure** on a fresh dedicated
branch from then-current `origin/main`. It is an evidence task, not a replay of
MOB-010 implementation. Its exact scope is its card above. Resolve current SHA,
read the full card/common contract/MC references, inventory existing artifacts,
then run missing physical matched-state and failure proof. Report unavailable
hardware/artifacts truthfully and create only bounded task-owned repairs if needed.
After G0 closes, the next application-code slice is **MOB-028 — Production shell,
access and context routing**. Later U-ID gates remain conditional; do not ask the
owner to settle unrelated production decisions before performing available G0 work.

## 9. Test matrix

### M. Android and future iOS evidence matrix

| Surface | Required coverage | Owner / evidence |
| --- | --- | --- |
| Supported OS | Android 10/API 29, 11/API 30, 13/API 33, 15/API 35, 16/API 36; compile/target 36 per DEC-071 | Per-flow relevant checks; aggregate MOB-025B/026B. Record actual model, OS/security patch, RAM, build and test state |
| Device families | Samsung/OEM, Pixel/reference and representative mid-range physical hardware; at least one real Samsung/mid-range device in field proof | G0 foundation and each native boundary; pilot MOB-027A. Emulators supplement OS breadth, never replace physical camera/lifecycle/field proof |
| Native boundaries | Camera/QR/OCR bytes, permissions and revocation, SecureStore, process death/low memory/lock, notifications, signed install/update | Owning feature + MOB-023/025/026; actual Android Development Build and release-like/signed candidate |
| Visual/ergonomic | EN/AR, LTR/RTL, identifier islands, comparable viewport, font scale, keyboard/safe area, TalkBack and touch targets | V per flow, MOB-018B aggregate; actual Android render pairs and deviations |
| iOS portability | Config/build smoke from same Expo app before final Android pilot completion; portable tests and adapter inventory | MOB-025B/026B. No full physical iOS readiness claim; future camera/Keychain/APNs/lifecycle/signing proof remains explicit |

### Mutation and failure evidence matrix

Each row inherits A, existing command-specific retries and the R commit/rollback/
unknown branches. Exact expected domain errors/events come from existing Accepted
contracts; unresolved upload/tracking/cost-guard choices stay conditional.

For every proposed protected mutation, instantiate this retry taxonomy in its
evidence sheet: first success; identical retry; concurrent identical requests;
conflicting payload with the same operation identity where that identity exists;
stale version; retry after a later state transition; retry after authorization or
Location/Shift change; and timeout/disconnect with unknown commit outcome. Record
the accepted outcome and exact effects/audit counts for each command separately.
An identical retry is not universally a success: some commands require conflict
and authoritative recovery. Concurrent identical requests cannot imply duplicate
successful protected effects. For commands without idempotency keys, do not invent
one; use their accepted version/re-read rules. Conditional U-001/002/003 children
derive assertions only after their missing mechanism/contract is Accepted.

| Boundary / owners | Automated + actual API/DB proof | Real failure/device/visual proof |
| --- | --- | --- |
| Auth/restore/logout; MOB-010B/028/023A | Generation/rotation/replay and two-session scope tests; R-06 | SecureStore failure, kill during restore/logout, revoked account, no protected flash; V access states |
| Intake/returning/identity/detail/condition/completion; MOB-010B/011A/B | A, R-07, expected Vehicle/session version, duplicate/conflicting correction and two-principal target denial, append-only audit | Lost commit response, background/cold restore, unknown-to-known/manual/no-plate/returning; V each correction/continuation |
| OCR; MOB-010B/010C/D | Existing candidate/transport tests, fail-closed production before provider I/O; MOB-010D mechanism tests conditional on U-001, accepted limits unchanged | Actual camera bytes/multipart/HTTP outcome, supported-size remount, permission failure, provider outage; V confirm/edit/fallback |
| Parking/task/key; MOB-029/012A/B | A, R-01/02, concurrent employees on key/spot/Task, rollback and stale versions, DB custody/audit invariants | Rapid taps/frames, response loss and scope invalidation; V conflict/unknown/parked |
| Retrieval/ready; MOB-013 | A, R-03, assignment change and key checkout races, no duplicate protected effect | Offline after send, foreground after reassignment, key scan/manual failure; V stages |
| Handoff/release; MOB-014A/B | A, R-04, two principals, expiring/single-use proof, payment/policy race, authorized override and atomic audit | Kill/disconnect at final release, no stale proof replay, code privacy; V blocked/ambiguous/released |
| Shift start/end; MOB-015A/B | A, R-01/05, per-membership scope, concurrent start/end/assignment, authorized fallback read | Lost end result, revoked access, process restore; V active/blocked/ended/recovery |
| Incident/Guest Access; MOB-017A/B | A, R-07, bounded text/ownership, command-specific duplicate/rotation semantics | Secret purge on background/logout; interrupted submit, actual QR readability; V errors/results |
| Directory/navigation; MOB-016/018A | Two-principal read denial, bounded projection, stale target/intent cannot authorize write | Large list, rapid query/back/scan, offline/dead target; V empty/error/unavailable |
| Photos/tracking; MOB-011C/D/019B | Conditional A/R-10 under U-002/U-003 accepted boundary, actual storage/point authorization, policy transition and late result | Conditional real bytes/private storage, permission/OEM/battery/task-stop; V required/denied/failure |
| Push; MOB-020A–D/021/022 | Versioned migrations, two-principal registration, intent transaction, real lease/fence/expiry and dual-write failure | Hard kill/OOM/container loss, provider timeout/outage/accepted-response loss, physical signed foreground/background/terminated tap; V safe attention |
| Cross-cutting; MOB-023–027 | Regression/lint/typecheck/build/architecture and actual remote CI; accepted thresholds | Real network transitions, full-shift soak, signed update/rollback and Web fallback; no missing evidence promoted to DONE |

### N. Performance/load/capacity program

Separate (A) repository-measurable baseline, (B) proposed pilot experiments and
thresholds, and (C) owner-Accepted U-004 SLO gate. None of the following example
loads is an accepted production guarantee or permission to load a live customer.

The old hypothesis of 10 Locations × 20 Employees with five-second queue polling
implies about 40 queue reads/second before context reads, auth, mutations or retry
traffic. At this baseline five seconds is Web's default; Native has manual and
foreground refresh. MOB-029 must measure the actual scheduling/coalescing behavior
before deriving total load. Capture request multiplicity rather than assuming one
UI refresh equals one API query. Coexistence means Web and Native traffic can overlap.

MOB-025A first inventories repository tooling/scripts and fits the simplest
reproducible harness; no load tool is preselected. Propose step/ramp/burst scenarios
for multiple Locations and simultaneous Employees, check-in/parking/retrieval/
handoff concurrency, shift/auth bursts, queue spikes, reconnection waves, push
bursts and provider outage/recovery. Record dataset cardinality, authorization
mix, pacing, think time, duration, hardware, API/DB pool/config and build SHA.
Use staged test-environment loads with abort conditions, not production experiments.

Measure startup/operational readiness, UI/input responsiveness, camera readiness,
list rendering, memory growth, battery, crash/ANR; request p50/p95/p99, throughput,
queue staleness, API error/retry rates, duplicate protected-effect count, DB/pool
pressure, provider failures and reconnect recovery time. Report sample sizes and
warm/cold distinctions. Separate client rendering from API/network/provider time.
Capture low-friction check-in field time against Blueprint intent with photos
optional, then separately measure configured photo-required paths if included.

Qualification includes sustained load, stress to saturation, reconnect and auth
waves, genuinely concurrent protected mutations, provider recovery bursts and a
representative full-shift physical soak. The owner specifies actual shift duration,
cohort and thresholds in U-004/006; do not invent an eight-hour pass rule. Compare
start/end memory and battery, retained subscriptions/camera resources and task
latency over time. A failed invariant stops acceptance even when latency is good.

### O. Observability and operations evidence

Each feature provides bounded safe diagnostics; MOB-024A joins them into usable
production correlation. Capture operation/outcome class, safe request ID, release
provenance and necessary lifecycle/network/provider state. Cover crash/error
boundaries, ANR, auth, mutation ambiguity/recovery, camera/OCR, push and failures
that occur before HTTP starts. Do not mistake absent API traffic for provider failure.

Verify collection and redaction at the actual sink, including exception paths.
Never collect tokens/passwords/proofs/pickup codes/payment secrets/provider tokens,
unnecessary PII or raw sensitive payloads. Operational telemetry is not tenant audit
history. Accountable support/runbooks cover outage, provider failure, broken release,
auth, bad configuration, rollback and Web fallback. A dependency/configuration
failure is reported separately from a product defect; no secret values in evidence.

### P. Release, pilot and rollback gates

Employee Web remains operational during coexistence and pilot. No client-to-client
data migration is needed because the server remains canonical. Use a controlled,
owner-defined Location/device/cohort, signed build provenance and measurable KPIs.
Current support/permissions/configuration and provider availability must match the
actual pilot policy, including U-001–003 conditional capabilities.

Before pilot: approve thresholds/accountability, complete required physical and
iOS smoke evidence, validate signed installation/update, observe actual CI, rehearse
incident handling and rollback/Web fallback. OTA stays disabled. No developer-owned
single-person signing/account recovery dependency. Never embed service credentials.

Rollback triggers include any hard-zero violation, material visual/operational
parity defect or accepted U-004/006 threshold breach. Pause cohort expansion,
contain the affected capability, preserve audit/diagnostics, restore the tested
compatible signed build or use Web, and re-read server state before further actions.
Do not delete audit or migrations, replay local commands, or infer custody from a
previous screen. Owner go/no-go is explicit; successful code tasks do not authorize
Native-primary cutover or Employee Web deletion.

## 10. Files expected to change

### This documentation branch

Only `docs/20_EMPLOYEE_NATIVE_EXECUTION_PLAN.md`,
`docs/14_PROJECT_STATUS.md` (direct stale program reference) and
`docs/08_DECISIONS_LOG.md` (DEC-074 summary mirror). No focused Accepted DEC is
rewritten. Preserve unrelated review patches. Validate complete diff against
baseline main and stage only these paths.

### Future task artifact firewall

- **DEFINITELY RELEVANT:** Current Native `app/**`, `src/auth`, `tasks`, `scanner`,
  `check-in`, `foundation`, `employee-ui` and tests; portable employee-client
  boundaries/tests/exports; Web live screens/controllers/tokens/copy as read
  references. Existing contracts/API commands/database constraints and tests are
  authority/read targets for every consumed protected capability. DEC-073 proves
  dedicated push schema/contracts/API/worker families are needed; allocate exact
  artifacts in MOB-020A–D after inspecting current files and coordinating migrations.
- **CONDITIONAL ON DECISION:** U-001 cost-guard implementation/persistence/provider
  configuration; U-002 photo-byte pipeline/retention/storage artifacts; U-003 Native
  acquisition/permission adapter and any proven contract gap; U-004 load-tool/test
  dependency artifacts; U-005 exact operational configuration; U-006 release/signing/
  distribution infrastructure. No exact new route/helper/schema/file is declared
  definitely required solely because a proposed option seems reasonable.
- **NOT JUSTIFIED YET:** New backend product model, generic sync/outbox platform,
  second Native UI system, speculative state framework, standalone iOS app,
  unrelated Dashboard/Guest changes or future-phase infrastructure.

## 11. Explicitly out of scope

### U. Anti-scope-creep rules

This branch implements no application code, dependency, API behavior, schema,
migration, Native/Web behavior, CI, signing, Firebase/provider project or external
service. It does not merge, create a PR, push main, force-push or remove branches.

Future Native tasks exclude WebView/DOM wrapping, duplicated domain authorization,
new mobile backend, generic durable offline replay/outbox, speculative global state,
microservices/Kubernetes/Kafka, second design system and separate iOS rewrite.
Do not add V2/Enterprise products, damage AI/autonomous make/model recognition,
ClaimShield, Safety Score, reservations/marketplace, smart lockers/NFC/BLE or
unapproved POS/PMS/SSO. Existing sellable-MVP OCR/manual fallback, configured
photos, QR key slots/spots, Hybrid Dispatch, secure handoff, payments/validation/
tips, task-scoped maps/tracking and EN/AR are not automatically excluded; consume
their accepted current capabilities and record any Native gap in the MC matrix.
No Web deletion or irreversible cutover. No new feature merely to improve a score.

## 12. Ready-to-implement verdict

**DECISION REQUIRED**

The program is a decision-dependent implementation envelope because U-001–006
remain open for their named production/capability gates. This is not an unresolved
conflict between authoritative documents and is not a reason to leave this
rebaseline unfinished. MOB-010B's evidence work is executable immediately after
review/merge; MOB-028 is the next application-code slice after G0. No unresolved
choice is selected by a later test, file prediction or task card.

Production readiness is **NOT READY** at this baseline: required real-device,
matched visual, failure/load, signed-release and pilot evidence is not established.
If a later candidate has verified core behavior but explicitly deferred deployment
controls, classify it READY WITH CONDITIONS for that bounded assessment, never as
unconditional production readiness or as permission to bypass a blocking gate.

Planning self-review scope: 12 required guardian sections; owner content A–W;
23 migration capabilities; 28 historical IDs (MOB-001–027 plus MOB-010A);
39 future task cards with the complete inherited field contract; 6 stable unresolved
gates; 10 material race scenarios; 17 falsification checks.
Before finalizing, perform proposition polarity, source precedence, single-label,
identity-scope, current-pattern/policy, U-ID semantic leakage, race completeness,
commit/rollback/unknown, mechanism, free-text privacy, downstream check-use,
falsification, test-purity and artifact-prediction checks, then run the plan audit.
A heuristic audit exit code is not semantic proof. Record actual validation results
in the documentation branch report; do not label unperformed device or CI work green.

Audit disposition: the v1.5 heuristic reports one broad warning because a program
with a DECISION REQUIRED verdict also contains definitive implementation language.
The semantic review distinguishes existing Accepted contracts (which remain
definitive) from U-001–006 choices (conditional and owned by named gates). It found
no selected new limiter/photo/tracking mechanism, SLO value, push configuration
value or release owner/environment in the dependent cards/tests/artifact list.
This warning is retained and explained, not represented as an all-clear audit.
