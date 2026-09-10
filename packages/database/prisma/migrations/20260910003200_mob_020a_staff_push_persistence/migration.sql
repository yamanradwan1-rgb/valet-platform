-- MOB-020A / DEC-073: dedicated provider-neutral Staff push persistence.
-- This migration adds durable registration, intent, and delivery coordination
-- only. It deliberately selects no retry, TTL, lease, or retention values.

CREATE TYPE "staff_push_provider" AS ENUM ('FCM', 'APNS');
CREATE TYPE "staff_push_platform" AS ENUM ('ANDROID', 'IOS');
CREATE TYPE "staff_push_locale" AS ENUM ('en', 'ar');
CREATE TYPE "staff_push_registration_state" AS ENUM (
    'ACTIVE', 'DISABLED', 'PROVIDER_INVALID', 'SUPERSEDED'
);
CREATE TYPE "staff_push_kind" AS ENUM ('EMPLOYEE_RETRIEVAL_REQUESTED');
CREATE TYPE "staff_push_delivery_state" AS ENUM (
    'PENDING', 'LEASED', 'RETRY_WAIT', 'PROVIDER_ACCEPTED', 'SUPPRESSED',
    'PERMANENT_FAILURE', 'EXPIRED'
);
CREATE TYPE "staff_push_provider_result_class" AS ENUM (
    'ACCEPTED', 'TRANSIENT', 'RATE_LIMITED', 'INVALID_ENDPOINT', 'PERMANENT',
    'CONFIGURATION', 'UNKNOWN'
);

CREATE TABLE "staff_push_registrations" (
    "id" UUID NOT NULL,
    "staff_auth_session_id" UUID NOT NULL,
    "provider" "staff_push_provider" NOT NULL,
    "platform" "staff_push_platform" NOT NULL,
    "app_identifier" TEXT NOT NULL,
    "installation_id" UUID NOT NULL,
    "provider_token" TEXT,
    "token_hash" TEXT NOT NULL,
    "app_version" TEXT NOT NULL,
    "app_build" TEXT NOT NULL,
    "locale" "staff_push_locale" NOT NULL,
    "state" "staff_push_registration_state" NOT NULL DEFAULT 'ACTIVE',
    "last_confirmed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminal_at" TIMESTAMPTZ(3),
    "terminal_reason_class" TEXT,
    "superseded_by_registration_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_push_registrations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_push_registrations_provider_app_check" CHECK (
        ("provider" = 'FCM' AND "platform" = 'ANDROID'
            AND "app_identifier" = 'com.vaylet.employee')
        OR
        ("provider" = 'APNS' AND "platform" = 'IOS'
            AND "app_identifier" = 'com.vaylet.employee')
    ),
    CONSTRAINT "staff_push_registrations_token_hash_check" CHECK (
        "token_hash" ~ '^staff-push-token-sha256:v1:[0-9a-f]{64}$'
    ),
    CONSTRAINT "staff_push_registrations_metadata_check" CHECK (
        "app_version" <> '' AND "app_version" = btrim("app_version")
        AND "app_build" <> '' AND "app_build" = btrim("app_build")
        AND "last_confirmed_at" >= "created_at"
        AND ("terminal_at" IS NULL OR "terminal_at" >= "created_at")
    ),
    CONSTRAINT "staff_push_registrations_state_shape_check" CHECK (
        ("state" = 'ACTIVE'
            AND "provider_token" IS NOT NULL
            AND "provider_token" <> ''
            AND "terminal_at" IS NULL
            AND "terminal_reason_class" IS NULL
            AND "superseded_by_registration_id" IS NULL)
        OR
        ("state" IN ('DISABLED', 'PROVIDER_INVALID')
            AND "provider_token" IS NULL
            AND "terminal_at" IS NOT NULL
            AND "terminal_reason_class" IS NOT NULL
            AND btrim("terminal_reason_class") <> ''
            AND "superseded_by_registration_id" IS NULL)
        OR
        ("state" = 'SUPERSEDED'
            AND "provider_token" IS NULL
            AND "terminal_at" IS NOT NULL
            AND "terminal_reason_class" IS NOT NULL
            AND btrim("terminal_reason_class") <> ''
            AND "superseded_by_registration_id" IS NOT NULL
            AND "superseded_by_registration_id" <> "id")
    )
);

