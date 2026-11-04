import type { ManagementAlertPreviewResponse } from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { readEffectiveManagementAlertTimingPreferences } from "../management/management-alert-timing-repository";
import { queryUncoveredTaskAlertCases } from "../dispatch/uncovered-task-alert-query";
import { authorizeManagementAlertPhaseOneAudience } from "./management-alert-audience-authorization";
import { correlateManagementAlertPreview } from "./management-alert-correlation";
import { DashboardOverviewError } from "./dashboard-overview-error";
import { queryRetrievalSlaAlertCases } from "./management-alert-sources/retrieval-sla-alert-reader";
import { queryIncidentAlertCases } from "./management-alert-sources/incident-alert-reader";
import { queryPresenceReviewAlertCases } from "./management-alert-sources/presence-review-alert-reader";
import type { ManagementAlertSourceCase } from "./management-alert-sources/management-alert-source-contract";
import type { DashboardLocationScope } from "./dashboard-location-authorization";
import type { PostgresTransaction } from "../../common/database/postgres";
import { requireManagementAlertClockCutover } from "./management-alert-clock-cutover";

const SOURCE_LIMIT = 21;
type PhaseOneCategory = ManagementAlertSourceCase["category"];

async function requireAudience(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  locationId: string,
  category: PhaseOneCategory,
  initialScope?: DashboardLocationScope,
): Promise<DashboardLocationScope> {
  const scope = await authorizeManagementAlertPhaseOneAudience(transaction, {
    category,
    context,
    locationId,
  });
  if (
    scope === null ||
    (initialScope !== undefined &&
      (scope.organizationId !== initialScope.organizationId ||
        scope.membershipId !== initialScope.membershipId ||
        scope.locationId !== initialScope.locationId))
  ) {
    throw new DashboardOverviewError("AUTHORIZATION_DENIED");
  }
  return scope;
}

/** Shared Phase-1 source chain. Invoked in a transaction by both P1 and P2/3. */
export async function queryPhaseOneManagementAlertCases(
  transaction: PostgresTransaction,
  input: { readonly context: StaffSessionContext; readonly locationId: string },
): Promise<{
  readonly scope: DashboardLocationScope;
  readonly cases: ManagementAlertSourceCase[];
  readonly timing: Awaited<
    ReturnType<typeof readEffectiveManagementAlertTimingPreferences>
  >;
}> {
  // Invalid or absent cutover must be a hard failure, never a zero badge.
  const postLockClockCutover = requireManagementAlertClockCutover();
  const scope = await requireAudience(
    transaction,
    input.context,
    input.locationId,
    "ALT-01",
  );
  const timing = await readEffectiveManagementAlertTimingPreferences(
    transaction,
    {
      organizationId: scope.organizationId,
      userId: input.context.userId,
    },
  );
  const readerInput = { context: input.context, scope, limit: SOURCE_LIMIT };
  const cases: ManagementAlertSourceCase[] = [
    ...(await queryRetrievalSlaAlertCases(transaction, {
      ...readerInput,
      graceSeconds: timing.alt01GraceSeconds,
    })),
  ];

  await requireAudience(
    transaction,
    input.context,
    input.locationId,
    "ALT-02",
    scope,
  );
  await requireAudience(
    transaction,
    input.context,
    input.locationId,
    "ALT-03",
    scope,
  );
  cases.push(
    ...(await queryUncoveredTaskAlertCases(transaction, {
      ...readerInput,
      initialQueueDelaySeconds: timing.alt02QueueSeconds,
      postDeclineDelaySeconds: timing.alt03DeclineSeconds,
      postLockClockCutover,
    })),
  );

  await requireAudience(
    transaction,
    input.context,
    input.locationId,
    "ALT-08",
    scope,
  );
  cases.push(...(await queryIncidentAlertCases(transaction, readerInput)));
  await requireAudience(
    transaction,
    input.context,
    input.locationId,
    "ALT-12",
    scope,
  );
  cases.push(
    ...(await queryPresenceReviewAlertCases(transaction, readerInput)),
  );
  return { scope, cases, timing };
}

/**
 * No materialized inbox or read-time write. Existing five-category Phase-1
 * runtime remains unchanged even while Phase-2/3 is gated OFF.
 */
export function listManagementAlertPreview(
  pool: PostgresPool,
  input: { readonly context: StaffSessionContext; readonly locationId: string },
): Promise<ManagementAlertPreviewResponse> {
  return inPostgresTransaction(pool, async (transaction) => {
    const { cases, scope } = await queryPhaseOneManagementAlertCases(
      transaction,
      input,
    );
    return correlateManagementAlertPreview(cases, scope);
  });
}
