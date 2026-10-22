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
    expect(result.body).toMatchObject({
      scope: "LOCATION",
      from: "2026-07-10",
      to: "2026-07-10",
      eligibleCompletedVisits: 2,
      ratedVisits: 1,
      averageRating: "5.0000",
      participationRate: "0.500000",
      distribution: { five: 1, four: 0, three: 0, two: 0, one: 0 },
      recentRatings: [{
        rating: 5,
        completedAt: "2026-07-10T10:00:00.000Z",
        ratedAt: "2026-07-20T12:00:00.000Z",
        locationTimezone: "Asia/Amman",
      }],
    });
    const json = JSON.stringify(result.body);
    expect(json).not.toContain(sessionId);
    expect((result.body?.recentRatings as { visitReference: string }[])[0]?.visitReference)
      .toMatch(/^VISIT-[0-9A-F]{12}$/);
  });

  it("returns null mean and participation for no eligible completed visits", async () => {
    const fixture = await context.managerFixture();
    const { authorization } = await context.authenticated(fixture);
    const empty = await context.request(
      "GET", path(fixture.locationId, "from=2026-06-01&to=2026-06-01"),
      { authorization },
    );
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({
      averageRating: null,
      eligibleCompletedVisits: 0,
      participationRate: null,
      ratedVisits: 0,
      recentRatings: [],
      distribution: { five: 0, four: 0, three: 0, two: 0, one: 0 },
    });
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

  it("revoker-first: canonical Location-grant removal fences an actual ratings GET", async () => {
    const fixture = await context.managerFixture();
    const manager = await context.createStaff(fixture);
    const admin = await context.createActor(fixture, "ORG_ADMIN");
    const login = await context.login(manager);
    const authorization = `Bearer ${String(login.body?.accessToken)}`;
    const revoker = await context.adminPool.connect();
    await revoker.query("BEGIN");
    try {
      const version = await revoker.query<{ version: number }>(
        "SELECT version FROM organization_memberships WHERE id=$1",
        [manager.membershipId],
      );
      const revoked = await revoker.query<{ result_code: string }>(
        `SELECT result_code FROM staff_management_set_location_access(
          $1::uuid,$2::uuid,$3::uuid,$4::integer,$5::uuid[],$6::boolean)`,
        [admin.membershipId, fixture.organizationId, manager.membershipId,
          version.rows[0]!.version, [fixture.locationId], false],
      );
      expect(revoked.rows[0]?.result_code).toBe("OK");
      const reading = context.request("GET", path(fixture.locationId), { authorization });
      void reading.catch(() => undefined);
      await expect.poll(async () => {
        const result = await context.adminPool.query<{ count: number }>(
          `SELECT count(*)::integer AS count FROM pg_stat_activity
           WHERE wait_event_type='Lock' AND datname=current_database()
             AND usename<>current_user`,
        );
        return result.rows[0]?.count ?? 0;
      }, { timeout: 4000, interval: 30 }).toBeGreaterThan(0);
      await revoker.query("COMMIT");
      expect((await reading).status).toBe(404);
    } finally {
      await revoker.query("ROLLBACK").catch(() => undefined);
      revoker.release();
    }
  }, 25_000);

  it("reader-first: canonical revoke waits for actual ratings GET to finish", async () => {
    const fixture = await context.managerFixture();
    const manager = await context.createStaff(fixture);
    const admin = await context.createActor(fixture, "ORG_ADMIN");
    const login = await context.login(manager);
    const authorization = `Bearer ${String(login.body?.accessToken)}`;
    const tableGate = await context.adminPool.connect();
    const revoker = await context.adminPool.connect();
    await tableGate.query("BEGIN");
    await revoker.query("BEGIN");
    try {
      // Block only the projection's table read, after its grant fence is held.
      await tableGate.query("LOCK TABLE public.guest_ratings IN ACCESS EXCLUSIVE MODE");
      const reading = context.request("GET", path(fixture.locationId), { authorization });
      void reading.catch(() => undefined);
      await expect.poll(async () => {
        const result = await context.adminPool.query<{ count: number }>(
          `SELECT count(*)::integer AS count FROM pg_stat_activity
           WHERE wait_event_type='Lock' AND datname=current_database()
             AND usename<>current_user`,
        );
        return result.rows[0]?.count ?? 0;
      }, { timeout: 4000, interval: 30 }).toBeGreaterThan(0);
      const version = await revoker.query<{ version: number }>(
        "SELECT version FROM organization_memberships WHERE id=$1",
        [manager.membershipId],
      );
      const pid = Number((await revoker.query("SELECT pg_backend_pid() AS pid")).rows[0]?.pid);
      const revoke = revoker.query<{ result_code: string }>(
        `SELECT result_code FROM staff_management_set_location_access(
          $1::uuid,$2::uuid,$3::uuid,$4::integer,$5::uuid[],$6::boolean)`,
        [admin.membershipId, fixture.organizationId, manager.membershipId,
          version.rows[0]!.version, [fixture.locationId], false],
      );
      void revoke.catch(() => undefined);
      await expect.poll(async () => {
        const result = await context.adminPool.query<{ event: string | null }>(
          "SELECT wait_event_type AS event FROM pg_stat_activity WHERE pid=$1", [pid],
        );
        return result.rows[0]?.event;
      }, { timeout: 4000, interval: 30 }).toBe("Lock");
      await tableGate.query("COMMIT");
      expect((await reading).status).toBe(200);
      expect((await revoke).rows[0]?.result_code).toBe("OK");
      await revoker.query("COMMIT");
      expect((await context.request("GET", path(fixture.locationId), { authorization })).status)
        .toBe(404);
    } finally {
      await tableGate.query("ROLLBACK").catch(() => undefined);
      await revoker.query("ROLLBACK").catch(() => undefined);
      tableGate.release();
      revoker.release();
    }
  }, 25_000);
});
