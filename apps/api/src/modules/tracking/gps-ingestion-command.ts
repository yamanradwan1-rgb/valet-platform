import type { PostgresPool } from "../../common/database/postgres";
import {
  inDispatchTransaction,
  loadDispatchOperationTime,
} from "../dispatch/dispatch-transaction";
import { canonicalizeGpsSamples } from "./gps-sample-canonicalization";
import { persistGpsSamples } from "./gps-sample-persistence";
import { GpsIngestionError } from "./gps-ingestion-errors";
import {
  assertGpsMovement,
  authorizeGpsOwner,
  lockActiveTrackingSession,
  lockGpsSession,
  lockGpsTask,
  resolveGpsActor,
} from "./gps-ingestion-locks";
import type {
  GpsIngestionCommandRequest,
  GpsSampleResult,
} from "./gps-ingestion-types";

export function createGpsIngestionCommandExecutor(pool: PostgresPool) {
  return (
    request: GpsIngestionCommandRequest,
  ): Promise<readonly GpsSampleResult[]> =>
    inDispatchTransaction(pool, async (transaction) => {
      if (request.samples.length < 1 || request.samples.length > 50) {
        throw new GpsIngestionError("REQUEST_INVALID");
      }
      const session = await lockGpsSession(transaction, request.sessionId);
      const actorMembershipId = await resolveGpsActor(
        transaction,
        session,
        request.authenticatedUserId,
      );
      const task = await lockGpsTask(transaction, session);
      await authorizeGpsOwner(transaction, session, task, actorMembershipId);
      assertGpsMovement(session, task);
      const tracker = await lockActiveTrackingSession(
        transaction,
        session,
        task,
      );
      const operationTime = await loadDispatchOperationTime(transaction);
      const samples = await canonicalizeGpsSamples(
        transaction,
        request.samples,
        tracker.started_at,
        operationTime,
      );
      return persistGpsSamples(transaction, session, task, tracker, samples);
    });
}
