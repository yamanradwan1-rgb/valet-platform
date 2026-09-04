# VAYLET Employee Native Master Execution Plan

Status: Canonical execution plan  
Program: Employee Native migration  
Last synchronized: 2026-09-02
Scope: MOB-001 through MOB-027

## 1. Authority and use

This document is authoritative for Employee Native task order, scope, gates,
evidence, and status. It is subordinate to the repository authority order in
`AGENTS.md`: the latest explicit owner instruction and every applicable
Accepted Decision remain controlling. This plan cannot amend an Accepted
Decision. A material conflict or missing semantic requires a focused Proposed
Decision and stops the affected implementation.

The source planning file used to prepare this document is reference material,
not repository authority. Its useful execution detail is retained only where it
is consistent with current Accepted Decisions and direct repository evidence.

This is a planning document. The MOB-003 architecture synchronization does not
authorize application scaffolding, dependency installation, database work, CI
changes, Firebase provisioning, signing, distribution, or MOB-004 execution.

## 2. Program outcome and non-negotiable boundaries

The program delivers an Android-first native Employee terminal in
`apps/valet-native`, using the Accepted DEC-071 Expo SDK 57 / React Native 0.86
/ Hermes / New Architecture / Expo Router / Development Build / CNG
architecture. It preserves the existing API, database, contracts, server domain
commands, authorization, concurrency, custody, financial guard, and audit
authority. The existing Employee Web app remains operational through the
controlled pilot and evidence-based cutover.

The native client is never authority for User, membership, Organization,
Location, role, LocationAccess, Shift, Task ownership/version, ValetSession
state, parking/key custody, handoff proof, financial release, or audit history.
Every protected mutation continues to prove current authority before mutation
and commits its required state, custody/history, dispatch, and audit effects
atomically.

Hard zero tolerances for every gate are:

- cross-tenant or unauthorized cross-Location disclosure or mutation;
- unauthorized custody transition or vehicle release;
- more than one successful effect for one logical protected action;
- broken or fabricated key-custody history;
- bypass of a financial release guard;
- lost, rewritten, or fabricated audit evidence;
- push treated as command authority or delivery treated as operational success;
- local, offline, scan, navigation, or notification state fabricating server
  success.

## 3. Locked cross-platform covenant

Android is first for implementation, physical-device QA, and pilot. The same
Expo app must remain the path to iOS, not an Android-only fork. Shared portable
TypeScript owns contracts, validation, workflow orchestration, error/recovery
semantics, localization/formatting, route intent, scanner semantics, and
notification semantics where real reuse is demonstrated. Platform camera,
SecureStore, push, permissions, lifecycle, screen privacy, and signing stay
behind narrow adapters.

The target is 85–95% reuse of non-visual client logic between Android and iOS.
This is a design target to measure at the pilot gate, not a promise or a reason
to force unsafe abstraction. No public domain contract, persistence concept, or
portable API may use Android- or FCM-specific naming for a cross-platform
concept.

## 4. Security, authentication, offline, camera, and push invariants

Native authentication must reuse the current StaffAuthSession family and
current persisted authorization. Accepted DEC-072 locks the exact dedicated
native JSON transport, SecureStore boundary, rotation serialization, replay,
logout, revocation, app-restart, reinstall, device-loss, and purge contract.
Access tokens remain memory-only. Long-lived raw refresh material may exist
only in the Accepted native secure-storage boundary. Passwords, access tokens, refresh
tokens, token hashes, pickup codes, Dynamic QR proofs, guest tokens, and payment
secrets never enter logs, analytics, URLs, navigation state, ordinary storage,
or offline queues.

DEC-063 remains binding: no generic durable mutation outbox, persistent command
queue, Background Sync, automatic replay, or fabricated offline success.
Reconnect rehydrates authoritative state. `ONLINE_ONLY`,
`REHYDRATE_BEFORE_RETRY`, and `MANUAL_RETRY_EXISTING_IDEMPOTENCY` retain their
accepted command-specific meanings.

QR and camera work preserves DEC-067 semantics: resource codes are exact,
typed, non-secret evidence and never authority; Dynamic QR remains raw,
ephemeral proof; decode causes zero business mutation; manual fallback is
always available; accepted-decoding suppression is explicit; streams and
permissions are cleaned up on close, success, unmount, route/workflow change,
and identity change. Native implementation may choose the Expo-compatible
native camera mechanism in MOB-009 without changing payload or server-command
semantics.

Push is attention-only. A notification may prompt an authoritative refresh and
navigate to a non-authoritative route intent, but it never assigns/accepts a
Task, changes state, verifies proof, grants scope, or releases a vehicle. MOB-003
must accept eligibility, safe payload, provider-neutral persistence, device
registration, retry/lease/concurrency, revocation, privacy, and observability
before push persistence or delivery is implemented. FCM delivery is outside the
MOB-009 proof-of-concept hard gate.

## 5. Status model

- `NOT STARTED`: no task implementation has begun.
- `IN PROGRESS`: implementation is active on an owned branch/worktree.
- `BLOCKED — DECISION REQUIRED`: a material semantic is not Accepted.
- `BLOCKED — EVIDENCE REQUIRED`: implementation exists but a required gate
  proof is absent or failed.
- `IMPLEMENTED / PHYSICAL PROOF PENDING`: the scoped implementation and
  focused repository evidence exist, but required physical-device evidence is
  unavailable and the task is not `DONE`.
- `DONE LOCALLY / PENDING COMMIT`: task-local requirements are complete in the
  current working tree but have not passed the repository commit/PR/merge
  workflow. This is not repository-level `DONE` under `docs/07_DEFINITION_OF_DONE.md`.
- `DONE`: merged through the repository workflow with required CI/evidence.

Current program status is MOB-001 through MOB-004 `DONE`; MOB-005 is
`IMPLEMENTED / PHYSICAL PROOF PENDING`; MOB-006 through MOB-027 are
`NOT STARTED`.

## 6. Batch map, gates, and progression

| Batch                              | Tasks           | Exit gate                                                                                 |
| ---------------------------------- | --------------- | ----------------------------------------------------------------------------------------- |
| 1 — Accepted architecture          | MOB-001–MOB-003 | Platform, native auth, and native push Decisions are Accepted                             |
| 2 — Foundation                     | MOB-004–MOB-006 | Repository/mobile boundaries and reproducible native/portable foundation are green        |
| 3 — Proof of concept               | MOB-007–MOB-009 | Physical Android POC hard gate passes in a Development Build                              |
| 4 — Intake and parking             | MOB-010–MOB-012 | Check-in, vehicle/condition, parking, and key-custody parity proven                       |
| 5 — Retrieval, release, shift      | MOB-013–MOB-015 | Retrieval through secure release plus Shift parity proven                                 |
| 6 — Supporting Employee UX         | MOB-016–MOB-018 | Directory, incident/guest access, localization, accessibility parity proven               |
| 7 — Optional tracking and push     | MOB-019–MOB-021 | Accepted tracking boundary and end-to-end attention-only push proven                      |
| 8 — Lifecycle and operations       | MOB-022–MOB-024 | Lifecycle, failure recovery, observability, and runbook gate passes                       |
| 9 — Proof, release, pilot, cutover | MOB-025–MOB-027 | Full quality gate, signed distribution, controlled pilot, and owner cutover decision pass |

Progression is gate-based, not calendar-based. Indicative relative ranges are:
Batch 1 small-to-medium, Batch 2 medium, Batch 3 large, Batches 4–6 large,
Batch 7 medium-to-large, Batch 8 large, and Batch 9 large. These are planning
ranges, not elapsed-time or delivery guarantees.

## 7. Dependency graph and safe parallel lanes

Critical path:

```text
MOB-001 -> MOB-002 -> MOB-004 -> MOB-005 -> MOB-006 -> MOB-007
        \-> MOB-003 -------------------------------> MOB-020 -> MOB-021 -> MOB-022
MOB-007 -> MOB-008 -> MOB-009 [POC HARD GATE]
MOB-009 -> MOB-010 -> MOB-011 -> MOB-012 -> MOB-013 -> MOB-014 -> MOB-015
MOB-015 -> MOB-016 -> MOB-017 -> MOB-018 -> MOB-023 -> MOB-024 -> MOB-025
MOB-019 ---------------------------------------------> MOB-025
MOB-022 ---------------------------------------------> MOB-025 -> MOB-026 -> MOB-027
```

Safe lanes may overlap only across isolated working trees and non-contentious
files: decision research for MOB-002 and MOB-003; native presentation work and
portable pure-TypeScript tests after MOB-006; test fixtures/device-matrix
preparation separate from implementation; and release-runbook preparation
after MOB-024. Database migrations, shared contracts, root workspace files,
architecture scripts, `apps/api`, and high-contention docs require explicit
single-owner coordination. Dependency order and gates cannot be bypassed by
parallel work.

## 8. Test strategy and production evidence

The test pyramid is: portable unit/contract tests; native component/hook tests;
API integration and database invariant tests; end-to-end Development Build
tests; physical-device workflow/lifecycle tests; then signed-build pilot
evidence. Mocks prove failure handling, not provider/device success. Emulator
evidence is supplementary.

Physical coverage must include Android 10, 11, 13, 15, and 16; Samsung,
Pixel/reference behavior, and representative mid-range hardware. At least one
real Samsung/mid-range-class device is mandatory. Real devices are required for
camera/QR, permissions, SecureStore, background/terminated lifecycle,
notifications, and signed-release behavior.

The MOB-025 provisional capacity profile is 10 Locations × 20 Employees, task
queue polling every 5 seconds (about 40 average queue requests/second before
other traffic), reconnect waves, concurrent Task/parking/retrieval/handoff
mutations, auth and push bursts, and database/provider outage plus recovery.
Measure p50/p95/p99 latency, throughput, error/retry/duplicate rate, pool and DB
pressure, queue staleness, push acceptance/delivery telemetry, and recovery
time. This profile and all SLO/capacity thresholds remain Proposed until owner
approval. Prefer k6 if MOB-025 discovery confirms it is the best repository fit;
this plan installs nothing.

## 9. POC hard gate after MOB-009

The program cannot proceed to MOB-010 until a physical Android Development
Build—not Expo Go—proves: real login; SecureStore refresh boundary; memory-only
access; kill/restart restoration; authoritative Organization, Location, role,
and active Shift; real task queue; one real protected versioned mutation;
authoritative rehydrate after an ambiguous result; exact resource QR parse;
invalid-then-valid scanning; duplicate-decode suppression; permission denial,
manual fallback, and camera cleanup; logout/revocation/purge; restart still
logged out; and English/Arabic RTL/LTR behavior. FCM delivery is explicitly
outside this hard gate.

## 10. Decision and scope gates

DEC-073 closes the native push architecture gate. The following remain
deferred gates, not silently selected architecture:

1. MOB-011: no new production photo-byte upload/object-storage pipeline is
   included. If the pilot requires parity the current server cannot provide,
   approve a separate explicit scope/decision first.
2. MOB-019: GPS is excluded from the first pilot by default unless a focused
   Accepted Decision includes it; whole-shift tracking remains prohibited.
