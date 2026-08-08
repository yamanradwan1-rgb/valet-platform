-- AddCompositeUniqueSupport
CREATE UNIQUE INDEX "valet_sessions_organization_id_location_id_id_key"
ON "valet_sessions"("organization_id", "location_id", "id");

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "valet_session_id" UUID,
    "actor_membership_id" UUID,
    "event_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "metadata_json" JSONB NOT NULL,
    "idempotency_key" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_events_valet_session_id_occurred_at_idx"
ON "audit_events"("valet_session_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "audit_events"
ADD CONSTRAINT "audit_events_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "audit_events"
ADD CONSTRAINT "audit_events_org_location_id_fkey"
FOREIGN KEY ("organization_id", "location_id")
REFERENCES "locations"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "audit_events"
ADD CONSTRAINT "audit_events_org_location_valet_session_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "valet_session_id")
REFERENCES "valet_sessions"("organization_id", "location_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "audit_events"
ADD CONSTRAINT "audit_events_org_actor_membership_id_fkey"
FOREIGN KEY ("organization_id", "actor_membership_id")
REFERENCES "organization_memberships"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
