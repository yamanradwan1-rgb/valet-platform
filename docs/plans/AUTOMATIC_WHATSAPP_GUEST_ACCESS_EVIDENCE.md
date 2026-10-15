# Automatic WhatsApp Guest Access — Evidence Appendix

Baseline: 53e9be1ab3a6f0e1411df30952287d0135e6d189. Inspected 2026-10-15; no runtime database or application suite executed during planning.
Protected manifest entries: 2174. Manifest blob IDs are Git content identities, not filesystem SHA256 checksums.

## Function and contract anchors

- `apps/api/src/modules/check-in-api/check-in-api.controller.ts:50` — `@Controller("v1/staff/check-in")`
- `apps/api/src/modules/check-in-api/check-in-api.controller.ts:66` — `@Post("intakes")`
- `apps/api/src/modules/check-in-api/check-in-api.controller.ts:67` — `async createIntake(`
- `apps/api/src/modules/guest-push/guest-push-delivery-worker.ts:26` — `const retryable = new Set([`
- `apps/api/src/modules/guest-push/guest-push-delivery-worker.ts:47` — `async runOnce(): Promise<boolean> {`
- `apps/api/src/modules/valet-sessions/guest-access-command.ts:268` — `export function createIssueGuestAccessCommandExecutor(`
- `apps/api/src/modules/valet-sessions/guest-access-command.ts:284` — `const isDisabledPlaceholder =`
- `apps/api/src/modules/valet-sessions/guest-access-command.ts:294` — `!isDisabledPlaceholder &&`
- `apps/api/src/modules/valet-sessions/guest-access-command.ts:297` — `(isDisabledPlaceholder || !isRevoked || !expectedRevocationMatches))`
- `apps/api/src/modules/valet-sessions/guest-access-command.ts:302` — `const mutationKind = isDisabledPlaceholder ? "ISSUED" : "ROTATED";`
- `apps/api/src/modules/valet-sessions/guest-access-command.ts:314` — `const nextGeneration = isDisabledPlaceholder`
- `apps/api/src/modules/valet-sessions/guest-access-command.ts:332` — `nextGeneration,`
- `apps/api/src/modules/valet-sessions/guest-access-command.ts:380` — `export function createRevokeGuestAccessCommandExecutor(`
- `apps/api/src/modules/valet-sessions/guest-access-command.ts:402` — `const nextGeneration = scope.customer_access_generation + 1;`
- `apps/api/src/modules/valet-sessions/guest-access-command.ts:410` — `[scope.valet_session_id, operationTime, nextGeneration],`
- `apps/api/src/modules/valet-sessions/guest-access-token.ts:3` — `export const guestAccessContract = {`
- `apps/api/src/modules/valet-sessions/guest-access-token.ts:5` — `lifetimeMilliseconds: 24 * 60 * 60 * 1_000,`
- `apps/api/src/modules/valet-sessions/guest-access-token.ts:34` — `export function hashGuestAccessToken(rawToken: string): string {`
- `apps/api/src/modules/valet-sessions/intake-customer-resolution.ts:12` — `async function resolveSavedCustomer(`
- `apps/api/src/modules/valet-sessions/intake-customer-resolution.ts:36` — `FOR UPDATE,`
- `apps/api/src/modules/valet-sessions/intake-customer-resolution.ts:61` — `async function resolveDifferentCustomer(`
- `apps/api/src/modules/valet-sessions/intake-customer-resolution.ts:104` — `export async function resolveIntakeCustomer(`
- `apps/api/src/modules/valet-sessions/intake-session-command.ts:22` — `loadExistingIntakeOperation,`
- `apps/api/src/modules/valet-sessions/intake-session-command.ts:48` — `async function executeOnce(`
- `apps/api/src/modules/valet-sessions/intake-session-command.ts:55` — `await transaction.query("BEGIN ISOLATION LEVEL SERIALIZABLE");`
- `apps/api/src/modules/valet-sessions/intake-session-command.ts:74` — `SELECT pg_advisory_xact_lock(hashtextextended($1, 0)),`
- `apps/api/src/modules/valet-sessions/intake-session-command.ts:77` — `const existing = await loadExistingIntakeOperation(`
- `apps/api/src/modules/valet-sessions/intake-session-command.ts:133` — `export function createIntakeSessionCommandExecutor(`
- `apps/api/src/modules/valet-sessions/intake-session-persistence.ts:27` — `export async function loadExistingIntakeOperation(`
- `apps/api/src/modules/valet-sessions/intake-session-persistence.ts:54` — `export function intakeResultFromRow(`
- `apps/api/src/modules/valet-sessions/intake-session-persistence.ts:73` — `export async function insertIntakeSession(`
- `apps/api/src/modules/valet-sessions/intake-session-persistence.ts:89` — `const guestHash = disabled:intake:${createHash("sha256")`
- `apps/api/src/modules/valet-sessions/intake-session-persistence.ts:146` — `INSERT INTO intake_operations`
- `apps/valet-native/src/check-in/native-check-in-workflow.tsx:57` — `export function NativeCheckInWorkflow({`
- `apps/valet-native/src/check-in/native-check-in-workflow.tsx:206` — `function renderStep(`
- `docs/06_SECURITY_AND_DATA_RULES.md:329` — `exact raw UTF-8 token string; no raw, reversible or encrypted token copy is`
- `docs/06_SECURITY_AND_DATA_RULES.md:330` — `persisted. Its 24-hour expiry remains the bootstrap/staged-legacy boundary and`
- `docs/06_SECURITY_AND_DATA_RULES.md:893` — `Country/client-specific data residency, messaging consent and local legal requirements require local review before commercial launch.`
- `packages/database/prisma/schema.prisma:344` — `enum NotificationChannel {`
- `packages/database/prisma/schema.prisma:352` — `enum NotificationStatus {`
- `packages/database/prisma/schema.prisma:914` — `model Customer {`
- `packages/database/prisma/schema.prisma:1352` — `model IntakeOperation {`
- `packages/database/prisma/schema.prisma:1800` — `model Notification {`
- `packages/database/prisma/schema.prisma:1941` — `model GuestPushIntent {`
- `packages/database/prisma/schema.prisma:1964` — `model GuestPushDelivery {`
- `packages/employee-client/src/employee-check-in-intake-snapshot.ts:6` — `export function checkInIntakeSnapshot(`
- `packages/employee-client/src/employee-check-in-intake-snapshot.ts:16` — `...continuationForSession(active, "select-condition"),`
- `packages/employee-client/src/employee-check-in-session-core.ts:42` — `activate(`
- `packages/employee-client/src/employee-check-in-session-core.ts:66` — `suspendForBackground(): void {`
- `packages/employee-client/src/employee-check-in-session-core.ts:107` — `retryIntake(): Promise<void> {`
- `packages/employee-client/src/employee-check-in-session-core.ts:118` — `recoverAmbiguous(): Promise<void> {`
- `packages/employee-client/src/employee-check-in-session-core.ts:127` — `async openExistingCheckIn(`
- `packages/employee-client/src/employee-check-in-session-core.ts:191` — `private async discover(ambiguousRecovery: boolean): Promise<void> {`
- `packages/employee-client/src/employee-check-in-session.ts:188` — `useSavedCustomer(): Promise<void> {`
- `packages/employee-client/src/employee-check-in-session.ts:203` — `submitCustomer(): Promise<void> {`
- `packages/employee-client/src/employee-check-in-session.ts:215` — `private async submit(customer: IntakeRequest["customer"]): Promise<void> {`

