import type {
  IncidentRecoveryResponse,
  ReserveIncidentRecoveryResponse,
} from "@valet/contracts";
import { CustodyStaffAuthorizationError } from "../staff/custody-staff-authorizer";
import {
  incidentReport,
  type IncidentRecoveryIntentRow,
  type RecoveryIncidentRow,
} from "./incident-recovery-records";

export interface RecoveryBinding {
  readonly incidentId: string;
  readonly locationId: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly sessionId: string;
}

export function matchesIntent(
  intent: IncidentRecoveryIntentRow,
  binding: RecoveryBinding,
): boolean {
  return (
    intent.incident_id === binding.incidentId &&
    intent.organization_id === binding.organizationId &&
    intent.location_id === binding.locationId &&
    intent.valet_session_id === binding.sessionId &&
    intent.reporting_membership_id === binding.membershipId
  );
}

function denyForeign(): never {
  throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
}

export function projectRecoveryResult(
  binding: RecoveryBinding,
  incident: RecoveryIncidentRow | undefined,
  intent: IncidentRecoveryIntentRow | undefined,
  databaseNow: Date,
): IncidentRecoveryResponse {
  if (incident !== undefined) {
    if (
      incident.reported_by_membership_id !== binding.membershipId ||
      incident.valet_session_id !== binding.sessionId
    ) {
      return denyForeign();
    }
    if (intent === undefined || !matchesIntent(intent, binding)) {
      throw new Error("Incident recovery invariant failed.");
    }
    if (intent.state === "RETIRED") {
      throw new Error("Incident recovery terminal invariant failed.");
    }
    return { outcome: "FOUND", report: incidentReport(incident) };
  }
  if (intent === undefined) {
    return {
      outcome: "UNKNOWN",
      incidentId: binding.incidentId,
      sessionId: binding.sessionId,
    };
  }
  if (!matchesIntent(intent, binding)) return denyForeign();
  if (intent.state === "RETIRED" || databaseNow >= intent.expires_at) {
    return {
      outcome: "RETIRED",
      incidentId: binding.incidentId,
      sessionId: binding.sessionId,
    };
  }
  return {
    expiresAt: intent.expires_at.toISOString(),
    incidentId: binding.incidentId,
    outcome: "RESERVED",
    sessionId: binding.sessionId,
  } satisfies ReserveIncidentRecoveryResponse;
}
