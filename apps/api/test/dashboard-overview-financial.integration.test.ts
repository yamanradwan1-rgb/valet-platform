import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ApiTransportValidationError } from "../src/common/http/api-errors";
import {
  dashboardSessionStateCounts,
  listDashboardSessions,
} from "../src/modules/dashboard/overview-sessions-query";
import { listDashboardTasks } from "../src/modules/dashboard/overview-retrieval-tasks-query";
import { financialOperationalOverview } from "../src/modules/dashboard/overview-financial-query";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";

const context = new DashboardOverviewTestContext("financial");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

const manager = () => context.managerFixture();
let retrievingSessionId = "";
let completedSessionId = "";

beforeAll(async () => {
  await context.managerFixture();
  retrievingSessionId = await context.seedSession({ state: "RETRIEVING" });
  completedSessionId = await context.seedSession({ state: "COMPLETED" });
  const usdPayment = await context.seedPayment({
    currency: "USD",
    sessionId: retrievingSessionId,
  });
  const jodSessionId = await context.seedSession({ state: "PARKED" });
  const jodPayment = await context.seedPayment({
    currency: "JOD",
    sessionId: jodSessionId,
  });
  const excludedPayment = await context.seedPayment({
    currency: "USD",
    sessionId: completedSessionId,
  });
  void excludedPayment;
  await context.seedSucceededRefund({
    amount: "2.500",
    paymentId: usdPayment,
  });
  await context.seedCurrentValidation({
    amount: "3.000",
    paymentId: jodPayment,
  });
}, 120_000);

describe("VAL-009C financial operational overview", () => {
  it("groups current operational money by immutable Payment currency", async () => {
    const fixture = await manager();
    const response = await financialOperationalOverview(context.runtimePool, {
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
    });
    expect(response.currencies.map((group) => group.currency)).toEqual([
      "JOD",
      "USD",
    ]);
    expect(Object.keys(response.currencies[0]!).sort()).toEqual(
      [
        "amountDueTotal",
        "amountPaidTotal",
        "collectionMethodCounts",
        "currency",
        "currentValidationAmountTotal",
        "paymentCount",
        "statusCounts",
        "succeededRefundAmountTotal",
        "tipAmountTotal",
      ].sort(),
    );
    const jod = response.currencies[0]!;
    expect(jod).toMatchObject({
      amountDueTotal: "11.000",
      amountPaidTotal: "11.000",
      currency: "JOD",
      currentValidationAmountTotal: "3.000",
      paymentCount: 1,
      succeededRefundAmountTotal: "0.000",
      tipAmountTotal: "1.000",
    });
    expect(jod.collectionMethodCounts).toEqual([
      { count: 0, method: "NONE" },
      { count: 1, method: "CASH" },
      { count: 0, method: "DIGITAL" },
    ]);
    expect(jod.statusCounts).toEqual([
      { count: 0, status: "NOT_REQUIRED" },
      { count: 0, status: "UNPAID" },
      { count: 0, status: "PENDING" },
      { count: 1, status: "PAID" },
      { count: 0, status: "FAILED" },
    ]);
    const usd = response.currencies[1]!;
    expect(usd).toMatchObject({
      amountDueTotal: "11.000",
      currency: "USD",
      paymentCount: 1,
      succeededRefundAmountTotal: "2.500",
    });
    expect(JSON.stringify(response)).not.toMatch(
      /provider|idempotency|correlation/i,
    );
  });

  it("paginates sessions without duplicate or skipped rows", async () => {
    const fixture = await manager();
    for (let index = 0; index < 6; index += 1) {
      await context.seedSession({ state: "PARKED" });
    }
    const collected: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const result = await listDashboardSessions(context.runtimePool, {
        authenticatedUserId: fixture.userId,
        ...(cursor === undefined ? {} : { cursor }),
        limit: 4,
        locationId: fixture.locationId,
      });
      for (const entry of result.items) {
        expect(collected).not.toContain(entry.sessionId);
        collected.push(entry.sessionId);
      }
      if (result.nextCursor === null) break;
      cursor = result.nextCursor;
    }
    const everything = await listDashboardSessions(context.runtimePool, {
      authenticatedUserId: fixture.userId,
      limit: 100,
      locationId: fixture.locationId,
    });
    expect(collected).toHaveLength(everything.items.length);
    expect(new Set(collected).size).toBe(collected.length);
    expect([...everything.items.map((entry) => entry.sessionId)].sort()).toEqual(
      [...collected].sort(),
    );
    expect(cursor === undefined || everything.items.length > 0).toBe(true);
  });

  it("rejects foreign-domain cursors and reads without mutation or audit", async () => {
    const fixture = await manager();
    const sessionPage = await listDashboardSessions(context.runtimePool, {
      authenticatedUserId: fixture.userId,
      limit: 1,
      locationId: fixture.locationId,
    });
    expect(sessionPage.nextCursor).not.toBeNull();
    await expect(
      listDashboardTasks(context.runtimePool, {
        authenticatedUserId: fixture.userId,
        cursor: sessionPage.nextCursor!,
        limit: 5,
        locationId: fixture.locationId,
      }),
    ).rejects.toBeInstanceOf(ApiTransportValidationError);
    const snapshotBefore = await context.adminPool.query<{ counts: string }>(
      `SELECT (SELECT count(*)::text FROM valet_sessions) || '|' ||
              (SELECT count(*)::text FROM tasks) || '|' ||
              (SELECT count(*)::text FROM payments) || '|' ||
              (SELECT count(*)::text FROM audit_events)
         AS counts`,
    );
    await financialOperationalOverview(context.runtimePool, {
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
    });
    await dashboardSessionStateCounts(context.runtimePool, {
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
    });
    const snapshotAfter = await context.adminPool.query<{ counts: string }>(
      `SELECT (SELECT count(*)::text FROM valet_sessions) || '|' ||
              (SELECT count(*)::text FROM tasks) || '|' ||
              (SELECT count(*)::text FROM payments) || '|' ||
              (SELECT count(*)::text FROM audit_events)
         AS counts`,
    );
    expect(snapshotAfter.rows[0]!.counts).toBe(snapshotBefore.rows[0]!.counts);
  });
});
