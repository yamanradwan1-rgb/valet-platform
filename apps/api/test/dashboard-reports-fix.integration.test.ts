import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import {
  finalizeAuditedExport,
  generateReportExport,
} from "../src/modules/dashboard/report-export-service";
import { renderReportCsv } from "../src/modules/dashboard/report-csv-renderer";
import {
  pdfSafeText,
  renderReportPdf,
} from "../src/modules/dashboard/report-pdf-renderer";
import { composeReport } from "../src/modules/dashboard/report-read-service";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";
import {
  analyticsSeedIncident,
  analyticsSeedPayment,
  analyticsSeedSession,
} from "./dashboard-analytics-seed";

const context = new DashboardOverviewTestContext("reports-fix");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

const manager = () => context.managerFixture();
const PERIOD = { from: "2026-07-10", to: "2026-07-10" };

async function exportCount(locationId: string): Promise<number> {
  const result = await context.adminPool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM audit_events
     WHERE event_type = 'DASHBOARD_REPORT_EXPORT_GENERATED'
       AND location_id = $1`,
    [locationId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

describe("VAL-009E fix: CSV hardening and determinism", () => {
  it("hardens every dangerous leading form including CR/LF", async () => {
    const fixture = await manager();
    const dangerousTypes = [
      "=1+1",
      "+2+2",
      "-3+3",
      "@SUM(A1:A2)",
      "\t=D5*2",
      "\r=E9/0",
      "\n=F4&G4",
      "\x01=G5+H5",
    ];
    for (const type of dangerousTypes) {
      await analyticsSeedIncident(context, {
        createdAtIso: "2026-07-10T07:30:00Z",
        severity: "HIGH",
        type,
      });
    }
    const report = await composeReport(context.runtimePool, {
      authenticatedUserId: fixture.userId,
      includeDailyActivity: false,
      locationId: fixture.locationId,
      period: PERIOD,
    });
    const artifact = renderReportCsv(
      report,
      "DAILY",
      "CSV",
      PERIOD.from,
      PERIOD.to,
    );
    const text = new TextDecoder().decode(artifact.bytes);
    const typeRows = text
      .split("\r\n")
      .filter((line) => line.startsWith("INCIDENTS_TYPE,"));
    expect(
      typeRows.length,
      JSON.stringify(report.summary.incidents.typeCounts),
    ).toBe(dangerousTypes.length);
    const hardenedByRaw: Record<string, string> = {
      "=1+1": "'=1+1",
      "+2+2": "'+2+2",
      "-3+3": "'-3+3",
      "@SUM(A1:A2)": "'@SUM(A1:A2)",
      "\t=D5*2": "'=D5*2",
      "\r=E9/0": "'=E9/0",
      "\n=F4&G4": "'=F4&G4",
      "\x01=G5+H5": "'=G5+H5",
    };
    for (const [raw, hardened] of Object.entries(hardenedByRaw)) {
      const expectedRow = `INCIDENTS_TYPE,${hardened},,,1`;
      expect(typeRows, `raw ${JSON.stringify(raw)}`).toContain(expectedRow);
    }
  });

  it("renders byte-identical CSV for identical source state and input", async () => {
    const fixture = await manager();
    const report = await composeReport(context.runtimePool, {
      authenticatedUserId: fixture.userId,
      includeDailyActivity: false,
      locationId: fixture.locationId,
      period: PERIOD,
    });
    const first = renderReportCsv(report, "DAILY", "CSV", PERIOD.from, PERIOD.to);
    const second = renderReportCsv(report, "DAILY", "CSV", PERIOD.from, PERIOD.to);
    expect(Buffer.from(second.bytes).equals(Buffer.from(first.bytes))).toBe(true);
  });
});

describe("VAL-009E fix: audited export transaction re-authorization", () => {
  it("fails closed with zero audits when access is revoked before the audit transaction", async () => {
    const fixture = await manager();
    const staffSessionContext = await context.staffSessionContext(fixture.userId);
    const session = await analyticsSeedSession(context, {
      state: "COMPLETED",
      completedAtIso: "2026-07-10T10:00:00Z",
    });
    await analyticsSeedPayment(context, {
      currency: "USD",
      paidAtIso: "2026-07-10T11:00:00Z",
      sessionId: session,
    });
    const request = {
      date: "2026-07-10",
      format: "CSV" as const,
      kind: "DAILY" as const,
    };
    const before = await exportCount(fixture.locationId);
    await context.adminPool.query(
      `DELETE FROM membership_location_access
       WHERE organization_id = $1 AND membership_id = $2`,
      [fixture.organizationId, fixture.membershipId],
    );

    await expect(
      generateReportExport(context.runtimePool, {
        authenticatedUserId: fixture.userId,
        staffSessionContext,
        locationId: fixture.locationId,
        request,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });

    // The stale pre-render scope must not be able to drive the final audit
    // boundary either: invoke finalize directly on a transaction with the
    // already-revoked access and an already-rendered artifact.
    await expect(
      inPostgresTransaction(context.runtimePool, async (transaction) =>
        finalizeAuditedExport(transaction, {
          artifact: {
            bytes: new TextEncoder().encode("x"),
            format: "CSV",
          },
          authenticatedUserId: fixture.userId,
          staffSessionContext,
          locationId: fixture.locationId,
          renderedPeriodFrom: PERIOD.from,
          renderedPeriodTo: PERIOD.to,
          request,
        }),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(await exportCount(fixture.locationId)).toBe(before);
  });

  it("writes one fresh-scope audit per successful finalized export", async () => {
    const fixture = await manager();
    const staffSessionContext = await context.staffSessionContext(fixture.userId);
    await context.adminPool.query(
      `INSERT INTO membership_location_access
         (organization_id, membership_id, location_id)
       VALUES ($1, $2, $3)`,
      [fixture.organizationId, fixture.membershipId, fixture.locationId],
    );
    const before = await exportCount(fixture.locationId);
    const first = await generateReportExport(context.runtimePool, {
      authenticatedUserId: fixture.userId,
      staffSessionContext,
      locationId: fixture.locationId,
      request: { date: "2026-07-10", format: "CSV", kind: "DAILY" },
    });
    const second = await generateReportExport(context.runtimePool, {
      authenticatedUserId: fixture.userId,
      staffSessionContext,
      locationId: fixture.locationId,
      request: { date: "2026-07-10", format: "PDF", kind: "DAILY" },
    });
    expect(first.contentType).toBe("text/csv; charset=utf-8");
    expect(second.contentType).toBe("application/pdf");
    const rows = await context.adminPool.query<{
      actor_membership_id: string;
      entity_id: string;
      entity_type: string;
      id: string;
      metadata_keys: string[];
      organization_id: string;
      valet_session_id: string | null;
    }>(
      `SELECT id,
              organization_id,
              location_id,
              actor_membership_id,
              valet_session_id,
              entity_type,
              entity_id,
              (SELECT array_agg(key ORDER BY key) FROM jsonb_each(metadata_json))
                AS "metadata_keys"
       FROM audit_events
       WHERE event_type = 'DASHBOARD_REPORT_EXPORT_GENERATED'
         AND location_id = $1`,
      [fixture.locationId],
    );
    const relevant = rows.rows.slice(before);
    expect(relevant).toHaveLength(2);
    expect(relevant[0]!.id).not.toBe(relevant[1]!.id);
    for (const row of relevant) {
      expect(row.entity_type).toBe("Location");
      expect(row.entity_id).toBe(fixture.locationId);
      expect(row.organization_id).toBe(fixture.organizationId);
      expect(row.actor_membership_id).toBe(fixture.membershipId);
      expect(row.valet_session_id).toBeNull();
      expect(row.metadata_keys!.sort()).toEqual([
        "contentLength",
        "contentSha256",
        "format",
        "periodFrom",
        "periodTo",
        "reportKind",
      ]);
    }
  });
});

describe("VAL-009E fix: PDF Unicode preservation", () => {
  it("preserves non-ASCII persisted values losslessly as escapes", () => {
    expect(pdfSafeText("مفتاح مفقود")).toBe(
      "\\u{645}\\u{641}\\u{62a}\\u{627}\\u{62d} \\u{645}\\u{641}\\u{642}\\u{648}\\u{62f}",
    );
    expect(pdfSafeText("KEY")).toBe("KEY");
    expect(pdfSafeText("a\u0001b")).toBe("ab");
    expect(pdfSafeText("مفتاح")).not.toBe(pdfSafeText("مفتاح٢"));
    expect(pdfSafeText("مفتاح")).toBe(pdfSafeText("مفتاح"));
  });

  it("renders deterministic PDFs where distinct Arabic types stay distinguishable", async () => {
    const fixture = await manager();
    await analyticsSeedIncident(context, {
      createdAtIso: "2026-07-10T14:00:00Z",
      severity: "HIGH",
      type: "مفتاح مفقود",
    });
    const report = await composeReport(context.runtimePool, {
      authenticatedUserId: fixture.userId,
      includeDailyActivity: false,
      locationId: fixture.locationId,
      period: PERIOD,
    });
    const first = await renderReportPdf(
      report,
      "DAILY",
      PERIOD.from,
      PERIOD.to,
    );
    const second = await renderReportPdf(
      report,
      "DAILY",
      PERIOD.from,
      PERIOD.to,
    );
    expect(first.contentType).toBe("application/pdf");
    expect(new TextDecoder().decode(first.bytes.slice(0, 5))).toBe("%PDF-");
    // Identical logical input stays byte-deterministic after pinned metadata.
    expect(Buffer.from(second.bytes).equals(Buffer.from(first.bytes))).toBe(
      true,
    );
    // Distinct persisted Unicode values must remain distinguishable in the
    // rendered artifact instead of silently collapsing to the same text.
    const differing = JSON.parse(JSON.stringify(report));
    differing.summary.incidents.typeCounts[0]!.type = "مفتاح ثانٍ";
    const different = await renderReportPdf(
      differing,
      "DAILY",
      PERIOD.from,
      PERIOD.to,
    );
    expect(
      Buffer.from(different.bytes).equals(Buffer.from(first.bytes)),
    ).toBe(false);
  });
});
