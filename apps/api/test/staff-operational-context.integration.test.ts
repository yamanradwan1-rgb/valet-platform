import { randomUUID } from "node:crypto";

import {
  MiddlewareConsumer,
  Module,
  type INestApplication,
  type NestModule,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { RUNTIME_POSTGRES_POOL } from "../src/common/database/runtime-database.module";
import { RequestIdMiddleware } from "../src/common/http/api-request";
import { HttpInfrastructureModule } from "../src/common/http/http-infrastructure.module";
import {
  FailClosedStaffPrincipalResolver,
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../src/modules/auth/staff-principal";
import { StaffOperationalContextController } from "../src/modules/staff/staff-operational-context.controller";
import { StaffOperationalContextService } from "../src/modules/staff/staff-operational-context.service";
import { ShiftTestContext } from "./shift-test-context";

interface HttpResult {
  readonly body: Record<string, unknown>;
  readonly status: number;
}

const context = new ShiftTestContext("operational-context");
const principals = new Map<string, string>();
const principalResolver: StaffPrincipalResolver = {
  async resolve(authorization) {
    const userId =
      authorization === undefined ? undefined : principals.get(authorization);
    return userId === undefined
      ? new FailClosedStaffPrincipalResolver().resolve(authorization)
      : { userId };
  },
};

let app: INestApplication;
let baseUrl: string;

@Module({
  controllers: [StaffOperationalContextController],
  imports: [HttpInfrastructureModule],
  providers: [
    StaffOperationalContextService,
    { provide: RUNTIME_POSTGRES_POOL, useFactory: () => context.runtimePool },
    { provide: STAFF_PRINCIPAL_RESOLVER, useValue: principalResolver },
  ],
})
class TestStaffModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes(StaffOperationalContextController);
  }
}