3. MOB-025: owner-approved SLOs and capacity thresholds.
4. MOB-026: environment/provisioning details and named operational custody for
   organization-controlled accounts/signing. DEC-071 ownership policy is
   Accepted; provisioning is later work and is not a POC blocker.

## Repository facts discovered

- The repository is a pnpm/Turborepo modular monolith with the authoritative
  API in `apps/api`, Employee Web in `apps/valet`, shared public contracts in
  `packages/contracts`, and persistence in `packages/database`.
- Current Employee patterns already separate API clients, workflow controllers,
  recovery logic, screens, i18n, camera/scanner adapters, and server-side
  command/authorization/transaction modules. Native work should extract only
  proven portable orchestration, not import Web internals.
- `scripts/architecture-line-policy.mjs` recursively scans authored extensions
  from the local filesystem. The eight current `reference/**` violations are
  Git-ignored through `.git/info/exclude` and are not tracked. The tracked
  application baseline is not thereby proven broken.
- Existing protected commands use server-derived Staff scope, explicit domain
  commands, versions/idempotency where accepted, database constraints/locking,
  and atomic history/audit composition. Unknown caller outcomes after a timeout
  require authoritative re-read: a transaction may commit or roll back while
  the client cannot know the outcome.

## Binding requirements

- The authority order, Accepted Decisions, docs-first protocol, modular-monolith
  boundary, tenant/Location authorization, authorization-before-mutation,
  append-only history, forward-only migration, and 300-line rules all apply.
- DEC-071 locks the native platform/repository/release envelope. DEC-063 locks
  current offline behavior. Each workflow task remains subordinate to its
  task-specific Accepted Decisions.
- Eligibility is never durable client authority. Between an eligibility read
  and later use, membership, LocationAccess, Shift, ownership, version, or
  resource availability may change; each consumer mutation must re-prove its
  complete Accepted predicate in the authoritative transaction.

## Existing implementation patterns

- Thin HTTP/controller boundaries delegate to focused services/commands; shared
  Zod contracts define public shapes; tests prove exact authorization and
  database invariants.
- Employee Web uses feature-specific controllers and recovery paths rather than
  a generic offline queue. Camera parsers fill manual inputs and do not mutate.
- Provider-specific behavior belongs behind adapters; current observability is
  separate from append-only tenant AuditEvent evidence.

## Locked decisions

- Expo SDK 57 / React Native 0.86, Hermes, New Architecture, Expo Router,
  Development Builds, CNG, `apps/valet-native`, package/bundle
  `com.vaylet.employee`, API 29 product floor/API 36 target, Android-first/iOS
  shared architecture, OTA disabled, organization-controlled release ownership,
  and Employee Web fallback are locked by DEC-071.
- Dedicated native JSON Staff login/refresh/logout routes, memory-only access,
  secure-storage-only refresh, rotation/replay recovery, identity purge and Web
  transport non-regression are locked by DEC-072.
- Server domain, authorization, concurrency, financial, custody, and audit
  authority is retained. No task in this plan may reinterpret that boundary.

## Derived conclusions

- MOB-004 must repair the gate's repository-ownership boundary and add
  mobile/portable enforcement; it must not grandfather ignored reference files.
- MOB-003 belongs early because its Accepted contract constrains persistence and
  client integration, while actual FCM delivery remains outside the POC gate.
- The first pilot excludes GPS unless MOB-019 accepts inclusion, and it excludes
  any new photo-byte pipeline unless separately approved.
- Release provisioning is later operational work, not a scaffold or POC blocker;
  progression remains evidence-gated rather than date-gated.

## Risks / boundary violations

- Highest risks are credential/proof leakage, cached scope treated as authority,
  duplicate protected effects, Task/session conflation, custody discontinuity,
  push as authority, camera/sensor lifecycle leaks, cross-scope disclosure,
  blind replay, and evidence inflation.
- Any hard-zero violation, unresolved material semantic, uncoordinated
  high-contention edit, or failed gate blocks progression.

## Proposed implementation plan

Proceed only in the 27-task, nine-batch order below. Close Accepted-Decision
gates before dependent code, close the physical Android POC gate after MOB-009,
and close the full evidence gate before signing, pilot, or cutover.

## Test matrix

Use the pyramid and physical matrix in §8 plus each task's explicit automated
and physical proof. Mutations require first attempt, identical retry, concurrent
identical attempt, conflicting/stale attempt, retry after ambiguous result, and
cross-principal negative coverage where applicable. Database tasks also require
clean migration, existing-data migration, constraint, runtime-role, and rollback-
on-failure evidence without rewriting history.

## Files expected to change

Expected areas are conditional per task contract below: native app and portable
package foundations; focused Web extraction; existing contracts/API/database
only when expressly authorized; architecture scripts/tests; release/runbook and
evidence docs. Exact files are discovered at each task's pre-code protocol and
must respect high-contention ownership.

## Explicitly out of scope

The anti-scope list in §12 is binding for this program. The current MOB-003 task
changes only documentation and starts no MOB-004 or push implementation.

## Ready-to-implement verdict

**READY TO IMPLEMENT only where all stated dependencies are closed.** Native
authentication architecture is Accepted by DEC-072, but MOB-007 still depends
on MOB-005 and MOB-006. Native push architecture is Accepted by DEC-073, while
MOB-020 still depends on MOB-018 and single migration ownership. All other
progression remains subject to the stated dependencies and gates.

# Batch 1 — Accepted architecture

## MOB-001 — Mobile Platform and Repository Architecture

- **TASK ID:** MOB-001
- **TITLE:** Mobile Platform and Repository Architecture
- **STATUS:** DONE
- **OBJECTIVE:** Accept the native platform, repository placement, runtime generation, product identifiers, ownership, OTA, support, and fallback boundaries.
- **WHY:** All later native work needs one stable platform and repository contract.
- **DEPENDENCIES:** Owner architecture decisions; no earlier MOB task.
- **READ FIRST:** `AGENTS.md`; docs 00, 01, 06, 08, 09, 10, 13, 15, 17; DEC-071.
- **IN SCOPE:** Documentation-only DEC-071 and synchronized technology/repository/decision-log mirrors.
- **OUT OF SCOPE:** App scaffold, packages, runtime, DB, migrations, CI, Firebase, signing, MOB-002.
- **ARCHITECTURE INVARIANTS:** `apps/valet-native`; Expo SDK 57/RN 0.86; Hermes/New Architecture; Router; Dev Builds; CNG; API/server authority; Web fallback.
- **SECURITY INVARIANTS:** No credential/account secret; organization-controlled ownership; no new authority.
- **EXPECTED FILE AREAS:** `docs/08_DECISIONS_LOG.md`, `docs/09_TECH_STACK.md`, `docs/10_REPOSITORY_STRUCTURE.md`, `docs/decisions/DEC-071_*`.
- **DB IMPACT:** None.
- **DEPENDENCY IMPACT:** None.
- **ANDROID REQUIREMENTS:** Package `com.vaylet.employee`; min API 29; compile/target API 36; Android-first.
- **IOS PORTABILITY:** Bundle `com.vaylet.employee`; same Expo app; iOS smoke before pilot completion.
- **REQUIRED IMPLEMENTATION PROOF:** Accepted DEC text and synchronized mirrors; no runtime footprint.
- **AUTOMATED TESTS:** Documentation formatting and decision/status consistency checks only.
- **MANUAL/PHYSICAL DEVICE PROOF:** None for this documentation task.
- **VALIDATION COMMANDS:** `corepack pnpm exec prettier --check docs/08_DECISIONS_LOG.md docs/09_TECH_STACK.md docs/10_REPOSITORY_STRUCTURE.md docs/decisions/DEC-071_MOBILE_PLATFORM_REPOSITORY_ARCHITECTURE.md`; targeted `git diff --check`.
- **REVIEW RISKS:** Hidden runtime work, unresolved owner values, conflict between focused DEC and log mirror.
- **DEFINITION OF DONE:** DEC-071 and the canonical execution plan were committed and merged through the repository workflow.
- **RELATIVE SIZE:** Medium documentation decision.

## MOB-002 — Accept the native Staff authentication transport

- **TASK ID:** MOB-002
- **TITLE:** Accept the native Staff authentication transport
- **STATUS:** DONE
- **OBJECTIVE:** Accept the exact native login, refresh, secure-storage, rotation, replay, restore, logout, revocation, purge, and device-loss contract while reusing StaffAuthSession.
- **WHY:** DEC-023’s HttpOnly cookie transport is browser-specific and cannot be improvised in native code.
- **DEPENDENCIES:** MOB-001.
- **READ FIRST:** DEC-023, DEC-024, DEC-025, DEC-063, DEC-071; Staff auth contracts/controller/service and Employee Web auth client.
- **IN SCOPE:** Decision/design only; threat model; token transport; SecureStore boundary; refresh serialization; lifecycle and recovery; abuse/telemetry constraints.
- **OUT OF SCOPE:** Route/schema/code/dependency changes, provider selection unrelated to auth, MFA expansion, MOB-007 implementation.
- **ARCHITECTURE INVARIANTS:** Existing StaffAuthSession family and `{ userId }` principal; persisted authorization; no tenant/role claims as authority; one portable client contract with platform storage adapter.
- **SECURITY INVARIANTS:** Access memory-only; refresh only in accepted secure storage; rotation/replay fail closed; logout/revocation/identity change purge; secrets never logged or queued.
- **EXPECTED FILE AREAS:** Focused `docs/decisions/DEC-*`, decision log, security/stack/schema mirrors only if the Accepted contract requires them.
- **DB IMPACT:** DEC-072 confirms existing persistence is sufficient; no DB change in MOB-002.
- **DEPENDENCY IMPACT:** Decision records allowed Expo secure-storage dependency class; installs nothing.
- **ANDROID REQUIREMENTS:** Android Keystore-backed Expo SecureStore behavior, process death, reinstall/device-lock/error behavior, and API 29 floor addressed.
- **IOS PORTABILITY:** Keychain-backed adapter and equivalent lifecycle semantics designed from day one.
- **REQUIRED IMPLEMENTATION PROOF:** Accepted focused DEC with misuse cases, sequence/race analysis, route compatibility, purge matrix, and rollback/failure behavior.
- **AUTOMATED TESTS:** Decision consistency/audit only; implementation tests deferred to MOB-007.
- **MANUAL/PHYSICAL DEVICE PROOF:** None; identify required MOB-007 device proof.
- **VALIDATION COMMANDS:** Prettier check, plan/decision audit, `git diff --check`, no runtime diff.
- **REVIEW RISKS:** Raw refresh exposure, two simultaneous refresh winners, replay-family revocation drift, Web regression, client authority fields.
- **DEFINITION OF DONE:** DEC-072 is Accepted and mirrored locally; repository-level DONE still requires commit/PR/CI/merge. MOB-007 has no material auth semantic left to invent.
- **RELATIVE SIZE:** Medium security decision.

## MOB-003 — Accept the native Push Architecture

