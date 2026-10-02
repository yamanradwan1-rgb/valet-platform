# Issue #255 — Native incomplete Check-In draft actions implementation plan

Status: **PLANNING ONLY — DECISION REQUIRED BEFORE CODE**

Issue: [#255](https://github.com/veletpro0-lgtm/valet-platform/issues/255)
Planning baseline: `e76e6ade82ba1d697a95ff03995639f222649f8c`
Planning branch: `docs/VAL-255-incomplete-checkin-drafts-plan`

## 1. Executive summary

Vehicles already contains authoritative `CHECKING_IN` rows. The smallest Native integration is to add the required actions inside an eligible row's existing expanded details, hydrate the exact selected session through the existing Check-In client, and enter the existing route. No new list, Task, queue, intake, Check-In flow, or directory owner is needed.

Cancellation is not an accepted ValetSession operation. `docs/04_VALET_SESSION_STATE_MACHINE.md` explicitly prohibits introducing `CANCELLED` or hard deletion without a later Accepted decision. The current Prisma enum has nine states. The decision log and focused decisions contain Task/RetrievalRequest cancellation, but no Accepted abandoned Check-In terminal contract. Issue text does not silently replace that domain contract.

Recommendation, **UNRESOLVED pending acceptance**: one terminal `CHECKING_IN -> CANCELLED` transition, self-owned for both operational roles, exact current Shift eligibility, existing aggregate version, one atomic safe audit event, and authoritative outcome reconciliation. Audit already provides durable actor/time; duplicate cancellation columns and a second lifecycle flag are unnecessary for this recommendation. This is a cross-consumer lifecycle change, not an enum-only patch. Guest access and visit-history compatibility are material prerequisites requiring explicit scope ownership.

The implementation envelope below is conditional on proposed bundle **P** in section 14 being accepted and U-001–U-007 being resolved. A different accepted representation requires revising the dependent sections before execution. This document does not create a DEC, accept one, or authorize implementation.

## 2. Verified baseline SHA / branch

### Repository facts discovered

| Check                               | Observed result                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| Initial checkout                    | `main`, clean working tree                                                        |
| Initial HEAD                        | `e76e6ade82ba1d697a95ff03995639f222649f8c`                                        |
| Fetch                               | `git fetch origin` completed successfully                                         |
| Authoritative fetched `origin/main` | `e76e6ade82ba1d697a95ff03995639f222649f8c`                                        |
| Planning branch                     | Created from fetched `origin/main`: `docs/VAL-255-incomplete-checkin-drafts-plan` |
| Worktrees                           | None created or used                                                              |
| Issue                               | Open; current issue body retrieved from GitHub; no comments at inspection         |
| Authorized change in this run       | This one planning document only                                                   |

No source, schema, migration, package, lockfile, test, production copy, or UI change is part of this branch. No APK, physical run, application build, or product test was attempted for planning. No PR or merge is authorized. `apps/valet/**` was excluded from inspection; Native tests with historical “Web parity” names were read as Native assertions only.

Literal neighboring route evidence: `@Controller("v1/staff/check-in")` in `apps/api/src/modules/check-in-api/check-in-api.controller.ts`; `@Controller("v1/staff/valet-sessions")` in `apps/api/src/modules/staff/staff-valet-session.controller.ts`. Module/import/runner ownership is recorded in section 4.

## 3. Source-of-truth / Accepted decision ledger

### Binding requirements

Latest owner instruction controls this task: Native current UI is frozen, Employee Web is excluded, only this document may change, and cancellation cannot become code before an Accepted decision. Older Native documentation referring to a Web visual reference does not override that instruction.

The repository authority order is `AGENTS.md`, Accepted focused DECs and their canonical log, Blueprint bridge, scope/state/schema/domain/stack/structure/engineering/security/workflow documents, then contribution guidance. A material focused-DEC/log conflict requires reconciliation; a temporary short mirror is not permission to reinterpret a focused DEC.

Source inventory: `AGENTS.md`, `CONTRIBUTING.md`, `docs/00_SOURCE_OF_TRUTH.md`, `01_PRODUCT_SCOPE.md`, `02_DOMAIN_MODEL.md`, `03_DATABASE_SCHEMA.md`, `04_VALET_SESSION_STATE_MACHINE.md`, `05_ENGINEERING_RULES.md`, `06_SECURITY_AND_DATA_RULES.md`, `07_DEFINITION_OF_DONE.md`, `08_DECISIONS_LOG.md`, `09_TECH_STACK.md`, `10_REPOSITORY_STRUCTURE.md`, `11_REQUIREMENTS_TRACEABILITY.md`, `12_AGENT_EXECUTION_PLAN.md`, `13_COLLABORATION_WORKFLOW.md`, `14_PROJECT_STATUS.md`, `15_BLUEPRINT_V1_REBASELINE.md`, `16_PRODUCTION_DATABASE_DEPLOYMENT_CHECKLIST.md`, `17_AGENT_CODE_STRUCTURE_RULES.md`, `18_PHASE3_OPERATIONS_EXECUTION_PLAN.md`, and `20_EMPLOYEE_NATIVE_EXECUTION_PLAN.md`. References in historical plans are context, not proof that their old “missing” statuses still describe current code.

| Authority                                                                                                                                            | Current task-relevant contract                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/04_VALET_SESSION_STATE_MACHINE.md`, “Invalid/abandoned check-in”                                                                               | No accepted post-creation terminal abandonment; no `CANCELLED` or hard delete without later acceptance. Normal transition is `CHECKING_IN -> AWAITING_PARKING`.                                     |
| `docs/08_DECISIONS_LOG.md`, DEC-017/020 summaries                                                                                                    | Append-only operational audit; condition evidence and explicit Check-In completion remain distinct. Condition completion is not physical-session completion.                                        |
| `docs/decisions/DEC-032_SHIFT_OPERATIONAL_ELIGIBILITY.md`                                                                                            | Active Shift per membership, not User globally; dynamic persisted eligibility and transactional protection; no role hierarchy inference. Self-end cleanup exceptions do not grant Cancel authority. |
| `DEC-034_TASK_DISPATCH_PERSISTENCE_FOUNDATION.md`                                                                                                    | Task lifecycle is separate. Task `CANCELLED` is not a session terminal mechanism.                                                                                                                   |
| `DEC-043_VEHICLE_RELEASE_SESSION_COMPLETION.md`, `DEC-044_GUEST_PRE_START_RETRIEVAL_CANCELLATION.md`                                                 | `COMPLETED` means real vehicle release. Retrieval cancellation returns to `PARKED`; it does not abandon Check-In.                                                                                   |
| `DEC-063_EMPLOYEE_OFFLINE_OPERATION_POLICY.md`                                                                                                       | No generic mutation replay/outbox; authoritative rehydration; transient memory is not server truth.                                                                                                 |
| `DEC-066_EMPLOYEE_BOTTOM_NAV_PRODUCTION_WIRING.md` §§6–8                                                                                             | One bounded operational directory; exact Location/Shift gates; Supervisor broad directory read, employee lifecycle relationship; field masking; visibility never grants mutations.                  |
| `DEC-069_RETURNING_CHECK_IN_RECOGNITION.md`                                                                                                          | Exact persisted Check-In/Vehicle identity and returning assistance; no employee directory or customer ownership inference; original intake identity is not cancellation idempotency.                |
| `DEC-071_MOBILE_PLATFORM_REPOSITORY_ARCHITECTURE.md`                                                                                                 | Expo/React Native, portable employee client and authoritative backend reuse. Latest owner supersedes its visual-reference instruction for #255.                                                     |
| `DEC-072_NATIVE_STAFF_AUTHENTICATION_ARCHITECTURE.md`                                                                                                | Memory-only access authority, native refresh/session generations, fail-closed restoration and identity purge; safe reads and mutations have different recovery rules.                               |
| `DEC-077_EMPLOYEE_INCIDENT_PROCESS_DEATH_RECOVERY.md`                                                                                                | Incident durable intent is command-specific; it is not a general Cancel outbox or cancellation record.                                                                                              |
| `DEC-078_COMPANY_ADMIN_MFA.md`, `DEC-079_MANAGEMENT_AUDIT_SCOPES.md`, `DEC-080_COMPANY_ADMIN_AUTHORITY.md`, `DEC-082_MANAGEMENT_AUDIT_VISIBILITY.md` | Exact current management authority/MFA, real Location operational audit scope, allowlisted safe details, role limits, no employee/guest explorer or raw metadata.                                   |
| `DEC-081_STAFF_ROLE_AND_ACCESS_LIFECYCLE.md`                                                                                                         | Current role/access changes and Shift lifecycle cannot be replaced with cached eligibility.                                                                                                         |
| `DEC-084_MANAGEMENT_VISIT_CONTACTS.md`                                                                                                               | Historical visits are authorized contact associations, not employee CRM; terminal-state compatibility must preserve truthful history.                                                               |
| `DEC-094_LOCATION_LIFECYCLE.md`                                                                                                                      | Stop intake, drain actual work, then deactivate; never fabricate completion or delete history.                                                                                                      |
| `DEC-090_MANAGEMENT_KPI_DEFINITIONS.md`, `DEC-095_MANAGEMENT_KPI_SOURCE_CONTRACTS.md`                                                                | KPI source facts and workforce action evidence are explicit. Cancellation cannot manufacture completed visits or erase already-recorded work.                                                       |

All numbered DEC names above refer to existing files under `docs/decisions/` except early decisions carried in the canonical log. The proposed abandonment decision has no allocated DEC number and is not Accepted.

Classification and falsification ledger (one status per proposition):

| ID  | Proposition                                                                                                    | Classification | Likeliest falsifier inspected / result                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R01 | Native current UI is the visual authority for #255.                                                            | LOCKED         | Older DEC-071/Native plan says Web reference; latest explicit owner instruction supersedes it. No Web source consulted.                                                 |
| R02 | Adding session `CANCELLED` now without a later Accepted DEC is allowed.                                        | CONTRADICTED   | State-machine abandonment prohibition and nine-state Prisma/log; Task/Request cancellation has different aggregates.                                                    |
| R03 | Protected mutation and append-only audit must commit together.                                                 | LOCKED         | `AGENTS.md`, engineering/security rules; complete command and custody writer implement the transaction pattern.                                                         |
| R04 | Directory already returns `CHECKING_IN`.                                                                       | DERIVED        | `staff-vehicle-directory.queries.ts` uses non-COMPLETED; contract/badge mapping includes CHECKING_IN.                                                                   |
| R05 | Employee CHECKING_IN visibility is exact intake membership ownership.                                          | DERIVED        | `staff-valet-session-authorization.ts` CHECKING_IN branch; directory employee classifier reuses it.                                                                     |
| R06 | Supervisor directory visibility implies other-owner Check-In continuation rights.                              | CONTRADICTED   | DEC-066 expressly separates authority; detail classifier still requires intake owner for CHECKING_IN.                                                                   |
| R07 | Existing exact hydration can be reused without a second recovery machine.                                      | DERIVED        | `employee-check-in-discovery.ts` and core private hydrate/resume; wider AWAITING acceptance needs narrower Vehicles guard.                                              |
| R08 | Session version covers aggregate lifecycle; condition/Vehicle child edits have separate concurrency semantics. | DERIVED        | Condition completion and Vehicle detail edits do not advance this aggregate version; Vehicle has its own existing token; docs/11 traceability records this distinction. |
| R09 | Generic Employee client does not automatically replay mutations.                                               | LOCKED         | `employee-client.ts`, `recovery-policy.ts`, DEC-063/072 explicitly preserve that policy.                                                                                |
| R10 | Current audit writer represents the proposed scope/actor/time safely.                                          | DERIVED        | `custody-audit-event-writer.ts` actual ValetSession contract and INSERT; it has no generic idempotency uniqueness guarantee.                                            |
| R11 | This proposed audit event/state needs narrow Dashboard Audit mappings.                                         | DERIVED        | `audit-event-copy.ts` has exhaustive typed event record; `audit-detail-values.ts` delegates session-state labels first.                                                 |
| R12 | Current cap can omit older self-owned drafts from Vehicles.                                                    | DERIVED        | Cap precedes employee visibility filtering, newest-first 101 candidates; no pagination over omitted owned drafts.                                                       |

This ledger contains twelve tested propositions, not a claim that twelve tests ran. Repository search covered decisions/log/state-machine and allowed runtime/contracts/schema/migration trees; exact-state and terminal-predicate findings are catalogued in sections 15, 39, and 41. All additional policy choices remain U-items below.

## 4. Current repository architecture

### Existing implementation patterns

The backend is a modular monolith. Native presentation is `apps/valet-native`; portable request/workflow owners are `packages/employee-client`; public strict schemas are `packages/contracts`; PostgreSQL authority is `apps/api` with Prisma/schema/migrations in `packages/database`. Native cannot own custody lifecycle truth.

Nearest module is `apps/api/src/modules/check-in-api/check-in.module.ts`: imports `AuthModule`, `RuntimeDatabaseModule`, `HttpInfrastructureModule`; registers existing controllers/services and RequestId middleware. `check-in-api.service.ts` delegates to explicit command executors. `CheckInOperationRunner` wraps existing `ApiOperationRunner`, not a new exception/filter/pool stack.

Two literal controller boundaries inspected: `@Controller("v1/staff/check-in")` in `check-in-api.controller.ts` and `@Controller("v1/staff/valet-sessions")` in `staff-valet-session.controller.ts`. Existing `@Post("sessions/:sessionId/complete")` returns HTTP 200; directory is declared before the `:sessionId` read route. `resolveCheckInUserId`/Staff principal resolves User, not authoritative tenant/member/Location.

The complete executor in `valet-sessions/complete-check-in-command.ts` proves active user and persisted custody scope, locks session, checks version/state/condition/vehicle/effective policy, writes AWAITING_PARKING and increments version, appends `VALET_SESSION_CHECK_IN_COMPLETED`, then commits. It does not impose the proposed self-owned exact-Shift Cancel rule on ordinary completion. Do not retrofit that unrelated authority.

Pre-code domain inventory for later execution: affected lifecycle aggregate is ValetSession; retained associated facts are Vehicle, condition notes/photos and independent Incident/financial history; mutation history is AuditEvent. Authority inputs are User, Organization, Location, OrganizationMembership, MembershipLocationAccess and Shift. Only the proposed Check-In terminal edge is new; Task/Dispatch transitions are **none**. DB integrity/index impacts are enumerated in sections 16/41. No configuration policy/default/override is introduced; existing Company-default→Location-override condition-photo behavior remains authoritative on Continue/complete. This is an issue-authorized sellable-MVP Native operational capability, pending its terminal decision, not a V2/Enterprise expansion.

### LOCKED decisions

Backend ownership; append-only history; no arbitrary PATCH state; no fake Task; shared transport schemas; owner UI freeze; no durable offline replay; no silent role hierarchy; no code before the abandonment decision; authored code ceiling of 300 physical lines.

## 5. Current Vehicles UI freeze measurements

**UI FREEZE CONTRACT.** These values and hierarchy are the baseline at the verified SHA. Sources: `apps/valet-native/src/vehicles/native-vehicles-screen.tsx`, `native-vehicle-row.tsx`, `native-vehicle-row-styles.ts`, `native-vehicle-presentation.ts`, `native-vehicles-copy.ts`, and `employee-ui/employee-tokens.ts`, `employee-typography.ts`, `employee-feedback.tsx`.

| Element           | Frozen current measurement/behavior                                                                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Screen            | Existing ScrollView, content padding 20, section gap 16; row stack gap 12; existing EmployeeFrame/header/navigation surrounds it.                                                                                                |
| Title/subtitle    | “Vehicles” / “المركبات”; pageTitle 20/28, Plus Jakarta Sans bold 700, navy. Subtitle `${copy.location} · ${scope.locationName}`, body 14/20 neutral, marginTop 4.                                                                |
| Card              | White `#FFFFFF`, border `#DDE4EC` width 1, form radius 12, overflow hidden; width follows existing container. No fixed card height exists to replace.                                                                            |
| Collapsed control | One Pressable, padding 16, button role and expanded accessibility state.                                                                                                                                                         |
| Header            | Row, align flex-start, space-between, gap 8, marginBottom 8. Vehicle title flex 1, Space Grotesk 15/19 bold 700 navy; title fallback make/model → temporary descriptor → existing missing text.                                  |
| Badge             | Existing EmployeeBadge, pill radius 999, horizontal padding 10 / vertical 4, gap 6, dot 6; existing variant, position and human-text alignment. CHECKING_IN uses primary/ice-blue.                                               |
| Metadata          | Raw plate trimmed or existing no-plate copy; optional color with `·`; supporting 12/16 neutral; metadata row marginBottom 12. Plate uses identifier LTR.                                                                         |
| Three summaries   | Key slot / Parking area / Updated; borderTop 1, gap 20, paddingTop 12; three flex-1 minWidth-0 cells. Labels badge 10 with weight 400 uppercase/muted; values body 14/20 weight 600 navy, marginTop 2; missing weight 400 muted. |
| Expanded area     | Warm `#FAFAF8`, borderTop 1 `#DDE4EC`, horizontal 16, top 4, bottom 16. Existing detail order: Status badge, Checked in, Updated, Key slot, Zone Code, Spot Code.                                                                |
| Details           | Row align center, space-between, gap 12, vertical padding 12, bottom border 1; last Spot row no bottom border. Labels 12/16 neutral; values 14/20 weight 600 navy; identifiers keep LTR.                                         |
| Footer            | Existing read-only copy, supporting style overridden to fontSize 11, muted, paddingTop 8. Normal rows retain exact text/style.                                                                                                   |
| Colors            | navy `#07111F`, neutral `#6F7C91`, muted `#8C98AA`, blue `#176BFF`, ice `#EDF4FF`, success `#2F9B78`, warning `#D89434`, danger `#D95C63`; no new palette.                                                                       |
| Typography        | UI Plus Jakarta Sans; display/vehicle title Space Grotesk; body 14/20; supporting 12/16; badge 10 bold with 0.5 letter spacing; button 15 semibold. No font-family substitution.                                                 |
| Direction         | Existing Foundation locale/EmployeeFrame direction and `employeeTextStyle`: human left/LTR or right/RTL, identifiers left/LTR unless explicit alignment. Do not mirror plates or codes.                                          |
| Loading           | Exactly three skeleton rows; card radius 12/padding 16/gap 8; title height 16, width 66.666%, `#E5E7EB`; detail height 12, width 33.333%, `#F3F4F6`; supporting loading/refresh copy unchanged.                                  |
| Empty/error       | Existing state card white, radius 16, border 1, gap 12, padding 20; title 18; current Retry button. Existing empty composition is unchanged.                                                                                     |
| Truncation        | Existing warning `#FFF4E0`, border `#D8943433`, radius 12, border 1, padding 16 horizontal / 12 vertical, weight 600/lineHeight 20. No new panel.                                                                                |

Maximum authorized delta: one minimum incomplete-work explanation and Continue/Cancel actions for eligible CHECKING_IN rows **inside existing expanded details**, plus existing-pattern confirmation and action feedback. Collapsed geometry, summaries, badge placement, detail rows, screen title, header, bottom navigation, normal-row footer and all unrelated states remain exact. Only the affected expanded row may grow naturally by the added content's height; no existing padding, width, typography, or detail positions are resized. If the owner interprets “card dimensions” to forbid even that necessary expansion, use the existing confirmation surface for action presentation after row interaction and obtain explicit acceptance; do not redesign the card.

Prefer retaining the short collapsed CHECKING_IN badge; a long “Incomplete Check-In” badge is not assumed to fit. Explain unfinished state in the affected expanded footer/action area. Preserve current styling and status enum, rather than creating a UI-only lifecycle. Reject any architecture requiring a top-level incomplete-work section or duplicated session cards.

## 6. Current Vehicle Directory authority model

`packages/contracts/src/staff-vehicle-directory.ts` is strict. Current row has sessionId, state, createdAt/updatedAt, descriptor fields, key-slot visibility/code, parking-zone/spot code. It has **no** intake membership, organization, session version, or action capability. State is `staffValetSessionStateSchema.exclude(["COMPLETED"])`. A future global enum extension without updating this exclusion would admit CANCELLED.

Current transport requests visibility capability `key-slot-visibility-v1` through `Valet-Vehicle-Directory-Capability`; older strict schema lacks keySlotVisibility. Unnegotiated extra action fields would break old clients. Preserve legacy/v1 shapes; any new minimal capability requires deliberate negotiation (U-006), not optional fields silently added to strict rows.

`staff-vehicle-directory.service.ts` begins a transaction, proves ACTIVE User, resolves Location→Organization from persistence, proves ACTIVE operational membership/org/Location/access, locks Shift eligibility, then loads candidates/projections. Supervisor sees all non-COMPLETED candidates in exact authorized Location. Employee uses `classifyStaffValetSessionAccess`; CHECKING_IN requires `checked_in_by_membership_id === actor.membershipId`. Both roles require active Shift for this read. Employee key-slot codes are always masked, with RESTRICTED vs UNASSIGNED distinguished; actions must not undo masking.

`staff-vehicle-directory.queries.ts` loads newest-first `created_at DESC, id ASC`, LIMIT 101, FOR SHARE; page cap is 100. Cap occurs **before** employee filtering. `truncated` means candidate overflow, not a count of omitted owned drafts. A page may contain fewer than 100 eligible rows while older eligible drafts are outside the candidate window. This is an existing coverage limitation, not a new draft-fetch requirement or permission to change order/cap.

Directory owns Vehicles list presentation. It already discovers incomplete work within its bounded page. No second drafts/continuations list, per-row detail fan-out, or privileged key lookup belongs in Vehicles. Broader “all unfinished drafts reachable from Vehicles” requires resolving U-006; the current capped endpoint cannot prove that promise.

## 7. Current Check-In draft discovery/recovery model

`staff-check-in-drafts.service.ts` owns its inline query: exact authorized org/Location, current active operational Shift, exact intake membership, state CHECKING_IN; oldest-first `created_at ASC, id ASC`. It includes conditionCompletedAt even when non-null. Both Supervisor and Employee discovery remain self-owned. Public shape is `packages/contracts/src/staff-check-in-drafts.ts`, not directory detail.

`staff-check-in-continuations.service.ts` uses the same authority/ownership, state AWAITING_PARKING, and excludes sessions with PARKING Tasks QUEUED/ASSIGNED/ACCEPTED/IN_PROGRESS/**COMPLETED**. A cancelled Task is not that exclusion. Continuations are a distinct accepted recovery phase, not incomplete CHECKING_IN drafts.

`employee-check-in-discovery.ts` calls drafts and continuations concurrently and merges tagged recoverables. Core activation discovers; exactly one auto-hydrates; several require existing selection; none starts the normal new-input flow. Ambiguous-intake recovery with none records recoveryChecked rather than starting new intake. `resume(recoverable)` hydrates that exact id.

`employee-check-in-session-core.ts` hydration publishes CHECKING_IN as `created` with existing `select-condition` continuation/default “No visible issue”; AWAITING_PARKING becomes existing `continuation`. Persisted condition marker is carried in active state. `employee-check-in-condition-session.ts` skips re-recording the note/marker when conditionCompletedAt exists, then completes Check-In using the authoritative version. Do not claim that condition-completed CHECKING_IN is AWAITING_PARKING or that every resume skips the existing presentation step.

Focused baseline tests: API `staff-check-in-drafts-discovery.integration.test.ts`, `staff-check-in-drafts-auth.integration.test.ts`, continuations discovery/auth; portable `employee-check-in-recovery.test.ts`, continuation/condition-recovery/condition-replay tests; Native recoverables/continuation/condition tests. They are existing assertions, not fresh passing proof in this planning run.

## 8. Current exact-session hydration path

`hydrateCheckInSession(transport, locationId, sessionId)` calls `transport.loadSession(sessionId)`. It verifies exact Location and accepts CHECKING_IN **or** AWAITING_PARKING, then returns persisted sessionId/state/version/vehicle/conditionCompletedAt. Server detail route re-proves active user, custody actor, current Shift and lifecycle/task read authority in `staff-valet-session.service.ts`; CHECKING_IN detail remains self-owned even for Supervisor.

Core `hydrate` is private. Public `resume` accepts a discovery recoverable rather than an arbitrary selected directory id. Constructing a fabricated recoverable from a row would couple directory projection to recovery internals and still risk activation rediscovery. There is no public safe “bind owner and open exactly this CHECKING_IN session without discovery” operation today.

Future targeted entry reuses the same transport and hydration transformation, with a strict expected CHECKING_IN post-read check for Vehicles. It must not weaken the broader helper used by normal continuation recovery. Validate returned sessionId too; Location, full workflow owner and request sequence must still match before publishing and navigating. AWAITING_PARKING, CANCELLED, changed identity or forbidden detail is a changed/unavailable target for this specific entry.

Full detail cannot currently reconcile cancellation: unknown state is denied by `staff-valet-session-authorization.ts`, and temporal validation requires condition completion for every non-CHECKING_IN state. Simply adding CANCELLED to its enum does not make a safe terminal read. Recommended separate minimal cancel-status query is U-003, rather than widening custody detail/Guest projections by accident.

## 9. Current Native navigation/lifecycle ownership

`native-check-in-route.tsx` subscribes to the existing Check-In owner and activates it using authGeneration, Location and `nativeCheckInWorkflowOwner(scope)` (`organizationId:membershipId:shiftId`). Close clears Check-In and current workspace callback navigates to Tasks. Route keys also bind auth/member/Location/Shift. Normal activation may discover another draft or start new input, so Vehicles must prepare an exact target **before** route navigation.

`native-production-workspace.tsx` renders existing destinations inside EmployeeFrame and pinned bottom navigation. Vehicles currently receives directory/snapshot/scope, no Continue/Cancel callbacks. `production-shell-controller.ts` binds auth/member/org/Location/Shift/role, retires pending intents on authority change and carries only same-authority navigation. `native-production-back-handler.ts` protects in-flight workflow phases, handles existing edit-back, clears Check-In and calls controller.back; it currently has no Vehicles-origin return handling.

`auth/native-auth-runtime.ts` creates one Check-In owner and one directory owner. Identity purge, disposal and `shell/native-workflow-scope-retirement.ts` clear them. `native-production-lifecycle-owner.ts` suspends Check-In/directory on background, refreshes operational context before foreground work, retires changed authority, and refreshes the existing directory when active. Its active-workflow chain has no targeted Check-In revalidation or cancel-unknown reconciliation branch; #255 cannot claim those already exist.

`employee-vehicle-directory-session.ts` fences reads using incrementing request counter, abort, authGeneration, full operational scope and foreground. Its reset prevents old rows under a new authority. A→B→A is protected by counter as well as identity equality. Reuse this owner and coordinator; do not add a second page cache.

## 10. Gap analysis for Continue

### DERIVED conclusions

Exact hydration exists; a narrow public targeted entry and Native navigation adapter are missing. Continue does not require a new list API, Task or session create. Selected row is navigation context only; no row-provided version or descriptor may become hydrated authority.

Future extraction must reset the entire existing transient chain: core pending intake and recoverables, `EmployeeCheckInSession` returningCorrection, condition noteReplayFence, correction/continuation intents and stale errors. Calling a new base-core method while bypassing subclass reset hooks risks carrying a different session's edits. `employee-check-in-session-core.ts` (298), condition session (299) and correction session (296) are near the ceiling; extract focused target hydration/retirement responsibilities before additions.

A click first captures full owner, reads exact detail, requires CHECKING_IN, adopts authoritative fields, then navigates. Existing route activation must recognize the already-prepared matching owner and perform no drafts/continuations discovery or startNew. Close/hardware Back from this targeted entry returns to Vehicles and explicitly refreshes directory; normal unrelated Check-In navigation remains as today. No broad navigation history system is required.

## 11. Gap analysis for Cancel

Missing domain authority, terminal persistence, dedicated action, strict public request/response, outcome read, audit catalog event, portable operation state and Native affordance. These are unimplemented capabilities; they do not establish a conflict between authoritative documents.

Concrete hazards if implemented as a superficial delete/button: non-COMPLETED active predicates keep a new terminal active; active-vehicle uniqueness prevents later intake; drain refuses deactivation; full detail denies terminal or flags missing condition; Guest and visit-history schemas reject new state; other APIs may still act on terminal session; strict legacy directory rejects new fields; aggregate version misses child edits; retry could emit duplicate history; stale target entry could create another intake. Sections 15–41 account for these hazards.

## 12. CRITICAL DECISION REQUIRED — abandoned Check-In terminal semantics

**DECISION REQUIRED BEFORE CODE.** No newer Accepted abandoned Check-In terminal decision was found in the focused decision tree or canonical log. The explicit rule at `docs/04_VALET_SESSION_STATE_MACHINE.md:464` remains binding; Prisma `ValetSessionState` has no CANCELLED. Existing Request/Task cancellations and physical release completion do not satisfy #255.

### UNRESOLVED decisions

| ID    | Material acceptance needed                                                                                                            | Recommended direction; still UNRESOLVED                                                                                                                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U-001 | Terminal representation, legitimate unfinished-session invariant, retention/report meaning.                                           | Terminal CANCELLED from CHECKING_IN only; retain all rows/evidence; no fake completion or parallel flag.                                                                                                                                                                              |
| U-002 | Exact Cancel authority, captured Shift replacement protection, cleanup after lost eligibility.                                        | Same intake membership for Employee/Supervisor; current full eligibility; required expectedShiftId selector checked against locked eligible Shift. No revoked-scope cleanup exception.                                                                                                |
| U-003 | Retry identity, terminal reconciliation read and visibility after access loss.                                                        | State/version convergence with minimal exact status read, current self-owned authority each time, no operationId/outbox; lost authority gives unavailable/unknown, not success.                                                                                                       |
| U-004 | Final route/schema/error/audit event and Supervisor audit catalog inclusion.                                                          | Narrow check-in action/status query, strict minimal schemas, state/version audit in CHECK_IN family, existing concealment/conflict vocabulary.                                                                                                                                        |
| U-005 | Cross-consumer compatibility ownership: Guest tokens, historical visit states, financial/report semantics and post-terminal commands. | Explicit prerequisite scope/owners before terminal ships; no implicit Guest feature or Dashboard redesign. Preserve financial/incident history and reject further inappropriate field actions.                                                                                        |
| U-006 | Safe directory action hints under strict capability negotiation; bounded-page coverage promise.                                       | Minimal server-computed Continue/Cancel booleans in negotiated next capability, no IDs/version; retain existing cap/order unless owner authorizes separate coverage work.                                                                                                             |
| U-007 | Meaning of expectedVersion when condition/Vehicle edits do not increment it.                                                          | Cancellation targets aggregate lifecycle, allows retained child evidence if it committed first; serialize on session lock. Do not claim evidence-freeze CAS. If owner requires cancelling the exact reviewed child snapshot, revise contract using existing child tokens before code. |

### Risks / boundary violations

The most consequential unresolved scope is U-005. A terminal-state addition can require narrow compatibility changes outside the authorized Guest Access/Audit-only Dashboard boundary. Do not smuggle those into #255. Obtain separately owned prerequisite authorization, or choose/revise the decision and eligibility envelope so no incompatible terminal leaks. A recommendation is not permission to widen the task.

## 13. Cancellation representation alternatives

| Representation                                         | Lifecycle/history/audit                                                                                                                                             | Active reads, drain, indexes                                                                                               | Concurrency/retry/reporting/compatibility                                                                                                      | Assessment                                                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: new terminal CANCELLED                              | Truthful physical session abandoned before Check-In completed; one atomic transition/event; retained notes/photos/contacts/Vehicle/Incident/financial associations. | Update active predicates and active-vehicle index; drafts already positive CHECKING_IN; terminal no longer drains as open. | Existing version + locked transition can converge; all nine-state allowlists require impact treatment; no completion timestamps/KPI inflation. | Recommended, UNRESOLVED U-001–U-007; smallest coherent lifecycle, not smallest number of edited files.                                                   |
| Alternative B: CHECKING_IN plus cancellation flag/time | Claims session is still checking in while operationally terminal; audit/time can record cancellation but duplicated lifecycle semantics arise.                      | Every draft/directory/active/drain/index would use both state and flag; forgotten predicate reactivates abandoned work.    | Two lifecycle authorities, additional column/index/compatibility burden; retry ambiguity across flag/state.                                    | Reject recommendation: parallel hidden lifecycle violates task constraint. Reconsider only if an explicit Accepted domain contract supersedes that rule. |
| C: hard delete                                         | Destroys custody/history links and append-only explanation; restrictive FKs and child evidence remain relevant.                                                     | Removing row superficially frees active predicates but erases authoritative history.                                       | Cannot reconcile durable terminal truth; retry absence is not proof; reporting retention and audit referential truth break.                    | Rejected by binding authority.                                                                                                                           |
| D: existing COMPLETED / retrieval cancel / Task cancel | COMPLETED represents verified physical release; REQUESTED→PARKED concerns retrieval; Task cancellation is assignment history.                                       | Coercing one might remove active rows but lies about release/drain and creates wrong downstream state.                     | Completion KPI/returning recognition polluted; no legitimate Check-In terminal operation found.                                                | Rejected as #255 abandonment representation.                                                                                                             |

No automatic expiry, scheduled cleanup, bulk supervisor repair or historical retention duration is selected. Cancelled historical rows remain under existing authorized history/privacy policy; no new erasure/retention program.

## 14. Recommended focused DEC

### Proposed implementation plan

**Bundle P — proposed substance, UNRESOLVED until owner acceptance.** Allocate a focused DEC number during documentation synchronization; do not reuse Task/Request decisions or mark this plan Accepted. If any U-item is accepted differently, edit this section and dependent implementation/test maps first.

Context: employees need to end an abandoned persisted intake while distinguishing it from released custody and retaining Black Box evidence. Vehicles is the entry point; a CHECKING_IN session is not a Task.

Proposed transition: CHECKING_IN→CANCELLED only. CANCELLED is terminal, non-resumable, non-operational and not COMPLETED. Condition completion may already exist; it does not make Check-In completed. Require no parking/retrieval/handoff progression, no current key/parking assignment or active Task custody; unexpected custody fails closed rather than being cleared. Explicitly resolve Guest/financial compatibility under U-005; cancellation never revokes credentials, refunds money, closes incidents, or fabricates release as an accidental side effect.

Proposed authority: valid Staff principal; ACTIVE User/org/Location/current operational membership; exact explicit access; Employee or Supervisor; persisted intake membership equals actor membership; locked ACTIVE Shift at that exact Location matches expectedShiftId. Supervisor has no other-owner cancellation override. Access loss or Shift end prevents new Cancel and protected reconciliation; cleanup outside eligibility is a separate decision.

Proposed time/CAS: server `clock_timestamp()` in transaction; session version v→v+1 exactly once; updated_at uses same instant as AuditEvent.occurredAt. Do not set completed_at/completed_by/checking_in_completed_at. No new session CAS counter; no cancelledAt/actor columns because terminal state/version plus append-only event carry the durable facts. Retain condition timestamps/notes/photos and Vehicle facts.

Conditional on U-003 being accepted as P, proposed retry: after current scope/ownership proof, coherent CANCELLED returns existing safe terminal result without mutation/audit. Wrong state fails; CHECKING_IN requires exact expectedVersion. Terminal convergence does not assert “this tap committed” or “this employee originally cancelled it.” No operationId because one irreversible transition cannot be repeated while history is retained; no audit idempotency-key shortcut. If product needs original-response/intent replay, U-003 must instead accept durable identity with scoped uniqueness and payload fingerprint, and revise all affected schemas/tests/migrations.

Conditional on U-003/U-004 being accepted as P, proposed public action: POST `/v1/staff/check-in/sessions/:sessionId/cancel`, body `{ expectedVersion, expectedShiftId }`, strict success `{ sessionId, locationId, state: "CANCELLED", version }`, HTTP 200 after atomic commit/current authorized convergence. Proposed status query: GET `/v1/staff/check-in/sessions/:sessionId/cancel-status?expectedShiftId=<uuid>`, strict `{ sessionId, locationId, state, version }`, no Vehicle/Guest/actor projection. Final exact shape/route is U-004, not an existing contract. Status accepts current persisted lifecycle states for classification but never confers full custody detail authority.

Conditional on U-004 being accepted as P, proposed errors: reuse current `VERSION_CONFLICT` (409), `INVALID_STATE_TRANSITION` (409), transport validation (400), valid principal denial (401) and non-disclosing existing tenant/location/operation denials (404). Proposed custody-invariant block also uses INVALID_STATE_TRANSITION unless acceptance requires a specific new typed error. Do not introduce a new code accidentally through UI copy. U-004 fixes public precedence: authorize first; coherent terminal convergence second; otherwise exact version then CHECKING_IN/invariants. A stale version is never silently upgraded into a cancellation request.

Conditional on U-004 being accepted as P, proposed audit: `VALET_SESSION_CHECK_IN_CANCELLED`, justified by existing CHECK_IN_COMPLETED naming, entity ValetSession, real org/Location/session, actor membership, PostgreSQL time, metadata fromState/toState/fromVersion/toVersion only. Add explicit Management CHECK_IN family and Supervisor operational allowlist after U-004 acceptance. No raw metadata, reason, phone, plate, token or operation identity display.

Proposed active semantics: exclude both COMPLETED/CANCELLED from directory/active-vehicle uniqueness/operational-active resource and Location drain predicates. Preserve positive completed-visit and workforce-evidence formulas. Historical compatibility and financial projection decisions are U-005 prerequisites, not blanket replacement of every COMPLETED check.

Proposed migration: forward-only enum addition, terminal integrity checks if accepted, active partial-index replacement and blocker-function replacement; possibly staged enum migration before using the new enum value. Preserve restrictive tenant FKs and historical rows. No old migration edits, speculative actor/time columns or new generic cancellation table.

Proposed required proof: real PostgreSQL authorization/race/rollback/runtime-role/migration tests; strict contracts; no replay; exact-target continuation; Native generation and UI-freeze evidence; later batch physical scenarios. Explicit non-goals: Tasks, bulk/expiry/cleanup, Guest workflow changes, payments changes, override, redesign and offline sync.

**OWNER / ACCEPTED DECISION REQUIRED BEFORE IMPLEMENTATION**

## 15. Resulting state-machine changes if accepted

Conditional on Accepted P: add one edge CHECKING_IN→CANCELLED and terminal state. No outgoing cancellation edge, resurrection or transition from AWAITING_PARKING/any later state. Continue requires current CHECKING_IN; normal existing continuation entry still supports AWAITING_PARKING.

Terminal-impact register distinguishes required conditional changes from inspected invariants that remain unchanged:

| Exact source                                                                                                                                                          | Conditional impact / boundary                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/database/prisma/schema.prisma` ValetSessionState; `packages/contracts/src/staff-valet-session.ts`; `valet-sessions/protected-custody-command.ts` state type | Add accepted canonical state; explicit required-state commands still deny it. Never broaden an operational allowed-state guard merely to compile.                                                                                                                                                        |
| `staff/staff-vehicle-directory.queries.ts`; `packages/contracts/src/staff-vehicle-directory.ts`                                                                       | Query and both public directory schemas exclude both terminals. Native badge record stays active-state-only.                                                                                                                                                                                             |
| `vehicles/vehicle-identity-command.ts` competing-session predicate                                                                                                    | Exclude accepted terminal from active identity conflict; retain Vehicle's existing child concurrency token.                                                                                                                                                                                              |
| `staff/staff-check-in-drafts.service.ts`, `staff-check-in-continuations.service.ts`                                                                                   | Conditional on Accepted P, positive state filters already exclude CANCELLED; add regression, no new list query.                                                                                                                                                                                          |
| `staff/staff-valet-session-authorization.ts` classifier/temporal validator                                                                                            | Current broad detail cannot serve terminal reconciliation. P keeps cancelled full custody detail denied and adds separate minimal outcome read; do not require condition-complete on cancelled status read.                                                                                              |
| `management/management-location-projection.ts`; migration-040 blocker function/index                                                                                  | Use operational nonterminal predicate, matching SQL function and projection. Do not ignore active Shifts/Tasks or incidents/payment obligations by fabrication.                                                                                                                                          |
| `dashboard/physical-resource-query.ts`, `overview-shifts-keys-incidents-query.ts`                                                                                     | Exclude accepted terminal from active session context while preserving resource history. Backend compatibility only.                                                                                                                                                                                     |
| `dashboard/overview-financial-query.ts` sessionScopeJoin                                                                                                              | Current non-COMPLETED operational financial grouping includes every other state. U-005 must decide terminal vs financial obligation projection; do not blindly hide historical money or add refunds.                                                                                                     |
| `dashboard/overview-sessions-query.ts`; contracts `location-overview.ts`, `session-overview-query.ts`                                                                 | ALL already uses eight explicit active states. Counts use nine entries and a nine-state schema; new canonical state is silently omitted today. U-005 must document preserved operational count projection or explicitly authorize expanded canonical count contract/consumers. No Dashboard UI redesign. |
| `packages/contracts/src/management-audit-events.ts`; management catalog/detail projection                                                                             | Conditional on Accepted P/U-004, new known event, family/role allowlist and CANCELLED safe state allowlist; audit schema uses shared staff state.                                                                                                                                                        |
| `packages/contracts/src/management-visit-contacts.ts`; `management-visit-contact-history-query.ts`                                                                    | History query returns all states but schema has nine values. Terminal history would fail strict serialization. U-005 separately owned compatibility prerequisite; retain cancelled visit association without completedVisitCount inflation. No contact UI inspected beyond allowed Audit consumer.       |
| `packages/contracts/src/check-in.ts` guestSafeSessionResponseSchema; `valet-sessions/guest-safe-session.ts`, `guest-access-command.ts`                                | Guest schema/type has nine states; token resolver lacks terminal predicate and issue/rotate lacks state guard. Terminal token access can break projection. U-005 Guest Access prerequisite; no implicit token revocation/new Guest state UX in #255.                                                     |
| `incidents/incident-creation-authorization.ts`; `apps/valet-native/src/incident/native-incident-session.ts`                                                           | Only COMPLETED explicitly terminal today. Supervisor incident creation bypasses employee classifier. Add accepted terminal denial in separately approved minimal compatibility scope; retain existing incidents/recovery history.                                                                        |
| `dispatch/dispatch-types.ts`; `packages/contracts/src/dispatch.ts`; Native task/handoff presentations                                                                 | Task state schema derives from staff schema, but runtime projection explicitly accepts nine states. Cancel has no Task; assert no cancelled session enters queue. No Task-state addition or automatic cancellation.                                                                                      |
| `valet-sessions/intake-customer-resolution.ts`, `vehicles/returning-vehicle-recognition.ts`, management visit search/history completed predicates                     | Positive COMPLETED filters remain; cancellation is not a completed visit or returning recognition proof.                                                                                                                                                                                                 |
| `dashboard/analytics-kpi-workforce-query.ts`, `management/company-analytics-kpi-query.ts`, operational KPI sources                                                    | Preserve action/condition evidence, immutable financial history and actual completion timestamps. No new cancellation KPI or rewrite of past activity.                                                                                                                                                   |
| Retrieval/handoff/parking/key commands and Guest rating                                                                                                               | Positive required-state/COMPLETED guards remain. Add terminal-denial compatibility tests; do not extend those workflows.                                                                                                                                                                                 |

These are exact baseline paths relative to `apps/api/src/modules` unless another root is shown. Full runtime search was restricted to API, contracts, employee-client, Native, database and docs; Employee Web and other Dashboard UI were excluded. New implementation must repeat the search against its then-current baseline; this register is bounded to this SHA.

## 16. Database/migration impact

Conditional on Accepted P: enum migration is required. No cancellation timestamp/actor column is recommended. `AuditEvent` already persists scope/session/entity/actor/occurred_at; session retains state/version/updated_at. Audit is the durable cancellation instant/provenance; updated_at is not promised to be an immutable cancellation timestamp if another accepted independent command can change it.

Current active-vehicle index is **`valet_sessions_active_location_vehicle_key`**, defined in `20260808000500_valet_session_foundation/migration.sql` with state <> COMPLETED. Replace through a new migration with both terminals excluded, enabling later legitimate intake of the same Vehicle at that Location without deleting the abandoned session.

Do not “fix” obsolete indexes: migration `20260811001900_phase3_key_parking_persistence/migration.sql` already dropped active parking/key indexes and replaced them with **`valet_sessions_parking_spot_id_key`** and **`valet_sessions_key_slot_id_key`**, unique whenever assignment is non-null regardless of state. Preserve them. Cancel must reject unexpected current custody, not clear or weaken assignment constraints.

Migration `20260917004000_mgt_be_07_location_management/migration.sql` defines **`valet_sessions_location_id_non_completed_idx`** and **`public.management_location_has_blockers`** with non-COMPLETED session predicate. Forward migration must update both; projection in API must agree. Active Shift and nonterminal Task blockers remain independent.

Proposed integrity check, subject U-001: CANCELLED has no physical progression/completion timestamps/current parking/key/assignee; condition marker may exist. No cross-table Task CHECK can be pretended enforceable; transaction/session lock and existing Task command state guards own that proof. Historical record count/FKs/notes/photos/audit remain unchanged by transition.

PostgreSQL enum-value deployment must be tested through the real migration runner: a newly added enum label cannot be used in predicates/checks before it is committed in deployment modes that wrap enum addition transactionally. Plan additive enum migration and subsequent predicate/constraint/function migration as needed, not an unverified single transaction. Update `packages/database/src/migration-manifest.ts`, runtime grants only if proven required, fixtures and `docs/03_DATABASE_SCHEMA.md`. Do not edit an applied migration or use schema sync as deployment proof.

## 17. Contract/API design

Conditional on Accepted P/U-004: public schemas belong in new `packages/contracts/src/cancel-check-in.ts` and public exports. New file names are **proposed**, not existing. Strict request `{expectedVersion: integer >=1, expectedShiftId: UUID}`; sessionId is UUID path selector. No org/member/actor, force, reason, arbitrary state, client timestamp or generic patch. Expected Shift is an untrusted selector, checked against locked persisted eligibility; it carries no authority alone.

Strict mutation success is minimal `{sessionId, locationId, state: literal CANCELLED, version: integer >=1}`. No customer/plate/Vehicle/actor/audit/operation id. Strict status response carries same selectors plus canonical current state/version; it is authorized as an exact self-owned cancellation target/history, not a full session read. Same current eligibility required under P, including terminal reconciliation. Unknown or foreign existence is concealed.

Proposed action/status route and HTTP/error precedence are explicitly U-004 in section 14. Reuse current body/UUID parsing, one Authorization-header proof, principal resolver, shared runner and middleware. A sibling controller avoids growing the 304-line Check-In controller. No new pool, module, auth stack, generic repository, exception filter or privileged enrichment.

Directory capability proposal U-006: a negotiated next response adds only server-computed `canContinueCheckIn` and `canCancelCheckIn` for current eligible self-owned CHECKING_IN rows. False for Supervisor's other-owner rows; Cancel may be false for accepted invariant restrictions. Both are presentation hints. Preserve legacy and visibility-v1 response exactly, key-slot masking and cap. Exact capability literal is not decided here; old binary must never receive CANCELLED rows or extra fields it cannot parse. Do not add membershipId/version/full draft projection to the row.

## 18. Cancel command transaction/lock/version design

Conditional on Accepted P: use one transaction-aware explicit executor in `valet-sessions`, consumed internally by thin API service. Minimal outcome query consumes the same authorization boundary, not the project's own HTTP endpoint. Existing generic protected custody executor does not automatically provide intake ownership, exact Shift comparison or terminal convergence; reuse concrete authorizer/writer/query primitives, not an incompatible generic call.

**Authorization-before-mutation proof:**

| Stage                | Conditional action under P                                                                                                                                                                         | Existing pattern/evidence                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Authenticate         | Validate current Staff principal before invoking executor; no tenant claims from body.                                                                                                             | Check-In controller/principal resolver and DEC-072.                                                                                              |
| Resolve target       | Read persisted session id/org/Location/owner without changing it; absent target concealed.                                                                                                         | Complete executor load scope and custody authorizer.                                                                                             |
| Establish lock order | Take existing shared Location lifecycle lock before acquiring conflicting scope-row locks; keep same transaction. Then active User, member/org/Location/access and Shift eligibility share locks.  | `common/database/location-lifecycle-lock.ts`, `shifts/shift-operational-eligibility.ts`; compare existing lifecycle command order in race tests. |
| Authorize target     | Prove allowed role/exact tenant/Location/current access; locked eligible Shift equals expectedShiftId; session intake owner equals actor.                                                          | `custody-staff-authorizer.ts`; eligibility returns authoritative shiftId.                                                                        |
| Lock/recheck         | Conditional on Accepted P: lock exact scoped ValetSession FOR UPDATE; repeat scope/ownership and current-state checks using locked row. No write used as authorization probe.                      | Complete/condition/Vehicle session locking pattern.                                                                                              |
| Converge or validate | Conditional on Accepted P: coherent terminal proof returns current safe result only after authority; otherwise require expectedVersion, CHECKING_IN and accepted custody/compatibility invariants. | P acceptance required; existing complete has version/state guard.                                                                                |
| Mutate               | Conditional on Accepted P: guarded UPDATE scoped to id/org/Location/state/version; state CANCELLED, version+1, updated_at database operationTime; exactly one row or rollback.                     | Complete conditional mutation pattern.                                                                                                           |
| Audit                | Append one event with same operationTime, safe state/version metadata and persisted actor/scope.                                                                                                   | `audit/custody-audit-event-writer.ts` accepts this actual scope/entity.                                                                          |
| Commit               | Return success only after COMMIT. Audit/mutation failures rollback both. Release connection in finally.                                                                                            | Existing command executors.                                                                                                                      |
| Retry/status         | Fresh persisted authority/ownership/eligible Shift proof before any protected read/converged result; no unauthorized fallback response.                                                            | DEC-032/063/072; P defines specific terminal read.                                                                                               |

Conditional on Accepted P, keep eligibility share locks through write/commit so a Shift end, access delete, membership/User/org/Location disable cannot commit between proof and protected transition. Shared lifecycle advisory lock prevents deactivation from racing drain evidence. Test lock-order compatibility rather than declaring the entire existing application deadlock-free. A deadlock/serialization rollback has no partial history; a lost transport response remains unknown until read.

Existing StaffPrincipal proves User and is resolved outside the command. Do not claim the command already holds an exact Staff-session revocation lock. Client generation purge fences logout; persisted eligibility rows fence access/status loss. If owner requires logout/session revocation to linearize against an already authenticated command inside its transaction, U-002 must authorize carrying existing StaffSessionContext through this route and its locking boundary; do not invent a new auth mechanism or promise stronger revocation proof from User lock alone.

Version scope is precise: Complete vs Cancel conflicts on aggregate version/state. Condition marker and Vehicle corrections share session locking but may leave session version unchanged. Under recommended U-007, child-first then Cancel can be valid with retained evidence; Cancel-first makes child operation's locked CHECKING_IN guard fail. If product instead requires “no edit since the confirmation read”, existing version alone is insufficient; keep implementation blocked until accepted contract covers child tokens.

## 19. Authorization matrix

Conditional Cancel/status columns assume Accepted P. Continue/directory columns describe existing read authority; UI hints are never permission.

| Actor/situation                                     | Directory current                          | Vehicles Continue             | Proposed Cancel/status                                              |
| --------------------------------------------------- | ------------------------------------------ | ----------------------------- | ------------------------------------------------------------------- |
| Eligible Employee, own CHECKING_IN                  | Visible within cap                         | Exact authorized hydrate      | Allowed with captured exact Shift/version/state proof               |
| Eligible Supervisor, own CHECKING_IN                | Visible within cap                         | Exact authorized hydrate      | Same narrow self-owned rule                                         |
| Eligible Supervisor, another's CHECKING_IN          | Directory visible                          | Existing detail denies        | Denied; hide action hints                                           |
| Employee, another's CHECKING_IN                     | Filtered                                   | Denied                        | Denied                                                              |
| ORG_ADMIN / LOCATION_MANAGER                        | Not this operational directory role        | No inferred field role        | Denied; management audit authority is separate                      |
| Guest / unauthenticated                             | Denied                                     | Denied                        | Denied                                                              |
| Wrong org/Location, missing grant                   | Denied/non-disclosing                      | Denied                        | Denied/non-disclosing                                               |
| No Shift / wrong Location Shift / ended Shift       | Denied                                     | Denied                        | Denied; self-end cleanup exception does not apply                   |
| Old Shift id replaced by new Shift at same Location | Read may now use current eligible scope    | Old client owner invalidated  | expectedShiftId mismatch denies old intent                          |
| Disabled User/member/org/Location or changed role   | Denied                                     | Denied                        | Denied; no fallback cleanup                                         |
| Own CANCELLED                                       | Excluded under accepted terminal semantics | Not resumable                 | Current eligible owner may read/converge minimal terminal fact only |
| Own later state                                     | Ordinary lifecycle directory rules         | Reject this CHECKING_IN entry | No cancellation; minimal authorized status classifies changed truth |

Membership, not User-global Shift identity, owns the operation. A User with different Organization memberships cannot transfer one membership's intent or Shift to another.

## 20. Retry/idempotency/unknown-outcome model

Conditional on Accepted P/U-003: one action owner, one target/intention in flight; confirmation and dispatch both check pending state; double taps do not issue a second POST. Server lock/terminal guard remains final protection across devices.

| Result                                                                  | Client behavior                                                            | Server guarantee proposed by P                                                               |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Committed safe response                                                 | Confirm terminal; invalidate same-target local Check-In; directory refresh | One version increment/event                                                                  |
| Authorized repeat after terminal                                        | Converge to current CANCELLED; no new effect                               | Re-prove authority; coherent original event/terminal transition required, no duplicate audit |
| Wrong state/stale version                                               | Conflict/current truth; refresh; fresh confirmation for any new intent     | No mutation/event from loser                                                                 |
| Known pre-dispatch failure                                              | Show truthful error; explicit retry only                                   | No server success inferred                                                                   |
| Dispatch may have happened, transport failure/malformed success/timeout | Outcome unknown; disable destructive retry until exact status read         | Client does not replay; commit status determined by persisted state                          |
| Status CANCELLED                                                        | Converge terminal and refresh directory                                    | Does not attribute prior tap/actor; same session is permanently terminal                     |
| Status CHECKING_IN, same expectedVersion and same current owner/Shift   | Offer explicit same-intent retry after user confirmation                   | Revalidate again on command; no automatic POST                                               |
| Status changed state/version                                            | Conflict; abandon stale destructive intent; use current truth              | Old intent cannot cancel newer aggregate state                                               |
| Status read unavailable/offline or authority lost                       | Keep unknown/unavailable; no success or retry authorization                | Absence from directory/404 does not prove cancel committed                                   |

`AuditEvent.idempotency_key` is not globally unique; existing event-specific indexes are not cancellation identity. P needs no durable operationId because terminal transition is irreversible and serialized. If U-003 instead selects durable operation identity, require same actor/tenant/session+operation id uniqueness, canonical payload fingerprint, original outcome storage, fresh authority on replay and explicit changed-intent conflict, plus migration/runtime-role tests. That alternative is not selected in subsequent conditional P steps.

Conditional on Accepted P, test identical retry after a committed cancellation, concurrent identical cancellations, and retry after audit/transition rollback separately. Changed expectedVersion/Shift/target intent is re-evaluated against current authorized state; terminal convergence reveals only the current terminal fact, not transparent replay of an original response.

Same-owner background retains only minimal target/version/expectedShift/transient unknown state for reconciliation. Process death loses that memory; no new durable intent is authorized. On restart load current authoritative directory, do not claim the previous tap succeeded from absence and do not replay it. Logout/identity replacement purges even unknown intent; audit/server truth remains durable.

## 21. Audit event design

Conditional on Accepted P/U-004, candidate `VALET_SESSION_CHECK_IN_CANCELLED` follows existing `VALET_SESSION_CHECK_IN_COMPLETED`. `CHECK_IN` family follows the intake/condition/completion catalog, rather than Task or generic management event.

Conditional on Accepted P/U-004, persist orgId/LocationId/sessionId from locked scope; actorType MEMBERSHIP and actorMembershipId from persisted authorizer; entityType ValetSession/entityId sessionId; server occurredAt; metadata `{fromState:"CHECKING_IN", toState:"CANCELLED", fromVersion:v, toVersion:v+1}`. Use actual existing custody writer, which supports this entity/scope and safe scalar metadata. Its key sanitizer is not permission for free text.

Exactly one event per successful transition, transactionally with state/version. No event on denied/stale/duplicate convergence; no audit of ordinary status/list reads. Coherent convergence requires durable transition history matching terminal/version, failing closed for inconsistent terminal fixtures rather than manufacturing audit. Do not add entered reason, plate, phone, customer identity, request body, tokens or internal operation identifiers. No account-security event copied into tenant history.

## 22. Management Audit visibility

Conditional on Accepted P/U-004, changes are explicit allowlists:

1. `packages/contracts/src/management-audit-events.ts`: known event.
2. `apps/api/src/modules/management/management-audit-event-catalog.ts`: CHECK_IN family and explicit Supervisor operational allowlist; adding family alone does not expose it to Supervisor.
3. `management-audit-detail-projection.ts`: CANCELLED in safe session-state set; lifecycle version/state projection only. `management-audit.ts` follows accepted shared state schema; no unrestricted metadata.
4. Existing projection/authorization/pagination remain: CA active ORG_ADMIN/exact current management session/MFA and org authority; LM explicit authorized Location history under current authority; Supervisor current active exact Location/Shift and known operational events; Employee/Guest no explorer. Retain commercial access gates and separate account audit.
5. Conditional on Accepted P/U-004, narrow Dashboard Audit compatibility: `apps/dashboard/src/features/audit/audit-event-copy.ts` exhaustive EN/AR record needs the event label. `audit-detail-values.ts` calls `operationsSessionStateLabel` before generic CANCELLED labels, so use a narrow Audit-local CANCELLED label path if preserving outside-Audit scope. `audit-detail-renderer.tsx` already renders typed CHECK_IN fields; existing filters derive known catalog. No layout/new page/filter/navigation redesign.

Audit consumer inspection was limited to this necessity. Event labels proposed for later localized review: “Check-in cancelled” / “تم إلغاء تسجيل الوصول”; existing typed pipeline renders other safe fields. Counts/contacts/Guest compatibility is a separate U-005 concern, not permission for broader Dashboard work.

## 23. Employee-client architecture

Conditional on Accepted P: extend the existing `EmployeeCheckInSession` public boundary with proposed `openExistingCheckIn(identityGeneration, scope/owner, sessionId)`. Final signature is derived during focused extraction; guarantee no discovery/new intake, exact authorized CHECKING_IN hydrate, full retirement of prior transient state, current owner/sequence check, authoritative persisted version/condition/Vehicle. Existing `resume`, normal activate and continuation remain compatible.

Downstream Native provides current auth generation, full operational scope and selected sessionId. It receives a ready existing Check-In snapshot or typed unavailable/conflict failure and may navigate only on current success. It does not receive authority from a row or choose another recoverable. This is a portable client workflow boundary over existing transport, not a new backend state machine.

Proposed dedicated cancellation owner `EmployeeCheckInCancelSession` is a small transient operation owner: inactive → confirming → submitting → success, error/conflict, or outcome-unknown → reconciling → terminal/changed/retry-eligible/unavailable. Bind authGeneration/member/org/Location/Shift/role, sessionId, expectedVersion and monotonically increasing attempt revision. New files split types, transport, session/reconciliation if needed below 300; no generic cancellation framework.

Existing `EmployeeClient.request` remains unchanged: safe-read authorization recovery may retry a read once; mutations never auto replay. Cancel transport is strict, unknown dispatch failures do not become ordinary retriable success. Cross-feature actions are coordinated: a pending exact-target hydration or cancel blocks another action that would replace its owner; late completions cannot change newer workflow state.

## 24. Native runtime integration

Conditional on Accepted P: existing runtime owns cancellation session alongside Check-In/directory. Register purge, scope retirement, disposal, foreground/background handling through existing owners. No durable storage or second directory. `native-auth-runtime.ts` is 296 lines; extract focused Check-In action construction/wiring before additions.

A focused Vehicles action adapter captures current owner, calls targeted hydrate, then receives Check-In destination intent in existing controller. Store only a same-authority Vehicles return origin; close/back clears prepared workflow and refreshes the existing directory. Preserve existing edit-back and in-flight protections. Normal scan/new Check-In origin behavior does not change.

Add cancel reconciliation to lifecycle revalidation after operational scope confirmation and before directory refresh, preventing directory absence being interpreted as operation success. Check-In exact-target foreground continuation also revalidates current persisted state before action, reusing existing sequence/owner retirement. No network-recovery POST or broad shell restructuring.

## 25. Vehicles UI integration — frozen design

Conditional on Accepted P/U-006: augment only existing expanded eligible CHECKING_IN row. Preserve collapsed title/badge/metadata/summary and all six details. Replace only that actionable row's “read-only” footer with a minimum truthful incomplete-work explanation and two existing EmployeeButton variants (primary Continue; existing danger treatment for Cancel). Normal rows and Supervisor other-owner rows retain read-only footer exactly.

Use existing spacing/touch targets, human direction, tokens and supporting feedback; no new icons/palette/card/list panel. Stack actions vertically if horizontal labels fail narrow EN/AR fit, without changing existing content geometry. Expanded-row growth is solely the necessary action area per UI freeze contract. Single sessionId key and one row representation.

Confirmation reuses the Native Guest Access confirmation **presentation pattern** inspected in `guest-access/native-guest-access-confirm-sheet.tsx` and its styles: transparent slide Modal, existing dark backdrop, white sheet with top border/radius 24/padding 20/gap 16, modal accessibility, existing danger/secondary actions. Do not import Guest domain helpers or refactor Guest behavior. Prefer a focused Check-In confirmation component using those already-existing primitives/token geometry; a shared extraction is optional only if accepted and does not expand Guest scope.

Default/confirming/submitting/unknown/reconciling/conflict/unavailable/success states are local action presentation. Current screen error/loading/empty states remain. No optimistic permanent removal; a committed terminal result/status plus authoritative directory refresh owns row disappearance. If refresh fails, show confirmed cancellation separately from refresh failure and keep stale row actions disabled; do not claim list refreshed.

## 26. Continue sequence

Conditional on Accepted P's targeted-entry/capability envelope; existing Continue authority remains self-owned. This sequence requires no cancellation endpoint.

```mermaid
sequenceDiagram
  participant V as Existing Vehicles row
  participant N as Native action adapter
  participant C as Existing Check-In owner
  participant A as Staff session detail API
  participant R as Existing Check-In route
  V->>N: Continue(selected sessionId)
  N->>N: Capture auth generation + exact operational owner
  N->>C: Bind owner and retire old transient intent, without discovery
  C->>A: GET exact session detail
  A->>A: Current principal, persisted tenant/Location/member/Shift, self-owned CHECKING_IN read
  A-->>C: Persisted sessionId/Location/state/version/vehicle/condition marker
  C->>C: Require exact target, CHECKING_IN, same owner and attempt revision
  alt target/current owner remains valid
    C-->>N: Existing workflow snapshot hydrated
    N->>R: Navigate only now
    R->>C: activate same prepared owner (no-op; no discovery/startNew)
    R->>R: Existing persisted Check-In step/condition handling
  else changed state or authority
    C-->>N: Safe failure; no intake and no route entry
    N->>V: Refresh current directory / localized changed message
  end
```

On return to Vehicles, refresh once through existing directory owner. Another client can change state after hydration; subsequent existing protected Check-In commands still re-prove state/version. Foreground revalidation retires a cancelled target. Neither navigation nor successful read promises future mutation authority.

## 27. Cancel sequence

Conditional on Accepted P/U-001–U-007. Confirmation prepares a fresh exact-session version; it does not trust directory row time as CAS.

```mermaid
sequenceDiagram
  participant V as Expanded Vehicles row
  participant C as Cancel owner / existing-style confirmation
  participant A as Dedicated Check-In API
  participant D as PostgreSQL
  V->>C: Request Cancel exact session, capture owner
  C->>A: Exact authorized detail read for current CHECKING_IN/version
  A-->>C: Current target/version
  C->>V: Confirmation (no destructive request yet)
  V->>C: Confirm
  C->>C: One in-flight guard; owner still current
  C->>A: POST proposed cancel with expectedVersion + expectedShiftId
  A->>D: BEGIN, persisted scope + current authority/eligibility locks
  A->>D: Exact scoped session FOR UPDATE; ownership/state/version/invariants
  A->>D: Obtain clock_timestamp()
  A->>D: Guarded CHECKING_IN -> CANCELLED, version + 1
  A->>D: Append one safe CHECK_IN cancellation AuditEvent
  A->>D: COMMIT
  A-->>C: Safe committed terminal response
  C->>C: Fence response; clear same-target Check-In state
  C->>A: Existing directory refresh
  A-->>V: Active page excludes terminal session
```

```mermaid
sequenceDiagram
  participant C as Cancel owner
  participant A as API
  participant D as PostgreSQL
  C->>A: Cancel dispatch
  A->>D: May commit or roll back
  A--xC: Response lost / transport fails
  C->>C: Outcome unknown; never automatic POST replay
  C->>A: Exact authorized minimal status read
  A->>D: Re-prove current scope/owner/Shift, read current state/version
  alt CANCELLED with coherent terminal history
    A-->>C: Terminal fact
    C->>A: Refresh directory; converge success
  else CHECKING_IN at original aggregate version
    A-->>C: Still eligible current fact
    C->>C: Offer explicit confirmed retry of same intent
  else changed state/version
    A-->>C: Current changed fact
    C->>C: Conflict; retire stale cancel intent, refresh
  else inaccessible / read failure
    A-->>C: Non-disclosing denial or unavailable
    C->>C: Stay unknown/unavailable; no destructive retry or success
  end
```

Exact status read must not return foreign/other-owner facts as a fallback. Row disappearance, a 404, or absent active Shift does not establish cancellation.

## 28. Scope/identity/background fencing

Conditional new action integration reuses existing Native authority model. Each await compares attempt revision and full captured authGeneration/member/org/Location/Shift/role; retired owners cannot publish or navigate, even if A→B→A identity values recur. Increment revision on new target, clear, purge, background suspension and scope retirement; no equality-only fence.

| Boundary                                    | Required action proof                                                                                                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Logout/auth generation/identity replacement | Purge action/Check-In/directory; stale read/POST completion cannot paint or navigate. Server commit may already have occurred; do not undo history or replay.                           |
| Shift end/replacement; Location change      | Retire target/return origin/confirmation; compare exact Shift id. Existing Share locks govern whether protected command precedes end.                                                   |
| Grant/member/User/org/Location loss         | Refresh operational context; fail closed; no prior capability/row grants authority. Race test server locking independently of client fence.                                             |
| Background before/during Continue           | Suspend/fence read, no navigation from late result; foreground operational revalidation then exact hydrate if user still chooses target.                                                |
| Background during Cancel                    | No second dispatch; treat response invisibility as potential unknown; retain minimum same-owner intent and reconcile after foreground authority confirmation. Abort cannot undo commit. |
| Foreground/reconnect                        | Existing coalesced coordinator: confirm context, reconcile pending cancel once, refresh directory once; no polling or mutation replay.                                                  |
| Process death                               | No durable cancellation intent. Reconstruct authoritative directory; never assert prior tap result from absence or auto-retry.                                                          |

Server and client guarantees are different: DB locks/guards prevent an unauthorized/stale transition; Native generation guards prevent stale presentation. Neither substitutes for the other.

## 29. Offline behavior

Continue is online authoritative hydration; cached row cannot enter a pretend resumed flow. Cancel is online protected action; connectivity hint never proves dispatch/success. Offline before dispatch shows existing localized reconnect/retry treatment; no queued cancel, local terminal state or “will sync later”.

If connection disappears after dispatch, use outcome unknown, not ordinary safe retry. Reconnection may trigger a bounded status GET after current operational authority; only an explicit user choice dispatches another POST. Follow DEC-063/072; no AsyncStorage/SecureStore/SQLite/outbox/background-sync addition.

## 30. Request budget/performance

Conditional on Accepted P. Counts are action-specific requests, excluding existing shared auth/operational-context requests and one possible safe GET retry after accepted auth recovery.

| Scenario                                     | Expected bounded action requests                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vehicles initial load                        | 1 existing directory GET; 0 draft-list/detail requests per row                                                                                    |
| Expand normal or incomplete row              | 0 requests for already-held details/action hints                                                                                                  |
| Continue                                     | 1 exact detail GET, then existing route with 0 discovery/intake requests; return to Vehicles 1 directory GET                                      |
| Cancel opened then dismissed                 | 1 exact detail GET to prepare version; 0 mutation                                                                                                 |
| Cancel success                               | 1 preparation detail GET + 1 POST + 1 directory GET = 3                                                                                           |
| Cancel outcome unknown                       | Above preparation/POST, then 1 exact status GET per explicit/coalesced reconciliation attempt; 1 directory GET only after terminal/changed result |
| Explicit retry after original-version status | 1 explicitly confirmed POST, then 1 directory refresh on success; not an automatic loop                                                           |
| Foreground/reconnect                         | Coalesce context recovery + at most 1 pending status read + 1 directory refresh; avoid duplicate screen/lifecycle triggers                        |

No per-row fan-out, second full list, interval polling, unbounded background retry or repeated GET+POST loop. Reconciliation unavailable pauses until a new user/network/foreground trigger. Add deterministic request-count tests with held promises. Query plans/partial indexes measured on real PostgreSQL fixtures; no production-performance claim from constants alone.

## 31. Privacy/security

No rendered org/member/Shift/session/audit/operation IDs, version, token or hidden auth claim. sessionId/expectedShiftId/version remain internal command selectors/facts only. Existing raw plate display stays as already authorized; cancellation audit/response gains no plate or PII. Keep directory key-slot masking, no privileged enrichment on expansion/action availability.

Current Staff principal and persisted scope must authorize before reading or mutating protected target. Repeat proof on status/convergence paths. Strict schemas reject forged actor/org/role/state/time/reason fields. All child rows remain tenant-linked with restrictive FK history. Unknown event types stay safe/minimal and excluded from unauthorized roles. Sensitive data does not enter ordinary logs, diagnostics, errors or durable local intent.

U-005 is a real security/compatibility gate: existing token issue/resolver and Supervisor incident command cannot silently inherit terminal behavior. No successful terminal release until accepted compatibility prevents misuse without creating a Guest cancellation workflow or broad finance change.

## 32. EN/AR/RTL/accessibility

Conditional minimum new strings go through `apps/valet-native/src/i18n/native-dictionary-en-vehicles.ts`, `native-dictionary-ar-vehicles.ts`, typed main dictionary and `native-vehicles-copy.ts`. Do not edit the broad existing checkInState label if that would change other screens. Candidate expanded explanation “Incomplete Check-In” / “تسجيل وصول غير مكتمل”; actions “Continue Check-In” / “متابعة تسجيل الوصول”, “Cancel Check-In” / “إلغاء تسجيل الوصول”. Copy is provisional until Native fit/accessibility review, not shipped vocabulary in this plan.

Use existing supporting/button typography, direction and button variants. Human Arabic RTL independently; plate/key/zone/spot identifiers LTR. Existing human alignment and metadata separators unchanged. No textarea/reason/input; confirmation identifies target using already-permitted vehicle description, no internal id.

Expanded controls are separate accessible buttons, not destructive child presses triggering parent toggle. Disabled/busy state and localized labels announce progress/unknown/conflict; error uses existing feedback component. Modal is accessibilityViewIsModal, focus moves to heading/appropriate safe action and restores to initiating row on dismissal; Android Back dismisses pre-dispatch confirmation but never launches Cancel. Verify TalkBack traversal/large-text fit/48 minimum hit target and hardware/keyboard Back. No new keyboard-opening behavior is expected because actions add no input; existing Check-In focus behavior remains.

## 33. Backend test matrix

### Test matrix

All new Cancel/state cases are conditional on Accepted P. Existing tests are seeds/patterns, not claimed passing results. Real PostgreSQL with separate connections and deterministic barriers is mandatory for lock/race/rollback assertions; mock-only tests cannot establish atomicity.

| Group                      | Exact future assertions                                                                                                                                                     | Existing anchor / proposed new test responsibility                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Success/history            | Own CHECKING_IN for Employee and Supervisor; condition incomplete/completed; version+1; same server time/event; no hard delete/child deletion/fake completion/Task          | `complete-check-in-command.integration.test.ts`, condition integration; NEW `cancel-check-in-command.integration.test.ts`                       |
| Wrong lifecycle/CAS        | Every later canonical state denied; stale version denied; terminal duplicate converges only with coherent history; guard zero-row failure emits no audit                    | NEW cancellation guards/retry integration                                                                                                       |
| Authority                  | Foreign tenant/Location/owner, Supervisor other-owner, missing grant/Shift, wrong Shift id, inactive User/member/org/Location, changed/disallowed role, malformed principal | Draft auth harness/custody authorization; NEW cancel HTTP authorization matrix                                                                  |
| Atomic rollback            | Inject audit failure → original CHECKING_IN/version and no event; mutation failure → no audit; COMMIT failure classified unknown if client cannot prove rollback            | Existing transaction executor style; NEW cancellation atomicity fixture                                                                         |
| Concurrency                | Cancel/Cancel, Complete, condition marker/note/photo, Vehicle identity/details, Shift end/grant revoke/status disable; both scheduling winners and rollback branches        | NEW two-connection race tests, extending current complete/condition/Vehicle tests narrowly                                                      |
| Projection/drain           | CANCELLED absent directory and drafts/continuations; later intake same Vehicle works; accepted terminal not a session drain blocker; other Shift/Task still blocks          | Directory employee/cap/integration; `management-location-lifecycle.integration.test.ts`                                                         |
| Audit visibility/privacy   | CA/LM/Supervisor scoped event, Employee/Guest denied; safe state/version details; no raw metadata/PII; unknown event remains safe                                           | Existing management-audit authorization/privacy/projection/supervisor tests                                                                     |
| Migration/runtime role     | Forward upgrade retains prior rows; enum staged safely; exact new indexes/functions; least-privilege runtime can execute/append only intended action; no new broad grants   | `packages/database/src/location-lifecycle-migration.integration.test.ts`, runtime-role/audit/schema tests; NEW cancel migration/invariant tests |
| Compatibility prerequisite | Guest/current-history/financial/incident projections have accepted behavior; terminal denied from Task and later commands; completed recognition/KPI numerator unchanged    | Separately authorized U-005 tests; terminal fixture passes strict allowed consumers                                                             |

Register new PostgreSQL tests in the current owned classification/runtime harness; do not accidentally run them as non-Postgres mocks. Fixture identities distinguish membership from User across Organizations. Assert DB rows/audit counts after losing/rolled-back transaction, not just HTTP status.

## 34. Contract/client test matrix

Conditional on Accepted P:

| Surface                                | Planned proof                                                                                                                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cancel request/response/status schemas | Valid shape; missing/unknown fields rejected; malformed UUID/expectedShiftId/version, negative/fraction/string version rejected; extra actor/state/time/PII rejected; status bounded canonical enum         |
| State compatibility                    | Accepted canonical state parses where appropriate; both terminal directory states rejected; old/v1 schemas remain strict/exact; no cancelled Task or Guest leak from automatic shared enum widening         |
| Targeted resume                        | Selected id exact GET; wrong returned id/Location/state denied; condition marker/Vehicle/version hydrated; no drafts/continuations/intake/startNew; one of many selected correctly                          |
| Transient reset                        | Returning correction, condition noteReplayFence, pending intake/correction/continuation cleared on target replacement; late target A cannot poison B or A→B→A                                               |
| Cancel state/retry                     | Double tap one dispatch; coherent terminal duplicate no extra effect; known error vs post-dispatch unknown; explicit status read; original-version retry requires user; changed version cannot auto-upgrade |
| Generic transport                      | POST never replayed on 401/refresh/reconnect/background; GET uses existing safe recovery only; malformed success becomes unknown if effect may have committed                                               |
| Lifecycle                              | Logout/auth generation/member/org/Location/Shift/role changes purge; same-owner background retains minimal unknown intent; status after lost authority unavailable; process restart no outbox/replay        |
| Request budget                         | Held promise counts for initial/expand/Continue/Cancel/reconcile/return/foreground; coordinator deduplicates directory refresh                                                                              |

Anchors: `employee-check-in-recovery.test.ts`, condition-replay/recovery/continuation tests, `employee-vehicle-directory-session.test.ts`, recovery-policy/client tests. Proposed new focused tests follow current `packages/employee-client/src/*.test.ts` convention; none exists or was added in this run.

## 35. Native test matrix

Conditional integration tests augment existing Native-only assertions:

| Group                  | Required proof                                                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frozen baseline        | Existing Vehicles/row parity tests keep exact style/copy/hierarchy assertions for normal/loading/empty/truncated states; no duplicate rows/section; existing CHECKING_IN badge style unchanged                           |
| Eligibility            | Own CHECKING_IN actions only; Supervisor other's row read-only; other states unchanged; capabilities never bypass exact read/command authority                                                                           |
| Continue               | Exact id read before navigation; multiple drafts do not rediscover; condition-complete flag honored; no intake; late read after logout/scope/background cannot navigate; close and hardware Back return/refresh Vehicles |
| Confirmation           | Cancel initial tap opens existing-style confirmation, no POST; dismiss/back no mutation; confirming/submitting busy disables duplicate actions; accessible controls/focus restoration                                    |
| Outcome                | Success only after committed terminal fact; refresh row disappears; failed refresh distinguished; conflict/current truth; transport unknown/status terminal/retry-eligible/changed/unavailable branches                  |
| Lifecycle              | User/member/grant loss, Shift end/replacement, Location A→B→A, logout/new identity, background at every await and foreground context recovery; no stale toast/list repaint                                               |
| Language/accessibility | EN/AR, RTL/LTR mixed plate/identifiers, text scaling/narrow fit, TalkBack labels/order, keyboard/hardware Back, no rendered ids/version/PII enrichment                                                                   |

Anchors: `apps/valet-native/test/native-vehicles-parity.test.tsx`, `native-vehicle-row-parity.test.tsx`, `native-vehicle-directory-revalidation.test.ts`, Check-In recoverables/continuation/condition tests, shell/back/lifecycle/retirement tests. Element-tree/style tests are static/fixture proof; screenshots and real native interaction remain distinct gates.

## 36. Race/concurrency matrix

Conditional on Accepted P. Linearization is committed guarded session transition (or child's existing committed command), not the initial list/read. All operations recheck while holding session/eligibility locks. If first transaction rolls back, no committed winner is inferred; waiting operation evaluates remaining current facts.

| A / B interleaving                                                    | Unsafe outcome                                        | Existing protection / missing conditional work                                       | Committed/rollback/unknown result                                                                                                                                                     | Owner slice                     |
| --------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Cancel locks v; Complete waits; Cancel commits                        | Both transition/audit                                 | Both session FOR UPDATE; Cancel terminal+v+1; Complete version/state guard           | Cancel wins; Complete rejects, no completion audit. Cancel rollback lets Complete proceed on CHECKING_IN. Lost Cancel response needs status read.                                     | Backend command/race            |
| Complete locks v; Cancel waits; Complete commits                      | Cancel newer AWAITING state                           | Existing Complete lock/v+1; new Cancel rereads                                       | Complete wins; Cancel conflict, no cancellation audit. Complete rollback permits Cancel.                                                                                              | Backend command/race            |
| Cancel A locks; Cancel B waits                                        | Two version increments/events                         | New coherent terminal convergence after repeated authority                           | One event/v+1; B returns terminal no write. A rollback allows B winner; neither network failure proves result.                                                                        | Backend retry/race              |
| Condition/note/photo locks first, commits; Cancel waits               | Claim version covered evidence edits                  | Existing condition session lock; marker doesn't increment v; U-007 semantics needed  | Under P child audit remains, then Cancel may commit same v→v+1. Cancel-first makes child CHECKING_IN guard deny. Rollback leaves no child effect; no false “one total audit”.         | Backend condition compatibility |
| Vehicle correction locks session/Vehicle first, commits; Cancel waits | Cancel based on supposedly immutable reviewed vehicle | Existing session lock + Vehicle expectedUpdatedAt; aggregate v not advanced          | Under P retain corrected Vehicle and its audit, then Cancel may win lifecycle. Reverse order correction denied. Other sessions sharing Vehicle follow existing child-token semantics. | Backend Vehicle compatibility   |
| Hydrate reads; another client cancels before navigation/next command  | Stale UI manufactures new intake                      | Exact-target guard + client revision; current command state/version                  | If cancellation precedes read: deny. If after read: next revalidation/command rejects; no duplicate intake.                                                                           | Client/Native                   |
| Stale page target; state changed before action                        | Row grants mutation/resume                            | Fresh detail before entry/confirmation + command locks                               | Continue rejects changed state; Cancel conflicts; refresh current directory.                                                                                                          | Client/Native/API               |
| Eligibility proof; end/revoke/disable competes                        | Mutation after committed authority loss               | Existing eligibility share locks retained through Cancel; new exactShift check       | Cancel protected commit precedes invalidation, or invalidation first makes Cancel deny. Rollback releases locks, no orphan event.                                                     | Backend authority race          |
| Old Shift ends; new same-Location Shift starts; old tap dispatches    | Old intent authorized by replacement Shift            | Client full owner plus proposed expectedShiftId compare                              | Deny old intent even if membership currently eligible again; fresh action required.                                                                                                   | Contract/Backend/Native         |
| Logout/session revoke after principal resolution                      | Claim stronger server session atomicity than exists   | Client generation purge exists; User-only principal path does not lock exact session | Late result cannot paint; server may already commit. Stronger transaction revocation requirement is U-002 until accepted path/proof.                                                  | Auth boundary decision          |
| Scope A→B→A; old request finishes                                     | Wrong rows/toast/route repaint                        | Directory request counter; new action revision, full owner                           | Old completion discarded even equal final ids; server effects retained only as history.                                                                                               | Client/Native                   |
| Background after POST; response lost                                  | Replay/optimistic success                             | New unknown-state owner + existing coordinator                                       | Same-owner foreground status once; commit/rollback classified by state; lost authority unavailable, no replay.                                                                        | Client/runtime                  |
| Location deactivation competes with cancel                            | Drain sees false work or deadlock assumption          | Existing shared lifecycle lock; forward blocker predicate/index                      | Cancel commit frees only session blocker; other work still blocks. Invalidation-first denies. Exercise actual lock order.                                                             | Database/backend                |

```mermaid
sequenceDiagram
  participant C as Cancel(v)
  participant D as Session row / transaction
  participant F as Complete(v)
  alt Cancel commits first
    C->>D: Authorize, lock CHECKING_IN(v)
    F->>D: Wait for same session lock
    C->>D: CANCELLED(v+1) + cancellation audit, COMMIT
    D-->>F: Current CANCELLED(v+1)
    F->>F: Reject version/state; no completion audit
  else Complete commits first
    F->>D: Authorize, lock CHECKING_IN(v)
    C->>D: Wait for same session lock
    F->>D: AWAITING_PARKING(v+1) + completion audit, COMMIT
    D-->>C: Current AWAITING_PARKING(v+1)
    C->>C: Reject version/state; no cancellation audit
  end
```

This proves at most one valid competing lifecycle transition/audit if P is implemented/tested as specified. It does not forbid independent earlier condition/Vehicle audit events or claim successful physical proof from a diagram.

## 37. Visual regression matrix

Future evidence uses current Native at baseline SHA, never Web captures. Capture matched fixture data, time/locale/font scale/safe area, expanded row, render environment and device dimensions before/after. Existing source/tests do not establish a numeric historical screenshot viewport; retrieve the owner's existing Native phone-width proof dimensions at execution, or explicitly record a fresh Native baseline before changing UI. Do not label a guessed width “current proof”. Add a narrow actual Android device capture and record its measured dimensions/font scale.

| Scene                                                    | EN + AR at current Native phone-width proof | EN + AR narrow physical     | Allowed diff                                                                                 |
| -------------------------------------------------------- | ------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------- |
| Collapsed normal row                                     | Required                                    | Required                    | None                                                                                         |
| Expanded normal row                                      | Required                                    | Required                    | None                                                                                         |
| Collapsed CHECKING_IN                                    | Required                                    | Required                    | None under short-badge recommendation                                                        |
| Expanded eligible CHECKING_IN                            | Required                                    | Required                    | Incomplete explanation/actions only                                                          |
| Expanded other-owner Supervisor CHECKING_IN              | Required                                    | Required                    | None except any explicitly accepted truthful incomplete explanation; no unauthorized buttons |
| Cancel confirmation                                      | Required                                    | Required                    | Existing-pattern sheet with necessary copy/actions                                           |
| Cancel conflict/error/unknown                            | Required                                    | Required                    | Necessary localized action feedback only                                                     |
| Loading/empty/truncated/PARKING/PARKED/other active rows | Required                                    | Representative device cases | None                                                                                         |

Compare title/subtitle, padding 20/gap16/list12, card radius12/border1/white, collapsed16, vehicle15/19 font, badge placement, metadata, summary3/gap20, expanded warm/top4/side16/bottom16, detail12/borders, header/bottom navigation. Freeze same viewport and font metrics; anti-alias noise may be annotated, geometry/style differences cannot be excused. Overlay/pixel comparison must mask only accepted action/copy regions, never entire cards/screen. Any unrelated visual delta fails closure. Fixture proof cannot replace physical clipping/focus/RTL proof.

## 38. Future physical-device proof

Owned by the later Native batch closure gate; no APK/build/device attempt in this planning run. Use current release-envelope workflow under DEC-071/072 and the owner's batch schedule, with exact built SHA/device/app/backend environment recorded.

1. Conditional on Accepted P and the future physical batch gate: eligible employee creates persisted incomplete CHECKING_IN, records exact internal session id in authorized test evidence, leaves existing flow, opens Vehicles: same row/Vehicle, no Task or duplicated panel.
2. Continue from that row among several drafts; API trace proves exact id read/no new intake; persisted condition/Vehicle/version retained; existing current step opens. Leave; Vehicles refreshes.
3. Cancel → confirmation → confirm. No single-tap mutation; row disappears only after committed terminal result and authoritative refresh. Same persisted session remains as terminal history; Management Audit authorized CA/LM/Supervisor shows safe event EN/AR.
4. Background during Continue before/after read; foreground current authority; no late route entry. Background during Cancel before/after dispatch; no repeated POST; reconcile current state.
5. Interrupt network before dispatch, after request arrival, and after commit before response. Exercise rollback/committed outcomes; unknown is truthful; exact status establishes terminal/original-version/changed truth before retry.
6. Competing complete/cancel on second client; logout/identity replacement, Shift end/new Shift, grant loss and Location switch while awaits are held; no stale toast/navigation/rows.
7. EN and AR, narrow device, larger text, TalkBack/hardware Back/focus; matching baseline captures demonstrate UI freeze.

No physical claim until operator-observed evidence is recorded. Authentication bypass, fixture server, element tests, simulation and real API/device runs are separate evidence classes.

## 39. File-by-file implementation map

### Files expected to change

**This run: only this Markdown file.** The following is conditional future scope under Accepted P. NEW paths are suggested boundaries, not claimed existing files. U-005 items require separate explicit prerequisite scope; they are not silently authorized #255 edits.

| Exact path / proposed boundary                                                                                                                                                                                                                      | Future responsibility                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/decisions/DEC-<allocated>_ABANDONED_CHECK_IN_CANCELLATION.md` (NEW)                                                                                                                                                                           | Accepted focused contract after owner review; synchronize log/docs before code                                                                                 |
| `docs/08_DECISIONS_LOG.md`, `docs/04_VALET_SESSION_STATE_MACHINE.md`, `docs/03_DATABASE_SCHEMA.md`, `docs/02_DOMAIN_MODEL.md`, `docs/06_SECURITY_AND_DATA_RULES.md`, `docs/12_AGENT_EXECUTION_PLAN.md`, `docs/20_EMPLOYEE_NATIVE_EXECUTION_PLAN.md` | Canonical decision, terminal/authority/retention/schema/API/evidence updates; high-contention ownership explicit                                               |
| `packages/database/prisma/schema.prisma`, NEW forward migration directories, `packages/database/src/migration-manifest.ts`                                                                                                                          | Conditional on Accepted P: enum, accepted checks, active index and Location function/index; staged deployment tests                                            |
| `packages/contracts/src/cancel-check-in.ts` (NEW), `packages/contracts/src/index.ts`                                                                                                                                                                | Conditional on Accepted P: strict action/status request/responses, exports                                                                                     |
| `packages/contracts/src/staff-valet-session.ts`, `staff-vehicle-directory.ts`, `management-audit-events.ts`                                                                                                                                         | Canonical state, both terminal exclusions/negotiated action hints, known audit type                                                                            |
| `apps/api/src/modules/valet-sessions/cancel-check-in-command.ts`, `cancel-check-in-authorization.ts`, `cancel-check-in-status-query.ts`, `cancel-check-in-audit.ts` (NEW)                                                                           | Conditional on Accepted P: focused explicit transaction, shared self/Shift proof, minimal outcome read, safe event definition; split SQL/types if near ceiling |
| `apps/api/src/modules/check-in-api/cancel-check-in.controller.ts` (NEW), `check-in-api.service.ts`, `check-in.module.ts`                                                                                                                            | Conditional on Accepted P: sibling thin routes/dispatch/provider/middleware wiring; reuse runner/principal parsing                                             |
| `apps/api/src/common/http/api-errors.ts`                                                                                                                                                                                                            | Only if final accepted error vocabulary adds a code; existing candidate mappings already exist                                                                 |
| `apps/api/src/modules/staff/staff-valet-session.controller.ts`, `staff-vehicle-directory.service.ts`, `staff-vehicle-directory.queries.ts`                                                                                                          | Negotiation/hints and terminal query; extraction before growing 293-line service; preserve old schemas/masking/cap                                             |
| `apps/api/src/modules/valet-sessions/protected-custody-command.ts`                                                                                                                                                                                  | Canonical type compatibility only; do not change other command required-state policies                                                                         |
| `apps/api/src/modules/vehicles/vehicle-identity-command.ts`                                                                                                                                                                                         | Active competing-session predicate; focused extraction before enlarging legacy 504-line command                                                                |
| `apps/api/src/modules/management/management-location-projection.ts`                                                                                                                                                                                 | Drain projection agrees with forward DB function/index                                                                                                         |
| `apps/api/src/modules/dashboard/physical-resource-query.ts`, `overview-shifts-keys-incidents-query.ts`                                                                                                                                              | Narrow backend active-context predicate compatibility, no Dashboard UI changes                                                                                 |
| `apps/api/src/modules/management/management-audit-event-catalog.ts`, `management-audit-detail-projection.ts`                                                                                                                                        | Explicit known/family/Supervisor/safe-state allowlists                                                                                                         |
| `apps/dashboard/src/features/audit/audit-event-copy.ts`, `audit-detail-values.ts`                                                                                                                                                                   | Only required EN/AR event and Audit-local terminal-state label; generic renderer/layout untouched                                                              |
| `packages/employee-client/src/employee-check-in-session-core.ts`, `employee-check-in-session.ts`, `employee-check-in-condition-session.ts`, `employee-check-in-types.ts`, `employee-check-in-discovery.ts`                                          | Targeted entry and focused extraction/retirement hooks, same hydration/owner chain; preserve normal recovery                                                   |
| `packages/employee-client/src/employee-check-in-target-hydration.ts` (NEW)                                                                                                                                                                          | Conditional on Accepted P: exact-target hydration/expected CHECKING_IN helper, not second state machine                                                        |
| `packages/employee-client/src/employee-check-in-cancel-{types,transport,session}.ts` (NEW proposed set), `src/index.ts`                                                                                                                             | Conditional on Accepted P: bounded transient protected operation/unknown reconciliation; no generic client mutation replay change                              |
| `apps/valet-native/src/vehicles/native-vehicles-screen.tsx`, `native-vehicle-row.tsx`, `native-vehicles-copy.ts`                                                                                                                                    | Pass minimum action props/expanded affordance/typed copy; preserve frozen styles                                                                               |
| `apps/valet-native/src/vehicles/native-check-in-row-actions.tsx`, `native-check-in-cancel-confirmation.tsx`, `native-vehicles-check-in-actions.ts` (NEW)                                                                                            | Conditional on Accepted P: minimum action UI, existing modal pattern, owner-safe adapter; no top-level panel                                                   |
| `apps/valet-native/src/i18n/native-dictionary-en-vehicles.ts`, `native-dictionary-ar-vehicles.ts`                                                                                                                                                   | Conditional on Accepted P: minimum new localized keys; existing composed dictionary type/locale behavior                                                       |
| `apps/valet-native/src/auth/native-auth-runtime.ts`, NEW focused action factory                                                                                                                                                                     | Conditional on Accepted P: runtime construction/purge/dispose split below ceiling                                                                              |
| `apps/valet-native/src/shell/native-production-workspace.tsx`, `native-check-in-route.tsx`, `production-shell-controller.ts`, `native-production-back-handler.ts`, `native-production-lifecycle-owner.ts`, `native-workflow-scope-retirement.ts`    | Exact prepared route/return origin, background/unknown/current-scope integration; extraction before near-limit additions                                       |
| Existing focused tests named in §§33–35; NEW cancellation/targeted-entry tests                                                                                                                                                                      | Domain/concurrency/rollback/contracts/request counts/generation/visual assertions; current harness registration                                                |
| `scripts/test-harness/test-classification.mjs`                                                                                                                                                                                                      | Future classification registration if new integration names are not already detected; no package/lockfile dependency addition                                  |

Separately owned U-005 compatibility map: `packages/contracts/src/management-visit-contacts.ts` + API `management-visit-contact-history-query.ts`; `packages/contracts/src/check-in.ts` + API `valet-sessions/guest-safe-session.ts`, `guest-access-command.ts`; API `incidents/incident-creation-authorization.ts` + Native `incident/native-incident-session.ts`; API `dashboard/overview-financial-query.ts`, `overview-sessions-query.ts` + contracts `location-overview.ts`. These require accepted consumer behavior/owner before terminal shipping. No additional Dashboard UI files were inspected or invented. If a required consumer change conflicts with scope, report and complete the prerequisite separately; do not implement a partial enum rollout.

No expected change to Employee Web, Guest workflow screens, OCR, photo policy, Tasks/Dispatch/parking/retrieval behavior, shared tokens or Vehicles row styles. Existing positive-state queries/guards in section 15 receive focused regression proof rather than unrelated edits.

## 40. 300-line structure plan

Measured physical lines at baseline (including comments/blanks; docs are exempt):

| Existing target                                                |           Lines | Future constraint                                                                                                     |
| -------------------------------------------------------------- | --------------: | --------------------------------------------------------------------------------------------------------------------- |
| Native Vehicles screen / row / row styles                      |  168 / 198 / 78 | Keep styles exact; action/confirmation/adapter separate                                                               |
| Native production workspace / production shell                 |       288 / 279 | Delegate Vehicles action wiring; do not grow into a god shell                                                         |
| Native auth runtime / lifecycle owner                          |       296 / 211 | Extract scoped action factory before wiring; bounded reconciliation branch                                            |
| Employee Check-In core / session                               |       298 / 261 | Extract targeted hydration/retirement before additions                                                                |
| Employee condition / correction session                        |       299 / 296 | Shared retirement hook through focused extraction; no append to ceiling                                               |
| Staff session / directory contracts                            |       138 / 146 | New cancellation schemas separate; negotiated directory schema explicit                                               |
| Check-In controller / API service                              |       304 / 126 | Existing controller already oversized; new sibling routes, do not append                                              |
| Complete / condition / identity commands                       | 350 / 874 / 504 | Legacy oversized; avoid unrelated changes; any necessary task-related edits require focused extraction and non-growth |
| Directory service / queries                                    |       293 / 233 | Extract role projection/capability responsibility before service growth; query stays focused                          |
| Audit detail projection / Dashboard audit copy / detail values | 272 / 247 / 100 | Narrow mapping only; split CHECK_IN projection if addition approaches limit                                           |

New authored files target comfortably below 300, with one responsibility: public schema, authority guard, transaction executor, outcome query, safe event, transport, operation owner, targeted hydrate, row actions, confirmation or Native adapter. Do not compress formatting, offload arbitrary fragments or introduce generic helpers to evade the ceiling. Re-measure before implementation against fresh baseline; repository architecture check remains a future gate. Existing oversized files are a structural risk, not authority to expand them.

## 41. Migration/index/query impact checklist

Conditional on Accepted P, every checkbox is a future gate, not completion evidence:

- [ ] Accepted enum and integrity contract reflected in schema docs/Prisma; separate enum-commit stage where deployment requires it.
- [ ] New migration only; no edits to migration 005/019/040 or other historical files.
- [ ] Replace `valet_sessions_active_location_vehicle_key` predicate; retain state-independent `valet_sessions_parking_spot_id_key` / `valet_sessions_key_slot_id_key`.
- [ ] Replace `valet_sessions_location_id_non_completed_idx` predicate and `public.management_location_has_blockers`; API management-location projection agrees.
- [ ] Directory query/schema excludes both terminals; drafts/continuations positive predicates regression-tested.
- [ ] Vehicle identity competing-session query excludes terminal; repeat intake same Vehicle works while history retained.
- [ ] Physical-resource/keys active-context predicates corrected without weakening current-assignment integrity.
- [ ] Financial/overview count semantics accepted under U-005, not generic search-and-replace of COMPLETED.
- [ ] Management known event/family/Supervisor/detail allowlists + narrow Audit labels support terminal safely.
- [ ] Guest token/type, visit-history schema and incident/post-terminal command compatibility separately owned/resolved before terminal can appear.
- [ ] No cancelled session creates/enters Task queue, parking, retrieval, Guest rating or completion recognition.
- [ ] CompletedAt/actual completion KPIs and prior action/condition/financial evidence remain truthful.
- [ ] Upgrade and fresh DB tests with actual runtime role, permissions, FKs, constraints, query plans and audit rollback; least privilege only, no privilege fix by broad grants.
- [ ] Strict older binaries remain compatible with active directory; no extra unknown keys without negotiated capability.

## 42. Documentation/DEC updates required before coding

Accept/reconcile U-001–U-007 first. Write allocated focused abandonment DEC and synchronize `docs/08_DECISIONS_LOG.md`; replace state-machine abandonment prohibition only with the accepted new contract. Update domain/schema/security/API docs and Native plan with terminal meaning, exact self/Shift authority, captured Shift rule, status visibility, aggregate-vs-child CAS, retry/audit/error/capability semantics and cross-consumer owners. Preserve superseded historical decisions as history; no retroactive rewrite disguising authority changes.

High-contention decision log/schema/state/domain/Prisma/migrations require explicit single ownership; no concurrent edits. Separately resolve Guest/visit-history/financial/incident dependencies within approved scope before enabling cancellation. If a new config policy is requested, stop for typed Company-default→Location-override decision; #255 itself introduces no config key, automatic expiry or Location cleanup policy.

## 43. Explicit out-of-scope list

### Explicitly out of scope

Employee Web inspection/implementation; fake Tasks/Tasks queue representation/Dispatch assignment; parking/retrieval/handoff changes; Guest Access feature changes; OCR/ANPR changes; condition-photo #215; Dark Theme #253; torch #226; header/logo; Dashboard redesign or non-Audit UI work; generic vehicle management; bulk cancellation; supervisor mass cleanup/other-owner override; auto-expiration/scheduled cleanup; hard delete; new retention program; background sync/outbox; second session state machine; payment/refund/incident workflow changes; new dependency/package/lockfile infrastructure.

Required terminal compatibility outside this boundary is an explicit U-005 prerequisite, not an exception silently granted by this list. Nothing in this planning-only run changes those surfaces.

## 44. Ordered implementation sequence

All coding slices are conditional on Accepted P and resolved dependencies; sizes are indicative, not permission to execute now.

| Order | Slice                                                                    | Entry/exit gate                                                                                                                     |
| ----- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| S0    | Focused DEC/docs + consumer ownership (M)                                | Owner acceptance of all U-items; reconcile log/state/schema; freeze final scope                                                     |
| S1    | Terminal foundation + separately owned compatibility prerequisites (M/L) | Forward migrations, canonical contracts, active predicates/drain and all exposed-consumer compatibility validated; no action UI yet |
| S2    | Dedicated Cancel/status authority/transaction/audit (M)                  | Real PostgreSQL success/denial/race/rollback/runtime-role proof; no second event or unsafe stale transition                         |
| S3    | Management Audit pipeline/narrow labels (S)                              | Role-safe typed event and EN/AR state label; existing surface only                                                                  |
| S4    | Portable exact-target Continue + cancel operation owner (M)              | Existing hydrate/retirement preserved; no discovery/intake/replay; strict outcome and request-budget tests                          |
| S5    | Native expanded-row actions + runtime/navigation/lifecycle (M)           | UI freeze assertions, current owner, confirmation, unknown/background/return refresh; no additional list/Task                       |
| S6    | Focused regression and visual acceptance (M)                             | Before/after matrix, conflicts/authority loss/request counts; no unrelated visual delta                                             |
| S7    | Native batch Android/physical closure (batch-owned)                      | Actual built SHA/device/API/Audit evidence, EN/AR, network/lifecycle scenarios; deferred until owner batch gate                     |

Continue may be implemented as an independently authorized later slice before Cancel if owner explicitly accepts that sequencing; this task authorizes no code. Do not expose a disabled/fake Cancel implying accepted semantics or ship terminal foundation without compatible consumers.

## 45. Validation/closure gates

Planning closure: exactly one Markdown diff; valid section order and diagrams; exact source/line measurements checked; no invented Accepted DEC; explicit frozen UI and decision prerequisite; saved-plan guardian audit and whitespace review; commit/push exact branch; clean final working tree. Product tests are not run to imply an unimplemented feature passed.

Saved-plan audit v1.5 was executed and its remaining mechanism flags reviewed: the heuristic reads a Mermaid lock label outside its conditional caption and groups a LOCKED heading with later repository facts. The binding properties are authority-before-mutation and atomicity; SQL locking mechanisms are code-derived proposals conditional on P, not an Accepted cancellation lock contract. These heuristic flags do not establish acceptance or runtime correctness.

Future implementation closure requires appropriate current owned tests for `@valet/contracts`, `@valet/employee-client`, `@valet/valet-native`, API and database, real PostgreSQL race/upgrade suites, lint/typecheck, `pnpm architecture:check`, configured build and repository CI per DoD. Current scripts distinguish `test:non-postgres`, `test:postgres:api`, `test:postgres:database`, package tests and verification/production build; use configured current runners and register fixtures, not guessed standalone database commands. Typecheck is not lint. A configured CI file is not a passing remote CI run.

Record each gate as STATIC VERIFIED, LOCAL COMMAND VERIFIED, RUNTIME VERIFIED, FAILURE-PATH VERIFIED, CI VERIFIED or PHYSICAL VERIFIED with exact SHA/environment. This plan currently establishes source inspection/static planning evidence only. No migration deployment, test pass, visual capture, physical acceptance, CI or production result is claimed. Do not mark implementation complete while required tests fail or U-005 compatibility is missing; report unrelated baseline failures honestly without fixing excluded work.

## 46. Unresolved questions

| ID    | Owner response required before code                                                                                                                                                                                 | Consequence if unanswered                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| U-001 | Accept terminal CANCELLED and exact no-custody unfinished invariant, retained history and non-completion reporting meaning?                                                                                         | No terminal/schema/migration/cancel command.                                      |
| U-002 | Accept self-owned both roles, current full eligibility, expectedShiftId comparison and no revoked-scope cleanup? Require transaction-level exact Staff-session revocation fencing beyond current principal pattern? | Authority/lock/request contract cannot be frozen.                                 |
| U-003 | Accept current-state convergence and minimal status read under current same-owner eligibility without operationId?                                                                                                  | Retry/unknown-outcome persistence/read shape remains blocked.                     |
| U-004 | Accept final proposed route/schema/error precedence/event/family/Supervisor visibility, or supply alternatives?                                                                                                     | No final runtime contract or audit catalog.                                       |
| U-005 | Who owns Guest/visit-history/financial/incident compatibility prerequisites, and what terminal/financial/count semantics are accepted without widening #255?                                                        | Terminal cannot safely ship; do not bypass the Guest/outside-Audit UI exclusions. |
| U-006 | Accept negotiated minimal action hints and current capped coverage, or require separately scoped access to omitted owned drafts?                                                                                    | Cannot truthfully promise all drafts/actions under Supervisor visibility and cap. |
| U-007 | Accept lifecycle-only version CAS, allowing earlier condition/Vehicle edits retained under serialized cancellation, or require a reviewed-child snapshot contract?                                                  | No false stale-write guarantee; concurrency semantics must be resolved.           |

Non-material choices resolved from source: directory owns list, exact detail owns hydrate; no second list/state machine/Task; existing route/components/tokens; shared strict contracts; sibling controller; custody writer supports scope; explicit allowlists/narrow labels; no automatic POST replay; no speculative cancellation actor/time column for P. Exact screenshot viewport must be established at future capture, but is not a domain decision or excuse to change frozen UI.

## 47. Final planning verdict

### Ready-to-implement verdict

**DECISION REQUIRED**

The plan is ready for owner decision review; implementation remains conditional on U-001–U-007 being resolved through an Accepted decision. It is not authority to implement cancellation. The critical blocker is the explicit abandoned Check-In rule and absent Accepted terminal contract. Recommendation is terminal CANCELLED with exact self-owned/Shift/version/atomic audit/current-status convergence and separately owned compatibility prerequisites.

UI freeze is enforceable: current Native Vehicles composition and measured style values remain unchanged; only necessary incomplete-work explanation/actions in the existing affected expanded row and current-pattern confirmation/feedback are allowed. No new top-level list, duplicate session, Task, Check-In redesign, shell redesign or Dashboard redesign.

This branch changes only this planning document. No implementation, migration, contracts, copy, tests, package, lockfile, APK, PR or merge is part of this task. Commit/push evidence is reported after the document-only final review; the plan itself does not claim runtime or physical completion.
