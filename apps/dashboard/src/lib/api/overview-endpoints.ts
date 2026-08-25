import { DashboardApiError } from "./api-error";
import type { StaffApiClient } from "./staff-api-client";

/**
 * Location-overview list endpoint plumbing shared by the D2 operations pages
 * (sessions, retrieval queue, tasks). The backend exposes cursor-paginated
 * lists under /v1/staff/dashboard/locations/:locationId/overview/<list> with a
 * `limit` (1..100) and an opaque `cursor` request parameter.
 *
 * Cursors are opaque server-issued strings: they are stored and echoed back
 * verbatim and never decoded or mutated in the frontend.
 *
 * Response validation consumes the shared @valet/contracts schema objects
 * (never duplicated here). They are typed through this structural parser so
 * the dashboard does not need a direct zod dependency of its own.
 */
export interface ContractParser<Item> {
  safeParse(
    value: unknown,
  ): { success: true; data: Item } | { success: false };
}

export const OVERVIEW_PAGE_LIMIT = 50;

export type OverviewListResponse<Item> = {
  readonly items: readonly Item[];
  readonly nextCursor: string | null;
};

export function overviewListPath(
  locationId: string,
  list: "sessions" | "retrieval-queue" | "tasks",
): string {
  return `/dashboard/locations/${locationId}/overview/${list}`;
}

export interface OverviewPageRequest {
  readonly cursor?: string | null | undefined;
  readonly limit?: number | undefined;
}

export function overviewPageQuery(request: OverviewPageRequest = {}): string {
  // The default page size is always sent explicitly so the requested limit is
  // visible in the URL contract instead of relying on the backend default.
  const params = new URLSearchParams();
  params.set("limit", String(normalizeLimit(request.limit)));
  if (typeof request.cursor === "string" && request.cursor.length > 0) {
    params.set("cursor", request.cursor);
  }
  return `?${params.toString()}`;
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return OVERVIEW_PAGE_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), 100);
}

/**
 * Fetches one page and validates it against the shared contract schema.
 * Contract drift surfaces as an honest server failure instead of silently
 * rendering unknown shapes.
 */
export async function fetchOverviewPage<Item>(
  client: StaffApiClient,
  path: string,
  parser: ContractParser<Item>,
  request: OverviewPageRequest & { signal?: AbortSignal | undefined } = {},
): Promise<Item> {
  const raw = await client.request<unknown>(
    `${path}${overviewPageQuery(request)}`,
    { signal: request.signal },
  );
  const parsed = parser.safeParse(raw);
  if (!parsed.success) {
    throw new DashboardApiError({
      kind: "server",
      status: 0,
      code: "RESPONSE_CONTRACT_INVALID",
      message: "The backend response did not match the expected contract.",
    });
  }
  return parsed.data;
}
