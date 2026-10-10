import type {
  LiveSessionOverviewEntry,
  SessionOverviewFilter,
} from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { StaffSessionContext } from "../auth/staff-session-context";

import { assertAuthorized } from "./dashboard-overview-error";
import { authorizeLiveHistoryLocation } from "./live-history-read-authorization";
import { liveSessionOverviewCursor } from "./live-session-overview-cursor";
import { getOperationalHistoryForSessions } from "./operational-history-projection";
import { dashboardSessionsInTransaction } from "./overview-sessions-query";

export async function listLiveDashboardSessions(
  pool: PostgresPool,
  input: {
    readonly authenticatedUserId: string;
    readonly staffSessionContext: StaffSessionContext;
    readonly cursor?: string;
    readonly filter?: SessionOverviewFilter;
    readonly limit: number;
    readonly locationId: string;
  },
): Promise<{ items: LiveSessionOverviewEntry[]; nextCursor: string | null }> {
  return inPostgresTransaction(pool, async (transaction) => {
    // DEC-102: protect the exact Staff session and current viewer authority
    // inside this same transaction before looking up any historical identity.
    const scope = await authorizeLiveHistoryLocation(transaction, {
      authenticatedUserId: input.authenticatedUserId,
      staffSessionContext: input.staffSessionContext,
      targetLocationId: input.locationId,
    });
    assertAuthorized(scope);

    const page = await dashboardSessionsInTransaction(transaction, scope, {
      locationId: input.locationId,
      limit: input.limit,
      ...(input.filter === undefined ? {} : { filter: input.filter }),
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      cursorCodec: liveSessionOverviewCursor({
        organizationId: scope.organizationId,
        locationId: scope.locationId,
        filter: input.filter ?? "ALL",
      }),
    });
    const history = await getOperationalHistoryForSessions(transaction, {
      organizationId: scope.organizationId,
      locationId: scope.locationId,
      sessionIds: page.items.map((session) => session.sessionId),
    });
    const items: LiveSessionOverviewEntry[] = page.items.map((session) => {
      const attribution = history.get(session.sessionId);
      if (attribution === undefined) {
        // A partial history projection is a backend integrity failure, not
        // license to silently show missing/unassigned historical data.
        throw new Error(
          "Authorized Live session history projection is incomplete.",
        );
      }
      return { ...session, ...attribution };
    });
    return { items, nextCursor: page.nextCursor };
  });
}
