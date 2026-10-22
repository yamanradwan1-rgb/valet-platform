import type { PostgresTransaction } from "../../common/database/postgres";
import type { AnalyticsPeriod } from "../dashboard/analytics-period";

/**
 * The database routine has a narrow EXECUTE grant and independently enforces
 * Organization/Location, completed-visit cohort and bounded read projection.
 * Callers must first prove their current Staff authority inside the same transaction.
 */
export async function queryRatingAnalyticsProjection(
  transaction: PostgresTransaction,
  organizationId: string,
  locationId: string | null,
  period: AnalyticsPeriod,
): Promise<Record<string, unknown>> {
  const result = await transaction.query<{ readonly payload: unknown }>(
    `SELECT public.management_rating_analytics_projection(
       $1::uuid, $2::uuid, $3::date, $4::date
     ) AS payload`,
    [organizationId, locationId, period.from, period.to],
  );
  const payload = result.rows[0]?.payload;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Rating analytics projection is missing.");
  }
  return payload as Record<string, unknown>;
}
