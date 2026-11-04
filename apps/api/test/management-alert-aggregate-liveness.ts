import type { PostgresPool } from "../src/common/database/postgres";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { queryPresenceReviewAlertCases } from "../src/modules/dashboard/management-alert-sources/presence-review-alert-reader";

/** PENDING Presence fixtures expire after 300 s: fail, never mislabel an
 * incident-only benchmark as a five-live-family benchmark. This validation
 * runs outside the measured timing samples. */
export async function assertMixedPresenceStillLive(
  pool: PostgresPool,
  input: {
    readonly context: StaffSessionContext;
    readonly organizationId: string;
    readonly locationId: string;
    readonly membershipId: string;
    readonly minimumEligible: number;
  },
): Promise<void> {
  const cases = await inPostgresTransaction(pool, (tx) =>
    queryPresenceReviewAlertCases(tx, {
      context: input.context,
      scope: {
        organizationId: input.organizationId,
        locationId: input.locationId,
        membershipId: input.membershipId,
      },
      limit: 21,
    }),
  );
  if (cases.length !== Math.min(21, input.minimumEligible)) {
    throw new Error(
      "Mixed-source benchmark Presence expired or stopped being current.",
    );
  }
}

export function assertScenarioPresenceStillLive(
  pool: PostgresPool,
  scenario: {
    readonly ca: StaffSessionContext;
    readonly lm: StaffSessionContext;
    readonly organizationId: string;
    readonly locationId: string;
    readonly caMembershipId: string;
    readonly lmMembershipId: string;
    readonly expectedPresenceCount: number;
  },
  role: "ca" | "lm",
): Promise<void> {
  return assertMixedPresenceStillLive(pool, {
    context: scenario[role],
    organizationId: scenario.organizationId,
    locationId: scenario.locationId,
    membershipId:
      role === "ca" ? scenario.caMembershipId : scenario.lmMembershipId,
    minimumEligible: scenario.expectedPresenceCount,
  });
}
