import type { ManagementAlertUnifiedItem } from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { readEffectiveManagementAlertTimingPreferences } from "../management/management-alert-timing-repository";
import { authorizeManagementAlertPhaseOneAudience } from "./management-alert-audience-authorization";
import { DashboardOverviewError } from "./dashboard-overview-error";
import { findEmergencyTakeoverAlertOccurrence } from "./management-alert-sources/emergency-takeover-occurrence-reader";
import { findHandoffTerminalAlertOccurrence } from "./management-alert-sources/handoff-terminal-occurrence-reader";
import { findFinancialAlertCaseById } from "./management-alert-sources/financial-alert-source-query";
import { findLocationIntakeStoppedAlertCaseById } from "./management-alert-sources/location-intake-stopped-alert-reader";
import { findRetrievalStageAlertCaseById } from "./management-alert-sources/retrieval-stage-alert-reader";
import { findRetrievalReadyAlertCaseById } from "./management-alert-sources/retrieval-ready-alert-reader";
import { findForcedShiftEndOccurrence } from "./management-alert-sources/force-ended-shift-occurrence-reader";
import { findStaffSecurityOccurrence } from "./management-alert-sources/staff-security-occurrence-reader";
import { findGeofenceViolationAlertCaseById } from "./management-alert-sources/geofence-violation-alert-reader";
import { requireRetrievalPhaseStageClockCutover } from "./management-alert-sources/retrieval-phase-stage-clock-cutover";
import { queryPhaseOneManagementAlertSourceDetail } from "./management-alert-source-detail-query";
import {
  projectActiveAlert,
  projectCommittedOccurrence,
  projectPhaseOneAlert,
} from "./management-alert-unified-projection";
import { correlateManagementAlertUnifiedPreview } from "./management-alert-unified-correlation";

type Category = ManagementAlertUnifiedItem["category"];
export interface UnifiedExactInput {
  readonly context: StaffSessionContext;
  readonly locationId: string;
  readonly category: Category;
  readonly sourceId: string;
  readonly episodeId: string;
}

function unavailable(): never {
  throw new DashboardOverviewError("AUTHORIZATION_DENIED");
}

const phaseOne: ReadonlySet<string> = new Set([
  "ALT-01",
  "ALT-02",
  "ALT-03",
  "ALT-08",
  "ALT-12",
]);

