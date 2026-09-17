-- MGT-BE-10 / DEC-095: historically truthful Management KPI sources.

ALTER TABLE public.locations
    ADD COLUMN sla_target_seconds INTEGER,
    ADD CONSTRAINT locations_sla_target_seconds_check
      CHECK (sla_target_seconds IS NULL OR sla_target_seconds BETWEEN 30 AND 3600);

ALTER TABLE public.retrieval_requests
    ADD COLUMN sla_target_seconds_snapshot INTEGER,
    ADD CONSTRAINT retrieval_requests_sla_target_seconds_snapshot_check
      CHECK (sla_target_seconds_snapshot IS NULL
             OR sla_target_seconds_snapshot BETWEEN 30 AND 3600);

-- Measured BE-10 analytics indexes. These are intentionally limited to the
-- source scans that remained material in the representative EXPLAIN benchmark.
CREATE INDEX valet_sessions_org_location_completed_at_kpi_idx
ON public.valet_sessions (organization_id, location_id, completed_at)
INCLUDE (completed_by_membership_id)
WHERE completed_at IS NOT NULL;

CREATE INDEX retrieval_requests_org_requested_at_kpi_idx
ON public.retrieval_requests (organization_id, requested_at, valet_session_id)
INCLUDE (sla_target_seconds_snapshot)
WHERE status <> 'CANCELLED';

CREATE INDEX dispatch_events_kpi_work_evidence_idx
ON public.dispatch_events (organization_id, location_id, occurred_at)
INCLUDE (actor_membership_id)
WHERE actor_membership_id IS NOT NULL
  AND event_type IN ('ACCEPTED', 'DECLINED', 'IN_PROGRESS', 'COMPLETED');

CREATE INDEX key_custody_events_kpi_work_evidence_idx
ON public.key_custody_events (organization_id, location_id, occurred_at)
INCLUDE (actor_membership_id);

CREATE INDEX vehicle_photos_kpi_work_evidence_idx
ON public.vehicle_photos (organization_id, location_id, created_at)
INCLUDE (captured_by_membership_id);

CREATE INDEX handoff_verifications_kpi_work_evidence_idx
ON public.handoff_verifications (organization_id, verified_at, valet_session_id)
INCLUDE (verified_by_membership_id)
WHERE verified_by_membership_id IS NOT NULL AND verified_at IS NOT NULL;

CREATE FUNCTION public.retrieval_request_snapshot_sla_target()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_target INTEGER;
BEGIN
    PERFORM public.management_settings_lock_organization(
      NEW.organization_id, TRUE
    );
    SELECT location.sla_target_seconds
      INTO v_target
    FROM public.valet_sessions AS session
    INNER JOIN public.locations AS location
      ON location.organization_id = session.organization_id
     AND location.id = session.location_id
    WHERE session.organization_id = NEW.organization_id
      AND session.id = NEW.valet_session_id;
    NEW.sla_target_seconds_snapshot := v_target;
    RETURN NEW;
END;
$$;

CREATE FUNCTION public.retrieval_request_reject_sla_snapshot_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.sla_target_seconds_snapshot
       IS DISTINCT FROM OLD.sla_target_seconds_snapshot THEN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = 'Retrieval SLA target snapshot is immutable.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER retrieval_requests_snapshot_sla_target_before_insert
BEFORE INSERT ON public.retrieval_requests
FOR EACH ROW EXECUTE FUNCTION public.retrieval_request_snapshot_sla_target();

CREATE TRIGGER retrieval_requests_sla_snapshot_immutable_before_update
BEFORE UPDATE OF sla_target_seconds_snapshot ON public.retrieval_requests
FOR EACH ROW
EXECUTE FUNCTION public.retrieval_request_reject_sla_snapshot_mutation();

