-- VAL-009F hardening correction (forward-only). Migration 30 is immutable.
-- 1) Primary-color SET explicitly rejects SQL NULL so NULL-as-clear is
--    impossible; dedicated CLEAR functions remain the only clear path.
-- 2) Persisted display-name overrides are canonical outer-trimmed values.

CREATE OR REPLACE FUNCTION public.location_branding_set_primary_color_override(
    "actor_membership_id" UUID,
    "target_location_id" UUID,
    "setting_value" TEXT,
    "expected_updated_at" TIMESTAMPTZ
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    authorized_organization_id UUID;
    persisted_updated_at TIMESTAMPTZ(3);
    mutation_time TIMESTAMPTZ(3);
    old_state RECORD;
    new_state RECORD;
BEGIN
    IF setting_value IS NULL
       OR setting_value !~ '^#[0-9A-F]{6}$' THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Invalid location branding value.';
    END IF;

    authorized_organization_id :=
        public.location_branding_authorized_organization(
            actor_membership_id, target_location_id
    );

    SELECT location.updated_at
    INTO persisted_updated_at
    FROM public.locations AS location
    WHERE location.id = target_location_id
      AND location.organization_id = authorized_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501',
            MESSAGE = 'Location branding is not available.';
    END IF;
    IF persisted_updated_at IS DISTINCT FROM expected_updated_at THEN
        RAISE EXCEPTION USING ERRCODE = '40001',
            MESSAGE = 'Location branding conflict.';
    END IF;

    old_state := public.location_branding_setting_state(
        target_location_id, 'brandPrimaryColor'
    );

    mutation_time := GREATEST(
        clock_timestamp(),
        persisted_updated_at + INTERVAL '0.001 second'
    );

    UPDATE public.locations AS location
    SET brand_primary_color_override = setting_value::TEXT,
        updated_at = mutation_time
    WHERE location.id = target_location_id
      AND location.organization_id = authorized_organization_id;

    new_state := public.location_branding_setting_state(
        target_location_id, 'brandPrimaryColor'
    );

    PERFORM public.location_branding_append_audit(
        authorized_organization_id, target_location_id,
        actor_membership_id, 'SET', 'brandPrimaryColor',
        old_state.override_present, old_state.override_value,
        old_state.effective_value,
        TRUE, setting_value, new_state.effective_value
    );

    RETURN mutation_time;
END;
$$;

REVOKE ALL ON FUNCTION public.location_branding_set_primary_color_override(
    UUID, UUID, TEXT, TIMESTAMPTZ
) FROM PUBLIC;

UPDATE public.locations
SET brand_display_name_override = btrim(brand_display_name_override)
WHERE brand_display_name_override IS NOT NULL
  AND brand_display_name_override IS DISTINCT FROM btrim(brand_display_name_override);

ALTER TABLE "locations" DROP CONSTRAINT "locations_brand_display_name_override_check";
ALTER TABLE "locations" ADD CONSTRAINT "locations_brand_display_name_override_check" CHECK (
    "brand_display_name_override" IS NULL
    OR (
        "brand_display_name_override" <> ''
        AND "brand_display_name_override" = btrim("brand_display_name_override")
        AND char_length("brand_display_name_override") <= 120
        AND "brand_display_name_override" !~ '[[:cntrl:]]'
    )
);
