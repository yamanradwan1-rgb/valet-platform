export function companyLocationBoundsCte(): string {
  return `location_bounds AS (
    SELECT location.id AS location_id,
           location.status::text AS status,
           location.timezone,
           ($2::date)::timestamp AT TIME ZONE location.timezone AS period_start,
           (($3::date) + INTERVAL '1 day') AT TIME ZONE location.timezone AS period_end
    FROM locations AS location
    WHERE location.organization_id = $1
  )`;
}
