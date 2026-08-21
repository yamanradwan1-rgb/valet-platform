import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createStaffCheckInDraftsHarness,
  type StaffCheckInDraftsHarness,
} from "./staff-check-in-drafts-harness";

describe("Staff Check-In Draft Discovery Auth & Ownership", () => {
  let harness: StaffCheckInDraftsHarness;

  beforeAll(async () => {
    harness = createStaffCheckInDraftsHarness();
    await harness.start();
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  }, 60_000);

  describe("Authentication & Base Guards", () => {
    it("returns 401 when Authorization header is missing", async () => {
      const { fixture } = await harness.fixtureWithToken();
      const res = await harness.request(
        "GET",
        `/v1/staff/check-in/drafts?locationId=${fixture.locationId}`,
      );
      expect(res.status).toBe(401);
    });

    it("returns 400 when locationId is not a valid UUID", async () => {
      const { token } = await harness.fixtureWithToken();
      const res = await harness.request(
        "GET",
        "/v1/staff/check-in/drafts?locationId=not-a-uuid",
        { token },
      );
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: "REQUEST_INVALID" });
    });

    it("returns 404 AUTHORIZATION_DENIED when staff user is disabled", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      await harness.context.adminPool.query(
        `UPDATE users SET status = 'DISABLED' WHERE id = $1`,
        [fixture.userId],
      );
      const res = await harness.request(
        "GET",
        `/v1/staff/check-in/drafts?locationId=${fixture.locationId}`,
        { token },
      );
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
    });

    it("returns 404 AUTHORIZATION_DENIED when role is non-operational", async () => {
      const { fixture, token } = await harness.fixtureWithToken({
        role: "LOCATION_MANAGER",
      });
      const res = await harness.request(
        "GET",
        `/v1/staff/check-in/drafts?locationId=${fixture.locationId}`,
        { token },
      );
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
    });

    it("returns 404 LOCATION_ACCESS_DENIED when actor has no location access", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      await harness.context.adminPool.query(
        `DELETE FROM membership_location_access WHERE membership_id = $1`,
        [fixture.membershipId],
      );
      const res = await harness.request(
        "GET",
        `/v1/staff/check-in/drafts?locationId=${fixture.locationId}`,
        { token },
      );
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: "LOCATION_ACCESS_DENIED" });
    });

    it("returns 404 LOCATION_ACCESS_DENIED when actor has no active shift", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      await harness.context.adminPool.query(
        `UPDATE shifts SET status = 'ENDED', ended_at = transaction_timestamp() WHERE membership_id = $1`,
        [fixture.membershipId],
      );
      const res = await harness.request(
        "GET",
        `/v1/staff/check-in/drafts?locationId=${fixture.locationId}`,
        { token },
      );
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: "LOCATION_ACCESS_DENIED" });
    });

    it("returns 404 TENANT_ACCESS_DENIED when querying location in another org", async () => {
      const { token } = await harness.fixtureWithToken();
      const foreign = await harness.context.createFixture();
      const res = await harness.request(
        "GET",
        `/v1/staff/check-in/drafts?locationId=${foreign.locationId}`,
        { token },
      );
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: "TENANT_ACCESS_DENIED" });
    });
  });

  describe("Ownership & Role Scoping", () => {
    it("allows creator employee to discover own CHECKING_IN draft", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      const vehicleId = await harness.createVehicle(fixture, {
        color: "Midnight Blue",
        make: "Mercedes",
        model: "E300",
        plateCountry: "JO",
        plateNumberRaw: "77-88990",
      });
      const { sessionId } = await harness.createDraft(fixture, {
        checkInConditionCompletedAt: new Date("2026-08-21T18:00:00.000Z"),
        createdAt: new Date("2026-08-21T17:50:00.000Z"),
        vehicleId,
      });

      const res = await harness.request<{
        drafts: Array<{
          conditionCompletedAt: string | null;
          createdAt: string;
          sessionId: string;
          vehicle: {
            color: string | null;
            make: string | null;
            model: string | null;
            plateCountry: string | null;
            plateNumberRaw: string | null;
            temporaryDescriptor: string | null;
          };
        }>;
      }>("GET", `/v1/staff/check-in/drafts?locationId=${fixture.locationId}`, {
        token,
      });

      expect(res.status).toBe(200);
      expect(res.body.drafts).toHaveLength(1);
      expect(res.body.drafts[0]).toEqual({
        conditionCompletedAt: "2026-08-21T18:00:00.000Z",
        createdAt: "2026-08-21T17:50:00.000Z",
        sessionId,
        vehicle: {
          color: "Midnight Blue",
          make: "Mercedes",
          model: "E300",
          plateCountry: "JO",
          plateNumberRaw: "77-88990",
          temporaryDescriptor: null,
        },
      });
    });

    it("hides creator draft from peer employee at same location", async () => {
      const { fixture } = await harness.fixtureWithToken();
      await harness.createDraft(fixture);

      const peer = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
      const peerToken = `peer-token-${peer.userId}`;
      harness.principals.set(`Bearer ${peerToken}`, peer.userId);

      const res = await harness.request<{ drafts: unknown[] }>(
        "GET",
        `/v1/staff/check-in/drafts?locationId=${fixture.locationId}`,
        { token: peerToken },
      );

      expect(res.status).toBe(200);
      expect(res.body.drafts).toEqual([]);
    });

    it("hides employee draft from supervisor (no supervisor bypass)", async () => {
      const { fixture } = await harness.fixtureWithToken();
      await harness.createDraft(fixture);

      const sup = await harness.addMember(fixture, "VALET_SUPERVISOR", true);
      const supToken = `sup-token-${sup.userId}`;
      harness.principals.set(`Bearer ${supToken}`, sup.userId);

      const res = await harness.request<{ drafts: unknown[] }>(
        "GET",
        `/v1/staff/check-in/drafts?locationId=${fixture.locationId}`,
        { token: supToken },
      );

      expect(res.status).toBe(200);
      expect(res.body.drafts).toEqual([]);
    });

    it("allows supervisor to see own draft created by supervisor", async () => {
      const { fixture } = await harness.fixtureWithToken({
        role: "VALET_SUPERVISOR",
      });
      const { sessionId } = await harness.createDraft(fixture);

      const supToken = `sup-own-token-${fixture.userId}`;
      harness.principals.set(`Bearer ${supToken}`, fixture.userId);

      const res = await harness.request<{
        drafts: Array<{ sessionId: string }>;
      }>("GET", `/v1/staff/check-in/drafts?locationId=${fixture.locationId}`, {
        token: supToken,
      });

      expect(res.status).toBe(200);
      expect(res.body.drafts).toHaveLength(1);
      expect(res.body.drafts[0]?.sessionId).toBe(sessionId);
    });
  });
});
