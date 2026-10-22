import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
