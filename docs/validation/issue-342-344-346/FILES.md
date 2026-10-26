# Issue-scoped file inventory

Source, contract, migration and focused test files are grouped by their implementation commit. Shared before/after evidence and review notes are in this directory and the three task-owned visual Playwright files.

## #344 — `00eb3e679d903b1c01bd317a6e5c2de544cc47d2`

- `apps/dashboard/e2e/issue344-last-attendance-zone.spec.ts`
- `apps/dashboard/src/features/administration/settings/shift-presence-copy.ts`
- `apps/dashboard/src/features/administration/settings/shift-presence-errors.ts`
- `apps/dashboard/src/features/administration/settings/shift-presence-zone-form.tsx`
- `apps/dashboard/src/features/administration/settings/shift-presence-zone-readiness.test.ts`
- `apps/dashboard/src/features/administration/settings/shift-presence-zone-readiness.ts`

## #346 — `6bb6a4a52cce9e6293cbf5e30549085eb1829f14`

- `apps/api/src/modules/management/management-audit-event-catalog.ts`
- `apps/api/src/modules/management/management-location-authorization.ts`
- `apps/api/src/modules/management/management-location-repository.ts`
- `apps/api/src/modules/management/management-location.controller.ts`
- `apps/api/src/modules/management/management-location.service.ts`
- `apps/api/test/issue346-operational-records.ts`
- `apps/api/test/issue346-resume-intake.integration.test.ts`
- `apps/dashboard/e2e/issue346-resume-intake.spec.ts`
- `apps/dashboard/src/features/administration/locations/location-lifecycle-panel.tsx`
- `apps/dashboard/src/features/administration/locations/location-resume-copy.ts`
- `apps/dashboard/src/features/administration/locations/location-resume-error.test.ts`
- `apps/dashboard/src/features/administration/locations/location-resume-error.ts`
- `apps/dashboard/src/features/administration/locations/location-resume-intake.tsx`
- `apps/dashboard/src/features/administration/locations/locations-api.ts`
- `apps/dashboard/src/features/audit/audit-event-copy.ts`
- `docs/03_DATABASE_SCHEMA.md`
- `packages/contracts/src/management-audit-events.ts`
- `packages/database/prisma/migrations/20261026010300_issue346_resume_location_intake/migration.sql`
- `packages/database/scripts/location-lifecycle-runtime-privileges.mjs`
- `packages/database/src/location-lifecycle-runtime-role.integration.test.ts`

## #342 — `a05c55018ef7cc11c9835d304c44cd8aac0001a3`

- `apps/api/src/modules/management/staff-shift-cash-read.ts`
- `apps/api/src/modules/management/staff-shift-history.controller.ts`
- `apps/api/src/modules/management/staff-shift-history.service.ts`
- `apps/api/test/issue342-shift-cash-read.integration.test.ts`
- `apps/dashboard/e2e/issue342-shift-cash.spec.ts`
- `apps/dashboard/src/features/administration/staff/staff-shift-cash-facts.test.tsx`
- `apps/dashboard/src/features/administration/staff/staff-shift-cash-facts.tsx`
- `apps/dashboard/src/features/administration/staff/staff-shift-drawer.tsx`
- `apps/dashboard/src/features/administration/staff/staff-shift-history-api.ts`
- `apps/dashboard/src/features/administration/staff/use-staff-shift-force-end.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/staff-shift-cash-reconciliation.test.ts`
- `packages/contracts/src/staff-shift-cash-reconciliation.ts`
- `packages/contracts/src/staff-shift-history.ts`