## Authoritative document inventory

Inventory establishes availability and pinned content, not a claim that every unrelated paragraph was audited. Task-relevant sections and focused decisions are analyzed in the master plan.

| Path | Baseline blob |
|---|---|
| `AGENTS.md` | `0e03402f521671362302b2f3034668ef346faf91` |
| `CONTRIBUTING.md` | `760a456c36cb80fbd4fb823aa20314fc3f3ad54b` |
| `README.md` | `d14bfda3535ec5c6cdcd4ddd75a5b4d786186c71` |
| `docs/00_SOURCE_OF_TRUTH.md` | `c075736ad31de15e9b5c37467e5dc5f83b67cac3` |
| `docs/01_PRODUCT_SCOPE.md` | `804e2e0987082450097400afe14bc275f49b7843` |
| `docs/02_DOMAIN_MODEL.md` | `55ea04e9f6cf15ad876fde906a45892882921639` |
| `docs/03_DATABASE_SCHEMA.md` | `887f967f36e416bf71eaa4ba2b87bdd227b4f008` |
| `docs/04_VALET_SESSION_STATE_MACHINE.md` | `50959c6eceab50ed24008ebf3e985f55bf2d0898` |
| `docs/05_ENGINEERING_RULES.md` | `5f77d4f2d3920047d820fe9b457f55ceb4f188d9` |
| `docs/06_SECURITY_AND_DATA_RULES.md` | `3cb367a4d13889e26cab7e5511df1de256b9cf22` |
| `docs/07_DEFINITION_OF_DONE.md` | `99214df7afcfdee81a9b661388cb89b1929f50d4` |
| `docs/08_DECISIONS_LOG.md` | `7be4f9026028006148b4018596555f49f6ad3534` |
| `docs/09_TECH_STACK.md` | `bf262bd97828816697d6970dc139f076457a5ae5` |
| `docs/10_REPOSITORY_STRUCTURE.md` | `1b29b66b66bc030a077b082ea15b6ab573fc477a` |
| `docs/11_REQUIREMENTS_TRACEABILITY.md` | `72bce305705833faec6bf32db5fd9b90ddaa536f` |
| `docs/12_AGENT_EXECUTION_PLAN.md` | `8c5940ea5822c0cc86c5e301f3f00bcc6cd02b27` |
| `docs/13_COLLABORATION_WORKFLOW.md` | `91e3685af4857f63a61399fba4bd63a0e5375046` |
| `docs/14_PROJECT_STATUS.md` | `6945c53187cd0c91ddfe47b062c93dd7b96c9b9b` |
| `docs/15_BLUEPRINT_V1_REBASELINE.md` | `7f70ecad0b5782034772ab106d5c2e2446be76f3` |
| `docs/16_PRODUCTION_DATABASE_DEPLOYMENT_CHECKLIST.md` | `919e72bfd318d934c369801a89f7e151582aba23` |
| `docs/17_AGENT_CODE_STRUCTURE_RULES.md` | `92e10e0fccb0ff3069369c760b0a893de2523b3e` |
| `docs/decisions/DEC-024_SHARED_DURABLE_ANTI_ABUSE.md` | `e5f9e2a619761307c81d15d1c04a438aa1cf232f` |
| `docs/decisions/DEC-025_PRODUCTION_DATABASE_CONNECTION_HARDENING.md` | `2fdde065c522b3e67844f0e0541517bbb5f9200e` |
| `docs/decisions/DEC-026_SHARED_API_INFRASTRUCTURE_OWNERSHIP.md` | `aa958174228abc4a5f7159ed84af7efda468c0a3` |
| `docs/decisions/DEC-027_FEATURE_MODULE_OWNERSHIP.md` | `c6b82456e05a9aa99e00521b7b49af604e152c51` |
| `docs/decisions/DEC-028_ARCHITECTURE_GUARD.md` | `0ecc47d3c61337f7b4fc8968980f5f77e7efe2b4` |
| `docs/decisions/DEC-030_AGENT_CODE_STRUCTURE_LIMITS.md` | `03e474594bb0e870765d20075e1dab48f1464869` |
| `docs/decisions/DEC-063_EMPLOYEE_OFFLINE_OPERATION_POLICY.md` | `f2b476f0f53243207eaf2f4666d2f2e194d4144a` |
| `docs/decisions/DEC-064_GUEST_BROWSER_ENTRY_TRANSPORT.md` | `a0a967603c7b131c8bcbd54befa9a2de145b2386` |
| `docs/decisions/DEC-069_RETURNING_CHECK_IN_RECOGNITION.md` | `56c5f6f0a64cb90319750048dcb1e837c43bf7c6` |
| `docs/decisions/DEC-070_RETRIEVAL_NOTIFICATION_MVP.md` | `c79def4353fd8e048acbbfe91b5d9e738cafaaa6` |
| `docs/decisions/DEC-073_NATIVE_PUSH_ARCHITECTURE.md` | `98e2151e319ef42c6a8efb0f65f7f6260b4e860f` |
| `docs/decisions/DEC-075_STAFF_PUSH_OPERATIONAL_POLICY.md` | `32d20209ab52c3f0c2fe8f00988563cdedcb092e` |
| `docs/decisions/DEC-076_STALE_STAFF_PUSH_REGISTRATION_LIFECYCLE.md` | `92ab1cfd4ab99a4f270c63ca1def34f5106c6d88` |
| `docs/decisions/DEC-084_MANAGEMENT_VISIT_CONTACTS.md` | `09703459262905460b733039e6b81206115412c6` |
| `docs/decisions/DEC-087_READ_ONLY_INTEGRATIONS.md` | `f307a24846737fdf8f526d9ebd40e08a4c307b42` |
| `docs/decisions/DEC-091_GUEST_RATING_AND_RETURNING_CONTACT.md` | `10219c2a529e2d5b78b07d837c9646557480a318` |
| `docs/decisions/DEC-097_INCOMPLETE_CHECK_IN_CANCELLATION.md` | `0be812e3fd4fe23f7070d983aaa1700504452978` |
| `docs/decisions/DEC-098_PRE_CUSTODY_PARKING_CANCELLATION.md` | `f10de0f716b5071ed9da773ae6c20fde82bd91a3` |
| `docs/decisions/DEC-101_GUEST_WEB_PUSH_V1_AND_PILOT_UI_ACTIVATION.md` | `b39e0f1c6e7d906d36c43e253ee78fdf77497edd` |
| `docs/decisions/DEC-104_VERIFIED_CONDITION_PHOTO_BYTE_EVIDENCE.md` | `57085100a233affc22e315448cebdae97f549cbb` |

