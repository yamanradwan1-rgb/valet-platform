CREATE FUNCTION public.cleanup_expired_raw_gps_samples(batch_limit INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    cleanup_time TIMESTAMPTZ := transaction_timestamp();
    deleted_count INTEGER;
BEGIN
    IF batch_limit IS NULL OR batch_limit < 1 OR batch_limit > 1000 THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Raw GPS cleanup batch limit is invalid.';
    END IF;

    WITH candidates AS (
        SELECT sample.id
        FROM public.raw_gps_samples AS sample
        INNER JOIN public.task_tracking_sessions AS tracker
            ON tracker.organization_id = sample.organization_id
           AND tracker.location_id = sample.location_id
           AND tracker.valet_session_id = sample.valet_session_id
           AND tracker.task_id = sample.task_id
           AND tracker.id = sample.tracking_session_id
           AND tracker.ended_at IS NOT NULL
        INNER JOIN public.locations AS location
            ON location.organization_id = sample.organization_id
           AND location.id = sample.location_id
        INNER JOIN public.organizations AS organization
            ON organization.id = sample.organization_id
        WHERE sample.received_at < cleanup_time - make_interval(
            days => COALESCE(
                location.raw_gps_retention_days_override,
                organization.raw_gps_retention_days
            )
        )
        ORDER BY sample.received_at, sample.id
        FOR UPDATE OF sample SKIP LOCKED
        LIMIT batch_limit
    ), deleted AS (
        DELETE FROM public.raw_gps_samples AS sample
        USING candidates
        WHERE sample.id = candidates.id
        RETURNING sample.id
    )
    SELECT count(*)::INTEGER INTO deleted_count FROM deleted;

    RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_raw_gps_samples(INTEGER)
FROM PUBLIC;
