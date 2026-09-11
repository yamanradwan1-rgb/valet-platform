-- MOB-020D / DEC-075: narrowly privileged, server-authored Staff Push cleanup.
-- The fixed 1,000-row limits are transaction-safety guards, not capacity policy.

CREATE FUNCTION public.cleanup_staff_push_v1()
RETURNS TABLE (
    deleted_deliveries INTEGER,
    deleted_intents INTEGER,
    deleted_registrations INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    delivery_count INTEGER := 0;
    intent_count INTEGER := 0;
    registration_count INTEGER := 0;
BEGIN
    WITH candidates AS (
        SELECT delivery.id
        FROM public.staff_push_deliveries AS delivery
        WHERE delivery.state IN (
            'PROVIDER_ACCEPTED', 'SUPPRESSED', 'PERMANENT_FAILURE', 'EXPIRED'
        )
          AND delivery.terminal_at < clock_timestamp() - interval '7 days'
        ORDER BY delivery.terminal_at, delivery.id
        FOR UPDATE SKIP LOCKED
        LIMIT 1000
    )
    DELETE FROM public.staff_push_deliveries AS delivery
    USING candidates
    WHERE delivery.id = candidates.id;
    GET DIAGNOSTICS delivery_count = ROW_COUNT;

    WITH candidates AS (
        SELECT intent.id
        FROM public.staff_push_intents AS intent
        WHERE intent.created_at < clock_timestamp() - interval '7 days'
          AND NOT EXISTS (
              SELECT 1 FROM public.staff_push_deliveries AS delivery
              WHERE delivery.intent_id = intent.id
          )
        ORDER BY intent.created_at, intent.id
        FOR UPDATE SKIP LOCKED
        LIMIT 1000
    )
    DELETE FROM public.staff_push_intents AS intent
    USING candidates
    WHERE intent.id = candidates.id;
    GET DIAGNOSTICS intent_count = ROW_COUNT;

    WITH candidates AS (
        SELECT registration.id
        FROM public.staff_push_registrations AS registration
        WHERE registration.state IN ('DISABLED', 'PROVIDER_INVALID', 'SUPERSEDED')
          AND registration.provider_token IS NULL
          AND registration.terminal_at < clock_timestamp() - interval '30 days'
          AND NOT EXISTS (
              SELECT 1 FROM public.staff_push_deliveries AS delivery
              WHERE delivery.registration_id = registration.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.staff_push_registrations AS predecessor
              WHERE predecessor.superseded_by_registration_id = registration.id
          )
        ORDER BY registration.terminal_at, registration.id
        FOR UPDATE SKIP LOCKED
        LIMIT 1000
    )
    DELETE FROM public.staff_push_registrations AS registration
    USING candidates
    WHERE registration.id = candidates.id;
    GET DIAGNOSTICS registration_count = ROW_COUNT;

    RETURN QUERY SELECT delivery_count, intent_count, registration_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_staff_push_v1() FROM PUBLIC;
