-- Issue #215 P1: append-only, tenant-bound condition-photo byte evidence.
-- The API still owns JPEG decoding, exact token revalidation and location authorization.
-- Existing vehicle_photos remain unqualified unless a NEW verification child is committed.
-- Atomic DDL keeps temporary PostgreSQL PUBLIC EXECUTE defaults from becoming visible.
BEGIN;

CREATE TYPE "condition_photo_upload_status" AS ENUM
  ('PENDING', 'VERIFIED', 'EXPIRED', 'REJECTED');
CREATE TYPE "condition_photo_attempt_status" AS ENUM
  ('WRITING', 'STORED', 'SELECTED', 'ABANDONED');
CREATE TYPE "condition_photo_availability_state" AS ENUM
  ('AVAILABLE', 'UNAVAILABLE');

CREATE UNIQUE INDEX "vehicle_photos_verification_scope_key"
  ON "vehicle_photos" ("id", "organization_id", "location_id",
    "valet_session_id", "captured_by_membership_id", "purpose", "storage_object_key");
CREATE UNIQUE INDEX "vehicle_photos_availability_scope_key"
  ON "vehicle_photos" ("id", "organization_id", "location_id", "valet_session_id");

CREATE TABLE "condition_photo_upload_operations" (
  "id" UUID NOT NULL PRIMARY KEY,
  "client_operation_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "valet_session_id" UUID NOT NULL,
  "actor_membership_id" UUID NOT NULL,
  "purpose" "vehicle_photo_purpose" NOT NULL DEFAULT 'CHECK_IN_CONDITION',
  "source_sha256" BYTEA NOT NULL,
  "source_byte_size" INTEGER NOT NULL,
  "normalization_version" INTEGER NOT NULL,
  "status" "condition_photo_upload_status" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verified_photo_id" UUID,
  "last_failure_code" TEXT,
  "next_attempt_number" BIGINT NOT NULL DEFAULT 1,
  CONSTRAINT "condition_photo_operations_source_check" CHECK
    (octet_length("source_sha256") = 32
      AND "source_byte_size" BETWEEN 1 AND 8388608
      AND "normalization_version" BETWEEN 1 AND 32767),
  CONSTRAINT "condition_photo_operations_times_check" CHECK
    ("expires_at" > "created_at" AND "updated_at" >= "created_at"),
  CONSTRAINT "condition_photo_operations_link_check" CHECK
    (("status" = 'VERIFIED') = ("verified_photo_id" IS NOT NULL)),
  CONSTRAINT "condition_photo_operations_failure_check" CHECK
    ("last_failure_code" IS NULL OR
     ("last_failure_code" ~ '^[A-Z][A-Z0-9_]{0,63}$')),
  CONSTRAINT "condition_photo_operations_counter_check" CHECK
    ("next_attempt_number" >= 1)
);

CREATE UNIQUE INDEX "condition_photo_operations_member_client_key"
  ON "condition_photo_upload_operations" ("actor_membership_id", "client_operation_id");
CREATE UNIQUE INDEX "condition_photo_operations_scope_key"
  ON "condition_photo_upload_operations" ("id", "organization_id", "location_id",
    "valet_session_id", "actor_membership_id", "purpose");
CREATE UNIQUE INDEX "condition_photo_operations_attempt_scope_key"
  ON "condition_photo_upload_operations" ("id", "organization_id",
    "location_id", "valet_session_id", "actor_membership_id");
CREATE UNIQUE INDEX "condition_photo_operations_verified_photo_key"
  ON "condition_photo_upload_operations" ("verified_photo_id");
CREATE UNIQUE INDEX "condition_photo_operations_pending_member_session_key"
  ON "condition_photo_upload_operations" ("actor_membership_id",
    "valet_session_id", "purpose") WHERE "status" = 'PENDING';
CREATE INDEX "condition_photo_operations_recovery_idx"
  ON "condition_photo_upload_operations" ("organization_id", "location_id",
    "valet_session_id", "actor_membership_id", "created_at" DESC, "id" DESC);
CREATE INDEX "condition_photo_operations_pending_expiry_idx"
  ON "condition_photo_upload_operations" ("expires_at", "id")
  WHERE "status" = 'PENDING';

CREATE TABLE "condition_photo_upload_attempts" (
  "id" UUID NOT NULL PRIMARY KEY,
  "operation_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "valet_session_id" UUID NOT NULL,
  "actor_membership_id" UUID NOT NULL,
  "attempt_number" BIGINT NOT NULL,
  "object_key" TEXT NOT NULL,
  "bucket_alias" TEXT NOT NULL,
  "object_version" TEXT,
  "status" "condition_photo_attempt_status" NOT NULL DEFAULT 'WRITING',
  "lease_owner" UUID,
  "lease_expires_at" TIMESTAMPTZ(3),
  "canonical_sha256" BYTEA,
  "canonical_byte_size" INTEGER,
  "width" INTEGER,
  "height" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "stored_at" TIMESTAMPTZ(3),
  "selected_at" TIMESTAMPTZ(3),
  "abandoned_at" TIMESTAMPTZ(3),
  "last_cleanup_checked_at" TIMESTAMPTZ(3),
  "normalization_version" INTEGER NOT NULL,
  CONSTRAINT "condition_photo_attempts_number_check" CHECK ("attempt_number" > 0),
  CONSTRAINT "condition_photo_attempts_key_check" CHECK
    (char_length("object_key") BETWEEN 10 AND 240
     AND "object_key" !~ '[[:cntrl:]]'
     AND char_length("bucket_alias") BETWEEN 1 AND 60
     AND "bucket_alias" ~ '^[a-z][a-z0-9_-]*$'),
  CONSTRAINT "condition_photo_attempts_version_check" CHECK
    ("object_version" IS NULL OR
      (char_length("object_version") BETWEEN 1 AND 240
       AND "object_version" !~ '[[:cntrl:]]')),
  CONSTRAINT "condition_photo_attempts_content_check" CHECK
    ((("canonical_sha256" IS NULL) =
      ("canonical_byte_size" IS NULL)) AND
     (("canonical_sha256" IS NULL) = ("width" IS NULL)) AND
     (("canonical_sha256" IS NULL) = ("height" IS NULL)) AND
     ("canonical_sha256" IS NULL OR
       (octet_length("canonical_sha256") = 32
       AND "canonical_byte_size" BETWEEN 1 AND 8388608
       AND "width" BETWEEN 1 AND 4096 AND "height" BETWEEN 1 AND 4096
       AND "width"::BIGINT * "height"::BIGINT <= 12000000))),
  CONSTRAINT "condition_photo_attempts_lease_check" CHECK
    (("lease_owner" IS NULL) = ("lease_expires_at" IS NULL)),
  CONSTRAINT "condition_photo_attempts_status_check" CHECK
    (("status" = 'WRITING' AND "stored_at" IS NULL
      AND "selected_at" IS NULL AND "abandoned_at" IS NULL)
     OR ("status" = 'STORED' AND "stored_at" IS NOT NULL
       AND "selected_at" IS NULL AND "abandoned_at" IS NULL
       AND "canonical_sha256" IS NOT NULL)
     OR ("status" = 'SELECTED' AND "stored_at" IS NOT NULL
       AND "selected_at" IS NOT NULL AND "abandoned_at" IS NULL
       AND "canonical_sha256" IS NOT NULL AND "lease_owner" IS NULL)
     OR ("status" = 'ABANDONED' AND "selected_at" IS NULL
       AND "abandoned_at" IS NOT NULL AND "lease_owner" IS NULL)),
  CONSTRAINT "condition_photo_attempts_normalization_check" CHECK
    ("normalization_version" BETWEEN 1 AND 32767)
);

