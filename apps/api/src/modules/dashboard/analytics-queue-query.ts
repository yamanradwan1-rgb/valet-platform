import type { QueueSnapshotResponse } from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { authorizeDashboardReadLocation } from "./dashboard-read-authorization";
import { assertAuthorized } from "./dashboard-overview-error";

interface QueueRow {
  readonly depth: number;
  readonly oldestAgeSeconds: string | null;
}

export async function queueSnapshot(
  pool: PostgresPool,
  input: {
    authenticatedUserId: string;
    recordManagementActivity?: boolean;
    locationId: string;
    staffSessionContext?: StaffSessionContext;
  },
): Promise<QueueSnapshotResponse> {
  return inPostgresTransaction(pool, async (transaction) => {
    const scope = await authorizeDashboardReadLocation(transaction, {
      authenticatedUserId: input.authenticatedUserId,
      capability: "ANALYTICS_READ",
      recordActivity: input.recordManagementActivity !== false,
      ...(input.staffSessionContext === undefined
        ? {}
        : { staffSessionContext: input.staffSessionContext }),
      targetLocationId: input.locationId,
    });
    assertAuthorized(scope);
    const rows = await transaction.query<QueueRow>(
      `SELECT count(*)::int AS depth,
              COALESCE(
                EXTRACT(EPOCH FROM (
                  clock_timestamp() - MIN(request.requested_at)
                ))::numeric(20,3)::text,
                NULL
              ) AS "oldestAgeSeconds"
       FROM retrieval_requests AS request
       INNER JOIN valet_sessions AS session
         ON session.organization_id = request.organization_id
        AND session.id = request.valet_session_id
       WHERE request.organization_id = $1
         AND session.location_id = $2
         AND request.status IN ('OPEN', 'ACCEPTED')`,
      [scope.organizationId, input.locationId],
    );
    const row = rows.rows[0];
    if (row === undefined) {
      throw new Error("Queue snapshot aggregate is missing.");
    }
    return { depth: row.depth, oldestAgeSeconds: row.oldestAgeSeconds };
  });
}
