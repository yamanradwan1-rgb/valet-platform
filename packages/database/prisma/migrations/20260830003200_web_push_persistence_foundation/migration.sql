-- DEC-071 T1: persistence only. No domain command writes delivery rows and no
-- Web Push delivery runtime is introduced by this migration.

CREATE TYPE "web_push_audience" AS ENUM ('EMPLOYEE', 'GUEST');
CREATE TYPE "web_push_presentation_type" AS ENUM (
    'EMPLOYEE_RETRIEVAL_REQUESTED', 'GUEST_VEHICLE_READY'
);
CREATE TYPE "web_push_delivery_status" AS ENUM (
    'PENDING', 'ACCEPTED', 'TERMINAL', 'SUPPRESSED'
);
CREATE TYPE "web_push_disabled_reason" AS ENUM (
    'UNSUBSCRIBED', 'IDENTITY_CHANGED', 'SESSION_REVOKED',
    'SESSION_EXPIRED', 'GUEST_ACCESS_CHANGED',
    'VALET_SESSION_COMPLETED', 'ENDPOINT_GONE', 'DECRYPTION_FAILED',
    'REPLACED'
);
CREATE TYPE "web_push_failure_class" AS ENUM (
    'NETWORK', 'RATE_LIMITED', 'PUSH_SERVICE', 'CONFIGURATION', 'PAYLOAD',
    'ENDPOINT_GONE', 'DECRYPTION', 'AUTHORITY'
);

ALTER TABLE "valet_sessions"
ADD COLUMN "customer_access_generation" UUID;

-- Only currently usable, non-placeholder credentials receive compatibility
-- metadata. Disabled, revoked, and expired rows acquire a fresh generation on
-- their next normal issue/rotate/reissue command.
UPDATE "valet_sessions"
SET "customer_access_generation" = gen_random_uuid()
WHERE "customer_access_token_hash" NOT LIKE 'disabled:intake:%'
  AND "customer_access_revoked_at" IS NULL
  AND "customer_access_expires_at" > CURRENT_TIMESTAMP;

CREATE TABLE "web_push_subscriptions" (
    "id" UUID NOT NULL,
    "audience" "web_push_audience" NOT NULL,
    "endpoint_fingerprint" TEXT NOT NULL,
    "endpoint_ciphertext" TEXT,
    "p256dh_ciphertext" TEXT,
    "auth_ciphertext" TEXT,
    "encryption_key_version" TEXT,
    "browser_expires_at" TIMESTAMPTZ(3),
    "locale" TEXT NOT NULL,
    "staff_auth_session_id" UUID,
    "guest_valet_session_id" UUID,
    "guest_access_generation" UUID,
    "disabled_at" TIMESTAMPTZ(3),
    "disabled_reason" "web_push_disabled_reason",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "web_push_subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "web_push_subscriptions_locale_check"
      CHECK ("locale" IN ('en', 'ar')),
    CONSTRAINT "web_push_subscriptions_endpoint_fingerprint_check"
      CHECK ("endpoint_fingerprint" ~ '^hmac-sha256:v1:[0-9a-f]{64}$'),
    CONSTRAINT "web_push_subscriptions_principal_check" CHECK (
      ("audience" = 'EMPLOYEE'
       AND "staff_auth_session_id" IS NOT NULL
       AND "guest_valet_session_id" IS NULL
       AND "guest_access_generation" IS NULL)
      OR
      ("audience" = 'GUEST'
       AND "staff_auth_session_id" IS NULL
       AND "guest_valet_session_id" IS NOT NULL
       AND "guest_access_generation" IS NOT NULL)
    ),
    CONSTRAINT "web_push_subscriptions_credential_tombstone_check" CHECK (
      ("disabled_at" IS NULL AND "disabled_reason" IS NULL
       AND "endpoint_ciphertext" IS NOT NULL
       AND "p256dh_ciphertext" IS NOT NULL
       AND "auth_ciphertext" IS NOT NULL
       AND "encryption_key_version" IS NOT NULL)
      OR
      ("disabled_at" IS NOT NULL AND "disabled_reason" IS NOT NULL
       AND "endpoint_ciphertext" IS NULL
       AND "p256dh_ciphertext" IS NULL
       AND "auth_ciphertext" IS NULL
       AND "encryption_key_version" IS NULL)
    )
);

CREATE UNIQUE INDEX "web_push_subscriptions_active_endpoint_fingerprint_key"
ON "web_push_subscriptions"("endpoint_fingerprint")
WHERE "disabled_at" IS NULL;
CREATE INDEX "web_push_subscriptions_staff_session_status_idx"
ON "web_push_subscriptions"("staff_auth_session_id", "disabled_at");
CREATE INDEX "web_push_subscriptions_guest_context_status_idx"
ON "web_push_subscriptions"(
  "guest_valet_session_id", "guest_access_generation", "disabled_at"
);

