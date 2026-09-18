import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { finalizeAuditedExport } from "../src/modules/dashboard/report-export-service";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";

const context = new DashboardOverviewTestContext("be12-export-final");
const period = { from: "2026-07-10", to: "2026-07-10" };
const request = {
  date: "2026-07-10",
  format: "CSV" as const,
  kind: "DAILY" as const,
};

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

async function auditCount(locationId: string): Promise<number> {
  const result = await context.adminPool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM audit_events
     WHERE event_type='DASHBOARD_REPORT_EXPORT_GENERATED' AND location_id=$1`,
    [locationId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

function finalize(userId: string, locationId: string) {
  return inPostgresTransaction(context.runtimePool, (transaction) =>
    finalizeAuditedExport(transaction, {
      artifact: {
        bytes: new TextEncoder().encode("already rendered exact-location export"),
        format: "CSV",
      },
      authenticatedUserId: userId,
      locationId,
      renderedPeriodFrom: period.from,
      renderedPeriodTo: period.to,
      request,
    }),
  );
}

describe("MGT-BE-12 Location export final entitlement boundary", () => {
  it("rechecks current reportExports and dashboardAccess before audit/return", async () => {
    const fixture = await context.managerFixture();
    const first = await finalize(fixture.userId, fixture.locationId);
    expect(first.contentType).toBe("text/csv; charset=utf-8");
    expect(await auditCount(fixture.locationId)).toBe(1);

    await context.adminPool.query(
      `UPDATE organization_subscriptions
       SET report_exports_enabled=FALSE, updated_at=clock_timestamp()
       WHERE organization_id=$1`,
      [fixture.organizationId],
    );
    await expect(finalize(fixture.userId, fixture.locationId)).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    expect(await auditCount(fixture.locationId)).toBe(1);

    await context.adminPool.query(
      `UPDATE organization_subscriptions
       SET dashboard_access_enabled=FALSE, report_exports_enabled=TRUE,
           updated_at=clock_timestamp()
       WHERE organization_id=$1`,
      [fixture.organizationId],
    );
    await expect(finalize(fixture.userId, fixture.locationId)).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    expect(await auditCount(fixture.locationId)).toBe(1);
  });
});
