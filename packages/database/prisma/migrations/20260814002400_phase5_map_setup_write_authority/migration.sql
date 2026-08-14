CREATE FUNCTION "map_setup_authorized_organization"(
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
            MESSAGE = 'Map setup resource is not available.';
    END IF;
    RETURN authorized_organization_id;
END;
$$;

CREATE FUNCTION "map_setup_append_audit"(
    "organization_id" UUID,
    "location_id" UUID,
    "actor_membership_id" UUID,
    "operation" TEXT,
    "resource_type" TEXT,
    "resource_id" UUID,
    "configuration_type" TEXT,
    "active" BOOLEAN,
    "parking_zone_linked" BOOLEAN
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
        actor_membership_id, 'MAP_SETUP_' || operation,
        resource_type, resource_id,
        jsonb_strip_nulls(jsonb_build_object(
            'operation', operation,
            'resourceType', resource_type,
            'resourceId', resource_id::TEXT,
            'configurationType', configuration_type,
            'active', active,
            'parkingZoneLinked', parking_zone_linked
        )),
        clock_timestamp()
    );
END;
$$;

CREATE FUNCTION "map_setup_validate_labels"(
    "resource_code" TEXT,
    "resource_label" TEXT,
    "resource_level_label" TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF resource_code IS NULL
       OR resource_code IS DISTINCT FROM btrim(resource_code)
       OR char_length(resource_code) NOT BETWEEN 1 AND 64
       OR resource_label IS NULL
       OR resource_label IS DISTINCT FROM btrim(resource_label)
       OR char_length(resource_label) NOT BETWEEN 1 AND 160
       OR (
           resource_level_label IS NOT NULL
           AND (
               resource_level_label IS DISTINCT FROM btrim(resource_level_label)
               OR char_length(resource_level_label) NOT BETWEEN 1 AND 64
           )
       ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023', MESSAGE = 'Invalid map setup configuration.';
    END IF;
END;
$$;

CREATE FUNCTION "map_setup_create_point"(
    "actor_membership_id" UUID,
    "target_location_id" UUID,
    "point_id" UUID,
    "point_kind" public.location_map_point_kind,
    "point_code" TEXT,
    "point_label" TEXT,
    "point_latitude" NUMERIC,
    "point_longitude" NUMERIC,
    "point_level_label" TEXT,
    "point_active" BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    authorized_organization_id UUID;
BEGIN
    authorized_organization_id := public.map_setup_authorized_organization(
        actor_membership_id, target_location_id
    );
    PERFORM public.map_setup_validate_labels(
        point_code, point_label, point_level_label
    );
    INSERT INTO public.location_map_points (
        id, organization_id, location_id, kind, code, label,
        latitude, longitude, level_label, active, updated_at
    ) VALUES (
        point_id, authorized_organization_id, target_location_id, point_kind,
        point_code, point_label, point_latitude, point_longitude,
        point_level_label, point_active, clock_timestamp()
    );
    PERFORM public.map_setup_append_audit(
        authorized_organization_id, target_location_id, actor_membership_id,
        'POINT_CREATED', 'LocationMapPoint', point_id, point_kind::TEXT,
        point_active, NULL
    );
END;
$$;

CREATE FUNCTION "map_setup_update_point"(
    "actor_membership_id" UUID,
    "target_location_id" UUID,
    "point_id" UUID,
    "point_kind" public.location_map_point_kind,
    "point_code" TEXT,
    "point_label" TEXT,
    "point_latitude" NUMERIC,
    "point_longitude" NUMERIC,
    "point_level_label" TEXT,
    "point_active" BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    authorized_organization_id UUID;
BEGIN
    authorized_organization_id := public.map_setup_authorized_organization(
        actor_membership_id, target_location_id
    );
    PERFORM public.map_setup_validate_labels(
        point_code, point_label, point_level_label
    );
    UPDATE public.location_map_points AS point
    SET kind = point_kind,
        code = point_code,
        label = point_label,
        latitude = point_latitude,
        longitude = point_longitude,
        level_label = point_level_label,
        active = point_active,
        updated_at = clock_timestamp()
    WHERE point.id = point_id
      AND point.organization_id = authorized_organization_id
      AND point.location_id = target_location_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Map setup resource is not available.';
    END IF;
    PERFORM public.map_setup_append_audit(
        authorized_organization_id, target_location_id, actor_membership_id,
        'POINT_UPDATED', 'LocationMapPoint', point_id, point_kind::TEXT,
        point_active, NULL
    );
END;
$$;

CREATE FUNCTION "map_setup_create_area"(
    "actor_membership_id" UUID,
    "target_location_id" UUID,
    "area_id" UUID,
    "area_purpose" public.location_map_area_purpose,
    "area_code" TEXT,
    "area_label" TEXT,
    "area_level_label" TEXT,
    "area_active" BOOLEAN,
    "area_parking_zone_id" UUID,
    "vertex_latitudes" NUMERIC[],
    "vertex_longitudes" NUMERIC[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    authorized_organization_id UUID;
    mutation_time TIMESTAMPTZ(3) := clock_timestamp();
BEGIN
    authorized_organization_id := public.map_setup_authorized_organization(
        actor_membership_id, target_location_id
    );
    PERFORM public.map_setup_validate_labels(
        area_code, area_label, area_level_label
    );
    IF COALESCE(array_length(vertex_latitudes, 1), 0) < 3
       OR array_length(vertex_latitudes, 1)
          IS DISTINCT FROM array_length(vertex_longitudes, 1) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid polygon.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM unnest(vertex_latitudes, vertex_longitudes)
          AS vertex(latitude, longitude)
        WHERE latitude IS NULL OR longitude IS NULL
           OR latitude NOT BETWEEN -90 AND 90
           OR longitude NOT BETWEEN -180 AND 180
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid polygon.';
    END IF;
    IF area_parking_zone_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.parking_zones
        WHERE id = area_parking_zone_id
          AND organization_id = authorized_organization_id
          AND location_id = target_location_id
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501', MESSAGE = 'Map setup resource is not available.';
    END IF;

    INSERT INTO public.location_map_areas (
        id, organization_id, location_id, parking_zone_id, purpose,
        code, label, level_label, active, updated_at
    ) VALUES (
        area_id, authorized_organization_id, target_location_id, area_parking_zone_id,
        area_purpose, area_code, area_label, area_level_label, area_active,
        mutation_time
    );
    INSERT INTO public.location_map_area_vertices (
        id, organization_id, location_id, map_area_id, position,
        latitude, longitude, created_at
    )
    SELECT gen_random_uuid(), authorized_organization_id, target_location_id, area_id,
           vertex.ordinality - 1, vertex.latitude, vertex.longitude,
           mutation_time
    FROM unnest(vertex_latitudes, vertex_longitudes) WITH ORDINALITY
      AS vertex(latitude, longitude, ordinality);
    PERFORM public.map_setup_append_audit(
        authorized_organization_id, target_location_id, actor_membership_id,
        'AREA_CREATED', 'LocationMapArea', area_id, area_purpose::TEXT,
        area_active, area_parking_zone_id IS NOT NULL
    );
END;
$$;

CREATE FUNCTION "map_setup_update_area"(
    "actor_membership_id" UUID,
    "target_location_id" UUID,
    "area_id" UUID,
    "area_purpose" public.location_map_area_purpose,
    "area_code" TEXT,
    "area_label" TEXT,
    "area_level_label" TEXT,
    "area_active" BOOLEAN,
    "area_parking_zone_id" UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    authorized_organization_id UUID;
BEGIN
    authorized_organization_id := public.map_setup_authorized_organization(
        actor_membership_id, target_location_id
    );
    PERFORM public.map_setup_validate_labels(
        area_code, area_label, area_level_label
    );
    PERFORM 1 FROM public.location_map_areas AS area
    WHERE area.id = area_id
      AND area.organization_id = authorized_organization_id
      AND area.location_id = target_location_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501', MESSAGE = 'Map setup resource is not available.';
    END IF;
    IF area_parking_zone_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.parking_zones
        WHERE id = area_parking_zone_id
          AND organization_id = authorized_organization_id
          AND location_id = target_location_id
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501', MESSAGE = 'Map setup resource is not available.';
    END IF;
    UPDATE public.location_map_areas AS area
    SET parking_zone_id = area_parking_zone_id,
        purpose = area_purpose,
        code = area_code,
        label = area_label,
        level_label = area_level_label,
        active = area_active,
        updated_at = clock_timestamp()
    WHERE area.id = area_id;
    PERFORM public.map_setup_append_audit(
        authorized_organization_id, target_location_id, actor_membership_id,
        'AREA_UPDATED', 'LocationMapArea', area_id, area_purpose::TEXT,
        area_active, area_parking_zone_id IS NOT NULL
    );
END;
$$;

CREATE FUNCTION "map_setup_replace_area_vertices"(
    "actor_membership_id" UUID,
    "target_location_id" UUID,
    "area_id" UUID,
    "vertex_latitudes" NUMERIC[],
    "vertex_longitudes" NUMERIC[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    authorized_organization_id UUID;
    area_purpose public.location_map_area_purpose;
    area_active BOOLEAN;
    parking_zone_linked BOOLEAN;
    mutation_time TIMESTAMPTZ(3) := clock_timestamp();
BEGIN
    authorized_organization_id := public.map_setup_authorized_organization(
        actor_membership_id, target_location_id
    );
    SELECT purpose, active, parking_zone_id IS NOT NULL
    INTO area_purpose, area_active, parking_zone_linked
    FROM public.location_map_areas AS area
    WHERE area.id = area_id
      AND area.organization_id = authorized_organization_id
      AND area.location_id = target_location_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501', MESSAGE = 'Map setup resource is not available.';
    END IF;
    IF COALESCE(array_length(vertex_latitudes, 1), 0) < 3
       OR array_length(vertex_latitudes, 1)
          IS DISTINCT FROM array_length(vertex_longitudes, 1) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid polygon.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM unnest(vertex_latitudes, vertex_longitudes)
          AS vertex(latitude, longitude)
        WHERE latitude IS NULL OR longitude IS NULL
           OR latitude NOT BETWEEN -90 AND 90
           OR longitude NOT BETWEEN -180 AND 180
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid polygon.';
    END IF;

    DELETE FROM public.location_map_area_vertices AS vertex
    WHERE vertex.organization_id = authorized_organization_id
      AND vertex.location_id = target_location_id
      AND vertex.map_area_id = area_id;
    INSERT INTO public.location_map_area_vertices (
        id, organization_id, location_id, map_area_id, position,
        latitude, longitude, created_at
    )
    SELECT gen_random_uuid(), authorized_organization_id, target_location_id, area_id,
           vertex.ordinality - 1, vertex.latitude, vertex.longitude,
           mutation_time
    FROM unnest(vertex_latitudes, vertex_longitudes) WITH ORDINALITY
      AS vertex(latitude, longitude, ordinality);
    UPDATE public.location_map_areas AS area
    SET updated_at = mutation_time
    WHERE area.id = area_id;
    PERFORM public.map_setup_append_audit(
        authorized_organization_id, target_location_id, actor_membership_id,
        'AREA_VERTICES_REPLACED', 'LocationMapArea', area_id,
        area_purpose::TEXT, area_active, parking_zone_linked
    );
END;
$$;

REVOKE ALL ON FUNCTION public.map_setup_authorized_organization(UUID, UUID)
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.map_setup_append_audit(
    UUID, UUID, UUID, TEXT, TEXT, UUID, TEXT, BOOLEAN, BOOLEAN
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.map_setup_validate_labels(TEXT, TEXT, TEXT)
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.map_setup_create_point(
    UUID, UUID, UUID, public.location_map_point_kind,
    TEXT, TEXT, NUMERIC, NUMERIC, TEXT, BOOLEAN
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.map_setup_update_point(
    UUID, UUID, UUID, public.location_map_point_kind,
    TEXT, TEXT, NUMERIC, NUMERIC, TEXT, BOOLEAN
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.map_setup_create_area(
    UUID, UUID, UUID, public.location_map_area_purpose,
    TEXT, TEXT, TEXT, BOOLEAN, UUID, NUMERIC[], NUMERIC[]
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.map_setup_update_area(
    UUID, UUID, UUID, public.location_map_area_purpose,
    TEXT, TEXT, TEXT, BOOLEAN, UUID
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.map_setup_replace_area_vertices(
    UUID, UUID, UUID, NUMERIC[], NUMERIC[]
) FROM PUBLIC;
