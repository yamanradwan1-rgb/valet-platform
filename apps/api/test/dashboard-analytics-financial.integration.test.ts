import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DashboardOverviewError,
} from "../src/modules/dashboard/dashboard-overview-error";
import { queueSnapshot } from "../src/modules/dashboard/analytics-queue-query";
import { financialAnalytics } from "../src/modules/dashboard/analytics-financial-query";
import { incidentAnalytics } from "../src/modules/dashboard/analytics-incidents-query";
import {
  operationalAnalytics,
} from "../src/modules/dashboard/analytics-operations-query";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";
import {
  analyticsSeedCashShift,
  analyticsSeedIncident,
  analyticsSeedPayment,
  analyticsSeedRefund,
  analyticsSeedSession,
  analyticsSeedValidationPair,
} from "./dashboard-analytics-seed";

const context = new DashboardOverviewTestContext("analytics-money");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

const manager = () => context.managerFixture();
const PERIOD = { from: "2026-07-10", to: "2026-07-11" };

async function callFinancial() {
  const fixture = await manager();
  return financialAnalytics(context.runtimePool, {
    authenticatedUserId: fixture.userId,
    locationId: fixture.locationId,
    period: PERIOD,
  });
}

async function callIncidents() {
  const fixture = await manager();
  return incidentAnalytics(context.runtimePool, {
    authenticatedUserId: fixture.userId,
    locationId: fixture.locationId,
    period: PERIOD,
  });
}

beforeAll(async () => {
  await manager();
  const usdSession = await analyticsSeedSession(context, {
    state: "COMPLETED",
    completedAtIso: "2026-07-10T10:00:00Z",
  });
  const jodSession = await analyticsSeedSession(context, {
    state: "COMPLETED",
    completedAtIso: "2026-07-10T12:00:00Z",
  });
  const unpaidSession = await analyticsSeedSession(context, {
    state: "PARKED",
  });
  const usdPayment = await analyticsSeedPayment(context, {
    currency: "USD",
    method: "CASH",
    paidAtIso: "2026-07-10T11:00:00Z",
    sessionId: usdSession,
  });
  const jodPayment = await analyticsSeedPayment(context, {
    currency: "JOD",
    method: "DIGITAL",
    paidAtIso: "2026-07-10T13:00:00Z",
    sessionId: jodSession,
  });
  await analyticsSeedPayment(context, {
    currency: "USD",
    status: "UNPAID",
    sessionId: unpaidSession,
  });
  await analyticsSeedRefund(context, {
    amount: "2.500",
    completedAtIso: "2026-07-10T14:00:00Z",
    paymentId: usdPayment,
    status: "SUCCEEDED",
  });
  await analyticsSeedRefund(context, {
    amount: "9.999",
    paymentId: jodPayment,
    status: "PENDING",
  });
  await analyticsSeedValidationPair(context, { paymentId: jodPayment });
  await analyticsSeedCashShift(context, { endedAtIso: "2026-07-10T18:00:00Z" });
  await analyticsSeedIncident(context, {
    createdAtIso: "2026-07-10T09:00:00Z",
    severity: "HIGH",
    type: "KEY",
  });
  await analyticsSeedIncident(context, {
    createdAtIso: "2026-07-10T10:30:00Z",
    severity: "HIGH",
    type: "KEY",
  });
  await analyticsSeedIncident(context, {
    createdAtIso: "2026-07-11T08:00:00Z",
    severity: "LOW",
    type: "OTHER",
  });
  await analyticsSeedIncident(context, {
    createdAtIso: "2026-07-15T08:00:00Z",
    severity: "LOW",
    type: "OTHER",
  });
}, 120_000);

