import { randomBytes, randomUUID } from "node:crypto";

import { MiddlewareConsumer, Module, type INestApplication, type NestModule } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RUNTIME_POSTGRES_POOL } from "../src/common/database/runtime-database.module";
import { RequestIdMiddleware } from "../src/common/http/api-request";
import { HttpInfrastructureModule } from "../src/common/http/http-infrastructure.module";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { AntiAbuseService } from "../src/modules/anti-abuse/anti-abuse.service";
import { TrustedClientAddressResolver } from "../src/modules/anti-abuse/client-address";
import { GuestAccessService } from "../src/modules/guest-access/guest-access.service";
import { GuestBrowserSessionService } from "../src/modules/guest-access/guest-browser-session.service";
import { GuestAuthOriginPolicy } from "../src/modules/guest-access/guest-browser-transport";
import { GuestCredentialAuthorizer } from "../src/modules/guest-access/guest-credential-authorizer";
import { GuestInformationController } from "../src/modules/guest-access/guest-information.controller";
import { GuestInformationService } from "../src/modules/guest-access/guest-information.service";
import { GuestRequestAdmission } from "../src/modules/guest-access/guest-request-admission";
import { createIssueGuestAccessCommandExecutor } from "../src/modules/valet-sessions/guest-access-command";
import { createSessionHelper, createVehicleHelper } from "./staff-valet-session-fixture-helpers";
import { ShiftTestContext } from "./shift-test-context";

const context = new ShiftTestContext("issue316_guest_persisted_http");
let app: INestApplication;
let origin = "";
let previousSecret: string | undefined;

@Module({
  imports: [HttpInfrastructureModule],
  controllers: [GuestInformationController],
  providers: [
    AntiAbuseKeyDeriver, AntiAbuseService, TrustedClientAddressResolver,
    GuestAccessService, GuestBrowserSessionService, GuestAuthOriginPolicy,
    GuestCredentialAuthorizer, GuestRequestAdmission,
    GuestInformationService,
    { provide: RUNTIME_POSTGRES_POOL, useFactory: () => context.runtimePool },
  ],
})
class GuestInformationPersistedTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes(GuestInformationController);
  }
}

beforeAll(async () => {
  await context.setup();
  previousSecret = process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
  process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = randomBytes(32).toString("base64url");
  app = await NestFactory.create(GuestInformationPersistedTestModule, {
    logger: false, abortOnError: false,
  });
  await app.listen(0, "127.0.0.1");
  origin = await app.getUrl();
}, 120_000);
afterAll(async () => {
  if (app) await app.close();
  if (previousSecret === undefined) delete process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
  else process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = previousSecret;
  await context.teardown();
}, 60_000);

async function get(token: string, query: string) {
  const response = await fetch(`${origin}/v1/guest/information${query}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return {
    status: response.status,
    headers: response.headers,
    body: (await response.json()) as Record<string, unknown>,
  };
}

describe("#316 real Guest bearer HTTP → PostgreSQL publication", () => {
  it("reads only its persisted Location snapshot; excludes drafts and blocks revoked credentials", async () => {
    const fixture = await context.createFixture();
    const vehicleId = await createVehicleHelper(context, fixture, {
      color: "Blue", make: "Toyota", model: "Camry",
      temporaryDescriptor: "Issue316 guest HTTP proof",
    });
    const sessionId = await createSessionHelper(context, fixture, vehicleId, {
      state: "PARKED",
    });
    const issued = await createIssueGuestAccessCommandExecutor(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      intent: "ISSUE_OR_ROTATE",
      valetSessionId: sessionId,
    });
    const adminUserId = randomUUID();
    const adminMembershipId = randomUUID();
    await context.adminPool.query(
      `INSERT INTO users(id,email,password_hash,status,updated_at)
       VALUES($1,$2,'not-a-real-password-hash','ACTIVE',clock_timestamp())`,
      [adminUserId, `${adminUserId}@issue316.invalid`],
    );
    await context.adminPool.query(
      `INSERT INTO organization_memberships
         (id,organization_id,user_id,role,status,updated_at)
       VALUES($1,$2,$3,'ORG_ADMIN','ACTIVE',clock_timestamp())`,
      [adminMembershipId, fixture.organizationId, adminUserId],
    );

    const locationTwo = await context.addLocation(fixture);
    const alternate = await context.runtimePool.query(
      `SELECT guest_information_save_privacy($1,$2,$3,$4,$5,$6,$7,0)`,
      [adminMembershipId, fixture.organizationId, locationTwo,
        "Other Location secret", "", "", ""],
    );
    expect(alternate.rowCount).toBe(1);
    await context.runtimePool.query(
      `SELECT guest_information_publish_privacy($1,$2,$3,1)`,
      [adminMembershipId, fixture.organizationId, locationTwo],
    );

    await context.runtimePool.query(
      `SELECT guest_information_save_privacy($1,$2,$3,$4,$5,$6,$7,0)`,
      [adminMembershipId, fixture.organizationId, fixture.locationId,
        "Public approved English", "", "", ""],
    );
    await context.runtimePool.query(
      `SELECT guest_information_publish_privacy($1,$2,$3,1)`,
      [adminMembershipId, fixture.organizationId, fixture.locationId],
    );
    await context.runtimePool.query(
      `SELECT guest_information_save_privacy($1,$2,$3,$4,$5,$6,$7,2)`,
      [adminMembershipId, fixture.organizationId, fixture.locationId,
        "UNPUBLISHED DRAFT SECRET", "", "مسودة خاصة", ""],
    );

    const en = await get(issued.rawToken, "?locale=en");
    expect(en.status).toBe(200);
    expect(en.body).toMatchObject({
      locale: "en", privacy: {
        status: "PUBLISHED", text: "Public approved English", version: 1,
      },
    });
    expect(en.headers.get("cache-control")).toContain("no-store");
    expect(JSON.stringify(en.body)).not.toMatch(/UNPUBLISHED DRAFT|مسودة خاصة|Other Location/);
    const ar = await get(issued.rawToken, "?locale=ar");
    expect(ar).toMatchObject({
      status: 200, body: { locale: "ar", privacy: { status: "UNAVAILABLE", text: null } },
    });
    expect((await get(issued.rawToken, `?locale=en&locationId=${locationTwo}`)).status).toBe(400);

    await context.adminPool.query(
      `UPDATE valet_sessions SET customer_access_revoked_at=clock_timestamp()
       WHERE id=$1`, [sessionId],
    );
    const revoked = await get(issued.rawToken, "?locale=en");
    expect(revoked).toMatchObject({ status: 401, body: { code: "GUEST_ACCESS_INVALID" } });
    expect(JSON.stringify(revoked.body)).not.toContain("Public approved English");
  }, 30_000);
});
