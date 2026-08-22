import { randomUUID } from "node:crypto";

import type { PostgresPool } from "../../common/database/postgres";
import type {
  ReportIncidentRequest,
  ReportIncidentResponse,
} from "@valet/contracts";

import { loadParkingTasks, loadSessionScope } from "../staff/staff-valet-session-queries";
import {
  authorizeSessionAccess,
} from "../staff/staff-valet-session-authorization";
import {
  CustodyStaffAuthorizationError,
  requireActiveCustodyUser,
  authorizeCustodyActorForPersistedScope,
} from "../staff/custody-staff-authorizer";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";

export interface ReportIncidentCommandRequest
  extends ReportIncidentRequest {
  readonly authenticatedUserId: string;
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
export function createReportIncidentCommandExecutor(pool: PostgresPool) {
  return async (
    request: ReportIncidentCommandRequest,
  ): Promise<ReportIncidentResponse> => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await requireActiveCustodyUser(client, request.authenticatedUserId);

      const session = await loadSessionScope(client, request.sessionId);
      if (session.state === "COMPLETED") {
        throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
      }

      const actor = await authorizeCustodyActorForPersistedScope(client, {
        allowedRoles: ["VALET_EMPLOYEE", "VALET_SUPERVISOR"],
        authenticatedUserId: request.authenticatedUserId,
        resourceScope: {
          locationId: session.location_id,
          organizationId: session.organization_id,
        },
      });

      const eligibility = await lockShiftOperationalEligibility(client, {
        locationId: session.location_id,
        membershipId: actor.membershipId,
      });
      if (eligibility === null) {
        throw new CustodyStaffAuthorizationError("LOCATION_ACCESS_DENIED");
      }

      if (actor.role === "VALET_EMPLOYEE") {
        // Employees need the full legitimate operational access matrix.
        const tasks = await loadParkingTasks(client, session);
        authorizeSessionAccess(session, tasks, actor.membershipId, actor.role);
      }
      // Supervisors may report against any active session at their exact
      // authorized shift Location without acquiring Task ownership.

      const description = request.description.trim();
      if (description.length === 0 || description.length > MAX_DESCRIPTION) {
        throw new Error("Incident description must be bounded.");
      }

      // Stable client-generated id serializes concurrent retries.
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`${session.organization_id}:incident:${request.incidentId}`],
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
