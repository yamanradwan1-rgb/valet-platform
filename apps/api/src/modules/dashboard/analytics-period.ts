import type { PostgresTransaction } from "../../common/database/postgres";
import { ApiTransportValidationError } from "../../common/http/api-errors";

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const millisecondsPerDay = 86_400_000;

function parseExactLocalDate(value: string): number | null {
  if (!localDatePattern.test(value)) return null;
  const parts = value.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }
  const utcMillis = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(utcMillis);
  return roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() === month - 1 &&
    roundTrip.getUTCDate() === day
    ? utcMillis
    : null;
}

export interface AnalyticsPeriod {
  readonly from: string;
  readonly to: string;
}

export function validateAnalyticsPeriod(
  from: string | undefined,
  to: string | undefined,
): AnalyticsPeriod {
  if (from === undefined || to === undefined) {
    throw new ApiTransportValidationError();
  }
  const fromMillis = parseExactLocalDate(from);
  const toMillis = parseExactLocalDate(to);
  if (
    fromMillis === null ||
    toMillis === null ||
    fromMillis > toMillis ||
    (toMillis - fromMillis) / millisecondsPerDay >= 31
  ) {
    throw new ApiTransportValidationError();
  }
  return { from, to };
}

export async function resolveAnalyticsTimezone(
  transaction: PostgresTransaction,
  scope: { readonly locationId: string; readonly organizationId: string },
): Promise<string> {
  const result = await transaction.query<{ timezone: string }>(
    `SELECT timezone FROM locations
     WHERE id = $1 AND organization_id = $2`,
    [scope.locationId, scope.organizationId],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new Error("Analytics location scope is missing.");
  }
  return row.timezone;
}

export interface AnalyticsPeriodBoundsSql {
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly timezoneIndex: number;
  readonly startExpression: string;
  readonly endExpression: string;
}

export function analyticsWindow(
  parameters: unknown[],
  period: AnalyticsPeriod,
  timezone: string,
): AnalyticsPeriodBoundsSql {
  parameters.push(period.from, period.to, timezone);
  const fromIndex = parameters.length - 2;
  const toIndex = parameters.length - 1;
  const timezoneIndex = parameters.length;
  return {
    fromIndex,
    timezoneIndex,
    toIndex,
    startExpression: `bounds.period_start`,
    endExpression: `bounds.period_end`,
  };
}

export function analyticsWindowCte(
  fromIndex: number,
  toIndex: number,
  timezoneIndex: number,
): string {
  return `CROSS JOIN (${analyticsWindowSelect(
    fromIndex,
    toIndex,
    timezoneIndex,
  )}) AS bounds`;
}

export function analyticsWindowSelect(
  fromIndex: number,
  toIndex: number,
  timezoneIndex: number,
): string {
  return `SELECT
              ($${fromIndex}::date)::timestamp AT TIME ZONE $${timezoneIndex}
                AS period_start,
              (($${toIndex}::date) + INTERVAL '1 day') AT TIME ZONE $${timezoneIndex}
                AS period_end`;
}
