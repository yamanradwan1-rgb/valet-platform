import type { RouteHistoryResponse } from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { authorizeRouteHistory } from "./route-history-authorization";
import {
  decodeRouteHistoryCursor,
  encodeRouteHistoryCursor,
} from "./route-history-cursor";

class RouteHistoryUnavailableError extends Error {
  readonly code = "AUTHORIZATION_DENIED";
}

interface RouteRow {
  readonly captured_at: Date;
  readonly id: string;
  readonly latitude: string;
  readonly longitude: string;
}

export function createRouteHistoryQuery(pool: PostgresPool) {
  return (input: {
    readonly authenticatedUserId: string;
    readonly cursor?: string;
    readonly limit: number;
    readonly trackingSessionId: string;
  }): Promise<RouteHistoryResponse> =>
    inPostgresTransaction(pool, async (transaction) => {
      const cursor = decodeRouteHistoryCursor(input.cursor);
      const authorization = await authorizeRouteHistory(
        transaction,
        input.authenticatedUserId,
        input.trackingSessionId,
      );
      if (authorization === null) throw new RouteHistoryUnavailableError();
      const result = await transaction.query<RouteRow>(
        `SELECT id::text, latitude::text, longitude::text, captured_at
         FROM raw_gps_samples
         WHERE organization_id = $1 AND location_id = $2
           AND tracking_session_id = $3
           AND ($4::timestamptz IS NULL
                OR (captured_at, id) > ($4::timestamptz, $5::uuid))
         ORDER BY captured_at, id LIMIT $6`,
        [
          authorization.organizationId,
          authorization.locationId,
          authorization.trackingSessionId,
          cursor?.capturedAt ?? null,
          cursor?.id ?? null,
          input.limit + 1,
        ],
      );
      const hasNext = result.rows.length > input.limit;
      const rows = result.rows.slice(0, input.limit);
      const last = rows.at(-1);
      return {
        nextCursor:
          hasNext && last !== undefined
            ? encodeRouteHistoryCursor({ capturedAt: last.captured_at, id: last.id })
            : null,
        samples: rows.map((row) => ({
          capturedAt: row.captured_at.toISOString(),
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
        })),
      };
    });
}
