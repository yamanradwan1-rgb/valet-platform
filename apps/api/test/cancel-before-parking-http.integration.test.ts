import { randomUUID } from "node:crypto";
import { Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cancelBeforeParkingResponseSchema } from "@valet/contracts";
import { HttpInfrastructureModule } from "../src/common/http/http-infrastructure.module";
import { RUNTIME_POSTGRES_POOL } from "../src/common/database/runtime-database.module";
import {
  STAFF_PRINCIPAL_RESOLVER,
  FailClosedStaffPrincipalResolver,
} from "../src/modules/auth/staff-principal";
import { CancelBeforeParkingController } from "../src/modules/parking/cancel-before-parking.controller";
import { CancelBeforeParkingService } from "../src/modules/parking/cancel-before-parking.service";
import {
  createIssueGuestAccessCommandExecutor,
  createRevokeGuestAccessCommandExecutor,
} from "../src/modules/valet-sessions/guest-access-command";
import { ParkingCancellationTestContext } from "./cancel-before-parking-test-context";

describe("DEC-098 cancellation real HTTP boundary", () => {
  const ctx = new ParkingCancellationTestContext("261_http");
  const principals = new Map<string, string>();
  let app: INestApplication;
  let base: string;
  @Module({
    controllers: [CancelBeforeParkingController],
    imports: [HttpInfrastructureModule],
    providers: [
      CancelBeforeParkingService,
      { provide: RUNTIME_POSTGRES_POOL, useFactory: () => ctx.runtimePool },
      {
        provide: STAFF_PRINCIPAL_RESOLVER,
        useValue: {
          resolve: async (authorization?: string) => {
            const userId = principals.get(authorization ?? "");
            return userId
              ? { userId }
              : new FailClosedStaffPrincipalResolver().resolve(authorization);
          },
        },
      },
    ],
  })
  class TestModule {}
  beforeAll(async () => {
    await ctx.setup();
    app = await NestFactory.create(TestModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    base = await app.getUrl();
  }, 120_000);
  afterAll(async () => {
    if (app) await app.close();
    await ctx.teardown();
  }, 60_000);
  it("validates exact selectors and conceals foreign/missing targets on first and terminal queries", async () => {
    const { fixture, input } = await ctx.target();
    const authorization = `Bearer ${randomUUID()}`;
    principals.set(authorization, fixture.userId);
    const { sessionId } = input;
    const body = {
      taskId: input.taskId,
      expectedShiftId: input.expectedShiftId,
      expectedSessionVersion: input.expectedSessionVersion,
      expectedTaskVersion: input.expectedTaskVersion,
    };
    const path = `${base}/v1/staff/valet-sessions/${sessionId}`;
    const post = (payload: unknown, auth = authorization) =>
      fetch(`${path}/cancel-before-parking`, {
        method: "POST",
        headers: { authorization: auth, "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    expect((await post(body, "invalid")).status).toBe(401);
    for (const invalid of [
      { ...body, organizationId: fixture.organizationId },
      { ...body, expectedSessionVersion: 0 },
      { ...body, taskId: "invalid" },
      { ...body, expectedShiftId: "invalid" },
    ])
      expect((await post(invalid)).status).toBe(400);
    const statusUrl = `${path}/parking-cancellation-status?taskId=${body.taskId}&expectedShiftId=${body.expectedShiftId}`;
    const read = (url = statusUrl, auth = authorization) =>
      fetch(url, { headers: { authorization: auth } });
    expect(
      (await read(`${statusUrl}&locationId=${fixture.locationId}`)).status,
    ).toBe(400);
    expect(
      (await read(statusUrl.replace(body.taskId, randomUUID()))).status,
    ).toBe(404);
    expect(
      (await read(statusUrl.replace(body.expectedShiftId, randomUUID())))
        .status,
    ).toBe(404);
    expect(await (await read()).json()).toMatchObject({
      outcome: "NOT_CANCELLED",
      classification: "PRE_CUSTODY",
    });
    const result = await post(body);
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toContain("no-store");
    const terminal = cancelBeforeParkingResponseSchema.parse(
      await result.json(),
    );
    expect(Object.keys(terminal).sort()).toEqual([
      "cancelledAt",
      "sessionId",
      "sessionVersion",
      "state",
      "taskId",
      "taskStatus",
      "taskVersion",
    ]);
    expect(await (await post(body)).json()).toEqual(terminal);
    const status = await read();
    expect(status.headers.get("cache-control")).toContain("no-store");
    expect(await status.json()).toEqual({ outcome: "CANCELLED", ...terminal });
    const foreign = await ctx.target();
    const foreignAuth = `Bearer ${randomUUID()}`;
    principals.set(foreignAuth, foreign.fixture.userId);
    expect((await read(statusUrl, foreignAuth)).status).toBe(404);
    expect((await post(body, foreignAuth)).status).toBe(404);
  });
  it("keeps exact terminal history coherent after a later Guest revoke and converges the original POST", async () => {
    const { fixture, input } = await ctx.target();
    const authorization = `Bearer ${randomUUID()}`;
    principals.set(authorization, fixture.userId);
    await createIssueGuestAccessCommandExecutor(ctx.runtimePool)({
      authenticatedUserId: fixture.userId,
      valetSessionId: input.sessionId,
      intent: "ISSUE_OR_ROTATE",
    });
    const body = {
      taskId: input.taskId,
      expectedShiftId: input.expectedShiftId,
      expectedSessionVersion: input.expectedSessionVersion,
      expectedTaskVersion: input.expectedTaskVersion,
    };
    const path = `${base}/v1/staff/valet-sessions/${input.sessionId}`;
    const post = () =>
      fetch(`${path}/cancel-before-parking`, {
        method: "POST",
        headers: {
          authorization,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    const status = () =>
      fetch(
        `${path}/parking-cancellation-status?taskId=${input.taskId}&expectedShiftId=${input.expectedShiftId}`,
        { headers: { authorization } },
      );

    const first = await post();
    expect(first.status).toBe(200);
    const terminal = cancelBeforeParkingResponseSchema.parse(await first.json());
    const afterCancellation = await ctx.cancellationFacts(fixture);

    await createRevokeGuestAccessCommandExecutor(ctx.runtimePool)({
      authenticatedUserId: fixture.userId,
      valetSessionId: input.sessionId,
    });
    const afterRevoke = await ctx.cancellationFacts(fixture);
    expect(afterRevoke.session.customer_access_revoked_at).not.toBeNull();
    expect(afterRevoke.session.updated_at).not.toEqual(
      afterCancellation.session.updated_at,
    );

    const reconciled = await status();
    expect(reconciled.status).toBe(200);
    expect(await reconciled.json()).toEqual({
      outcome: "CANCELLED",
      ...terminal,
    });

    const replay = await post();
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(terminal);
    const afterReplay = await ctx.cancellationFacts(fixture);
    expect(afterReplay.session.version).toBe(terminal.sessionVersion);
    expect(afterReplay.task.version).toBe(terminal.taskVersion);
    expect(afterReplay.history).toHaveLength(1);
    expect(afterReplay.dispatch).toHaveLength(1);
    expect(afterReplay.history[0]?.occurred_at.toISOString()).toBe(
      terminal.cancelledAt,
    );
  });
});
