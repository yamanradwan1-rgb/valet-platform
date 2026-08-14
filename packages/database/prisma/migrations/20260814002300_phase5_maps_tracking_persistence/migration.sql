CREATE TYPE "location_map_point_kind" AS ENUM (
    'ENTRANCE', 'PICKUP', 'DROP_OFF'
);

CREATE TYPE "location_map_area_purpose" AS ENUM (
    'PARKING', 'OVERFLOW', 'STAGING', 'RESTRICTED'
);

CREATE TYPE "geofence_event_type" AS ENUM (
    'ENTERED', 'EXITED', 'VIOLATION'
);

ALTER TABLE "organizations"
ADD COLUMN "tracking_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "raw_gps_retention_days" INTEGER NOT NULL DEFAULT 30,
ADD CONSTRAINT "organizations_raw_gps_retention_days_check"
CHECK ("raw_gps_retention_days" > 0);

ALTER TABLE "locations"
ADD COLUMN "tracking_enabled_override" BOOLEAN,
ADD COLUMN "raw_gps_retention_days_override" INTEGER,
ADD CONSTRAINT "locations_raw_gps_retention_days_override_check"
CHECK (
    "raw_gps_retention_days_override" IS NULL
    OR "raw_gps_retention_days_override" > 0
);

CREATE TABLE "location_map_points" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "kind" "location_map_point_kind" NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "level_label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "location_map_points_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "location_map_points_latitude_check"
        CHECK ("latitude" BETWEEN -90 AND 90),
    CONSTRAINT "location_map_points_longitude_check"
        CHECK ("longitude" BETWEEN -180 AND 180)
);

CREATE TABLE "location_map_areas" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "parking_zone_id" UUID,
    "purpose" "location_map_area_purpose" NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "level_label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "location_map_areas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "location_map_area_vertices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "map_area_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "location_map_area_vertices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "location_map_area_vertices_position_check"
        CHECK ("position" >= 0),
    CONSTRAINT "location_map_area_vertices_latitude_check"
        CHECK ("latitude" BETWEEN -90 AND 90),
    CONSTRAINT "location_map_area_vertices_longitude_check"
        CHECK ("longitude" BETWEEN -180 AND 180)
);

CREATE TABLE "task_tracking_sessions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "valet_session_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),
    CONSTRAINT "task_tracking_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "task_tracking_sessions_time_order_check"
        CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at")
);

CREATE FUNCTION "enforce_task_tracking_session_ended_at_once"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD."ended_at" IS NOT NULL
       AND NEW."ended_at" IS DISTINCT FROM OLD."ended_at" THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'task_tracking_sessions_ended_at_once_check',
            MESSAGE = 'An ended tracking session cannot be reopened or rewritten.';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "enforce_task_tracking_session_ended_at_once"()
FROM PUBLIC;

CREATE TRIGGER "task_tracking_sessions_ended_at_once_trigger"
BEFORE UPDATE OF "ended_at" ON "task_tracking_sessions"
FOR EACH ROW
EXECUTE FUNCTION "enforce_task_tracking_session_ended_at_once"();

CREATE TABLE "raw_gps_samples" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "valet_session_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "tracking_session_id" UUID NOT NULL,
    "client_sample_id" UUID NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "captured_at" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT "raw_gps_samples_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "raw_gps_samples_latitude_check"
        CHECK ("latitude" BETWEEN -90 AND 90),
    CONSTRAINT "raw_gps_samples_longitude_check"
        CHECK ("longitude" BETWEEN -180 AND 180)
);

CREATE TABLE "geofence_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "valet_session_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "tracking_session_id" UUID NOT NULL,
    "map_area_id" UUID NOT NULL,
    "event_type" "geofence_event_type" NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT "geofence_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "location_map_points_location_id_code_key"
