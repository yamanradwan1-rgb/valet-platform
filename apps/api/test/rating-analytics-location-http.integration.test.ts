import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DashboardApiTestContext } from "./dashboard-api-test-context";
import { analyticsSeedSession } from "./dashboard-analytics-seed";

const context = new DashboardApiTestContext("rating_analytics_location");
const period = "from=2026-07-10&to=2026-07-10";

beforeAll(() => context.setupApi(), 120_000);
afterAll(() => context.teardownApi(), 60_000);

function path(locationId: string, query = period) {
  return `/v1/staff/dashboard/locations/${locationId}/analytics/ratings?${query}`;
}

describe("Issue #313 Location Customer Feedback API authorization", () => {
  it("returns real rated visits only from the authorized completed cohort", async () => {
    const location = await context.managerFixture();
    const sessionId = await analyticsSeedSession(context, {
      completedAtIso: "2026-07-10T10:00:00Z",
      createdAtIso: "2026-07-10T09:55:00Z",
      state: "COMPLETED",
    });
    await analyticsSeedSession(context, {
      completedAtIso: "2026-07-10T11:00:00Z",
      createdAtIso: "2026-07-10T10:55:00Z",
      state: "COMPLETED",
    });
    await context.adminPool.query(
      `INSERT INTO guest_ratings
         (organization_id, location_id, valet_session_id, rating, rated_at)
       VALUES ($1,$2,$3,5,$4::timestamptz)`,
      [location.organizationId, location.locationId, sessionId, "2026-07-20T12:00:00Z"],
    );
    const { authorization } = await context.authenticated(location);
    const result = await context.request("GET", path(location.locationId), { authorization });
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect(result.body).toBeDefined();
    const json = JSON.stringify(result.body);
    expect(json).not.toContain(sessionId);
  });

  it("denies missing Staff auth, removed Location grants and revoked users", async () => {
    const fixture = await context.managerFixture();
    const otherLocationId = await context.addLocation(fixture, { name: "No rating grant" });
    const staff = await context.createStaff(fixture);
    const login = await context.login(staff);
    expect(login.status).toBe(200);
    const authorization = `Bearer ${String(login.body?.accessToken)}`;
    const missing = await context.request("GET", path(fixture.locationId));
    expect(missing.status).toBe(401);
    const other = await context.request("GET", path(otherLocationId), { authorization });
    expect(other.status).toBe(404);
    expect(other.body?.code).toBe("AUTHORIZATION_DENIED");
    await context.adminPool.query(
      `DELETE FROM membership_location_access
       WHERE membership_id=$1 AND location_id=$2`,
      [staff.membershipId, fixture.locationId],
    );
    const revokedGrant = await context.request("GET", path(fixture.locationId), {
      authorization,
    });
    expect(revokedGrant.status).toBe(404);
    expect(revokedGrant.headers.get("cache-control")).toContain("no-store");
    await context.adminPool.query(`UPDATE users SET status='DISABLED' WHERE id=$1`, [staff.userId]);
    const disabled = await context.request("GET", path(fixture.locationId), {
      authorization,
    });
    expect(disabled.status).toBe(401);
  });

  it("rejects date overflow, malformed periods and caller-selected timezone", async () => {
    const fixture = await context.managerFixture();
    const { authorization } = await context.authenticated(fixture);
    for (const query of [
      "from=2026-07-10",
      "from=2026-07-11&to=2026-07-10",
      "from=2026-07-10&to=2026-08-10",
      `${period}&timezone=UTC`,
      `${period}&limit=500`,
    ]) {
      const response = await context.request("GET", path(fixture.locationId, query), {
        authorization,
      });
      expect(response.status, query).toBe(400);
      expect(response.body?.code, query).toBe("REQUEST_INVALID");
    }
  });
});
