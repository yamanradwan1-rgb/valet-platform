import type { PostgresTransaction } from "../../common/database/postgres";
import { DashboardOverviewError } from "./dashboard-overview-error";
import {
  readOptionalProtectedShift,
  readOptionalSensitiveTakeovers,
} from "./management-alert-source-assurance-optional";
import { queryFinancialAlertCases } from "./management-alert-sources/financial-alert-source-query";
import { queryEmergencyTakeoverAlertOccurrences } from "./management-alert-sources/emergency-takeover-occurrence-reader";
import { queryHandoffTerminalAlertOccurrences } from "./management-alert-sources/handoff-terminal-occurrence-reader";
import { queryLocationIntakeStoppedAlertCases } from "./management-alert-sources/location-intake-stopped-alert-reader";
import { queryRetrievalStageAlertCases } from "./management-alert-sources/retrieval-stage-alert-reader";
import { queryRetrievalReadyAlertCases } from "./management-alert-sources/retrieval-ready-alert-reader";
import { queryForcedShiftEndOccurrences } from "./management-alert-sources/force-ended-shift-occurrence-reader";
import { queryStaffSecurityOccurrences } from "./management-alert-sources/staff-security-occurrence-reader";
import { queryGeofenceViolationAlertCases } from "./management-alert-sources/geofence-violation-alert-reader";
import { requireRetrievalPhaseStageClockCutover } from "./management-alert-sources/retrieval-phase-stage-clock-cutover";
import type { ManagementAlertReaderInput } from "./management-alert-sources/management-alert-source-contract";
import {
  projectActiveAlert,
  projectCommittedOccurrence,
} from "./management-alert-unified-projection";
import type { ManagementAlertUnifiedCandidate } from "./management-alert-unified-correlation";

interface ReadInput extends ManagementAlertReaderInput {
  readonly unknownDelaySeconds: number;
  readonly stageDelaySeconds: number;
  readonly handoffDelaySeconds: number;
  readonly alt01GraceSeconds: number;
  /** Current verified CA role; only CA can read ALT-05 sensitive takeover. */
  readonly allowCompanyAdmin: boolean;
}

/**
 * Tracking disabled is a currently ineligible source, not an absent Dashboard
 * entitlement. The P1 audience is already authorized; this probe cannot grant
 * access to GPS. When enabled the geofence reader independently verifies the
 * full CA/LM tracking source right again before retrieving any event.
 */
async function sourceTrackingEnabled(
  tx: PostgresTransaction,
  input: ReadInput,
): Promise<boolean> {
  const result = await tx.query<{ readonly enabled: boolean }>(
    `SELECT COALESCE(location.tracking_enabled_override,
                     organization.tracking_enabled) AS "enabled"
     FROM organizations AS organization
     INNER JOIN locations AS location
       ON location.organization_id=organization.id
      AND location.id=$2::uuid AND location.status='ACTIVE'
     WHERE organization.id=$1::uuid AND organization.status='ACTIVE'
     FOR SHARE OF organization, location`,
    [input.scope.organizationId, input.scope.locationId],
  );
  if (result.rowCount !== 1 || typeof result.rows[0]?.enabled !== "boolean") {
    throw new DashboardOverviewError("AUTHORIZATION_DENIED");
  }
  return result.rows[0].enabled;
}

/**
 * Source authorization, current Payment precedence and Seen-before-LIMIT are
 * source-reader obligations. The aggregator never counts unauthorized rows.
 */
export async function queryUnifiedCoreSources(
  tx: PostgresTransaction,
  input: ReadInput,
): Promise<ManagementAlertUnifiedCandidate[]> {
  const finances = await queryFinancialAlertCases(tx, input);
  const location = await queryLocationIntakeStoppedAlertCases(tx, input);
  const stageClock = requireRetrievalPhaseStageClockCutover();
  const stage = await queryRetrievalStageAlertCases(tx, {
    ...input,
    delaySeconds: input.stageDelaySeconds,
    alt01GraceSeconds: input.alt01GraceSeconds,
    postLockClockCutover: stageClock,
  });
  const ready = await queryRetrievalReadyAlertCases(tx, {
    ...input,
    delaySeconds: input.handoffDelaySeconds,
    postLockClockCutover: stageClock,
  });
  const takeovers = input.allowCompanyAdmin
    ? await readOptionalSensitiveTakeovers(() =>
        queryEmergencyTakeoverAlertOccurrences(tx, input),
      )
    : [];
  const handoffs = await queryHandoffTerminalAlertOccurrences(tx, input);
  const geofence = (await sourceTrackingEnabled(tx, input))
    ? await queryGeofenceViolationAlertCases(tx, input)
    : [];
  const shifts = await readOptionalProtectedShift(() =>
    queryForcedShiftEndOccurrences(tx, {
      context: input.context,
      organizationId: input.scope.organizationId,
      locationId: input.scope.locationId,
      limit: input.limit,
    }),
  );
  const staff = input.allowCompanyAdmin
    ? await queryStaffSecurityOccurrences(tx, {
        context: input.context,
        organizationId: input.scope.organizationId,
        limit: input.limit,
      })
    : [];
  return [
    ...stage.map((item) => projectActiveAlert(item)),
    ...ready.map((item) => projectActiveAlert(item)),
    ...finances.map((item) => projectActiveAlert(item)),
    ...location.map((item) =>
      projectActiveAlert({
        ...item,
        episodeId: "current",
        occurredAt: null,
      }),
    ),
    ...takeovers.map((item) =>
      projectCommittedOccurrence({
        category: "ALT-05",
        sourceKind: "TAKEOVER",
        severity: item.severity,
        sourceId: item.sourceId,
        episodeId: item.episodeId,
        organizationId: item.organizationId,
        locationId: item.locationId,
        occurredAt: item.occurredAt,
        title: item.title,
      }),
    ),
    ...handoffs.map((item) =>
      projectCommittedOccurrence({
        category: "ALT-07",
        sourceKind: "HANDOFF",
        severity: item.severity,
        sourceId: item.sourceId,
        episodeId: item.episodeId,
        organizationId: item.organizationId,
        locationId: item.locationId,
        occurredAt: item.occurredAt,
        title: item.title,
      }),
    ),
    ...geofence.map((item) =>
      projectCommittedOccurrence({
        category: "ALT-09",
        sourceKind: "GEOFENCE",
        severity: item.severity,
        sourceId: item.sourceId,
        episodeId: item.episodeId,
        organizationId: item.organizationId,
        locationId: item.locationId,
        occurredAt: item.attentionAt,
        title: item.title,
      }),
    ),
    ...shifts.map((item) =>
      projectCommittedOccurrence({
        category: "ALT-13",
        sourceKind: "SHIFT",
        severity: item.severity,
        sourceId: item.targetId,
        episodeId: item.eventId,
        organizationId: item.organizationId,
        locationId: item.locationId,
        occurredAt: item.occurredAt,
        title: item.title,
      }),
    ),
    ...staff.map((item) =>
      projectCommittedOccurrence({
        category: "ALT-15",
        sourceKind: "STAFF",
        severity: item.severity,
        sourceId: item.targetId,
        episodeId: item.eventId,
        organizationId: item.organizationId,
        locationId: null,
        occurredAt: item.occurredAt,
        title: item.title,
      }),
    ),
  ];
}