CREATE UNIQUE INDEX "condition_photo_attempts_operation_number_key"
  ON "condition_photo_upload_attempts" ("operation_id", "attempt_number");
CREATE UNIQUE INDEX "condition_photo_attempts_object_key_key"
  ON "condition_photo_upload_attempts" ("object_key");
CREATE UNIQUE INDEX "condition_photo_attempts_verification_scope_key"
  ON "condition_photo_upload_attempts" ("id", "operation_id",
    "organization_id", "location_id", "valet_session_id",
    "actor_membership_id", "object_key");
CREATE UNIQUE INDEX "condition_photo_attempts_one_open_key"
  ON "condition_photo_upload_attempts" ("operation_id")
  WHERE "status" IN ('WRITING', 'STORED');
CREATE UNIQUE INDEX "condition_photo_attempts_one_selected_key"
  ON "condition_photo_upload_attempts" ("operation_id")
  WHERE "status" = 'SELECTED';
CREATE INDEX "condition_photo_attempts_live_lease_idx"
  ON "condition_photo_upload_attempts"
    ("actor_membership_id", "status", "lease_expires_at");
CREATE INDEX "condition_photo_attempts_abandoned_sweep_idx"
  ON "condition_photo_upload_attempts" ("last_cleanup_checked_at", "id")
  WHERE "status" = 'ABANDONED';

CREATE TABLE "vehicle_photo_verifications" (
  "vehicle_photo_id" UUID NOT NULL PRIMARY KEY,
  "operation_id" UUID NOT NULL,
  "attempt_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "valet_session_id" UUID NOT NULL,
  "captured_by_membership_id" UUID NOT NULL,
  "purpose" "vehicle_photo_purpose" NOT NULL,
  "object_key" TEXT NOT NULL,
  "verified_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "byte_size" INTEGER NOT NULL,
  "content_sha256" BYTEA NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "normalization_version" INTEGER NOT NULL,
  CONSTRAINT "vehicle_photo_verifications_bytes_check" CHECK
    (octet_length("content_sha256") = 32 AND
     "byte_size" BETWEEN 1 AND 8388608 AND
     "width" BETWEEN 1 AND 4096 AND "height" BETWEEN 1 AND 4096 AND
     "width"::BIGINT * "height"::BIGINT <= 12000000 AND
     "normalization_version" BETWEEN 1 AND 32767),
  CONSTRAINT "vehicle_photo_verifications_operation_key" UNIQUE ("operation_id"),
  CONSTRAINT "vehicle_photo_verifications_attempt_key" UNIQUE ("attempt_id"),
  CONSTRAINT "vehicle_photo_verifications_op_photo_key"
    UNIQUE ("operation_id", "vehicle_photo_id")
);
CREATE INDEX "vehicle_photo_verifications_scope_idx"
  ON "vehicle_photo_verifications"
    ("organization_id", "location_id", "valet_session_id", "purpose");
CREATE UNIQUE INDEX "vehicle_photo_verifications_photo_relation_key"
  ON "vehicle_photo_verifications" ("vehicle_photo_id", "organization_id",
    "location_id", "valet_session_id", "captured_by_membership_id", "purpose", "object_key");
CREATE UNIQUE INDEX "vehicle_photo_verifications_operation_relation_key"
  ON "vehicle_photo_verifications" ("operation_id", "organization_id", "location_id",
    "valet_session_id", "captured_by_membership_id", "purpose");
CREATE UNIQUE INDEX "vehicle_photo_verifications_attempt_relation_key"
  ON "vehicle_photo_verifications" ("attempt_id", "operation_id", "organization_id",
    "location_id", "valet_session_id", "captured_by_membership_id", "object_key");

CREATE UNIQUE INDEX "audit_events_condition_photo_verified_operation_key"
  ON "audit_events" ("organization_id", "idempotency_key")
  WHERE "event_type" = 'CHECK_IN_CONDITION_PHOTO_VERIFIED';

CREATE TABLE "vehicle_photo_availability" (
  "vehicle_photo_id" UUID NOT NULL PRIMARY KEY,
  "organization_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "valet_session_id" UUID NOT NULL,
  "state" "condition_photo_availability_state" NOT NULL DEFAULT 'AVAILABLE',
  "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" TEXT,
  CONSTRAINT "vehicle_photo_availability_reason_check" CHECK
    (("state" = 'AVAILABLE' AND "reason" IS NULL) OR
     ("state" = 'UNAVAILABLE' AND
      "reason" ~ '^[A-Z][A-Z0-9_]{0,63}$'))
);

