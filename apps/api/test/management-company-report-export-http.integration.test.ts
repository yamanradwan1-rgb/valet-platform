import { createHash, randomUUID } from "node:crypto";

import { PDFDocument } from "pdf-lib";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";
import {
  seedCompanyIncident,
  seedCompanySession,
  type CompanySeedScope,
} from "./management-company-analytics-test-seed";

const fixture = new ManagementControlPlaneTestFixture();

let byteBoundState: Awaited<ReturnType<typeof scenario>>;
let oversizedPdf: Awaited<ReturnType<typeof exportRequest>>;

beforeAll(async () => {
  await fixture.start();
  byteBoundState = await scenario("BE-11 byte bound");
  const sessionId = await seedCompanySession(fixture, byteBoundState.scope, {
    completedAt: "2026-07-10T10:00:00Z",
    createdAt: "2026-07-10T09:00:00Z",
    state: "COMPLETED",
  });
  await seedIncidentGroups(
    byteBoundState.scope,
    sessionId,
    500,
    `(SELECT string_agg(md5(series::text || ':' || part::text),'')
      FROM generate_series(1,900) AS part)`,
  );
  oversizedPdf = await exportRequest(
    byteBoundState.membership.organizationId,
    byteBoundState.auth.accessToken,
    { date: "2026-07-10", format: "PDF", kind: "DAILY" },
  );
}, 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function scenario(name: string) {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, { name });
  const location = await fixture.addLocation(membership.organizationId, { name: `${name} location` });
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  const scope: CompanySeedScope = {
    locationId: location.locationId,
    membershipId: membership.membershipId,
    organizationId: membership.organizationId,
  };
  return { auth, location, membership, scope, user };
}

function exportPath(organizationId: string): string {
  return `/v1/staff/management/organizations/${organizationId}/reports/exports`;
}

