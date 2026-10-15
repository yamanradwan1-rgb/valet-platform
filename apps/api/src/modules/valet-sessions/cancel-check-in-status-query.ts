import type { CancelCheckInStatusResponse } from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { StaffSessionContext } from "../auth/staff-session-context";
import {
  authorizeAndLockCancelTarget,
  assertCoherentCancellation,
  recheckCancellationCredential,
  type CancelCheckInAuthorityInput,
} from "./cancel-check-in-authorization";

export function createCancelCheckInStatusQuery(pool: PostgresPool) {
  return (
    input: CancelCheckInAuthorityInput,
    credential?: StaffSessionContext,
  ): Promise<CancelCheckInStatusResponse> =>
    inPostgresTransaction(pool, async (transaction) => {
      const { session } = await authorizeAndLockCancelTarget(
        transaction,
        input,
        credential,
      );
      if (session.state === "CANCELLED")
        await assertCoherentCancellation(transaction, session);
      await recheckCancellationCredential(transaction, input, credential);
      return {
        sessionId: session.id,
        locationId: session.location_id,
        state: session.state,
        version: session.version,
      };
    });
}
