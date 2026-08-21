import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createOperationalContextHarness,
  fetchContext,
  fetchContextRawDuplicateAuth,
  insertActiveShift,
  registerToken,
} from "./staff-operational-context-harness";

const harness = createOperationalContextHarness();

describe("Staff Operational Context Read API", () => {
  beforeAll(async () => harness.start(), 60_000);
  afterAll(async () => harness.close(), 60_000);
  beforeEach(() => harness.principals.clear());

  it("rejects unauthenticated and invalid requests with 401", async () => {
    expect((await fetchContext(harness.baseUrl())).status).toBe(401);
    expect((await fetchContext(harness.baseUrl(), "bad")).status).toBe(401);
  });

  it("returns context with active shift for VALET_EMPLOYEE", async () => {
    const f = await harness.context.createFixture({ role: "VALET_EMPLOYEE" });
    const shiftId = await insertActiveShift(harness, f);
    const token = registerToken(harness.principals, f.userId);
    const auditBefore = await harness.context.countAudit(shiftId);
    const res = await fetchContext(harness.baseUrl(), token);
    expect(res.status).toBe(200);
    const ctx = (res.body.contexts as Array<Record<string, unknown>>)[0]!;
    expect(ctx.role).toBe("VALET_EMPLOYEE");
    expect(ctx.activeShift).toMatchObject({
      locationId: f.locationId,
      shiftId,
      status: "ACTIVE",
    });
    expect(ctx.currentLocation).toMatchObject({ locationId: f.locationId });
    expect(ctx.eligibleLocations).toHaveLength(1);
    expect(await harness.context.countAudit(shiftId)).toBe(auditBefore);
  });

  it("returns activeShift:null when no shift started", async () => {
    const f = await harness.context.createFixture({ role: "VALET_SUPERVISOR" });
    const token = registerToken(harness.principals, f.userId);
    const res = await fetchContext(harness.baseUrl(), token);
    expect(res.status).toBe(200);
    const ctx = (res.body.contexts as Array<Record<string, unknown>>)[0]!;
    expect(ctx.activeShift).toBeNull();
    expect(ctx.currentLocation).toBeNull();
    expect(ctx.eligibleLocations).toHaveLength(1);
  });

  it("denies non-operational roles and inactive memberships/orgs", async () => {
    for (const opts of [
      { role: "LOCATION_MANAGER" as const },
      { role: "ORG_ADMIN" as const },
      { membershipStatus: "INACTIVE" as const },
      { organizationStatus: "INACTIVE" as const },
    ]) {
      const f = await harness.context.createFixture(opts);
      const t = registerToken(harness.principals, f.userId);
      expect((await fetchContext(harness.baseUrl(), t)).status).toBe(404);
    }
  });

  it("supports multi-org with independent active shifts", async () => {
    const f1 = await harness.context.createFixture({ role: "VALET_EMPLOYEE" });
    const f2 = await harness.context.createFixture(
      { role: "VALET_SUPERVISOR" },
      f1.userId,
    );
    const s1 = await insertActiveShift(harness, f1);
    const s2 = await insertActiveShift(harness, f2);
    const token = registerToken(harness.principals, f1.userId);
    const res = await fetchContext(harness.baseUrl(), token);
    expect(res.status).toBe(200);
    const ctxs = res.body.contexts as Array<Record<string, unknown>>;
    expect(ctxs).toHaveLength(2);
    expect(
      ctxs.find((c) => c.membershipId === f1.membershipId)!.activeShift,
    ).toMatchObject({ shiftId: s1 });
    expect(
      ctxs.find((c) => c.membershipId === f2.membershipId)!.activeShift,
    ).toMatchObject({ shiftId: s2 });
  });

  it("excludes inactive locations from eligibleLocations", async () => {
    const f = await harness.context.createFixture({ role: "VALET_EMPLOYEE" });
    const loc2 = await harness.context.addLocation(f);
    const inactiveLoc = randomUUID();
    await harness.context.adminPool.query(
      `INSERT INTO locations (id, organization_id, name, code, address_text, timezone, currency, status, updated_at)
       VALUES ($1, $2, 'Inactive', 'INACT', 'Addr', 'UTC', 'USD', 'INACTIVE', NOW())`,
      [inactiveLoc, f.organizationId],
    );
    await harness.context.adminPool.query(
      `INSERT INTO membership_location_access (organization_id, membership_id, location_id) VALUES ($1, $2, $3)`,
      [f.organizationId, f.membershipId, inactiveLoc],
    );
    const token = registerToken(harness.principals, f.userId);
    const res = await fetchContext(harness.baseUrl(), token);
    expect(res.status).toBe(200);
    const ids = (
      (res.body.contexts as Array<Record<string, unknown>>)[0]!
        .eligibleLocations as Array<{ locationId: string }>
    ).map((l) => l.locationId);
    expect(ids).toContain(f.locationId);
    expect(ids).toContain(loc2);
    expect(ids).not.toContain(inactiveLoc);
  });

  it("fails closed when ACTIVE shift location access is revoked", async () => {
    const f = await harness.context.createFixture({ role: "VALET_EMPLOYEE" });
    await insertActiveShift(harness, f);
    await harness.context.adminPool.query(
      `DELETE FROM membership_location_access WHERE organization_id=$1 AND membership_id=$2 AND location_id=$3`,
      [f.organizationId, f.membershipId, f.locationId],
    );
    const token = registerToken(harness.principals, f.userId);
    const res = await fetchContext(harness.baseUrl(), token);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("AUTHORIZATION_DENIED");
    expect(res.body.contexts).toBeUndefined();
  });

  it("fails closed when ACTIVE shift location becomes INACTIVE", async () => {
    const f = await harness.context.createFixture({ role: "VALET_EMPLOYEE" });
    await insertActiveShift(harness, f);
    await harness.context.adminPool.query(
      `UPDATE locations SET status = 'INACTIVE' WHERE id = $1`,
      [f.locationId],
    );
    const token = registerToken(harness.principals, f.userId);
    const res = await fetchContext(harness.baseUrl(), token);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("AUTHORIZATION_DENIED");
    expect(res.body.contexts).toBeUndefined();
  });

  it("rejects duplicate Authorization headers", async () => {
    const f = await harness.context.createFixture({ role: "VALET_EMPLOYEE" });
    const token = registerToken(harness.principals, f.userId);
    const res = await fetchContextRawDuplicateAuth(harness.baseUrl(), token);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.body.contexts).toBeUndefined();
  });

  it("returns contexts in deterministic order", async () => {
    const f1 = await harness.context.createFixture({ role: "VALET_EMPLOYEE" });
    await harness.context.createFixture(
      { role: "VALET_SUPERVISOR" },
      f1.userId,
    );
    const token = registerToken(harness.principals, f1.userId);
    const res = await fetchContext(harness.baseUrl(), token);
    expect(res.status).toBe(200);
    const ctxs = res.body.contexts as Array<{
      membershipId: string;
      organization: { organizationId: string };
    }>;
    const keys = ctxs.map(
      (c) => `${c.organization.organizationId}|${c.membershipId}`,
    );
    expect(keys).toEqual([...keys].sort());
  });

  it("returns eligibleLocations in deterministic order by locationId", async () => {
    const f = await harness.context.createFixture({ role: "VALET_EMPLOYEE" });
    await harness.context.addLocation(f);
    await harness.context.addLocation(f);
    const token = registerToken(harness.principals, f.userId);
    const res = await fetchContext(harness.baseUrl(), token);
    expect(res.status).toBe(200);
    const ids = (
      (res.body.contexts as Array<Record<string, unknown>>)[0]!
        .eligibleLocations as Array<{ locationId: string }>
    ).map((l) => l.locationId);
    expect(ids.length).toBe(3);
    expect(ids).toEqual([...ids].sort());
  });

  it("does not include ungranted same-org active locations", async () => {
    const f = await harness.context.createFixture({ role: "VALET_EMPLOYEE" });
    const ungrantedLoc = randomUUID();
    await harness.context.adminPool.query(
      `INSERT INTO locations (id, organization_id, name, code, address_text, timezone, currency, status, updated_at)
       VALUES ($1, $2, 'Ungranted', $3, 'Addr', 'UTC', 'USD', 'ACTIVE', NOW())`,
      [ungrantedLoc, f.organizationId, randomUUID()],
    );
    const token = registerToken(harness.principals, f.userId);
    const res = await fetchContext(harness.baseUrl(), token);
    expect(res.status).toBe(200);
    const ids = (
      (res.body.contexts as Array<Record<string, unknown>>)[0]!
        .eligibleLocations as Array<{ locationId: string }>
    ).map((l) => l.locationId);
    expect(ids).toContain(f.locationId);
    expect(ids).not.toContain(ungrantedLoc);
  });

  it("does not expose PII, auth, or financial fields", async () => {
    const f = await harness.context.createFixture({ role: "VALET_EMPLOYEE" });
    await insertActiveShift(harness, f);
    const token = registerToken(harness.principals, f.userId);
    const res = await fetchContext(harness.baseUrl(), token);
    expect(res.status).toBe(200);
    const forbidden = [
      "email",
      "phone",
      "displayName",
      "initials",
      "password",
      "passwordHash",
      "password_hash",
      "accessToken",
      "refreshToken",
      "sessionId",
      "userId",
      "user_id",
      "user",
      "amount",
      "balance",
      "payment",
      "financial",
    ];
    const body = res.body as Record<string, unknown>;
    for (const key of forbidden) expect(body[key]).toBeUndefined();
    for (const ctx of body.contexts as Array<Record<string, unknown>>) {
      for (const key of forbidden) expect(ctx[key]).toBeUndefined();
    }
    const full = JSON.stringify(res.body);
    expect(full).not.toContain("@val-005b.test");
    expect(full).not.toContain("not-a-real-password-hash");
  });

  it("fails whole request when any multi-org membership has inconsistent shift", async () => {
    const f1 = await harness.context.createFixture({ role: "VALET_EMPLOYEE" });
    const f2 = await harness.context.createFixture(
      { role: "VALET_SUPERVISOR" },
      f1.userId,
    );
    await insertActiveShift(harness, f2);
    await harness.context.adminPool.query(
      `DELETE FROM membership_location_access WHERE organization_id=$1 AND membership_id=$2 AND location_id=$3`,
      [f2.organizationId, f2.membershipId, f2.locationId],
    );
    const token = registerToken(harness.principals, f1.userId);
    const res = await fetchContext(harness.baseUrl(), token);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("AUTHORIZATION_DENIED");
    expect(res.body.contexts).toBeUndefined();
  });
});
