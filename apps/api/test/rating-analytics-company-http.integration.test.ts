import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hashGuestAccessToken } from "../src/modules/valet-sessions/guest-access-command";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";
import { seedCompanySession } from "./management-company-analytics-test-seed";

const fixture = new ManagementControlPlaneTestFixture();
const period = "from=2026-07-10&to=2026-07-10";

beforeAll(() => fixture.start(), 120_000);
afterAll(() => fixture.stop(), 60_000);

function path(organizationId: string, query = period) {
  return `/v1/staff/management/organizations/${organizationId}/analytics/ratings?${query}`;
}

async function companyAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, { name: "Rating analytics" });
  const location = await fixture.addLocation(membership.organizationId);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, location, membership, user };
}

describe("Issue #313 Company Customer Feedback API authorization", () => {
  it("persists a real Guest POST and reads its completed cohort through Management", async () => {
    const admin = await companyAdmin();
    // Guest post-visit access is intentionally valid only for 24 hours.
    const completedAt = new Date(Date.now() - 15_000);
    const createdAt = new Date(completedAt.getTime() - 60_000);
    const localDay = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Amman", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(completedAt);
    const scoped = {
      locationId: admin.location.locationId,
      organizationId: admin.membership.organizationId,
      membershipId: admin.membership.membershipId,
    };
    const completed = await seedCompanySession(fixture, scoped, {
      state: "COMPLETED",
      createdAt: createdAt.toISOString(),
      completedAt: completedAt.toISOString(),
    });
    await seedCompanySession(fixture, scoped, {
      state: "COMPLETED",
      createdAt: createdAt.toISOString(),
      completedAt: completedAt.toISOString(),
    });
    const guestToken = randomBytes(32).toString("base64url");
    await fixture.query(
      `UPDATE valet_sessions SET customer_access_token_hash=$2,
              customer_access_expires_at=clock_timestamp()+interval '1 day'
       WHERE id=$1`,
      [completed, hashGuestAccessToken(guestToken)],
    );
    const posted = await fixture.request("/v1/guest/session/rating", {
      authorization: `Bearer ${guestToken}`,
      body: { rating: 5 },
    });
    expect(posted.status).toBe(200);
    expect(posted.body).toMatchObject({ rating: 5, valetSessionId: completed });
    const persisted = await fixture.query<{ rating: number }>(
      "SELECT rating FROM guest_ratings WHERE valet_session_id=$1", [completed],
    );
    expect(persisted.rows).toEqual([{ rating: 5 }]);
    const analytics = await fixture.managementGet(
      path(admin.membership.organizationId, `from=${localDay}&to=${localDay}`),
      admin.auth.accessToken,
    );
    expect(analytics.status).toBe(200);
    expect(analytics.body).toMatchObject({
      eligibleCompletedVisits: 2, ratedVisits: 1,
      averageRating: "5.0000", participationRate: "0.500000",
      distribution: { five: 1, four: 0, three: 0, two: 0, one: 0 },
    });
    expect(JSON.stringify(analytics.body)).not.toContain(guestToken);
    expect(JSON.stringify(analytics.body)).not.toContain(completed);
  });

  it("returns a no-store aggregate without Guest credentials or session identifiers", async () => {
    const admin = await companyAdmin();
    const sessionId = await seedCompanySession(fixture, {
      locationId: admin.location.locationId,
      organizationId: admin.membership.organizationId,
      membershipId: admin.membership.membershipId,
    }, {
      state: "COMPLETED",
      createdAt: "2026-07-10T09:00:00Z",
      completedAt: "2026-07-10T09:10:00Z",
    });
    await fixture.query(
      `INSERT INTO guest_ratings
         (organization_id, location_id, valet_session_id, rating, rated_at)
       VALUES ($1,$2,$3,4,$4::timestamptz)`,
      [admin.membership.organizationId, admin.location.locationId,
        sessionId, "2026-07-11T10:00:00Z"],
    );
    const response = await fixture.managementGet(
      path(admin.membership.organizationId), admin.auth.accessToken,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.body).toMatchObject({
      scope: "COMPANY",
      from: "2026-07-10",
      to: "2026-07-10",
      eligibleCompletedVisits: 1,
      ratedVisits: 1,
      averageRating: "4.0000",
      participationRate: "1.000000",
      distribution: { five: 0, four: 1, three: 0, two: 0, one: 0 },
      recentRatings: [{
        rating: 4,
        completedAt: "2026-07-10T09:10:00.000Z",
        ratedAt: "2026-07-11T10:00:00.000Z",
        locationTimezone: "Asia/Amman",
      }],
    });
    expect(JSON.stringify(response.body)).not.toContain(sessionId);
  });

  it("requires current same-session MFA and exact Organization membership", async () => {
    const admin = await companyAdmin();
    const secondSession = await fixture.nativeLogin(admin.user);
    const noMfa = await fixture.managementGet(
      path(admin.membership.organizationId), secondSession.accessToken,
    );
    expect(noMfa.status).toBe(403);
    expect(noMfa.body?.code).toBe("MFA_STEP_UP_REQUIRED");
    const foreignOrganization = await fixture.createOrganization({ name: "Foreign feedback" });
    const denied = await fixture.managementGet(
      path(foreignOrganization), admin.auth.accessToken,
    );
    expect(denied.status).toBe(404);
    expect(denied.body?.code).toBe("AUTHORIZATION_DENIED");
  });

  it("rejects extra query fields, malformed and >31-day periods", async () => {
    const admin = await companyAdmin();
    for (const query of [
      `${period}&timezone=UTC`,
      "from=2026-07-10",
      "from=2026-07-10&to=2026-08-10",
      "from=2026-02-30&to=2026-02-30",
    ]) {
      const response = await fixture.managementGet(
        path(admin.membership.organizationId, query), admin.auth.accessToken,
      );
      expect(response.status, query).toBe(400);
      expect(response.body?.code, query).toBe("REQUEST_INVALID");
    }
  });
});
