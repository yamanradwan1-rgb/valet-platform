-- Issue #313: bounded, privacy-minimized Management Guest Rating analytics.
-- The ordinary runtime role retains NO table privileges on guest_ratings.
-- The only new authority is EXECUTE on this projection, provisioned separately.
BEGIN;

CREATE FUNCTION public.management_rating_analytics_projection(
  p_organization_id uuid,
  p_location_id uuid,
  p_from date,
  p_to date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_projection jsonb;
BEGIN
  -- Validate independently of HTTP: a direct runtime caller cannot use this
  -- function for an all-history scan or an arbitrarily long response window.
  IF p_organization_id IS NULL
     OR p_from IS NULL
     OR p_to IS NULL
     OR p_from > p_to
     OR p_to - p_from >= 31 THEN
    RAISE EXCEPTION 'Invalid rating analytics period.'
      USING ERRCODE = '22023';
  END IF;

  WITH location_bounds AS (
    SELECT location.id,
           location.name,
           location.timezone,
           (p_from::timestamp AT TIME ZONE location.timezone) AS period_start,
           ((p_to + 1)::timestamp AT TIME ZONE location.timezone) AS period_end
    FROM public.locations AS location
    WHERE location.organization_id = p_organization_id
      AND (p_location_id IS NULL OR location.id = p_location_id)
  ), completed_visits AS MATERIALIZED (
    SELECT session.id,
           session.completed_at,
           rating.rating,
           rating.rated_at,
           bounds.name AS location_name,
           bounds.timezone AS location_timezone
    FROM location_bounds AS bounds
    INNER JOIN public.valet_sessions AS session
      ON session.organization_id = p_organization_id
     AND session.location_id = bounds.id
     AND session.state = 'COMPLETED'
     AND session.completed_at >= bounds.period_start
     AND session.completed_at < bounds.period_end
    LEFT JOIN public.guest_ratings AS rating
      ON rating.organization_id = session.organization_id
     AND rating.location_id = session.location_id
     AND rating.valet_session_id = session.id
  ), totals AS (
    SELECT count(*)::integer AS eligible,
           count(rating)::integer AS rated,
           sum(rating)::numeric AS rating_total,
           count(*) FILTER (WHERE rating = 5)::integer AS five,
           count(*) FILTER (WHERE rating = 4)::integer AS four,
           count(*) FILTER (WHERE rating = 3)::integer AS three,
           count(*) FILTER (WHERE rating = 2)::integer AS two,
           count(*) FILTER (WHERE rating = 1)::integer AS one
    FROM completed_visits
  ), latest AS (
    SELECT id, rating, rated_at, completed_at,
           location_name, location_timezone
    FROM completed_visits
    WHERE rating IS NOT NULL
    ORDER BY rated_at DESC, completed_at DESC, id DESC
    LIMIT 4
  ), recent AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'visitReference',
            'VISIT-' || upper(substr(
              encode(sha256(convert_to(latest.id::text, 'UTF8')), 'hex'),
              1, 12
            )),
          'rating', latest.rating,
          'completedAt', to_char(
            latest.completed_at AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ),
          'ratedAt', to_char(
            latest.rated_at AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ),
          'authorizedLocationLabel', latest.location_name,
          'locationTimezone', latest.location_timezone
        )
        ORDER BY latest.rated_at DESC, latest.completed_at DESC, latest.id DESC
      ),
      '[]'::jsonb
    ) AS rows
    FROM latest
  )
  SELECT jsonb_build_object(
    'eligibleCompletedVisits', totals.eligible,
    'ratedVisits', totals.rated,
    'averageRating', CASE WHEN totals.rated = 0 THEN NULL
      ELSE (totals.rating_total / totals.rated::numeric)::numeric(20,4)::text
    END,
    'participationRate', CASE WHEN totals.eligible = 0 THEN NULL
      ELSE (totals.rated::numeric / totals.eligible::numeric)::numeric(20,6)::text
    END,
    'distribution', jsonb_build_object(
      'five', totals.five,
      'four', totals.four,
      'three', totals.three,
      'two', totals.two,
      'one', totals.one
    ),
    'recentRatings', recent.rows
  )
  INTO v_projection
  FROM totals CROSS JOIN recent;

  RETURN v_projection;
END;
$function$;

REVOKE ALL ON FUNCTION public.management_rating_analytics_projection(
  uuid, uuid, date, date
) FROM PUBLIC;
COMMIT;
