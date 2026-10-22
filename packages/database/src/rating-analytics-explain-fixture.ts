import type { Pool } from "pg";

interface ExplainPlan {
  readonly "Execution Time": number;
  readonly Plan: {
    readonly "Actual Rows": number;
    readonly "Shared Hit Blocks": number;
    readonly "Shared Read Blocks": number;
  };
}

export async function explainDenseRatingProjection(
  owner: Pool,
  organizationId: string,
  locationId: string,
) {
  const client = await owner.connect();
  try {
    await client.query("BEGIN");
    const source = await client.query<{
      vehicle_id: string;
      checked_in_by_membership_id: string;
    }>(
      `SELECT vehicle_id, checked_in_by_membership_id
       FROM valet_sessions WHERE organization_id=$1 AND location_id=$2 LIMIT 1`,
      [organizationId, locationId],
    );
    const seed = source.rows[0];
    if (!seed) throw new Error("Missing disposable cohort fixture.");
    await client.query(
      `WITH inserted AS (
         INSERT INTO valet_sessions (
           id, customer_access_token_hash, customer_access_expires_at,
           organization_id, location_id, vehicle_id, state,
           checked_in_by_membership_id, completed_at, updated_at
         )
         SELECT gen_random_uuid(),
                'sha256:v1:' || encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),
                clock_timestamp()+interval '1 day',
                $1::uuid, $2::uuid, $3::uuid, 'COMPLETED',
                $4::uuid, '2026-10-20T09:00:00Z'::timestamptz, clock_timestamp()
         FROM generate_series(1,1000)
         RETURNING id
       ), numbered AS (
         SELECT id, row_number() OVER (ORDER BY id) AS number FROM inserted
       )
       INSERT INTO guest_ratings (
         organization_id, location_id, valet_session_id, rating, rated_at
       )
       SELECT $1::uuid, $2::uuid, id, 1 + (number % 5)::integer,
              '2026-10-21T00:00:00Z'::timestamptz
       FROM numbered WHERE number <= 750`,
      [organizationId, locationId, seed.vehicle_id, seed.checked_in_by_membership_id],
    );
    const explain = async (from: string, to: string) => {
      const result = await client.query<{ "QUERY PLAN": ExplainPlan[] }>(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
         SELECT public.management_rating_analytics_projection(
           $1::uuid, $2::uuid, $3::date, $4::date
         )`,
        [organizationId, locationId, from, to],
      );
      return result.rows[0]!["QUERY PLAN"][0]!;
    };
    const sparse = await explain("2026-10-19", "2026-10-19");
    const dense = await explain("2026-10-20", "2026-10-20");
    const total = await client.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM valet_sessions
       WHERE organization_id=$1 AND location_id=$2
         AND state='COMPLETED'
         AND completed_at >= '2026-10-20T00:00:00Z'::timestamptz
         AND completed_at < '2026-10-21T00:00:00Z'::timestamptz`,
      [organizationId, locationId],
    );
    console.info("Issue313 SQL EXPLAIN (ANALYZE, BUFFERS)", {
      sparseMilliseconds: sparse["Execution Time"],
      sparseSharedHits: sparse.Plan["Shared Hit Blocks"],
      sparseSharedReads: sparse.Plan["Shared Read Blocks"],
      denseMilliseconds: dense["Execution Time"],
      denseSharedHits: dense.Plan["Shared Hit Blocks"],
      denseSharedReads: dense.Plan["Shared Read Blocks"],
      denseCompletedVisits: total.rows[0]?.count,
    });
    return { sparse, dense, denseCompletedVisits: total.rows[0]?.count ?? 0 };
  } finally {
    await client.query("ROLLBACK").finally(() => client.release());
  }
}