CREATE TABLE "condition_photo_upload_admission" (
  "user_id" UUID NOT NULL PRIMARY KEY,
  CONSTRAINT "condition_photo_upload_admission_user_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "vehicle_photo_availability_photo_relation_key"
  ON "vehicle_photo_availability" ("vehicle_photo_id", "organization_id",
    "location_id", "valet_session_id");

ALTER TABLE "condition_photo_upload_operations"
  ADD CONSTRAINT "condition_photo_operations_organization_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "condition_photo_operations_location_fkey"
    FOREIGN KEY ("organization_id", "location_id")
    REFERENCES "locations"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "condition_photo_operations_session_fkey"
    FOREIGN KEY ("organization_id", "location_id", "valet_session_id")
    REFERENCES "valet_sessions"("organization_id", "location_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "condition_photo_operations_actor_fkey"
    FOREIGN KEY ("organization_id", "actor_membership_id")
    REFERENCES "organization_memberships"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "condition_photo_upload_attempts"
  ADD CONSTRAINT "condition_photo_attempts_operation_fkey"
    FOREIGN KEY ("operation_id", "organization_id", "location_id",
       "valet_session_id", "actor_membership_id")
    REFERENCES "condition_photo_upload_operations" ("id", "organization_id",
       "location_id", "valet_session_id", "actor_membership_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "condition_photo_attempts_organization_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "condition_photo_attempts_location_fkey"
    FOREIGN KEY ("organization_id", "location_id")
    REFERENCES "locations"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "condition_photo_attempts_session_fkey"
    FOREIGN KEY ("organization_id", "location_id", "valet_session_id")
    REFERENCES "valet_sessions"("organization_id", "location_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "condition_photo_attempts_actor_fkey"
    FOREIGN KEY ("organization_id", "actor_membership_id")
    REFERENCES "organization_memberships"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "vehicle_photo_verifications"
  ADD CONSTRAINT "vehicle_photo_verifications_photo_scope_fkey"
    FOREIGN KEY ("vehicle_photo_id", "organization_id", "location_id",
      "valet_session_id", "captured_by_membership_id", "purpose", "object_key")
    REFERENCES "vehicle_photos" ("id", "organization_id", "location_id",
      "valet_session_id", "captured_by_membership_id", "purpose", "storage_object_key")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "vehicle_photo_verifications_operation_scope_fkey"
    FOREIGN KEY ("operation_id", "organization_id", "location_id",
      "valet_session_id", "captured_by_membership_id", "purpose")
    REFERENCES "condition_photo_upload_operations" ("id", "organization_id",
      "location_id", "valet_session_id", "actor_membership_id", "purpose")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "vehicle_photo_verifications_attempt_scope_fkey"
    FOREIGN KEY ("attempt_id", "operation_id", "organization_id", "location_id",
      "valet_session_id", "captured_by_membership_id", "object_key")
    REFERENCES "condition_photo_upload_attempts" ("id", "operation_id",
      "organization_id", "location_id", "valet_session_id", "actor_membership_id", "object_key")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "vehicle_photo_verifications_organization_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "vehicle_photo_verifications_location_fkey"
    FOREIGN KEY ("organization_id", "location_id")
    REFERENCES "locations"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "vehicle_photo_verifications_session_fkey"
    FOREIGN KEY ("organization_id", "location_id", "valet_session_id")
    REFERENCES "valet_sessions"("organization_id", "location_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "vehicle_photo_verifications_actor_fkey"
    FOREIGN KEY ("organization_id", "captured_by_membership_id")
    REFERENCES "organization_memberships"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "vehicle_photo_availability"
  ADD CONSTRAINT "vehicle_photo_availability_photo_scope_fkey"
    FOREIGN KEY ("vehicle_photo_id", "organization_id", "location_id", "valet_session_id")
    REFERENCES "vehicle_photos" ("id", "organization_id", "location_id", "valet_session_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "vehicle_photo_availability_verified_photo_fkey"
    FOREIGN KEY ("vehicle_photo_id")
    REFERENCES "vehicle_photo_verifications" ("vehicle_photo_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "vehicle_photo_availability_organization_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "vehicle_photo_availability_location_fkey"
    FOREIGN KEY ("organization_id", "location_id")
    REFERENCES "locations"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "vehicle_photo_availability_session_fkey"
    FOREIGN KEY ("organization_id", "location_id", "valet_session_id")
    REFERENCES "valet_sessions"("organization_id", "location_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "condition_photo_upload_operations"
  ADD CONSTRAINT "condition_photo_operations_verified_link_fkey"
    FOREIGN KEY ("id", "verified_photo_id")
    REFERENCES "vehicle_photo_verifications" ("operation_id", "vehicle_photo_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;

-- No generic mutation or PUBLIC function execution is granted by this migration.
REVOKE ALL ON TABLE "condition_photo_upload_operations",
  "condition_photo_upload_attempts", "vehicle_photo_verifications",
  "vehicle_photo_availability", "condition_photo_upload_admission" FROM PUBLIC;

-- Deferrable transaction coherence permits T2 to atomically insert photo,
-- verification, availability and audit, then select the attempt/operation.
CREATE FUNCTION public.condition_photo_coherence_guard()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE v_op RECORD;
DECLARE v_attempt RECORD;
DECLARE v_verification RECORD;
BEGIN
  IF TG_TABLE_NAME = 'condition_photo_upload_operations' THEN
    SELECT * INTO v_op FROM public.condition_photo_upload_operations
      WHERE id = NEW.id;
  ELSIF TG_TABLE_NAME = 'condition_photo_upload_attempts' THEN
    SELECT * INTO v_op FROM public.condition_photo_upload_operations
      WHERE id = NEW.operation_id;
  ELSE
    SELECT * INTO v_op FROM public.condition_photo_upload_operations
      WHERE id = NEW.operation_id;
  END IF;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_verification FROM public.vehicle_photo_verifications
    WHERE operation_id = v_op.id;
  IF v_op.status = 'VERIFIED' THEN
    IF v_op.verified_photo_id IS DISTINCT FROM v_verification.vehicle_photo_id THEN
      RAISE EXCEPTION 'Condition photo operation/verification mismatch' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_attempt FROM public.condition_photo_upload_attempts
      WHERE id = v_verification.attempt_id AND operation_id = v_op.id;
    IF NOT FOUND OR v_attempt.status <> 'SELECTED'
      OR v_attempt.selected_at IS NULL
      OR v_attempt.canonical_sha256 IS DISTINCT FROM v_verification.content_sha256
      OR v_attempt.canonical_byte_size IS DISTINCT FROM v_verification.byte_size
      OR v_attempt.width IS DISTINCT FROM v_verification.width
      OR v_attempt.height IS DISTINCT FROM v_verification.height
      OR v_attempt.normalization_version IS DISTINCT FROM v_verification.normalization_version THEN
      RAISE EXCEPTION 'Condition photo selected-byte evidence mismatch' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.audit_events ae WHERE
        ae.organization_id = v_op.organization_id
        AND ae.location_id = v_op.location_id
        AND ae.valet_session_id = v_op.valet_session_id
        AND ae.actor_membership_id = v_op.actor_membership_id
        AND ae.entity_type = 'ValetSession'
        AND ae.entity_id = v_op.valet_session_id
        AND ae.event_type = 'CHECK_IN_CONDITION_PHOTO_VERIFIED'
        AND ae.idempotency_key = 'condition-photo:' || v_op.id::TEXT
        AND ae.metadata_json = '{"purpose":"CHECK_IN_CONDITION","mediaCategory":"image","verificationVersion":1}'::JSONB
    ) THEN
      RAISE EXCEPTION 'Condition photo missing verification audit' USING ERRCODE = '23514';
    END IF;
  ELSIF FOUND THEN
    RAISE EXCEPTION 'Condition photo verification requires VERIFIED operation' USING ERRCODE = '23514';
  END IF;
  IF v_op.status <> 'VERIFIED' AND EXISTS (
    SELECT 1 FROM public.condition_photo_upload_attempts
      WHERE operation_id = v_op.id AND status = 'SELECTED'
  ) THEN
    RAISE EXCEPTION 'Condition photo selected attempt requires verification'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "condition_photo_operation_coherence"
AFTER INSERT OR UPDATE ON "condition_photo_upload_operations"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.condition_photo_coherence_guard();
CREATE CONSTRAINT TRIGGER "condition_photo_attempt_coherence"
AFTER INSERT OR UPDATE ON "condition_photo_upload_attempts"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.condition_photo_coherence_guard();
CREATE CONSTRAINT TRIGGER "condition_photo_verification_coherence"
AFTER INSERT OR UPDATE ON "vehicle_photo_verifications"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.condition_photo_coherence_guard();

CREATE FUNCTION public.condition_photo_write_guard()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Condition photo history cannot be deleted' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'vehicle_photo_verifications' THEN
    RAISE EXCEPTION 'Condition photo verification is immutable' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'condition_photo_upload_operations' THEN
    IF ROW(NEW.id, NEW.client_operation_id, NEW.organization_id,
      NEW.location_id, NEW.valet_session_id, NEW.actor_membership_id,
      NEW.purpose, NEW.source_sha256, NEW.source_byte_size,
      NEW.normalization_version, NEW.created_at, NEW.expires_at)
      IS DISTINCT FROM ROW(OLD.id, OLD.client_operation_id, OLD.organization_id,
      OLD.location_id, OLD.valet_session_id, OLD.actor_membership_id,
      OLD.purpose, OLD.source_sha256, OLD.source_byte_size,
      OLD.normalization_version, OLD.created_at, OLD.expires_at)
      OR OLD.status IN ('VERIFIED', 'EXPIRED', 'REJECTED')
      OR (NEW.status = 'PENDING' AND OLD.status <> 'PENDING')
      OR (NEW.status = 'VERIFIED' AND NEW.verified_photo_id IS NULL)
    THEN
      RAISE EXCEPTION 'Condition photo operation changed outside allowed transition'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'condition_photo_upload_attempts' THEN
    IF OLD.status = 'ABANDONED'
      AND ROW(NEW.id, NEW.operation_id, NEW.organization_id, NEW.location_id,
        NEW.valet_session_id, NEW.actor_membership_id, NEW.attempt_number,
        NEW.object_key, NEW.bucket_alias, NEW.object_version, NEW.status,
        NEW.lease_owner, NEW.lease_expires_at, NEW.canonical_sha256,
        NEW.canonical_byte_size, NEW.width, NEW.height, NEW.created_at,
        NEW.stored_at, NEW.selected_at, NEW.abandoned_at,
        NEW.normalization_version)
        IS NOT DISTINCT FROM
        ROW(OLD.id, OLD.operation_id, OLD.organization_id, OLD.location_id,
        OLD.valet_session_id, OLD.actor_membership_id, OLD.attempt_number,
        OLD.object_key, OLD.bucket_alias, OLD.object_version, OLD.status,
        OLD.lease_owner, OLD.lease_expires_at, OLD.canonical_sha256,
        OLD.canonical_byte_size, OLD.width, OLD.height, OLD.created_at,
        OLD.stored_at, OLD.selected_at, OLD.abandoned_at,
        OLD.normalization_version)
      AND NEW.last_cleanup_checked_at IS NOT NULL THEN
      RETURN NEW;
    END IF;
    -- Read-back metadata becomes immutable as soon as storage is confirmed.
    -- Reclaiming a STORED lease may only rotate lease ownership, not evidence.
    IF OLD.status = 'STORED' AND (
      NEW.status NOT IN ('STORED', 'SELECTED', 'ABANDONED')
      OR ROW(NEW.object_version, NEW.canonical_sha256,
        NEW.canonical_byte_size, NEW.width, NEW.height, NEW.stored_at)
        IS DISTINCT FROM
        ROW(OLD.object_version, OLD.canonical_sha256,
        OLD.canonical_byte_size, OLD.width, OLD.height, OLD.stored_at)
    ) THEN
      RAISE EXCEPTION 'Condition photo stored-byte evidence is immutable'
        USING ERRCODE = '23514';
    END IF;
    IF ROW(NEW.id, NEW.operation_id, NEW.organization_id, NEW.location_id,
      NEW.valet_session_id, NEW.actor_membership_id, NEW.attempt_number,
      NEW.object_key, NEW.bucket_alias, NEW.created_at,
      NEW.normalization_version)
      IS DISTINCT FROM ROW(OLD.id, OLD.operation_id, OLD.organization_id,
      OLD.location_id, OLD.valet_session_id, OLD.actor_membership_id,
      OLD.attempt_number, OLD.object_key, OLD.bucket_alias, OLD.created_at,
      OLD.normalization_version)
      OR OLD.status IN ('SELECTED', 'ABANDONED')
      OR (NEW.status = 'WRITING' AND OLD.status <> 'WRITING')
    THEN
      RAISE EXCEPTION 'Condition photo attempt immutable/fenced identity'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "condition_photo_operations_write_guard"
BEFORE UPDATE OR DELETE ON "condition_photo_upload_operations"
FOR EACH ROW EXECUTE FUNCTION public.condition_photo_write_guard();
CREATE TRIGGER "condition_photo_attempts_write_guard"
BEFORE UPDATE OR DELETE ON "condition_photo_upload_attempts"
FOR EACH ROW EXECUTE FUNCTION public.condition_photo_write_guard();
CREATE TRIGGER "condition_photo_verifications_write_guard"
BEFORE UPDATE OR DELETE ON "vehicle_photo_verifications"
FOR EACH ROW EXECUTE FUNCTION public.condition_photo_write_guard();
CREATE TRIGGER "condition_photo_availability_delete_guard"
BEFORE DELETE ON "vehicle_photo_availability"
FOR EACH ROW EXECUTE FUNCTION public.condition_photo_write_guard();

-- Helper used only by the definer entry points; every call re-derives scope.
CREATE FUNCTION public.condition_photo_authorized_scope(
  p_user_id UUID, p_membership_id UUID, p_session_id UUID)
RETURNS TABLE(organization_id UUID, location_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT s.organization_id, s.location_id
  FROM public.valet_sessions s
  JOIN public.organization_memberships m ON m.id = p_membership_id
    AND m.organization_id = s.organization_id AND m.user_id = p_user_id
    AND m.status = 'ACTIVE'
    AND m.role IN ('VALET_EMPLOYEE', 'VALET_SUPERVISOR')
  JOIN public.membership_location_access mla
    ON mla.organization_id = s.organization_id
    AND mla.location_id = s.location_id
    AND mla.membership_id = m.id
  JOIN public.users u ON u.id = m.user_id AND u.status = 'ACTIVE'
  JOIN public.organizations o ON o.id = s.organization_id AND o.status = 'ACTIVE'
  JOIN public.locations l ON l.id = s.location_id
    AND l.organization_id = s.organization_id AND l.status = 'ACTIVE'
  WHERE s.id = p_session_id AND s.state = 'CHECKING_IN'
    AND s.check_in_condition_completed_at IS NULL;
$$;

-- A User-scoped synchronization row, never a process-local or Membership-scoped cap.
CREATE FUNCTION public.condition_photo_lock_admission(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.condition_photo_upload_admission(user_id)
    VALUES (p_user_id) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM public.condition_photo_upload_admission
    WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo admission unavailable' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION public.condition_photo_check_capacity(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_live INTEGER;
BEGIN
  SELECT count(*) INTO v_live
  FROM public.condition_photo_upload_attempts a
  JOIN public.organization_memberships m ON m.id = a.actor_membership_id
  JOIN public.condition_photo_upload_operations o ON o.id = a.operation_id
  WHERE m.user_id = p_user_id AND o.status = 'PENDING'
    AND a.status IN ('WRITING', 'STORED')
    AND a.lease_expires_at > clock_timestamp();
  IF v_live >= 2 THEN
    RAISE EXCEPTION 'Condition photo concurrent upload limit reached'
      USING ERRCODE = '53300';
  END IF;
END;
$$;

-- T1: caller has already revalidated the *exact* auth session before bytes.
-- DB function independently validates persistent identity, scope and session.
CREATE FUNCTION public.condition_photo_reserve_upload(
  p_user_id UUID, p_membership_id UUID, p_session_id UUID,
  p_client_operation_id UUID, p_source_sha256 BYTEA,
  p_source_byte_size INTEGER, p_normalization_version INTEGER, p_bucket_alias TEXT)
RETURNS TABLE(operation_id UUID, attempt_id UUID, object_key TEXT,
  lease_owner UUID, lease_expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_org UUID;
DECLARE v_loc UUID;
DECLARE v_op public.condition_photo_upload_operations%ROWTYPE;
DECLARE v_attempt public.condition_photo_upload_attempts%ROWTYPE;
DECLARE v_now TIMESTAMPTZ;
BEGIN
  SELECT s.organization_id, s.location_id INTO v_org, v_loc
    FROM public.condition_photo_authorized_scope(
      p_user_id, p_membership_id, p_session_id) s;
  IF NOT FOUND OR p_client_operation_id IS NULL
    OR octet_length(p_source_sha256) <> 32
    OR p_source_byte_size NOT BETWEEN 1 AND 8388608
    OR p_normalization_version NOT BETWEEN 1 AND 32767
    OR p_bucket_alias !~ '^[a-z][a-z0-9_-]{0,59}$' THEN
    RAISE EXCEPTION 'Condition photo reserve not authorized or invalid'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.condition_photo_lock_admission(p_user_id);
  PERFORM 1 FROM public.valet_sessions
    WHERE id = p_session_id AND state = 'CHECKING_IN'
      AND check_in_condition_completed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
      RAISE EXCEPTION 'Condition photo session no longer eligible' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.condition_photo_authorized_scope(
    p_user_id, p_membership_id, p_session_id)
    WHERE organization_id = v_org AND location_id = v_loc;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo actor authority changed' USING ERRCODE = '42501';
  END IF;
  v_now := clock_timestamp();

  SELECT * INTO v_op FROM public.condition_photo_upload_operations
    WHERE actor_membership_id = p_membership_id
      AND client_operation_id = p_client_operation_id FOR UPDATE;
  IF FOUND THEN
    IF v_op.organization_id <> v_org OR v_op.location_id <> v_loc
      OR v_op.valet_session_id <> p_session_id
      OR v_op.source_sha256 <> p_source_sha256
      OR v_op.source_byte_size <> p_source_byte_size
      OR v_op.normalization_version <> p_normalization_version
      OR v_op.status <> 'PENDING' OR v_op.expires_at <= v_now THEN
      RAISE EXCEPTION 'Condition photo replay conflict' USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_attempt FROM public.condition_photo_upload_attempts a
      WHERE a.operation_id = v_op.id AND a.status IN ('WRITING', 'STORED')
        AND a.lease_expires_at > v_now;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Condition photo operation requires explicit reconcile'
        USING ERRCODE = '55000';
    END IF;
  ELSE
    PERFORM public.condition_photo_check_capacity(p_user_id);
    INSERT INTO public.condition_photo_upload_operations (
      id, client_operation_id, organization_id, location_id, valet_session_id,
      actor_membership_id, purpose, source_sha256, source_byte_size,
      normalization_version, status, created_at, expires_at, updated_at, next_attempt_number
    ) VALUES (
      gen_random_uuid(), p_client_operation_id, v_org, v_loc, p_session_id,
      p_membership_id, 'CHECK_IN_CONDITION', p_source_sha256, p_source_byte_size,
      p_normalization_version, 'PENDING', v_now, v_now + interval '30 minutes', v_now, 2
    ) RETURNING * INTO v_op;
    INSERT INTO public.condition_photo_upload_attempts (
      id, operation_id, organization_id, location_id, valet_session_id,
      actor_membership_id, attempt_number, object_key, bucket_alias, status,
      lease_owner, lease_expires_at, normalization_version, created_at
    ) SELECT a.id, v_op.id, v_org, v_loc, p_session_id, p_membership_id,
      1, 'condition-photo/' || v_op.id || '/' || a.id, p_bucket_alias,
      'WRITING', gen_random_uuid(), v_now + interval '120 seconds',
      p_normalization_version, v_now
      FROM (SELECT gen_random_uuid() AS id) a RETURNING * INTO v_attempt;
  END IF;
  RETURN QUERY SELECT v_op.id, v_attempt.id, v_attempt.object_key,
    v_attempt.lease_owner, v_attempt.lease_expires_at;
END;
$$;

-- Explicit resend/reconcile claim: old object keys survive as tombstones.
-- Callers must prove provider write-once/read-back semantics before selecting bytes.
CREATE FUNCTION public.condition_photo_claim_upload(
  p_user_id UUID, p_membership_id UUID, p_operation_id UUID,
  p_reconcile_existing BOOLEAN, p_bucket_alias TEXT)
RETURNS TABLE(operation_id UUID, attempt_id UUID, object_key TEXT,
  lease_owner UUID, lease_expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_op public.condition_photo_upload_operations%ROWTYPE;
DECLARE v_attempt public.condition_photo_upload_attempts%ROWTYPE;
DECLARE v_now TIMESTAMPTZ;
BEGIN
  PERFORM public.condition_photo_lock_admission(p_user_id);
  SELECT * INTO v_op FROM public.condition_photo_upload_operations
    WHERE id = p_operation_id AND actor_membership_id = p_membership_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo operation not found' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.condition_photo_authorized_scope(
    p_user_id, p_membership_id, v_op.valet_session_id)
    WHERE organization_id = v_op.organization_id AND location_id = v_op.location_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo recovery scope denied' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.valet_sessions
    WHERE id = v_op.valet_session_id AND state = 'CHECKING_IN'
      AND check_in_condition_completed_at IS NULL FOR UPDATE;
  v_now := clock_timestamp();
  IF NOT FOUND OR v_op.status <> 'PENDING' OR v_op.expires_at <= v_now THEN
    RAISE EXCEPTION 'Condition photo operation not recoverable'
      USING ERRCODE = '55000';
  END IF;
  PERFORM 1 FROM public.condition_photo_authorized_scope(
    p_user_id, p_membership_id, v_op.valet_session_id)
    WHERE organization_id = v_op.organization_id AND location_id = v_op.location_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo recovery authority changed'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_op FROM public.condition_photo_upload_operations
    WHERE id = p_operation_id AND actor_membership_id = p_membership_id FOR UPDATE;
  v_now := clock_timestamp();
  IF v_op.status <> 'PENDING' OR v_op.expires_at <= v_now THEN
    RAISE EXCEPTION 'Condition photo operation no longer recoverable'
      USING ERRCODE = '55000';
  END IF;
  SELECT * INTO v_attempt FROM public.condition_photo_upload_attempts a
    WHERE a.operation_id = v_op.id AND a.status IN ('WRITING', 'STORED')
    FOR UPDATE;
  IF FOUND AND v_attempt.lease_expires_at > v_now THEN
    RAISE EXCEPTION 'Condition photo attempt still leased' USING ERRCODE = '55P03';
  END IF;
  PERFORM public.condition_photo_check_capacity(p_user_id);
  IF p_reconcile_existing AND v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'Condition photo has no stored object to reconcile'
      USING ERRCODE = '55000';
  END IF;
  IF p_reconcile_existing THEN
    UPDATE public.condition_photo_upload_attempts SET
      lease_owner = gen_random_uuid(),
      lease_expires_at = LEAST(v_op.expires_at, v_now + interval '120 seconds')
      WHERE id = v_attempt.id RETURNING * INTO v_attempt;
  ELSE
    IF p_bucket_alias IS NULL OR p_bucket_alias !~ '^[a-z][a-z0-9_-]{0,59}$' THEN
      RAISE EXCEPTION 'Condition photo bucket alias invalid' USING ERRCODE = '22023';
    END IF;
    IF v_attempt.id IS NOT NULL THEN
      UPDATE public.condition_photo_upload_attempts SET
        status = 'ABANDONED', abandoned_at = v_now,
        lease_owner = NULL, lease_expires_at = NULL
        WHERE id = v_attempt.id;
    END IF;
    INSERT INTO public.condition_photo_upload_attempts (
      id, operation_id, organization_id, location_id, valet_session_id,
      actor_membership_id, attempt_number, object_key, bucket_alias, status,
      lease_owner, lease_expires_at, normalization_version, created_at
    ) SELECT a.id, v_op.id, v_op.organization_id, v_op.location_id,
      v_op.valet_session_id, v_op.actor_membership_id,
      v_op.next_attempt_number, 'condition-photo/' || v_op.id || '/' || a.id,
      p_bucket_alias, 'WRITING', gen_random_uuid(),
      LEAST(v_op.expires_at, v_now + interval '120 seconds'),
      v_op.normalization_version, v_now
      FROM (SELECT gen_random_uuid() AS id) a RETURNING * INTO v_attempt;
    UPDATE public.condition_photo_upload_operations
      SET next_attempt_number = next_attempt_number + 1, updated_at = v_now
      WHERE id = v_op.id;
  END IF;
  RETURN QUERY SELECT v_op.id, v_attempt.id, v_attempt.object_key,
    v_attempt.lease_owner, v_attempt.lease_expires_at;
END;
$$;

-- Durable object read-back. This marks an independent storage fact, never a
-- qualifying vehicle photo or audit. The server verifies actual bytes outside
-- this transaction; a client must never supply these values directly.
CREATE FUNCTION public.condition_photo_mark_stored(
  p_user_id UUID, p_membership_id UUID, p_operation_id UUID,
  p_attempt_id UUID, p_lease_owner UUID, p_object_version TEXT,
  p_canonical_sha256 BYTEA, p_canonical_byte_size INTEGER,
  p_width INTEGER, p_height INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_op public.condition_photo_upload_operations%ROWTYPE;
DECLARE v_attempt public.condition_photo_upload_attempts%ROWTYPE;
DECLARE v_now TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_op FROM public.condition_photo_upload_operations
    WHERE id = p_operation_id AND actor_membership_id = p_membership_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo operation not found' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.valet_sessions
    WHERE id = v_op.valet_session_id AND state = 'CHECKING_IN'
      AND check_in_condition_completed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo session cannot store' USING ERRCODE = '55000';
  END IF;
  PERFORM 1 FROM public.condition_photo_authorized_scope(
    p_user_id, p_membership_id, v_op.valet_session_id)
    WHERE organization_id = v_op.organization_id AND location_id = v_op.location_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo storage scope denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_op FROM public.condition_photo_upload_operations
    WHERE id = p_operation_id AND actor_membership_id = p_membership_id FOR UPDATE;
  v_now := clock_timestamp();
  IF v_op.status <> 'PENDING' OR v_op.expires_at <= v_now THEN
    RAISE EXCEPTION 'Condition photo operation cannot store' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO v_attempt FROM public.condition_photo_upload_attempts
    WHERE id = p_attempt_id AND operation_id = v_op.id FOR UPDATE;
  IF NOT FOUND OR v_attempt.status NOT IN ('WRITING', 'STORED')
    OR p_lease_owner IS NULL OR v_attempt.lease_owner IS DISTINCT FROM p_lease_owner
    OR v_attempt.lease_expires_at <= clock_timestamp()
    OR octet_length(p_canonical_sha256) <> 32
    OR p_canonical_byte_size NOT BETWEEN 1 AND 8388608
    OR p_width NOT BETWEEN 1 AND 4096 OR p_height NOT BETWEEN 1 AND 4096
    OR p_width::BIGINT * p_height::BIGINT > 12000000
    OR (p_object_version IS NOT NULL AND
      (char_length(p_object_version) NOT BETWEEN 1 AND 240
        OR p_object_version ~ '[[:cntrl:]]')) THEN
    RAISE EXCEPTION 'Condition photo storage facts invalid or lease stale'
      USING ERRCODE = '55000';
  END IF;
  IF v_attempt.status = 'STORED' THEN
    IF ROW(v_attempt.object_version, v_attempt.canonical_sha256,
      v_attempt.canonical_byte_size, v_attempt.width, v_attempt.height)
      IS DISTINCT FROM ROW(p_object_version, p_canonical_sha256,
        p_canonical_byte_size, p_width, p_height) THEN
      RAISE EXCEPTION 'Condition photo stored bytes conflict' USING ERRCODE = '23505';
    END IF;
    RETURN FALSE;
  END IF;
  UPDATE public.condition_photo_upload_attempts
    SET status = 'STORED', stored_at = v_now,
      object_version = p_object_version, canonical_sha256 = p_canonical_sha256,
      canonical_byte_size = p_canonical_byte_size, width = p_width, height = p_height
    WHERE id = v_attempt.id;
  UPDATE public.condition_photo_upload_operations
    SET last_failure_code = NULL, updated_at = v_now WHERE id = v_op.id;
  RETURN TRUE;
END;
$$;

-- A failed/unknown provider outcome is informational, never proof of absence.
-- Preserve both the current live lease and object key for explicit probing.
CREATE FUNCTION public.condition_photo_record_failure(
  p_user_id UUID, p_membership_id UUID, p_operation_id UUID,
  p_attempt_id UUID, p_lease_owner UUID, p_safe_error_code TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_op public.condition_photo_upload_operations%ROWTYPE;
DECLARE v_attempt public.condition_photo_upload_attempts%ROWTYPE;
DECLARE v_now TIMESTAMPTZ;
BEGIN
  IF p_safe_error_code IS NULL OR p_safe_error_code NOT IN (
    'STORAGE_UNAVAILABLE', 'STORAGE_TIMEOUT', 'STORAGE_OUTCOME_UNKNOWN',
    'READBACK_UNAVAILABLE', 'VERIFIER_UNAVAILABLE'
  ) THEN
    RAISE EXCEPTION 'Condition photo failure reason invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_op FROM public.condition_photo_upload_operations
    WHERE id = p_operation_id AND actor_membership_id = p_membership_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo operation not found' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.valet_sessions
    WHERE id = v_op.valet_session_id AND state = 'CHECKING_IN'
      AND check_in_condition_completed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo session cannot record failure' USING ERRCODE = '55000';
  END IF;
  PERFORM 1 FROM public.condition_photo_authorized_scope(
    p_user_id, p_membership_id, v_op.valet_session_id)
    WHERE organization_id = v_op.organization_id AND location_id = v_op.location_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo failure scope denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_op FROM public.condition_photo_upload_operations
    WHERE id = p_operation_id AND actor_membership_id = p_membership_id FOR UPDATE;
  v_now := clock_timestamp();
  IF v_op.status <> 'PENDING' OR v_op.expires_at <= v_now THEN
    RAISE EXCEPTION 'Condition photo operation cannot record failure' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO v_attempt FROM public.condition_photo_upload_attempts
    WHERE id = p_attempt_id AND operation_id = v_op.id FOR UPDATE;
  IF NOT FOUND OR v_attempt.status <> 'WRITING'
    OR p_lease_owner IS NULL OR v_attempt.lease_owner IS DISTINCT FROM p_lease_owner
    OR v_attempt.lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Condition photo failure lease invalid' USING ERRCODE = '55000';
  END IF;
  IF v_op.last_failure_code IS NOT DISTINCT FROM p_safe_error_code THEN
    RETURN FALSE;
  END IF;
  UPDATE public.condition_photo_upload_operations
    SET last_failure_code = p_safe_error_code, updated_at = v_now
    WHERE id = v_op.id;
  RETURN TRUE;
END;
$$;

-- T2: a trusted server verifier supplies decoded, normalized, private-object
-- facts. Call in the same transaction as exact-token + auth boundary locks.
CREATE FUNCTION public.condition_photo_finalize_upload(
  p_user_id UUID, p_membership_id UUID, p_operation_id UUID,
  p_attempt_id UUID, p_lease_owner UUID, p_object_version TEXT,
  p_canonical_sha256 BYTEA, p_canonical_byte_size INTEGER,
  p_width INTEGER, p_height INTEGER)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_op public.condition_photo_upload_operations%ROWTYPE;
DECLARE v_attempt public.condition_photo_upload_attempts%ROWTYPE;
DECLARE v_photo_id UUID;
DECLARE v_now TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_op FROM public.condition_photo_upload_operations
    WHERE id = p_operation_id AND actor_membership_id = p_membership_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo operation not found' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.valet_sessions
    WHERE id = v_op.valet_session_id AND state = 'CHECKING_IN'
      AND check_in_condition_completed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo session cannot finalize' USING ERRCODE = '55000';
  END IF;
  PERFORM 1 FROM public.condition_photo_authorized_scope(
    p_user_id, p_membership_id, v_op.valet_session_id)
    WHERE organization_id = v_op.organization_id AND location_id = v_op.location_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo finalization scope denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_op FROM public.condition_photo_upload_operations
    WHERE id = p_operation_id AND actor_membership_id = p_membership_id FOR UPDATE;
  IF v_op.status = 'VERIFIED' THEN
    IF EXISTS (
      SELECT 1 FROM public.vehicle_photo_verifications
      WHERE operation_id = v_op.id AND attempt_id = p_attempt_id
    ) THEN
      RETURN v_op.verified_photo_id;
    END IF;
    RAISE EXCEPTION 'Condition photo already verified with another attempt'
      USING ERRCODE = '23505';
  END IF;
  v_now := clock_timestamp();
  IF v_op.status <> 'PENDING' OR v_op.expires_at <= v_now THEN
    RAISE EXCEPTION 'Condition photo expired operation' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO v_attempt FROM public.condition_photo_upload_attempts
    WHERE id = p_attempt_id AND operation_id = v_op.id FOR UPDATE;
  IF NOT FOUND OR v_attempt.status <> 'STORED'
    OR v_attempt.lease_owner IS DISTINCT FROM p_lease_owner
    OR v_attempt.lease_expires_at <= clock_timestamp()
    OR p_lease_owner IS NULL
    OR v_attempt.object_version IS DISTINCT FROM p_object_version
    OR v_attempt.canonical_sha256 IS DISTINCT FROM p_canonical_sha256
    OR v_attempt.canonical_byte_size IS DISTINCT FROM p_canonical_byte_size
    OR v_attempt.width IS DISTINCT FROM p_width
    OR v_attempt.height IS DISTINCT FROM p_height THEN
    RAISE EXCEPTION 'Condition photo invalid verification or stale lease'
      USING ERRCODE = '55000';
  END IF;
  IF (SELECT count(*) FROM public.vehicle_photo_verifications
      WHERE organization_id = v_op.organization_id
        AND location_id = v_op.location_id
        AND valet_session_id = v_op.valet_session_id
        AND purpose = 'CHECK_IN_CONDITION') >= 10 THEN
    RAISE EXCEPTION 'Condition photo session maximum reached' USING ERRCODE = '53300';
  END IF;
  v_photo_id := gen_random_uuid();
  UPDATE public.condition_photo_upload_attempts SET
    status = 'SELECTED', selected_at = v_now,
    lease_owner = NULL, lease_expires_at = NULL
    WHERE id = v_attempt.id;
  INSERT INTO public.vehicle_photos (
    id, organization_id, location_id, valet_session_id,
    captured_by_membership_id, purpose, storage_object_key,
    content_type, created_at
  ) VALUES (v_photo_id, v_op.organization_id, v_op.location_id,
    v_op.valet_session_id, p_membership_id, 'CHECK_IN_CONDITION',
    v_attempt.object_key, 'image/jpeg', v_now);
  INSERT INTO public.vehicle_photo_verifications (
    vehicle_photo_id, operation_id, attempt_id, organization_id, location_id,
    valet_session_id, captured_by_membership_id, purpose, object_key,
    verified_at, byte_size, content_sha256, width, height, normalization_version
  ) VALUES (v_photo_id, v_op.id, v_attempt.id, v_op.organization_id,
    v_op.location_id, v_op.valet_session_id, p_membership_id,
    'CHECK_IN_CONDITION', v_attempt.object_key, v_now,
    p_canonical_byte_size, p_canonical_sha256, p_width, p_height,
    v_op.normalization_version);
  INSERT INTO public.vehicle_photo_availability (
    vehicle_photo_id, organization_id, location_id, valet_session_id,
    state, changed_at
  ) VALUES (v_photo_id, v_op.organization_id, v_op.location_id,
    v_op.valet_session_id, 'AVAILABLE', v_now);
  UPDATE public.condition_photo_upload_operations
    SET status = 'VERIFIED', verified_photo_id = v_photo_id, updated_at = v_now
    WHERE id = v_op.id;
  INSERT INTO public.audit_events (
    id, organization_id, location_id, valet_session_id, actor_membership_id,
    actor_type, event_type, entity_type, entity_id, metadata_json,
    idempotency_key, occurred_at
  ) VALUES (gen_random_uuid(), v_op.organization_id, v_op.location_id,
    v_op.valet_session_id, p_membership_id, 'MEMBERSHIP',
    'CHECK_IN_CONDITION_PHOTO_VERIFIED', 'ValetSession', v_op.valet_session_id,
    jsonb_build_object('purpose', 'CHECK_IN_CONDITION',
      'mediaCategory', 'image', 'verificationVersion', 1),
    'condition-photo:' || v_op.id::TEXT, v_now);
  RETURN v_photo_id;
END;
$$;

CREATE FUNCTION public.condition_photo_set_availability(
  p_user_id UUID, p_membership_id UUID, p_photo_id UUID,
  p_state public.condition_photo_availability_state, p_reason TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_scope RECORD;
DECLARE v_current public.vehicle_photo_availability%ROWTYPE;
DECLARE v_now TIMESTAMPTZ;
BEGIN
  SELECT v.organization_id, v.location_id, v.valet_session_id
    INTO v_scope FROM public.vehicle_photo_verifications v
    JOIN public.organization_memberships m
      ON m.id = p_membership_id AND m.organization_id = v.organization_id
      AND m.user_id = p_user_id AND m.status = 'ACTIVE'
      AND m.role IN ('VALET_EMPLOYEE', 'VALET_SUPERVISOR')
    JOIN public.users u ON u.id = m.user_id AND u.status = 'ACTIVE'
    JOIN public.organizations o ON o.id = v.organization_id
      AND o.status = 'ACTIVE'
    JOIN public.locations l ON l.id = v.location_id
      AND l.organization_id = v.organization_id AND l.status = 'ACTIVE'
    JOIN public.valet_sessions s ON s.id = v.valet_session_id
      AND s.organization_id = v.organization_id
      AND s.location_id = v.location_id
    JOIN public.membership_location_access a
      ON a.organization_id = v.organization_id
      AND a.location_id = v.location_id AND a.membership_id = m.id
    WHERE v.vehicle_photo_id = p_photo_id
      AND v.purpose = 'CHECK_IN_CONDITION'
    FOR SHARE OF u, m, o, l, a, s;
  IF NOT FOUND OR p_state IS NULL OR
    (p_state = 'AVAILABLE' AND p_reason IS NOT NULL) OR
    (p_state = 'UNAVAILABLE'
      AND (p_reason IS NULL OR p_reason !~ '^[A-Z][A-Z0-9_]{0,63}$')) THEN
    RAISE EXCEPTION 'Condition photo availability unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_current FROM public.vehicle_photo_availability
    WHERE vehicle_photo_id = p_photo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo availability record missing' USING ERRCODE = '23503';
  END IF;
  IF v_current.state = p_state AND v_current.reason IS NOT DISTINCT FROM p_reason THEN
    RETURN FALSE;
  END IF;
  v_now := clock_timestamp();
  UPDATE public.vehicle_photo_availability SET
    state = p_state, reason = p_reason, changed_at = v_now
    WHERE vehicle_photo_id = p_photo_id;
  IF p_state = 'UNAVAILABLE' THEN
    INSERT INTO public.audit_events (
      id, organization_id, location_id, valet_session_id, actor_membership_id,
      actor_type, event_type, entity_type, entity_id, metadata_json, occurred_at
    ) VALUES (gen_random_uuid(), v_scope.organization_id, v_scope.location_id,
      v_scope.valet_session_id, NULL, 'SYSTEM',
      'CHECK_IN_CONDITION_PHOTO_UNAVAILABLE', 'ValetSession',
      v_scope.valet_session_id,
      jsonb_build_object('reason', p_reason), v_now);
  END IF;
  RETURN TRUE;
END;
$$;

-- Maintenance only: no evidence insertion, selection or generic object deletion.
CREATE FUNCTION public.condition_photo_expire_operation(p_operation_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_user UUID;
DECLARE v_op public.condition_photo_upload_operations%ROWTYPE;
DECLARE v_now TIMESTAMPTZ;
BEGIN
  SELECT m.user_id INTO v_user FROM public.condition_photo_upload_operations o
    JOIN public.organization_memberships m ON m.id = o.actor_membership_id
    WHERE o.id = p_operation_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  PERFORM public.condition_photo_lock_admission(v_user);
  SELECT * INTO v_op FROM public.condition_photo_upload_operations
    WHERE id = p_operation_id FOR UPDATE;
  v_now := clock_timestamp();
  IF v_op.status <> 'PENDING' OR v_op.expires_at > v_now OR
    EXISTS (
      SELECT 1 FROM public.condition_photo_upload_attempts
      WHERE operation_id = v_op.id AND lease_expires_at > v_now
        AND status IN ('WRITING', 'STORED')
    ) THEN
    RETURN FALSE;
  END IF;
  UPDATE public.condition_photo_upload_attempts SET
    status = 'ABANDONED', abandoned_at = v_now,
    lease_owner = NULL, lease_expires_at = NULL
    WHERE operation_id = v_op.id AND status IN ('WRITING', 'STORED');
  UPDATE public.condition_photo_upload_operations SET
    status = 'EXPIRED', updated_at = v_now,
    last_failure_code = 'OPERATION_EXPIRED'
    WHERE id = v_op.id;
  RETURN TRUE;
END;
$$;

CREATE FUNCTION public.condition_photo_abandon_attempt(p_attempt_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_operation_id UUID;
DECLARE v_attempt public.condition_photo_upload_attempts%ROWTYPE;
BEGIN
  SELECT operation_id INTO v_operation_id
    FROM public.condition_photo_upload_attempts WHERE id = p_attempt_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  PERFORM 1 FROM public.condition_photo_upload_operations
    WHERE id = v_operation_id FOR UPDATE;
  SELECT * INTO v_attempt FROM public.condition_photo_upload_attempts
    WHERE id = p_attempt_id FOR UPDATE;
  IF v_attempt.status <> 'ABANDONED' OR EXISTS (
    SELECT 1 FROM public.vehicle_photo_verifications
    WHERE attempt_id = p_attempt_id
  ) THEN RETURN FALSE; END IF;
  UPDATE public.condition_photo_upload_attempts
    SET last_cleanup_checked_at = clock_timestamp()
    WHERE id = p_attempt_id;
  RETURN TRUE;
END;
$$;

-- Existing runtime can INSERT other audit events. Reserve these new names for
-- trusted definer commands; otherwise a forged/preseeded row could fake a
-- verification fact or block genuine T2 finalization by unique key.
CREATE FUNCTION public.condition_photo_audit_insert_guard()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE v_owner NAME;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.event_type IN
      ('CHECK_IN_CONDITION_PHOTO_VERIFIED', 'CHECK_IN_CONDITION_PHOTO_UNAVAILABLE') THEN
      RAISE EXCEPTION 'Condition photo audit facts are immutable' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.event_type NOT IN
    ('CHECK_IN_CONDITION_PHOTO_VERIFIED', 'CHECK_IN_CONDITION_PHOTO_UNAVAILABLE') THEN
    RETURN NEW;
  END IF;
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner
    FROM pg_catalog.pg_proc p
    WHERE p.oid = 'public.condition_photo_finalize_upload(uuid,uuid,uuid,uuid,uuid,text,bytea,integer,integer,integer)'::REGPROCEDURE;
  IF v_owner IS NULL OR CURRENT_USER <> v_owner THEN
    RAISE EXCEPTION 'Condition photo audit requires trusted DB command'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "condition_photo_audit_insert_guard"
BEFORE INSERT OR UPDATE ON public.audit_events
FOR EACH ROW EXECUTE FUNCTION public.condition_photo_audit_insert_guard();

-- At COMMIT the immutable fact must match the actual selected byte evidence.
-- A row inserted before verification cannot be committed on its own.
CREATE FUNCTION public.condition_photo_audit_coherence_guard()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.event_type = 'CHECK_IN_CONDITION_PHOTO_VERIFIED' THEN
    IF NEW.actor_type IS DISTINCT FROM 'MEMBERSHIP'
      OR NEW.actor_membership_id IS NULL
      OR NEW.entity_type IS DISTINCT FROM 'ValetSession'
      OR NEW.entity_id IS DISTINCT FROM NEW.valet_session_id
      OR NEW.metadata_json IS DISTINCT FROM
        '{"purpose":"CHECK_IN_CONDITION","mediaCategory":"image","verificationVersion":1}'::JSONB
      OR NOT EXISTS (
        SELECT 1
        FROM public.condition_photo_upload_operations o
        JOIN public.vehicle_photo_verifications v
          ON v.operation_id = o.id AND v.vehicle_photo_id = o.verified_photo_id
        JOIN public.condition_photo_upload_attempts a
          ON a.id = v.attempt_id AND a.operation_id = o.id
        WHERE o.status = 'VERIFIED' AND a.status = 'SELECTED'
          AND NEW.idempotency_key = 'condition-photo:' || o.id::TEXT
          AND NEW.organization_id = o.organization_id
          AND NEW.location_id = o.location_id
          AND NEW.valet_session_id = o.valet_session_id
          AND NEW.actor_membership_id = o.actor_membership_id
          AND NEW.occurred_at = v.verified_at
      ) THEN
      RAISE EXCEPTION 'Condition photo verification audit lacks committed evidence'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.event_type = 'CHECK_IN_CONDITION_PHOTO_UNAVAILABLE' THEN
    IF NEW.actor_type IS DISTINCT FROM 'SYSTEM'
      OR NEW.actor_membership_id IS NOT NULL
      OR NEW.idempotency_key IS NOT NULL
      OR NEW.entity_type IS DISTINCT FROM 'ValetSession'
      OR NEW.entity_id IS DISTINCT FROM NEW.valet_session_id
      OR NEW.metadata_json IS DISTINCT FROM
        jsonb_build_object('reason', NEW.metadata_json ->> 'reason')
      OR NOT EXISTS (
        SELECT 1 FROM public.vehicle_photo_availability va
        JOIN public.vehicle_photo_verifications v
          ON v.vehicle_photo_id = va.vehicle_photo_id
        WHERE va.state = 'UNAVAILABLE'
          AND va.reason = NEW.metadata_json ->> 'reason'
          AND va.organization_id = NEW.organization_id
          AND va.location_id = NEW.location_id
          AND va.valet_session_id = NEW.valet_session_id
          AND va.changed_at = NEW.occurred_at
          AND v.purpose = 'CHECK_IN_CONDITION'
      ) THEN
      RAISE EXCEPTION 'Condition photo availability audit lacks current evidence'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "condition_photo_audit_commit_coherence"
AFTER INSERT OR UPDATE ON public.audit_events
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.condition_photo_audit_coherence_guard();

REVOKE ALL ON FUNCTION public.condition_photo_coherence_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condition_photo_write_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condition_photo_authorized_scope(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condition_photo_lock_admission(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condition_photo_check_capacity(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condition_photo_reserve_upload(
  UUID, UUID, UUID, UUID, BYTEA, INTEGER, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condition_photo_claim_upload(
  UUID, UUID, UUID, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condition_photo_mark_stored(
  UUID, UUID, UUID, UUID, UUID, TEXT, BYTEA, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condition_photo_record_failure(
  UUID, UUID, UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condition_photo_finalize_upload(
  UUID, UUID, UUID, UUID, UUID, TEXT, BYTEA, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condition_photo_set_availability(
  UUID, UUID, UUID, public.condition_photo_availability_state, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condition_photo_expire_operation(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condition_photo_abandon_attempt(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condition_photo_audit_insert_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condition_photo_audit_coherence_guard() FROM PUBLIC;

COMMIT;
