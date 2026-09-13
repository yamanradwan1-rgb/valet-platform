import type { IncidentRecoveryResponse } from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import { authorizeIncidentRecovery } from "./incident-recovery-authorization";
import { lockIncidentOperation } from "./incident-operation-lock";
import {
  loadRecoveryIncident,
  loadRecoveryIntent,
} from "./incident-recovery-records";
import {
  matchesIntent,
  projectRecoveryResult,
} from "./incident-recovery-result";
import { readIncidentDatabaseTime } from "./incident-database-time";
import { CustodyStaffAuthorizationError } from "../staff/custody-staff-authorizer";

export function createRetireIncidentRecoveryExecutor(
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
      const binding = {
        incidentId: input.incidentId,
        locationId: session.location_id,
        membershipId: actor.membershipId,
        organizationId: session.organization_id,
        sessionId: session.id,
      };
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
      let intent = await loadRecoveryIntent(
        client,
        session.organization_id,
        input.incidentId,
      );
      if (incident === undefined && intent?.state === "RESERVED") {
        if (!matchesIntent(intent, binding)) {
          throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
        }
        await client.query(
          `UPDATE incident_recovery_intents SET state = 'RETIRED'
           WHERE organization_id = $1 AND incident_id = $2 AND state = 'RESERVED'`,
          [session.organization_id, input.incidentId],
        );
        intent = await loadRecoveryIntent(
          client,
          session.organization_id,
          input.incidentId,
        );
      }
      const databaseNow = await readIncidentDatabaseTime(
        client,
        controlledTime,
      );
      const result = projectRecoveryResult(
        binding,
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
