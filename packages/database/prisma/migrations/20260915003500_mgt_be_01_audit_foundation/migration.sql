-- MGT-BE-01: preserve existing Location audit rows while making every new
-- tenant audit actor explicit and adding a separate account-security boundary.
CREATE TYPE "tenant_audit_actor_type" AS ENUM (
    'MEMBERSHIP',
    'GUEST',
    'SYSTEM',
    'PROVIDER',
    'CONTROLLED_OPERATOR'
);

CREATE TYPE "account_security_actor_type" AS ENUM (
    'USER',
    'ANONYMOUS',
    'SYSTEM',
    'CONTROLLED_OPERATOR'
);

ALTER TABLE "audit_events"
    ALTER COLUMN "location_id" DROP NOT NULL,
    ADD COLUMN "actor_type" "tenant_audit_actor_type",
    ADD COLUMN "actor_operator_ref" TEXT;

ALTER TABLE "audit_events"
    ADD CONSTRAINT "audit_events_session_requires_location_check"
        CHECK ("valet_session_id" IS NULL OR "location_id" IS NOT NULL),
    ADD CONSTRAINT "audit_events_actor_provenance_check"
        CHECK (
            ("actor_type" = 'MEMBERSHIP'
                AND "actor_membership_id" IS NOT NULL
                AND "actor_operator_ref" IS NULL)
            OR ("actor_type" = 'CONTROLLED_OPERATOR'
                AND "actor_membership_id" IS NULL
                AND "actor_operator_ref" IS NOT NULL)
            OR ("actor_type" IN ('GUEST', 'SYSTEM', 'PROVIDER')
                AND "actor_membership_id" IS NULL
                AND "actor_operator_ref" IS NULL)
            OR ("actor_type" IS NULL AND "actor_operator_ref" IS NULL)
        ),
    ADD CONSTRAINT "audit_events_actor_operator_ref_check"
        CHECK (
            "actor_operator_ref" IS NULL
            OR (
                char_length("actor_operator_ref") BETWEEN 1 AND 200
                AND "actor_operator_ref" !~ '[[:cntrl:][:space:]@]'
            )
        );

CREATE FUNCTION "audit_events_require_actor_provenance"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.actor_type IS NULL AND NEW.actor_membership_id IS NOT NULL THEN
        NEW.actor_type := 'MEMBERSHIP'::public.tenant_audit_actor_type;
    ELSIF NEW.actor_type IS NULL THEN
        RAISE EXCEPTION 'new audit events require explicit actor provenance'
            USING ERRCODE = '23502', COLUMN = 'actor_type';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "audit_events_require_actor_provenance_trigger"
BEFORE INSERT ON "audit_events"
FOR EACH ROW
EXECUTE FUNCTION "audit_events_require_actor_provenance"();

REVOKE ALL ON FUNCTION "audit_events_require_actor_provenance"() FROM PUBLIC;

CREATE TABLE "account_security_audit_events" (
    "id" UUID NOT NULL,
    "subject_user_id" UUID,
    "actor_type" "account_security_actor_type" NOT NULL,
    "actor_user_id" UUID,
    "actor_operator_ref" TEXT,
    "event_type" TEXT NOT NULL,
    "request_id" TEXT,
    "idempotency_key" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_security_audit_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "account_security_audit_events_actor_provenance_check" CHECK (
        ("actor_type" = 'USER'
            AND "actor_user_id" IS NOT NULL
            AND "actor_operator_ref" IS NULL)
        OR ("actor_type" = 'CONTROLLED_OPERATOR'
            AND "actor_user_id" IS NULL
            AND "actor_operator_ref" IS NOT NULL)
        OR ("actor_type" IN ('ANONYMOUS', 'SYSTEM')
            AND "actor_user_id" IS NULL
            AND "actor_operator_ref" IS NULL)
    ),
    CONSTRAINT "account_security_audit_events_actor_operator_ref_check" CHECK (
        "actor_operator_ref" IS NULL
        OR (
            char_length("actor_operator_ref") BETWEEN 1 AND 200
            AND "actor_operator_ref" !~ '[[:cntrl:][:space:]@]'
        )
    ),
    CONSTRAINT "account_security_audit_events_event_type_check" CHECK (
        char_length("event_type") BETWEEN 1 AND 96
        AND "event_type" ~ '^[A-Z][A-Z0-9_]*$'
    ),
    CONSTRAINT "account_security_audit_events_request_id_check" CHECK (
        "request_id" IS NULL
        OR (
            char_length("request_id") BETWEEN 1 AND 128
            AND "request_id" !~ '[[:cntrl:]]'
        )
    ),
    CONSTRAINT "account_security_audit_events_idempotency_key_check" CHECK (
        "idempotency_key" IS NULL
        OR (
            char_length("idempotency_key") BETWEEN 1 AND 200
            AND "idempotency_key" !~ '[[:cntrl:]]'
        )
    )
);