ON "location_map_points"("location_id", "code");
CREATE UNIQUE INDEX "location_map_areas_location_id_code_key"
ON "location_map_areas"("location_id", "code");
CREATE UNIQUE INDEX "location_map_areas_scope_id_key"
ON "location_map_areas"("organization_id", "location_id", "id");
CREATE UNIQUE INDEX "location_map_area_vertices_area_position_key"
ON "location_map_area_vertices"("map_area_id", "position");
CREATE UNIQUE INDEX "task_tracking_sessions_scope_id_key"
ON "task_tracking_sessions"(
    "organization_id", "location_id", "valet_session_id", "task_id", "id"
);
CREATE UNIQUE INDEX "task_tracking_sessions_one_active_per_task_idx"
ON "task_tracking_sessions"("task_id") WHERE "ended_at" IS NULL;
CREATE UNIQUE INDEX "task_tracking_sessions_one_active_per_session_idx"
ON "task_tracking_sessions"("valet_session_id") WHERE "ended_at" IS NULL;
CREATE INDEX "task_tracking_sessions_session_started_at_id_idx"
ON "task_tracking_sessions"("valet_session_id", "started_at", "id");
CREATE UNIQUE INDEX "raw_gps_samples_tracking_client_sample_key"
ON "raw_gps_samples"("tracking_session_id", "client_sample_id");
CREATE INDEX "raw_gps_samples_tracking_captured_at_id_idx"
ON "raw_gps_samples"("tracking_session_id", "captured_at", "id");
CREATE INDEX "raw_gps_samples_received_at_idx"
ON "raw_gps_samples"("received_at");
CREATE INDEX "geofence_events_tracking_occurred_at_id_idx"
ON "geofence_events"("tracking_session_id", "occurred_at", "id");
CREATE INDEX "geofence_events_area_occurred_at_id_idx"
ON "geofence_events"("map_area_id", "occurred_at", "id");

ALTER TABLE "location_map_points" ADD CONSTRAINT "location_map_points_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "location_map_points" ADD CONSTRAINT "location_map_points_org_location_id_fkey"
FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "location_map_areas" ADD CONSTRAINT "location_map_areas_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "location_map_areas" ADD CONSTRAINT "location_map_areas_org_location_id_fkey"
FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "location_map_areas" ADD CONSTRAINT "location_map_areas_org_location_parking_zone_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "parking_zone_id") REFERENCES "parking_zones"("organization_id", "location_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "location_map_area_vertices" ADD CONSTRAINT "location_map_area_vertices_scope_area_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "map_area_id") REFERENCES "location_map_areas"("organization_id", "location_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "task_tracking_sessions" ADD CONSTRAINT "task_tracking_sessions_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "task_tracking_sessions" ADD CONSTRAINT "task_tracking_sessions_org_location_id_fkey"
FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "task_tracking_sessions" ADD CONSTRAINT "task_tracking_sessions_org_location_session_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "valet_session_id") REFERENCES "valet_sessions"("organization_id", "location_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "task_tracking_sessions" ADD CONSTRAINT "task_tracking_sessions_task_scope_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "valet_session_id", "task_id") REFERENCES "tasks"("organization_id", "location_id", "valet_session_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "raw_gps_samples" ADD CONSTRAINT "raw_gps_samples_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "raw_gps_samples" ADD CONSTRAINT "raw_gps_samples_org_location_id_fkey"
FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "raw_gps_samples" ADD CONSTRAINT "raw_gps_samples_org_location_session_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "valet_session_id") REFERENCES "valet_sessions"("organization_id", "location_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "raw_gps_samples" ADD CONSTRAINT "raw_gps_samples_task_scope_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "valet_session_id", "task_id") REFERENCES "tasks"("organization_id", "location_id", "valet_session_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "raw_gps_samples" ADD CONSTRAINT "raw_gps_samples_tracking_scope_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "valet_session_id", "task_id", "tracking_session_id") REFERENCES "task_tracking_sessions"("organization_id", "location_id", "valet_session_id", "task_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_org_location_id_fkey"
FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_org_location_session_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "valet_session_id") REFERENCES "valet_sessions"("organization_id", "location_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_task_scope_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "valet_session_id", "task_id") REFERENCES "tasks"("organization_id", "location_id", "valet_session_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_tracking_scope_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "valet_session_id", "task_id", "tracking_session_id") REFERENCES "task_tracking_sessions"("organization_id", "location_id", "valet_session_id", "task_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_scope_map_area_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "map_area_id") REFERENCES "location_map_areas"("organization_id", "location_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
