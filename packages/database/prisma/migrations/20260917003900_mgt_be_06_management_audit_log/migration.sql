CREATE INDEX "audit_events_organization_id_occurred_at_id_idx"
ON "audit_events"("organization_id", "occurred_at" DESC, "id" DESC);