CREATE UNIQUE INDEX "account_security_audit_events_idempotency_key"
ON "account_security_audit_events"("idempotency_key");

ALTER TABLE "account_security_audit_events"
ADD CONSTRAINT "account_security_audit_events_subject_user_id_fkey"
FOREIGN KEY ("subject_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "account_security_audit_events"
ADD CONSTRAINT "account_security_audit_events_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

REVOKE ALL ON TABLE "account_security_audit_events" FROM PUBLIC;

CREATE FUNCTION "append_account_security_audit_event_exact"(
    p_id UUID,
    p_subject_user_id UUID,
    p_actor_type "account_security_actor_type",
    p_actor_user_id UUID,
    p_actor_operator_ref TEXT,
    p_event_type TEXT,
    p_request_id TEXT,
    p_idempotency_key TEXT,
    p_occurred_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    existing account_security_audit_events%ROWTYPE;
    matching_rows INTEGER;
BEGIN
    PERFORM pg_advisory_xact_lock(
        hashtextextended('account-security-event:' || p_id::text, 0)
    );
    IF p_idempotency_key IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(
            hashtextextended(
                'account-security-idempotency:' || p_idempotency_key,
                0
            )
        );
    END IF;

    SELECT count(*)::integer INTO matching_rows
    FROM account_security_audit_events
    WHERE id = p_id
       OR (p_idempotency_key IS NOT NULL
           AND idempotency_key = p_idempotency_key);

    IF matching_rows > 0 THEN
        IF matching_rows <> 1 THEN
            RAISE EXCEPTION 'conflicting account-security audit identity'
                USING ERRCODE = '23505';
        END IF;
        SELECT * INTO STRICT existing
        FROM account_security_audit_events
        WHERE id = p_id
           OR (p_idempotency_key IS NOT NULL
               AND idempotency_key = p_idempotency_key);
        IF NOT (
            existing.subject_user_id IS NOT DISTINCT FROM p_subject_user_id
            AND existing.actor_type IS NOT DISTINCT FROM p_actor_type
            AND existing.actor_user_id IS NOT DISTINCT FROM p_actor_user_id
            AND existing.actor_operator_ref IS NOT DISTINCT FROM p_actor_operator_ref
            AND existing.event_type IS NOT DISTINCT FROM p_event_type
            AND existing.request_id IS NOT DISTINCT FROM p_request_id
            AND existing.idempotency_key IS NOT DISTINCT FROM p_idempotency_key
            AND existing.occurred_at IS NOT DISTINCT FROM p_occurred_at
        ) THEN
            RAISE EXCEPTION 'conflicting account-security audit identity'
                USING ERRCODE = '23505';
        END IF;
        RETURN existing.id;
    END IF;

    INSERT INTO account_security_audit_events (
        id, subject_user_id, actor_type, actor_user_id, actor_operator_ref,
        event_type, request_id, idempotency_key, occurred_at
    ) VALUES (
        p_id, p_subject_user_id, p_actor_type, p_actor_user_id,
        p_actor_operator_ref, p_event_type, p_request_id, p_idempotency_key,
        p_occurred_at
    );
    RETURN p_id;
END;
$$;

REVOKE ALL ON FUNCTION "append_account_security_audit_event_exact"(
    UUID, UUID, "account_security_actor_type", UUID, TEXT, TEXT, TEXT, TEXT,
    TIMESTAMPTZ
) FROM PUBLIC;
