-- Issue #236 / Task 04: extend the existing physical-resource boundary.
-- Preserve applied migration 046 and existing resource rows/QR identities.
DROP INDEX public.audit_events_physical_resource_create_operation_key;
CREATE UNIQUE INDEX audit_events_physical_resource_create_operation_key
ON public.audit_events(organization_id, idempotency_key)
WHERE event_type IN ('KEY_SLOT_CREATED', 'PARKING_SPOT_CREATED', 'PARKING_ZONE_CREATED')
  AND idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.management_physical_resource_authorize_actor(
  p_actor_membership_id UUID,
  p_organization_id UUID,
  p_location_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF p_actor_membership_id IS NULL OR p_organization_id IS NULL OR p_location_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHORIZATION_DENIED';
  END IF;

  SELECT membership.role::text
  INTO v_role
  FROM public.organization_memberships AS membership
  INNER JOIN public.users AS actor
    ON actor.id = membership.user_id
   AND actor.status = 'ACTIVE'
  INNER JOIN public.organizations AS organization
    ON organization.id = membership.organization_id
   AND organization.status = 'ACTIVE'
  INNER JOIN public.organization_subscriptions AS subscription
    ON subscription.organization_id = organization.id
   AND subscription.dashboard_access_enabled = TRUE
  WHERE membership.id = p_actor_membership_id
    AND membership.organization_id = p_organization_id
    AND membership.status = 'ACTIVE'
    AND membership.role IN ('ORG_ADMIN', 'LOCATION_MANAGER')
  FOR SHARE OF membership, actor, organization, subscription;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHORIZATION_DENIED';
  END IF;

  PERFORM 1
  FROM public.locations AS location
  WHERE location.id = p_location_id
    AND location.organization_id = p_organization_id
    AND location.status = 'ACTIVE'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHORIZATION_DENIED';
  END IF;

  IF v_role = 'LOCATION_MANAGER' THEN
    PERFORM 1
    FROM public.membership_location_access AS access
    WHERE access.organization_id = p_organization_id
      AND access.membership_id = p_actor_membership_id
      AND access.location_id = p_location_id
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHORIZATION_DENIED';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.management_physical_resource_find_replay(
  p_organization_id UUID,
  p_operation_id UUID,
  p_expected_event_type TEXT,
  p_request_fingerprint TEXT
) RETURNS TABLE(resource_id UUID, result_code TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT audit.entity_id,
    CASE
      WHEN audit.event_type = p_expected_event_type
       AND audit.metadata_json->>'requestFingerprint' = p_request_fingerprint
      THEN 'OK'
      ELSE 'IDEMPOTENCY_CONFLICT'
    END
  FROM public.audit_events AS audit
  WHERE audit.organization_id = p_organization_id
    AND audit.event_type IN ('KEY_SLOT_CREATED', 'PARKING_SPOT_CREATED', 'PARKING_ZONE_CREATED')
    AND audit.idempotency_key = p_operation_id::text
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.management_physical_resource_append_audit(
  p_organization_id UUID,
  p_location_id UUID,
  p_actor_membership_id UUID,
  p_event_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_request_fingerprint TEXT,
  p_resource_code TEXT,
  p_operation_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (p_event_type, p_entity_type) NOT IN (
    ('KEY_SLOT_CREATED', 'KeySlot'), ('PARKING_SPOT_CREATED', 'ParkingSpot'),
    ('PARKING_ZONE_CREATED', 'ParkingZone')
  ) OR p_event_type IS NULL OR p_entity_type IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHORIZATION_DENIED';
  END IF;
  INSERT INTO public.audit_events(
    id, organization_id, location_id, valet_session_id, actor_membership_id,
    actor_type, event_type, entity_type, entity_id, metadata_json,
    idempotency_key, occurred_at
  ) VALUES (
    gen_random_uuid(), p_organization_id, p_location_id, NULL, p_actor_membership_id,
    'MEMBERSHIP', p_event_type, p_entity_type, p_entity_id,
    jsonb_build_object(
      'requestFingerprint', p_request_fingerprint,
      'resourceCode', p_resource_code,
      'resourceType', CASE p_event_type
        WHEN 'KEY_SLOT_CREATED' THEN 'KEY_SLOT'
        WHEN 'PARKING_SPOT_CREATED' THEN 'PARKING_SPOT'
        WHEN 'PARKING_ZONE_CREATED' THEN 'PARKING_ZONE'
      END,
      'status', 'ACTIVE'
    ),
    p_operation_id::text, clock_timestamp()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.management_physical_resource_guard_audit_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.event_type IN ('KEY_SLOT_CREATED', 'PARKING_SPOT_CREATED', 'PARKING_ZONE_CREATED')
     AND current_user <> (
       SELECT pg_get_userbyid(relowner)
       FROM pg_class
       WHERE oid = 'public.audit_events'::regclass
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHORIZATION_DENIED';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.management_physical_resource_create_parking_zone(
  p_actor_membership_id UUID,
  p_organization_id UUID,
  p_location_id UUID,
  p_operation_id UUID,
  p_request_fingerprint TEXT,
  p_code TEXT,
  p_label TEXT
) RETURNS TABLE(resource_id UUID, changed BOOLEAN, result_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_code TEXT;
  v_label TEXT;
  v_replay RECORD;
  v_resource_id UUID;
  v_constraint TEXT;
BEGIN
  -- Authority is held before operation serialization/replay, as in 046.
  PERFORM public.management_physical_resource_authorize_actor(
    p_actor_membership_id, p_organization_id, p_location_id);

  IF p_operation_id IS NULL OR p_request_fingerprint IS NULL
     OR p_code IS NULL OR p_label IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, FALSE, 'CONFIGURATION_VALUE_INVALID';
    RETURN;
  END IF;
  v_code := pg_catalog.btrim(p_code);
  v_label := pg_catalog.btrim(p_label);
  IF p_request_fingerprint !~ '^[0-9a-f]{64}$'
     OR pg_catalog.char_length(v_code) NOT BETWEEN 1 AND 100
     OR pg_catalog.char_length(v_label) NOT BETWEEN 1 AND 160 THEN
    RETURN QUERY SELECT NULL::UUID, FALSE, 'CONFIGURATION_VALUE_INVALID';
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'management-physical-resource-create:' || p_organization_id::text || ':' ||
      p_operation_id::text, 0));
  SELECT * INTO v_replay
  FROM public.management_physical_resource_find_replay(
    p_organization_id, p_operation_id, 'PARKING_ZONE_CREATED', p_request_fingerprint);
  IF FOUND THEN
    RETURN QUERY SELECT v_replay.resource_id, FALSE, v_replay.result_code;
    RETURN;
  END IF;

  v_resource_id := pg_catalog.gen_random_uuid();
  BEGIN
    INSERT INTO public.parking_zones(
      id, organization_id, location_id, code, label, status, updated_at
    ) VALUES (
      v_resource_id, p_organization_id, p_location_id, v_code, v_label,
      'ACTIVE', pg_catalog.clock_timestamp()
    );
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint <> 'parking_zones_location_id_code_key' THEN
      RAISE;
    END IF;
    RETURN QUERY SELECT NULL::UUID, FALSE, 'RESOURCE_CODE_CONFLICT';
    RETURN;
  END;

  PERFORM public.management_physical_resource_append_audit(
    p_organization_id, p_location_id, p_actor_membership_id,
    'PARKING_ZONE_CREATED', 'ParkingZone', v_resource_id,
    p_request_fingerprint, v_code, p_operation_id);
  RETURN QUERY SELECT v_resource_id, TRUE, 'OK';
END;
$$;

REVOKE ALL ON FUNCTION public.management_physical_resource_authorize_actor(UUID,UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_physical_resource_find_replay(UUID,UUID,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_physical_resource_append_audit(UUID,UUID,UUID,TEXT,TEXT,UUID,TEXT,TEXT,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_physical_resource_guard_audit_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_physical_resource_create_parking_zone(UUID,UUID,UUID,UUID,TEXT,TEXT,TEXT) FROM PUBLIC;
