import { randomUUID } from "node:crypto";

import type { PostgresPool } from "../../common/database/postgres";
import type {
  ReportIncidentRequest,
  ReportIncidentResponse,
} from "@valet/contracts";

import { authorizeIncidentCreation } from "./incident-creation-authorization";
import { lockIncidentOperation } from "./incident-operation-lock";
import { loadRecoveryIntent } from "./incident-recovery-records";
import { matchesIntent } from "./incident-recovery-result";
import { readIncidentDatabaseTime } from "./incident-database-time";

export interface ReportIncidentCommandRequest extends ReportIncidentRequest {
  readonly authenticatedUserId: string;
  readonly recoveryProtocol?: boolean;
  readonly sessionId: string;
}

export class IncidentReportingError extends Error {
  readonly code: "IDEMPOTENCY_CONFLICT" | "SESSION_TERMINAL";

  constructor(code: "IDEMPOTENCY_CONFLICT" | "SESSION_TERMINAL") {
    super(
      code === "IDEMPOTENCY_CONFLICT"
        ? "This incident submission id was already used with different details."
        : "Incidents cannot be opened for this session.",
    );
    this.name = "IncidentReportingError";
    this.code = code;
  }
}

interface IncidentRow {
  created_at: Date;
  description: string;
  id: string;
  reported_by_membership_id: string;
  severity: string;
  status: string;
  type: string;
  valet_session_id: string;
}

const MAX_DESCRIPTION = 500;

/**
 * Basic MVP incident reporting. Strictly additive: opening an incident must
 * never mutate ValetSession/Task/RetrievalRequest/key custody/payment state.
 * The client-generated incidentId is the stable retry boundary: exact retry
 * returns the original report; mismatched reuse conflicts.
 */
export function createReportIncidentCommandExecutor(
  pool: PostgresPool,
  controlledTime?: Date,
) {
  return async (
    request: ReportIncidentCommandRequest,
  ): Promise<ReportIncidentResponse> => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { actor, session } = await authorizeIncidentCreation(
        client,
        request.authenticatedUserId,
        request.sessionId,
      );

      const description = request.description.trim();
      if (description.length === 0 || description.length > MAX_DESCRIPTION) {
        throw new Error("Incident description must be bounded.");
      }

      // Stable client-generated id serializes concurrent retries.
      await lockIncidentOperation(
        client,
        session.organization_id,
        request.incidentId,
      );
      const existing = await client.query<IncidentRow>(
        `SELECT id::text AS id, created_at, reported_by_membership_id::text,
                status::text AS status, type::text AS type,
                severity::text AS severity, description,
                valet_session_id::text AS valet_session_id
         FROM incidents
         WHERE id = $1 AND organization_id = $2`,
        [request.incidentId, session.organization_id],
      );
      const prior = existing.rows[0];
      const intent = await loadRecoveryIntent(
        client,
        session.organization_id,
        request.incidentId,
      );
      const binding = {
        incidentId: request.incidentId,
        locationId: session.location_id,
        membershipId: actor.membershipId,
        organizationId: session.organization_id,
        sessionId: session.id,
      };
      if (intent !== undefined && request.recoveryProtocol !== true) {
        throw new IncidentReportingError("IDEMPOTENCY_CONFLICT");
      }
      if (prior !== undefined) {
        // The stable incidentId is bound to its original reporter: a
        // different (even otherwise-authorized) actor must never receive
        // another actor's report as a successful retry.
        if (prior.reported_by_membership_id !== actor.membershipId) {
          throw new IncidentReportingError("IDEMPOTENCY_CONFLICT");
        }
        const samePayload =
          prior.valet_session_id === session.id &&
          prior.type === request.type &&
          prior.severity === request.severity &&
          prior.description === description;
        if (!samePayload) {
          throw new IncidentReportingError("IDEMPOTENCY_CONFLICT");
        }
        if (request.recoveryProtocol) {
          if (
            intent === undefined ||
            !matchesIntent(intent, binding) ||
            intent.state !== "RESERVED"
          ) {
            throw new Error("Incident recovery invariant failed.");
          }
        }
        await client.query("COMMIT");
        return {
          createdAt: prior.created_at.toISOString(),
          incidentId: prior.id,
          reportedByMembershipId: prior.reported_by_membership_id,
          sessionId: prior.valet_session_id,
          severity: request.severity,
          status: "OPEN",
          type: request.type,
        };
      }

      if (request.recoveryProtocol) {
        const databaseNow = await readIncidentDatabaseTime(
          client,
          controlledTime,
        );
        if (
          intent === undefined ||
          !matchesIntent(intent, binding) ||
          intent.state !== "RESERVED" ||
          databaseNow >= intent.expires_at
        ) {
          throw new IncidentReportingError("IDEMPOTENCY_CONFLICT");
        }
      }

      const operationTime = new Date();
      const inserted = await client.query<IncidentRow>(
        `INSERT INTO incidents
           (id, organization_id, location_id, valet_session_id,
            status, severity, type, description,
            reported_by_membership_id, created_at)
         VALUES ($1, $2, $3, $4, 'OPEN', $5::incident_severity,
                 $6, $7, $8, $9)
         RETURNING id::text AS id, created_at,
                   reported_by_membership_id::text
                   AS reported_by_membership_id, status::text AS status`,
        [
          request.incidentId,
          session.organization_id,
          session.location_id,
          session.id,
          request.severity,
          request.type,
          description,
          actor.membershipId,
          operationTime,
        ],
      );
      const row = inserted.rows[0]!;

      await client.query(
        `INSERT INTO audit_events
           (id, organization_id, location_id, valet_session_id,
            actor_membership_id, event_type, entity_type, entity_id,
            metadata_json, occurred_at)
         VALUES ($1, $2, $3, $4, $5, 'INCIDENT_OPENED', 'INCIDENT', $6,
                 $7::jsonb, $8)`,
        [
          randomUUID(),
          session.organization_id,
          session.location_id,
          session.id,
          actor.membershipId,
          request.incidentId,
          JSON.stringify({
            incidentId: request.incidentId,
            severity: request.severity,
            status: "OPEN",
            type: request.type,
          }),
          operationTime,
        ],
      );

      await client.query("COMMIT");
      return {
        createdAt: row.created_at.toISOString(),
        incidentId: row.id,
        reportedByMembershipId: row.reported_by_membership_id,
        sessionId: session.id,
        severity: request.severity,
        status: "OPEN",
        type: request.type,
      };
    } catch (error: unknown) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve original error.
      }
      throw error;
    } finally {
      client.release();
    }
  };
}