- **TASK ID:** MOB-003
- **TITLE:** Accept the native Push Architecture
- **STATUS:** DONE
- **OBJECTIVE:** Accept provider-neutral device registration, notification eligibility, safe payload, persistence, delivery, retry/lease, revocation, privacy, and observability semantics.
- **WHY:** DEC-070 is foreground Web notification behavior, not native push authority or infrastructure.
- **DEPENDENCIES:** MOB-001; may research in parallel with MOB-002 but must be Accepted before MOB-020.
- **READ FIRST:** DEC-007, DEC-014, DEC-023, DEC-024, DEC-063, DEC-070, DEC-071; current retrieval notification, task queue, authorization, and observability code.
- **IN SCOPE:** Decision/design only; eligible events/audiences; attention-only semantics; provider boundary; device/token lifecycle; dedupe; retry/lease/concurrency; safe metadata; telemetry and retention.
- **OUT OF SCOPE:** Firebase project creation, FCM credentials, schema/migration, sender/worker, native registration code, guaranteed delivery.
- **ARCHITECTURE INVARIANTS:** Backend determines eligibility from current persisted scope; push is replaceable provider adapter and never operational authority; polling/refresh remains truth.
- **SECURITY INVARIANTS:** No guest/auth/handoff/payment secret or unnecessary PII in payloads; revoked/disabled/logged-out devices become ineligible; tap reauthorizes.
- **EXPECTED FILE AREAS:** Focused decision file and synchronized docs only.
- **DB IMPACT:** DEC-073 accepts dedicated Staff push registration, intent and delivery persistence for MOB-020; no DB change now.
- **DEPENDENCY IMPACT:** Direct FCM server and Expo-compatible native notification dependency classes are approved behind adapters; no install now.
- **ANDROID REQUIREMENTS:** FCM path, notification permission behavior, token rotation, app states, channels, and Doze/OEM limits addressed without promising delivery.
- **IOS PORTABILITY:** Provider-neutral concepts and APNs-compatible adapter boundary; no FCM naming in shared contracts.
- **REQUIRED IMPLEMENTATION PROOF:** Accepted focused DEC with eligibility matrix, state machine, idempotency/deduplication, lease race analysis, safe payload examples, failure/recovery and observability.
- **AUTOMATED TESTS:** Decision audit only; future contract/integration/adapter tests enumerated.
- **MANUAL/PHYSICAL DEVICE PROOF:** Deferred; define real-device expectations for MOB-021/022.
- **VALIDATION COMMANDS:** Prettier check, plan/decision audit, `git diff --check`, no runtime diff.
- **REVIEW RISKS:** Push as authority, cross-tenant notification, duplicate sends, stale token reuse, secret payload, unbounded retries, provider lock-in.
- **DEFINITION OF DONE:** DEC-073 is Accepted and mirrored locally; repository-level DONE still requires commit/PR/CI/merge. MOB-020–022 have no material push semantic left to invent.
- **RELATIVE SIZE:** Medium-to-large architecture/security decision.

# Batch 2 — Repository and client foundation

## MOB-004 — Repository Architecture Gate and Mobile/Portable Boundaries

- **TASK ID:** MOB-004
- **TITLE:** Repository Architecture Gate and Mobile/Portable Boundaries
- **STATUS:** DONE
- **OBJECTIVE:** Establish a truthful tracked repository baseline and enforce native/portable import and file-structure boundaries.
- **WHY:** The current scanner recursively inspects the local filesystem, including Git-ignored reference material, so its result is not a truthful tracked-repository gate.
- **DEPENDENCIES:** MOB-001; coordinate with MOB-002/003 documentation but do not wait for implementation.
- **READ FIRST:** DEC-028, DEC-030, DEC-071; docs 10, 13, 17; architecture scripts/tests; root workspace config.
- **IN SCOPE:** Prove tracked baseline; distinguish ignored/local reference content; correct gate discovery boundary if needed; add portable/mobile boundary rules and tests; document commands.
- **OUT OF SCOPE:** Fake exemptions, grandfathering ignored references, unrelated reference/UI refactors, native scaffold, root dependency upgrades.
- **ARCHITECTURE INVARIANTS:** Gate evaluates repo-owned authored code; portable package cannot import DOM/Next/Node/RN/platform APIs; native cannot import Web internals; 300-line policy remains binding.
- **SECURITY INVARIANTS:** Gate changes cannot suppress auth/tenant/security architecture checks.
- **EXPECTED FILE AREAS:** `scripts/architecture-*`, architecture tests, root scripts/docs; only coordinated high-contention edits.
- **DB IMPACT:** None.
- **DEPENDENCY IMPACT:** Prefer dependency-free static enforcement; any tool addition needs explicit review.
- **ANDROID REQUIREMENTS:** New native source/config locations are recognized without treating generated `android/` as authored long-lived source.
- **IOS PORTABILITY:** Same for generated `ios/`; platform-specific code must stay in narrow adapter paths.
- **REQUIRED IMPLEMENTATION PROOF:** Clean tracked checkout passes; adding a forbidden portable/mobile import fails; adding an oversized authored file fails; ignored reference material cannot poison the gate.
- **AUTOMATED TESTS:** Architecture scanner discovery, tracked-boundary, import-edge, generated-dir, and line-policy regression tests.
- **MANUAL/PHYSICAL DEVICE PROOF:** None.
- **VALIDATION COMMANDS:** `corepack pnpm architecture:check`; focused architecture tests; `corepack pnpm lint`; `corepack pnpm typecheck`; `git diff --check`.
- **REVIEW RISKS:** Weakening DEC-030, hiding real tracked violations, Git-dependent nondeterminism, Windows/POSIX path drift.
- **DEFINITION OF DONE:** Reproducible tracked-repository gate is green and rejects representative mobile/portable violations without exemptions.
- **RELATIVE SIZE:** Medium.

## MOB-005 — Expo Native Application Foundation

- **TASK ID:** MOB-005
- **TITLE:** Expo Native Application Foundation
- **STATUS:** IMPLEMENTED / PHYSICAL PROOF PENDING
- **OBJECTIVE:** Create the reproducible Expo native app shell at `apps/valet-native` under DEC-071.
- **WHY:** Later physical-device work needs a real Development Build and stable repository integration.
- **DEPENDENCIES:** MOB-002/003 Accepted; MOB-004 green.
- **READ FIRST:** DEC-071 plus Accepted MOB-002/003; docs 09, 10, 17; root workspace/Turbo/package patterns.
- **IN SCOPE:** Expo SDK 57/RN 0.86 compatible scaffold, Router shell, Hermes/New Architecture, CNG config, identifiers, EN/AR shell, scripts, tests, reproducible dev build.
- **OUT OF SCOPE:** Operational workflows, production auth/push, Firebase credentials, OTA, signing, committed generated native directories.
- **ARCHITECTURE INVARIANTS:** Sibling app; no backend fork; CNG config is source; generated `android/`/`ios/` remain untracked; files stay under structure limits.
- **SECURITY INVARIANTS:** No secrets, test principals, authority claims, or production endpoint assumptions in bundle/config.
- **EXPECTED FILE AREAS:** `apps/valet-native/**`, workspace/Turbo/root lockfile, targeted docs/scripts.
- **DB IMPACT:** None.
- **DEPENDENCY IMPACT:** Pin only Expo-compatible minimum scaffold dependencies and lockfile changes; security/license review required.
- **ANDROID REQUIREMENTS:** `com.vaylet.employee`; API 29 product floor; API 36 compile/target; physical Development Build launch.
- **IOS PORTABILITY:** Matching bundle ID/config; platform-neutral routes/tokens; CNG prebuild smoke where toolchain permits.
- **REQUIRED IMPLEMENTATION PROOF:** Fresh-install commands produce and launch a Development Build; no Expo Go evidence substituted.
- **AUTOMATED TESTS:** App config, route shell, locale direction, scripts, and workspace/build/type/lint tests.
- **MANUAL/PHYSICAL DEVICE PROOF:** Real Android launch, reload, background/foreground shell, EN/AR direction.
- **VALIDATION COMMANDS:** Focused native lint/typecheck/test/build; root architecture/format checks; reproducible Expo config/prebuild inspection without committing generated dirs.
- **REVIEW RISKS:** Version drift, accidental Expo Go dependence, generated-dir commits, secret config, oversized shell files.
- **DEFINITION OF DONE:** A clean checkout can produce the approved native Development Build and all repository gates remain green.
- **RELATIVE SIZE:** Medium-to-large.

## MOB-006 — Portable Employee Client Foundation

- **TASK ID:** MOB-006
- **TITLE:** Portable Employee Client Foundation
- **STATUS:** NOT STARTED
- **OBJECTIVE:** Establish the focused pure-TypeScript Employee client boundary and first real Web/native reuse.
- **WHY:** Native must reuse client orchestration without importing DOM/Next or cloning business semantics.
- **DEPENDENCIES:** MOB-004 and MOB-005.
- **READ FIRST:** DEC-063, DEC-066, DEC-071; current Employee API/auth/recovery/connectivity code; packages/contracts patterns.
- **IN SCOPE:** Final package name, portable API/error/recovery primitives, injected transport/clock/storage-free interfaces, focused extraction with two real consumers.
- **OUT OF SCOPE:** UI component sharing, generic framework, server domain logic, persistent offline storage, broad Web rewrite.
- **ARCHITECTURE INVARIANTS:** Pure TypeScript; no DOM, browser globals, cookies, Next, Node-only, RN, Android, or iOS imports; backend remains authority.
- **SECURITY INVARIANTS:** Authority inputs are not modeled as trusted client fields; secrets remain outside portable persistence/logging.
- **EXPECTED FILE AREAS:** New focused package, `packages/contracts`, narrow `apps/valet` adoption, `apps/valet-native` consumer, boundary tests.
- **DB IMPACT:** None.
- **DEPENDENCY IMPACT:** Avoid runtime dependencies; any validation reuse must follow existing package contracts.
- **ANDROID REQUIREMENTS:** Runs under Hermes/New Architecture without Node/browser polyfills.
- **IOS PORTABILITY:** Platform-neutral public API; measure reusable non-visual logic later.
- **REQUIRED IMPLEMENTATION PROOF:** Same portable behavior tests exercise Web and native adapters; forbidden-import gate passes.
- **AUTOMATED TESTS:** Unit/contract/error/recovery tests; import-boundary negatives; both-consumer compile tests.
- **MANUAL/PHYSICAL DEVICE PROOF:** Native shell consumes one real portable path without behavior regression.
- **VALIDATION COMMANDS:** Focused package/Web/native tests and typechecks; root architecture/lint/format/build.
- **REVIEW RISKS:** Speculative abstraction, Web behavior drift, platform leakage, duplicate contract definitions.
- **DEFINITION OF DONE:** A small proven shared boundary exists with real Web/native reuse and no platform leakage.
- **RELATIVE SIZE:** Medium.

# Batch 3 — Native proof of concept

## MOB-007 — Native Staff Authentication Implementation

