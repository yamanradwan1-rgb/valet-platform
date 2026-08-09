-- CreateEnum
CREATE TYPE "incident_status" AS ENUM (
    'OPEN',
    'INVESTIGATING',
    'RESOLVED',
    'CLOSED'
);

-- CreateEnum
CREATE TYPE "incident_severity" AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "valet_session_id" UUID NOT NULL,
    "status" "incident_status" NOT NULL,
    "severity" "incident_severity" NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reported_by_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    "resolved_by_membership_id" UUID,
    "resolution_notes" TEXT,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incidents_location_id_status_idx"
ON "incidents"("location_id", "status");

-- AddForeignKey
ALTER TABLE "incidents"
ADD CONSTRAINT "incidents_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "incidents"
ADD CONSTRAINT "incidents_org_location_id_fkey"
FOREIGN KEY ("organization_id", "location_id")
REFERENCES "locations"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "incidents"
ADD CONSTRAINT "incidents_org_location_valet_session_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "valet_session_id")
REFERENCES "valet_sessions"("organization_id", "location_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "incidents"
ADD CONSTRAINT "incidents_org_reported_by_membership_id_fkey"
FOREIGN KEY ("organization_id", "reported_by_membership_id")
REFERENCES "organization_memberships"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "incidents"
ADD CONSTRAINT "incidents_org_resolved_by_membership_id_fkey"
FOREIGN KEY ("organization_id", "resolved_by_membership_id")
REFERENCES "organization_memberships"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
