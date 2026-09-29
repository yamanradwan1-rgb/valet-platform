DROP FUNCTION public.map_setup_replace_area_vertices(
    UUID, UUID, UUID, NUMERIC[], NUMERIC[]
);

CREATE FUNCTION public.map_setup_replace_area_vertices(
    actor_membership_id UUID,
    target_location_id UUID,
    area_id UUID,
    vertex_latitudes NUMERIC[],
    vertex_longitudes NUMERIC[],
    expected_updated_at TIMESTAMPTZ
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
    persisted_updated_at TIMESTAMPTZ(3);
    mutation_time TIMESTAMPTZ(3);
BEGIN
    authorized_organization_id := public.map_setup_authorized_organization(
        actor_membership_id, target_location_id
    );
    SELECT purpose, active, parking_zone_id IS NOT NULL, updated_at
    INTO area_purpose, area_active, parking_zone_linked, persisted_updated_at
    FROM public.location_map_areas AS area
    WHERE area.id = area_id
      AND area.organization_id = authorized_organization_id
      AND area.location_id = target_location_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501', MESSAGE = 'Map setup resource is not available.';
    END IF;
    IF persisted_updated_at IS DISTINCT FROM expected_updated_at THEN
        RAISE EXCEPTION USING
            ERRCODE = '40001',
            MESSAGE = 'Map setup configuration conflict.';
    END IF;
    IF COALESCE(array_length(vertex_latitudes, 1), 0) NOT BETWEEN 3 AND 500
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

    mutation_time := GREATEST(
        clock_timestamp(), persisted_updated_at + INTERVAL '0.001 second'
    );
    DELETE FROM public.location_map_area_vertices AS vertex
    WHERE vertex.organization_id = authorized_organization_id
      AND vertex.location_id = target_location_id
      AND vertex.map_area_id = area_id;
    INSERT INTO public.location_map_area_vertices (
        id, organization_id, location_id, map_area_id, position,
        latitude, longitude, created_at
    )
    SELECT gen_random_uuid(), authorized_organization_id, target_location_id,
           area_id, vertex.ordinality - 1, vertex.latitude, vertex.longitude,
           mutation_time
    FROM unnest(vertex_latitudes, vertex_longitudes) WITH ORDINALITY
      AS vertex(latitude, longitude, ordinality);
    UPDATE public.location_map_areas AS area
    SET updated_at = mutation_time
    WHERE area.id = area_id
      AND area.organization_id = authorized_organization_id
      AND area.location_id = target_location_id;
    PERFORM public.map_setup_append_audit(
        authorized_organization_id, target_location_id, actor_membership_id,
        'AREA_VERTICES_REPLACED', 'LocationMapArea', area_id,
        area_purpose::TEXT, area_active, parking_zone_linked
    );
END;
$$;

REVOKE ALL ON FUNCTION public.map_setup_replace_area_vertices(
    UUID, UUID, UUID, NUMERIC[], NUMERIC[], TIMESTAMPTZ
) FROM PUBLIC;