- **TASK ID:** MOB-007
- **TITLE:** Native Staff Authentication Implementation
- **STATUS:** NOT STARTED
- **OBJECTIVE:** Implement the Accepted MOB-002 native Staff auth lifecycle end to end.
- **WHY:** All protected native work depends on reliable identity restoration and revocation.
- **DEPENDENCIES:** MOB-002 Accepted; MOB-005/006 complete.
- **READ FIRST:** Accepted native auth DEC; DEC-023/024/025/063/071; auth API/contracts/tests and portable boundary.
- **IN SCOPE:** Native transport, SecureStore adapter, memory access, serialized refresh, restore, logout/revocation/purge, identity-change handling, truthful errors.
- **OUT OF SCOPE:** New auth semantics, MFA/SSO, public provisioning, role authority in tokens, push.
- **ARCHITECTURE INVARIANTS:** Existing server StaffAuthSession and principal; adapter-isolated storage; one portable lifecycle.
- **SECURITY INVARIANTS:** Exact Accepted token rules; no secret logging/persistence beyond secure refresh boundary; replay/revocation fail closed; purge on logout/auth loss.
- **EXPECTED FILE AREAS:** Native auth feature/adapters, portable client, existing auth API only if Accepted contract requires a narrow compatible endpoint, contracts/tests.
- **DB IMPACT:** Only if MOB-002 Accepted an explicit forward-only change; then docs/schema/migration/fixtures/invariant tests are mandatory.
- **DEPENDENCY IMPACT:** Only MOB-002-approved Expo secure-storage/runtime dependencies.
- **ANDROID REQUIREMENTS:** Physical API 29+ SecureStore, process kill/restart, clock/network failure, reinstall/device-lock cases.
- **IOS PORTABILITY:** Keychain adapter contract and compile/config smoke.
- **REQUIRED IMPLEMENTATION PROOF:** Login, restore, refresh rotation, concurrent refresh handling, revocation, logout purge, and restart-logged-out against real API.
- **AUTOMATED TESTS:** Parser/transport, lifecycle/races, secret-redaction, API integration, revocation, negative authorization, component tests.
- **MANUAL/PHYSICAL DEVICE PROOF:** Real Android login; kill/restart restore; expiry refresh; logout; revoke/disable; restart remains logged out.
- **VALIDATION COMMANDS:** Focused native/portable/API/auth tests; DB tests if changed; root architecture/lint/typecheck/test/build/format.
- **REVIEW RISKS:** Refresh race, replay family drift, token leakage, stale identity carryover, Web auth regression.
- **DEFINITION OF DONE:** Accepted lifecycle passes automated and physical proof with zero auth/tenant authority regression.
- **RELATIVE SIZE:** Large.

## MOB-008 — Operational Context + Task Queue + One Real Protected Mutation

- **TASK ID:** MOB-008
- **TITLE:** Operational Context + Task Queue + One Real Protected Mutation
- **STATUS:** NOT STARTED
- **OBJECTIVE:** Prove authenticated native access to real operational scope, task queue, and one existing versioned protected mutation.
- **WHY:** A vertical slice exposes integration, authorization, concurrency, and recovery risks before broad parity work.
- **DEPENDENCIES:** MOB-007.
- **READ FIRST:** DEC-014, DEC-032, DEC-034/035, DEC-063, DEC-066; staff context, dispatch, Shift, queue contracts and tests.
- **IN SCOPE:** Current Organization/Location/role/Shift projection; real queue; one narrow existing protected Task mutation; request identity/version; authoritative rehydrate after ambiguity.
- **OUT OF SCOPE:** New lifecycle transitions, client assignment authority, full dispatch/Shift parity, persistent offline queue, push.
- **ARCHITECTURE INVARIANTS:** Existing routes/contracts where fit; server chooses authority; Task lifecycle remains separate from ValetSession.
- **SECURITY INVARIANTS:** Client IDs are references only; current membership/Location/Shift/role and ownership re-proven before mutation; non-disclosing IDOR failures.
- **EXPECTED FILE AREAS:** Native context/task features, portable API/recovery logic, contracts; narrow server compatibility only if separately justified.
- **DB IMPACT:** None expected; any discovered need stops for focused decision.
- **DEPENDENCY IMPACT:** None expected.
- **ANDROID REQUIREMENTS:** Responsive queue and recovery on real mid-range device/network transitions.
- **IOS PORTABILITY:** Shared projections/recovery; platform-neutral view model.
- **REQUIRED IMPLEMENTATION PROOF:** Correct scope and queue; exactly one mutation effect; stale version loses; ambiguous response rehydrates without duplicate success.
- **AUTOMATED TESTS:** Portable reducer/recovery; native UI; API integration; two-principal tenant/Location/role negatives; idempotency/concurrency.
- **MANUAL/PHYSICAL DEVICE PROOF:** Login to real scope, view queue, mutate, simulate response loss, recover authoritative result.
- **VALIDATION COMMANDS:** Focused native/portable/API integration tests plus full root gates.
- **REVIEW RISKS:** Cached scope as authority, duplicate mutation, polling storm, task/session lifecycle conflation.
- **DEFINITION OF DONE:** Real vertical slice meets the zero-tolerance and recovery evidence needed for MOB-009 gate completion.
- **RELATIVE SIZE:** Large.

## MOB-009 — Native Camera / QR Scanner Foundation

- **TASK ID:** MOB-009
- **TITLE:** Native Camera / QR Scanner Foundation
- **STATUS:** NOT STARTED
- **OBJECTIVE:** Implement reusable native QR capture preserving DEC-067 payload, fallback, suppression, permission, and cleanup semantics, then close the POC hard gate.
- **WHY:** Physical scanning and app lifecycle are high-risk native capabilities that must be proven early.
- **DEPENDENCIES:** MOB-008; DEC-071 Development Build.
- **READ FIRST:** DEC-033, DEC-042, DEC-063, DEC-065, DEC-067/068, DEC-071; current parsers/scanner tests.
- **IN SCOPE:** Expo-compatible camera adapter; resource/Dynamic QR parsing reuse; permission states; invalid handling; accepted-decode suppression; manual fallback; cleanup; POC gate evidence.
- **OUT OF SCOPE:** Plate OCR, photo-byte uploads, scan-first discovery, mutation on decode, FCM, handoff completion parity.
- **ARCHITECTURE INVARIANTS:** Scanner is adapter; parsers/semantics portable; decode fills existing input and never mutates; no committed native projects.
- **SECURITY INVARIANTS:** Dynamic proof memory-only and promptly cleared; resource QR non-authoritative; no camera after workflow/identity exit.
- **EXPECTED FILE AREAS:** Native camera/scanner adapter/components, portable parser/tests, app permission config.
- **DB IMPACT:** None.
- **DEPENDENCY IMPACT:** Minimal Expo SDK-compatible camera/scanner package with lockfile/security review.
- **ANDROID REQUIREMENTS:** Physical API 29+ rear camera, deny/allow/busy/no-device paths, background/foreground and process lifecycle. A real Android 10 / API 29 Development Build is accepted for MOB-009 physical proof.
- **DEVELOPMENT POC WORKFLOW:** `corepack pnpm mobile:poc` reuses the installed Development Build and starts the local API plus LAN Metro without rebuilding the APK. JS/TS/UI-only changes use Metro reload; native dependency, plugin, generated configuration, or Android SDK-floor changes require a rebuilt Development APK.
- **IOS PORTABILITY:** Narrow camera/permission adapter and shared parser; iOS configuration compatibility.
- **REQUIRED IMPLEMENTATION PROOF:** Exact valid scan, invalid→valid, duplicate suppression, manual fallback, cleanup, logout cleanup, plus every POC hard-gate item in §9.
- **AUTOMATED TESTS:** Parser corpus, permission state machine, suppression/re-arm, cleanup, no-mutation-on-decode, component and integration tests.
- **MANUAL/PHYSICAL DEVICE PROOF:** Full §9 matrix on a real Android Development Build in EN and AR.
- **VALIDATION COMMANDS:** Focused scanner/native/portable tests; Expo config/build checks; root architecture/lint/typecheck/test/build/format.
- **REVIEW RISKS:** Camera leak, repeated proof submission, local success, proof persistence, Expo Go-only evidence.
- **DEFINITION OF DONE:** POC hard gate is signed off with reproducible physical evidence; only then may MOB-010 start.
- **RELATIVE SIZE:** Large.

# Batch 4 — Intake and parking parity

## MOB-010 — Check-In + Returning Recognition Native Parity

- **TASK ID:** MOB-010
- **TITLE:** Check-In + Returning Recognition Native Parity
- **STATUS:** NOT STARTED
- **OBJECTIVE:** Deliver native check-in intake, returning recognition, and continuation/recovery parity.
- **WHY:** Fast, correct custody intake is the start of every Employee operation.
- **DEPENDENCIES:** MOB-009 POC gate.
- **READ FIRST:** DEC-012, DEC-020, DEC-063, DEC-069; check-in/returning contracts, commands, drafts/continuations, Web flows.
- **IN SCOPE:** Known/unknown plate paths; exact returning match; customer suggestion boundary; intake idempotency; authoritative continuation; manual fallback; EN/AR.
- **OUT OF SCOPE:** New recognition heuristics, auto-merge, plate-as-authority, condition/photo scope assigned to MOB-011.
- **ARCHITECTURE INVARIANTS:** Existing commands/contracts; stable Vehicle/ValetSession identity; portable orchestration; server normalization and dedupe.
- **SECURITY INVARIANTS:** Tenant-wide returning suggestions only under Accepted scope; no cross-tenant data; client Organization/Location values never authorize.
- **EXPECTED FILE AREAS:** Native check-in features, portable workflow, contracts/tests; server only for proven parity defect.
- **DB IMPACT:** None expected; any new identity persistence requires decision and full DB protocol.
- **DEPENDENCY IMPACT:** None expected.
- **ANDROID REQUIREMENTS:** Fast touch/keyboard flow on mid-range device; scanner/manual plate transition; process/network recovery.
- **IOS PORTABILITY:** Shared intake state machine and validation; platform-neutral input models.
- **REQUIRED IMPLEMENTATION PROOF:** New/returning/unknown vehicle; duplicate/race; ambiguous intake recovery; customer suggestion privacy; EN/AR.
- **AUTOMATED TESTS:** Workflow/unit/component; API integration and two-tenant negatives; idempotency/concurrency; accessibility.
- **MANUAL/PHYSICAL DEVICE PROOF:** Normal low-friction check-in timing, denial/manual fallback, network interruption/recovery on real Android.
- **VALIDATION COMMANDS:** Focused native/portable/contracts/API tests plus root gates.
- **REVIEW RISKS:** Over-broad recognition, duplicate Vehicle/session, lost stable operation ID, invented photos.
- **DEFINITION OF DONE:** Native intake matches accepted Web/server behavior and preserves authoritative recovery.
- **RELATIVE SIZE:** Large.

## MOB-011 — Vehicle Identity / Condition Native Parity

