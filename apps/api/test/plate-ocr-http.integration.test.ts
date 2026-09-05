import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PlateOcrHttpContext } from "./plate-ocr-http-context";

const c = new PlateOcrHttpContext();
beforeAll(() => c.start(), 120000);
afterAll(() => c.stop(), 30000);
beforeEach(() => c.reset());
describe("authenticated OCR HTTP route with real persisted authority", () => {
  it("derives cost identity from persisted authority and calls provider once", async () => {
    const staff = await c.staff();
    const acquire = vi.spyOn(c.guard, "acquire");
    const response = await c.request(staff.token, {
      targetLocationId: staff.locationId,
      plateCountry: "JO",
    });
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await response.json()).toEqual({ status: "NO_MATCH" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(acquire).toHaveBeenCalledExactlyOnceWith({
      organizationId: staff.organizationId,
      membershipId: staff.membershipId,
      targetLocationId: staff.locationId,
    });
    expect(c.calls).toBe(1);
    for (const table of [
      "vehicles",
      "customers",
      "valet_sessions",
      "audit_events",
      "anti_abuse_events",
    ])
      expect(
        (await c.admin.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]
          .n,
      ).toBe(0);
  });
  it.each([undefined, "invalid", `vsa1.${"x".repeat(43)}`])(
    "rejects invalid credentials before provider %s",
    async (token) => {
      const staff = await c.staff();
      expect(
        (
          await c.request(token, {
            targetLocationId: staff.locationId,
            plateCountry: "JO",
          })
        ).status,
      ).toBe(401);
      expect(c.calls).toBe(0);
    },
  );
  it.each([
    "disabled",
    "revoked",
    "membership",
    "org",
    "location",
    "access",
    "role",
    "shift",
  ])("denies current %s ineligibility before provider", async (reason) => {
    const staff = await c.staff();
    const updates: Record<string, [string, string]> = {
      disabled: [
        "UPDATE users SET status = 'DISABLED' WHERE id = $1",
        staff.userId,
      ],
      revoked: [
        "UPDATE staff_auth_sessions SET revoked_at = clock_timestamp() WHERE user_id = $1",
        staff.userId,
      ],
      membership: [
        "UPDATE organization_memberships SET status = 'INACTIVE' WHERE id = $1",
        staff.membershipId,
      ],
      org: [
        "UPDATE organizations SET status = 'INACTIVE' WHERE id = $1",
        staff.organizationId,
      ],
      location: [
        "UPDATE locations SET status = 'INACTIVE' WHERE id = $1",
        staff.locationId,
      ],
      access: [
        "DELETE FROM membership_location_access WHERE membership_id = $1",
        staff.membershipId,
      ],
      role: [
        "UPDATE organization_memberships SET role = 'ORG_ADMIN' WHERE id = $1",
        staff.membershipId,
      ],
      shift: [
        "UPDATE shifts SET status = 'ENDED', ended_at = clock_timestamp() WHERE membership_id = $1",
        staff.membershipId,
      ],
    };
    const [sql, id] = updates[reason]!;
    await c.admin.query(sql, [id]);
    const response = await c.request(staff.token, {
      targetLocationId: staff.locationId,
      plateCountry: "JO",
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(c.calls).toBe(0);
  });
  it("denies cross-tenant, missing shift and wrong-location shift", async () => {
    const a = await c.staff();
    const b = await c.staff(false);
    const otherLocation = await c.addLocation(a);
    for (const [token, targetLocationId] of [
      [a.token, b.locationId],
      [b.token, b.locationId],
      [a.token, otherLocation],
    ]) {
      const response = await c.request(token, {
        targetLocationId: targetLocationId!,
        plateCountry: "JO",
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    }
    expect(c.calls).toBe(0);
  });
  it("rejects invalid metadata and client authority fields", async () => {
    const staff = await c.staff();
    const valid = { targetLocationId: staff.locationId, plateCountry: "JO" };
    for (const fields of [
      { ...valid, targetLocationId: "bad" },
      { ...valid, plateCountry: "US" },
      ...["organizationId", "membershipId", "userId", "role", "shiftId"].map(
        (key) => ({ ...valid, [key]: "forged" }),
      ),
    ]) {
      expect((await c.request(staff.token, fields)).status).toBe(400);
    }
    expect(c.calls).toBe(0);
  });
  it("rejects wrong/oversize/invalid media and JSON before provider cost", async () => {
    const staff = await c.staff();
    const fields = { targetLocationId: staff.locationId, plateCountry: "JO" };
    for (const [bytes, type] of [
      [new Uint8Array([1, 2, 3, 4]), "image/jpeg"],
      [new Uint8Array([255, 216, 255, 217]), "image/png"],
      [new Uint8Array(1048577), "image/jpeg"],
    ] as const) {
      const response = await c.request(staff.token, fields, bytes, type);
      expect([400, 413]).toContain(response.status);
    }
    expect(
      (
        await fetch(`${c.origin}/v1/staff/check-in/plate-ocr`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${staff.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(fields),
        })
      ).status,
    ).toBe(400);
    expect(c.calls).toBe(0);
  });
  it("production fails closed even with configured provider credentials", async () => {
    c.reset("production");
    vi.stubEnv("PLATE_OCR_ENDPOINT", "https://ocr.example.test/read");
    vi.stubEnv("PLATE_OCR_TOKEN", "test-only-secret");
    try {
      const staff = await c.staff();
      const response = await c.request(staff.token, {
        targetLocationId: staff.locationId,
        plateCountry: "JO",
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "UNAVAILABLE" });
      expect(c.calls).toBe(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("denies concurrent provider I/O and exhausted bursts with UNAVAILABLE", async () => {
    const staff = await c.staff();
    const fields = { targetLocationId: staff.locationId, plateCountry: "JO" };
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let finish!: () => void;
    c.result = () =>
      new Promise((resolve) => {
        entered();
        finish = () => resolve({ status: "NO_MATCH" });
      });
    const first = c.request(staff.token, fields);
    await started;
    expect(await (await c.request(staff.token, fields)).json()).toEqual({
      status: "UNAVAILABLE",
    });
    expect(c.calls).toBe(1);
    finish();
    await first;
    c.result = async () => ({ status: "NO_MATCH" });
    for (let i = 0; i < 4; i++) await c.request(staff.token, fields);
    expect(await (await c.request(staff.token, fields)).json()).toEqual({
      status: "UNAVAILABLE",
    });
    expect(c.calls).toBe(5);
  });
});
