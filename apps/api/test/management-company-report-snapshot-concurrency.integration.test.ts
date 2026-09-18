import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";
import {
  seedCompanyRetrievalRequest,
  seedCompanySession,
  type CompanySeedScope,
} from "./management-company-analytics-test-seed";
import {
  waitForAdvisoryLock,
  waitForLockWait,
} from "./management-settings-race-test-helpers";

const fixture = new ManagementControlPlaneTestFixture();
const requestedAt = "2026-07-10T09:00:00Z";

async function scenario() {
  const admin = await fixture.createUser();
  const membership = await fixture.createMembership(admin.id, {
    name: "BE-11 report snapshot",
  });
  const location = await fixture.addLocation(membership.organizationId);
  const auth = await fixture.nativeLogin(admin);
  await fixture.enrollAndAssure(auth);
  const scope: CompanySeedScope = {
    locationId: location.locationId,
    membershipId: membership.membershipId,
    organizationId: membership.organizationId,
  };
  return { auth, membership, scope };
}

let state: Awaited<ReturnType<typeof scenario>>;
let sessionId: string;

beforeAll(async () => {
  await fixture.start();
  state = await scenario();
  sessionId = await seedCompanySession(fixture, state.scope, {
    createdAt: "2026-07-10T08:00:00Z",
    readyAt: "2026-07-10T09:01:00Z",
    retrievalRequestedAt: requestedAt,
    state: "READY",
  });
}, 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

describe("MGT-BE-11 company DAILY report snapshot concurrency", () => {
  it("keeps KPI and daily retrieval counts on one old snapshot after a concurrent insert", async () => {
    const path =
      `/v1/staff/management/organizations/${state.membership.organizationId}` +
      "/reports/daily?date=2026-07-10";
    const blocker = await fixture.databasePool().connect();
    let blockerClosed = false;
    let firstRequest: ReturnType<typeof fixture.managementGet> | undefined;

    try {
      await blocker.query("BEGIN");
      await blocker.query("LOCK TABLE vehicle_photos IN ACCESS EXCLUSIVE MODE");
      firstRequest = fixture.managementGet(path, state.auth.accessToken);
      await waitForLockWait(fixture.databasePool(), "sla_cohort AS");
      await waitForAdvisoryLock(
        fixture.databasePool(),
        "sla_cohort AS",
        "ExclusiveLock",
        true,
      );

      await seedCompanyRetrievalRequest(fixture, state.scope, {
        requestedAt,
        sessionId,
        targetSeconds: 300,
      });

      await blocker.query("COMMIT");
      blockerClosed = true;
      blocker.release();

      const first = await firstRequest;
      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({
        dailyActivity: { retrievalRequestedCount: 0 },
        summary: {
          kpis: {
            slaCompliance: { denominator: 0, requestCount: 0 },
          },
        },
      });

      const next = await fixture.managementGet(path, state.auth.accessToken);
      expect(next.status).toBe(200);
      expect(next.body).toMatchObject({
        dailyActivity: { retrievalRequestedCount: 1 },
        summary: {
          kpis: {
            slaCompliance: { denominator: 1, requestCount: 1 },
          },
        },
      });
    } finally {
      if (!blockerClosed) {
        await blocker.query("ROLLBACK").catch(() => undefined);
        blocker.release();
      }
      await firstRequest?.catch(() => undefined);
    }
  });
});
