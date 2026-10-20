-- Issue #304: optional operator-facing Key Slot label.
-- Older callers retain the original six-argument creation function and behavior.
ALTER TABLE public.key_slots
  ADD COLUMN label TEXT,
  ADD CONSTRAINT key_slots_label_length_check
    CHECK (label IS NULL OR (
      label = btrim(label) AND char_length(label) BETWEEN 1 AND 160
    ));

CREATE FUNCTION public.management_physical_resource_create_key_slot(
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
  v_result RECORD;
  v_label TEXT;
BEGIN
  v_label := CASE WHEN p_label IS NULL THEN NULL ELSE btrim(p_label) END;
  IF p_label IS NOT NULL
     AND (v_label <> p_label OR char_length(v_label) NOT BETWEEN 1 AND 160) THEN
    RETURN QUERY SELECT NULL::UUID, FALSE, 'CONFIGURATION_VALUE_INVALID'::TEXT;
    RETURN;
  END IF;

  -- Reuse the existing audited, idempotent, scope-fenced creation command.
  SELECT * INTO v_result
  FROM public.management_physical_resource_create_key_slot(
    p_actor_membership_id, p_organization_id, p_location_id,
    p_operation_id, p_request_fingerprint, p_code
  );
  IF v_result.result_code = 'OK' AND v_result.changed AND v_label IS NOT NULL THEN
    UPDATE public.key_slots AS slot SET label = v_label
    WHERE slot.id = v_result.resource_id
      AND slot.organization_id = p_organization_id
      AND slot.location_id = p_location_id;
  END IF;
  RETURN QUERY SELECT v_result.resource_id, v_result.changed, v_result.result_code;
END;
$$;

REVOKE ALL ON FUNCTION public.management_physical_resource_create_key_slot(
  UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT
) FROM PUBLIC;
-- Runtime EXECUTE is granted exclusively by physical-resource-runtime-privileges.mjs.
