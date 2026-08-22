-- VAL-009F / DEC-062: basic branding overrides and typed Organization
-- subscription entitlement state. Forward-only; migrations 1-29 unchanged.

ALTER TABLE "organizations" ADD COLUMN "brand_primary_color" TEXT NOT NULL DEFAULT '#176BFF';
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_brand_primary_color_check" CHECK ("brand_primary_color" ~ '^#[0-9A-F]{6}$');

ALTER TABLE "locations" ADD COLUMN "brand_display_name_override" TEXT;
ALTER TABLE "locations" ADD COLUMN "brand_primary_color_override" TEXT;
ALTER TABLE "locations" ADD CONSTRAINT "locations_brand_display_name_override_check" CHECK (
    "brand_display_name_override" IS NULL
    OR (
        btrim("brand_display_name_override") <> ''
        AND char_length(btrim("brand_display_name_override")) <= 120
        AND btrim("brand_display_name_override") !~ '[[:cntrl:]]'
    )
);
ALTER TABLE "locations" ADD CONSTRAINT "locations_brand_primary_color_override_check" CHECK (
    "brand_primary_color_override" IS NULL
    OR "brand_primary_color_override" ~ '^#[0-9A-F]{6}$'
);

CREATE TYPE "organization_subscription_status" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED');

CREATE TABLE "organization_subscriptions" (
    "organization_id" UUID NOT NULL,
    "plan_code" TEXT NOT NULL,
    "status" "organization_subscription_status" NOT NULL,
    "dashboard_access_enabled" BOOLEAN NOT NULL,
    "report_exports_enabled" BOOLEAN NOT NULL,
    "basic_branding_enabled" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_subscriptions_pkey" PRIMARY KEY ("organization_id")
);
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_plan_code_check" CHECK ("plan_code" ~ '^[A-Z0-9][A-Z0-9_-]{0,63}$');

