-- Existing current assignments cannot be rewritten into invented Zones or deduplicated.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "valet_sessions" WHERE "parking_spot_id" IS NOT NULL
    ) THEN
        RAISE EXCEPTION
            'VAL-005A migration requires explicit reconciliation of existing parking_spot_id assignments before adding mandatory Zone/Spot integrity';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "valet_sessions"
        WHERE "key_slot_id" IS NOT NULL
        GROUP BY "key_slot_id"
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION
            'VAL-005A migration cannot safely deduplicate existing current KeySlot assignments';
    END IF;
END
$$;

-- CreateEnum
CREATE TYPE "parking_zone_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "key_custody_event_type" AS ENUM (
    'SLOT_ASSIGNED',
    'CHECKED_OUT',
    'RETURNED_TO_SLOT',
    'SLOT_CLEARED',
    'RELEASED'
);

-- CreateTable
CREATE TABLE "parking_zones" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "parking_zone_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "parking_zones_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "parking_spots"
ADD COLUMN "parking_zone_id" UUID;

-- AlterTable
ALTER TABLE "valet_sessions"
ADD COLUMN "parking_zone_id" UUID,
ADD CONSTRAINT "valet_sessions_parking_spot_requires_zone_check"
CHECK ("parking_spot_id" IS NULL OR "parking_zone_id" IS NOT NULL);

-- Replace active-state occupancy with current-assignment exclusivity.
DROP INDEX "valet_sessions_active_parking_spot_id_key";
DROP INDEX "valet_sessions_active_key_slot_id_key";

CREATE UNIQUE INDEX "valet_sessions_parking_spot_id_key"
ON "valet_sessions"("parking_spot_id")
WHERE "parking_spot_id" IS NOT NULL;

CREATE UNIQUE INDEX "valet_sessions_key_slot_id_key"
ON "valet_sessions"("key_slot_id")
WHERE "key_slot_id" IS NOT NULL;

-- CreateTable
CREATE TABLE "key_custody_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "valet_session_id" UUID NOT NULL,
    "key_slot_id" UUID,
    "actor_membership_id" UUID NOT NULL,
    "event_type" "key_custody_event_type" NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "key_custody_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "key_custody_events_slot_required_check" CHECK (
        "event_type" = 'RELEASED' OR "key_slot_id" IS NOT NULL
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "parking_zones_location_id_code_key"
ON "parking_zones"("location_id", "code");

CREATE UNIQUE INDEX "parking_zones_organization_id_location_id_id_key"
ON "parking_zones"("organization_id", "location_id", "id");

CREATE UNIQUE INDEX "parking_spots_org_location_zone_id_id_key"
ON "parking_spots"("organization_id", "location_id", "parking_zone_id", "id");

CREATE INDEX "key_custody_events_valet_session_id_occurred_at_id_idx"
ON "key_custody_events"("valet_session_id", "occurred_at", "id");

-- Replace the loose Spot relation with an exact Zone/Spot relation.
ALTER TABLE "valet_sessions"
DROP CONSTRAINT "valet_sessions_org_location_parking_spot_id_fkey";

-- AddForeignKey
ALTER TABLE "parking_zones"
ADD CONSTRAINT "parking_zones_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "parking_zones"
ADD CONSTRAINT "parking_zones_org_location_id_fkey"
FOREIGN KEY ("organization_id", "location_id")
REFERENCES "locations"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "parking_spots"
ADD CONSTRAINT "parking_spots_org_location_zone_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "parking_zone_id")
REFERENCES "parking_zones"("organization_id", "location_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "valet_sessions"
ADD CONSTRAINT "valet_sessions_org_location_parking_zone_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "parking_zone_id")
REFERENCES "parking_zones"("organization_id", "location_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "valet_sessions"
ADD CONSTRAINT "valet_sessions_org_location_zone_parking_spot_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "parking_zone_id", "parking_spot_id")
REFERENCES "parking_spots"("organization_id", "location_id", "parking_zone_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "key_custody_events"
ADD CONSTRAINT "key_custody_events_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "key_custody_events"
ADD CONSTRAINT "key_custody_events_org_location_id_fkey"
FOREIGN KEY ("organization_id", "location_id")
REFERENCES "locations"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "key_custody_events"
ADD CONSTRAINT "key_custody_events_org_location_session_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "valet_session_id")
REFERENCES "valet_sessions"("organization_id", "location_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "key_custody_events"
ADD CONSTRAINT "key_custody_events_org_location_key_slot_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "key_slot_id")
REFERENCES "key_slots"("organization_id", "location_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "key_custody_events"
ADD CONSTRAINT "key_custody_events_org_actor_membership_id_fkey"
FOREIGN KEY ("organization_id", "actor_membership_id")
REFERENCES "organization_memberships"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;