- **TASK ID:** MOB-011
- **TITLE:** Vehicle Identity / Condition Native Parity
- **STATUS:** NOT STARTED
- **OBJECTIVE:** Implement native vehicle details, identity correction, and current condition workflow parity.
- **WHY:** Custody needs accurate, append-only-correctable identity and condition evidence.
- **DEPENDENCIES:** MOB-010.
- **READ FIRST:** DEC-012, DEC-020, DEC-063, DEC-069; vehicle identity/details/condition contracts and commands; vehicle-photo README.
- **IN SCOPE:** Existing identity/detail fields, versions, condition notes/corrections/completion, current assistive plate/manual camera behavior only where server-supported.
- **OUT OF SCOPE:** AI damage detection, autonomous recognition, auto-merge, and any new production condition-photo byte upload/object-storage pipeline.
- **ARCHITECTURE INVARIANTS:** Explicit audited commands; historical facts append-only; client never rewrites history or invents media success.
- **SECURITY INVARIANTS:** Photo/condition data private by default; scope/ownership/type/size checks remain server-owned.
- **EXPECTED FILE AREAS:** Native vehicle/condition features, portable models, contracts/tests; server/media only under separately approved scope.
- **DB IMPACT:** None expected; media parity gap requiring persistence is a separate scope/decision.
- **DEPENDENCY IMPACT:** No new upload/storage dependency without separate approval.
- **ANDROID REQUIREMENTS:** Camera permission/lifecycle and manual plate entry; no camera retention after exit.
- **IOS PORTABILITY:** Shared validation/orchestration with camera adapter.
- **REQUIRED IMPLEMENTATION PROOF:** Version conflict, correction audit behavior, unknown→known identity, privacy failures, truthful media limitations.
- **AUTOMATED TESTS:** Validation/state/component/API integration; tenant negatives; optimistic concurrency; camera cleanup.
- **MANUAL/PHYSICAL DEVICE PROOF:** Identity and condition paths, denial/manual fallback, lifecycle cleanup, EN/AR.
- **VALIDATION COMMANDS:** Focused native/contracts/API tests plus root gates.
- **REVIEW RISKS:** Silent historical rewrite, privacy leak, pretending a missing byte pipeline exists, camera leak.
- **DEFINITION OF DONE:** All currently supported identity/condition behavior is truthful and parity-proven; any pilot media gap is explicitly gated.
- **RELATIVE SIZE:** Large.

## MOB-012 — Parking + Key Custody Native Parity

- **TASK ID:** MOB-012
- **TITLE:** Parking + Key Custody Native Parity
- **STATUS:** NOT STARTED
- **OBJECTIVE:** Deliver native Parking task execution, spot evidence, post-parking key-slot binding, and custody parity.
- **WHY:** Parking/key custody is a core physical-control chain with concurrency risk.
- **DEPENDENCIES:** MOB-011.
- **READ FIRST:** DEC-031–038, DEC-063, DEC-065, DEC-067/068; parking/key contracts, commands, tracking lifecycle, Web flow.
- **IN SCOPE:** Accept/start Parking; spot scan/manual; key-slot scan/manual; confirm parked; dual-mode in-flight compatibility; rehydrate/retry.
- **OUT OF SCOPE:** Slot reservation/picker, silent reassignment, generic key lookup, new lifecycle state, GPS collection beyond accepted existing server policy.
- **ARCHITECTURE INVARIANTS:** ValetSession and Task lifecycles separate; atomic transition/task/dispatch/custody/audit effects; append-only custody.
- **SECURITY INVARIANTS:** Current actor/Location/Shift/Task ownership and evidence re-proven; scanned codes never authorize.
- **EXPECTED FILE AREAS:** Native parking/key features, portable recovery, existing contracts/tests; server only for verified parity defect.
- **DB IMPACT:** None expected; existing uniqueness/locking remain authority.
- **DEPENDENCY IMPACT:** None beyond MOB-009 camera foundation.
- **ANDROID REQUIREMENTS:** Physical spot/key scans, rapid repeated frames, network loss, background/foreground, mid-range performance.
- **IOS PORTABILITY:** Shared flow/recovery and scanner payloads; adapter-only camera.
- **REQUIRED IMPLEMENTATION PROOF:** Canonical custody order; one winner for same slot; loser zero effects; in-flight compatibility; ambiguous recovery.
- **AUTOMATED TESTS:** State/recovery/component; API DB concurrency; two-principal authorization; custody/audit exactness.
- **MANUAL/PHYSICAL DEVICE PROOF:** Full park path, wrong/inactive/occupied code, denial/manual fallback, response loss, EN/AR.
- **VALIDATION COMMANDS:** Focused native/contracts/API/database tests plus root gates.
- **REVIEW RISKS:** Broken custody order, duplicate assignment, scan authority, stale retry, mismatched task/session state.
- **DEFINITION OF DONE:** Parking and key-custody parity passes automated concurrency and physical evidence with exact atomic history.
- **RELATIVE SIZE:** Large.

# Batch 5 — Retrieval, release, and Shift parity

## MOB-013 — Retrieval + Mark Ready Native Parity

- **TASK ID:** MOB-013
- **TITLE:** Retrieval + Mark Ready Native Parity
- **STATUS:** NOT STARTED
- **OBJECTIVE:** Deliver retrieval Task acceptance/start, key checkout, vehicle retrieval, and Mark Ready parity.
- **WHY:** Retrieval is a contested multi-actor path leading into secure handoff.
- **DEPENDENCIES:** MOB-012.
- **READ FIRST:** DEC-039/040/044, DEC-063, DEC-068, DEC-070; retrieval/dispatch/key contracts, commands, Web flow.
- **IN SCOPE:** Queue/assignment acceptance; Start Retrieval; verified key checkout; Mark Ready; cancellation/current-state presentation; ambiguity recovery.
- **OUT OF SCOPE:** Push delivery, handoff verification/release, predictive retrieval.
- **ARCHITECTURE INVARIANTS:** Separate Task/session lifecycles; one active retrieval Task; atomic custody/dispatch/audit; server versions.
- **SECURITY INVARIANTS:** Current ownership/Shift/Location checked before every mutation; key/resource codes are evidence only.
- **EXPECTED FILE AREAS:** Native retrieval features, portable orchestration/recovery, existing contracts/tests.
- **DB IMPACT:** None expected.
- **DEPENDENCY IMPACT:** None expected.
- **ANDROID REQUIREMENTS:** Reliable scans and recovery under foreground/background/network transitions.
- **IOS PORTABILITY:** Shared state/recovery; camera adapter only.
- **REQUIRED IMPLEMENTATION PROOF:** Duplicate retrieval prevention; reassignment/stale actor loss; exact key checkout; Start/Ready ambiguity recovery.
- **AUTOMATED TESTS:** Workflow/component; API integration; concurrency/idempotency; authorization and audit/custody exactness.
- **MANUAL/PHYSICAL DEVICE PROOF:** Request→accept→retrieve→ready; wrong key; reassignment; response loss; EN/AR.
- **VALIDATION COMMANDS:** Focused native/contracts/API/database tests plus root gates.
- **REVIEW RISKS:** Multiple active tasks, stale owner mutation, premature READY, custody gap.
- **DEFINITION OF DONE:** Retrieval through READY matches accepted server semantics with zero duplicate/custody defects.
- **RELATIVE SIZE:** Large.

## MOB-014 — Secure Handoff / Vehicle Release Native Parity

- **TASK ID:** MOB-014
- **TITLE:** Secure Handoff / Vehicle Release Native Parity
- **STATUS:** NOT STARTED
- **OBJECTIVE:** Deliver native Pickup Code/Dynamic QR verification, supervisor override, abort, financial guard, and final release parity.
- **WHY:** Vehicle release is the highest-risk custody boundary.
- **DEPENDENCIES:** MOB-013.
- **READ FIRST:** DEC-016, DEC-042/043, DEC-050–057, DEC-063/067; handoff/payment contracts, commands, Web recovery.
- **IN SCOPE:** Initiate, verify, override, abort, rehydrate, and complete release using existing accepted server commands and proofs.
- **OUT OF SCOPE:** Offline verification/release, proof persistence, new payment provider/payment UX, QR authority, relaxed financial policy.
- **ARCHITECTURE INVARIANTS:** Proof/financial/session states remain separate; final release is atomic with custody/audit; server canonical.
- **SECURITY INVARIANTS:** Proof memory-only/single-use/online; current owner and financial guard re-proven; override authorized/reasoned/audited; secrets never logged.
- **EXPECTED FILE AREAS:** Native handoff/release feature, portable recovery, existing contracts/tests.
- **DB IMPACT:** None expected.
- **DEPENDENCY IMPACT:** None expected.
- **ANDROID REQUIREMENTS:** Dynamic QR camera lifecycle; screen privacy; kill/background/expiry behavior.
- **IOS PORTABILITY:** Shared proof semantics/recovery; platform camera/privacy adapters.
- **REQUIRED IMPLEMENTATION PROOF:** Valid/invalid/expired/replayed proof; override; payment block; concurrent release one winner; response-loss recovery.
- **AUTOMATED TESTS:** Proof-clearing/component; API integration; rate/attempt/authorization; concurrency; financial/audit/custody invariants.
- **MANUAL/PHYSICAL DEVICE PROOF:** Both proof modes, denial/manual path, background/expiry, override, blocked payment, successful release, EN/AR.
- **VALIDATION COMMANDS:** Focused native/contracts/API/database/security tests plus root gates.
- **REVIEW RISKS:** Unauthorized release, secret leakage, double release, guard bypass, local verified state.
- **DEFINITION OF DONE:** Secure handoff/release passes all hard-zero controls and physical proof.
- **RELATIVE SIZE:** Extra large.

## MOB-015 — Shift Native Parity

- **TASK ID:** MOB-015
- **TITLE:** Shift Native Parity
- **STATUS:** NOT STARTED
- **OBJECTIVE:** Deliver truthful Start/active/End Shift native behavior and open-task handoff recovery.
- **WHY:** Shift eligibility bounds Employee operational authority.
- **DEPENDENCIES:** MOB-014.
- **READ FIRST:** DEC-032, DEC-063, DEC-066; Shift contracts/commands, operational context, Web screens.
- **IN SCOPE:** Start Shift, authoritative active context, elapsed presentation, End Shift confirmation/cashReported, open-task error and refresh recovery.
- **OUT OF SCOPE:** Payroll, timesheets, fake counters, background whole-shift GPS, employee analytics.
- **ARCHITECTURE INVARIANTS:** Server timestamps/status; context refresh confirms transitions; no client-created eligibility.
- **SECURITY INVARIANTS:** Current membership/Location/role; self-owned Shift; stale intent purged on identity/scope change.
- **EXPECTED FILE AREAS:** Native Shift/context features, portable recovery, existing contracts/tests.
- **DB IMPACT:** None expected.
- **DEPENDENCY IMPACT:** None.
- **ANDROID REQUIREMENTS:** Process/background timing display and network ambiguity without local authority.
- **IOS PORTABILITY:** Shared state/recovery/formatting.
- **REQUIRED IMPLEMENTATION PROOF:** Start idempotency; one active Shift rules; open-task fail; ambiguous End Shift recovery; context becomes no-active-shift.
- **AUTOMATED TESTS:** State/component; API authorization/idempotency; recovery; localization/timezone.
- **MANUAL/PHYSICAL DEVICE PROOF:** Start, resume, end block, resolve tasks, end, kill/restart, EN/AR.
- **VALIDATION COMMANDS:** Focused native/contracts/API tests plus root gates.
- **REVIEW RISKS:** Client-clock authority, ending with open work, fake identity/metrics, stale scope.
- **DEFINITION OF DONE:** Native Shift behavior matches authoritative server contract and reliably gates field workflows.
- **RELATIVE SIZE:** Medium-to-large.

# Batch 6 — Supporting Employee UX parity

## MOB-016 — Vehicle Directory Native Parity

