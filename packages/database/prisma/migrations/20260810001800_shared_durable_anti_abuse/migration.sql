CREATE TABLE "anti_abuse_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scope" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "state" TEXT NOT NULL,

    CONSTRAINT "anti_abuse_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "anti_abuse_events_scope_check" CHECK (
        "scope" IN (
            'v1:staff-login-identifier',
            'v1:staff-client-address',
            'v1:guest-client-address',
            'v1:guest-token'
        )
    ),
    CONSTRAINT "anti_abuse_events_state_check" CHECK (
        "state" IN ('PENDING', 'COUNTED', 'IGNORED')
    ),
    CONSTRAINT "anti_abuse_events_key_hash_check" CHECK (
        "key_hash" ~ '^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$'
    )
);

CREATE INDEX "anti_abuse_events_scope_key_hash_occurred_at_idx"
ON "anti_abuse_events"("scope", "key_hash", "occurred_at");

CREATE INDEX "anti_abuse_events_occurred_at_idx"
ON "anti_abuse_events"("occurred_at");

CREATE FUNCTION "cleanup_expired_anti_abuse_events"()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    PERFORM set_config('lock_timeout', '2s', true);
    DELETE FROM public.anti_abuse_events
    WHERE occurred_at < clock_timestamp() - INTERVAL '1 hour';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION "cleanup_expired_anti_abuse_events"() FROM PUBLIC;
