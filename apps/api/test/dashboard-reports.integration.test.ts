import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Pool } from "pg";

import {
  dailyAnalyticsReport,
  weeklyAnalyticsReport,
} from "../src/modules/dashboard/report-read-service";
import {
  resolveMonthlyPeriod,
  resolveWeeklyPeriod,
} from "../src/modules/dashboard/report-period";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";
import {
  analyticsSeedCashShift,
  analyticsSeedIncident,
  analyticsSeedPayment,
  analyticsSeedRefund,
  analyticsSeedSession,
  analyticsSeedValidationPair,
} from "./dashboard-analytics-seed";

const context = new DashboardOverviewTestContext("reports");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

const manager = () => context.managerFixture();

async function seedTaskWithDispatch(input: {
  adminPool: Pool;
  organizationId: string;
  locationId: string;
  membershipId: string;
  sessionId: string;
}): Promise<void> {
  const taskId = randomUUID();
  await input.adminPool.query(
    `INSERT INTO tasks (id, organization_id, location_id,
        valet_session_id, task_type, status,
        current_assignee_membership_id, updated_at)
     VALUES ($1, $2, $3, $4, 'RETRIEVAL', 'ASSIGNED', $5,
             transaction_timestamp())`,
    [
      taskId,
      input.organizationId,
      input.locationId,
      input.sessionId,
      input.membershipId,
    ],
  );
  await input.adminPool.query(
    `INSERT INTO dispatch_events (id, organization_id, location_id,
        task_id, valet_session_id, event_type, actor_membership_id,
        new_assignee_membership_id, occurred_at, created_at)
     VALUES ($1, $2, $3, $4, $5, 'ASSIGNED', $6, $6,
             '2026-07-10T09:30:00Z', transaction_timestamp())`,
    [randomUUID(), input.organizationId, input.locationId, taskId, input.sessionId, input.membershipId],
  );
}

async function seedKeyCustody(input: {
  adminPool: Pool;
  organizationId: string;
  locationId: string;
  membershipId: string;
  sessionId: string;
}): Promise<void> {
  const slotId = randomUUID();
  await input.adminPool.query(
    `INSERT INTO key_slots (id, organization_id, location_id, code, status,
        updated_at)
     VALUES ($1, $2, $3, $4, 'ACTIVE', transaction_timestamp())`,
    [slotId, input.organizationId, input.locationId, randomUUID().slice(0, 8)],
  );
  await input.adminPool.query(
    `INSERT INTO key_custody_events (id, organization_id, location_id,
        valet_session_id, key_slot_id, actor_membership_id, event_type,
        occurred_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'SLOT_ASSIGNED',
             '2026-07-10T08:15:00Z', transaction_timestamp())`,
    [
      randomUUID(),
      input.organizationId,
      input.locationId,
      input.sessionId,
      slotId,
      input.membershipId,
    ],
  );
}

beforeAll(async () => {
  const fixture = await manager();
  const ids = {
    adminPool: context.adminPool,
    locationId: fixture.locationId,
    membershipId: fixture.membershipId,
    organizationId: fixture.organizationId,
  };
  const completed = await analyticsSeedSession(context, {
    state: "COMPLETED",
    createdAtIso: "2026-07-10T07:00:00Z",
    checkingInCompletedAtIso: "2026-07-10T07:01:30Z",
    readyAtIso: "2026-07-10T08:00:00Z",
    completedAtIso: "2026-07-10T08:04:00Z",
  });
  const jodPayment = await analyticsSeedPayment(context, {
    currency: "JOD",
    paidAtIso: "2026-07-10T08:30:00Z",
    sessionId: completed,
  });
  await analyticsSeedValidationPair(context, { paymentId: jodPayment });

  // Validation-only currency: completed in-period, canonical UNPAID Payment.
  const eurSession = await analyticsSeedSession(context, {
    state: "COMPLETED",
    completedAtIso: "2026-07-10T09:30:00Z",
  });
  const eurPayment = await analyticsSeedPayment(context, {
    currency: "EUR",
    sessionId: eurSession,
    status: "UNPAID",
  });
  await analyticsSeedValidationPair(context, { paymentId: eurPayment });

  // Refund-only currency: no paid-at-in-period row for this currency.
  const gbpSession = await analyticsSeedSession(context, {
    state: "PARKED",
  });
  const gbpPayment = await analyticsSeedPayment(context, {
    currency: "GBP",
    sessionId: gbpSession,
    status: "UNPAID",
  });
  await analyticsSeedRefund(context, {
    amount: "3.250",
    completedAtIso: "2026-07-10T12:00:00Z",
    paymentId: gbpPayment,
    status: "SUCCEEDED",
  });
  await analyticsSeedCashShift(context, { endedAtIso: "2026-07-10T18:00:00Z" });
  await analyticsSeedIncident(context, {
    createdAtIso: "2026-07-10T09:00:00Z",
    severity: "HIGH",
    type: "KEY",
  });
  const requested = await analyticsSeedSession(context, {
    state: "REQUESTED",
    retrievalRequestedAtIso: "2026-07-10T06:00:00Z",
  });
  await context.seedRetrievalRequest({
    requestedAgoMinutes: 0,
    sessionId: requested,
    status: "OPEN",
  }).catch(() => undefined);
  await context.adminPool.query(
    `UPDATE retrieval_requests SET requested_at = '2026-07-10T06:00:00Z'
     WHERE valet_session_id = $1`,
    [requested],
  );
  await seedTaskWithDispatch({ ...ids, sessionId: requested });
  await seedKeyCustody({ ...ids, sessionId: requested });
}, 120_000);