- **TASK ID:** MOB-016
- **TITLE:** Vehicle Directory Native Parity
- **STATUS:** NOT STARTED
- **OBJECTIVE:** Deliver the bounded, role-filtered active vehicle directory and safe workflow entry parity.
- **WHY:** Employees need operational lookup without gaining command authority or excess custody detail.
- **DEPENDENCIES:** MOB-015.
- **READ FIRST:** DEC-066; staff vehicle-directory contracts/authorization/queries and Web screens.
- **IN SCOPE:** Capped/truncated projection, search within truthful server boundary, role-aware key detail, row-to-existing-workflow navigation.
- **OUT OF SCOPE:** Global analytics/search, completed history, new operations, row visibility as authority.
- **ARCHITECTURE INVARIANTS:** Read projection separate from commands; later operation reauthorizes.
- **SECURITY INVARIANTS:** Exact Location; Employee relation filter; fail-closed key masking; two-principal IDOR protection.
- **EXPECTED FILE AREAS:** Native directory feature, portable projections, existing contracts/tests.
- **DB IMPACT:** None expected; indexes only after measured query evidence and DB protocol.
- **DEPENDENCY IMPACT:** None.
- **ANDROID REQUIREMENTS:** Performant bounded list and accessible identifiers on mid-range device.
- **IOS PORTABILITY:** Shared data/view models and formatting.
- **REQUIRED IMPLEMENTATION PROOF:** Supervisor vs Employee rows/fields, truncation truth, no mutation on row tap, reauthorization on action.
- **AUTOMATED TESTS:** Component/contract; API query/authorization; two-principal negatives; performance bounds.
- **MANUAL/PHYSICAL DEVICE PROOF:** Large bounded list, role comparison, RTL/LTR identifiers, workflow navigation.
- **VALIDATION COMMANDS:** Focused native/contracts/API tests plus root gates.
- **REVIEW RISKS:** Key-location disclosure, misleading search, stale row authority, unbounded result.
- **DEFINITION OF DONE:** Directory parity is truthful, bounded, accessible, and non-authoritative.
- **RELATIVE SIZE:** Medium.

## MOB-017 — Incident + Guest Access Native Parity

- **TASK ID:** MOB-017
- **TITLE:** Incident + Guest Access Native Parity
- **STATUS:** NOT STARTED
- **OBJECTIVE:** Deliver native incident reporting and safe Employee guest-access link/QR issuance parity.
- **WHY:** Real shifts need exception capture and secure customer access without exposing bearer material.
- **DEPENDENCIES:** MOB-016.
- **READ FIRST:** DEC-043, DEC-059, DEC-063/064; incident and guest-access contracts/commands; Web flows.
- **IN SCOPE:** Incident draft/manual retry identity; authoritative status; guest link/QR generation from configured canonical origin; safe share presentation.
- **OUT OF SCOPE:** Guest app rewrite, token persistence/logging, durable incident outbox, attachment pipeline not already supported.
- **ARCHITECTURE INVARIANTS:** Incident state separate; guest token remains independent; customer app remains Web.
- **SECURITY INVARIANTS:** Exact scope/role; raw guest token/link memory-only and scrub-safe; incident idempotency actor-bound; no protected proof persisted.
- **EXPECTED FILE AREAS:** Native incident/guest-access features, portable recovery, existing contracts/tests.
- **DB IMPACT:** None expected.
- **DEPENDENCY IMPACT:** Platform share/QR rendering only through reviewed Expo-compatible APIs.
- **ANDROID REQUIREMENTS:** Share-sheet/clipboard lifecycle, screen/privacy behavior, reconnect/manual retry.
- **IOS PORTABILITY:** Shared URL/QR semantics with platform share adapter.
- **REQUIRED IMPLEMENTATION PROOF:** Incident duplicate prevention/retry; unauthorized read/write; safe link/QR; logout/identity purge.
- **AUTOMATED TESTS:** Validation/component; API idempotency/authorization; token redaction; URL construction.
- **MANUAL/PHYSICAL DEVICE PROOF:** Incident offline interruption/manual retry; share/QR open in Customer Web; EN/AR.
- **VALIDATION COMMANDS:** Focused native/contracts/API/security tests plus root gates.
- **REVIEW RISKS:** Guest-token leakage, duplicate incident, cross-scope data, fabricated attachment success.
- **DEFINITION OF DONE:** Both flows match accepted semantics without durable secret or mutation replay.
- **RELATIVE SIZE:** Large.

## MOB-018 — Employee Native UI / Localization / Accessibility Parity

- **TASK ID:** MOB-018
- **TITLE:** Employee Native UI / Localization / Accessibility Parity
- **STATUS:** NOT STARTED
- **OBJECTIVE:** Close cross-flow native usability, EN/AR, RTL/LTR, accessibility, loading/error, and visual-consistency gaps.
- **WHY:** Operational correctness is unusable if field staff cannot read, navigate, or recover quickly.
- **DEPENDENCIES:** MOB-010–017.
- **READ FIRST:** DEC-066/067/071; docs 01/15; current i18n dictionaries, primitives, accessibility tests and native design tokens.
- **IN SCOPE:** Full copy inventory, RTL/LTR identifier isolation, focus/touch/labels, dynamic text, contrast, reduced motion, truthful empty/loading/error states.
- **OUT OF SCOPE:** Product redesign, Dashboard/Guest UI migration, invented analytics, business-semantic changes.
- **ARCHITECTURE INVARIANTS:** Platform-specific native UI; shared localization/formatting where portable; no DOM component reuse.
- **SECURITY INVARIANTS:** Accessibility labels/previews do not expose secrets or masked data; screenshots/diagnostics remain safe.
- **EXPECTED FILE AREAS:** Native UI/theme/i18n/accessibility tests; portable formatting; no unrelated Web refactor.
- **DB IMPACT:** None.
- **DEPENDENCY IMPACT:** Prefer platform accessibility primitives; additions require focused review.
- **ANDROID REQUIREMENTS:** TalkBack, font scaling, touch targets, dark/light and RTL across supported OS/device classes.
- **IOS PORTABILITY:** VoiceOver-compatible semantics and shared tokens/copy architecture.
- **REQUIRED IMPLEMENTATION PROOF:** All Employee paths complete in EN/AR at large text with keyboard/scanner/manual alternatives and truthful errors.
- **AUTOMATED TESTS:** Copy-key completeness, RTL isolation, accessibility roles/labels, visual/state regression where stable.
- **MANUAL/PHYSICAL DEVICE PROOF:** TalkBack, font scaling, RTL, one-handed/touch, sunlight/contrast review on real Android.
- **VALIDATION COMMANDS:** Focused UI/i18n/a11y tests; native build; root gates.
- **REVIEW RISKS:** Missing Arabic, reversed codes, inaccessible scanner fallback, hidden error recovery, secret labels.
- **DEFINITION OF DONE:** Core native flows meet documented EN/AR and accessibility evidence with no semantic regression.
- **RELATIVE SIZE:** Large cross-cutting.

# Batch 7 — Optional tracking and native push

## MOB-019 — Task-Scoped Location Decision / Implementation Boundary

- **TASK ID:** MOB-019
- **TITLE:** Task-Scoped Location Decision / Implementation Boundary
- **STATUS:** NOT STARTED
- **OBJECTIVE:** Decide whether GPS enters the first native pilot and, only if Accepted, implement its task-scoped boundary.
- **WHY:** Location can aid operations but creates material privacy, permission, battery, lifecycle, and evidence risks.
- **DEPENDENCIES:** MOB-015/018; can research while push work proceeds.
- **READ FIRST:** DEC-013, DEC-046/047, DEC-063/071; tracking contracts, ingestion, lifecycle, map setup, privacy rules.
- **IN SCOPE:** First a focused decision on inclusion; if included, exact eligible Parking/Retrieval tasks, permission/sampling/accuracy/battery/lifecycle, adapter, ingestion and disclosure proof.
- **OUT OF SCOPE:** Whole-shift/background surveillance, guest coordinates, predictive routing, location as transition authority, implementation without Accepted inclusion.
- **ARCHITECTURE INVARIANTS:** Tracking state separate; backend controls task eligibility; coordinates never drive automatic custody transitions.
- **SECURITY INVARIANTS:** Explicit permission, minimum retention/precision, exact scope, stop on task/auth/Shift end, safe logs and Guest exclusion.
- **EXPECTED FILE AREAS:** Focused decision/docs; conditional native location adapter and existing tracking contracts/API/tests.
- **DB IMPACT:** Existing persistence preferred; any change requires docs03, migration, fixtures, constraints and focused acceptance.
- **DEPENDENCY IMPACT:** Only Accepted Expo-compatible location dependency; none if pilot exclusion remains.
- **ANDROID REQUIREMENTS:** Permission states, OEM battery restrictions, foreground/background limits, task stop, API 29–36 behavior.
- **IOS PORTABILITY:** Core Location-compatible adapter semantics; no Android-only public API.
- **REQUIRED IMPLEMENTATION PROOF:** Decision recorded. If excluded, feature absent and no permission requested. If included, task-only start/stop/privacy/ingestion evidence.
- **AUTOMATED TESTS:** Decision/audit; conditional eligibility, authorization, precision, lifecycle, ingestion idempotency tests.
- **MANUAL/PHYSICAL DEVICE PROOF:** Conditional real-device permission/battery/background/stop matrix; otherwise verify no location prompt or collection.
- **VALIDATION COMMANDS:** Focused decision/native/API/tracking tests as applicable plus root gates.
- **REVIEW RISKS:** Scope creep into whole-shift tracking, silent background collection, stale task tracking, battery harm.
- **DEFINITION OF DONE:** Accepted inclusion/exclusion is implemented exactly; default first-pilot position is excluded until Accepted otherwise.
- **RELATIVE SIZE:** Medium decision; large only if included.

## MOB-020 — Native Push Backend Persistence + Delivery

- **TASK ID:** MOB-020
- **TITLE:** Native Push Backend Persistence + Delivery
- **STATUS:** NOT STARTED
- **OBJECTIVE:** Implement the Accepted MOB-003 provider-neutral registration persistence, eligibility composition, delivery, retry/lease, and observability backend.
- **WHY:** Push needs durable, concurrency-safe backend ownership before clients register.
- **DEPENDENCIES:** MOB-003 Accepted; MOB-018; coordinate single migration ownership.
- **READ FIRST:** DEC-073; DEC-007/014/023/024/063/070/071/072; notification/dispatch/authorization/observability/database patterns.
- **IN SCOPE:** Exact Accepted schema/migration; registration/revocation endpoints; eligible-event composition; provider adapter; delivery worker/executor; dedupe; bounded retry/lease; telemetry.
- **OUT OF SCOPE:** Client registration/UI/lifecycle, notification as authority, secret payloads, unapproved worker infrastructure, guaranteed delivery.
- **ARCHITECTURE INVARIANTS:** Modular monolith and provider adapter; business event/eligibility separate from provider attempt; server state canonical.
- **SECURITY INVARIANTS:** Current scope/role/device eligibility; safe payload; credentials server-only; logout/disable/revoke enforcement; authorization before mutation.
- **EXPECTED FILE AREAS:** `apps/api` push/notification adapter/module, contracts, database schema/new migration/fixtures/tests, observability/runbook docs.
- **DB IMPACT:** Add the exact DEC-073 registration, intent and delivery model; forward-only migration, FKs/unique/check/partial indexes/least privilege/invariant tests.
- **DEPENDENCY IMPACT:** Only Accepted provider/server dependencies; pin, audit, and isolate behind adapter.
- **ANDROID REQUIREMENTS:** FCM-compatible delivery path and token semantics without FCM concepts leaking into shared domain.
- **IOS PORTABILITY:** APNs adapter can satisfy the same provider-neutral contracts later.
- **REQUIRED IMPLEMENTATION PROOF:** Eligibility negatives; duplicate event/device; lease race one winner; transient/permanent provider failure; token invalidation; recovery; safe telemetry.
- **AUTOMATED TESTS:** Contract/unit; PostgreSQL constraints; authorization; concurrency/lease/idempotency; provider adapter failure; redaction.
- **MANUAL/PHYSICAL DEVICE PROOF:** Backend/provider sandbox evidence only; end-to-end device proof belongs to MOB-021/022.
- **VALIDATION COMMANDS:** Prisma validate/generate as repo-defined; focused DB/API tests; root architecture/lint/typecheck/test/build/format.
- **REVIEW RISKS:** Cross-tenant delivery, duplicate sends, stuck lease, unbounded retry, secret/PII payload, runtime over-privilege.
- **DEFINITION OF DONE:** Accepted backend push contract is implemented with database/concurrency/security proof and no client authority.
- **RELATIVE SIZE:** Extra large.