/** Exact source lookup never trusts a list result, cache or UUID as permission. */
export async function readUnifiedManagementAlertDetail(
  pool: PostgresPool,
  input: UnifiedExactInput,
): Promise<{
  item: ManagementAlertUnifiedItem;
  valetSessionId: string | null;
}> {
  return inPostgresTransaction(pool, async (tx) => {
    if (phaseOne.has(input.category)) {
      const legacy = await queryPhaseOneManagementAlertSourceDetail(tx, {
        ...input,
        category: input.category as
          "ALT-01" | "ALT-02" | "ALT-03" | "ALT-08" | "ALT-12",
      });
      const item = correlateManagementAlertUnifiedPreview(
        [projectPhaseOneAlert(legacy.candidate)],
        {
          organizationId: legacy.scope.organizationId,
          locationId: legacy.scope.locationId,
          allowOrganizationOnly: false,
        },
      ).items[0];
      if (item === undefined) return unavailable();
      return { item, valetSessionId: legacy.valetSessionId };
    }
    const scope = await authorizeManagementAlertPhaseOneAudience(tx, {
      category: "ALT-01",
      context: input.context,
      locationId: input.locationId,
    });
    if (scope === null) return unavailable();
    const reader = { context: input.context, scope, sourceId: input.sourceId };
    const timing = await readEffectiveManagementAlertTimingPreferences(tx, {
      organizationId: scope.organizationId,
      userId: input.context.userId,
    });
    let candidate:
      | ReturnType<typeof projectActiveAlert>
      | ReturnType<typeof projectCommittedOccurrence>
      | null = null;
    if (input.category === "ALT-04") {
      const source = await findRetrievalStageAlertCaseById(
        tx,
        {
          ...reader,
          limit: 1,
          delaySeconds: timing.alt04StageSeconds,
          alt01GraceSeconds: timing.alt01GraceSeconds,
          postLockClockCutover: requireRetrievalPhaseStageClockCutover(),
        },
        input.sourceId,
        input.episodeId,
      );
      if (source) candidate = projectActiveAlert(source);
    } else if (input.category === "ALT-06") {
      const source = await findRetrievalReadyAlertCaseById(
        tx,
        {
          ...reader,
          limit: 1,
          delaySeconds: timing.alt06HandoffSeconds,
          postLockClockCutover: requireRetrievalPhaseStageClockCutover(),
        },
        input.sourceId,
        input.episodeId,
      );
      if (source) candidate = projectActiveAlert(source);
    } else if (input.category === "ALT-05") {
      const source = await findEmergencyTakeoverAlertOccurrence(tx, reader);
      if (source) {
        candidate = projectCommittedOccurrence({
          ...source,
          category: "ALT-05",
          sourceKind: "TAKEOVER",
        });
      }
    } else if (input.category === "ALT-07") {
      const source = await findHandoffTerminalAlertOccurrence(tx, reader);
      if (source) {
        candidate = projectCommittedOccurrence({
          ...source,
          category: "ALT-07",
          sourceKind: "HANDOFF",
        });
      }
    } else if (input.category === "ALT-09") {
      const source = await findGeofenceViolationAlertCaseById(tx, reader);
      if (source) {
        candidate = projectCommittedOccurrence({
          category: "ALT-09",
          severity: source.severity,
          sourceKind: "GEOFENCE",
          sourceId: source.sourceId,
          episodeId: source.episodeId,
          organizationId: source.organizationId,
          locationId: source.locationId,
          occurredAt: source.attentionAt,
          title: source.title,
        });
      }
    } else if (input.category === "ALT-10" || input.category === "ALT-11") {
      const source = await findFinancialAlertCaseById(tx, {
        ...reader,
        category: input.category,
        episodeId: input.episodeId,
        unknownDelaySeconds: timing.alt11UnknownPaymentSeconds,
      });
      if (source) candidate = projectActiveAlert(source);
    } else if (input.category === "ALT-16") {
      const source = await findLocationIntakeStoppedAlertCaseById(tx, reader);
      if (source) {
        candidate = projectActiveAlert({
          ...source,
          episodeId: "current",
          occurredAt: null,
        });
      }
    } else if (input.category === "ALT-13") {
      const source = await findForcedShiftEndOccurrence(tx, {
        context: input.context,
        organizationId: scope.organizationId,
        locationId: scope.locationId,
        eventId: input.episodeId,
      });
      if (source?.targetId === input.sourceId) {
        candidate = projectCommittedOccurrence({
          category: "ALT-13",
          severity: source.severity,
          sourceKind: "SHIFT",
          sourceId: source.targetId,
          episodeId: source.eventId,
          organizationId: source.organizationId,
          locationId: source.locationId,
          occurredAt: source.occurredAt,
          title: source.title,
        });
      }
    } else if (input.category === "ALT-15") {
      const source = await findStaffSecurityOccurrence(tx, {
        context: input.context,
        organizationId: scope.organizationId,
        eventId: input.episodeId,
      });
      if (source?.targetId === input.sourceId) {
        candidate = projectCommittedOccurrence({
          category: "ALT-15",
          severity: source.severity,
          sourceKind: "STAFF",
          sourceId: source.targetId,
          episodeId: source.eventId,
          organizationId: source.organizationId,
          locationId: null,
          occurredAt: source.occurredAt,
          title: source.title,
        });
      }
    }
    if (
      candidate === null ||
      candidate.category !== input.category ||
      candidate.sourceId !== input.sourceId ||
      candidate.episodeId !== input.episodeId
    )
      return unavailable();
    const item = correlateManagementAlertUnifiedPreview([candidate], {
      organizationId: scope.organizationId,
      locationId: scope.locationId,
      allowOrganizationOnly: input.category === "ALT-15",
    }).items[0];
    if (!item) return unavailable();
    // Sensitive source detail never implies custody, GPS or Payment command access.
    return { item, valetSessionId: null };
  });
}