ALTER TABLE "web_push_subscriptions"
ADD CONSTRAINT "web_push_subscriptions_staff_auth_session_id_fkey"
FOREIGN KEY ("staff_auth_session_id") REFERENCES "staff_auth_sessions"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "web_push_subscriptions"
ADD CONSTRAINT "web_push_subscriptions_guest_session_id_fkey"
FOREIGN KEY ("guest_valet_session_id")
REFERENCES "valet_sessions"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "web_push_delivery_intents" (
    "id" UUID NOT NULL,
    "presentation_type" "web_push_presentation_type" NOT NULL,
    "task_id" UUID,
    "valet_session_id" UUID,
    "guest_ready_at" TIMESTAMPTZ(3),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "web_push_delivery_intents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "web_push_delivery_intents_identity_check" CHECK (
      ("presentation_type" = 'EMPLOYEE_RETRIEVAL_REQUESTED'
       AND "task_id" IS NOT NULL
       AND "valet_session_id" IS NULL AND "guest_ready_at" IS NULL)
      OR
      ("presentation_type" = 'GUEST_VEHICLE_READY'
       AND "task_id" IS NULL
       AND "valet_session_id" IS NOT NULL AND "guest_ready_at" IS NOT NULL)
    ),
    CONSTRAINT "web_push_delivery_intents_expiry_check"
      CHECK ("expires_at" > "occurred_at")
);

CREATE UNIQUE INDEX "web_push_delivery_intents_employee_task_key"
ON "web_push_delivery_intents"("task_id")
WHERE "presentation_type" = 'EMPLOYEE_RETRIEVAL_REQUESTED';
CREATE UNIQUE INDEX "web_push_delivery_intents_guest_ready_key"
ON "web_push_delivery_intents"("valet_session_id", "guest_ready_at")
WHERE "presentation_type" = 'GUEST_VEHICLE_READY';
CREATE INDEX "web_push_delivery_intents_expires_at_idx"
ON "web_push_delivery_intents"("expires_at");
ALTER TABLE "web_push_delivery_intents"
ADD CONSTRAINT "web_push_delivery_intents_task_id_fkey"
FOREIGN KEY ("task_id") REFERENCES "tasks"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "web_push_delivery_intents"
ADD CONSTRAINT "web_push_delivery_intents_valet_session_id_fkey"
FOREIGN KEY ("valet_session_id") REFERENCES "valet_sessions"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "web_push_deliveries" (
    "id" UUID NOT NULL,
    "intent_id" UUID NOT NULL,
    "push_subscription_id" UUID NOT NULL,
    "status" "web_push_delivery_status" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL,
    "lease_token" UUID,
    "lease_expires_at" TIMESTAMPTZ(3),
    "accepted_at" TIMESTAMPTZ(3),
    "terminal_at" TIMESTAMPTZ(3),
    "suppressed_at" TIMESTAMPTZ(3),
    "last_failure_class" "web_push_failure_class",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "web_push_deliveries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "web_push_deliveries_attempt_count_check"
      CHECK ("attempt_count" >= 0),
    CONSTRAINT "web_push_deliveries_lease_pair_check"
      CHECK (("lease_token" IS NULL) = ("lease_expires_at" IS NULL)),
    CONSTRAINT "web_push_deliveries_outcome_check" CHECK (
      ("status" = 'PENDING' AND "accepted_at" IS NULL
       AND "terminal_at" IS NULL AND "suppressed_at" IS NULL)
      OR ("status" = 'ACCEPTED' AND "accepted_at" IS NOT NULL
       AND "terminal_at" IS NULL AND "suppressed_at" IS NULL)
      OR ("status" = 'TERMINAL' AND "accepted_at" IS NULL
       AND "terminal_at" IS NOT NULL AND "suppressed_at" IS NULL)
      OR ("status" = 'SUPPRESSED' AND "accepted_at" IS NULL
       AND "terminal_at" IS NULL AND "suppressed_at" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "web_push_deliveries_intent_id_subscription_id_key"
ON "web_push_deliveries"("intent_id", "push_subscription_id");
CREATE INDEX "web_push_deliveries_status_next_attempt_at_idx"
ON "web_push_deliveries"("status", "next_attempt_at");
CREATE INDEX "web_push_deliveries_lease_expires_at_idx"
ON "web_push_deliveries"("lease_expires_at");
ALTER TABLE "web_push_deliveries"
ADD CONSTRAINT "web_push_deliveries_intent_id_fkey"
FOREIGN KEY ("intent_id") REFERENCES "web_push_delivery_intents"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "web_push_deliveries"
ADD CONSTRAINT "web_push_deliveries_subscription_id_fkey"
FOREIGN KEY ("push_subscription_id") REFERENCES "web_push_subscriptions"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

REVOKE DELETE, TRUNCATE ON TABLE
  "web_push_subscriptions", "web_push_delivery_intents", "web_push_deliveries"
FROM PUBLIC;
