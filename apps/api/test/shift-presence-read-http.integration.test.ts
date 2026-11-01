import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { presenceHttp } from "./shift-presence-http-test-helper";

const db = new PresenceServerTestContext("issue406-read-http");
let http: Awaited<ReturnType<typeof presenceHttp>>;
beforeAll(async () => {
  await db.setup();
  http = await presenceHttp(db);
}, 120_000);
afterAll(async () => {
  await http?.app.close();
  await db.teardown();
}, 60_000);

describe("Issue 406: real HTTP busy and denial contracts stay concealed", () => {
  it("bounded contention returns the original 409 contract without internal origin; fresh Retry reads zones", async () => {
    const f = await db.createFixture();
    const manager = await db.manager(f, "LOCATION_MANAGER");
    const zoneId = await db.zone(f);
    const base = `/v1/staff/dashboard/locations/${f.locationId}/configuration/shift-presence`;
    const holder = await db.adminPool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('staff-management-org:'||$1::text,0))",
        [f.organizationId],
      );
      const response = await http.request(
        "GET",
        `${base}/policy`,
        manager.token,
      );
      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        code: "PRESENCE_AUTHORITY_BUSY",
        message:
          "The presence action cannot proceed. Refresh its current result.",
        requestId: expect.any(String),
      });
      expect(response.headers.get("cache-control")).toContain("no-store");
    } finally {
      await holder.query("ROLLBACK");
      holder.release();
    }
    const policy = await http.request("GET", `${base}/policy`, manager.token);
    expect(policy.status).toBe(200);
    expect(policy.body).toMatchObject({
      locationId: f.locationId,
      capabilities: { canEdit: true },
    });
    const zones = await http.request("GET", `${base}/zones`, manager.token);
    expect(zones.status).toBe(200);
    expect(zones.body).toMatchObject({ items: [{ id: zoneId }] });
  });

  it("a genuine foreign Location and a revoked session remain denied", async () => {
    const f = await db.createFixture();
    const other = await db.createFixture();
    const manager = await db.manager(f, "LOCATION_MANAGER");
    const path = (id: string) =>
      `/v1/staff/dashboard/locations/${id}/configuration/shift-presence/policy`;
    const foreign = await http.request(
      "GET",
      path(other.locationId),
      manager.token,
    );
    expect(foreign.status).toBe(404);
    expect(foreign.body.code).toBe("AUTHORIZATION_DENIED");
    await db.adminPool.query(
      "UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1",
      [manager.context.staffAuthSessionId],
    );
    const revoked = await http.request(
      "GET",
      path(f.locationId),
      manager.token,
    );
    expect(revoked.status).toBe(401);
    expect(revoked.body.code).not.toBe("PRESENCE_AUTHORITY_BUSY");
  });
});
