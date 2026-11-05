-- Issue #414 ALT-09: source-authorized 7-day attention lists filter by the
-- server-recorded timestamp, NOT GPS-device occurred_at. This partial index
-- supports the outer org/location/recorded_at DESC/id DESC LIMIT 21 path;
-- existing tracker/area occurred_at indexes remain responsible for peer proof.
-- Additive/future-only migration. No source/history mutation or data backfill.
--
-- A partial PostgreSQL index has no lossless Prisma schema @@index equivalent.
-- Measure EXPLAIN (ANALYZE, BUFFERS) on the real source reader before release.
CREATE INDEX "geofence_events_alt09_scope_recorded_idx"
  ON "geofence_events" (
    "organization_id", "location_id", "recorded_at" DESC, "id" DESC
  )
  WHERE "event_type" = 'VIOLATION'::"geofence_event_type";
