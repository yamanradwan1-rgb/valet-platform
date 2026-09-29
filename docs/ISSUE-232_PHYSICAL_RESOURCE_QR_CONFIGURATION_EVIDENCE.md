# Issue #232 â€” Physical Resource QR Configuration Evidence

## Closure identity

- Repository: veletpro0-lgtm/valet-platform
- Issue: #232 â€” Management Dashboard physical-resource creation and printable QR labels
- Branch: feat/232-physical-resources-qr
- Accepted base SHA: a089ee8b8bca0ca5fd8243e30f1da52d11dc9b84
- Accepted decision: DEC-096_PHYSICAL_RESOURCE_CONFIGURATION_QR_IDENTITY
- Prisma model change: NO
- Forward-only migration: YES â€” 20260929004600_mgt_232_physical_resource_creation
- Final implementation status: PASS.
- PR: none
- Merge: none

## Accepted QR contract

New Management labels use V2:

- vaylet:v2:key-slot:<RESOURCE_UUID>:<RESOURCE_CODE>
- vaylet:v2:parking-spot:<RESOURCE_UUID>:<RESOURCE_CODE>

Legacy V1 remains accepted indefinitely:

- vaylet:key-slot:<RESOURCE_CODE>
- vaylet:parking-spot:<RESOURCE_CODE>

Manual code fallback remains supported. V2 UUID possession never grants authority. The operational server verifies the immutable resource ID together with the persisted authoritative Organization, Location, exact code and ACTIVE state before protected state transitions.

The shared parser consumes the fixed UUID segment and treats the remaining payload as the exact code, so valid code bytes including colon characters are not accidentally split or normalized. V1 retains its DEC-067 120-character cap. V2 uses a derived 160-character cap compatible with the accepted 100-character resource-code maximum.

## Authority and assurance

| Actor | List | Create | Label / reprint | Scope / assurance |
| --- | --- | --- | --- | --- |
| Company Admin | YES | YES | YES | exact selected Location; Standard for reads/labels, Sensitive MFA for create; PHYSICAL_RESOURCES_MANAGE_ELIGIBLE |
| Location Manager | YES | YES | YES | exact granted ACTIVE Location using existing Dashboard assurance |
| Supervisor | NO | NO | NO | Management physical-resource authority denied |
| Employee | NO | NO | NO | Management denied; operational scanning remains available |

Company Admin historical listing remains possible where current lifecycle authority permits it. Creation and label/reprint are denied for inactive Locations/resources. Location Manager remains ACTIVE exact-Location only.

## Contracts and validation

- New strict physical-resource configuration contracts cover bounded Key Slot lists, Parking Spot lists, creates, label projections and the minimal ParkingZone selector projection.
- Physical resource code: trim surrounding whitespace, 1..100 characters, otherwise exact bytes.
- ParkingSpot label: trim surrounding whitespace, 1..160 characters.
- No case folding, punctuation normalization, fuzzy normalization or #195 behavior was introduced.
- ParkingSpot create requires one ACTIVE ParkingZone in the same persisted Organization and Location.
- Legacy ParkingSpots with null parkingZoneId remain truthfully listable as unassigned legacy state.
- PHYSICAL_RESOURCES_MANAGE_ELIGIBLE is dedicated to Company Admin physical-resource Management and does not reuse LOCATION_SETTINGS_MANAGE_ELIGIBLE.

## Database and least privilege

The Prisma models are unchanged. No QR, QR payload, PNG/blob, URL, creator ownership, inventory table or status-enum columns were added.

Migration 20260929004600_mgt_232_physical_resource_creation creates narrow SECURITY DEFINER entry points for KeySlot and ParkingSpot creation. The functions:

- use a fixed search_path;
- recheck ACTIVE actor, membership, Organization, Dashboard entitlement and Location;
- recheck exact LM Location grant at the DB boundary;
- require ACTIVE same-scope ParkingZone for ParkingSpot;
- use durable operationId/request fingerprint reconciliation;
- serialize idempotency with transaction-scoped advisory locking;
- convert same-Location exact-code uniqueness to a stable conflict result;
- insert resource + safe AuditEvent atomically;
- keep helper functions non-executable by the runtime role;
- keep PUBLIC EXECUTE revoked;
- grant the runtime role EXECUTE only on reviewed create entry functions;
- preserve direct runtime INSERT denial on key_slots and parking_spots.

The physical-resource runtime-role integration test proves direct INSERT denial, helper-function denial, create-function grants, idempotent replay, cross-Location duplicate-code allowance, same-Location conflict, zone scope and LM grant enforcement.

