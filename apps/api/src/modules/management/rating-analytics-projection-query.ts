import { UnauthorizedException } from "@nestjs/common";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
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

function protectedReadUnavailable() {
  return Object.assign(new Error("Rating feedback is temporarily unavailable."), {
    code: "RATING_FEEDBACK_UNAVAILABLE",
  });
}

export function mapProtectedRatingFeedbackContention(error: unknown): unknown {
  const state = (error as { code?: unknown })?.code;
  return state === "55P03" || state === "40P01" || state === "57014"
    ? protectedReadUnavailable()
    : error;
}

export async function boundProtectedRatingFeedbackLockWait(
  transaction: PostgresTransaction,
): Promise<void> {
  try {
    // Apply before the existing authorization preflight on the opt-in path.
    await transaction.query(
      `SELECT set_config('lock_timeout',
         CASE WHEN current_setting('lock_timeout')::interval = interval '0'
           THEN '2000ms'
           ELSE (LEAST(
             EXTRACT(epoch FROM current_setting('lock_timeout')::interval) * 1000,
             2000
           )::bigint)::text || 'ms'
         END, true)`,
    );
  } catch {
    throw protectedReadUnavailable();
  }
}

/** The protected SQL function rechecks the bearer, membership and MFA itself. */
export async function queryProtectedRatingFeedbackProjection(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  membershipId: string,
  organizationId: string,
  locationId: string | null,
  period: AnalyticsPeriod,
): Promise<Record<string, unknown>> {
  if (typeof context.rawAccessToken !== "string" ||
      !Number.isFinite(context.createdAt.getTime())) {
    throw new UnauthorizedException();
  }
  let payload: unknown;
  try {
    const result = await transaction.query<{ readonly payload: unknown }>(
      `SELECT public.management_rating_feedback_projection(
         $1::uuid,$2::uuid,$3::text,$4::timestamptz,
         $5::uuid,$6::uuid,$7::uuid,$8::date,$9::date
       ) AS payload`,
      [
        context.staffAuthSessionId, context.userId, context.rawAccessToken,
        context.createdAt, membershipId, organizationId, locationId,
        period.from, period.to,
      ],
    );
    payload = result.rows[0]?.payload;
  } catch (error) {
    const state = (error as { code?: unknown }).code;
    if (state === "42501") {
      throw Object.assign(new Error("The requested resource is not available."), {
        code: "AUTHORIZATION_DENIED",
      });
    }
    throw protectedReadUnavailable();
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw protectedReadUnavailable();
  }
  return payload as Record<string, unknown>;
}
