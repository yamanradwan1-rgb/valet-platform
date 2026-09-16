-- MGT-BE-05 / DEC-083: typed Company settings and branding Management authority.
-- This migration preserves all existing ten DEC-058 settings and LM routes.

CREATE TYPE public.management_language AS ENUM ('EN', 'AR');
CREATE TYPE public.operating_weekday AS ENUM (
    'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY',
    'FRIDAY', 'SATURDAY', 'SUNDAY'
);

ALTER TABLE public.organizations
    ADD COLUMN language_default public.management_language NOT NULL DEFAULT 'EN',
    ADD COLUMN ocr_assist_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN parking_spot_required BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN employee_retrieval_requested_notification_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN guest_vehicle_ready_notification_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.locations
    ADD COLUMN language_default_override public.management_language,
    ADD COLUMN ocr_assist_enabled_override BOOLEAN,
    ADD COLUMN parking_spot_required_override BOOLEAN,
    ADD COLUMN employee_retrieval_requested_notification_enabled_override BOOLEAN,
    ADD COLUMN guest_vehicle_ready_notification_enabled_override BOOLEAN;

CREATE TABLE public.organization_operating_hours (
    organization_id UUID NOT NULL,
    weekday public.operating_weekday NOT NULL,
    is_closed BOOLEAN NOT NULL,
    opens_at TIME(0),
    closes_at TIME(0),
    CONSTRAINT organization_operating_hours_pkey
        PRIMARY KEY (organization_id, weekday),
    CONSTRAINT organization_operating_hours_organization_id_fkey
        FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT organization_operating_hours_interval_check CHECK (
        (is_closed AND opens_at IS NULL AND closes_at IS NULL)
        OR
        (NOT is_closed AND opens_at IS NOT NULL AND closes_at IS NOT NULL
            AND opens_at < closes_at)
    )
);