## Audit

Creation emits atomic Management Audit events:

- KEY_SLOT_CREATED / entity KEY_SLOT
- PARKING_SPOT_CREATED / entity PARKING_SPOT

Safe audit metadata is limited to request fingerprint, resource type/code and status. QR payloads, rendered images, raw request bodies, tokens, MFA material and customer/vehicle/employee PII are not written. Supervisor Audit visibility was not widened.

## API surface

Exact-Location routes under:

/v1/staff/dashboard/locations/:locationId/physical-resources

Implemented routes:

- GET /key-slots
- GET /parking-spots
- GET /parking-zones
- GET /key-slots/:resourceId/label
- GET /parking-spots/:resourceId/label
- POST /key-slots
- POST /parking-spots

Lists are bounded and cursor-based with exact Location binding. The Organization is derived/revalidated server-side rather than trusted from the caller. Label endpoints are fresh authorized no-store reads.

## Mutation safety and idempotency

- No blind POST replay.
- Pre-dispatch authentication reconciliation remains allowed by the existing client.
- A dispatched POST followed by 401 is not replayed automatically.
- Transport ambiguity triggers an authoritative reread; user retry remains explicit.
- Create dialogs use a memory-only stable operationId keyed by identity generation, Location, resource kind and exact request fingerprint.
- Same operationId + same request recovers the authoritative original.
- Same operationId + changed request returns IDEMPOTENCY_CONFLICT.
- Double-submit is fenced to one POST.
- Authority/entitlement loss at submit time yields no insert and no success label.

## Operational V1/V2 compatibility

Shared Employee Client, Employee Web and Native all accept V1 and V2 before Management issues V2 labels.

Confirm Parked preserves V2 ParkingSpot and KeySlot identity to the protected server command. Retrieval preserves V2 KeySlot identity through physical verification and the protected start-retrieval command. V1/manual paths remain code-only for compatibility.

Mandatory same-code proof was run with matching codes in two Locations:

- Location A V2 KeySlot UUID used in Location B: REJECT.
- Location A V2 ParkingSpot UUID used in Location B: REJECT.
- Correct Location B V2 identity: ACCEPT subject to normal workflow rules.
- V1 behavior remains separately regression-tested.

## Dashboard UX and visual parity

Placement is only:

Locations -> exact Location -> Physical Resources -> Key Slots / Parking Spots

No new sidebar destinations were added and the operational /keys surface was not repurposed.

The implementation reuses existing Dashboard Location administration, table, button, StatusBadge and FocusDialog patterns. Operational codes and Location codes are bidi-isolated LTR in RTL UI.

Physically reviewed proof matrix:

- EN Light desktop populated
- EN Dark desktop populated
- AR RTL desktop
- AR RTL 480x900 narrow
- EN Light empty
- AR narrow create dialog
- validation/conflict dialog
- QR label dialog

Observed closure: native Locations spacing/card/dialog/table geometry, no unintended horizontal page overflow, no RTL code reversal, no custom modal behavior and no duplicated navigation/control language.

## Label, PNG and print

Every label open, download and print begins with a fresh authorized label read.

Rendering uses the existing monorepo qrcode library family with error correction M and a four-module quiet zone. Download output is image/png at 1200x1500 with a 960x960 QR region. The generated PNG was decoded back with the monorepo's existing ZXing family and matched the V2 payload byte-for-byte.

Human-facing label content is limited to:

- VAYLET
- resource type
- resource code
- Location name
- Location code
- QR

The UUID is not printed as normal human-facing text. Blob download URLs are created transiently and revoked in finally-style cleanup. Print CSS hides Dashboard chrome, dialog chrome, backdrop and buttons so only the physical label is visible.

## Privacy and storage

QR V2 carries only resource kind, immutable resource UUID and canonical code. It carries no session/task/membership IDs, credentials, tokens, guest/handoff secrets, or customer/vehicle/employee data.

Dashboard E2E checks localStorage, sessionStorage, IndexedDB and CacheStorage for protected QR/resource identity persistence and confirms the V2 payload/resource UUID are not persisted. Blob URL cleanup is explicitly asserted.

## Test and gate evidence

Focused and closure results confirmed during implementation and the final fast-closure review:

