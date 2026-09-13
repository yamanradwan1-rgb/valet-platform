CREATE TYPE "incident_recovery_intent_state" AS ENUM ('RESERVED', 'RETIRED');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "incidents"
    WHERE substring("id"::text FROM 15 FOR 1) = '8'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Legacy Incident data already uses the recovery UUIDv8 discriminator.';
  END IF;
END;
$$;

CREATE TABLE "incident_recovery_intents" (
    "incident_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "valet_session_id" UUID NOT NULL,
    "reporting_membership_id" UUID NOT NULL,
    "state" "incident_recovery_intent_state" NOT NULL DEFAULT 'RESERVED',
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "retired_at" TIMESTAMPTZ(3),

    CONSTRAINT "incident_recovery_intents_pkey"
      PRIMARY KEY ("organization_id", "incident_id"),
    CONSTRAINT "incident_recovery_intents_uuid_v8_check" CHECK (
      "incident_id"::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ),
    CONSTRAINT "incident_recovery_intents_retirement_shape_check" CHECK (
      ("state" = 'RESERVED' AND "retired_at" IS NULL)
      OR ("state" = 'RETIRED' AND "retired_at" IS NOT NULL)
    )
);

ALTER TABLE "incident_recovery_intents"
ADD CONSTRAINT "incident_recovery_intents_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "incident_recovery_intents"
ADD CONSTRAINT "incident_recovery_intents_org_location_id_fkey"
FOREIGN KEY ("organization_id", "location_id")
REFERENCES "locations"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "incident_recovery_intents"
ADD CONSTRAINT "incident_recovery_intents_org_location_session_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "valet_session_id")
REFERENCES "valet_sessions"("organization_id", "location_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "incident_recovery_intents"
ADD CONSTRAINT "incident_recovery_intents_org_membership_id_fkey"
FOREIGN KEY ("organization_id", "reporting_membership_id")
REFERENCES "organization_memberships"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "incident_recovery_intent_guard"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'RESERVED' OR NEW.retired_at IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'Incident recovery intents must start RESERVED.';
    END IF;
    NEW.created_at := clock_timestamp();
    NEW.expires_at := NEW.created_at + interval '15 minutes';
    NEW.retired_at := NULL;
    RETURN NEW;
  END IF;

  IF OLD.state <> 'RESERVED' OR NEW.state <> 'RETIRED' THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Incident recovery intent retirement is terminal.';
  END IF;
  IF NEW.incident_id IS DISTINCT FROM OLD.incident_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.location_id IS DISTINCT FROM OLD.location_id
     OR NEW.valet_session_id IS DISTINCT FROM OLD.valet_session_id
     OR NEW.reporting_membership_id IS DISTINCT FROM OLD.reporting_membership_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.retired_at IS DISTINCT FROM OLD.retired_at THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Incident recovery intent binding is immutable.';
  END IF;
  NEW.retired_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "incident_recovery_intent_guard_trigger"
BEFORE INSERT OR UPDATE ON "incident_recovery_intents"
FOR EACH ROW EXECUTE FUNCTION "incident_recovery_intent_guard"();

REVOKE ALL ON FUNCTION "incident_recovery_intent_guard"() FROM PUBLIC;
