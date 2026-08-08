-- CreateEnum
CREATE TYPE "valet_session_state" AS ENUM (
    'CHECKING_IN',
    'AWAITING_PARKING',
    'PARKING',
    'PARKED',
    'REQUESTED',
    'RETRIEVING',
    'READY',
    'HANDOFF_PENDING',
    'COMPLETED'
);

-- AddCompositeUniqueSupport
CREATE UNIQUE INDEX "customers_organization_id_id_key"
ON "customers"("organization_id", "id");

CREATE UNIQUE INDEX "vehicles_organization_id_id_key"
ON "vehicles"("organization_id", "id");

CREATE UNIQUE INDEX "parking_spots_organization_id_location_id_id_key"
ON "parking_spots"("organization_id", "location_id", "id");

CREATE UNIQUE INDEX "key_slots_organization_id_location_id_id_key"
ON "key_slots"("organization_id", "location_id", "id");

-- CreateTable
CREATE TABLE "valet_sessions" (
    "id" UUID NOT NULL,
    "customer_access_token_hash" TEXT NOT NULL,
    "customer_access_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "customer_access_revoked_at" TIMESTAMPTZ(3),
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "customer_id" UUID,
    "state" "valet_session_state" NOT NULL,
    "parking_spot_id" UUID,
    "key_slot_id" UUID,
    "current_assignee_membership_id" UUID,
    "checked_in_by_membership_id" UUID NOT NULL,
    "completed_by_membership_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checking_in_completed_at" TIMESTAMPTZ(3),
    "parking_started_at" TIMESTAMPTZ(3),
    "parked_at" TIMESTAMPTZ(3),
    "retrieval_requested_at" TIMESTAMPTZ(3),
    "retrieval_started_at" TIMESTAMPTZ(3),
    "ready_at" TIMESTAMPTZ(3),
    "handoff_pending_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "valet_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "valet_sessions_version_check" CHECK ("version" >= 1),
    CONSTRAINT "valet_sessions_completed_at_check" CHECK (
        "state" <> 'COMPLETED' OR "completed_at" IS NOT NULL
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "valet_sessions_customer_access_token_hash_key"
ON "valet_sessions"("customer_access_token_hash");

CREATE UNIQUE INDEX "valet_sessions_active_location_vehicle_key"
ON "valet_sessions"("location_id", "vehicle_id")
WHERE "state" <> 'COMPLETED';

CREATE UNIQUE INDEX "valet_sessions_active_parking_spot_id_key"
ON "valet_sessions"("parking_spot_id")
WHERE "parking_spot_id" IS NOT NULL AND "state" <> 'COMPLETED';

CREATE UNIQUE INDEX "valet_sessions_active_key_slot_id_key"
ON "valet_sessions"("key_slot_id")
WHERE "key_slot_id" IS NOT NULL AND "state" <> 'COMPLETED';

-- AddForeignKey
ALTER TABLE "valet_sessions"
ADD CONSTRAINT "valet_sessions_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "valet_sessions"
ADD CONSTRAINT "valet_sessions_org_location_id_fkey"
FOREIGN KEY ("organization_id", "location_id")
REFERENCES "locations"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "valet_sessions"
ADD CONSTRAINT "valet_sessions_org_vehicle_id_fkey"
FOREIGN KEY ("organization_id", "vehicle_id")
REFERENCES "vehicles"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "valet_sessions"
ADD CONSTRAINT "valet_sessions_org_customer_id_fkey"
FOREIGN KEY ("organization_id", "customer_id")
REFERENCES "customers"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "valet_sessions"
ADD CONSTRAINT "valet_sessions_org_location_parking_spot_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "parking_spot_id")
REFERENCES "parking_spots"("organization_id", "location_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "valet_sessions"
ADD CONSTRAINT "valet_sessions_org_location_key_slot_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "key_slot_id")
REFERENCES "key_slots"("organization_id", "location_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "valet_sessions"
ADD CONSTRAINT "valet_sessions_org_current_assignee_id_fkey"
FOREIGN KEY ("organization_id", "current_assignee_membership_id")
REFERENCES "organization_memberships"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "valet_sessions"
ADD CONSTRAINT "valet_sessions_org_checked_in_by_id_fkey"
FOREIGN KEY ("organization_id", "checked_in_by_membership_id")
REFERENCES "organization_memberships"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "valet_sessions"
ADD CONSTRAINT "valet_sessions_org_completed_by_id_fkey"
FOREIGN KEY ("organization_id", "completed_by_membership_id")
REFERENCES "organization_memberships"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