function exportRequest(
  organizationId: string,
  accessToken: string,
  body: unknown,
) {
  return fixture.requestBytes(exportPath(organizationId), {
    authorization: `Bearer ${accessToken}`,
    body,
    method: "POST",
  });
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function auditRows(organizationId: string) {
  return fixture.query<{
    actor_membership_id: string | null;
    actor_type: string;
    entity_id: string;
    entity_type: string;
    id: string;
    location_id: string | null;
    metadata_json: Record<string, unknown>;
    valet_session_id: string | null;
  }>(
    `SELECT id::text, location_id::text, valet_session_id::text,
            actor_membership_id::text, actor_type::text, entity_type,
            entity_id::text, metadata_json
     FROM audit_events
     WHERE organization_id=$1
       AND event_type='DASHBOARD_REPORT_EXPORT_GENERATED'
     ORDER BY occurred_at,id`,
    [organizationId],
  );
}

async function seedIncident(scope: CompanySeedScope, type: string) {
  const sessionId = await seedCompanySession(fixture, scope, {
    completedAt: "2026-07-10T10:00:00Z",
    createdAt: "2026-07-10T09:00:00Z",
    state: "COMPLETED",
  });
  await seedCompanyIncident(fixture, scope, {
    createdAt: "2026-07-10T09:30:00Z",
    sessionId,
    type,
  });
  return sessionId;
}

async function seedIncidentGroups(
  scope: CompanySeedScope,
  sessionId: string,
  count: number,
  typeExpression: string,
) {
  await fixture.query(
    `INSERT INTO incidents
       (id,organization_id,location_id,valet_session_id,status,severity,type,
        description,reported_by_membership_id,created_at)
     SELECT md5($6 || series::text)::uuid,$1,$2,$3,'OPEN','HIGH',
            ${typeExpression},'bulk export bound',$4,'2026-07-10T09:45:00Z'
     FROM generate_series(1,$5::int) AS series`,
    [
      scope.organizationId,
      scope.locationId,
      sessionId,
      scope.membershipId,
      count,
      randomUUID(),
    ],
  );
}

describe("MGT-BE-11 company report HTTP exports", () => {
  it("renders deterministic hardened CSV/PDF with safe headers and exact Organization audits", async () => {
    const state = await scenario("BE-11 export HTTP");
    const incidentType = '=SUM(A1,A2),"evil"\nnext';
    const sessionId = await seedIncident(state.scope, incidentType);
    const csvRequest = { date: "2026-07-10", format: "CSV", kind: "DAILY" } as const;
    const pdfRequest = { date: "2026-07-10", format: "PDF", kind: "DAILY" } as const;

    const csv1 = await exportRequest(state.membership.organizationId, state.auth.accessToken, csvRequest);
    const csv2 = await exportRequest(state.membership.organizationId, state.auth.accessToken, csvRequest);
    const pdf1 = await exportRequest(state.membership.organizationId, state.auth.accessToken, pdfRequest);
    const pdf2 = await exportRequest(state.membership.organizationId, state.auth.accessToken, pdfRequest);

    for (const response of [csv1, csv2, pdf1, pdf2]) {
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
    expect(csv1.headers.get("content-type")).toContain("text/csv");
    expect(csv1.headers.get("content-disposition")).toBe(
      'attachment; filename="company-report-daily-2026-07-10.csv"',
    );
    expect(pdf1.headers.get("content-type")).toContain("application/pdf");
    expect(pdf1.headers.get("content-disposition")).toBe(
      'attachment; filename="company-report-daily-2026-07-10.pdf"',
    );
    expect(Buffer.from(csv2.bytes).equals(Buffer.from(csv1.bytes))).toBe(true);
    expect(Buffer.from(pdf2.bytes).equals(Buffer.from(pdf1.bytes))).toBe(true);
    expect(csv1.bytes.byteLength).toBeLessThanOrEqual(5 * 1024 * 1024);
    expect(pdf1.bytes.byteLength).toBeLessThanOrEqual(5 * 1024 * 1024);
    expect(decode(pdf1.bytes.slice(0, 5))).toBe("%PDF-");

    const csv = decode(csv1.bytes);
    expect(csv.startsWith("section,key,subkey,currency,value\r\n")).toBe(true);
    expect(csv).toContain('INCIDENTS_TYPE,"\'=SUM(A1,A2),""evil""\nnext",,,1');
    for (const sensitive of [
      state.user.email,
      state.membership.membershipId,
      state.location.locationId,
      sessionId,
      "BE-11 incident",
    ]) {
      expect(csv).not.toContain(sensitive);
      expect(Buffer.from(pdf1.bytes).includes(Buffer.from(sensitive))).toBe(false);
    }

    const audits = (await auditRows(state.membership.organizationId)).rows;
    expect(audits).toHaveLength(4);
    expect(new Set(audits.map((row) => row.id)).size).toBe(4);
    for (const row of audits) {
      expect(row).toMatchObject({
        actor_membership_id: state.membership.membershipId,
        actor_type: "MEMBERSHIP",
        entity_id: state.membership.organizationId,
        entity_type: "Organization",
        location_id: null,
        valet_session_id: null,
      });
      const expected = row.metadata_json.format === "CSV" ? csv1.bytes : pdf1.bytes;
      expect(row.metadata_json).toEqual({
        contentLength: expected.byteLength,
        contentSha256: sha256(expected),
        format: row.metadata_json.format,
        periodFrom: "2026-07-10",
        periodTo: "2026-07-10",
        reportKind: "DAILY",
      });
    }
  });

  it("keeps invalid requests and initial authorization denial audit-free", async () => {
    const state = await scenario("BE-11 export denial");
    const invalid = await fixture.managementPost(
      exportPath(state.membership.organizationId),
      state.auth.accessToken,
      { date: "2026-07-10", format: "CSV", kind: "DAILY", extra: true },
    );
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ code: "REQUEST_INVALID" });

    const foreignOrganizationId = await fixture.createOrganization({ name: "Foreign export" });
    const denied = await fixture.managementPost(
      exportPath(foreignOrganizationId),
      state.auth.accessToken,
      { date: "2026-07-10", format: "CSV", kind: "DAILY" },
    );
    expect(denied.status).toBe(404);
    expect(denied.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect((await auditRows(state.membership.organizationId)).rowCount).toBe(0);
    expect((await auditRows(foreignOrganizationId)).rowCount).toBe(0);
  });

  it("keeps renderer failure audit-free", async () => {
    const state = await scenario("BE-11 render failure");
    const create = vi.spyOn(PDFDocument, "create").mockRejectedValueOnce(new Error("render failed"));
    try {
      const failed = await fixture.managementPost(
        exportPath(state.membership.organizationId),
        state.auth.accessToken,
        { date: "2026-07-10", format: "PDF", kind: "DAILY" },
      );
      expect(failed.status).not.toBe(200);
      expect((await auditRows(state.membership.organizationId)).rowCount).toBe(0);
    } finally {
      create.mockRestore();
    }
  });

  it("rejects 501 incident groups before audit", async () => {
    const state = await scenario("BE-11 group bound");
    const sessionId = await seedCompanySession(fixture, state.scope, {
      completedAt: "2026-07-10T10:00:00Z",
      createdAt: "2026-07-10T09:00:00Z",
      state: "COMPLETED",
    });
    await seedIncidentGroups(state.scope, sessionId, 501, `'TYPE_' || lpad(series::text,3,'0')`);
    const response = await fixture.managementPost(
      exportPath(state.membership.organizationId),
      state.auth.accessToken,
      { date: "2026-07-10", format: "CSV", kind: "DAILY" },
    );
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: "COMPANY_ANALYTICS_TOO_LARGE" });
    expect((await auditRows(state.membership.organizationId)).rowCount).toBe(0);
  });

  it("rejects CSV above 5 MiB with only 500 incident groups and writes zero audit", async () => {
    const csv = await fixture.managementPost(
      exportPath(byteBoundState.membership.organizationId),
      byteBoundState.auth.accessToken,
      { date: "2026-07-10", format: "CSV", kind: "DAILY" },
    );
    expect(csv.status).toBe(422);
    expect(csv.body).toMatchObject({ code: "REPORT_EXPORT_TOO_LARGE" });
    expect((await auditRows(byteBoundState.membership.organizationId)).rowCount).toBe(0);
  });

  it("rejects PDF above 5 MiB with only 500 incident groups and writes zero audit", async () => {
    expect(oversizedPdf.status).toBe(422);
    expect(JSON.parse(decode(oversizedPdf.bytes))).toMatchObject({
      code: "REPORT_EXPORT_TOO_LARGE",
    });
    expect((await auditRows(byteBoundState.membership.organizationId)).rowCount).toBe(0);
  });
});