## MOB-021 — Native Device Registration + Notification Integration

- **TASK ID:** MOB-021
- **TITLE:** Native Device Registration + Notification Integration
- **STATUS:** NOT STARTED
- **OBJECTIVE:** Register/revoke native installations and receive safe attention-only notifications end to end.
- **WHY:** Backend delivery is useful only when device identity and Staff lifecycle are correctly bound.
- **DEPENDENCIES:** MOB-020; organization-controlled Firebase provisioning available for the test environment.
- **READ FIRST:** DEC-073; MOB-020 contracts; DEC-023/063/070/071/072; native auth/lifecycle adapters.
- **IN SCOPE:** Permission UX, provider token acquisition, authorized registration/rotation/revocation, logout/auth-change cleanup, receipt handler, authoritative refresh and safe route intent.
- **OUT OF SCOPE:** Business mutation on receipt/tap, background data sync, sensitive payload, final terminated-state matrix assigned to MOB-022.
- **ARCHITECTURE INVARIANTS:** Portable notification intent with platform adapter; every open refreshes/re-authorizes; polling remains fallback.
- **SECURITY INVARIANTS:** Device/provider tokens treated as sensitive operational identifiers; scoped server registration; no auth/handoff secret in notification.
- **EXPECTED FILE AREAS:** Native notification adapter/feature/config, auth integration, contracts/tests; no service credentials in app/repo.
- **DB IMPACT:** None beyond MOB-020 Accepted persistence.
- **DEPENDENCY IMPACT:** Expo-compatible notification/provider client dependencies approved by MOB-003; lockfile/config changes.
- **ANDROID REQUIREMENTS:** Android 13+ runtime permission plus older OS behavior; token rotation; channel presentation; real FCM device.
- **IOS PORTABILITY:** APNs permission/token adapter contract and shared notification intent.
- **REQUIRED IMPLEMENTATION PROOF:** Register once/idempotently; rotate; logout/revoke; correct eligible delivery; ineligible actor receives none; tap refreshes authoritative state.
- **AUTOMATED TESTS:** Registration lifecycle, auth identity change, payload parser, navigation intent, duplicate receipt, redaction, API integration.
- **MANUAL/PHYSICAL DEVICE PROOF:** Real Android permission deny/allow, delivery, tap, token refresh, logout/relogin, disabled/revoked user.
- **VALIDATION COMMANDS:** Focused native/API/push tests; Development Build config; root gates.
- **REVIEW RISKS:** Registration survives logout, token leakage, stale identity, tap bypasses auth, test credential committed.
- **DEFINITION OF DONE:** Real device receives only eligible safe notifications and all taps re-enter authoritative flows.
- **RELATIVE SIZE:** Large.

# Batch 8 — Lifecycle, hardening, and operations

## MOB-022 — Foreground / Background / Cold-Start Notification Behavior

- **TASK ID:** MOB-022
- **TITLE:** Foreground / Background / Cold-Start Notification Behavior
- **STATUS:** NOT STARTED
- **OBJECTIVE:** Prove deterministic, safe notification behavior across all app states and navigation/auth races.
- **WHY:** Mobile notification bugs concentrate in background/terminated lifecycle and stale route context.
- **DEPENDENCIES:** MOB-021.
- **READ FIRST:** DEC-073; DEC-063/070/071/072; native auth/router/notification adapters and Android lifecycle guidance recorded by implementation.
- **IN SCOPE:** Foreground presentation/sound policy, background tap, cold start, locked/logged-out state, duplicate/stale intents, current-state refresh, permission/channel changes.
- **OUT OF SCOPE:** Silent business execution, background mutation replay, exact-delivery promise, OTA.
- **ARCHITECTURE INVARIANTS:** Notification intent is non-authoritative and idempotent; router/auth bootstrap orders safely; server state wins.
- **SECURITY INVARIANTS:** No protected screen/data before auth/scope; stale/unauthorized intent fails non-disclosingly; payload remains safe.
- **EXPECTED FILE AREAS:** Native notification lifecycle/router/auth integration and tests; push telemetry/runbook refinements.
- **DB IMPACT:** None expected.
- **DEPENDENCY IMPACT:** None beyond MOB-021.
- **ANDROID REQUIREMENTS:** Foreground/background/force-stop/cold-start/locked-device/permission/channel/OEM cases on physical matrix.
- **IOS PORTABILITY:** Shared intent/state machine; platform notification-response adapter.
- **REQUIRED IMPLEMENTATION PROOF:** Every lifecycle state; duplicate/tap race; logged-out cold start; revoked scope; stale task; authoritative refresh.
- **AUTOMATED TESTS:** Lifecycle state machine, auth/router ordering, duplicate intent, stale/unauthorized response, telemetry safety.
- **MANUAL/PHYSICAL DEVICE PROOF:** Physical Android 10/11/13/15/16 coverage with Samsung/reference/mid-range across foreground/background/terminated paths.
- **VALIDATION COMMANDS:** Focused native/push tests and Development Build; root gates.
- **REVIEW RISKS:** Deep-link authority, protected flash, duplicate navigation, lost cold-start intent, OEM-specific false claims.
- **DEFINITION OF DONE:** Notification lifecycle matrix is evidence-complete and never changes operational state locally.
- **RELATIVE SIZE:** Large.

## MOB-023 — Mobile Lifecycle / Network / Failure Hardening

- **TASK ID:** MOB-023
- **TITLE:** Mobile Lifecycle / Network / Failure Hardening
- **STATUS:** NOT STARTED
- **OBJECTIVE:** Harden all native workflows for app lifecycle, degraded networks, ambiguity, API failure, and identity/scope changes.
- **WHY:** Field reliability depends on failure behavior, not only happy-path parity.
- **DEPENDENCIES:** MOB-018 and MOB-022; MOB-019 behavior if included.
- **READ FIRST:** DEC-063/071; all accepted workflow recovery contracts; native auth/connectivity/camera/push/location adapters.
- **IN SCOPE:** Timeout/cancel classification, reconnect refresh, app pause/resume, process death, stale versions, 401/403/409/429/5xx, safe drafts, cleanup/purge, fallback UX.
- **OUT OF SCOPE:** Generic durable outbox, automatic replay, fabricated success, unaccepted server semantics.
- **ARCHITECTURE INVARIANTS:** Command-specific recovery; portable state machines; platform lifecycle behind adapters; Web fallback remains.
- **SECURITY INVARIANTS:** Auth/scope loss purges transient intent and stops sensors; protected proofs never persisted; reauthorization on retry.
- **EXPECTED FILE AREAS:** Native/portable recovery and adapters, focused server observability only where necessary, tests/runbooks.
- **DB IMPACT:** None expected.
- **DEPENDENCY IMPACT:** Avoid generic offline/sync libraries.
- **ANDROID REQUIREMENTS:** Airplane mode, captive/slow/lossy network, background kill, low memory, permission revocation, OEM behavior.
- **IOS PORTABILITY:** Shared failure taxonomy/recovery with lifecycle/network adapter.
- **REQUIRED IMPLEMENTATION PROOF:** Ambiguous outcomes recover for each protected command class; cleanup/purge matrix; no duplicate success; Web fallback procedure.
- **AUTOMATED TESTS:** Fault injection, retry/idempotency/version, lifecycle state, auth loss, sensor cleanup, component/E2E recovery.
- **MANUAL/PHYSICAL DEVICE PROOF:** Physical network/lifecycle/permission/kill matrix across representative workflows and EN/AR.
- **VALIDATION COMMANDS:** Focused fault/recovery suites, native build/E2E, root gates.
- **REVIEW RISKS:** Blanket retry, stale command replay, sensor leak, lost proof, inconsistent error semantics.
- **DEFINITION OF DONE:** Defined failures are truthful, recoverable, secure, and evidence-backed without persistent replay.
- **RELATIVE SIZE:** Extra large cross-cutting.

## MOB-024 — Observability / Production Operations Readiness

- **TASK ID:** MOB-024
- **TITLE:** Observability / Production Operations Readiness
- **STATUS:** NOT STARTED
- **OBJECTIVE:** Make native production behavior diagnosable and operable without leaking secrets or claiming unmeasured health.
- **WHY:** Pilot support requires evidence for auth, API, mutation recovery, push, camera, lifecycle, and release failures.
- **DEPENDENCIES:** MOB-023.
- **READ FIRST:** docs 05–07, 12–13; DEC-023/024/025/063/071; existing observability module and all new adapter failure taxonomies.
- **IN SCOPE:** Correlation/request IDs, bounded safe client events, crash/error boundary, redaction, push delivery states, health/runbook/dashboard/alert requirements, incident and rollback procedures.
- **OUT OF SCOPE:** Raw secret/PII capture, employee surveillance, vendor lock-in without decision, fabricated SLO achievement.
- **ARCHITECTURE INVARIANTS:** Operational telemetry separate from tenant audit; adapters expose provider-neutral outcomes; server audit remains business evidence.
- **SECURITY INVARIANTS:** Strict allowlist/redaction; no tokens/proofs/passwords/full payloads/precise location; least privilege and retention.
- **EXPECTED FILE AREAS:** Native telemetry/error boundary, API observability, safe contracts/config, runbooks/docs/tests.
- **DB IMPACT:** None expected unless Accepted telemetry persistence specifically requires full DB protocol.
- **DEPENDENCY IMPACT:** Crash/telemetry provider requires explicit selection, privacy/security review, and environment separation.
- **ANDROID REQUIREMENTS:** Release-symbolication mapping, ANR/crash/network/push diagnostics on supported OS/device classes.
- **IOS PORTABILITY:** Provider-neutral event schema and future symbolication path.
- **REQUIRED IMPLEMENTATION PROOF:** Known failures produce useful safe evidence; redaction corpus passes; alert/runbook drill; rollback owners identified.
- **AUTOMATED TESTS:** Telemetry schema/redaction/cardinality; error boundary; correlation; provider failure; runbook smoke where automatable.
- **MANUAL/PHYSICAL DEVICE PROOF:** Trigger safe test failures and trace them end to end without secret exposure.
- **VALIDATION COMMANDS:** Focused observability/security tests; production-like build inspection; root gates.
- **REVIEW RISKS:** Secret leakage, high-cardinality cost, surveillance, telemetry mistaken for audit, missing recovery ownership.
- **DEFINITION OF DONE:** Pilot operators can detect, diagnose, and respond to defined failures with safe evidence.
- **RELATIVE SIZE:** Large.

