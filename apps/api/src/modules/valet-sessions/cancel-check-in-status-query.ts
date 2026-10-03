import type { CancelCheckInStatusResponse } from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import {
  authorizeAndLockCancelTarget,
  assertCoherentCancellation,
  type CancelCheckInAuthorityInput,
} from "./cancel-check-in-authorization";

export function createCancelCheckInStatusQuery(pool: PostgresPool) {
  return (
    input: CancelCheckInAuthorityInput,
  ): Promise<CancelCheckInStatusResponse> =>
    inPostgresTransaction(pool, async (transaction) => {
      const { session } = await authorizeAndLockCancelTarget(
        transaction,
        input,
      );
      if (session.state === "CANCELLED")
        await assertCoherentCancellation(transaction, session);
      return {
        sessionId: session.id,
        locationId: session.location_id,
        state: session.state,
        version: session.version,
      };
    });
}
