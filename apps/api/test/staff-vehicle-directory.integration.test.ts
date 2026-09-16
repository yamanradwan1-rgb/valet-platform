import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  staffVehicleDirectoryLegacyResponseSchema,
  staffVehicleDirectoryVisibilityCapability,
  staffVehicleDirectoryVisibilityCapabilityHeader,
  type StaffVehicleDirectoryLegacyResponse,
  type StaffVehicleDirectoryResponse,
} from "@valet/contracts";

import {
  createStaffValetSessionHarness,
  type StaffValetSessionHarness,
} from "./staff-valet-session-harness";

const DIRECTORY = "/v1/staff/valet-sessions/directory";

describe("Staff Vehicle Directory Authority Integration", () => {
  let harness: StaffValetSessionHarness;

  beforeAll(async () => {
    harness = createStaffValetSessionHarness();
    await harness.start();
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  }, 60_000);

  function issueToken(userId: string): string {
    const token = `token-${randomUUID()}`;
    harness.principals.set(`Bearer ${token}`, userId);
    return token;
  }

  function directory<T = StaffVehicleDirectoryResponse>(
    token: string,
    queryString: string,
  ) {
    const suffix = queryString.length > 0 ? `?${queryString}` : "";
    return harness.request<T>("GET", `${DIRECTORY}${suffix}`, {
      headers: {
        [staffVehicleDirectoryVisibilityCapabilityHeader]:
          staffVehicleDirectoryVisibilityCapability,
      },
      token,
    });
  }

  async function pinCreatedAt(sessionId: string, iso: string) {
    await harness.context.adminPool.query(
      `UPDATE valet_sessions SET created_at = $2 WHERE id = $1`,
      [sessionId, iso],
    );
  }

  it("preserves the exact strict legacy response for requests without the visibility capability", async () => {
    const { fixture, token } = await harness.fixtureWithToken({
      role: "VALET_SUPERVISOR",
    });
    const slotId = await harness.createKeySlot(fixture, "K-LEGACY");
    await harness.createSession(fixture, {
      keySlotId: slotId,
      state: "AWAITING_PARKING",
    });

    const legacy = await harness.request<StaffVehicleDirectoryLegacyResponse>(
      "GET",
      `${DIRECTORY}?locationId=${fixture.locationId}`,
      { token },
    );

    expect(legacy.status).toBe(200);
    expect(
      staffVehicleDirectoryLegacyResponseSchema.parse(legacy.body),
    ).toEqual(legacy.body);
    expect(JSON.stringify(legacy.body)).not.toContain("keySlotVisibility");
    expect(legacy.body.rows[0]?.keySlotCode).toBe("K-LEGACY");
  });

  it("returns location-wide non-COMPLETED rows to the supervisor in deterministic order", async () => {
    const { fixture, token } = await harness.fixtureWithToken({
      role: "VALET_SUPERVISOR",
    });
    const employee = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
    const zoneId = await harness.createParkingZone(fixture, "ZONE-A");
    const slotId = await harness.createKeySlot(fixture, "K-01");

    const queued = await harness.createSession(fixture, {
      keySlotId: slotId,
      state: "AWAITING_PARKING",
    });
    const parking = await harness.createSession(fixture, {
      parkedAt: new Date(),
      parkingStartedAt: new Date(),
      parkingZoneId: zoneId,
      state: "PARKED",
    });
    await harness.createTask(fixture, parking.sessionId, {
      assigneeMembershipId: employee.membershipId,
      status: "COMPLETED",
    });
    const completed = await harness.createSession(fixture);
    await harness.context.adminPool.query(
      `UPDATE valet_sessions
       SET state = 'COMPLETED', completed_at = transaction_timestamp()
       WHERE id = $1`,
      [completed.sessionId],
    );
    // Newest-first deterministic order regardless of insertion-time ties.
    await pinCreatedAt(queued.sessionId, "2026-08-25T10:01:00Z");
    await pinCreatedAt(parking.sessionId, "2026-08-25T10:02:00Z");

    const res = await directory(token, `locationId=${fixture.locationId}`);
    expect(res.status).toBe(200);
    expect(res.body.truncated).toBe(false);
    expect(res.body.locationId).toBe(fixture.locationId);
    expect(res.body.rows.map((r) => r.sessionId)).toEqual([
      parking.sessionId,
      queued.sessionId,
    ]);
    const parkingRow = res.body.rows.find(
      (r) => r.sessionId === parking.sessionId,
    );
    const queuedRow = res.body.rows.find(
      (r) => r.sessionId === queued.sessionId,
    );
    expect(parkingRow?.state).toBe("PARKED");
    expect(parkingRow?.parkingZoneCode).toBe("ZONE-A");
    expect(parkingRow?.parkingSpotCode).toBeNull();
    expect(parkingRow?.vehicle.temporaryDescriptor).toBe("Test vehicle");
    expect(parkingRow?.createdAt).toBe("2026-08-25T10:02:00.000Z");
    // Supervisory Key Slot detail inside the exact authorized Location.
    expect(queuedRow?.keySlotCode).toBe("K-01");
    expect(queuedRow?.keySlotVisibility).toBe("VISIBLE");
    expect(parkingRow?.keySlotVisibility).toBe("UNASSIGNED");
  });

  it("does not grant detail/command authority through row visibility", async () => {
    const { fixture, token } = await harness.fixtureWithToken({
      role: "VALET_SUPERVISOR",
    });
    const employee = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
    const draft = await harness.createSession(fixture, {
      state: "CHECKING_IN",
    });
    await harness.context.adminPool.query(
      `UPDATE valet_sessions SET checked_in_by_membership_id = $2 WHERE id = $1`,
      [draft.sessionId, employee.membershipId],
    );
    const handoff = await harness.createSession(fixture, {
      parkedAt: new Date(),
      parkingStartedAt: new Date(),
      state: "HANDOFF_PENDING",
    });

    const res = await directory(token, `locationId=${fixture.locationId}`);
    expect(res.status).toBe(200);
    const visibleIds = res.body.rows.map((r) => r.sessionId);
    expect(visibleIds).toContain(draft.sessionId);
    expect(visibleIds).toContain(handoff.sessionId);

    // Directory visibility alone does not widen any authorization: the
    // supervisor still cannot read the employee's draft detail, and every
    // protected command keeps re-proving its own existing server
    // authorization (covered by handoff/custody command-negative suites).
    const detail = await harness.request(
      "GET",
      `/v1/staff/valet-sessions/${draft.sessionId}`,
      { token },
    );
    expect(detail.status).toBe(404);
    expect(detail.body.code).toBe("TENANT_ACCESS_DENIED");
  });

  it("denies a supervisor requesting a second org Location without an active shift there", async () => {
    const { fixture, token } = await harness.fixtureWithToken({
      role: "VALET_SUPERVISOR",
    });
    const otherLocationId = await harness.context.addLocation(fixture);
    const res = await directory<Record<string, unknown>>(
      token,
      `locationId=${otherLocationId}`,
    );
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("LOCATION_ACCESS_DENIED");
  });

  it("denies a cross-organization selector non-disclosingly", async () => {
    const { fixture: locA } = await harness.fixtureWithToken({
      role: "VALET_SUPERVISOR",
    });
    const { token: outsiderToken } = await harness.fixtureWithToken({
      role: "VALET_SUPERVISOR",
    });
    const res = await directory<Record<string, unknown>>(
      outsiderToken,
      `locationId=${locA.locationId}`,
    );
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("TENANT_ACCESS_DENIED");
  });

  it("transport-fails invalid, non-uuid, missing, and extra selectors", async () => {
    const { token } = await harness.fixtureWithToken({
      role: "VALET_SUPERVISOR",
    });
    const invalid = await harness.request(
      "GET",
      `${DIRECTORY}?locationId=not-a-uuid`,
      { token },
    );
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe("REQUEST_INVALID");

    const missing = await harness.request("GET", DIRECTORY, { token });
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe("REQUEST_INVALID");

    const extra = await harness.request(
      "GET",
      `${DIRECTORY}?locationId=${randomUUID()}&organizationId=${randomUUID()}`,
      { token },
    );
    expect(extra.status).toBe(400);
    expect(extra.body.code).toBe("REQUEST_INVALID");

    const malformed = await harness.request(
      "GET",
      `${DIRECTORY}?locationId=11111111-1111-4111-8111-11111111111`,
      { token },
    );
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe("REQUEST_INVALID");
  });

  it("denies an inactive user", async () => {
    const fixture = await harness.context.createFixture({
      userStatus: "DISABLED",
    });
    const res = await directory<Record<string, unknown>>(
      issueToken(fixture.userId),
      `locationId=${fixture.locationId}`,
    );
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("AUTHORIZATION_DENIED");
  });

  it("denies an eligible-role member without an active shift at the requested Location", async () => {
    const { fixture } = await harness.fixtureWithToken();
    const shifless = await harness.addMember(fixture, "VALET_EMPLOYEE", false);
    const res = await directory<Record<string, unknown>>(
      issueToken(shifless.userId),
      `locationId=${fixture.locationId}`,
    );
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("LOCATION_ACCESS_DENIED");
  });

  it("rejects guest/customer-style credentials at the staff principal boundary", async () => {
    const { fixture } = await harness.fixtureWithToken({
      role: "VALET_SUPERVISOR",
    });
    // Guest/customer principals are not Staff principals: unauthenticated and
    // unrecognized bearer credentials fail closed at the staff principal
    // resolver before any tenant/Location proof runs.
    const anonymous = await harness.request(
      "GET",
      `${DIRECTORY}?locationId=${fixture.locationId}`,
    );
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.code).toBe("STAFF_AUTHENTICATION_REQUIRED");

    const guestStyle = await harness.request(
      "GET",
      `${DIRECTORY}?locationId=${fixture.locationId}`,
      { token: `guest-${randomUUID()}` },
    );
    expect(guestStyle.status).toBe(401);
    expect(guestStyle.body.code).toBe("STAFF_AUTHENTICATION_REQUIRED");
  });
});
