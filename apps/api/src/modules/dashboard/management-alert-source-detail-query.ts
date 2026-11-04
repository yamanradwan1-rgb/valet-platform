import type { ManagementAlertSourceDetailResponse } from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import type { PostgresTransaction } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { readCurrentUncoveredTaskAlertById } from "../dispatch/uncovered-task-alert-query";
import { readEffectiveManagementAlertTimingPreferences } from "../management/management-alert-timing-repository";
import { authorizeManagementAlertPhaseOneAudience } from "./management-alert-audience-authorization";
import { correlateManagementAlertPreview } from "./management-alert-correlation";
import { DashboardOverviewError } from "./dashboard-overview-error";
import { findIncidentAlertCaseById } from "./management-alert-sources/incident-alert-reader";
import { findPresenceReviewAlertCaseById } from "./management-alert-sources/presence-review-alert-reader";
import { findRetrievalSlaAlertCaseById } from "./management-alert-sources/retrieval-sla-alert-reader";
import type { ManagementAlertSourceCase } from "./management-alert-sources/management-alert-source-contract";
import { requireManagementAlertClockCutover } from "./management-alert-clock-cutover";
import type { DashboardLocationScope } from "./dashboard-location-authorization";

type Category = ManagementAlertSourceCase["category"];
export interface PhaseOneExactSourceInput {
  readonly category: Category;
  readonly context: StaffSessionContext;
  readonly episodeId: string;
  readonly locationId: string;
  readonly sourceId: string;
}
const unavailable = () => new DashboardOverviewError("AUTHORIZATION_DENIED");

/**
 * Exact P1 source read in the CALLER'S transaction.
 * Unified P2/3 can project this same proven candidate without a second
 * different-snapshot authority lookup or changing P1 HTTP behavior.
 */
export async function queryPhaseOneManagementAlertSourceDetail(
  tx: PostgresTransaction,
  input: PhaseOneExactSourceInput,
): Promise<{
  readonly candidate: ManagementAlertSourceCase;
  readonly scope: DashboardLocationScope;
  readonly valetSessionId: string | null;
}> {
  const postLockClockCutover = requireManagementAlertClockCutover();
  const scope = await authorizeManagementAlertPhaseOneAudience(tx, {
    category: input.category,
    context: input.context,
    locationId: input.locationId,
  });
  if (scope === null) throw unavailable();
  const timing = await readEffectiveManagementAlertTimingPreferences(tx, {
    organizationId: scope.organizationId,
    userId: input.context.userId,
  });
  const readerInput = {
    context: input.context,
    scope,
    sourceId: input.sourceId,
  };
  let selected: ManagementAlertSourceCase | null = null;
  let valetSessionId: string | null = null;
  switch (input.category) {
    case "ALT-01": {
      const retrieval = await findRetrievalSlaAlertCaseById(tx, {
        ...readerInput,
        graceSeconds: timing.alt01GraceSeconds,
      });
      if (retrieval !== null) {
        selected = retrieval;
        valetSessionId = retrieval.valetSessionId;
      }
      break;
    }
    case "ALT-02":
    case "ALT-03":
      selected = await readCurrentUncoveredTaskAlertById(
        tx,
        {
          organizationId: scope.organizationId,
          locationId: scope.locationId,
          viewerUserId: input.context.userId,
          viewerMembershipId: scope.membershipId,
          limit: 1,
          initialQueueDelaySeconds: timing.alt02QueueSeconds,
          postDeclineDelaySeconds: timing.alt03DeclineSeconds,
          postLockClockCutover,
        },
        input.sourceId,
      );
      break;
    case "ALT-08":
      selected = await findIncidentAlertCaseById(tx, readerInput);
      break;
    case "ALT-12":
      selected = await findPresenceReviewAlertCaseById(tx, readerInput);
      break;
  }
  if (
    selected === null ||
    selected.category !== input.category ||
    selected.episodeId !== input.episodeId
  ) {
    throw unavailable();
  }
  return { candidate: selected, scope, valetSessionId };
}

/** Existing Phase-1 public response remains unchanged. */
export function readManagementAlertSourceDetail(
  pool: PostgresPool,
  input: PhaseOneExactSourceInput,
): Promise<ManagementAlertSourceDetailResponse> {
  return inPostgresTransaction(pool, async (tx) => {
    const { candidate, scope, valetSessionId } =
      await queryPhaseOneManagementAlertSourceDetail(tx, input);
    const item = correlateManagementAlertPreview([candidate], scope).items[0];
    if (item === undefined) throw unavailable();
    return { item, valetSessionId };
  });
}
