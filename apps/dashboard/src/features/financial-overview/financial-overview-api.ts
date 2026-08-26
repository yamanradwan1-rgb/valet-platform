import {
  financialOverviewResponseSchema,
  type FinancialOverviewResponse,
} from "@valet/contracts";

import { DashboardApiError } from "../../lib/api/api-error";
import type { StaffApiClient } from "../../lib/api/staff-api-client";

/**
 * Financial Overview transport (D4-001).
 *
 * GET /v1/staff/dashboard/locations/:locationId/overview/financial
 * -> financialOverviewResponseSchema
 *    { currencies: [{ currency, paymentCount, amountDueTotal,
 *        amountPaidTotal, tipAmountTotal, succeededRefundAmountTotal,
 *        currentValidationAmountTotal, collectionMethodCounts[],
 *        statusCounts[] }] } (strict; no query parameters)
 *
 * Re-verified against apps/api overview.controller.ts before implementation.
 * The path is client-relative: the shared StaffApiClient base URL supplies
 * the `/v1/staff` prefix (same convention as lib/api/overview-endpoints.ts
 * and live-operations).
 *
 * MONEY PRECISION: backend money fields are exact decimal STRINGS. They are
 * validated with the shared contract schema and passed through untouched —
 * never converted to floats, never summed across currencies, never merged
 * into a grand total. Contract drift surfaces as an honest recoverable
 * DashboardApiError instead of unknown shapes reaching UI.
 */

/** Minimal structural surface of the shared authenticated transport. */
export type FinancialOverviewClient = Pick<StaffApiClient, "request">;

export function financialOverviewPath(locationId: string): string {
  return `/dashboard/locations/${encodeURIComponent(locationId)}/overview/financial`;
}

/**
 * Minimal structural view of a shared @valet/contracts Zod schema so this
 * module can validate payloads without depending on zod directly (zod is a
 * dependency of @valet/contracts, not of the dashboard app).
 */
interface ContractSchema<TData> {
  safeParse(
    value: unknown,
  ):
    | { success: true; data: TData }
    | { success: false; error: unknown };
}

function parseFinancialPayload<TData>(
  schema: ContractSchema<TData>,
  payload: unknown,
  diagnosticCode: string,
): TData {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new DashboardApiError({
      kind: "server",
      status: 0,
      code: diagnosticCode,
      message:
        "The financial response did not match the shared contract.",
    });
  }
  return result.data;
}

export async function fetchLocationFinancialOverview(
  client: FinancialOverviewClient,
  locationId: string,
  signal?: AbortSignal,
): Promise<FinancialOverviewResponse> {
  const payload = await client.request<unknown>(
    financialOverviewPath(locationId),
    { signal },
  );
  return parseFinancialPayload(
    financialOverviewResponseSchema,
    payload,
    "FINANCIAL_OVERVIEW_RESPONSE_INVALID",
  );
}
