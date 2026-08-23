import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ApiTransportValidationError } from "../src/common/http/api-errors";
import {
  operationalAnalytics,
} from "../src/modules/dashboard/analytics-operations-query";
import { queueSnapshot } from "../src/modules/dashboard/analytics-queue-query";
import { validateAnalyticsPeriod } from "../src/modules/dashboard/analytics-period";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";
import { analyticsSeedSession } from "./dashboard-analytics-seed";

const context = new DashboardOverviewTestContext("analytics-ops");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

const manager = () => context.managerFixture();
const PERIOD = { from: "2026-07-10", to: "2026-07-11" };

async function runOperations(from = PERIOD.from, to = PERIOD.to) {
  const fixture = await manager();
  return operationalAnalytics(context.runtimePool, {
    authenticatedUserId: fixture.userId,
    locationId: fixture.locationId,
    period: { from, to },
  });
}

beforeAll(async () => {
  await manager();
  // check-in cohort: one 90s sample plus a legitimate zero-second sample.
  await analyticsSeedSession(context, {
    state: "CHECKING_IN",
    createdAtIso: "2026-07-10T10:00:00Z",
    checkingInCompletedAtIso: "2026-07-10T10:01:30Z",
  });
  await analyticsSeedSession(context, {
    state: "AWAITING_PARKING",
    createdAtIso: "2026-07-10T11:00:00Z",
    checkingInCompletedAtIso: "2026-07-10T11:00:00Z",
  });
  await analyticsSeedSession(context, {
    state: "PARKED",
    parkingStartedAtIso: "2026-07-10T12:00:00Z",
    parkedAtIso: "2026-07-10T12:02:00Z",
  });
  await analyticsSeedSession(context, {
    state: "READY",
    retrievalRequestedAtIso: "2026-07-10T13:00:00Z",
    retrievalStartedAtIso: "2026-07-10T13:00:45Z",
    readyAtIso: "2026-07-10T13:05:00Z",
  });
  await analyticsSeedSession(context, {
    state: "COMPLETED",
    readyAtIso: "2026-07-10T15:00:00Z",
    completedAtIso: "2026-07-10T15:04:00Z",
  });
  // negative interval is never counted
  await analyticsSeedSession(context, {
    state: "CHECKING_IN",
    createdAtIso: "2026-07-10T16:00:00Z",
    checkingInCompletedAtIso: "2026-07-10T15:30:00Z",
  });
  // completed outside the window must not appear
  await analyticsSeedSession(context, {
    state: "COMPLETED",
    completedAtIso: "2026-07-12T10:00:00Z",
  });
}, 120_000);

describe("VAL-009D analytics period validation", () => {
  it("rejects missing, inverted, oversized and impossible periods", () => {
    expect(() => validateAnalyticsPeriod(undefined, "2026-07-02")).toThrow(
      ApiTransportValidationError,
    );
    expect(() => validateAnalyticsPeriod("2026-07-10", undefined)).toThrow(
      ApiTransportValidationError,
    );
    expect(() => validateAnalyticsPeriod("2026-07-12", "2026-07-01")).toThrow(
      ApiTransportValidationError,
    );
    expect(() => validateAnalyticsPeriod("2026-06-01", "2026-07-02")).toThrow(
      ApiTransportValidationError,
    );
    expect(() => validateAnalyticsPeriod("2026-02-30", "2026-03-01")).toThrow(
      ApiTransportValidationError,
    );
    expect(() => validateAnalyticsPeriod("not-a-date", "2026-07-02")).toThrow(
      ApiTransportValidationError,
    );
  });
});

describe("VAL-009D duration metrics", () => {
  it("computes hand-verifiable averages with official/auxiliary naming", async () => {
    const response = await runOperations();
    expect(response.metrics.checkInTime).toEqual({
      averageSeconds: "45.000",
      sampleCount: 2,
    });
    expect(response.metrics.parkingTime).toEqual({
      averageSeconds: "120.000",
      sampleCount: 1,
    });
    expect(response.metrics.retrievalWait).toEqual({
      averageSeconds: "300.000",
      sampleCount: 1,
    });
    expect(response.metrics.retrievalStartLatencyAuxiliary).toEqual({
      averageSeconds: "45.000",
      sampleCount: 1,
    });
    expect(response.metrics.handoffTime).toEqual({
      averageSeconds: "240.000",
      sampleCount: 1,
    });
  });

  it("returns every local day including zero days", async () => {
    const response = await runOperations("2026-07-09", "2026-07-11");
    expect(response.carsHandledPerDay).toEqual([
      { date: "2026-07-09", handledCount: 0 },
      { date: "2026-07-10", handledCount: 1 },
      { date: "2026-07-11", handledCount: 0 },
    ]);
    expect(response.timezone).toBe("Asia/Amman");
  });

  it("keeps an empty window structurally null instead of zero-filled", async () => {
    const response = await runOperations("2026-07-20", "2026-07-21");
    for (const metric of Object.values(response.metrics)) {
      expect(metric).toEqual({ averageSeconds: null, sampleCount: 0 });
    }
    expect(response.carsHandledPerDay).toEqual([
      { date: "2026-07-20", handledCount: 0 },
      { date: "2026-07-21", handledCount: 0 },
    ]);
  });
});

describe("VAL-009D queue snapshot", () => {
  it("counts OPEN/ACCEPTED with server-clock oldest age", async () => {
    const fixture = await manager();
    await context.seedRetrievalRequest({
      requestedAgoMinutes: 10,
      sessionId: await analyticsSeedSession(context, {
        state: "REQUESTED",
      }),
      status: "OPEN",
    });
    await context.seedRetrievalRequest({
      requestedAgoMinutes: 1,
      sessionId: await analyticsSeedSession(context, {
        state: "RETRIEVING",
      }),
      status: "ACCEPTED",
    });
    const snapshot = await queueSnapshot(context.runtimePool, {
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
    });
    expect(snapshot.depth).toBe(2);
    const age = Number(snapshot.oldestAgeSeconds!);
    expect(age).toBeGreaterThan(595);
    expect(age).toBeLessThan(605);
  });

  it("returns a null age for an empty queue", async () => {
    const fixture = await manager();
    const emptyLocation = await context.addLocation(fixture);
    const snapshot = await queueSnapshot(context.runtimePool, {
      authenticatedUserId: fixture.userId,
      locationId: emptyLocation,
    });
    expect(snapshot).toEqual({ depth: 0, oldestAgeSeconds: null });
  });
});