## Migration inventory

- `packages/database/prisma/migrations/20260808000100_tenant_staff_foundation/migration.sql`
- `packages/database/prisma/migrations/20260808000200_blueprint_location_and_supervisor/migration.sql`
- `packages/database/prisma/migrations/20260808000300_customer_vehicle_foundation/migration.sql`
- `packages/database/prisma/migrations/20260808000400_parking_spot_key_slot_foundation/migration.sql`
- `packages/database/prisma/migrations/20260808000500_valet_session_foundation/migration.sql`
- `packages/database/prisma/migrations/20260808000600_restore_valet_session_query_indexes/migration.sql`
- `packages/database/prisma/migrations/20260808000700_audit_event_foundation/migration.sql`
- `packages/database/prisma/migrations/20260808000800_retrieval_request_foundation/migration.sql`
- `packages/database/prisma/migrations/20260808000900_handoff_verification_foundation/migration.sql`
- `packages/database/prisma/migrations/20260809001000_payment_validation_tip_foundation/migration.sql`
- `packages/database/prisma/migrations/20260809001100_cash_entry_provider_event_foundation/migration.sql`
- `packages/database/prisma/migrations/20260809001200_refund_foundation/migration.sql`
- `packages/database/prisma/migrations/20260809001300_incident_foundation/migration.sql`
- `packages/database/prisma/migrations/20260809001400_notification_foundation/migration.sql`
- `packages/database/prisma/migrations/20260809001500_check_in_intake_persistence/migration.sql`
- `packages/database/prisma/migrations/20260810001600_intake_session_creation/migration.sql`
- `packages/database/prisma/migrations/20260810001700_staff_authentication/migration.sql`
- `packages/database/prisma/migrations/20260810001800_shared_durable_anti_abuse/migration.sql`
- `packages/database/prisma/migrations/20260811001900_phase3_key_parking_persistence/migration.sql`
- `packages/database/prisma/migrations/20260812002000_phase3_task_dispatch_persistence/migration.sql`
- `packages/database/prisma/migrations/20260813002100_guest_retrieval_requester_consistency/migration.sql`
- `packages/database/prisma/migrations/20260813002200_secure_handoff_policy_and_anti_abuse/migration.sql`
- `packages/database/prisma/migrations/20260814002300_phase5_maps_tracking_persistence/migration.sql`
- `packages/database/prisma/migrations/20260814002400_phase5_map_setup_write_authority/migration.sql`
- `packages/database/prisma/migrations/20260815002500_phase5_raw_gps_retention_cleanup/migration.sql`
- `packages/database/prisma/migrations/20260815002600_phase6_financial_policy_payment_core/migration.sql`
- `packages/database/prisma/migrations/20260816002700_phase6_cash_reconciliation/migration.sql`
- `packages/database/prisma/migrations/20260816002800_phase6_payment_collection_operation/migration.sql`
- `packages/database/prisma/migrations/20260822002900_phase7_location_configuration_authority/migration.sql`
- `packages/database/prisma/migrations/20260822003000_phase7_basic_branding_subscription_entitlements/migration.sql`
- `packages/database/prisma/migrations/20260823003100_phase7_basic_branding_hardening/migration.sql`
- `packages/database/prisma/migrations/20260910003200_mob_020a_staff_push_persistence/migration.sql`
- `packages/database/prisma/migrations/20260911003300_mob_020d_staff_push_cleanup/migration.sql`
- `packages/database/prisma/migrations/20260912003400_mob_023b_incident_recovery_intents/migration.sql`
- `packages/database/prisma/migrations/20260916003500_mgt_be_01_audit_foundation/migration.sql`
- `packages/database/prisma/migrations/20260916003600_mgt_be_02_complete_mfa/migration.sql`
- `packages/database/prisma/migrations/20260916003700_mgt_be_04_staff_roles_access/migration.sql`
- `packages/database/prisma/migrations/20260916003800_mgt_be_05_company_settings_branding/migration.sql`
- `packages/database/prisma/migrations/20260917003900_mgt_be_06_management_audit_log/migration.sql`
- `packages/database/prisma/migrations/20260917004000_mgt_be_07_location_management/migration.sql`
- `packages/database/prisma/migrations/20260917004100_mgt_be_08_visit_contacts/migration.sql`
- `packages/database/prisma/migrations/20260917004200_mgt_be_09_guest_rating/migration.sql`
- `packages/database/prisma/migrations/20260917004300_mgt_be_10_kpi_analytics/migration.sql`
- `packages/database/prisma/migrations/20260918004400_mgt_be_11_all_locations_reports/migration.sql`
- `packages/database/prisma/migrations/20260919004500_mgt_fix_02_pagination_snapshot_membership/migration.sql`
- `packages/database/prisma/migrations/20260929004600_mgt_232_physical_resource_creation/migration.sql`
- `packages/database/prisma/migrations/20260929004700_map_setup_client_cas/migration.sql`
- `packages/database/prisma/migrations/20261001004800_mgt_236_parking_zone_creation/migration.sql`
- `packages/database/prisma/migrations/20261001004900_mgt_240a_staff_identity/migration.sql`
- `packages/database/prisma/migrations/20261001005000_mgt_240b_lm_staff_authority/migration.sql`
- `packages/database/prisma/migrations/20261001005100_mgt_240c_staff_onboarding_invites/migration.sql`
- `packages/database/prisma/migrations/20261001005200_mgt_240c_invitation_anti_abuse_scope/migration.sql`
- `packages/database/prisma/migrations/20261001005300_mgt_240d_staff_activation/migration.sql`
- `packages/database/prisma/migrations/20261002005400_mgt_240f_force_end_shift/migration.sql`
- `packages/database/prisma/migrations/20261003005500_check_in_cancelled_enum/migration.sql`
- `packages/database/prisma/migrations/20261003005600_check_in_cancelled_terminal/migration.sql`
- `packages/database/prisma/migrations/20261003005700_pre_custody_parking_cancellation/migration.sql`
- `packages/database/prisma/migrations/20261004005800_shift_presence_foundation/migration.sql`
- `packages/database/prisma/migrations/20261004005900_shift_presence_decision_privacy/migration.sql`
- `packages/database/prisma/migrations/20261004006000_shift_presence_authority_denial/migration.sql`
- `packages/database/prisma/migrations/20261004006100_shift_presence_policy_commands/migration.sql`
- `packages/database/prisma/migrations/20261004006200_shift_presence_retention_execution/migration.sql`
- `packages/database/prisma/migrations/20261004006300_shift_presence_management_entitlement/migration.sql`
- `packages/database/prisma/migrations/20261004006400_shift_presence_management_results/migration.sql`
- `packages/database/prisma/migrations/20261004006500_shift_presence_anti_abuse_scopes/migration.sql`
- `packages/database/prisma/migrations/20261004006600_shift_presence_consumer_denial/migration.sql`
- `packages/database/prisma/migrations/20261004006700_shift_presence_evidence_free_completion/migration.sql`
- `packages/database/prisma/migrations/20261004006800_shift_presence_converged_completion/migration.sql`
- `packages/database/prisma/migrations/20261007006900_shift_presence_strict_rollout_activation/migration.sql`
- `packages/database/prisma/migrations/20261007007000_guest_browser_session_continuity/migration.sql`
- `packages/database/prisma/migrations/20261008007100_guest_browser_context_schema/migration.sql`
- `packages/database/prisma/migrations/20261008007200_guest_browser_context_prepare/migration.sql`
- `packages/database/prisma/migrations/20261008007300_guest_browser_context_switch/migration.sql`
- `packages/database/prisma/migrations/20261008007400_guest_browser_context_reconcile/migration.sql`
- `packages/database/prisma/migrations/20261008007500_guest_t3_classified_anti_abuse/migration.sql`
- `packages/database/prisma/migrations/20261008007600_guest_t3_visit_budget_binding/migration.sql`
- `packages/database/prisma/migrations/20261008007700_guest_t3_group_window_index/migration.sql`
- `packages/database/prisma/migrations/20261008007800_guest_web_push_v1/migration.sql`
- `packages/database/prisma/migrations/20261010007900_live_history_parked_audit_indexes/migration.sql`
- `packages/database/prisma/migrations/20261014008000_issue_215_verified_condition_photo_p1/migration.sql`
- `packages/database/prisma/migrations/20261015008100_issue_215_photo_anti_abuse_scopes/migration.sql`
- `packages/database/prisma/migrations/20261015008200_issue_215_condition_photo_policy_recovery/migration.sql`
- `packages/database/prisma/migrations/20261015008300_issue_215_condition_photo_policy_recovery_finish/migration.sql`
- `packages/database/prisma/migrations/20261015008400_issue_215_p5_photo_maintenance_claims/migration.sql`
- `packages/database/prisma/migrations/20261015008500_issue_215_p5_photo_integrity_system/migration.sql`

