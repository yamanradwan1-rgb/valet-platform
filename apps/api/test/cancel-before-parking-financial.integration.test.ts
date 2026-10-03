import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ParkingCancellationTestContext } from "./cancel-before-parking-test-context";
import { operationalAnalytics } from "../src/modules/dashboard/analytics-operations-query";
import { financialAnalytics } from "../src/modules/dashboard/analytics-financial-query";
import { financialOperationalOverview } from "../src/modules/dashboard/overview-financial-query";
describe("completed-intake cancellation financial and KPI truth", () => {
  const ctx = new ParkingCancellationTestContext("261_financial");
  beforeAll(() => ctx.setup(), 120_000);
  afterAll(() => ctx.teardown(), 60_000);
  it("never creates completion/revenue/rating and preserves a truthful completed Check-In metric", async () => {
    const { fixture, input } = await ctx.target();
    const manager = await ctx.addMember(fixture, "LOCATION_MANAGER", false);
    await ctx.adminPool.query(
      `INSERT INTO organization_subscriptions
      (organization_id,plan_code,status,dashboard_access_enabled,report_exports_enabled,basic_branding_enabled)
      VALUES($1,'TEST_ENTITLED','ACTIVE',TRUE,TRUE,TRUE) ON CONFLICT(organization_id)
      DO UPDATE SET status='ACTIVE',dashboard_access_enabled=TRUE`,
      [fixture.organizationId],
    );
    const paymentId = randomUUID();
    await ctx.adminPool.query(
      `INSERT INTO payments(id,organization_id,location_id,valet_session_id,
      service_payer,collection_method,currency,service_amount,tip_amount,amount_due,amount_paid,status,
      creation_idempotency_key,updated_at) VALUES($1,$2,$3,$4,'CUSTOMER','CASH','JOD',10,0,10,0,'UNPAID',$5,now())`,
      [
        paymentId,
        fixture.organizationId,
        fixture.locationId,
        input.sessionId,
        randomUUID(),
      ],
    );
    const before = (
      await ctx.adminPool.query(
        "SELECT to_jsonb(p) FROM payments p WHERE id=$1",
        [paymentId],
      )
    ).rows;
    await ctx.cancel(input);
    expect(
      (
        await ctx.adminPool.query(
          "SELECT to_jsonb(p) FROM payments p WHERE id=$1",
          [paymentId],
        )
      ).rows,
    ).toEqual(before);
    const read = {
      authenticatedUserId: manager.userId,
      locationId: fixture.locationId,
      recordManagementActivity: false,
      period: { from: "2026-01-01", to: "2026-12-31" },
    };
    const operations = await operationalAnalytics(ctx.runtimePool, read);
    expect(
      operations.carsHandledPerDay.every((day) => day.handledCount === 0),
    ).toBe(true);
    expect(operations.metrics.checkInTime.sampleCount).toBe(1);
    expect(operations.metrics.parkingTime.sampleCount).toBe(0);
    expect(operations.metrics.handoffTime.sampleCount).toBe(0);
    const financial = await financialAnalytics(ctx.runtimePool, read);
    expect(financial.currencies).toEqual([]);
    const overview = await financialOperationalOverview(ctx.runtimePool, read);
    expect(overview.currencies).toEqual([]);
    expect(
      (
        await ctx.adminPool.query(
          "SELECT count(*)::int AS count FROM guest_ratings WHERE valet_session_id=$1",
          [input.sessionId],
        )
      ).rows[0].count,
    ).toBe(0);
  });
});