- Shared QR parser / input: PASS, including V1 and V2, exact bytes, malformed/wrong-type handling, manual code continuity, and the derived V2 cap. These production paths were unchanged by the final review, so their already-green focused/root results remain authoritative.
- Employee Client Confirm Parked / Retrieval, Employee Web scanner, and Native scanner/parking/retrieval regressions: PASS; unchanged during the final review.
- Contracts physical-resource / Confirm Parked / Retrieval: PASS; unchanged during the final review.
- Physical-resource cursor binding: 3/3 PASS; malformed cursors, wrong Location, and wrong resource-family reuse are rejected.
- Management physical-resource HTTP authority/behavior: 7/7 PASS in the final focused run. This covers Company Admin, exact granted Location Manager, Supervisor/Employee denial, Sensitive-CA-create versus Standard reads, inactive Location behavior, entitlement revocation, idempotency, persisted reread, zone enforcement, and safe audit.
- V2 operational identity: 3/3 PASS in the final focused run. Same-code Location A UUIDs are rejected in Location B, the correct Location B V2 KeySlot/ParkingSpot identity succeeds under the normal workflow, Retrieval rejects the wrong cross-Location UUID, and inactive V2 targets are rejected before protected mutation.
- Physical-resource runtime PostgreSQL role: 6/6 PASS in the final focused run. Direct runtime INSERT remains denied; only reviewed SECURITY DEFINER entry points are executable; idempotent replay, same-Location conflict, cross-Location duplicate-code allowance, concurrent duplicate serialization to exactly one resource/one audit, ParkingZone scope/status, and LM grant enforcement all pass.
- Issue #232 Dashboard focused closure: 14/14 PASS after the final operation-id cleanup. This includes persisted create/reread, duplicate/focus behavior, 401 no automatic POST replay, lost-response authoritative reread plus explicit same-operation retry, A->B->A stale success/failure fencing, create-A-then-switch-B fencing, logout fencing, identity replacement, Standard CA physical-resource reads while lifecycle independently requests Sensitive MFA, visual parity, and empty states.
- Dashboard PNG/print/privacy: PASS in that 14-test closure. PNG signature and 1200x1500 dimensions are verified, ZXing decodes the generated image byte-for-byte to the V2 payload, Blob URLs are revoked, protected QR/resource identity is absent from browser persistence, and print mode excludes Dashboard chrome/buttons/backdrop.
- EN/AR/RTL, Light/Dark, desktop/narrow, bidi-isolated operational codes, keyboard focus restoration, and no horizontal page overflow: PASS in the focused visual closure.
- Dashboard package lint after the final UI change: PASS.
- Dashboard package typecheck after the final UI change: PASS.
- pnpm architecture:check after the final review: PASS with only repository-baseline grandfather warnings.
- Prisma validate against the local test PostgreSQL configuration: PASS from the implementation closure; Prisma/schema were not changed afterward.
- pnpm test:build-contract: 4/4 PASS from the implementation closure; affected contracts were not changed afterward.
- pnpm build (verification mode): PASS for all build targets from the implementation closure; no fake production environment values were supplied.
- pnpm test:non-postgres after the scanner expectation fixes: PASS; scanner/contract production code was unchanged afterward.
- Full root pnpm test at implementation commit `5b93161e84746189572295c97fc49d1dda8c3f35`: PASS with root exit 0:
  - api-postgres-standard: 785/785 tests PASS.
  - api-postgres-compound: 89/89 tests PASS.
  - api-postgres-race: 870/870 tests PASS.
  - database-postgres-direct: 563/563 tests PASS.
  - database-postgres-provision: 109/109 tests PASS.
- Fast Closure mode intentionally did not restart a repository-wide root suite. A broad PostgreSQL batch launched before Fast Closure mode was stopped so it would not block the final focused #232 database/API runs. This is redundant rather than a coverage gap: the full root suite above was already green at the pushed implementation commit, API/DB production code did not change during the final review, and the only post-commit production change is identity-scoped cleanup of the Dashboard's memory-only create operation IDs, covered by Dashboard lint/typecheck, architecture check, and the 14/14 focused Dashboard closure.
- git diff --check: PASS after final evidence synchronization and before closure commit.

## File-size policy

The new #232 migration is exactly 300 physical lines. All new Issue #232 code/style/test files and all non-grandfathered modified authored code/style/test files are <=300 physical lines.

Three pre-existing repository tests are explicit architecture-baseline grandfathered files above 300 and were touched only to update the repository-wide migration-count/latest-migration assertions from 45 to 46:

- packages/database/src/runtime-role.integration.test.ts â€” 949 lines.
- packages/database/src/schema.integration.test.ts â€” 7564 lines.
- packages/database/src/seed.integration.test.ts â€” 644 lines.

Their sizes did not grow beyond the accepted architecture baseline, and architecture:check passes with the existing grandfather warnings. No formatting compression or unrelated refactor was used to evade the line policy.