CREATE FUNCTION "location_branding_authorized_organization"(
    "actor_membership_id" UUID,
    "target_location_id" UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    authorized_organization_id UUID;
BEGIN
    SELECT membership.organization_id
    INTO authorized_organization_id
    FROM public.organization_memberships AS membership
    INNER JOIN public.users AS actor
        ON actor.id = membership.user_id
       AND actor.status = 'ACTIVE'
    INNER JOIN public.locations AS location
        ON location.organization_id = membership.organization_id
       AND location.id = target_location_id
       AND location.status = 'ACTIVE'
    INNER JOIN public.organizations AS organization
        ON organization.id = membership.organization_id
       AND organization.status = 'ACTIVE'
    INNER JOIN public.membership_location_access AS access
        ON access.organization_id = membership.organization_id
       AND access.membership_id = membership.id
       AND access.location_id = location.id
    WHERE membership.id = actor_membership_id
      AND membership.status = 'ACTIVE'
      AND membership.role = 'LOCATION_MANAGER';

    IF authorized_organization_id IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Location branding is not available.';
    END IF;
    RETURN authorized_organization_id;
END;
$$;

CREATE FUNCTION "location_branding_setting_state"(
    "target_location_id" UUID,
    "setting_key" TEXT
)
RETURNS TABLE (
    "override_present" BOOLEAN,
    "override_value" TEXT,
    "effective_value" TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT
        setting.override_expression IS NOT NULL,
        setting.override_expression,
        COALESCE(setting.override_expression, setting.default_expression)
    FROM public.locations AS location
    INNER JOIN public.organizations AS organization
        ON organization.id = location.organization_id
    CROSS JOIN LATERAL (
        SELECT
            CASE setting_key
                WHEN 'brandDisplayName' THEN
                    location.brand_display_name_override::TEXT
                WHEN 'brandPrimaryColor' THEN
                    location.brand_primary_color_override::TEXT
                ELSE NULL
            END AS override_expression,
            CASE setting_key
                WHEN 'brandDisplayName' THEN
                    organization.name::TEXT
                WHEN 'brandPrimaryColor' THEN
                    organization.brand_primary_color::TEXT
                ELSE NULL
            END AS default_expression
    ) AS setting
    WHERE location.id = target_location_id
      AND setting_key IN ('brandDisplayName', 'brandPrimaryColor')
$$;

CREATE FUNCTION "location_branding_append_audit"(
    "organization_id" UUID,
    "location_id" UUID,
    "actor_membership_id" UUID,
    "operation" TEXT,
    "setting_key" TEXT,
    "old_override_present" BOOLEAN,
    "old_override_value" TEXT,
    "old_effective_value" TEXT,
    "new_override_present" BOOLEAN,
    "new_override_value" TEXT,
    "new_effective_value" TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    INSERT INTO public.audit_events (
        id, organization_id, location_id, valet_session_id,
        actor_membership_id, event_type, entity_type, entity_id,
        metadata_json, occurred_at
    ) VALUES (
        gen_random_uuid(), organization_id, location_id, NULL,
        actor_membership_id,
        'DASHBOARD_LOCATION_BRANDING_OVERRIDE_CHANGED',
        'Location', location_id,
        jsonb_strip_nulls(jsonb_build_object(
            'scope', 'LOCATION_BRANDING_OVERRIDE',
            'operation', operation,
            'settingKey', setting_key,
            'oldOverridePresent', old_override_present,
            'oldOverrideValue', old_override_value,
            'oldEffectiveValue', old_effective_value,
            'newOverridePresent', new_override_present,
            'newOverrideValue', new_override_value,
            'newEffectiveValue', new_effective_value
        )),
        clock_timestamp()
    );
END;
$$;

CREATE FUNCTION "location_branding_set_display_name_override"(
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
    v_text TEXT;
BEGIN
    IF setting_value IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Invalid location branding value.';
    END IF;
    v_text := btrim(setting_value);
    IF v_text = ''
       OR char_length(v_text) > 120
       OR v_text ~ '[[:cntrl:]]' THEN
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
        target_location_id, 'brandDisplayName'
    );

    mutation_time := GREATEST(
        clock_timestamp(),
        persisted_updated_at + INTERVAL '0.001 second'
    );

    UPDATE public.locations AS location
    SET brand_display_name_override = v_text,
        updated_at = mutation_time
    WHERE location.id = target_location_id
      AND location.organization_id = authorized_organization_id;

    new_state := public.location_branding_setting_state(
        target_location_id, 'brandDisplayName'
    );

    PERFORM public.location_branding_append_audit(
        authorized_organization_id, target_location_id,
        actor_membership_id, 'SET', 'brandDisplayName',
        old_state.override_present, old_state.override_value,
        old_state.effective_value,
        TRUE, new_state.override_value, new_state.effective_value
    );

    RETURN mutation_time;
END;
$$;

CREATE FUNCTION "location_branding_set_primary_color_override"(
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
    v_text TEXT;
BEGIN
    IF setting_value !~ '^#[0-9A-F]{6}$' THEN
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

CREATE FUNCTION "location_branding_clear_display_name_override"(
    "actor_membership_id" UUID,
    "target_location_id" UUID,
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
        target_location_id, 'brandDisplayName'
    );

    mutation_time := GREATEST(
        clock_timestamp(),
        persisted_updated_at + INTERVAL '0.001 second'
    );

    UPDATE public.locations AS location
    SET brand_display_name_override = NULL,
        updated_at = mutation_time
    WHERE location.id = target_location_id
      AND location.organization_id = authorized_organization_id;

    new_state := public.location_branding_setting_state(
        target_location_id, 'brandDisplayName'
    );

    PERFORM public.location_branding_append_audit(
        authorized_organization_id, target_location_id,
        actor_membership_id, 'CLEAR', 'brandDisplayName',
        old_state.override_present, old_state.override_value,
        old_state.effective_value,
        FALSE, NULL, new_state.effective_value
    );

    RETURN mutation_time;
END;
$$;

CREATE FUNCTION "location_branding_clear_primary_color_override"(
    "actor_membership_id" UUID,
    "target_location_id" UUID,
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
    SET brand_primary_color_override = NULL,
        updated_at = mutation_time
    WHERE location.id = target_location_id
      AND location.organization_id = authorized_organization_id;

    new_state := public.location_branding_setting_state(
        target_location_id, 'brandPrimaryColor'
    );

    PERFORM public.location_branding_append_audit(
        authorized_organization_id, target_location_id,
        actor_membership_id, 'CLEAR', 'brandPrimaryColor',
        old_state.override_present, old_state.override_value,
        old_state.effective_value,
        FALSE, NULL, new_state.effective_value
    );

    RETURN mutation_time;
END;
$$;

REVOKE ALL ON FUNCTION public.location_branding_authorized_organization(UUID, UUID)
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.location_branding_setting_state(UUID, TEXT)
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.location_branding_append_audit(
    UUID, UUID, UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT, BOOLEAN, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.location_branding_set_display_name_override(
    UUID, UUID, TEXT, TIMESTAMPTZ
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.location_branding_set_primary_color_override(
    UUID, UUID, TEXT, TIMESTAMPTZ
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.location_branding_clear_display_name_override(
    UUID, UUID, TIMESTAMPTZ
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.location_branding_clear_primary_color_override(
    UUID, UUID, TIMESTAMPTZ
) FROM PUBLIC;
