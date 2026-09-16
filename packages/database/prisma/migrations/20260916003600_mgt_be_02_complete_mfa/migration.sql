-- MGT-BE-02 / DEC-078: complete TOTP MFA persistence and exact session assurance.

CREATE TYPE "mfa_totp_factor_state" AS ENUM (
    'PENDING',
    'ACTIVE',
    'RETIRED'
);

CREATE TABLE "user_mfa_totp_factors" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "state" "mfa_totp_factor_state" NOT NULL DEFAULT 'PENDING',
    "protected_secret" TEXT NOT NULL,
    "last_accepted_step" BIGINT,
    "recovery_set_generation" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMPTZ(3),
    "retired_at" TIMESTAMPTZ(3),

    CONSTRAINT "user_mfa_totp_factors_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_mfa_totp_factors_protected_secret_check" CHECK (
        "protected_secret" ~ '^mte1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$'
    ),
    CONSTRAINT "user_mfa_totp_factors_last_accepted_step_check" CHECK (
        "last_accepted_step" IS NULL OR "last_accepted_step" >= 0
    ),
    CONSTRAINT "user_mfa_totp_factors_recovery_generation_check" CHECK (
        "recovery_set_generation" >= 0
    ),
    CONSTRAINT "user_mfa_totp_factors_state_timestamps_check" CHECK (
        ("state" = 'PENDING'
            AND "activated_at" IS NULL
            AND "retired_at" IS NULL
            AND "last_accepted_step" IS NULL
            AND "recovery_set_generation" = 0)
        OR
        ("state" = 'ACTIVE'
            AND "activated_at" IS NOT NULL
            AND "activated_at" >= "created_at"
            AND "retired_at" IS NULL
            AND "last_accepted_step" IS NOT NULL
            AND "recovery_set_generation" > 0)
        OR
        ("state" = 'RETIRED'
            AND "retired_at" IS NOT NULL
            AND "retired_at" >= "created_at"
            AND (("activated_at" IS NULL
                    AND "last_accepted_step" IS NULL
                    AND "recovery_set_generation" = 0)
                OR ("activated_at" IS NOT NULL
                    AND "activated_at" >= "created_at"
                    AND "activated_at" <= "retired_at"
                    AND "last_accepted_step" IS NOT NULL
                    AND "recovery_set_generation" > 0)))
    ),
    CONSTRAINT "user_mfa_totp_factors_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "user_mfa_totp_factors_user_id_id_key"
ON "user_mfa_totp_factors"("user_id", "id");

CREATE UNIQUE INDEX "user_mfa_totp_factors_one_live_per_user_key"
ON "user_mfa_totp_factors"("user_id")
WHERE "state" IN ('PENDING', 'ACTIVE');