CREATE UNIQUE INDEX "staff_push_registrations_active_installation_key"
ON "staff_push_registrations" ("provider", "app_identifier", "installation_id")
WHERE "state" = 'ACTIVE';

CREATE UNIQUE INDEX "staff_push_registrations_active_token_hash_key"
ON "staff_push_registrations" ("provider", "token_hash")
WHERE "state" = 'ACTIVE';

CREATE INDEX "staff_push_registrations_session_state_idx"
ON "staff_push_registrations" ("staff_auth_session_id", "state");

CREATE INDEX "staff_push_registrations_superseded_by_idx"
ON "staff_push_registrations" ("superseded_by_registration_id");

ALTER TABLE "staff_push_registrations"
ADD CONSTRAINT "staff_push_registrations_staff_auth_session_id_fkey"
FOREIGN KEY ("staff_auth_session_id") REFERENCES "staff_auth_sessions"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "staff_push_registrations"
ADD CONSTRAINT "staff_push_registrations_superseded_by_fkey"
FOREIGN KEY ("superseded_by_registration_id")
REFERENCES "staff_push_registrations"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE "staff_push_intents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "valet_session_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "kind" "staff_push_kind" NOT NULL,
    "policy_version" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_push_intents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_push_intents_policy_version_check"
        CHECK ("policy_version" > 0),
    CONSTRAINT "staff_push_intents_expiry_check"
        CHECK ("expires_at" > "created_at")
);

CREATE UNIQUE INDEX "staff_push_intents_organization_id_id_key"
ON "staff_push_intents" ("organization_id", "id");
CREATE UNIQUE INDEX "staff_push_intents_kind_task_id_key"
ON "staff_push_intents" ("kind", "task_id");
CREATE INDEX "staff_push_intents_location_created_at_idx"
ON "staff_push_intents" ("location_id", "created_at", "id");
CREATE INDEX "staff_push_intents_expires_at_idx"
ON "staff_push_intents" ("expires_at", "id");

