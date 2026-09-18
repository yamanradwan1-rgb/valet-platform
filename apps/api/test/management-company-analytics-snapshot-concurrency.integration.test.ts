import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";
import {
  seedCompanyIncident,
  seedCompanySession,
  type CompanySeedScope,
} from "./management-company-analytics-test-seed";
import {
  waitForAdvisoryLock,
  waitForLockWait,
} from "./management-settings-race-test-helpers";

const fixture = new ManagementControlPlaneTestFixture();

async function scenario() {
  const admin = await fixture.createUser();
  const membership = await fixture.createMembership(admin.id, {
    name: "BE-11 analytics snapshot",
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
    state: "PARKED",
  });
  await seedCompanyIncident(fixture, state.scope, {
    createdAt: "2026-07-10T09:00:00Z",
    sessionId,
    type: "KEY_MISSING",
  });
}, 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

describe("MGT-BE-11 company analytics snapshot concurrency", () => {
  it("keeps the first response all-old after a completion commits while sources are blocked", async () => {
    const path =
      `/v1/staff/management/organizations/${state.membership.organizationId}` +
      "/analytics/all-locations?from=2026-07-10&to=2026-07-10";
    const blocker = await fixture.databasePool().connect();
    let blockerClosed = false;
    let firstRequest: ReturnType<typeof fixture.managementGet> | undefined;

    try {
      await blocker.query("BEGIN");
      await blocker.query("LOCK TABLE locations IN ACCESS EXCLUSIVE MODE");
      firstRequest = fixture.managementGet(path, state.auth.accessToken);
      await waitForLockWait(fixture.databasePool(), "FROM locations AS location");
      await waitForAdvisoryLock(
        fixture.databasePool(),
        "FROM locations AS location",
        "ExclusiveLock",
        true,
      );

      await fixture.query(
        `UPDATE valet_sessions
         SET state = 'COMPLETED', completed_at = $2::timestamptz,
             updated_at = clock_timestamp()
         WHERE id = $1`,
        [sessionId, "2026-07-10T10:00:00Z"],
      );

      await blocker.query("COMMIT");
      blockerClosed = true;
      blocker.release();

      const first = await firstRequest;
      expect(first.status).toBe(200);
      expect(first.body?.summary).toMatchObject({
        incidents: {
          incidentCount: 1,
          incidentsPer1000: { denominator: 0, numerator: 1, value: null },
        },
        kpis: {
          carsHandedOff: {
            attributedCount: 0,
            distinctAttributedEmployeeCount: 0,
            missingAttributionCount: 0,
          },
          carsPerActiveEmployee: { denominator: 1, numerator: 0, value: "0.000" },
        },
        operational: {
          carsHandledPerDay: [{ date: "2026-07-10", handledCount: 0 }],
        },
      });

      const next = await fixture.managementGet(path, state.auth.accessToken);
      expect(next.status).toBe(200);
      expect(next.body?.summary).toMatchObject({
        incidents: {
          incidentCount: 1,
          incidentsPer1000: {
            denominator: 1,
            numerator: 1,
            value: "1000.000",
          },
        },
        kpis: {
          carsHandedOff: {
            attributedCount: 0,
            distinctAttributedEmployeeCount: 0,
            missingAttributionCount: 1,
          },
          carsPerActiveEmployee: { denominator: 1, numerator: 1, value: "1.000" },
        },
        operational: {
          carsHandledPerDay: [{ date: "2026-07-10", handledCount: 1 }],
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
