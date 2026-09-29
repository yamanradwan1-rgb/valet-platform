import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MapSetupTestContext, validPoint } from "./map-setup-test-context";

const context = new MapSetupTestContext("map-point-http");
const pointPath = (locationId: string) =>
  `/v1/staff/locations/${locationId}/map/points`;

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-007B Location map point management", () => {
  it("allows an accessed active Location Manager to create, read, and audit a point", async () => {
    const actor = await context.actor();
    const created = await context.request(
      "POST",
      pointPath(actor.fixture.locationId),
      { body: validPoint, token: actor.token },
    );
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject(validPoint);
    const id = String(created.body.id);

    const listed = await context.request(
      "GET",
      pointPath(actor.fixture.locationId),
      { token: actor.token },
    );
    expect(listed.status).toBe(200);
    expect(listed.body.points).toEqual([created.body]);

    const audit = await context.audit(id);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({
      actor_membership_id: actor.fixture.membershipId,
      event_type: "MAP_SETUP_POINT_CREATED",
      metadata_json: {
        active: true,
        configurationType: "ENTRANCE",
        operation: "POINT_CREATED",
        resourceId: id,
        resourceType: "LocationMapPoint",
      },
    });
    expect(JSON.stringify(audit.rows[0]?.metadata_json)).not.toMatch(
      /latitude|longitude|31\.9539|35\.9106/i,
    );
  });

  it("conceals missing access, cross-Organization targets, and inactive managers", async () => {
    const noAccess = await context.actor({ locationAccess: false });
    const foreign = await context.actor();
    const inactive = await context.actor({ membershipStatus: "INACTIVE" });
    for (const testCase of [
      { locationId: noAccess.fixture.locationId, token: noAccess.token },
      { locationId: foreign.fixture.locationId, token: noAccess.token },
      { locationId: inactive.fixture.locationId, token: inactive.token },
    ]) {
      const response = await context.request(
        "POST",
        pointPath(testCase.locationId),
        { body: validPoint, token: testCase.token },
      );
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        code: "AUTHORIZATION_DENIED",
        message: "The requested resource is not available.",
      });
    }
    const concealedRead = await context.request(
      "GET",
      pointPath(foreign.fixture.locationId),
      { token: noAccess.token },
    );
    expect(concealedRead.status).toBe(404);
    expect(concealedRead.body.code).toBe("AUTHORIZATION_DENIED");
  });

  it.each(["ORG_ADMIN", "VALET_SUPERVISOR", "VALET_EMPLOYEE"] as const)(
    "denies %s without adding MFA or implicit management authority",
    async (role) => {
      const actor = await context.actor({ role });
      const response = await context.request(
        "POST",
        pointPath(actor.fixture.locationId),
        { body: validPoint, token: actor.token },
      );
      expect(response.status).toBe(404);
      expect(response.body.code).toBe("AUTHORIZATION_DENIED");
    },
  );

  it("requires an authenticated bearer principal", async () => {
    const actor = await context.actor();
    const response = await context.request(
      "POST",
      pointPath(actor.fixture.locationId),
      { body: validPoint },
    );
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("STAFF_AUTHENTICATION_REQUIRED");
  });

  it.each([
    ["latitude", 91],
    ["latitude", -91],
    ["longitude", 181],
    ["longitude", -181],
    ["kind", "GARAGE"],
  ] as const)("rejects invalid point %s", async (field, value) => {
    const actor = await context.actor();
    const response = await context.request(
      "POST",
      pointPath(actor.fixture.locationId),
      { body: { ...validPoint, [field]: value }, token: actor.token },
    );
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("REQUEST_INVALID");
  });

  it("rejects forged authority fields and writes no false audit", async () => {
    const actor = await context.actor();
    const response = await context.request(
      "POST",
      pointPath(actor.fixture.locationId),
      {
        body: {
          ...validPoint,
          membershipId: actor.fixture.membershipId,
          organizationId: actor.fixture.organizationId,
          userId: actor.fixture.userId,
        },
        token: actor.token,
      },
    );
    expect(response.status).toBe(400);
    const count = await context.database.adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
       WHERE organization_id = $1`,
      [actor.fixture.organizationId],
    );
    expect(count.rows[0]?.count).toBe("0");
  });

  it("updates activation deterministically and cannot cross Location scope", async () => {
    const actor = await context.actor();
    const secondLocation = await context.database.addLocation(actor.fixture);
    const created = await context.request(
      "POST",
      pointPath(actor.fixture.locationId),
      { body: validPoint, token: actor.token },
    );
    const pointId = String(created.body.id);
    let expectedUpdatedAt = String(created.body.updatedAt);
    for (const active of [false, true]) {
      const updated = await context.request(
        "PATCH",
        `${pointPath(actor.fixture.locationId)}/${pointId}`,
        { body: { active, expectedUpdatedAt }, token: actor.token },
      );
      expect(updated.status).toBe(200);
      expect(updated.body.active).toBe(active);
      expectedUpdatedAt = String(updated.body.updatedAt);
    }
    const crossed = await context.request(
      "PATCH",
      `${pointPath(secondLocation)}/${pointId}`,
      {
        body: { expectedUpdatedAt, label: randomUUID() },
        token: actor.token,
      },
    );
    expect(crossed.status).toBe(404);
  });
});