## Live GitHub open issue inventory

Read through connected GitHub on 2026-10-15. Open issues can contain stale descriptions; source and accepted decisions govern actual implementation.

- [#296 — [Security][Medium] Revalidate locked Supervisor role in Handoff and Dispatch during concurrent demotion (CWE-367)](https://github.com/yamanradwan1-rgb/valet-platform/issues/296)
- [#295 — [Security][Medium] Reject non-loopback HTTP API_ORIGIN in production staff web proxies (CWE-319)](https://github.com/yamanradwan1-rgb/valet-platform/issues/295)
- [#294 — [Security][Medium] Employee web failed logout silently restores previous staff identity on reload (CWE-613)](https://github.com/yamanradwan1-rgb/valet-platform/issues/294)
- [#293 — [215/Auth Investigation] Cancellation exact Staff credential revocation-versus-commit race](https://github.com/yamanradwan1-rgb/valet-platform/issues/293)
- [#292 — [215/P3] Recovery when photo policy becomes required after optional condition marker](https://github.com/yamanradwan1-rgb/valet-platform/issues/292)
- [#291 — [215/P6] Integrated Native Android / CI / UI-X1 acceptance and release recommendation](https://github.com/yamanradwan1-rgb/valet-platform/issues/291)
- [#290 — [215/P5] Maintenance worker, orphan-only cleanup, integrity/availability & restore](https://github.com/yamanradwan1-rgb/valet-platform/issues/290)
- [#289 — [215/P4] Native QR-pattern condition-photo capture and portable upload recovery](https://github.com/yamanradwan1-rgb/valet-platform/issues/289)
- [#288 — [215/P5-OPS] Define photo evidence retention, holds and future off-host backup policy](https://github.com/yamanradwan1-rgb/valet-platform/issues/288)
- [#287 — [215/P2-G6] Repair and verify full API/PostgreSQL suite, CI and release evidence](https://github.com/yamanradwan1-rgb/valet-platform/issues/287)
- [#286 — [215/P2] Decide controlled PENDING → REJECTED after durable reservation](https://github.com/yamanradwan1-rgb/valet-platform/issues/286)
- [#285 — [215/P2-G4] Unknown PUT / process-kill / cross-replica photo reconciliation proof](https://github.com/yamanradwan1-rgb/valet-platform/issues/285)
- [#284 — [215/P2-G3] Real HTTP → restricted PostgreSQL → private S3 → audit acceptance](https://github.com/yamanradwan1-rgb/valet-platform/issues/284)
- [#283 — [215/P2-G2] Prove exact Staff bearer refresh/logout/revocation concurrency at T2](https://github.com/yamanradwan1-rgb/valet-platform/issues/283)
- [#282 — [215/P2-G1] Qualify private S3-compatible storage in isolated development; defer production provider](https://github.com/yamanradwan1-rgb/valet-platform/issues/282)
- [#281 — [Payments][Native/Dashboard][Approved UX] One-tap Cash vs POS + traceable shift reconciliation](https://github.com/yamanradwan1-rgb/valet-platform/issues/281)
- [#280 — [Dashboard][UX] Shift Presence — guided first-time setup, simplified management, Astra plan + HTML prototype approval gates](https://github.com/yamanradwan1-rgb/valet-platform/issues/280)
- [#279 — [DEFERRED — LAST] T6 — Guest E2E, Load, Physical & Production Readiness Gate](https://github.com/yamanradwan1-rgb/valet-platform/issues/279)
- [#277 — [Dashboard/API][Bug] Audit Log shows generic Staff member and raw IDs instead of authorized actor/vehicle identity](https://github.com/yamanradwan1-rgb/valet-platform/issues/277)
- [#275 — [Native][Bug][PHYSICAL QA PENDING] Incident Reporting preflight on Android](https://github.com/yamanradwan1-rgb/valet-platform/issues/275)
- [#274 — [Native/FCM][Code Merged — Physical QA Pending] Locked-screen push latency + battery warning](https://github.com/yamanradwan1-rgb/valet-platform/issues/274)
- [#273 — [Native/API][Bug][U-001 & Physical QA Pending] Staff Push account transition](https://github.com/yamanradwan1-rgb/valet-platform/issues/273)
- [#272 — Native Android regression — Parking Task missing from warm Tasks queue until app force-close and relaunch](https://github.com/yamanradwan1-rgb/valet-platform/issues/272)
- [#248 — Native App — Deferred Backlog Tracker](https://github.com/yamanradwan1-rgb/valet-platform/issues/248)
- [#235 — [DEFERRED] Management Dashboard — Map Provider Integration (provider-neutral, Google Maps first)](https://github.com/yamanradwan1-rgb/valet-platform/issues/235)
- [#227 — Production deployment: provide real origins and complete production build proof](https://github.com/yamanradwan1-rgb/valet-platform/issues/227)
- [#224 — Deploy Customer App HTTPS origin for Native Guest Access](https://github.com/yamanradwan1-rgb/valet-platform/issues/224)
- [#223 — [DEFERRED] MOB-027B — Owner go/no-go and Native-primary cutover / rollback decision](https://github.com/yamanradwan1-rgb/valet-platform/issues/223)
- [#222 — [DEFERRED] MOB-027A — Controlled location/device pilot](https://github.com/yamanradwan1-rgb/valet-platform/issues/222)
- [#221 — [DEFERRED] MOB-026B — Signed internal distribution and rollback rehearsal](https://github.com/yamanradwan1-rgb/valet-platform/issues/221)
- [#220 — [DEFERRED] MOB-026A — Release ownership, configuration, and pilot preparation](https://github.com/yamanradwan1-rgb/valet-platform/issues/220)
- [#219 — Guest Access recovery during active handoff — reissue/rotate without release bypass](https://github.com/yamanradwan1-rgb/valet-platform/issues/219)
- [#215 — BLOCKER: Verified condition-photo upload pipeline for Native Check-In](https://github.com/yamanradwan1-rgb/valet-platform/issues/215)
- [#126 — SEC-004 — Post-remediation Security Diff Verification](https://github.com/yamanradwan1-rgb/valet-platform/issues/126)

Open PR search returned [#210](https://github.com/yamanradwan1-rgb/valet-platform/pull/210), blocked web-push real-device evidence. No PR created by this task.


## Planning validation and independent review

- Read-only independent planning review: GO after corrections to explicit provider/policy persistence, permission withdrawal precedence, shared rate budgets, exact ownership and dispatch-permit accounting. Final two minor corrections (binding purpose column and F09 permit-boundary wording) applied.
- Structural validation: 53 sequential numbered sections; exactly seven worker packets; balanced fenced blocks.
- Dependency validation: 18 nodes, 24 edges, no cycle.
- UI manifest validation: all 2,174 path/blob/mode entries match pinned Git baseline.
- Companion artifacts exist; no application, UI, schema, migration or dependency edits.
- Application, PostgreSQL, physical Native and real Meta tests: NOT RUN (planning only).
- Current Meta policy and official Meta Postman collection read; several Meta technical pages returned HTTP 429/unavailable. WA-V01 explicitly gates fresh technical verification and real template/fragment proof.
- Planning branch push does not trigger the current CI workflow (only main push and PR to main). No PR, workflow run, merge, deployment or live send requested or performed.
