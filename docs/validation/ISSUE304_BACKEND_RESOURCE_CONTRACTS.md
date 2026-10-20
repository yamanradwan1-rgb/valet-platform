# Issue #304 — authoritative Keys & Spots contracts

Status: **implemented in isolated integration branch; deployment and production migration NOT performed**.
Approved design: SHA-256 `31e655ee1dc83311ea473705661a32638d59a17bf13c4d50ee6a00fc0ec939f2`.
Base: `a3779327690debc1ec561760641502967603c5f2`.
Source commit: W3 `d92541bc7743fda164792b570084542089d14a30`, integration cherry-pick `cbb5948d`.

## Read contract

Authenticated GET `/v1/staff/dashboard/locations/:locationId/physical-resources/overview?limit=50&keyCursor=...&spotCursor=...`.

- `counts.keySlots`: `configured,active,available,inUse,unknown`; `counts.parkingSpots`: `configured,active,available,occupied,unknown`. Counts are computed in PostgreSQL across **all** exact-Location records, independent of the returned cursor page; availability/usage counters are `null` when the Location is nonoperational, not invented zero.
- `keySlots`: cursor-paged `items[]` with persisted `keySlotId,code,label|null,status`, authority-derived `usage`, nullable `holdingSessionId` and current vehicle's normalized plate/temporary descriptor. `nextCursor` for later pages.
- `parkingSpots`: cursor-paged current `ParkingSpotListEntry` with zone, configuration and authoritative nullable occupancy, plus explicit `usage`; `nextCursor` for later pages.
- LIMIT max 100 per family. No client derivation of location-wide counts from a partial list, and no per-resource N+1 reads for overview.
- Existing Key/Spot list and QR routes remain supported. No persistent UI cache or polling added.
- Response uses strict Zod contracts at `packages/contracts/src/physical-resource-overview.ts`; controller applies no-store, existing actor resolution and management LIST authorization.

Authenticated GET `/v1/staff/dashboard/locations/:locationId/physical-resources/key-slots/:resourceId/custody?limit=20` (max 50) returns bounded real append-only custody events with `eventId,eventType,occurredAt,actorMembershipId,actorName|null,hasMore`. Server verifies resource belongs to the authorized exact Organization/Location. Clients must never generate actor names, timestamps or fake history.

## Authorization and operational truth

Existing physical resource authorization remains authoritative, including eligible Company Admin, exact Location Manager, denied Supervisor/Employee, tenant/Location isolation, fresh session/MFA checks; POST create still requires existing sensitive assurance for Company Admin. SQL restricts tenant and Location. Availability is distinct from configuration: ACTIVE alone never means AVAILABLE; inactive/unknown cannot be counted free. Vehicle identity precedence: normalized plate → temporary descriptor → localized unavailable, with no UUID presented as a primary identity. Old QR V1 remains compatible; generation uses exact saved-resource QR V2, not the HTML illustrative artwork.

## Additive persistence

Migration `packages/database/prisma/migrations/20261020009700_issue304_key_slot_label/migration.sql` adds nullable, trimmed, 1–160-character KeySlot.label. Existing records legitimately return `null`. New optional createKeySlot `label` is backward compatible, with existing 6-argument creation routine retained and a 7-argument security-definer wrapper using existing audited/idempotent creation before updating the new label in the same transaction. `physical-resource-runtime-privileges.mjs` narrowly grants new routine execution to the existing runtime role; no broad privileges. Schema updated and documented in `docs/03_DATABASE_SCHEMA.md`. **The migration was not applied to production.** Production rollout requires existing migration/provisioning gate *before* activating the new API.

## Validation record and limitations

- W3 isolated tests: six contracts assertions, three query assertions, two PostgreSQL integration tests including full counts, label creation, custody, authorization, cross-location boundaries; W3 reported PASS on its disposable fixture, not production.
- Prime re-ran focused integrated contract Vitest and API query Vitest: 3/3 each PASS after W3 cherry-pick. Contracts/API TypeScript PASS; Prisma schema validated using a syntactically valid placeholder test URL, **with no network/database connection for validation**. Architecture passed after splitting historic oversize Option3 QA source.
- Additional integrated live Dashboard, Postgres migration and role/Location E2E must be recorded separately; no claim of production integration approval, CI PASS, migration deployment or data release here.
