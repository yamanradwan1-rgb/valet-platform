import type { ParkingCancellationStatusResponse } from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import {
  authorizeParkingCancellation,
  isPreCustody,
} from "./cancel-before-parking-authorization";
import { coherentParkingCancellation } from "./cancel-before-parking-history";
import type { ParkingCancellationAuthorityInput } from "./cancel-before-parking-types";

export function createParkingCancellationStatusQuery(pool: PostgresPool) {
  return (
    input: ParkingCancellationAuthorityInput,
  ): Promise<ParkingCancellationStatusResponse> =>
    inPostgresTransaction(pool, async (tx) => {
      const target = await authorizeParkingCancellation(tx, input);
      const { session, task } = target;
      if (session.state === "CANCELLED" || task.status === "CANCELLED")
        return {
          outcome: "CANCELLED",
          ...(await coherentParkingCancellation(
            tx,
            target,
            input.expectedShiftId,
          )),
        };
      return {
        outcome: "NOT_CANCELLED",
        sessionId: session.id,
        taskId: task.id,
        sessionVersion: session.version,
        taskVersion: task.version,
        classification: isPreCustody(target) ? "PRE_CUSTODY" : "ADVANCED",
      };
    });
}
