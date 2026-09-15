-- MGT-BE-01 / DEC-079: truthful tenant audit scopes and separate account-security audit.

CREATE TYPE "audit_actor_type" AS ENUM (
    'MEMBERSHIP',
    'GUEST',
    'SYSTEM',
    'EXTERNAL_PROVIDER',
    'CONTROLLED_OPERATOR'
);

CREATE TYPE "account_security_actor_type" AS ENUM (
    'USER',
    'CONTROLLED_OPERATOR',
    'SYSTEM',
    'ANONYMOUS'
);

ALTER TABLE "audit_events"
    ALTER COLUMN "location_id" DROP NOT NULL,
    ADD COLUMN "actor_type" "audit_actor_type",
    ADD COLUMN "controlled_operator_ref" TEXT;

ALTER TABLE "audit_events"
    ADD CONSTRAINT "audit_events_session_requires_location_check"
    CHECK ("valet_session_id" IS NULL OR "location_id" IS NOT NULL),
    ADD CONSTRAINT "audit_events_actor_provenance_check"
    CHECK (
        ("actor_membership_id" IS NOT NULL
            AND ("actor_type" IS NULL OR "actor_type" = 'MEMBERSHIP')
            AND "controlled_operator_ref" IS NULL)
        OR
        ("actor_membership_id" IS NULL
            AND "actor_type" IS NOT NULL
            AND (
                ("actor_type" IN ('GUEST', 'SYSTEM', 'EXTERNAL_PROVIDER')
                    AND "controlled_operator_ref" IS NULL)
                OR
                ("actor_type" = 'CONTROLLED_OPERATOR'
                    AND "controlled_operator_ref" IS NOT NULL
                    AND char_length("controlled_operator_ref") BETWEEN 1 AND 200
                    AND "controlled_operator_ref" !~ '[[:cntrl:]]')
            ))
    ) NOT VALID;

CREATE TABLE "account_security_audit_events" (
    "id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "subject_user_id" UUID,
    "actor_type" "account_security_actor_type" NOT NULL,
    "actor_user_id" UUID,
    "controlled_operator_ref" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_security_audit_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "account_security_audit_events_event_type_check"
        CHECK (
            char_length("event_type") BETWEEN 1 AND 100
            AND "event_type" ~ '^[A-Z][A-Z0-9_]*$'
        ),
    CONSTRAINT "account_security_audit_events_actor_provenance_check"
        CHECK (
            ("actor_type" = 'USER'
                AND "actor_user_id" IS NOT NULL
                AND "controlled_operator_ref" IS NULL)
            OR
            ("actor_type" = 'CONTROLLED_OPERATOR'
                AND "actor_user_id" IS NULL
                AND "controlled_operator_ref" IS NOT NULL
                AND char_length("controlled_operator_ref") BETWEEN 1 AND 200
                AND "controlled_operator_ref" !~ '[[:cntrl:]]')
            OR
            ("actor_type" IN ('SYSTEM', 'ANONYMOUS')
                AND "actor_user_id" IS NULL
                AND "controlled_operator_ref" IS NULL)
        ),
    CONSTRAINT "account_security_audit_events_subject_user_id_fkey"
        FOREIGN KEY ("subject_user_id") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "account_security_audit_events_actor_user_id_fkey"
        FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE FUNCTION "append_account_security_audit_event"(
    "p_id" UUID,
    "p_event_type" TEXT,
    "p_subject_user_id" UUID,
    "p_actor_type" "account_security_actor_type",
    "p_actor_user_id" UUID,
    "p_controlled_operator_ref" TEXT,
    "p_occurred_at" TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    existing public.account_security_audit_events%ROWTYPE;
BEGIN
    -- Serialize only reuse of the same stable event identity. This is bounded
    -- O(1) work and does not scan audit history.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text, 0));

    SELECT * INTO existing
    FROM public.account_security_audit_events
    WHERE id = p_id;

    IF FOUND THEN
        IF existing.event_type IS NOT DISTINCT FROM p_event_type
           AND existing.subject_user_id IS NOT DISTINCT FROM p_subject_user_id
           AND existing.actor_type IS NOT DISTINCT FROM p_actor_type
           AND existing.actor_user_id IS NOT DISTINCT FROM p_actor_user_id
           AND existing.controlled_operator_ref IS NOT DISTINCT FROM p_controlled_operator_ref
           AND existing.occurred_at IS NOT DISTINCT FROM p_occurred_at::timestamptz(3)
        THEN
            RETURN p_id;
        END IF;

        RAISE EXCEPTION 'Account-security audit event identity conflict.'
            USING ERRCODE = '23505',
                  CONSTRAINT = 'account_security_audit_events_pkey';
    END IF;

    INSERT INTO public.account_security_audit_events (
        id,
        event_type,
        subject_user_id,
        actor_type,
        actor_user_id,
        controlled_operator_ref,
        occurred_at
    ) VALUES (
        p_id,
        p_event_type,
        p_subject_user_id,
        p_actor_type,
        p_actor_user_id,
        p_controlled_operator_ref,
        p_occurred_at
    );

    RETURN p_id;
END;
$$;

REVOKE ALL ON FUNCTION "append_account_security_audit_event"(
    UUID,
    TEXT,
    UUID,
    "account_security_actor_type",
    UUID,
    TEXT,
    TIMESTAMPTZ
) FROM PUBLIC;

CREATE FUNCTION "append_runtime_account_security_audit_event"(
    "p_id" UUID,
    "p_event_type" TEXT,
    "p_subject_user_id" UUID,
    "p_actor_type" "account_security_actor_type",
    "p_actor_user_id" UUID,
    "p_occurred_at" TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF p_actor_type = 'CONTROLLED_OPERATOR' THEN
        RAISE EXCEPTION 'Controlled operator audit requires the controlled operator boundary.'
            USING ERRCODE = '42501';
    END IF;

    RETURN public.append_account_security_audit_event(
        p_id,
        p_event_type,
        p_subject_user_id,
        p_actor_type,
        p_actor_user_id,
        NULL,
        p_occurred_at
    );
END;
$$;

REVOKE ALL ON FUNCTION "append_runtime_account_security_audit_event"(
    UUID,
    TEXT,
    UUID,
    "account_security_actor_type",
    UUID,
    TIMESTAMPTZ
) FROM PUBLIC;