async function request(
  token?: string,
  extraHeaders?: Record<string, string>,
): Promise<HttpResult> {
  const headers: Record<string, string> = { ...extraHeaders };
  if (token !== undefined) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}/v1/staff/operational-context`, {
    headers,
  });
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = { raw: text };
  }
  return { body, status: response.status };
}

describe("Staff Operational Context Read API", () => {
  beforeAll(async () => {
    await context.setup();
    app = await NestFactory.create(TestStaffModule, { logger: false });
    await app.listen(0);
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${String(address.port)}`;
  }, 60_000);

  afterAll(async () => {
    if (app !== undefined) {
      await app.close();
    }
    await context.teardown();
  }, 60_000);

  beforeEach(() => {
    principals.clear();
  });

  it("rejects unauthenticated and invalid requests with 401", async () => {
    expect((await request()).status).toBe(401);
    expect((await request("invalid-token-123")).status).toBe(401);
  });

  it("returns operational context for active VALET_EMPLOYEE with active shift", async () => {
    const fixture = await context.createFixture({ role: "VALET_EMPLOYEE" });
    const shiftId = randomUUID();
    await context.adminPool.query(
      `INSERT INTO shifts (id, organization_id, location_id, membership_id, status, started_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', NOW())`,
      [
        shiftId,
        fixture.organizationId,
        fixture.locationId,
        fixture.membershipId,
      ],
    );

    const token = `token-${randomUUID()}`;
    principals.set(`Bearer ${token}`, fixture.userId);

    const auditBefore = await context.countAudit(shiftId);
    const res = await request(token);
    expect(res.status).toBe(200);
    const contexts = res.body.contexts as Array<Record<string, unknown>>;
    expect(contexts).toHaveLength(1);

    const ctx = contexts[0]!;
    expect(ctx.membershipId).toBe(fixture.membershipId);
    expect(ctx.role).toBe("VALET_EMPLOYEE");
    expect(ctx.activeShift).toMatchObject({
      locationId: fixture.locationId,
      shiftId,
      status: "ACTIVE",
    });
    expect(ctx.currentLocation).toMatchObject({
      locationId: fixture.locationId,
    });
    expect(ctx.eligibleLocations).toHaveLength(1);
    expect(res.body.user).toBeUndefined();
    expect(res.body.email).toBeUndefined();

    // Invariant: GET has no mutation side effects
    expect(await context.countAudit(shiftId)).toBe(auditBefore);
  });

  it("returns operational context without active shift when no shift started", async () => {
    const fixture = await context.createFixture({ role: "VALET_SUPERVISOR" });
    const token = `token-${randomUUID()}`;
    principals.set(`Bearer ${token}`, fixture.userId);

    const res = await request(token);
    expect(res.status).toBe(200);
    const contexts = res.body.contexts as Array<Record<string, unknown>>;
    expect(contexts).toHaveLength(1);

    const ctx = contexts[0]!;
    expect(ctx.membershipId).toBe(fixture.membershipId);
    expect(ctx.role).toBe("VALET_SUPERVISOR");
    expect(ctx.activeShift).toBeNull();
    expect(ctx.currentLocation).toBeNull();
    expect(ctx.eligibleLocations).toHaveLength(1);
  });

  it("denies LOCATION_MANAGER, ORG_ADMIN, inactive memberships, and inactive orgs with 404", async () => {
    const mgr = await context.createFixture({ role: "LOCATION_MANAGER" });
    principals.set(`Bearer mgr`, mgr.userId);
    expect((await request("mgr")).status).toBe(404);

    const admin = await context.createFixture({ role: "ORG_ADMIN" });
    principals.set(`Bearer admin`, admin.userId);
    expect((await request("admin")).status).toBe(404);

    const inactMem = await context.createFixture({
      membershipStatus: "INACTIVE",
    });
    principals.set(`Bearer inactMem`, inactMem.userId);
    expect((await request("inactMem")).status).toBe(404);

    const inactOrg = await context.createFixture({
      organizationStatus: "INACTIVE",
    });
    principals.set(`Bearer inactOrg`, inactOrg.userId);
    expect((await request("inactOrg")).status).toBe(404);
  });

  it("supports multi-org users with independent active shifts in each context", async () => {
    const f1 = await context.createFixture({ role: "VALET_EMPLOYEE" });
    const f2 = await context.createFixture(
      { role: "VALET_SUPERVISOR" },
      f1.userId,
    );

    const shift1 = randomUUID();
    const shift2 = randomUUID();
    await context.adminPool.query(
      `INSERT INTO shifts (id, organization_id, location_id, membership_id, status, started_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', NOW()), ($5, $6, $7, $8, 'ACTIVE', NOW())`,
      [
        shift1,
        f1.organizationId,
        f1.locationId,
        f1.membershipId,
        shift2,
        f2.organizationId,
        f2.locationId,
        f2.membershipId,
      ],
    );

    const token = `multi-${randomUUID()}`;
    principals.set(`Bearer ${token}`, f1.userId);

    const res = await request(token);
    expect(res.status).toBe(200);
    const contexts = res.body.contexts as Array<Record<string, unknown>>;
    expect(contexts).toHaveLength(2);

    const ctx1 = contexts.find((c) => c.membershipId === f1.membershipId)!;
    const ctx2 = contexts.find((c) => c.membershipId === f2.membershipId)!;

    expect(ctx1.activeShift).toMatchObject({ shiftId: shift1 });
    expect(ctx1.currentLocation).toMatchObject({ locationId: f1.locationId });
    expect(ctx2.activeShift).toMatchObject({ shiftId: shift2 });
    expect(ctx2.currentLocation).toMatchObject({ locationId: f2.locationId });
  });

  it("supports multi-location membership and excludes inactive locations", async () => {
    const fixture = await context.createFixture({ role: "VALET_EMPLOYEE" });
    const secondLocId = await context.addLocation(fixture);

    const inactiveLoc = randomUUID();
    await context.adminPool.query(
      `INSERT INTO locations (id, organization_id, name, code, address_text, timezone, currency, status, updated_at)
       VALUES ($1, $2, 'Inactive Loc', 'INACT', 'Addr', 'UTC', 'USD', 'INACTIVE', NOW())`,
      [inactiveLoc, fixture.organizationId],
    );
    await context.adminPool.query(
      `INSERT INTO membership_location_access (organization_id, membership_id, location_id)
       VALUES ($1, $2, $3)`,
      [fixture.organizationId, fixture.membershipId, inactiveLoc],
    );

    const token = `token-${randomUUID()}`;
    principals.set(`Bearer ${token}`, fixture.userId);

    const res = await request(token);
    expect(res.status).toBe(200);
    const ctx = (res.body.contexts as Array<Record<string, unknown>>)[0]!;
    const eligibleIds = (
      ctx.eligibleLocations as Array<{ locationId: string }>
    ).map((l) => l.locationId);
    expect(eligibleIds).toContain(fixture.locationId);
    expect(eligibleIds).toContain(secondLocId);
    expect(eligibleIds).not.toContain(inactiveLoc);
  });
});
