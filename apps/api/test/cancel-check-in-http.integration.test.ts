import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStaffValetSessionHarness } from "./staff-valet-session-harness";

describe("Dedicated Check-In cancellation HTTP boundary", () => {
  const harness = createStaffValetSessionHarness();
  beforeAll(() => harness.start(), 120_000);
  afterAll(() => harness.close(), 60_000);
  it("strictly validates selectors, returns only terminal truth, preserves no-store and denies normal terminal detail", async () => {
    const { fixture, token } = await harness.fixtureWithToken();
    const { sessionId } = await harness.createSession(fixture);
    const shift = await harness.context.adminPool.query(
      "SELECT id FROM shifts WHERE membership_id=$1",
      [fixture.membershipId],
    );
    const body = {
      expectedVersion: 1,
      expectedShiftId: shift.rows[0].id as string,
    };
    const path = `/v1/staff/check-in/sessions/${sessionId}/cancel`;
    expect((await harness.request("POST", path, { body })).status).toBe(401);
    for (const invalid of [
      { ...body, organizationId: fixture.organizationId },
      { ...body, expectedVersion: 0 },
      { ...body, expectedShiftId: "invalid" },
    ])
      expect(
        (await harness.request("POST", path, { token, body: invalid })).status,
      ).toBe(400);
    const response = await fetch(`${harness.baseUrl()}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const terminal = {
      sessionId,
      locationId: fixture.locationId,
      state: "CANCELLED",
      version: 2,
    };
    expect(await response.json()).toEqual(terminal);
    expect((await harness.request("POST", path, { token, body })).body).toEqual(
      terminal,
    );
    const status = await fetch(
      `${harness.baseUrl()}/v1/staff/check-in/sessions/${sessionId}/cancel-status?expectedShiftId=${body.expectedShiftId}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(status.status).toBe(200);
    expect(status.headers.get("cache-control")).toContain("no-store");
    expect(await status.json()).toEqual(terminal);
    expect(
      (
        await harness.request("GET", `/v1/staff/valet-sessions/${sessionId}`, {
          token,
        })
      ).status,
    ).toBe(404);
  });
  it("negotiates only minimal v2 action hints while both old strict directory shapes remain exact", async () => {
    const { fixture, token } = await harness.fixtureWithToken({
      role: "VALET_SUPERVISOR",
    });
    const own = await harness.createSession(fixture);
    const other = await harness.addMember(fixture);
    const foreign = await harness.createSession({ ...fixture, ...other });
    const path = `/v1/staff/valet-sessions/directory?locationId=${fixture.locationId}`;
    for (const capability of [
      undefined,
      "key-slot-visibility-v1",
      "check-in-actions-v2",
    ]) {
      const response = await harness.request<{
        rows: Record<string, unknown>[];
      }>("GET", path, {
        token,
        ...(capability
          ? { headers: { "Valet-Vehicle-Directory-Capability": capability } }
          : {}),
      });
      expect(response.status).toBe(200);
      const row = response.body.rows.find(
        (item) => item.sessionId === own.sessionId,
      )!;
      if (capability === "check-in-actions-v2") {
        expect(row).toMatchObject({
          canContinueCheckIn: true,
          canCancelCheckIn: true,
        });
        expect(
          response.body.rows.find(
            (item) => item.sessionId === foreign.sessionId,
          ),
        ).toMatchObject({ canContinueCheckIn: false, canCancelCheckIn: false });
      } else {
        expect(row).not.toHaveProperty("canContinueCheckIn");
        expect(row).not.toHaveProperty("canCancelCheckIn");
      }
      expect(row).not.toHaveProperty("membershipId");
      expect(row).not.toHaveProperty("version");
      if (!capability) expect(row).not.toHaveProperty("keySlotVisibility");
    }
  });
});
