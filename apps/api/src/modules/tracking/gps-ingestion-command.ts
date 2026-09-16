import type { PostgresPool } from "../../common/database/postgres";
import { lockManagementSettingsOrganization } from "../../common/database/management-settings-lock";
import {
  inDispatchTransaction,
  loadDispatchOperationTime,
} from "../dispatch/dispatch-transaction";
import { canonicalizeGpsSamples } from "./gps-sample-canonicalization";
import { persistGpsSamples } from "./gps-sample-persistence";
import {
  appendGeofenceEvents,
  evaluateAdvancingGpsSamples,
  loadActiveGeofenceAreas,
  loadAdvancingAcceptedGpsSamples,
  loadOperationalFrontier,
} from "./geofence-evaluation";
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
      await lockManagementSettingsOrganization(
        transaction,
        session.organization_id,
        "SHARED",
      );
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
      const frontier = await loadOperationalFrontier(transaction, tracker.id);
      const persisted = await persistGpsSamples(
        transaction,
        session,
        task,
        tracker,
        samples,
      );
      if (persisted.acceptedSamples.length > 0) {
        const advancingSamples = await loadAdvancingAcceptedGpsSamples(
          transaction,
          tracker.id,
          frontier,
          persisted.acceptedSamples,
        );
        const areas = await loadActiveGeofenceAreas(
          transaction,
          session.organization_id,
          session.location_id,
        );
        const events = evaluateAdvancingGpsSamples(
          frontier,
          areas,
          advancingSamples,
        );
        await appendGeofenceEvents(transaction, session, task, tracker, events);
      }
      return persisted.results;
    });
}