describe("VAL-009E report period resolution", () => {
  it("accepts only Monday week starts", () => {
    expect(resolveWeeklyPeriod("2026-07-13")).toEqual({
      from: "2026-07-13",
      to: "2026-07-19",
    });
    expect(() => resolveWeeklyPeriod("2026-07-14")).toThrow();
  });

  it("resolves calendar months including leap February", () => {
    expect(resolveMonthlyPeriod("2024-02")).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
    });
    expect(resolveMonthlyPeriod("2026-02")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
  });
});

describe("VAL-009E daily report composition", () => {
  it("composes DEC-060 facts plus reconstructable daily activity", async () => {
    const fixture = await manager();
    const report = await dailyAnalyticsReport(context.runtimePool, {
      authenticatedUserId: fixture.userId,
      date: "2026-07-10",
      locationId: fixture.locationId,
    });
    expect(report.kind).toBe("DAILY");
    expect(report.timezone).toBe("Asia/Amman");
    expect(report.periodFrom).toBe("2026-07-10");
    expect(report.periodTo).toBe("2026-07-10");
    expect(report.summary.metrics.retrievalWait).toEqual({
      averageSeconds: null,
      sampleCount: 0,
    });
    expect(report.summary.metrics.checkInTime.sampleCount).toBe(1);
    expect(report.summary.currencies.map((g) => g.currency)).toEqual([
      "EUR",
      "GBP",
      "JOD",
    ]);
    const eur = report.summary.currencies.find((g) => g.currency === "EUR")!;
    expect(eur.validationRate).toEqual({
      denominator: 1,
      numerator: 1,
      percentage: "100.00",
    });
    expect(eur.paidPaymentCount).toBe(0);
    expect(eur.currentValidationAmountTotal).toBe("4.000");
    const gbp = report.summary.currencies.find((g) => g.currency === "GBP")!;
    expect(gbp.succeededRefundAmountTotal).toBe("3.250");
    expect(gbp.paidPaymentCount).toBe(0);
    const jod = report.summary.currencies.find((g) => g.currency === "JOD")!;
    expect(jod.paidPaymentCount).toBe(1);
    expect(report.summary.incidents.incidentCount).toBe(1);
    expect(report.dailyActivity).toMatchObject({
      retrievalRequestedCount: 1,
    });
    expect(
      report.dailyActivity!.dispatchEventCounts.some((entry) =>
        entry.eventType === "ASSIGNED" && entry.taskType === "RETRIEVAL"
          ? entry.count === 1
          : false,
      ),
    ).toBe(true);
    expect(report.dailyActivity!.keyCustodyEventCounts).toEqual([
      { count: 1, eventType: "SLOT_ASSIGNED" },
    ]);
  });

  it("produces weekly reports without fabricated history sections", async () => {
    const fixture = await manager();
    const response = await weeklyAnalyticsReport(context.runtimePool, {
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
      weekStart: "2026-07-13",
    });
    expect(response.kind).toBe("WEEKLY");
    expect(response.periodFrom).toBe("2026-07-13");
    expect(response.periodTo).toBe("2026-07-19");
    expect("dailyActivity" in response).toBe(false);
  });
});