describe("VAL-009D financial period KPIs", () => {
  it("keeps currencies separate with exact cohort totals and rates", async () => {
    const response = await callFinancial();
    expect(response.currencies.map((g) => g.currency)).toEqual(["JOD", "USD"]);
    const jod = response.currencies[0]!;
    expect(jod).toMatchObject({
      collectedAmountTotal: "11.000",
      currency: "JOD",
      currentValidationAmountTotal: "4.000",
      paidPaymentCount: 1,
      succeededRefundAmountTotal: "0.000",
      tipAmountTotal: "1.000",
    });
    expect(jod.digitalPaymentRate).toEqual({
      denominator: 1,
      numerator: 1,
      percentage: "100.00",
    });
    expect(jod.validationRate).toEqual({
      denominator: 1,
      numerator: 1,
      percentage: "100.00",
    });
    const usd = response.currencies[1]!;
    expect(usd).toMatchObject({
      collectedAmountTotal: "11.000",
      currency: "USD",
      currentValidationAmountTotal: "0.000",
      paidPaymentCount: 1,
      succeededRefundAmountTotal: "2.500",
      tipAmountTotal: "1.000",
    });    expect(usd.digitalPaymentRate).toEqual({
      denominator: 1,
      numerator: 0,
      percentage: "0.00",
    });
    expect(usd.validationRate).toEqual({
      denominator: 1,
      numerator: 0,
      percentage: "0.00",
    });
  });

  it("reconciles closed-shift cash with signed variance only", async () => {
    const response = await callFinancial();
    expect(response.cashReconciliation).toEqual([
      {
        cashExpectedTotal: "100.000",
        cashReportedTotal: "98.000",
        cashVarianceTotal: "-2.000",
        currency: "USD",
      },
    ]);
    expect(JSON.stringify(response)).not.toMatch(
      /slaCompliance|carsPerEmployee|keyExceptions|guestRating|repeatGuest/i,
    );
  });

  it("summarizes incidents with hand-computed per-1000", async () => {
    const response = await callIncidents();
    expect(response.incidentCount).toBe(3);
    expect(response.severityCounts).toEqual([
      { count: 2, severity: "HIGH" },
      { count: 1, severity: "LOW" },
    ]);
    expect(response.typeCounts).toEqual([
      { count: 2, type: "KEY" },
      { count: 1, type: "OTHER" },
    ]);
    expect(response.incidentsPer1000).toEqual({
      denominator: 2,
      numerator: 3,
      value: "1500.000",
    });
  });

  it("returns a null per-1000 when no sessions completed in the period", async () => {
    const response = await callIncidents();
    void response;
    const fixture = await manager();
    const emptyLocation = await context.addLocation(fixture);
    const empty = await incidentAnalytics(context.runtimePool, {
      authenticatedUserId: fixture.userId,
      locationId: emptyLocation,
      period: PERIOD,
    });
    expect(empty.incidentsPer1000.denominator).toBe(0);
    expect(empty.incidentsPer1000.value).toBeNull();
  });
});

describe("VAL-009D read-only guarantee", () => {
  it("performs no domain mutation and appends no AuditEvent on reads", async () => {
    const snapshotQuery = `SELECT
       (SELECT count(*)::text FROM valet_sessions) || '|' ||
       (SELECT count(*)::text FROM payments) || '|' ||
       (SELECT count(*)::text FROM refunds) || '|' ||
       (SELECT count(*)::text FROM validations) || '|' ||
       (SELECT count(*)::text FROM shifts) || '|' ||
       (SELECT count(*)::text FROM incidents) || '|' ||
       (SELECT count(*)::text FROM audit_events) AS counts`;
    const before = await context.adminPool.query(snapshotQuery);
    const fixture = await manager();
    await operationalAnalytics(context.runtimePool, {
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
      period: PERIOD,
    });
    await callFinancial();
    await callIncidents();
    await queueSnapshot(context.runtimePool, {
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
    });
    const after = await context.adminPool.query(snapshotQuery);
    expect(after.rows[0]!.counts).toBe(before.rows[0]!.counts);
  });

  it("denies every non-manager actor non-disclosingly across routes", async () => {
    const fixture = await manager();
    const admin = await context.createActor(fixture, "ORG_ADMIN");
    const supervisor = await context.createActor(fixture, "VALET_SUPERVISOR");
    const employee = await context.createActor(fixture, "VALET_EMPLOYEE");
    const ungrantedLocation = await context.addLocation(fixture, {
      access: false,
    });
    const attempts: Array<() => Promise<unknown>> = [
      () =>
        operationalAnalytics(context.runtimePool, {
          authenticatedUserId: admin.userId,
          locationId: fixture.locationId,
          period: PERIOD,
        }),
      () =>
        financialAnalytics(context.runtimePool, {
          authenticatedUserId: supervisor.userId,
          locationId: fixture.locationId,
          period: PERIOD,
        }),
      () =>
        incidentAnalytics(context.runtimePool, {
          authenticatedUserId: employee.userId,
          locationId: fixture.locationId,
          period: PERIOD,
        }),
      () =>
        queueSnapshot(context.runtimePool, {
          authenticatedUserId: admin.userId,
          locationId: ungrantedLocation,
        }),
      () =>
        financialAnalytics(context.runtimePool, {
          authenticatedUserId: fixture.userId,
          locationId: ungrantedLocation,
          period: PERIOD,
        }),
      () =>
        incidentAnalytics(context.runtimePool, {
          authenticatedUserId: randomUserId(),
          locationId: fixture.locationId,
          period: PERIOD,
        }),
    ];
    function randomUserId(): string {
      return crypto.randomUUID();
    }
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toBeInstanceOf(DashboardOverviewError);
      await expect(attempt()).rejects.toMatchObject({
        code: "AUTHORIZATION_DENIED",
      });
    }
  });
});