## Exact changed files

- apps/api/src/common/http/api-errors.ts
- apps/api/src/modules/dashboard/dashboard.module.ts
- apps/api/src/modules/dashboard/physical-resource.controller.ts
- apps/api/src/modules/dashboard/physical-resource-authorization.ts
- apps/api/src/modules/dashboard/physical-resource-command.ts
- apps/api/src/modules/dashboard/physical-resource-cursor.ts
- apps/api/src/modules/dashboard/physical-resource-errors.ts
- apps/api/src/modules/dashboard/physical-resource-policy.ts
- apps/api/src/modules/dashboard/physical-resource-query.ts
- apps/api/src/modules/dashboard/physical-resource-read.service.ts
- apps/api/src/modules/dashboard/physical-resource-write.controller.ts
- apps/api/src/modules/dashboard/physical-resource-write.service.ts
- apps/api/src/modules/management/management-audit-detail-projection.ts
- apps/api/src/modules/management/management-audit-event-catalog.ts
- apps/api/src/modules/management/management-audit-projection.ts
- apps/api/src/modules/management/management-capabilities.ts
- apps/api/src/modules/parking/confirm-parked.controller.ts
- apps/api/src/modules/parking/confirm-parked-command.ts
- apps/api/src/modules/parking/confirm-parked-locks.ts
- apps/api/src/modules/parking/confirm-parked-resources.ts
- apps/api/src/modules/retrieval/start-retrieval.controller.ts
- apps/api/src/modules/retrieval/start-retrieval-command.ts
- apps/api/src/modules/retrieval/start-retrieval-locks.ts
- apps/api/src/modules/staff/staff-valet-session-queries.ts
- apps/api/test/dashboard-physical-resources.integration.test.ts
- apps/api/test/dashboard-physical-resources-authority.integration.test.ts
- apps/api/test/management-audit-projection.test.ts
- apps/api/test/physical-resource-cursor.test.ts
- apps/api/test/physical-resource-v2-operational.integration.test.ts
- apps/dashboard/e2e/issue232-physical-resource-closure.spec.ts
- apps/dashboard/e2e/issue232-physical-resource-races.spec.ts
- apps/dashboard/e2e/issue232-physical-resources.spec.ts
- apps/dashboard/e2e/issue232-physical-resource-visual.spec.ts
- apps/dashboard/e2e/support/issue232-physical-resources.ts
- apps/dashboard/e2e/support/png-qr-decode.ts
- apps/dashboard/package.json
- apps/dashboard/src/features/administration/locations/locations-page.tsx
- apps/dashboard/src/features/administration/physical-resources/physical-resource-create-dialog.tsx
- apps/dashboard/src/features/administration/physical-resources/physical-resource-operation-id.ts
- apps/dashboard/src/features/administration/physical-resources/physical-resources.module.css
- apps/dashboard/src/features/administration/physical-resources/physical-resources-api.ts
- apps/dashboard/src/features/administration/physical-resources/physical-resources-copy.ts
- apps/dashboard/src/features/administration/physical-resources/physical-resources-panel.tsx
- apps/dashboard/src/features/administration/physical-resources/physical-resource-table.tsx
- apps/dashboard/src/features/administration/physical-resources/resource-label-dialog.tsx
- apps/dashboard/src/features/administration/physical-resources/resource-label-png.ts
- apps/dashboard/src/features/administration/physical-resources/resource-label-print.module.css
- apps/dashboard/src/features/audit/audit-event-copy.ts
- apps/dashboard/src/features/audit/audit-event-labels.ts
- apps/valet/src/components/scanner/resource-qr-scan-section.test.tsx
- apps/valet/src/components/scanner/resource-qr-scan-section.tsx
- apps/valet/src/components/screens/parking-flow.tsx
- apps/valet/src/components/screens/parking-key-return-step.tsx
- apps/valet/src/components/screens/parking-spot-confirm-step.tsx
- apps/valet/src/components/screens/retrieval/retrieval-live-steps.tsx
- apps/valet/src/components/screens/retrieval-flow.tsx
- apps/valet/src/features/parking/parking-api.ts
- apps/valet/src/features/parking/parking-controller.ts
- apps/valet/src/features/parking/use-parking.ts
- apps/valet/src/features/retrieval/retrieval-api.ts
- apps/valet/src/features/retrieval/retrieval-controller.ts
- apps/valet/src/features/retrieval/retrieval-controller-state.ts
- apps/valet/src/features/retrieval/retrieval-types.ts
- apps/valet/src/features/retrieval/use-retrieval.ts
- apps/valet/src/features/scanner/qr-resource-payload.test.ts
- apps/valet/src/features/scanner/qr-resource-payload.ts
- apps/valet-native/src/parking/native-parking-key-return-step.tsx
- apps/valet-native/src/parking/native-parking-qr-input.tsx
- apps/valet-native/src/parking/native-parking-resource-step.tsx
- apps/valet-native/src/parking/native-parking-spot-step.tsx
- apps/valet-native/src/retrieval/native-retrieval-key-input.tsx
- apps/valet-native/src/shell/native-production-bootstrap.ts
- docs/03_DATABASE_SCHEMA.md
- docs/08_DECISIONS_LOG.md
- docs/decisions/DEC-067_EMPLOYEE_CAMERA_QR_ARCHITECTURE.md
- docs/decisions/DEC-068_POST_PARKING_KEY_SLOT_BINDING.md
- docs/decisions/DEC-096_PHYSICAL_RESOURCE_CONFIGURATION_QR_IDENTITY.md
- docs/ISSUE-232_PHYSICAL_RESOURCE_QR_CONFIGURATION_EVIDENCE.md
- packages/contracts/src/confirm-parked.test.ts
- packages/contracts/src/confirm-parked.ts
- packages/contracts/src/index.ts
- packages/contracts/src/management-audit.test.ts
- packages/contracts/src/management-audit.ts
- packages/contracts/src/management-audit-events.ts
- packages/contracts/src/management-control-plane.ts
- packages/contracts/src/physical-resource-configuration.test.ts
- packages/contracts/src/physical-resource-configuration.ts
- packages/contracts/src/staff-valet-session.ts
- packages/contracts/src/start-retrieval.ts
- packages/database/prisma/migrations/20260929004600_mgt_232_physical_resource_creation/migration.sql
- packages/database/scripts/management-runtime-privileges.mjs
- packages/database/scripts/physical-resource-runtime-privileges.mjs
- packages/database/src/audit-foundation-migration.integration.test.ts
- packages/database/src/audit-foundation-runtime-role.integration.test.ts
- packages/database/src/basic-branding-migration.integration.test.ts
- packages/database/src/basic-branding-runtime-privilege.integration.test.ts
- packages/database/src/cash-reconciliation-migration.integration.test.ts
- packages/database/src/financial-policy-migration.integration.test.ts
- packages/database/src/guest-rating-migration.integration.test.ts
- packages/database/src/location-configuration-migration.integration.test.ts
- packages/database/src/location-configuration-runtime-role.integration.test.ts
- packages/database/src/location-lifecycle-migration.integration.test.ts
- packages/database/src/management-company-reports-migration.integration.test.ts
- packages/database/src/management-kpi-migration.integration.test.ts
- packages/database/src/management-pagination-snapshot-migration.integration.test.ts
- packages/database/src/maps-tracking-persistence.integration.test.ts
- packages/database/src/migration-manifest.ts
- packages/database/src/payment-collection-migration.integration.test.ts
- packages/database/src/phase4-runtime-role.integration.test.ts
- packages/database/src/physical-resource-runtime-role.integration.test.ts
- packages/database/src/runtime-role.integration.test.ts
- packages/database/src/schema.integration.test.ts
- packages/database/src/seed.integration.test.ts
- packages/database/src/staff-push-migration.integration.test.ts
- packages/database/src/task-dispatch-persistence.integration.test.ts
- packages/employee-client/src/employee-confirm-parked-operation.ts
- packages/employee-client/src/employee-confirm-parked-session.ts
- packages/employee-client/src/employee-confirm-parked-state.ts
- packages/employee-client/src/employee-confirm-parked-target.ts
- packages/employee-client/src/employee-confirm-parked-types.ts
- packages/employee-client/src/employee-retrieval-flow-session.ts
- packages/employee-client/src/employee-retrieval-flow-state.ts
- packages/employee-client/src/employee-retrieval-flow-test-fixture.ts
- packages/employee-client/src/employee-retrieval-flow-transport.ts
- packages/employee-client/src/employee-retrieval-flow-types.ts
- packages/employee-client/src/qr-capture-session.test.ts
- packages/employee-client/src/qr-input.test.ts
- packages/employee-client/src/qr-input.ts
- packages/employee-client/src/qr-resource-payload.ts
- pnpm-lock.yaml

## Final status

Implementation is complete and the final focused Issue #232 acceptance gates are green. The final closure commit contains only intentional #232 review hardening on top of the already-pushed implementation commit. No PR or merge is part of Issue #232 closure.
