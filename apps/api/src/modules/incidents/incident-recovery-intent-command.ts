import type { PostgresPool } from "../../common/database/postgres";
import type { ReserveIncidentRecoveryResponse } from "@valet/contracts";
import { authorizeIncidentCreation } from "./incident-creation-authorization";
import { IncidentReportingError } from "./incident-reporting-command";
import { lockIncidentOperation } from "./incident-operation-lock";
import {
  loadRecoveryIncident,
  loadRecoveryIntent,
} from "./incident-recovery-records";
import { matchesIntent } from "./incident-recovery-result";
import { readIncidentDatabaseTime } from "./incident-database-time";
import { CustodyStaffAuthorizationError } from "../staff/custody-staff-authorizer";

export function createReserveIncidentRecoveryExecutor(
  pool: PostgresPool,
  controlledTime?: Date,
) {
  return async (input: {
    readonly authenticatedUserId: string;
    readonly incidentId: string;
    readonly sessionId: string;
  }): Promise<ReserveIncidentRecoveryResponse> => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { actor, session } = await authorizeIncidentCreation(
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
      const prior = await loadRecoveryIntent(
        client,
        session.organization_id,
        input.incidentId,
      );
      const binding = {
        incidentId: input.incidentId,
        locationId: session.location_id,
        membershipId: actor.membershipId,
        organizationId: session.organization_id,
        sessionId: session.id,
      };
      if (prior !== undefined && !matchesIntent(prior, binding)) {
        throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
      }
      if (
        incident !== undefined &&
        (incident.reported_by_membership_id !== actor.membershipId ||
          incident.valet_session_id !== session.id)
      ) {
        throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
      }
      if (incident !== undefined) {
        throw new IncidentReportingError("IDEMPOTENCY_CONFLICT");
      }
      const intent = prior;
      if (intent === undefined) {
        const inserted = await client.query<{
          expires_at: Date;
          incident_id: string;
          valet_session_id: string;
        }>(
          `INSERT INTO incident_recovery_intents
             (incident_id, organization_id, location_id, valet_session_id,
              reporting_membership_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING incident_id::text, valet_session_id::text, expires_at`,
          [
            input.incidentId,
            session.organization_id,
            session.location_id,
            session.id,
            actor.membershipId,
          ],
        );
        const row = inserted.rows[0]!;
        await client.query("COMMIT");
        return {
          expiresAt: row.expires_at.toISOString(),
          incidentId: row.incident_id,
          outcome: "RESERVED",
          sessionId: row.valet_session_id,
        };
      }
      const databaseNow = await readIncidentDatabaseTime(
        client,
        controlledTime,
      );
      if (intent.state !== "RESERVED" || databaseNow >= intent.expires_at) {
        throw new IncidentReportingError("IDEMPOTENCY_CONFLICT");
      }
      await client.query("COMMIT");
      return {
        expiresAt: intent.expires_at.toISOString(),
        incidentId: input.incidentId,
        outcome: "RESERVED",
        sessionId: input.sessionId,
      };
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