CREATE TABLE "mfa_recovery_codes" (
    "id" UUID NOT NULL,
    "factor_id" UUID NOT NULL,
    "set_generation" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,
    "selector" TEXT NOT NULL,
    "verifier" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumed_at" TIMESTAMPTZ(3),

    CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mfa_recovery_codes_set_generation_check" CHECK (
        "set_generation" > 0
    ),
    CONSTRAINT "mfa_recovery_codes_slot_check" CHECK (
        "slot" BETWEEN 1 AND 10
    ),
    CONSTRAINT "mfa_recovery_codes_selector_check" CHECK (
        "selector" ~ '^[A-Za-z0-9_-]{11}$'
    ),
    CONSTRAINT "mfa_recovery_codes_verifier_check" CHECK (
        "verifier" ~ '^mrv1\.[A-Za-z0-9_-]{43}$'
    ),
    CONSTRAINT "mfa_recovery_codes_consumed_at_check" CHECK (
        "consumed_at" IS NULL OR "consumed_at" >= "created_at"
    ),
    CONSTRAINT "mfa_recovery_codes_factor_id_fkey"
        FOREIGN KEY ("factor_id") REFERENCES "user_mfa_totp_factors"("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "mfa_recovery_codes_selector_key"
ON "mfa_recovery_codes"("selector");

CREATE UNIQUE INDEX "mfa_recovery_codes_factor_generation_slot_key"
ON "mfa_recovery_codes"("factor_id", "set_generation", "slot");

CREATE INDEX "mfa_recovery_codes_factor_generation_consumed_idx"
ON "mfa_recovery_codes"("factor_id", "set_generation", "consumed_at");

ALTER TABLE "staff_auth_sessions"
    ADD COLUMN "mfa_authenticated_at" TIMESTAMPTZ(3),
    ADD COLUMN "mfa_factor_id" UUID,
    ADD COLUMN "last_admin_activity_at" TIMESTAMPTZ(3),
    ADD CONSTRAINT "staff_auth_sessions_mfa_assurance_check" CHECK (
        ("mfa_authenticated_at" IS NULL
            AND "mfa_factor_id" IS NULL
            AND "last_admin_activity_at" IS NULL)
        OR
        ("mfa_authenticated_at" IS NOT NULL
            AND "mfa_factor_id" IS NOT NULL
            AND "last_admin_activity_at" IS NOT NULL
            AND "mfa_authenticated_at" >= "created_at"
            AND "last_admin_activity_at" >= "mfa_authenticated_at"
            AND "mfa_authenticated_at" <= "absolute_expires_at"
            AND "last_admin_activity_at" <= "absolute_expires_at"
            AND ("revoked_at" IS NULL OR
                 "last_admin_activity_at" <= "revoked_at"))
    );

ALTER TABLE "staff_auth_sessions"
    ADD CONSTRAINT "staff_auth_sessions_user_mfa_factor_id_fkey"
    FOREIGN KEY ("user_id", "mfa_factor_id")
    REFERENCES "user_mfa_totp_factors"("user_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "anti_abuse_events"
DROP CONSTRAINT "anti_abuse_events_scope_check";

ALTER TABLE "anti_abuse_events"
ADD CONSTRAINT "anti_abuse_events_scope_check" CHECK (
    "scope" IN (
        'v1:staff-login-identifier',
        'v1:staff-client-address',
        'v1:guest-client-address',
        'v1:guest-token',
        'v1:handoff-issuance-session',
        'v1:handoff-verification-session',
        'v1:mfa-totp-user',
        'v1:mfa-recovery-user'
    )
);

CREATE FUNCTION "mfa_totp_factor_guard"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.protected_secret IS DISTINCT FROM OLD.protected_secret
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
        RAISE EXCEPTION 'MFA factor identity and protected material are immutable.'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'user_mfa_totp_factors_immutable_check';
    END IF;

    IF OLD.state = 'RETIRED' AND NEW.state <> 'RETIRED' THEN
        RAISE EXCEPTION 'Retired MFA factors cannot be reactivated.'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'user_mfa_totp_factors_state_transition_check';
    END IF;

    IF OLD.state = 'ACTIVE' AND NEW.state = 'PENDING' THEN
        RAISE EXCEPTION 'Active MFA factors cannot return to pending.'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'user_mfa_totp_factors_state_transition_check';
    END IF;

    IF OLD.last_accepted_step IS NOT NULL
       AND NEW.last_accepted_step IS DISTINCT FROM OLD.last_accepted_step
       AND (NEW.last_accepted_step IS NULL OR
            NEW.last_accepted_step <= OLD.last_accepted_step)
    THEN
        RAISE EXCEPTION 'MFA TOTP replay step must advance monotonically.'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'user_mfa_totp_factors_replay_step_check';
    END IF;

    IF NEW.recovery_set_generation IS DISTINCT FROM OLD.recovery_set_generation
       AND NEW.recovery_set_generation <> OLD.recovery_set_generation + 1
    THEN
        RAISE EXCEPTION 'MFA recovery generation must advance by one.'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'user_mfa_totp_factors_recovery_generation_transition_check';
    END IF;

    IF OLD.activated_at IS NOT NULL
       AND NEW.activated_at IS DISTINCT FROM OLD.activated_at
    THEN
        RAISE EXCEPTION 'MFA activation time is immutable once recorded.'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'user_mfa_totp_factors_activation_time_check';
    END IF;

    IF OLD.retired_at IS NOT NULL
       AND NEW.retired_at IS DISTINCT FROM OLD.retired_at
    THEN
        RAISE EXCEPTION 'MFA retirement time is immutable once recorded.'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'user_mfa_totp_factors_retirement_time_check';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "user_mfa_totp_factors_guard_trigger"
BEFORE UPDATE ON "user_mfa_totp_factors"
FOR EACH ROW EXECUTE FUNCTION "mfa_totp_factor_guard"();

CREATE FUNCTION "mfa_recovery_code_guard"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.factor_id IS DISTINCT FROM OLD.factor_id
       OR NEW.set_generation IS DISTINCT FROM OLD.set_generation
       OR NEW.slot IS DISTINCT FROM OLD.slot
       OR NEW.selector IS DISTINCT FROM OLD.selector
       OR NEW.verifier IS DISTINCT FROM OLD.verifier
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
        RAISE EXCEPTION 'MFA recovery verifier rows are immutable except consumption.'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'mfa_recovery_codes_immutable_check';
    END IF;

    IF OLD.consumed_at IS NOT NULL
       AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at
    THEN
        RAISE EXCEPTION 'Consumed MFA recovery codes cannot be reused.'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'mfa_recovery_codes_single_use_check';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "mfa_recovery_codes_guard_trigger"
BEFORE UPDATE ON "mfa_recovery_codes"
FOR EACH ROW EXECUTE FUNCTION "mfa_recovery_code_guard"();

REVOKE ALL ON TABLE "user_mfa_totp_factors", "mfa_recovery_codes" FROM PUBLIC;
REVOKE ALL ON FUNCTION "mfa_totp_factor_guard"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "mfa_recovery_code_guard"() FROM PUBLIC;