CREATE TABLE public.location_operating_hours_overrides (
    organization_id UUID NOT NULL,
    location_id UUID NOT NULL,
    weekday public.operating_weekday NOT NULL,
    is_closed BOOLEAN NOT NULL,
    opens_at TIME(0),
    closes_at TIME(0),
    CONSTRAINT location_operating_hours_overrides_pkey
        PRIMARY KEY (organization_id, location_id, weekday),
    CONSTRAINT location_operating_hours_overrides_location_fkey
        FOREIGN KEY (organization_id, location_id)
        REFERENCES public.locations(organization_id, id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT location_operating_hours_overrides_organization_id_fkey
        FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT location_operating_hours_overrides_interval_check CHECK (
        (is_closed AND opens_at IS NULL AND closes_at IS NULL)
        OR
        (NOT is_closed AND opens_at IS NOT NULL AND closes_at IS NOT NULL
            AND opens_at < closes_at)
    )
);

REVOKE ALL ON TABLE public.organization_operating_hours FROM PUBLIC;
REVOKE ALL ON TABLE public.location_operating_hours_overrides FROM PUBLIC;

-- A single Organization-scoped settings lock serializes Company-default writes,
-- Location SET/CLEAR, and field-command policy decisions. The API acquires this
-- lock before Management authorization when that authorization will lock a
-- target Location, keeping lock order deterministic.
CREATE FUNCTION public.management_settings_lock_organization(
    p_organization_id UUID,
    p_shared BOOLEAN DEFAULT FALSE
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF p_organization_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REQUEST_INVALID';
    END IF;
    IF p_shared THEN
        PERFORM pg_catalog.pg_advisory_xact_lock_shared(
            pg_catalog.hashtextextended(
                'management-settings-org:' || p_organization_id::text, 0
            )
        );
    ELSE
        PERFORM pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended(
                'management-settings-org:' || p_organization_id::text, 0
            )
        );
    END IF;
END;
$$;

CREATE FUNCTION public.management_settings_authorize_actor(
    p_actor_membership_id UUID,
    p_organization_id UUID,
    p_location_id UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    PERFORM public.management_settings_lock_organization(p_organization_id, FALSE);

    PERFORM 1
    FROM public.organization_memberships AS membership
    INNER JOIN public.users AS actor
      ON actor.id = membership.user_id AND actor.status = 'ACTIVE'
    INNER JOIN public.organizations AS organization
      ON organization.id = membership.organization_id
     AND organization.status = 'ACTIVE'
    WHERE membership.id = p_actor_membership_id
      AND membership.organization_id = p_organization_id
      AND membership.status = 'ACTIVE'
      AND membership.role = 'ORG_ADMIN'
    FOR UPDATE OF membership, organization;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHORIZATION_DENIED';
    END IF;

    IF p_location_id IS NOT NULL THEN
        PERFORM 1
        FROM public.locations AS location
        WHERE location.id = p_location_id
          AND location.organization_id = p_organization_id
          AND location.status = 'ACTIVE'
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHORIZATION_DENIED';
        END IF;
    END IF;
END;
$$;

CREATE FUNCTION public.management_settings_canonical_scalar_value(
    p_setting_key TEXT,
    p_setting_value TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_boolean BOOLEAN;
    v_integer INTEGER;
    v_numeric NUMERIC(14,3);
BEGIN
    IF p_setting_value IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONFIGURATION_VALUE_INVALID';
    END IF;

    IF p_setting_key IN (
        'checkInPhotosRequired', 'trackingEnabled', 'tipsEnabled',
        'validationEnabled', 'releaseRequiresPayment', 'ocrAssistEnabled',
        'parkingSpotRequired', 'employeeRetrievalRequestedNotificationEnabled',
        'guestVehicleReadyNotificationEnabled'
    ) THEN
        IF p_setting_value NOT IN ('true', 'false') THEN
            RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONFIGURATION_VALUE_INVALID';
        END IF;
        v_boolean := p_setting_value::BOOLEAN;
        RETURN v_boolean::TEXT;
    END IF;

    IF p_setting_key = 'rawGpsRetentionDays' THEN
        IF p_setting_value !~ '^[0-9]{1,10}$' THEN
            RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONFIGURATION_VALUE_INVALID';
        END IF;
        v_integer := p_setting_value::INTEGER;
        IF v_integer < 1 THEN
            RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONFIGURATION_VALUE_INVALID';
        END IF;
        RETURN v_integer::TEXT;
    END IF;

    IF p_setting_key = 'valetServiceFee' THEN
        IF p_setting_value !~ '^(?:0|[1-9][0-9]{0,10})(?:\.[0-9]{1,3})?$' THEN
            RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONFIGURATION_VALUE_INVALID';
        END IF;
        v_numeric := p_setting_value::NUMERIC;
        IF v_numeric > 99999999999.999 THEN
            RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONFIGURATION_VALUE_INVALID';
        END IF;
        RETURN (v_numeric::NUMERIC(14,3))::TEXT;
    END IF;

    IF p_setting_key = 'handoffStandardMethodPolicy'
       AND p_setting_value IN ('PICKUP_CODE', 'DYNAMIC_QR', 'EITHER') THEN
        RETURN p_setting_value;
    END IF;
    IF p_setting_key = 'paymentServicePayer'
       AND p_setting_value IN ('CUSTOMER', 'VENUE') THEN
        RETURN p_setting_value;
    END IF;
    IF p_setting_key = 'paymentMethodsPolicy'
       AND p_setting_value IN ('CASH_ONLY', 'DIGITAL_ONLY', 'CASH_OR_DIGITAL') THEN
        RETURN p_setting_value;
    END IF;
    IF p_setting_key = 'languageDefault' AND p_setting_value IN ('EN', 'AR') THEN
        RETURN p_setting_value;
    END IF;

    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONFIGURATION_VALUE_INVALID';
END;
$$;

CREATE FUNCTION public.management_settings_company_scalar_state(
    p_organization_id UUID,
    p_setting_key TEXT
) RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT CASE p_setting_key
        WHEN 'checkInPhotosRequired' THEN organization.check_in_photos_required::TEXT
        WHEN 'handoffStandardMethodPolicy' THEN organization.handoff_standard_method_policy::TEXT
        WHEN 'trackingEnabled' THEN organization.tracking_enabled::TEXT
        WHEN 'rawGpsRetentionDays' THEN organization.raw_gps_retention_days::TEXT
        WHEN 'valetServiceFee' THEN organization.valet_service_fee::TEXT
        WHEN 'paymentServicePayer' THEN organization.payment_service_payer::TEXT
        WHEN 'paymentMethodsPolicy' THEN organization.payment_methods_policy::TEXT
        WHEN 'tipsEnabled' THEN organization.tips_enabled::TEXT
        WHEN 'validationEnabled' THEN organization.validation_enabled::TEXT
        WHEN 'releaseRequiresPayment' THEN organization.release_requires_payment::TEXT
        WHEN 'languageDefault' THEN organization.language_default::TEXT
        WHEN 'ocrAssistEnabled' THEN organization.ocr_assist_enabled::TEXT
        WHEN 'parkingSpotRequired' THEN organization.parking_spot_required::TEXT
        WHEN 'employeeRetrievalRequestedNotificationEnabled'
            THEN organization.employee_retrieval_requested_notification_enabled::TEXT
        WHEN 'guestVehicleReadyNotificationEnabled'
            THEN organization.guest_vehicle_ready_notification_enabled::TEXT
        ELSE NULL
    END
    FROM public.organizations AS organization
    WHERE organization.id = p_organization_id
      AND p_setting_key IN (
        'checkInPhotosRequired', 'handoffStandardMethodPolicy', 'trackingEnabled',
        'rawGpsRetentionDays', 'valetServiceFee', 'paymentServicePayer',
        'paymentMethodsPolicy', 'tipsEnabled', 'validationEnabled',
        'releaseRequiresPayment', 'languageDefault', 'ocrAssistEnabled',
        'parkingSpotRequired', 'employeeRetrievalRequestedNotificationEnabled',
        'guestVehicleReadyNotificationEnabled'
      )
$$;

CREATE FUNCTION public.management_settings_location_scalar_state(
    p_location_id UUID,
    p_setting_key TEXT
) RETURNS TABLE (
    override_present BOOLEAN,
    override_value TEXT,
    effective_value TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT value.override_value IS NOT NULL,
           value.override_value,
           COALESCE(value.override_value, value.default_value)
    FROM public.locations AS location
    INNER JOIN public.organizations AS organization
      ON organization.id = location.organization_id
    CROSS JOIN LATERAL (
      SELECT
        CASE p_setting_key
          WHEN 'checkInPhotosRequired' THEN location.check_in_photos_required_override::TEXT
          WHEN 'handoffStandardMethodPolicy' THEN location.handoff_standard_method_policy_override::TEXT
          WHEN 'trackingEnabled' THEN location.tracking_enabled_override::TEXT
          WHEN 'rawGpsRetentionDays' THEN location.raw_gps_retention_days_override::TEXT
          WHEN 'valetServiceFee' THEN location.valet_service_fee_override::TEXT
          WHEN 'paymentServicePayer' THEN location.payment_service_payer_override::TEXT
          WHEN 'paymentMethodsPolicy' THEN location.payment_methods_policy_override::TEXT
          WHEN 'tipsEnabled' THEN location.tips_enabled_override::TEXT
          WHEN 'validationEnabled' THEN location.validation_enabled_override::TEXT
          WHEN 'releaseRequiresPayment' THEN location.release_requires_payment_override::TEXT
          WHEN 'languageDefault' THEN location.language_default_override::TEXT
          WHEN 'ocrAssistEnabled' THEN location.ocr_assist_enabled_override::TEXT
          WHEN 'parkingSpotRequired' THEN location.parking_spot_required_override::TEXT
          WHEN 'employeeRetrievalRequestedNotificationEnabled'
            THEN location.employee_retrieval_requested_notification_enabled_override::TEXT
          WHEN 'guestVehicleReadyNotificationEnabled'
            THEN location.guest_vehicle_ready_notification_enabled_override::TEXT
          ELSE NULL
        END AS override_value,
        CASE p_setting_key
          WHEN 'checkInPhotosRequired' THEN organization.check_in_photos_required::TEXT
          WHEN 'handoffStandardMethodPolicy' THEN organization.handoff_standard_method_policy::TEXT
          WHEN 'trackingEnabled' THEN organization.tracking_enabled::TEXT
          WHEN 'rawGpsRetentionDays' THEN organization.raw_gps_retention_days::TEXT
          WHEN 'valetServiceFee' THEN organization.valet_service_fee::TEXT
          WHEN 'paymentServicePayer' THEN organization.payment_service_payer::TEXT
          WHEN 'paymentMethodsPolicy' THEN organization.payment_methods_policy::TEXT
          WHEN 'tipsEnabled' THEN organization.tips_enabled::TEXT
          WHEN 'validationEnabled' THEN organization.validation_enabled::TEXT
          WHEN 'releaseRequiresPayment' THEN organization.release_requires_payment::TEXT
          WHEN 'languageDefault' THEN organization.language_default::TEXT
          WHEN 'ocrAssistEnabled' THEN organization.ocr_assist_enabled::TEXT
          WHEN 'parkingSpotRequired' THEN organization.parking_spot_required::TEXT
          WHEN 'employeeRetrievalRequestedNotificationEnabled'
            THEN organization.employee_retrieval_requested_notification_enabled::TEXT
          WHEN 'guestVehicleReadyNotificationEnabled'
            THEN organization.guest_vehicle_ready_notification_enabled::TEXT
          ELSE NULL
        END AS default_value
    ) AS value
    WHERE location.id = p_location_id
      AND p_setting_key IN (
        'checkInPhotosRequired', 'handoffStandardMethodPolicy', 'trackingEnabled',
        'rawGpsRetentionDays', 'valetServiceFee', 'paymentServicePayer',
        'paymentMethodsPolicy', 'tipsEnabled', 'validationEnabled',
        'releaseRequiresPayment', 'languageDefault', 'ocrAssistEnabled',
        'parkingSpotRequired', 'employeeRetrievalRequestedNotificationEnabled',
        'guestVehicleReadyNotificationEnabled'
      )
$$;

CREATE FUNCTION public.management_settings_fee_representable(
    p_currency TEXT,
    p_fee NUMERIC(14,3)
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_exponent INTEGER;
BEGIN
    v_exponent := public.location_configuration_minor_unit_exponent(p_currency);
    IF v_exponent IS NULL OR v_exponent NOT BETWEEN 0 AND 3 THEN
        RETURN FALSE;
    END IF;
    RETURN ((p_fee * 1000)::BIGINT
        % CASE (3 - v_exponent)
            WHEN 0 THEN 1::BIGINT
            WHEN 1 THEN 10::BIGINT
            WHEN 2 THEN 100::BIGINT
            ELSE 1000::BIGINT
          END) = 0;
END;
$$;

CREATE FUNCTION public.management_settings_append_company_audit(
    p_organization_id UUID,
    p_actor_membership_id UUID,
    p_setting_key TEXT,
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
      gen_random_uuid(), p_organization_id, NULL, NULL,
      p_actor_membership_id, 'MEMBERSHIP',
      'MANAGEMENT_COMPANY_SETTING_DEFAULT_CHANGED',
      'Organization', p_organization_id,
      jsonb_build_object(
        'scope', 'COMPANY_DEFAULT',
        'settingKey', p_setting_key,
        'previousValue', p_previous_value,
        'newValue', p_new_value
      ),
      clock_timestamp()
    );
END;
$$;

CREATE FUNCTION public.management_settings_append_location_audit(
    p_organization_id UUID,
    p_location_id UUID,
    p_actor_membership_id UUID,
    p_operation TEXT,
    p_setting_key TEXT,
    p_old_override_present BOOLEAN,
    p_old_override_value TEXT,
    p_old_effective_value TEXT,
    p_new_override_present BOOLEAN,
    p_new_override_value TEXT,
    p_new_effective_value TEXT
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
      'MANAGEMENT_LOCATION_SETTING_OVERRIDE_CHANGED',
      'Location', p_location_id,
      jsonb_strip_nulls(jsonb_build_object(
        'scope', 'LOCATION_OVERRIDE',
        'operation', p_operation,
        'settingKey', p_setting_key,
        'oldOverridePresent', p_old_override_present,
        'oldOverrideValue', p_old_override_value,
        'oldEffectiveValue', p_old_effective_value,
        'newOverridePresent', p_new_override_present,
        'newOverrideValue', p_new_override_value,
        'newEffectiveValue', p_new_effective_value
      )),
      clock_timestamp()
    );
END;
$$;

CREATE FUNCTION public.management_settings_set_company_scalar(
    p_actor_membership_id UUID,
    p_organization_id UUID,
    p_setting_key TEXT,
    p_setting_value TEXT,
    p_expected_updated_at TIMESTAMPTZ
) RETURNS TABLE(updated_at TIMESTAMPTZ, changed BOOLEAN, result_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_organization RECORD;
    v_current TEXT;
    v_canonical TEXT;
    v_mutation_time TIMESTAMPTZ(3);
    v_fee NUMERIC(14,3);
BEGIN
    PERFORM public.management_settings_authorize_actor(
      p_actor_membership_id, p_organization_id, NULL
    );

    SELECT organization.* INTO v_organization
    FROM public.organizations AS organization
    WHERE organization.id = p_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHORIZATION_DENIED';
    END IF;

    v_canonical := public.management_settings_canonical_scalar_value(
      p_setting_key, p_setting_value
    );
    v_current := public.management_settings_company_scalar_state(
      p_organization_id, p_setting_key
    );
    IF v_current IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONFIGURATION_VALUE_INVALID';
    END IF;

    IF p_setting_key = 'valetServiceFee' THEN
      v_fee := v_canonical::NUMERIC(14,3);
      IF EXISTS (
        SELECT 1 FROM public.locations AS location
        WHERE location.organization_id = p_organization_id
          AND location.valet_service_fee_override IS NULL
          AND NOT public.management_settings_fee_representable(location.currency, v_fee)
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONFIGURATION_VALUE_INVALID';
      END IF;
    END IF;

    IF v_current = v_canonical THEN
      RETURN QUERY SELECT v_organization.updated_at, FALSE, 'OK'::TEXT;
      RETURN;
    END IF;
    IF p_expected_updated_at IS NULL
       OR v_organization.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RETURN QUERY SELECT v_organization.updated_at, FALSE, 'CONFIGURATION_CONFLICT'::TEXT;
      RETURN;
    END IF;

    v_mutation_time := GREATEST(
      clock_timestamp(), v_organization.updated_at + INTERVAL '0.001 second'
    );

    UPDATE public.organizations AS organization
    SET check_in_photos_required = CASE WHEN p_setting_key = 'checkInPhotosRequired'
          THEN v_canonical::BOOLEAN ELSE organization.check_in_photos_required END,
        handoff_standard_method_policy = CASE WHEN p_setting_key = 'handoffStandardMethodPolicy'
          THEN v_canonical::public.handoff_standard_method_policy
          ELSE organization.handoff_standard_method_policy END,
        tracking_enabled = CASE WHEN p_setting_key = 'trackingEnabled'
          THEN v_canonical::BOOLEAN ELSE organization.tracking_enabled END,
        raw_gps_retention_days = CASE WHEN p_setting_key = 'rawGpsRetentionDays'
          THEN v_canonical::INTEGER ELSE organization.raw_gps_retention_days END,
        valet_service_fee = CASE WHEN p_setting_key = 'valetServiceFee'
          THEN v_canonical::NUMERIC(14,3) ELSE organization.valet_service_fee END,
        payment_service_payer = CASE WHEN p_setting_key = 'paymentServicePayer'
          THEN v_canonical::public.payment_service_payer ELSE organization.payment_service_payer END,
        payment_methods_policy = CASE WHEN p_setting_key = 'paymentMethodsPolicy'
          THEN v_canonical::public.payment_methods_policy ELSE organization.payment_methods_policy END,
        tips_enabled = CASE WHEN p_setting_key = 'tipsEnabled'
          THEN v_canonical::BOOLEAN ELSE organization.tips_enabled END,
        validation_enabled = CASE WHEN p_setting_key = 'validationEnabled'
          THEN v_canonical::BOOLEAN ELSE organization.validation_enabled END,
        release_requires_payment = CASE WHEN p_setting_key = 'releaseRequiresPayment'
          THEN v_canonical::BOOLEAN ELSE organization.release_requires_payment END,
        language_default = CASE WHEN p_setting_key = 'languageDefault'
          THEN v_canonical::public.management_language ELSE organization.language_default END,
        ocr_assist_enabled = CASE WHEN p_setting_key = 'ocrAssistEnabled'
          THEN v_canonical::BOOLEAN ELSE organization.ocr_assist_enabled END,
        parking_spot_required = CASE WHEN p_setting_key = 'parkingSpotRequired'
          THEN v_canonical::BOOLEAN ELSE organization.parking_spot_required END,
        employee_retrieval_requested_notification_enabled = CASE
          WHEN p_setting_key = 'employeeRetrievalRequestedNotificationEnabled'
          THEN v_canonical::BOOLEAN
          ELSE organization.employee_retrieval_requested_notification_enabled END,
        guest_vehicle_ready_notification_enabled = CASE
          WHEN p_setting_key = 'guestVehicleReadyNotificationEnabled'
          THEN v_canonical::BOOLEAN ELSE organization.guest_vehicle_ready_notification_enabled END,
        updated_at = v_mutation_time
    WHERE organization.id = p_organization_id;

    PERFORM public.management_settings_append_company_audit(
      p_organization_id, p_actor_membership_id, p_setting_key, v_current, v_canonical
    );
    RETURN QUERY SELECT v_mutation_time, TRUE, 'OK'::TEXT;
END;
$$;

CREATE FUNCTION public.management_settings_set_location_scalar(
    p_actor_membership_id UUID,
    p_organization_id UUID,
    p_location_id UUID,
    p_setting_key TEXT,
    p_setting_value TEXT,
    p_expected_updated_at TIMESTAMPTZ
) RETURNS TABLE(updated_at TIMESTAMPTZ, changed BOOLEAN, result_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_location RECORD;
    v_old RECORD;
    v_new RECORD;
    v_canonical TEXT;
    v_mutation_time TIMESTAMPTZ(3);
BEGIN
    PERFORM public.management_settings_authorize_actor(
      p_actor_membership_id, p_organization_id, p_location_id
    );
    SELECT location.* INTO v_location
    FROM public.locations AS location
    WHERE location.id = p_location_id AND location.organization_id = p_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHORIZATION_DENIED';
    END IF;

    v_canonical := public.management_settings_canonical_scalar_value(
      p_setting_key, p_setting_value
    );
    v_old := public.management_settings_location_scalar_state(p_location_id, p_setting_key);
    IF v_old.effective_value IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONFIGURATION_VALUE_INVALID';
    END IF;
    IF p_setting_key = 'valetServiceFee'
       AND NOT public.management_settings_fee_representable(
         v_location.currency, v_canonical::NUMERIC(14,3)
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONFIGURATION_VALUE_INVALID';
    END IF;
    IF v_old.override_present AND v_old.override_value = v_canonical THEN
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
    UPDATE public.locations AS location
    SET check_in_photos_required_override = CASE WHEN p_setting_key = 'checkInPhotosRequired'
          THEN v_canonical::BOOLEAN ELSE location.check_in_photos_required_override END,
        handoff_standard_method_policy_override = CASE WHEN p_setting_key = 'handoffStandardMethodPolicy'
          THEN v_canonical::public.handoff_standard_method_policy
          ELSE location.handoff_standard_method_policy_override END,
        tracking_enabled_override = CASE WHEN p_setting_key = 'trackingEnabled'
          THEN v_canonical::BOOLEAN ELSE location.tracking_enabled_override END,
        raw_gps_retention_days_override = CASE WHEN p_setting_key = 'rawGpsRetentionDays'
          THEN v_canonical::INTEGER ELSE location.raw_gps_retention_days_override END,
        valet_service_fee_override = CASE WHEN p_setting_key = 'valetServiceFee'
          THEN v_canonical::NUMERIC(14,3) ELSE location.valet_service_fee_override END,
        payment_service_payer_override = CASE WHEN p_setting_key = 'paymentServicePayer'
          THEN v_canonical::public.payment_service_payer ELSE location.payment_service_payer_override END,
        payment_methods_policy_override = CASE WHEN p_setting_key = 'paymentMethodsPolicy'
          THEN v_canonical::public.payment_methods_policy ELSE location.payment_methods_policy_override END,
        tips_enabled_override = CASE WHEN p_setting_key = 'tipsEnabled'
          THEN v_canonical::BOOLEAN ELSE location.tips_enabled_override END,
        validation_enabled_override = CASE WHEN p_setting_key = 'validationEnabled'
          THEN v_canonical::BOOLEAN ELSE location.validation_enabled_override END,
        release_requires_payment_override = CASE WHEN p_setting_key = 'releaseRequiresPayment'
          THEN v_canonical::BOOLEAN ELSE location.release_requires_payment_override END,
        language_default_override = CASE WHEN p_setting_key = 'languageDefault'
          THEN v_canonical::public.management_language ELSE location.language_default_override END,
        ocr_assist_enabled_override = CASE WHEN p_setting_key = 'ocrAssistEnabled'
          THEN v_canonical::BOOLEAN ELSE location.ocr_assist_enabled_override END,
        parking_spot_required_override = CASE WHEN p_setting_key = 'parkingSpotRequired'
          THEN v_canonical::BOOLEAN ELSE location.parking_spot_required_override END,
        employee_retrieval_requested_notification_enabled_override = CASE
          WHEN p_setting_key = 'employeeRetrievalRequestedNotificationEnabled'
          THEN v_canonical::BOOLEAN
          ELSE location.employee_retrieval_requested_notification_enabled_override END,
        guest_vehicle_ready_notification_enabled_override = CASE
          WHEN p_setting_key = 'guestVehicleReadyNotificationEnabled'
          THEN v_canonical::BOOLEAN ELSE location.guest_vehicle_ready_notification_enabled_override END,
        updated_at = v_mutation_time
    WHERE location.id = p_location_id AND location.organization_id = p_organization_id;

    v_new := public.management_settings_location_scalar_state(p_location_id, p_setting_key);
    PERFORM public.management_settings_append_location_audit(
      p_organization_id, p_location_id, p_actor_membership_id, 'SET', p_setting_key,
      v_old.override_present, v_old.override_value, v_old.effective_value,
      TRUE, v_canonical, v_new.effective_value
    );
    RETURN QUERY SELECT v_mutation_time, TRUE, 'OK'::TEXT;
END;
$$;

CREATE FUNCTION public.management_settings_clear_location_scalar(
    p_actor_membership_id UUID,
    p_organization_id UUID,
    p_location_id UUID,
    p_setting_key TEXT,
    p_expected_updated_at TIMESTAMPTZ
) RETURNS TABLE(updated_at TIMESTAMPTZ, changed BOOLEAN, result_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_location RECORD;
    v_old RECORD;
    v_new RECORD;
    v_mutation_time TIMESTAMPTZ(3);
BEGIN
    PERFORM public.management_settings_authorize_actor(
      p_actor_membership_id, p_organization_id, p_location_id
    );
    SELECT location.* INTO v_location
    FROM public.locations AS location
    WHERE location.id = p_location_id AND location.organization_id = p_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHORIZATION_DENIED';
    END IF;
    v_old := public.management_settings_location_scalar_state(p_location_id, p_setting_key);
    IF v_old.effective_value IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONFIGURATION_VALUE_INVALID';
    END IF;
    IF NOT v_old.override_present THEN
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
    UPDATE public.locations AS location
    SET check_in_photos_required_override = CASE WHEN p_setting_key = 'checkInPhotosRequired'
          THEN NULL ELSE location.check_in_photos_required_override END,
        handoff_standard_method_policy_override = CASE WHEN p_setting_key = 'handoffStandardMethodPolicy'
          THEN NULL ELSE location.handoff_standard_method_policy_override END,
        tracking_enabled_override = CASE WHEN p_setting_key = 'trackingEnabled'
          THEN NULL ELSE location.tracking_enabled_override END,
        raw_gps_retention_days_override = CASE WHEN p_setting_key = 'rawGpsRetentionDays'
          THEN NULL ELSE location.raw_gps_retention_days_override END,
        valet_service_fee_override = CASE WHEN p_setting_key = 'valetServiceFee'
          THEN NULL ELSE location.valet_service_fee_override END,
        payment_service_payer_override = CASE WHEN p_setting_key = 'paymentServicePayer'
          THEN NULL ELSE location.payment_service_payer_override END,
        payment_methods_policy_override = CASE WHEN p_setting_key = 'paymentMethodsPolicy'
          THEN NULL ELSE location.payment_methods_policy_override END,
        tips_enabled_override = CASE WHEN p_setting_key = 'tipsEnabled'
          THEN NULL ELSE location.tips_enabled_override END,
        validation_enabled_override = CASE WHEN p_setting_key = 'validationEnabled'
          THEN NULL ELSE location.validation_enabled_override END,
        release_requires_payment_override = CASE WHEN p_setting_key = 'releaseRequiresPayment'
          THEN NULL ELSE location.release_requires_payment_override END,
        language_default_override = CASE WHEN p_setting_key = 'languageDefault'
          THEN NULL ELSE location.language_default_override END,
        ocr_assist_enabled_override = CASE WHEN p_setting_key = 'ocrAssistEnabled'
          THEN NULL ELSE location.ocr_assist_enabled_override END,
        parking_spot_required_override = CASE WHEN p_setting_key = 'parkingSpotRequired'
          THEN NULL ELSE location.parking_spot_required_override END,
        employee_retrieval_requested_notification_enabled_override = CASE
          WHEN p_setting_key = 'employeeRetrievalRequestedNotificationEnabled'
          THEN NULL ELSE location.employee_retrieval_requested_notification_enabled_override END,
        guest_vehicle_ready_notification_enabled_override = CASE
          WHEN p_setting_key = 'guestVehicleReadyNotificationEnabled'
          THEN NULL ELSE location.guest_vehicle_ready_notification_enabled_override END,
        updated_at = v_mutation_time
    WHERE location.id = p_location_id AND location.organization_id = p_organization_id;

    v_new := public.management_settings_location_scalar_state(p_location_id, p_setting_key);
    PERFORM public.management_settings_append_location_audit(
      p_organization_id, p_location_id, p_actor_membership_id, 'CLEAR', p_setting_key,
      v_old.override_present, v_old.override_value, v_old.effective_value,
      FALSE, NULL, v_new.effective_value
    );
    RETURN QUERY SELECT v_mutation_time, TRUE, 'OK'::TEXT;
END;
$$;

CREATE FUNCTION public.management_settings_validate_hours(
    p_weekdays public.operating_weekday[],
    p_is_closed BOOLEAN[],
    p_opens_at TIME[],
    p_closes_at TIME[]
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_invalid BOOLEAN;
BEGIN
    IF COALESCE(array_length(p_weekdays, 1), 0) <> 7
       OR COALESCE(array_length(p_is_closed, 1), 0) <> 7
       OR COALESCE(array_length(p_opens_at, 1), 0) <> 7
       OR COALESCE(array_length(p_closes_at, 1), 0) <> 7
       OR (SELECT count(DISTINCT value) FROM unnest(p_weekdays) AS value) <> 7 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONFIGURATION_VALUE_INVALID';
    END IF;
    SELECT EXISTS (
      SELECT 1
      FROM unnest(p_weekdays, p_is_closed, p_opens_at, p_closes_at)
        AS entry(weekday, is_closed, opens_at, closes_at)
      WHERE entry.weekday IS NULL OR entry.is_closed IS NULL
         OR (entry.is_closed AND (entry.opens_at IS NOT NULL OR entry.closes_at IS NOT NULL))
         OR (NOT entry.is_closed AND (
              entry.opens_at IS NULL OR entry.closes_at IS NULL
              OR entry.opens_at >= entry.closes_at
            ))
    ) INTO v_invalid;
    IF v_invalid THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONFIGURATION_VALUE_INVALID';
    END IF;
END;
$$;

-- Audit metadata must preserve the actual bounded typed schedule, not merely
-- whether a schedule exists. Seven TIME(0) entries canonicalize to at most
-- 153 ASCII characters (MON=HH:MM:SS-HH:MM:SS;...;SUN=...), safely below the
-- BE-01 primitive-string metadata bound. NULL denotes no configured schedule.
CREATE FUNCTION public.management_settings_canonical_hours(
    p_weekdays public.operating_weekday[],
    p_is_closed BOOLEAN[],
    p_opens_at TIME[],
    p_closes_at TIME[]
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_value TEXT;
BEGIN
    IF COALESCE(array_length(p_weekdays, 1), 0) = 0 THEN
      RETURN NULL;
    END IF;
    PERFORM public.management_settings_validate_hours(
      p_weekdays, p_is_closed, p_opens_at, p_closes_at
    );
    SELECT string_agg(
        substring(entry.weekday::text, 1, 3) || '=' ||
        CASE WHEN entry.is_closed THEN 'C'
             ELSE to_char(entry.opens_at, 'HH24:MI:SS') || '-' ||
                  to_char(entry.closes_at, 'HH24:MI:SS')
        END,
        ';' ORDER BY entry.weekday
      )
    INTO v_value
    FROM unnest(p_weekdays, p_is_closed, p_opens_at, p_closes_at)
      AS entry(weekday, is_closed, opens_at, closes_at);
    RETURN v_value;
END;
$$;

CREATE FUNCTION public.management_settings_set_company_operating_hours(
    p_actor_membership_id UUID,
    p_organization_id UUID,
    p_weekdays public.operating_weekday[],
    p_is_closed BOOLEAN[],
    p_opens_at TIME[],
    p_closes_at TIME[],
    p_expected_updated_at TIMESTAMPTZ
) RETURNS TABLE(updated_at TIMESTAMPTZ, changed BOOLEAN, result_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_updated_at TIMESTAMPTZ(3);
    v_mutation_time TIMESTAMPTZ(3);
    v_same BOOLEAN;
    v_previous_value TEXT;
    v_new_value TEXT;
BEGIN
    PERFORM public.management_settings_authorize_actor(
      p_actor_membership_id, p_organization_id, NULL
    );
    PERFORM public.management_settings_validate_hours(
      p_weekdays, p_is_closed, p_opens_at, p_closes_at
    );
    SELECT organization.updated_at INTO v_updated_at
    FROM public.organizations AS organization
    WHERE organization.id = p_organization_id
    FOR UPDATE;

    SELECT public.management_settings_canonical_hours(
      array_agg(existing.weekday ORDER BY existing.weekday),
      array_agg(existing.is_closed ORDER BY existing.weekday),
      array_agg(existing.opens_at ORDER BY existing.weekday),
      array_agg(existing.closes_at ORDER BY existing.weekday)
    ) INTO v_previous_value
    FROM public.organization_operating_hours AS existing
    WHERE existing.organization_id = p_organization_id;
    v_new_value := public.management_settings_canonical_hours(
      p_weekdays, p_is_closed, p_opens_at, p_closes_at
    );
    SELECT v_previous_value IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM unnest(p_weekdays, p_is_closed, p_opens_at, p_closes_at)
        AS entry(weekday, is_closed, opens_at, closes_at)
      LEFT JOIN public.organization_operating_hours AS existing
        ON existing.organization_id = p_organization_id
       AND existing.weekday = entry.weekday
      WHERE existing.weekday IS NULL
         OR existing.is_closed IS DISTINCT FROM entry.is_closed
         OR existing.opens_at IS DISTINCT FROM entry.opens_at
         OR existing.closes_at IS DISTINCT FROM entry.closes_at
    ) INTO v_same;
    IF v_same THEN
      RETURN QUERY SELECT v_updated_at, FALSE, 'OK'::TEXT;
      RETURN;
    END IF;
    IF p_expected_updated_at IS NULL OR v_updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RETURN QUERY SELECT v_updated_at, FALSE, 'CONFIGURATION_CONFLICT'::TEXT;
      RETURN;
    END IF;

    DELETE FROM public.organization_operating_hours
    WHERE organization_id = p_organization_id;
    INSERT INTO public.organization_operating_hours(
      organization_id, weekday, is_closed, opens_at, closes_at
    )
    SELECT p_organization_id, entry.weekday, entry.is_closed,
           entry.opens_at, entry.closes_at
    FROM unnest(p_weekdays, p_is_closed, p_opens_at, p_closes_at)
      AS entry(weekday, is_closed, opens_at, closes_at);

    v_mutation_time := GREATEST(clock_timestamp(), v_updated_at + INTERVAL '0.001 second');
    UPDATE public.organizations SET updated_at = v_mutation_time
    WHERE id = p_organization_id;
    PERFORM public.management_settings_append_company_audit(
      p_organization_id, p_actor_membership_id, 'operatingHours',
      COALESCE(v_previous_value, 'UNCONFIGURED'), v_new_value
    );
    RETURN QUERY SELECT v_mutation_time, TRUE, 'OK'::TEXT;
END;
$$;

CREATE FUNCTION public.management_settings_clear_company_operating_hours(
    p_actor_membership_id UUID,
    p_organization_id UUID,
    p_expected_updated_at TIMESTAMPTZ
) RETURNS TABLE(updated_at TIMESTAMPTZ, changed BOOLEAN, result_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_updated_at TIMESTAMPTZ(3);
    v_mutation_time TIMESTAMPTZ(3);
    v_previous_value TEXT;
BEGIN
    PERFORM public.management_settings_authorize_actor(
      p_actor_membership_id, p_organization_id, NULL
    );
    SELECT organization.updated_at INTO v_updated_at
    FROM public.organizations AS organization
    WHERE organization.id = p_organization_id FOR UPDATE;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_operating_hours
      WHERE organization_id = p_organization_id
    ) THEN
      RETURN QUERY SELECT v_updated_at, FALSE, 'OK'::TEXT;
      RETURN;
    END IF;
    IF p_expected_updated_at IS NULL OR v_updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RETURN QUERY SELECT v_updated_at, FALSE, 'CONFIGURATION_CONFLICT'::TEXT;
      RETURN;
    END IF;
    SELECT public.management_settings_canonical_hours(
      array_agg(existing.weekday ORDER BY existing.weekday),
      array_agg(existing.is_closed ORDER BY existing.weekday),
      array_agg(existing.opens_at ORDER BY existing.weekday),
      array_agg(existing.closes_at ORDER BY existing.weekday)
    ) INTO v_previous_value
    FROM public.organization_operating_hours AS existing
    WHERE existing.organization_id = p_organization_id;
    DELETE FROM public.organization_operating_hours
    WHERE organization_id = p_organization_id;
    v_mutation_time := GREATEST(clock_timestamp(), v_updated_at + INTERVAL '0.001 second');
    UPDATE public.organizations SET updated_at = v_mutation_time
    WHERE id = p_organization_id;
    PERFORM public.management_settings_append_company_audit(
      p_organization_id, p_actor_membership_id, 'operatingHours',
      v_previous_value, 'UNCONFIGURED'
    );
    RETURN QUERY SELECT v_mutation_time, TRUE, 'OK'::TEXT;
END;
$$;

CREATE FUNCTION public.management_settings_set_location_operating_hours(
    p_actor_membership_id UUID,
    p_organization_id UUID,
    p_location_id UUID,
    p_weekdays public.operating_weekday[],
    p_is_closed BOOLEAN[],
    p_opens_at TIME[],
    p_closes_at TIME[],
    p_expected_updated_at TIMESTAMPTZ
) RETURNS TABLE(updated_at TIMESTAMPTZ, changed BOOLEAN, result_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_updated_at TIMESTAMPTZ(3);
    v_mutation_time TIMESTAMPTZ(3);
    v_same BOOLEAN;
    v_old_override_present BOOLEAN;
    v_old_override_value TEXT;
    v_old_effective_value TEXT;
    v_company_value TEXT;
    v_new_override_value TEXT;
BEGIN
    PERFORM public.management_settings_authorize_actor(
      p_actor_membership_id, p_organization_id, p_location_id
    );
    PERFORM public.management_settings_validate_hours(
      p_weekdays, p_is_closed, p_opens_at, p_closes_at
    );
    SELECT location.updated_at INTO v_updated_at
    FROM public.locations AS location
    WHERE location.id = p_location_id AND location.organization_id = p_organization_id
    FOR UPDATE;
    SELECT public.management_settings_canonical_hours(
      array_agg(existing.weekday ORDER BY existing.weekday),
      array_agg(existing.is_closed ORDER BY existing.weekday),
      array_agg(existing.opens_at ORDER BY existing.weekday),
      array_agg(existing.closes_at ORDER BY existing.weekday)
    ) INTO v_old_override_value
    FROM public.location_operating_hours_overrides AS existing
    WHERE existing.organization_id = p_organization_id
      AND existing.location_id = p_location_id;
    v_old_override_present := v_old_override_value IS NOT NULL;
    SELECT public.management_settings_canonical_hours(
      array_agg(existing.weekday ORDER BY existing.weekday),
      array_agg(existing.is_closed ORDER BY existing.weekday),
      array_agg(existing.opens_at ORDER BY existing.weekday),
      array_agg(existing.closes_at ORDER BY existing.weekday)
    ) INTO v_company_value
    FROM public.organization_operating_hours AS existing
    WHERE existing.organization_id = p_organization_id;
    v_old_effective_value := COALESCE(v_old_override_value, v_company_value);
    v_new_override_value := public.management_settings_canonical_hours(
      p_weekdays, p_is_closed, p_opens_at, p_closes_at
    );
    SELECT v_old_override_present AND NOT EXISTS (
      SELECT 1
      FROM unnest(p_weekdays, p_is_closed, p_opens_at, p_closes_at)
        AS entry(weekday, is_closed, opens_at, closes_at)
      LEFT JOIN public.location_operating_hours_overrides AS existing
        ON existing.organization_id = p_organization_id
       AND existing.location_id = p_location_id
       AND existing.weekday = entry.weekday
      WHERE existing.weekday IS NULL
         OR existing.is_closed IS DISTINCT FROM entry.is_closed
         OR existing.opens_at IS DISTINCT FROM entry.opens_at
         OR existing.closes_at IS DISTINCT FROM entry.closes_at
    ) INTO v_same;
    IF v_same THEN
      RETURN QUERY SELECT v_updated_at, FALSE, 'OK'::TEXT;
      RETURN;
    END IF;
    IF p_expected_updated_at IS NULL OR v_updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RETURN QUERY SELECT v_updated_at, FALSE, 'CONFIGURATION_CONFLICT'::TEXT;
      RETURN;
    END IF;

    DELETE FROM public.location_operating_hours_overrides
    WHERE organization_id = p_organization_id AND location_id = p_location_id;
    INSERT INTO public.location_operating_hours_overrides(
      organization_id, location_id, weekday, is_closed, opens_at, closes_at
    )
    SELECT p_organization_id, p_location_id, entry.weekday, entry.is_closed,
           entry.opens_at, entry.closes_at
    FROM unnest(p_weekdays, p_is_closed, p_opens_at, p_closes_at)
      AS entry(weekday, is_closed, opens_at, closes_at);
    v_mutation_time := GREATEST(clock_timestamp(), v_updated_at + INTERVAL '0.001 second');
    UPDATE public.locations SET updated_at = v_mutation_time
    WHERE id = p_location_id AND organization_id = p_organization_id;
    PERFORM public.management_settings_append_location_audit(
      p_organization_id, p_location_id, p_actor_membership_id,
      'SET', 'operatingHours', v_old_override_present,
      v_old_override_value, COALESCE(v_old_effective_value, 'UNCONFIGURED'),
      TRUE, v_new_override_value, v_new_override_value
    );
    RETURN QUERY SELECT v_mutation_time, TRUE, 'OK'::TEXT;
END;
$$;

CREATE FUNCTION public.management_settings_clear_location_operating_hours(
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
    v_updated_at TIMESTAMPTZ(3);
    v_mutation_time TIMESTAMPTZ(3);
    v_old_override_value TEXT;
    v_company_value TEXT;
BEGIN
    PERFORM public.management_settings_authorize_actor(
      p_actor_membership_id, p_organization_id, p_location_id
    );
    SELECT location.updated_at INTO v_updated_at
    FROM public.locations AS location
    WHERE location.id = p_location_id AND location.organization_id = p_organization_id
    FOR UPDATE;
    IF NOT EXISTS (
      SELECT 1 FROM public.location_operating_hours_overrides
      WHERE organization_id = p_organization_id AND location_id = p_location_id
    ) THEN
      RETURN QUERY SELECT v_updated_at, FALSE, 'OK'::TEXT;
      RETURN;
    END IF;
    IF p_expected_updated_at IS NULL OR v_updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RETURN QUERY SELECT v_updated_at, FALSE, 'CONFIGURATION_CONFLICT'::TEXT;
      RETURN;
    END IF;
    SELECT public.management_settings_canonical_hours(
      array_agg(existing.weekday ORDER BY existing.weekday),
      array_agg(existing.is_closed ORDER BY existing.weekday),
      array_agg(existing.opens_at ORDER BY existing.weekday),
      array_agg(existing.closes_at ORDER BY existing.weekday)
    ) INTO v_old_override_value
    FROM public.location_operating_hours_overrides AS existing
    WHERE existing.organization_id = p_organization_id
      AND existing.location_id = p_location_id;
    SELECT public.management_settings_canonical_hours(
      array_agg(existing.weekday ORDER BY existing.weekday),
      array_agg(existing.is_closed ORDER BY existing.weekday),
      array_agg(existing.opens_at ORDER BY existing.weekday),
      array_agg(existing.closes_at ORDER BY existing.weekday)
    ) INTO v_company_value
    FROM public.organization_operating_hours AS existing
    WHERE existing.organization_id = p_organization_id;
    DELETE FROM public.location_operating_hours_overrides
    WHERE organization_id = p_organization_id AND location_id = p_location_id;
    v_mutation_time := GREATEST(clock_timestamp(), v_updated_at + INTERVAL '0.001 second');
    UPDATE public.locations SET updated_at = v_mutation_time
    WHERE id = p_location_id AND organization_id = p_organization_id;
    PERFORM public.management_settings_append_location_audit(
      p_organization_id, p_location_id, p_actor_membership_id,
      'CLEAR', 'operatingHours', TRUE, v_old_override_value, v_old_override_value,
      FALSE, NULL,
      COALESCE(v_company_value, 'UNCONFIGURED')
    );
    RETURN QUERY SELECT v_mutation_time, TRUE, 'OK'::TEXT;
END;
$$;

CREATE FUNCTION public.management_branding_append_company_audit(
    p_organization_id UUID,
    p_actor_membership_id UUID,
    p_setting_key TEXT,
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
      gen_random_uuid(), p_organization_id, NULL, NULL,
      p_actor_membership_id, 'MEMBERSHIP',
      'MANAGEMENT_COMPANY_BRANDING_DEFAULT_CHANGED',
      'Organization', p_organization_id,
      jsonb_build_object(
        'scope', 'COMPANY_BRANDING_DEFAULT',
        'settingKey', p_setting_key,
        'previousValue', p_previous_value,
        'newValue', p_new_value
      ),
      clock_timestamp()
    );
END;
$$;

CREATE FUNCTION public.management_branding_append_location_audit(
    p_organization_id UUID,
    p_location_id UUID,
    p_actor_membership_id UUID,
    p_operation TEXT,
    p_setting_key TEXT,
    p_old_override_present BOOLEAN,
    p_old_override_value TEXT,
    p_old_effective_value TEXT,
    p_new_override_present BOOLEAN,
    p_new_override_value TEXT,
    p_new_effective_value TEXT
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
      'MANAGEMENT_LOCATION_BRANDING_OVERRIDE_CHANGED',
      'Location', p_location_id,
      jsonb_strip_nulls(jsonb_build_object(
        'scope', 'LOCATION_BRANDING_OVERRIDE',
        'operation', p_operation,
        'settingKey', p_setting_key,
        'oldOverridePresent', p_old_override_present,
        'oldOverrideValue', p_old_override_value,
        'oldEffectiveValue', p_old_effective_value,
        'newOverridePresent', p_new_override_present,
        'newOverrideValue', p_new_override_value,
        'newEffectiveValue', p_new_effective_value
      )),
      clock_timestamp()
    );
END;
$$;

CREATE FUNCTION public.management_branding_set_company_default(
    p_actor_membership_id UUID,
    p_organization_id UUID,
    p_setting_key TEXT,
    p_setting_value TEXT,
    p_expected_updated_at TIMESTAMPTZ
) RETURNS TABLE(updated_at TIMESTAMPTZ, changed BOOLEAN, result_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_organization RECORD;
    v_canonical TEXT;
    v_current TEXT;
    v_mutation_time TIMESTAMPTZ(3);
BEGIN
    PERFORM public.management_settings_authorize_actor(
      p_actor_membership_id, p_organization_id, NULL
    );
    SELECT organization.* INTO v_organization
    FROM public.organizations AS organization
    WHERE organization.id = p_organization_id FOR UPDATE;
    IF p_setting_key = 'brandDisplayName' THEN
      IF p_setting_value IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONFIGURATION_VALUE_INVALID';
      END IF;
      v_canonical := btrim(p_setting_value);
      IF v_canonical = '' OR char_length(v_canonical) > 120
         OR v_canonical ~ '[[:cntrl:]]' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONFIGURATION_VALUE_INVALID';
      END IF;
      v_current := v_organization.name;
    ELSIF p_setting_key = 'brandPrimaryColor' THEN
      IF p_setting_value IS NULL OR p_setting_value !~ '^#[0-9A-F]{6}$' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONFIGURATION_VALUE_INVALID';
      END IF;
      v_canonical := p_setting_value;
      v_current := v_organization.brand_primary_color;
    ELSE
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONFIGURATION_VALUE_INVALID';
    END IF;
    IF v_current = v_canonical THEN
      RETURN QUERY SELECT v_organization.updated_at, FALSE, 'OK'::TEXT;
      RETURN;
    END IF;
    IF p_expected_updated_at IS NULL
       OR v_organization.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RETURN QUERY SELECT v_organization.updated_at, FALSE, 'CONFIGURATION_CONFLICT'::TEXT;
      RETURN;
    END IF;
    v_mutation_time := GREATEST(
      clock_timestamp(), v_organization.updated_at + INTERVAL '0.001 second'
    );
    UPDATE public.organizations AS organization
    SET name = CASE WHEN p_setting_key = 'brandDisplayName'
                    THEN v_canonical ELSE organization.name END,
        brand_primary_color = CASE WHEN p_setting_key = 'brandPrimaryColor'
                    THEN v_canonical ELSE organization.brand_primary_color END,
        updated_at = v_mutation_time
    WHERE organization.id = p_organization_id;
    PERFORM public.management_branding_append_company_audit(
      p_organization_id, p_actor_membership_id, p_setting_key, v_current, v_canonical
    );
    RETURN QUERY SELECT v_mutation_time, TRUE, 'OK'::TEXT;
END;
$$;

CREATE FUNCTION public.management_branding_set_location_override(
    p_actor_membership_id UUID,
    p_organization_id UUID,
    p_location_id UUID,
    p_setting_key TEXT,
    p_setting_value TEXT,
    p_expected_updated_at TIMESTAMPTZ
) RETURNS TABLE(updated_at TIMESTAMPTZ, changed BOOLEAN, result_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_location RECORD;
    v_old RECORD;
    v_new RECORD;
    v_canonical TEXT;
    v_mutation_time TIMESTAMPTZ(3);
BEGIN
    PERFORM public.management_settings_authorize_actor(
      p_actor_membership_id, p_organization_id, p_location_id
    );
    SELECT location.* INTO v_location
    FROM public.locations AS location
    WHERE location.id = p_location_id AND location.organization_id = p_organization_id
    FOR UPDATE;
    IF p_setting_key = 'brandDisplayName' THEN
      IF p_setting_value IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONFIGURATION_VALUE_INVALID';
      END IF;
      v_canonical := btrim(p_setting_value);
      IF v_canonical = '' OR char_length(v_canonical) > 120
         OR v_canonical ~ '[[:cntrl:]]' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONFIGURATION_VALUE_INVALID';
      END IF;
    ELSIF p_setting_key = 'brandPrimaryColor' THEN
      IF p_setting_value IS NULL OR p_setting_value !~ '^#[0-9A-F]{6}$' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONFIGURATION_VALUE_INVALID';
      END IF;
      v_canonical := p_setting_value;
    ELSE
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONFIGURATION_VALUE_INVALID';
    END IF;
    v_old := public.location_branding_setting_state(p_location_id, p_setting_key);
    IF v_old.override_present AND v_old.override_value = v_canonical THEN
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
    UPDATE public.locations AS location
    SET brand_display_name_override = CASE WHEN p_setting_key = 'brandDisplayName'
          THEN v_canonical ELSE location.brand_display_name_override END,
        brand_primary_color_override = CASE WHEN p_setting_key = 'brandPrimaryColor'
          THEN v_canonical ELSE location.brand_primary_color_override END,
        updated_at = v_mutation_time
    WHERE location.id = p_location_id AND location.organization_id = p_organization_id;
    v_new := public.location_branding_setting_state(p_location_id, p_setting_key);
    PERFORM public.management_branding_append_location_audit(
      p_organization_id, p_location_id, p_actor_membership_id, 'SET', p_setting_key,
      v_old.override_present, v_old.override_value, v_old.effective_value,
      TRUE, v_canonical, v_new.effective_value
    );
    RETURN QUERY SELECT v_mutation_time, TRUE, 'OK'::TEXT;
END;
$$;

CREATE FUNCTION public.management_branding_clear_location_override(
    p_actor_membership_id UUID,
    p_organization_id UUID,
    p_location_id UUID,
    p_setting_key TEXT,
    p_expected_updated_at TIMESTAMPTZ
) RETURNS TABLE(updated_at TIMESTAMPTZ, changed BOOLEAN, result_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_location RECORD;
    v_old RECORD;
    v_new RECORD;
    v_mutation_time TIMESTAMPTZ(3);
BEGIN
    PERFORM public.management_settings_authorize_actor(
      p_actor_membership_id, p_organization_id, p_location_id
    );
    IF p_setting_key NOT IN ('brandDisplayName', 'brandPrimaryColor') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONFIGURATION_VALUE_INVALID';
    END IF;
    SELECT location.* INTO v_location
    FROM public.locations AS location
    WHERE location.id = p_location_id AND location.organization_id = p_organization_id
    FOR UPDATE;
    v_old := public.location_branding_setting_state(p_location_id, p_setting_key);
    IF NOT v_old.override_present THEN
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
    UPDATE public.locations AS location
    SET brand_display_name_override = CASE WHEN p_setting_key = 'brandDisplayName'
          THEN NULL ELSE location.brand_display_name_override END,
        brand_primary_color_override = CASE WHEN p_setting_key = 'brandPrimaryColor'
          THEN NULL ELSE location.brand_primary_color_override END,
        updated_at = v_mutation_time
    WHERE location.id = p_location_id AND location.organization_id = p_organization_id;
    v_new := public.location_branding_setting_state(p_location_id, p_setting_key);
    PERFORM public.management_branding_append_location_audit(
      p_organization_id, p_location_id, p_actor_membership_id, 'CLEAR', p_setting_key,
      v_old.override_present, v_old.override_value, v_old.effective_value,
      FALSE, NULL, v_new.effective_value
    );
    RETURN QUERY SELECT v_mutation_time, TRUE, 'OK'::TEXT;
END;
$$;

-- Existing Location Manager mutation functions keep their original role/grant
-- checks. Only their internal Organization-scoped serialization is strengthened
-- so Company-default and Location-override writes cannot observe mixed states.
CREATE OR REPLACE FUNCTION public.location_configuration_authorized_organization(
    actor_membership_id UUID,
    target_location_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    authorized_organization_id UUID;
    target_organization_id UUID;
BEGIN
    SELECT location.organization_id INTO target_organization_id
    FROM public.locations AS location
    WHERE location.id = target_location_id;
    IF target_organization_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '42501',
            MESSAGE = 'Location configuration is not available.';
    END IF;
    PERFORM public.management_settings_lock_organization(target_organization_id, FALSE);

    SELECT membership.organization_id
    INTO authorized_organization_id
    FROM public.organization_memberships AS membership
    INNER JOIN public.users AS actor
        ON actor.id = membership.user_id AND actor.status = 'ACTIVE'
    INNER JOIN public.locations AS location
        ON location.organization_id = membership.organization_id
       AND location.id = target_location_id AND location.status = 'ACTIVE'
    INNER JOIN public.organizations AS organization
        ON organization.id = membership.organization_id AND organization.status = 'ACTIVE'
    INNER JOIN public.membership_location_access AS access
        ON access.organization_id = membership.organization_id
       AND access.membership_id = membership.id AND access.location_id = location.id
    WHERE membership.id = actor_membership_id
      AND membership.status = 'ACTIVE'
      AND membership.role = 'LOCATION_MANAGER';
    IF authorized_organization_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '42501',
            MESSAGE = 'Location configuration is not available.';
    END IF;
    RETURN authorized_organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.location_branding_authorized_organization(
    actor_membership_id UUID,
    target_location_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    authorized_organization_id UUID;
    target_organization_id UUID;
BEGIN
    SELECT location.organization_id INTO target_organization_id
    FROM public.locations AS location
    WHERE location.id = target_location_id;
    IF target_organization_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '42501',
            MESSAGE = 'Location branding is not available.';
    END IF;
    PERFORM public.management_settings_lock_organization(target_organization_id, FALSE);

    SELECT membership.organization_id
    INTO authorized_organization_id
    FROM public.organization_memberships AS membership
    INNER JOIN public.users AS actor
        ON actor.id = membership.user_id AND actor.status = 'ACTIVE'
    INNER JOIN public.locations AS location
        ON location.organization_id = membership.organization_id
       AND location.id = target_location_id AND location.status = 'ACTIVE'
    INNER JOIN public.organizations AS organization
        ON organization.id = membership.organization_id AND organization.status = 'ACTIVE'
    INNER JOIN public.membership_location_access AS access
        ON access.organization_id = membership.organization_id
       AND access.membership_id = membership.id AND access.location_id = location.id
    WHERE membership.id = actor_membership_id
      AND membership.status = 'ACTIVE'
      AND membership.role = 'LOCATION_MANAGER';
    IF authorized_organization_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '42501',
            MESSAGE = 'Location branding is not available.';
    END IF;
    RETURN authorized_organization_id;
END;
$$;

REVOKE ALL ON FUNCTION public.management_settings_lock_organization(UUID,BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_settings_authorize_actor(UUID,UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_settings_canonical_scalar_value(TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_settings_company_scalar_state(UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_settings_location_scalar_state(UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_settings_fee_representable(TEXT,NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_settings_append_company_audit(UUID,UUID,TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_settings_append_location_audit(
    UUID,UUID,UUID,TEXT,TEXT,BOOLEAN,TEXT,TEXT,BOOLEAN,TEXT,TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_settings_validate_hours(
    public.operating_weekday[],BOOLEAN[],TIME[],TIME[]
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_settings_canonical_hours(
    public.operating_weekday[],BOOLEAN[],TIME[],TIME[]
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_branding_append_company_audit(UUID,UUID,TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_branding_append_location_audit(
    UUID,UUID,UUID,TEXT,TEXT,BOOLEAN,TEXT,TEXT,BOOLEAN,TEXT,TEXT
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.management_settings_set_company_scalar(
    UUID,UUID,TEXT,TEXT,TIMESTAMPTZ
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_settings_set_location_scalar(
    UUID,UUID,UUID,TEXT,TEXT,TIMESTAMPTZ
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_settings_clear_location_scalar(
    UUID,UUID,UUID,TEXT,TIMESTAMPTZ
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_settings_set_company_operating_hours(
    UUID,UUID,public.operating_weekday[],BOOLEAN[],TIME[],TIME[],TIMESTAMPTZ
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_settings_clear_company_operating_hours(
    UUID,UUID,TIMESTAMPTZ
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_settings_set_location_operating_hours(
    UUID,UUID,UUID,public.operating_weekday[],BOOLEAN[],TIME[],TIME[],TIMESTAMPTZ
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_settings_clear_location_operating_hours(
    UUID,UUID,UUID,TIMESTAMPTZ
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_branding_set_company_default(
    UUID,UUID,TEXT,TEXT,TIMESTAMPTZ
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_branding_set_location_override(
    UUID,UUID,UUID,TEXT,TEXT,TIMESTAMPTZ
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_branding_clear_location_override(
    UUID,UUID,UUID,TEXT,TIMESTAMPTZ
) FROM PUBLIC;

-- Keep the pre-existing LM helper private after CREATE OR REPLACE.
REVOKE ALL ON FUNCTION public.location_configuration_authorized_organization(UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.location_branding_authorized_organization(UUID,UUID) FROM PUBLIC;