CREATE FUNCTION public.management_settings_append_sla_target_audit(
    p_organization_id UUID,
    p_location_id UUID,
    p_actor_membership_id UUID,
    p_operation TEXT,
    p_previous_value TEXT,
    p_new_value TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    INSERT INTO public.audit_events (
      id, organization_id, location_id, valet_session_id,
      actor_membership_id, actor_type, event_type, entity_type, entity_id,
      metadata_json, occurred_at
    ) VALUES (
      gen_random_uuid(), p_organization_id, p_location_id, NULL,
      p_actor_membership_id, 'MEMBERSHIP',
      'MANAGEMENT_LOCATION_SLA_TARGET_CHANGED',
      'Location', p_location_id,
      jsonb_build_object(
        'scope', 'LOCATION_SETTING',
        'operation', p_operation,
        'settingKey', 'slaTargetSeconds',
        'previousValue', COALESCE(p_previous_value, 'UNCONFIGURED'),
        'newValue', COALESCE(p_new_value, 'UNCONFIGURED')
      ),
      clock_timestamp()
    );
END;
$$;

CREATE FUNCTION public.management_settings_set_location_sla_target(
    p_actor_membership_id UUID,
    p_organization_id UUID,
    p_location_id UUID,
    p_target_seconds INTEGER,
    p_expected_updated_at TIMESTAMPTZ
) RETURNS TABLE(updated_at TIMESTAMPTZ, changed BOOLEAN, result_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_location RECORD;
    v_mutation_time TIMESTAMPTZ(3);
BEGIN
    IF p_target_seconds IS NULL OR p_target_seconds NOT BETWEEN 30 AND 3600 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONFIGURATION_VALUE_INVALID';
    END IF;
    PERFORM public.management_settings_authorize_actor(
      p_actor_membership_id, p_organization_id, p_location_id
    );
    SELECT location.updated_at, location.sla_target_seconds
      INTO v_location
    FROM public.locations AS location
    WHERE location.id = p_location_id
      AND location.organization_id = p_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHORIZATION_DENIED';
    END IF;
    IF v_location.sla_target_seconds IS NOT DISTINCT FROM p_target_seconds THEN
      RETURN QUERY SELECT v_location.updated_at, FALSE, 'OK'::TEXT;
      RETURN;
    END IF;
    IF p_expected_updated_at IS NULL
       OR v_location.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RETURN QUERY SELECT v_location.updated_at, FALSE, 'CONFIGURATION_CONFLICT'::TEXT;
      RETURN;
    END IF;
    v_mutation_time := GREATEST(
      clock_timestamp(), v_location.updated_at + INTERVAL '0.001 second'
    );
    UPDATE public.locations
    SET sla_target_seconds = p_target_seconds, updated_at = v_mutation_time
    WHERE id = p_location_id AND organization_id = p_organization_id;
    PERFORM public.management_settings_append_sla_target_audit(
      p_organization_id, p_location_id, p_actor_membership_id, 'SET',
      v_location.sla_target_seconds::TEXT, p_target_seconds::TEXT
    );
    RETURN QUERY SELECT v_mutation_time, TRUE, 'OK'::TEXT;
END;
$$;

CREATE FUNCTION public.management_settings_clear_location_sla_target(
    p_actor_membership_id UUID,
    p_organization_id UUID,
    p_location_id UUID,
    p_expected_updated_at TIMESTAMPTZ
) RETURNS TABLE(updated_at TIMESTAMPTZ, changed BOOLEAN, result_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_location RECORD;
    v_mutation_time TIMESTAMPTZ(3);
BEGIN
    PERFORM public.management_settings_authorize_actor(
      p_actor_membership_id, p_organization_id, p_location_id
    );
    SELECT location.updated_at, location.sla_target_seconds
      INTO v_location
    FROM public.locations AS location
    WHERE location.id = p_location_id
      AND location.organization_id = p_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHORIZATION_DENIED';
    END IF;
    IF v_location.sla_target_seconds IS NULL THEN
      RETURN QUERY SELECT v_location.updated_at, FALSE, 'OK'::TEXT;
      RETURN;
    END IF;
    IF p_expected_updated_at IS NULL
       OR v_location.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RETURN QUERY SELECT v_location.updated_at, FALSE, 'CONFIGURATION_CONFLICT'::TEXT;
      RETURN;
    END IF;
    v_mutation_time := GREATEST(
      clock_timestamp(), v_location.updated_at + INTERVAL '0.001 second'
    );
    UPDATE public.locations
    SET sla_target_seconds = NULL, updated_at = v_mutation_time
    WHERE id = p_location_id AND organization_id = p_organization_id;
    PERFORM public.management_settings_append_sla_target_audit(
      p_organization_id, p_location_id, p_actor_membership_id, 'CLEAR',
      v_location.sla_target_seconds::TEXT, NULL
    );
    RETURN QUERY SELECT v_mutation_time, TRUE, 'OK'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.retrieval_request_snapshot_sla_target() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retrieval_request_reject_sla_snapshot_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_settings_append_sla_target_audit(
    UUID,UUID,UUID,TEXT,TEXT,TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_settings_set_location_sla_target(
    UUID,UUID,UUID,INTEGER,TIMESTAMPTZ
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_settings_clear_location_sla_target(
    UUID,UUID,UUID,TIMESTAMPTZ
) FROM PUBLIC;