# Batch 9 — Full proof, release, pilot, and cutover

## MOB-025 — Full Integration + Security + Chaos + Load Gate

- **TASK ID:** MOB-025
- **TITLE:** Full Integration + Security + Chaos + Load Gate
- **STATUS:** NOT STARTED
- **OBJECTIVE:** Run the complete repository/native security, concurrency, chaos, capacity, and physical integration gate before signing.
- **WHY:** Release must be justified by evidence across the whole operating path, not feature-by-feature confidence.
- **DEPENDENCIES:** MOB-019 decision/result, MOB-022, MOB-024; owner approval of SLO/capacity thresholds.
- **READ FIRST:** All MOB evidence; docs 05–07/12/17; Accepted Decisions for auth, custody, retrieval, handoff, finance, offline, push, mobile.
- **IN SCOPE:** Full test pyramid; two-principal IDOR matrix; duplicate/race/failure injection; provisional load profile; DB/provider outage/recovery; long-shift soak; physical device matrix; iOS smoke.
- **OUT OF SCOPE:** Lowering gates to pass, skipped/deleted tests, new features, production deployment, claiming Proposed thresholds are Accepted.
- **ARCHITECTURE INVARIANTS:** Modular monolith/server authority; 300-line/import gates; Web/native coexistence; no client data migration.
- **SECURITY INVARIANTS:** All hard-zero tolerances in §2; secret/redaction and dependency audit; authorization before every mutation.
- **EXPECTED FILE AREAS:** Test/load/chaos harnesses, fixtures, evidence/runbooks; production fixes only through separately scoped corrective tasks.
- **DB IMPACT:** Test data only; no schema change hidden in gate work.
- **DEPENDENCY IMPACT:** Prefer k6 if discovery confirms fit; pin/audit any approved test-only dependency.
- **ANDROID REQUIREMENTS:** Complete API 29/30/33/35/36-equivalent OS matrix and required physical device families; Development Build and release-like binary.
- **IOS PORTABILITY:** Compile/config and representative simulator/device smoke; document measured reuse against 85–95% target.
- **REQUIRED IMPLEMENTATION PROOF:** Approved SLOs met; no hard-zero violation; chaos recovery; no duplicate protected effect; full-shift workflow; traceable evidence bundle.
- **AUTOMATED TESTS:** Full repo plus load/chaos/security/concurrency/E2E suites.
- **MANUAL/PHYSICAL DEVICE PROOF:** Complete §8 matrix, camera/QR/auth/push/lifecycle/permissions/release, long-shift soak, EN/AR.
- **VALIDATION COMMANDS:** Root format/architecture/lint/typecheck/test/build; native release-like build/E2E; approved load/chaos commands and evidence hashes.
- **REVIEW RISKS:** Unapproved SLOs, unrealistic data, non-production config, flaky evidence, bypassed zero tolerance.
- **DEFINITION OF DONE:** Owner-approved gate report is green with reproducible evidence; failures create corrective tasks and block MOB-026.
- **RELATIVE SIZE:** Extra large.

## MOB-026 — Android Signing / Build / Internal Distribution

- **TASK ID:** MOB-026
- **TITLE:** Android Signing / Build / Internal Distribution
- **STATUS:** NOT STARTED
- **OBJECTIVE:** Produce a deterministic, organization-controlled signed Android build and distribute it to an authorized internal cohort.
- **WHY:** Pilot evidence must use the real release custody and distribution path.
- **DEPENDENCIES:** MOB-025 green; organization-owned accounts/signing/Firebase environment provisioned under DEC-071.
- **READ FIRST:** DEC-071; accepted push/release decisions; release/security/collaboration docs; MOB-024/025 runbooks/evidence.
- **IN SCOPE:** Named custody/recovery evidence, least-privilege build access, signing/upload config outside Git, deterministic binary, bundled JS/OTA disabled, internal track/distribution, rollback artifact.
- **OUT OF SCOPE:** Public production launch, personal-account dependency, committed secrets, OTA enablement, iOS release.
- **ARCHITECTURE INVARIANTS:** CNG source config; generated native projects remain transient; same package ID; binary matches tested commit/config.
- **SECURITY INVARIANTS:** Organization control, independent recovery, no Git/app secret, least privilege, auditable release approval, safe environment separation.
- **EXPECTED FILE AREAS:** Release-safe app/build config, CI/release runbook if approved, secret references—not secret values—evidence docs.
- **DB IMPACT:** None.
- **DEPENDENCY IMPACT:** Only approved build/distribution tooling; no OTA runtime.
- **ANDROID REQUIREMENTS:** `com.vaylet.employee`, API 29 floor/API 36 target, signed internal artifact, install/upgrade/uninstall/rollback checks.
- **IOS PORTABILITY:** Preserve shared config; Apple provisioning remains later but organization-control policy stays intact.
- **REQUIRED IMPLEMENTATION PROOF:** Artifact provenance/hash, signing verification, owner/recovery drill, internal install/upgrade, crash symbols, rollback.
- **AUTOMATED TESTS:** Release config/secret scan, build, artifact/signature inspection, smoke suite.
- **MANUAL/PHYSICAL DEVICE PROOF:** Install/upgrade/run/uninstall/rollback across pilot device classes; auth/push/camera/release smoke.
- **VALIDATION COMMANDS:** Approved release build/signature/provenance commands; root gates; secret scan; internal-track verification.
- **REVIEW RISKS:** Personal custody, leaked key, wrong environment/package, OTA accidentally enabled, untested signed-binary drift.
- **DEFINITION OF DONE:** Authorized internal testers receive the verified signed binary with documented custody and rollback.
- **RELATIVE SIZE:** Large release/operations task.

## MOB-027 — Controlled Android Pilot + Evidence Gate + Native Primary Cutover

- **TASK ID:** MOB-027
- **TITLE:** Controlled Android Pilot + Evidence Gate + Native Primary Cutover
- **STATUS:** NOT STARTED
- **OBJECTIVE:** Run a bounded real-operation Android pilot, evaluate evidence, and obtain the owner decision for native-primary cutover at approved Locations.
- **WHY:** Primary-terminal status must follow measured full-shift evidence and a reversible rollout.
- **DEPENDENCIES:** MOB-026; pilot operator/Locations/devices/support and rollback owners explicitly approved.
- **READ FIRST:** DEC-071; docs 01/07/12/13/15; all gate/runbook evidence; accepted pilot/release decisions.
- **IN SCOPE:** Controlled cohort; KPI/error/support evidence; incident handling; Web fallback; rollback drill; iOS smoke; reuse measurement; owner go/no-go/cutover decision.
- **OUT OF SCOPE:** Automatic global rollout, Web deletion/retirement, unapproved Locations/devices, feature expansion during pilot.
- **ARCHITECTURE INVARIANTS:** Server canonical; Web/native coexist; no client data migration; rollout reversible by device/client routing and operational procedure.
- **SECURITY INVARIANTS:** Production authorization and zero tolerances; least-privilege cohort; incident escalation; no secret evidence bundle.
- **EXPECTED FILE AREAS:** Pilot plan/evidence/status/runbook docs and only separately scoped critical fixes.
- **DB IMPACT:** None for cutover; production data remains canonical.
- **DEPENDENCY IMPACT:** None expected.
- **ANDROID REQUIREMENTS:** Real supported pilot fleet including Samsung/mid-range; signed binary; measured full-shift camera/push/lifecycle behavior.
- **IOS PORTABILITY:** Complete pre-pilot iOS config/build smoke and report measured non-visual reuse; full iOS rollout remains later.
- **REQUIRED IMPLEMENTATION PROOF:** Full-shift KPIs, defects/near misses, zero-tolerance report, support load, rollback drill, owner-signed evidence gate and Location-scoped decision.
- **AUTOMATED TESTS:** Production smoke/health and regression suite before each pilot build; no testing against unsafe production mutations.
- **MANUAL/PHYSICAL DEVICE PROOF:** Real shifts from check-in through release, Shift close, failures/recovery, push, EN/AR, Web fallback, rollback.
- **VALIDATION COMMANDS:** Approved production-smoke/evidence commands, artifact provenance, root gates for any corrective build.
- **REVIEW RISKS:** Pilot expansion without evidence, Web fallback removal, KPI cherry-picking, unresolved custody/security defect, irreversible rollout.
- **DEFINITION OF DONE:** Owner approves or rejects native-primary status from evidence. Approval applies only to named Locations/devices; Web retirement remains a separate Decision.
- **RELATIVE SIZE:** Extra large pilot/change-management task.

## 11. Cutover and rollback sequence

```text
Employee Web continues
  -> native Development Build
  -> internal QA
  -> core workflow parity
  -> signed internal distribution
  -> controlled Location/device pilot
  -> evidence gate
  -> owner approval for Android-primary at named Locations
  -> Employee Web fallback observation period
  -> separate later Decision for any Web retirement
```

Rollback returns affected operations to Employee Web using the same canonical
server state. No client-to-client data migration exists. Any custody, security,
financial-guard, audit, duplicate-effect, or cross-scope defect blocks expansion
and triggers rollback according to the owned runbook.

## 12. Anti-scope-creep rules

This program does not authorize microservices, Kubernetes, Kafka, a mobile
backend rewrite, generic offline sync, persistent mutation outbox, automatic
replay, WebView wrapping, Employee Web retirement, OTA, AI damage detection,
predictive retrieval, reservations, marketplace behavior, hardware locker
integration, unrelated Dashboard/Guest migrations, advanced BI, whole-shift
GPS, or a new photo-byte pipeline. A task may touch server/contracts/database
only where its contract explicitly allows it and must follow the docs-first,
Accepted-Decision, forward-only migration, authorization, concurrency,
append-only history, test, and 300-line rules.

## 13. Program status and immediate next action

- MOB-001: `DONE`
- MOB-002: `DONE`
- MOB-003: `DONE`
- MOB-004: `DONE`
- MOB-005: `IMPLEMENTED / PHYSICAL PROOF PENDING`
- MOB-006 through MOB-027: `NOT STARTED`
- Current gate: MOB-005 implementation and focused repository evidence exist;
  Android build/physical-device evidence and the root database integration gate
  remain unavailable in the current environment.
- Next task: `MOB-006 — Portable Employee Client Foundation`.

## Unresolved decisions

- DEC-073 settles push eligibility, exact logical persistence, registration,
  retry/lease/concurrency, retention, safe payload and provider boundaries for
  MOB-020 through MOB-022. Exact bounded operational policy values remain
  required deployment configuration rather than invented product semantics.
- MOB-019 must accept GPS inclusion before location implementation. MOB-025
  requires owner-approved SLO/capacity thresholds. Any newly required photo-byte
  pipeline or release environment design needs its own accepted scope.