ALTER TABLE "staff_push_intents"
ADD CONSTRAINT "staff_push_intents_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "staff_push_intents"
ADD CONSTRAINT "staff_push_intents_org_location_id_fkey"
FOREIGN KEY ("organization_id", "location_id")
REFERENCES "locations"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "staff_push_intents"
ADD CONSTRAINT "staff_push_intents_scope_valet_session_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "valet_session_id")
REFERENCES "valet_sessions"("organization_id", "location_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "staff_push_intents"
ADD CONSTRAINT "staff_push_intents_scope_task_id_fkey"
FOREIGN KEY ("organization_id", "location_id", "valet_session_id", "task_id")
REFERENCES "tasks"("organization_id", "location_id", "valet_session_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "staff_push_deliveries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "intent_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "recipient_membership_id" UUID NOT NULL,
    "state" "staff_push_delivery_state" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL,
    "next_attempt_at" TIMESTAMPTZ(3),
    "lease_token" UUID,
    "lease_expires_at" TIMESTAMPTZ(3),
    "provider_result_class" "staff_push_provider_result_class",
    "provider_reference" TEXT,
    "provider_accepted_at" TIMESTAMPTZ(3),
    "terminal_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_push_deliveries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_push_deliveries_attempts_check" CHECK (
        "max_attempts" > 0
        AND "attempt_count" >= 0
        AND "attempt_count" <= "max_attempts"
    ),
    CONSTRAINT "staff_push_deliveries_lease_shape_check" CHECK (
        ("state" = 'LEASED'
            AND "lease_token" IS NOT NULL
            AND "lease_expires_at" IS NOT NULL)
        OR
        ("state" <> 'LEASED'
            AND "lease_token" IS NULL
            AND "lease_expires_at" IS NULL)
    ),
    CONSTRAINT "staff_push_deliveries_terminal_shape_check" CHECK (
        ("state" IN ('PROVIDER_ACCEPTED', 'SUPPRESSED',
                     'PERMANENT_FAILURE', 'EXPIRED')
            AND "terminal_at" IS NOT NULL)
        OR
        ("state" IN ('PENDING', 'LEASED', 'RETRY_WAIT')
            AND "terminal_at" IS NULL)
    ),
    CONSTRAINT "staff_push_deliveries_provider_acceptance_check" CHECK (
        ("state" = 'PROVIDER_ACCEPTED'
            AND "provider_result_class" IS NOT NULL
            AND "provider_result_class" = 'ACCEPTED'
            AND "provider_accepted_at" IS NOT NULL)
        OR
        ("state" <> 'PROVIDER_ACCEPTED'
            AND "provider_accepted_at" IS NULL
            AND "provider_result_class" IS DISTINCT FROM 'ACCEPTED')
    ),
    CONSTRAINT "staff_push_deliveries_scheduling_check" CHECK (
        ("state" = 'PENDING'
            AND "attempt_count" = 0
            AND "next_attempt_at" IS NOT NULL
            AND "provider_result_class" IS NULL)
        OR
        ("state" = 'LEASED'
            AND "attempt_count" > 0
            AND "next_attempt_at" IS NULL
            AND "provider_result_class" IS NULL)
        OR
        ("state" = 'RETRY_WAIT'
            AND "attempt_count" > 0
            AND "attempt_count" < "max_attempts"
            AND "next_attempt_at" IS NOT NULL
            AND "provider_result_class" IS NOT NULL
            AND "provider_result_class" IN (
                'TRANSIENT', 'RATE_LIMITED', 'CONFIGURATION', 'UNKNOWN'
            ))
        OR
        ("state" IN ('PROVIDER_ACCEPTED', 'SUPPRESSED', 'EXPIRED')
            AND "next_attempt_at" IS NULL)
        OR
        ("state" = 'PERMANENT_FAILURE'
            AND "next_attempt_at" IS NULL
            AND "provider_result_class" IS NOT NULL)
    ),
    CONSTRAINT "staff_push_deliveries_timestamp_check" CHECK (
        ("provider_accepted_at" IS NULL
            OR "provider_accepted_at" >= "created_at")
        AND ("terminal_at" IS NULL OR "terminal_at" >= "created_at")
    )
);

CREATE UNIQUE INDEX "staff_push_deliveries_intent_registration_key"
ON "staff_push_deliveries" ("intent_id", "registration_id");
CREATE UNIQUE INDEX "staff_push_deliveries_lease_token_key"
ON "staff_push_deliveries" ("lease_token");
CREATE INDEX "staff_push_deliveries_due_idx"
ON "staff_push_deliveries" ("state", "next_attempt_at", "created_at", "id");
CREATE INDEX "staff_push_deliveries_lease_expiry_idx"
ON "staff_push_deliveries" ("lease_expires_at", "id");
CREATE INDEX "staff_push_deliveries_registration_state_idx"
ON "staff_push_deliveries" ("registration_id", "state");
CREATE INDEX "staff_push_deliveries_recipient_state_idx"
ON "staff_push_deliveries" (
    "organization_id", "recipient_membership_id", "state"
);

ALTER TABLE "staff_push_deliveries"
ADD CONSTRAINT "staff_push_deliveries_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "staff_push_deliveries"
ADD CONSTRAINT "staff_push_deliveries_org_intent_id_fkey"
FOREIGN KEY ("organization_id", "intent_id")
REFERENCES "staff_push_intents"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "staff_push_deliveries"
ADD CONSTRAINT "staff_push_deliveries_registration_id_fkey"
FOREIGN KEY ("registration_id") REFERENCES "staff_push_registrations"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "staff_push_deliveries"
ADD CONSTRAINT "staff_push_deliveries_org_recipient_membership_id_fkey"
FOREIGN KEY ("organization_id", "recipient_membership_id")
REFERENCES "organization_memberships"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "staff_push_registration_guard"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.state <> 'ACTIVE' THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'Staff push registrations must start ACTIVE.';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.state <> 'ACTIVE' THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'Terminal Staff push registrations are immutable.';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.staff_auth_session_id IS DISTINCT FROM OLD.staff_auth_session_id
       OR NEW.provider IS DISTINCT FROM OLD.provider
       OR NEW.platform IS DISTINCT FROM OLD.platform
       OR NEW.app_identifier IS DISTINCT FROM OLD.app_identifier
       OR NEW.installation_id IS DISTINCT FROM OLD.installation_id
       OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
       OR (NEW.provider_token IS DISTINCT FROM OLD.provider_token
           AND NEW.state = 'ACTIVE')
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'Staff push registration identity is immutable.';
    END IF;
    IF NEW.state NOT IN ('ACTIVE', 'DISABLED', 'PROVIDER_INVALID', 'SUPERSEDED') THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'Invalid Staff push registration transition.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "staff_push_registration_guard_trigger"
BEFORE INSERT OR UPDATE ON "staff_push_registrations"
FOR EACH ROW EXECUTE FUNCTION "staff_push_registration_guard"();

CREATE FUNCTION "staff_push_intent_immutable_guard"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'Staff push intents are immutable.';
END;
$$;

CREATE TRIGGER "staff_push_intent_immutable_guard_trigger"
BEFORE UPDATE ON "staff_push_intents"
FOR EACH ROW EXECUTE FUNCTION "staff_push_intent_immutable_guard"();

CREATE FUNCTION "staff_push_delivery_guard"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    transition_allowed BOOLEAN;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.state <> 'PENDING' THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'Staff push deliveries must start PENDING.';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.intent_id IS DISTINCT FROM OLD.intent_id
       OR NEW.registration_id IS DISTINCT FROM OLD.registration_id
       OR NEW.recipient_membership_id IS DISTINCT FROM OLD.recipient_membership_id
       OR NEW.max_attempts IS DISTINCT FROM OLD.max_attempts
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'Staff push delivery identity is immutable.';
    END IF;

    transition_allowed :=
        (OLD.state = 'PENDING'
            AND NEW.state IN ('LEASED', 'SUPPRESSED', 'EXPIRED'))
        OR (OLD.state = 'RETRY_WAIT'
            AND NEW.state IN ('LEASED', 'SUPPRESSED', 'EXPIRED'))
        OR (OLD.state = 'LEASED'
            AND NEW.state IN ('LEASED', 'PROVIDER_ACCEPTED', 'RETRY_WAIT',
                              'SUPPRESSED', 'PERMANENT_FAILURE', 'EXPIRED'));
    IF NOT transition_allowed THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'Invalid Staff push delivery transition.';
    END IF;

    IF NEW.state = 'LEASED' THEN
        IF NEW.attempt_count <> OLD.attempt_count + 1
           OR NEW.lease_token IS NOT DISTINCT FROM OLD.lease_token
           OR NEW.lease_expires_at <= transaction_timestamp()
           OR (OLD.state = 'LEASED'
               AND OLD.lease_expires_at > transaction_timestamp()) THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'Invalid Staff push delivery claim.';
        END IF;
    ELSIF NEW.attempt_count <> OLD.attempt_count THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'Staff push attempt count changes only at claim.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "staff_push_delivery_guard_trigger"
BEFORE INSERT OR UPDATE ON "staff_push_deliveries"
FOR EACH ROW EXECUTE FUNCTION "staff_push_delivery_guard"();

REVOKE ALL ON FUNCTION "staff_push_registration_guard"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "staff_push_intent_immutable_guard"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "staff_push_delivery_guard"() FROM PUBLIC;
