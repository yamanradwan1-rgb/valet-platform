import { createHash } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { finalizeCompanyReportExport } from "../src/modules/management/company-report-export-service";
import type { RenderedArtifact } from "../src/modules/reporting/report-render-hardening";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

let successState: Awaited<ReturnType<typeof scenario>>;
let revokedState: Awaited<ReturnType<typeof scenario>>;

beforeAll(async () => {
  await fixture.start();
  successState = await scenario("BE-11 finalizer success");
  revokedState = await scenario("BE-11 finalizer revoke");
}, 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function scenario(name: string) {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, { name });
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, membership, user };
}

async function context(
  userId: string,
  auth: { readonly accessToken: string; readonly sessionId: string },
): Promise<StaffSessionContext> {
  const session = await fixture.query<{ created_at: Date }>(
    `SELECT created_at FROM staff_auth_sessions WHERE id=$1`,
    [auth.sessionId],
  );
  return {
    accessTokenHash: `staff-access-sha256:v1:${createHash("sha256")
      .update(auth.accessToken)
      .digest("hex")}`,
    createdAt: session.rows[0]!.created_at,
    staffAuthSessionId: auth.sessionId,
    userId,
  };
}

function artifact(): RenderedArtifact {
  return {
    bytes: new TextEncoder().encode("stable already-rendered company export"),
    contentType: "text/csv; charset=utf-8",
    filename: "company-report-daily-2026-07-10.csv",
  };
}

async function auditRows(organizationId: string) {
  return fixture.query<{
    actor_membership_id: string | null;
    entity_id: string;
    entity_type: string;
    location_id: string | null;
    metadata_json: Record<string, unknown>;
  }>(
    `SELECT actor_membership_id::text,entity_id::text,entity_type,
            location_id::text,metadata_json
     FROM audit_events
     WHERE organization_id=$1
       AND event_type='DASHBOARD_REPORT_EXPORT_GENERATED'
     ORDER BY occurred_at,id`,
    [organizationId],
  );
}

describe("MGT-BE-11 company export final authorization boundary", () => {
  it("finalizes already-rendered bytes when Organization authority is unchanged", async () => {
    const state = successState;
    const staffContext = await context(state.user.id, state.auth);
    const rendered = artifact();
    await inPostgresTransaction(fixture.databasePool(), (transaction) =>
      finalizeCompanyReportExport(transaction, {
        artifact: rendered,
        context: staffContext,
        organizationId: state.membership.organizationId,
        renderedPeriodFrom: "2026-07-10",
        renderedPeriodTo: "2026-07-10",
        request: { date: "2026-07-10", format: "CSV", kind: "DAILY" },
      }),
    );
    const rows = (await auditRows(state.membership.organizationId)).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_membership_id: state.membership.membershipId,
      entity_id: state.membership.organizationId,
      entity_type: "Organization",
      location_id: null,
      metadata_json: {
        contentLength: rendered.bytes.byteLength,
        contentSha256: createHash("sha256").update(rendered.bytes).digest("hex"),
        format: "CSV",
        periodFrom: "2026-07-10",
        periodTo: "2026-07-10",
        reportKind: "DAILY",
      },
    });
  });

  it("fails closed with zero audit when Organization authority is revoked after rendering", async () => {
    const state = revokedState;
    const staffContext = await context(state.user.id, state.auth);
    const rendered = artifact();
    await fixture.query(
      `UPDATE organization_memberships
       SET status='INACTIVE',updated_at=clock_timestamp()
       WHERE id=$1`,
      [state.membership.membershipId],
    );
    await expect(
      inPostgresTransaction(fixture.databasePool(), (transaction) =>
        finalizeCompanyReportExport(transaction, {
          artifact: rendered,
          context: staffContext,
          organizationId: state.membership.organizationId,
          renderedPeriodFrom: "2026-07-10",
          renderedPeriodTo: "2026-07-10",
          request: { date: "2026-07-10", format: "CSV", kind: "DAILY" },
        }),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect((await auditRows(state.membership.organizationId)).rowCount).toBe(0);
  });
});
