import {
  MiddlewareConsumer,
  Module,
  type INestApplication,
  type NestModule,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, expect, it } from "vitest";
import { RUNTIME_POSTGRES_POOL } from "../src/common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../src/common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../src/common/http/api-request";
import {
  DatabaseStaffPrincipalResolver,
  DatabaseStaffSessionContextResolver,
  STAFF_SESSION_CONTEXT_RESOLVER,
} from "../src/modules/auth/staff-session-context";
import { STAFF_PRINCIPAL_RESOLVER } from "../src/modules/auth/staff-principal";
import { RouteHistoryController } from "../src/modules/tracking/route-history.controller";
import { RouteHistoryService } from "../src/modules/tracking/route-history.service";
import { TaskRouteRecordingsController } from "../src/modules/tracking/task-route-recordings.controller";
import { TaskRouteRecordingsService } from "../src/modules/tracking/task-route-recordings.service";
import { TaskRouteTestContext } from "./task-route-test-context";

const context = new TaskRouteTestContext("http");
let app: INestApplication;
let baseUrl: string;
@Module({
  controllers: [TaskRouteRecordingsController, RouteHistoryController],
  imports: [HttpInfrastructureModule],
  providers: [
    TaskRouteRecordingsService,
    RouteHistoryService,
    { provide: RUNTIME_POSTGRES_POOL, useFactory: () => context.runtimePool },
    {
      provide: STAFF_SESSION_CONTEXT_RESOLVER,
      useFactory: () =>
        new DatabaseStaffSessionContextResolver(context.runtimePool),
    },
    {
      provide: STAFF_PRINCIPAL_RESOLVER,
      useFactory: () =>
        new DatabaseStaffPrincipalResolver(
          new DatabaseStaffSessionContextResolver(context.runtimePool),
        ),
    },
  ],
})
class TestModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes(TaskRouteRecordingsController, RouteHistoryController);
  }
}
beforeAll(async () => {
  await context.setup();
  app = await NestFactory.create(TestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
}, 120_000);
afterAll(async () => {
  await app?.close();
  await context.teardown();
}, 120_000);

it("uses real bearer/session resolution and conceals two-principal object existence", async () => {
  const a = await context.createParkingTrackingFixture();
  const b = await context.createParkingTrackingFixture();
  await context.ingest(a, [await context.sample()]);
  await context.complete(a);
  await context.complete(b);
  const actorA = await context.createActor(a, "LOCATION_MANAGER");
  const actorB = await context.createActor(b, "LOCATION_MANAGER");
  const sessionA = await context.credential(actorA.userId);
  const sessionB = await context.credential(actorB.userId);
  const path = `/v1/staff/tasks/${a.movementTaskId}/route-history-recordings`;
  const get = (route: string, token?: string) =>
    fetch(`${baseUrl}${route}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  expect((await get(path)).status).toBe(401);
  const allowed = await get(path, sessionA.accessToken);
  expect(allowed.status).toBe(200);
  expect(allowed.headers.get("cache-control")).toBe("no-store");
  expect(allowed.headers.get("x-request-id")).toBeTruthy();
  expect(await allowed.json()).toMatchObject({
    recordings: [{ trackingSessionId: a.trackingSessionId }],
    nextCursor: null,
  });
  const denied = await get(path, sessionB.accessToken);
  expect(denied.status).toBe(404);
  expect(JSON.stringify(await denied.json())).not.toMatch(
    /trackingSessionId|recordings|latitude|longitude|startedAt/,
  );
  expect((await get(`${path}?limit=501`, sessionA.accessToken)).status).toBe(
    400,
  );
  expect(
    (
      await get(
        `${path}?organizationId=${b.organizationId}`,
        sessionA.accessToken,
      )
    ).status,
  ).toBe(400);
  const samples = `/v1/staff/tracking-sessions/${a.trackingSessionId}/route-history`;
  const raw = await get(samples, sessionA.accessToken);
  expect(raw.status).toBe(200);
  expect(raw.headers.get("cache-control")).toBe("no-store");
  expect(await raw.json()).toMatchObject({
    samples: [{ latitude: expect.any(Number) }],
  });
  await context.adminPool.query(
    `DELETE FROM membership_location_access WHERE membership_id = $1`,
    [actorA.membershipId],
  );
  expect((await get(samples, sessionA.accessToken)).status).toBe(404);
  expect((await get(path, sessionA.accessToken)).status).toBe(404);
  await context.adminPool.query(
    `UPDATE staff_auth_sessions SET revoked_at = clock_timestamp() WHERE id = $1`,
    [sessionB.staffAuthSessionId],
  );
  expect((await get(path, sessionB.accessToken)).status).toBe(401);
});
