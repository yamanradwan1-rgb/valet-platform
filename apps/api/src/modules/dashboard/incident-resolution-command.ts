import { UnauthorizedException } from "@nestjs/common";
import {
  incidentResolutionRequestSchema,
  type IncidentResolutionRequest,
} from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { lockLocationLifecycle } from "../../common/database/location-lifecycle-lock";
import { ApiTransportValidationError } from "../../common/http/api-errors";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { lockAndRecheckStaffSessionContext } from "../auth/staff-session-revalidation";
import {
  recordAdminActivityInTransaction,
  requireMfaAssuranceInTransaction,
} from "../auth/mfa/mfa-assurance-policy";
import { ManagementAccessDeniedError } from "../management/management-authorization";
import { authorizeDashboardReadLocation } from "./dashboard-read-authorization";
import { queryIncidents } from "./incidents-query";

function conflict(code: "VERSION_CONFLICT" | "IDEMPOTENCY_CONFLICT"): never {
  throw Object.assign(
    new Error("Incident resolution conflicts with saved state."),
    { code },
  );
}

export async function resolveDashboardIncident(
  pool: PostgresPool,
  input: {
    readonly context: StaffSessionContext;
    readonly locationId: string;
    readonly incidentId: string;
    readonly request: IncidentResolutionRequest;
  },
) {
  const parsed = incidentResolutionRequestSchema.safeParse(input.request);
  if (!parsed.success) throw new ApiTransportValidationError();
  const request = parsed.data;
  try {
    return await inPostgresTransaction(pool, async (transaction) => {
      // Match the lifecycle writer order: lifecycle -> session -> org -> target.
      await lockLocationLifecycle(transaction, input.locationId, "SHARED");
      if (
        !(await lockAndRecheckStaffSessionContext(transaction, input.context))
      ) {
        throw new UnauthorizedException();
      }
      const scope = await authorizeDashboardReadLocation(transaction, {
        authenticatedUserId: input.context.userId,
        staffSessionContext: input.context,
        capability: "LOCATION_DASHBOARD_READ",
        targetLocationId: input.locationId,
        recordActivity: false,
      });
      if (scope === null) throw new ManagementAccessDeniedError();
      // Keep persisted eligibility valid even for direct concurrent row writers.
      const eligible = await transaction.query<{ role: string }>(
        `SELECT m.role::text FROM organization_memberships m
         JOIN organizations o ON o.id=m.organization_id
         JOIN locations l ON l.organization_id=o.id AND l.id=$3
         JOIN users u ON u.id=m.user_id AND u.status='ACTIVE'
         WHERE m.id=$1 AND m.organization_id=$2 AND m.user_id=$4
           AND m.status='ACTIVE' AND m.role IN ('ORG_ADMIN','LOCATION_MANAGER')
           AND o.status='ACTIVE' AND l.status='ACTIVE'
         FOR SHARE OF m,o,l,u`,
        [
          scope.membershipId,
          scope.organizationId,
          input.locationId,
          input.context.userId,
        ],
      );
      if (eligible.rowCount !== 1) throw new ManagementAccessDeniedError();
      if (eligible.rows[0]!.role === "ORG_ADMIN") {
        await requireMfaAssuranceInTransaction(transaction, input.context, {
          sensitive: true,
        });
      }
      if (eligible.rows[0]!.role === "LOCATION_MANAGER") {
        const grant = await transaction.query(
          `SELECT 1 FROM membership_location_access
          WHERE organization_id=$1 AND membership_id=$2 AND location_id=$3 FOR SHARE`,
          [scope.organizationId, scope.membershipId, input.locationId],
        );
        if (grant.rowCount !== 1) throw new ManagementAccessDeniedError();
      }
      // The existing SECURITY DEFINER helper locks the commercial entitlement
      // until commit; runtime intentionally has SELECT-only subscription grants.
      const entitlement = await transaction.query<{ enabled: boolean }>(
        "SELECT public.shift_presence_lock_management_entitlement($1,$2,$3,$4) AS enabled",
        [
          input.context.userId,
          input.context.staffAuthSessionId,
          input.context.accessTokenHash,
          scope.organizationId,
        ],
      );
      if (entitlement.rows[0]?.enabled !== true)
        throw new ManagementAccessDeniedError();
      const projection = async () =>
        (
          await queryIncidents(transaction, {
            organizationId: scope.organizationId,
            locationId: input.locationId,
            incidentId: input.incidentId,
            filter: "ALL",
            limit: 1,
          })
        ).items[0]!;
      // Serialize this operation identity, including attempts on other Incidents.
      await transaction.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
        [`incident-resolution:${request.operationId}`],
      );
      const result = await transaction.query<{
        status: string;
        valet_session_id: string;
        resolution_notes: string | null;
        resolved_by_membership_id: string | null;
        resolved_at: Date | null;
      }>(
        `SELECT status::text,valet_session_id,resolution_notes,resolved_by_membership_id,resolved_at
          FROM incidents WHERE id=$1 AND organization_id=$2 AND location_id=$3 FOR UPDATE`,
        [input.incidentId, scope.organizationId, input.locationId],
      );
      const incident = result.rows[0];
      if (incident === undefined) throw new ManagementAccessDeniedError();
      const prior = await transaction.query<{ matches: boolean }>(
        `SELECT (organization_id=$2 AND location_id=$3 AND entity_id=$4
          AND entity_type='INCIDENT' AND event_type='INCIDENT_RESOLVED'
          AND actor_membership_id=$5 AND metadata_json->>'fromStatus'=$6
          AND valet_session_id=$7 AND occurred_at=$8
          AND metadata_json->>'incidentId'=$4::text
          AND metadata_json->>'toStatus'='RESOLVED') AS matches
         FROM audit_events WHERE id=$1`,
        [
          request.operationId,
          scope.organizationId,
          input.locationId,
          input.incidentId,
          scope.membershipId,
          request.expectedStatus,
          incident.valet_session_id,
          incident.resolved_at,
        ],
      );
      if (prior.rowCount) {
        if (
          prior.rows[0]?.matches !== true ||
          incident.status !== "RESOLVED" ||
          incident.resolved_by_membership_id !== scope.membershipId ||
          incident.resolution_notes !== request.resolutionNotes ||
          incident.resolved_at === null
        ) {
          conflict("IDEMPOTENCY_CONFLICT");
        }
        return projection();
      }
      if (incident.status !== request.expectedStatus)
        conflict("VERSION_CONFLICT");
      const time = await transaction.query<{ now: Date }>(
        `SELECT clock_timestamp()::timestamptz(3) AS now`,
      );
      const now = time.rows[0]!.now;
      await transaction.query(
        `UPDATE incidents SET status='RESOLVED',resolved_at=$4,resolved_by_membership_id=$5,resolution_notes=$6
         WHERE id=$1 AND organization_id=$2 AND location_id=$3`,
        [
          input.incidentId,
          scope.organizationId,
          input.locationId,
          now,
          scope.membershipId,
          request.resolutionNotes,
        ],
      );
      await transaction.query(
        `INSERT INTO audit_events(id,organization_id,location_id,valet_session_id,actor_membership_id,
          event_type,entity_type,entity_id,metadata_json,occurred_at)
         VALUES($1,$2,$3,$4,$5,'INCIDENT_RESOLVED','INCIDENT',$6,$7::jsonb,$8)`,
        [
          request.operationId,
          scope.organizationId,
          input.locationId,
          incident.valet_session_id,
          scope.membershipId,
          input.incidentId,
          JSON.stringify({
            incidentId: input.incidentId,
            fromStatus: request.expectedStatus,
            toStatus: "RESOLVED",
          }),
          now,
        ],
      );
      if (eligible.rows[0]!.role === "ORG_ADMIN") {
        await recordAdminActivityInTransaction(transaction, input.context);
      }
      return projection();
    });
  } catch (error) {
    // A caller-supplied UUID can collide with another append-only event.
    if ((error as { code?: unknown }).code === "23505")
      conflict("IDEMPOTENCY_CONFLICT");
    throw error;
  }
}
