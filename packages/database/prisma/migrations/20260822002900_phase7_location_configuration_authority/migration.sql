CREATE FUNCTION "location_configuration_authorized_organization"(
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
            MESSAGE = 'Location configuration is not available.';
    END IF;
    RETURN authorized_organization_id;
END;
$$;

CREATE FUNCTION "location_configuration_setting_state"(
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
        COALESCE(
            setting.override_expression,
            setting.default_expression
        )
    FROM public.locations AS location
    INNER JOIN public.organizations AS organization
        ON organization.id = location.organization_id
    CROSS JOIN LATERAL (
        SELECT
            CASE setting_key
                WHEN 'checkInPhotosRequired' THEN
                    location.check_in_photos_required_override::TEXT
                WHEN 'handoffStandardMethodPolicy' THEN
                    location.handoff_standard_method_policy_override::TEXT
                WHEN 'trackingEnabled' THEN
                    location.tracking_enabled_override::TEXT
                WHEN 'rawGpsRetentionDays' THEN
                    location.raw_gps_retention_days_override::TEXT
                WHEN 'valetServiceFee' THEN
                    location.valet_service_fee_override::TEXT
                WHEN 'paymentServicePayer' THEN
                    location.payment_service_payer_override::TEXT
                WHEN 'paymentMethodsPolicy' THEN
                    location.payment_methods_policy_override::TEXT
                WHEN 'tipsEnabled' THEN
                    location.tips_enabled_override::TEXT
                WHEN 'validationEnabled' THEN
                    location.validation_enabled_override::TEXT
                WHEN 'releaseRequiresPayment' THEN
                    location.release_requires_payment_override::TEXT
                ELSE NULL
            END AS override_expression,
            CASE setting_key
                WHEN 'checkInPhotosRequired' THEN
                    organization.check_in_photos_required::TEXT
                WHEN 'handoffStandardMethodPolicy' THEN
                    organization.handoff_standard_method_policy::TEXT
                WHEN 'trackingEnabled' THEN
                    organization.tracking_enabled::TEXT
                WHEN 'rawGpsRetentionDays' THEN
                    organization.raw_gps_retention_days::TEXT
                WHEN 'valetServiceFee' THEN
                    organization.valet_service_fee::TEXT
                WHEN 'paymentServicePayer' THEN
                    organization.payment_service_payer::TEXT
                WHEN 'paymentMethodsPolicy' THEN
                    organization.payment_methods_policy::TEXT
                WHEN 'tipsEnabled' THEN
                    organization.tips_enabled::TEXT
                WHEN 'validationEnabled' THEN
                    organization.validation_enabled::TEXT
                WHEN 'releaseRequiresPayment' THEN
                    organization.release_requires_payment::TEXT
                ELSE NULL
            END AS default_expression
    ) AS setting
    WHERE location.id = target_location_id
      AND setting_key IN (
          'checkInPhotosRequired', 'handoffStandardMethodPolicy',
          'trackingEnabled', 'rawGpsRetentionDays', 'valetServiceFee',
          'paymentServicePayer', 'paymentMethodsPolicy', 'tipsEnabled',
          'validationEnabled', 'releaseRequiresPayment'
      )
$$;

CREATE FUNCTION "location_configuration_minor_unit_exponent"(
    "currency_code" TEXT
)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT CASE currency_code
        WHEN 'AED' THEN 2
        WHEN 'AFN' THEN 2
        WHEN 'ALL' THEN 2
        WHEN 'AMD' THEN 2
        WHEN 'AOA' THEN 2
        WHEN 'ARS' THEN 2
        WHEN 'AUD' THEN 2
        WHEN 'AWG' THEN 2
        WHEN 'AZN' THEN 2
        WHEN 'BAM' THEN 2
        WHEN 'BBD' THEN 2
        WHEN 'BDT' THEN 2
        WHEN 'BHD' THEN 3
        WHEN 'BIF' THEN 0
        WHEN 'BMD' THEN 2
        WHEN 'BND' THEN 2
        WHEN 'BOB' THEN 2
        WHEN 'BOV' THEN 2
        WHEN 'BRL' THEN 2
        WHEN 'BSD' THEN 2
        WHEN 'BTN' THEN 2
        WHEN 'BWP' THEN 2
        WHEN 'BYN' THEN 2
        WHEN 'BZD' THEN 2
        WHEN 'CAD' THEN 2
        WHEN 'CDF' THEN 2
        WHEN 'CHE' THEN 2
        WHEN 'CHF' THEN 2
        WHEN 'CHW' THEN 2
        WHEN 'CLF' THEN 4
        WHEN 'CLP' THEN 0
        WHEN 'CNY' THEN 2
        WHEN 'COP' THEN 2
        WHEN 'COU' THEN 2
        WHEN 'CRC' THEN 2
        WHEN 'CUP' THEN 2
        WHEN 'CVE' THEN 2
        WHEN 'CZK' THEN 2
        WHEN 'DJF' THEN 0
        WHEN 'DKK' THEN 2
        WHEN 'DOP' THEN 2
        WHEN 'DZD' THEN 2
        WHEN 'EGP' THEN 2
        WHEN 'ERN' THEN 2
        WHEN 'ETB' THEN 2
        WHEN 'EUR' THEN 2
        WHEN 'FJD' THEN 2
        WHEN 'FKP' THEN 2
        WHEN 'GBP' THEN 2
        WHEN 'GEL' THEN 2
        WHEN 'GHS' THEN 2
        WHEN 'GIP' THEN 2
        WHEN 'GMD' THEN 2
        WHEN 'GNF' THEN 0
        WHEN 'GTQ' THEN 2
        WHEN 'GYD' THEN 2
        WHEN 'HKD' THEN 2
        WHEN 'HNL' THEN 2
        WHEN 'HTG' THEN 2
        WHEN 'HUF' THEN 2
        WHEN 'IDR' THEN 2
        WHEN 'ILS' THEN 2
        WHEN 'INR' THEN 2
        WHEN 'IQD' THEN 3
        WHEN 'IRR' THEN 2
        WHEN 'ISK' THEN 0
        WHEN 'JMD' THEN 2
        WHEN 'JOD' THEN 3
        WHEN 'JPY' THEN 0
        WHEN 'KES' THEN 2
        WHEN 'KGS' THEN 2
        WHEN 'KHR' THEN 2
        WHEN 'KMF' THEN 0
        WHEN 'KPW' THEN 2
        WHEN 'KRW' THEN 0
        WHEN 'KWD' THEN 3
        WHEN 'KYD' THEN 2
        WHEN 'KZT' THEN 2
        WHEN 'LAK' THEN 2
        WHEN 'LBP' THEN 2
        WHEN 'LKR' THEN 2
        WHEN 'LRD' THEN 2
        WHEN 'LSL' THEN 2
        WHEN 'LYD' THEN 3
        WHEN 'MAD' THEN 2
        WHEN 'MDL' THEN 2
        WHEN 'MGA' THEN 2
        WHEN 'MKD' THEN 2
        WHEN 'MMK' THEN 2
        WHEN 'MNT' THEN 2
        WHEN 'MOP' THEN 2
        WHEN 'MRU' THEN 2
        WHEN 'MUR' THEN 2
        WHEN 'MVR' THEN 2
        WHEN 'MWK' THEN 2
        WHEN 'MXN' THEN 2
        WHEN 'MXV' THEN 2
        WHEN 'MYR' THEN 2
        WHEN 'MZN' THEN 2
        WHEN 'NAD' THEN 2
        WHEN 'NGN' THEN 2
        WHEN 'NIO' THEN 2
        WHEN 'NOK' THEN 2
        WHEN 'NPR' THEN 2
        WHEN 'NZD' THEN 2
        WHEN 'OMR' THEN 3
        WHEN 'PAB' THEN 2
        WHEN 'PEN' THEN 2
        WHEN 'PGK' THEN 2
        WHEN 'PHP' THEN 2
        WHEN 'PKR' THEN 2
        WHEN 'PLN' THEN 2
        WHEN 'PYG' THEN 0
        WHEN 'QAR' THEN 2
        WHEN 'RON' THEN 2
        WHEN 'RSD' THEN 2
        WHEN 'RUB' THEN 2
        WHEN 'RWF' THEN 0
        WHEN 'SAR' THEN 2
        WHEN 'SBD' THEN 2
        WHEN 'SCR' THEN 2
        WHEN 'SDG' THEN 2
        WHEN 'SEK' THEN 2
        WHEN 'SGD' THEN 2
        WHEN 'SHP' THEN 2
        WHEN 'SLE' THEN 2
        WHEN 'SOS' THEN 2
        WHEN 'SRD' THEN 2
        WHEN 'SSP' THEN 2
        WHEN 'STN' THEN 2
        WHEN 'SVC' THEN 2
        WHEN 'SYP' THEN 2
        WHEN 'SZL' THEN 2
        WHEN 'THB' THEN 2
        WHEN 'TJS' THEN 2
        WHEN 'TMT' THEN 2
        WHEN 'TND' THEN 3
        WHEN 'TOP' THEN 2
        WHEN 'TRY' THEN 2
        WHEN 'TTD' THEN 2
        WHEN 'TWD' THEN 2
        WHEN 'TZS' THEN 2
        WHEN 'UAH' THEN 2
        WHEN 'UGX' THEN 0
        WHEN 'USD' THEN 2
        WHEN 'USN' THEN 2
        WHEN 'UYI' THEN 0
        WHEN 'UYU' THEN 2
        WHEN 'UYW' THEN 4
        WHEN 'UZS' THEN 2
        WHEN 'VED' THEN 2
        WHEN 'VES' THEN 2
        WHEN 'VND' THEN 0
        WHEN 'VUV' THEN 0
        WHEN 'WST' THEN 2
        WHEN 'XAD' THEN 2
        WHEN 'XAF' THEN 0
        WHEN 'XCD' THEN 2
        WHEN 'XCG' THEN 2
        WHEN 'XOF' THEN 0
        WHEN 'XPF' THEN 0
        WHEN 'YER' THEN 2
        WHEN 'ZAR' THEN 2
        WHEN 'ZMW' THEN 2
        WHEN 'ZWG' THEN 2
        ELSE NULL
    END
$$;

CREATE FUNCTION "location_configuration_append_audit"(
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
        'LOCATION_CONFIGURATION_OVERRIDE_' || operation,
        'Location', location_id,
        jsonb_strip_nulls(jsonb_build_object(
            'scope', 'LOCATION_OVERRIDE',
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

CREATE FUNCTION "location_configuration_set_override"(
    "actor_membership_id" UUID,
    "target_location_id" UUID,
    "setting_key" TEXT,
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
    persisted_currency TEXT;
    minor_unit_exponent INTEGER;
    mutation_time TIMESTAMPTZ(3);
    old_state RECORD;
    new_state RECORD;
    v_boolean BOOLEAN;
    v_integer INTEGER;
    v_numeric NUMERIC(14, 3);
    v_handoff public.handoff_standard_method_policy;
    v_payer public.payment_service_payer;
    v_methods public.payment_methods_policy;
    new_override_text TEXT;
BEGIN
    authorized_organization_id :=
        public.location_configuration_authorized_organization(
            actor_membership_id, target_location_id
    );

    IF setting_key IN (
        'checkInPhotosRequired', 'trackingEnabled', 'tipsEnabled',
        'validationEnabled', 'releaseRequiresPayment'
    ) THEN
        IF setting_value NOT IN ('true', 'false') THEN
            RAISE EXCEPTION USING ERRCODE = '22023',
                MESSAGE = 'Invalid location configuration value.';
        END IF;
        v_boolean := setting_value::BOOLEAN;
        new_override_text := v_boolean::TEXT;
    ELSIF setting_key = 'rawGpsRetentionDays' THEN
        IF setting_value !~ '^[0-9]{1,10}$' THEN
            RAISE EXCEPTION USING ERRCODE = '22023',
                MESSAGE = 'Invalid location configuration value.';
        END IF;
        v_integer := setting_value::INTEGER;
        IF v_integer < 1 THEN
            RAISE EXCEPTION USING ERRCODE = '22023',
                MESSAGE = 'Invalid location configuration value.';
        END IF;
        new_override_text := v_integer::TEXT;
    ELSIF setting_key = 'valetServiceFee' THEN
        IF setting_value
           !~ '^(?:0|[1-9][0-9]{0,10})(?:\.[0-9]{1,3})?$' THEN
            RAISE EXCEPTION USING ERRCODE = '22023',
                MESSAGE = 'Invalid location configuration value.';
        END IF;
        v_numeric := setting_value::NUMERIC;
        IF v_numeric > 99999999999.999 THEN
            RAISE EXCEPTION USING ERRCODE = '22023',
                MESSAGE = 'Invalid location configuration value.';
        END IF;
        v_numeric := v_numeric::NUMERIC(14, 3);
        new_override_text := v_numeric::TEXT;
    ELSIF setting_key = 'handoffStandardMethodPolicy' THEN
        IF setting_value NOT IN ('PICKUP_CODE', 'DYNAMIC_QR', 'EITHER') THEN
            RAISE EXCEPTION USING ERRCODE = '22023',
                MESSAGE = 'Invalid location configuration value.';
        END IF;
        v_handoff := setting_value::public.handoff_standard_method_policy;
        new_override_text := v_handoff::TEXT;
    ELSIF setting_key = 'paymentServicePayer' THEN
        IF setting_value NOT IN ('CUSTOMER', 'VENUE') THEN
            RAISE EXCEPTION USING ERRCODE = '22023',
                MESSAGE = 'Invalid location configuration value.';
        END IF;
        v_payer := setting_value::public.payment_service_payer;
        new_override_text := v_payer::TEXT;
    ELSIF setting_key = 'paymentMethodsPolicy' THEN
        IF setting_value
           NOT IN ('CASH_ONLY', 'DIGITAL_ONLY', 'CASH_OR_DIGITAL') THEN
            RAISE EXCEPTION USING ERRCODE = '22023',
                MESSAGE = 'Invalid location configuration value.';
        END IF;
        v_methods := setting_value::public.payment_methods_policy;
        new_override_text := v_methods::TEXT;
    ELSE
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Invalid location configuration value.';
    END IF;

    SELECT location.updated_at, location.currency
    INTO persisted_updated_at, persisted_currency
    FROM public.locations AS location
    WHERE location.id = target_location_id
      AND location.organization_id = authorized_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501',
            MESSAGE = 'Location configuration is not available.';
    END IF;
    IF persisted_updated_at IS DISTINCT FROM expected_updated_at THEN
        RAISE EXCEPTION USING ERRCODE = '40001',
            MESSAGE = 'Location configuration conflict.';
    END IF;

    IF setting_key = 'valetServiceFee' THEN
        minor_unit_exponent :=
            public.location_configuration_minor_unit_exponent(
                persisted_currency
        );
        IF minor_unit_exponent IS NULL
           OR minor_unit_exponent NOT BETWEEN 0 AND 3 THEN
            RAISE EXCEPTION USING ERRCODE = '22023',
                MESSAGE = 'Invalid location configuration value.';
        END IF;
        IF ((v_numeric * 1000)::BIGINT
            % CASE (3 - minor_unit_exponent)
                  WHEN 0 THEN 1::BIGINT
                  WHEN 1 THEN 10::BIGINT
                  WHEN 2 THEN 100::BIGINT
                  ELSE 1000::BIGINT
              END) <> 0 THEN
            RAISE EXCEPTION USING ERRCODE = '22023',
                MESSAGE = 'Invalid location configuration value.';
        END IF;
    END IF;

    old_state :=
        public.location_configuration_setting_state(
            target_location_id, setting_key
    );

    mutation_time := GREATEST(
        clock_timestamp(),
        persisted_updated_at + INTERVAL '0.001 second'
    );

    UPDATE public.locations AS location
    SET check_in_photos_required_override =
            CASE WHEN setting_key = 'checkInPhotosRequired'
                 THEN v_boolean
                 ELSE location.check_in_photos_required_override END,
        handoff_standard_method_policy_override =
            CASE WHEN setting_key = 'handoffStandardMethodPolicy'
                 THEN v_handoff
                 ELSE location.handoff_standard_method_policy_override END,
        tracking_enabled_override =
            CASE WHEN setting_key = 'trackingEnabled'
                 THEN v_boolean
                 ELSE location.tracking_enabled_override END,
        raw_gps_retention_days_override =
            CASE WHEN setting_key = 'rawGpsRetentionDays'
                 THEN v_integer
                 ELSE location.raw_gps_retention_days_override END,
        valet_service_fee_override =
            CASE WHEN setting_key = 'valetServiceFee'
                 THEN v_numeric
                 ELSE location.valet_service_fee_override END,
        payment_service_payer_override =
            CASE WHEN setting_key = 'paymentServicePayer'
                 THEN v_payer
                 ELSE location.payment_service_payer_override END,
        payment_methods_policy_override =
            CASE WHEN setting_key = 'paymentMethodsPolicy'
                 THEN v_methods
                 ELSE location.payment_methods_policy_override END,
        tips_enabled_override =
            CASE WHEN setting_key = 'tipsEnabled'
                 THEN v_boolean
                 ELSE location.tips_enabled_override END,
        validation_enabled_override =
            CASE WHEN setting_key = 'validationEnabled'
                 THEN v_boolean
                 ELSE location.validation_enabled_override END,
        release_requires_payment_override =
            CASE WHEN setting_key = 'releaseRequiresPayment'
                 THEN v_boolean
                 ELSE location.release_requires_payment_override END,
        updated_at = mutation_time
    WHERE location.id = target_location_id
      AND location.organization_id = authorized_organization_id;

    new_state :=
        public.location_configuration_setting_state(
            target_location_id, setting_key
    );

    PERFORM public.location_configuration_append_audit(
        authorized_organization_id, target_location_id,
        actor_membership_id, 'SET', setting_key,
        old_state.override_present, old_state.override_value,
        old_state.effective_value,
        TRUE, new_override_text, new_state.effective_value
    );

    RETURN mutation_time;
END;
$$;

CREATE FUNCTION "location_configuration_clear_override"(
    "actor_membership_id" UUID,
    "target_location_id" UUID,
    "setting_key" TEXT,
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
    supported_key BOOLEAN;
BEGIN
    IF setting_key NOT IN (
        'checkInPhotosRequired', 'handoffStandardMethodPolicy',
        'trackingEnabled', 'rawGpsRetentionDays', 'valetServiceFee',
        'paymentServicePayer', 'paymentMethodsPolicy', 'tipsEnabled',
        'validationEnabled', 'releaseRequiresPayment'
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Invalid location configuration value.';
    END IF;

    authorized_organization_id :=
        public.location_configuration_authorized_organization(
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
            MESSAGE = 'Location configuration is not available.';
    END IF;
    IF persisted_updated_at IS DISTINCT FROM expected_updated_at THEN
        RAISE EXCEPTION USING ERRCODE = '40001',
            MESSAGE = 'Location configuration conflict.';
    END IF;

    old_state :=
        public.location_configuration_setting_state(
            target_location_id, setting_key
    );

    mutation_time := GREATEST(
        clock_timestamp(),
        persisted_updated_at + INTERVAL '0.001 second'
    );

    UPDATE public.locations AS location
    SET check_in_photos_required_override =
            CASE WHEN setting_key = 'checkInPhotosRequired'
                 THEN NULL
                 ELSE location.check_in_photos_required_override END,
        handoff_standard_method_policy_override =
            CASE WHEN setting_key = 'handoffStandardMethodPolicy'
                 THEN NULL
                 ELSE location.handoff_standard_method_policy_override END,
        tracking_enabled_override =
            CASE WHEN setting_key = 'trackingEnabled'
                 THEN NULL
                 ELSE location.tracking_enabled_override END,
        raw_gps_retention_days_override =
            CASE WHEN setting_key = 'rawGpsRetentionDays'
                 THEN NULL
                 ELSE location.raw_gps_retention_days_override END,
        valet_service_fee_override =
            CASE WHEN setting_key = 'valetServiceFee'
                 THEN NULL
                 ELSE location.valet_service_fee_override END,
        payment_service_payer_override =
            CASE WHEN setting_key = 'paymentServicePayer'
                 THEN NULL
                 ELSE location.payment_service_payer_override END,
        payment_methods_policy_override =
            CASE WHEN setting_key = 'paymentMethodsPolicy'
                 THEN NULL
                 ELSE location.payment_methods_policy_override END,
        tips_enabled_override =
            CASE WHEN setting_key = 'tipsEnabled'
                 THEN NULL
                 ELSE location.tips_enabled_override END,
        validation_enabled_override =
            CASE WHEN setting_key = 'validationEnabled'
                 THEN NULL
                 ELSE location.validation_enabled_override END,
        release_requires_payment_override =
            CASE WHEN setting_key = 'releaseRequiresPayment'
                 THEN NULL
                 ELSE location.release_requires_payment_override END,
        updated_at = mutation_time
    WHERE location.id = target_location_id
      AND location.organization_id = authorized_organization_id;

    new_state :=
        public.location_configuration_setting_state(
            target_location_id, setting_key
    );

    PERFORM public.location_configuration_append_audit(
        authorized_organization_id, target_location_id,
        actor_membership_id, 'CLEAR', setting_key,
        old_state.override_present, old_state.override_value,
        old_state.effective_value,
        FALSE, NULL, new_state.effective_value
    );

    RETURN mutation_time;
END;
$$;

REVOKE ALL ON FUNCTION public.location_configuration_authorized_organization(UUID, UUID)
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.location_configuration_setting_state(UUID, TEXT)
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.location_configuration_minor_unit_exponent(TEXT)
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.location_configuration_append_audit(
    UUID, UUID, UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT, BOOLEAN, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.location_configuration_set_override(
    UUID, UUID, TEXT, TEXT, TIMESTAMPTZ
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.location_configuration_clear_override(
    UUID, UUID, TEXT, TIMESTAMPTZ
) FROM PUBLIC;
