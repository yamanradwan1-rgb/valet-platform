import type { IncidentRecoveryResponse } from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import { authorizeIncidentRecovery } from "./incident-recovery-authorization";
import { lockIncidentOperation } from "./incident-operation-lock";
import {
  loadRecoveryIncident,
  loadRecoveryIntent,
} from "./incident-recovery-records";
import { projectRecoveryResult } from "./incident-recovery-result";
import { readIncidentDatabaseTime } from "./incident-database-time";

export function createIncidentRecoveryQueryExecutor(
  pool: PostgresPool,
  controlledTime?: Date,
) {
  return async (input: {
    readonly authenticatedUserId: string;
    readonly incidentId: string;
    readonly sessionId: string;
  }): Promise<IncidentRecoveryResponse> => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { actor, session } = await authorizeIncidentRecovery(
        client,
        input.authenticatedUserId,
        input.sessionId,
      );
      await lockIncidentOperation(
        client,
        session.organization_id,
        input.incidentId,
      );
      const incident = await loadRecoveryIncident(
        client,
        session.organization_id,
        input.incidentId,
      );
      const intent = await loadRecoveryIntent(
        client,
        session.organization_id,
        input.incidentId,
      );
      const databaseNow = await readIncidentDatabaseTime(
        client,
        controlledTime,
      );
      const result = projectRecoveryResult(
        {
          incidentId: input.incidentId,
          locationId: session.location_id,
          membershipId: actor.membershipId,
          organizationId: session.organization_id,
          sessionId: session.id,
        },
        incident,
        intent,
        databaseNow,
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the operation error.
      }
      throw error;
    } finally {
      client.release();
    }
  };
}
