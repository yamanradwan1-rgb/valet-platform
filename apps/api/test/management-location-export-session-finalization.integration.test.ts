import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import {
  DatabaseStaffSessionContextResolver,
  type StaffSessionContext,
} from "../src/modules/auth/staff-session-context";
import { finalizeAuditedExport } from "../src/modules/dashboard/report-export-service";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();
const period = { from: "2026-07-10", to: "2026-07-10" };
const request = {
  date: "2026-07-10",
  format: "CSV" as const,
  kind: "DAILY" as const,
};

let runtimePool: Pool;
let resolver: DatabaseStaffSessionContextResolver;

beforeAll(async () => {
  await fixture.start();
  runtimePool = new Pool({ connectionString: fixture.runtimeDatabaseUrl() });
  resolver = new DatabaseStaffSessionContextResolver(runtimePool);
}, 120_000);
afterAll(async () => {
  await runtimePool.end();
  await fixture.stop();
}, 120_000);

interface ExportScenario {
  readonly auth: Awaited<
    ReturnType<ManagementControlPlaneTestFixture["nativeLogin"]>
  >;
  readonly context: StaffSessionContext;
  readonly locationId: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly userId: string;
}

async function scenario(
  name: string,
  role: "LOCATION_MANAGER" | "ORG_ADMIN" = "LOCATION_MANAGER",
): Promise<ExportScenario> {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, { name, role });
  const location = await fixture.addLocation(membership.organizationId);
  if (role === "LOCATION_MANAGER") {
    await fixture.query(
      `INSERT INTO membership_location_access
         (organization_id, membership_id, location_id)
       VALUES ($1, $2, $3)`,
      [membership.organizationId, membership.membershipId, location.locationId],
    );
  }
  const auth = await fixture.nativeLogin(user);
  const context = await resolver.resolve(`Bearer ${auth.accessToken}`);
  return {
    auth,
    context,
    locationId: location.locationId,
    membershipId: membership.membershipId,
    organizationId: membership.organizationId,
    userId: user.id,
  };
}

function finalize(
  state: ExportScenario,
  context: StaffSessionContext = state.context,
) {
  return inPostgresTransaction(runtimePool, (transaction) =>
    finalizeAuditedExport(transaction, {
      artifact: {
        bytes: new TextEncoder().encode("already rendered Location export"),
        format: "CSV",
      },
      authenticatedUserId: state.userId,
      staffSessionContext: context,
      locationId: state.locationId,
      renderedPeriodFrom: period.from,
      renderedPeriodTo: period.to,
      request,
    }),
  );
}

async function auditCount(state: ExportScenario): Promise<number> {
  const result = await fixture.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM audit_events
     WHERE organization_id=$1 AND location_id=$2
       AND event_type='DASHBOARD_REPORT_EXPORT_GENERATED'`,
    [state.organizationId, state.locationId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function expectDeniedWithoutAudit(state: ExportScenario): Promise<void> {
  const before = await auditCount(state);
  await expect(finalize(state)).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
  expect(await auditCount(state)).toBe(before);
}

describe("MGT-FIX-01 exact-session Location export finalization", () => {
  it("finalizes a valid Location Manager session without Company Admin MFA", async () => {
    const state = await scenario("valid location manager");
    expect((await fixture.factors(state.userId)).rowCount).toBe(0);
    expect(await auditCount(state)).toBe(0);
    const result = await finalize(state);
    expect(result.contentType).toBe("text/csv; charset=utf-8");
    expect(await auditCount(state)).toBe(1);
  });

  it("denies a revoked exact session after render and writes no success audit", async () => {
    const state = await scenario("revoked exact session");
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET revoked_at=clock_timestamp() WHERE id=$1`,
      [state.auth.sessionId],
    );
    await expect(
      resolver.resolve(`Bearer ${state.auth.accessToken}`),
    ).rejects.toMatchObject({ status: 401 });
    await expectDeniedWithoutAudit(state);
  });

  it("denies an expired access session", async () => {
    const state = await scenario("expired access");
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET access_expires_at=created_at + interval '1 millisecond'
       WHERE id=$1`,
      [state.auth.sessionId],
    );
    await expectDeniedWithoutAudit(state);
  });

  it("denies an absolutely expired session", async () => {
    const state = await scenario("absolute expiry");
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET access_expires_at=created_at + interval '1 millisecond',
           absolute_expires_at=created_at + interval '1 millisecond'
       WHERE id=$1`,
      [state.auth.sessionId],
    );
    await expectDeniedWithoutAudit(state);
  });

  it("denies a disabled User even when the session row remains unrevoked", async () => {
    const state = await scenario("disabled user");
    await fixture.query(`UPDATE users SET status='DISABLED' WHERE id=$1`, [
      state.userId,
    ]);
    await expectDeniedWithoutAudit(state);
  });

  it("denies a stale context after real refresh rotates the access authority", async () => {
    const state = await scenario("rotated access");
    const refreshed = await fixture.refresh(state.auth.refreshToken);
    expect(refreshed.status).toBe(200);
    await expect(
      resolver.resolve(`Bearer ${state.auth.accessToken}`),
    ).rejects.toMatchObject({ status: 401 });
    await expectDeniedWithoutAudit(state);
  });

  it("denies a mismatched original session creation binding", async () => {
    const state = await scenario("session creation binding");
    await expect(
      finalize(state, {
        ...state.context,
        createdAt: new Date(state.context.createdAt.getTime() + 1),
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(await auditCount(state)).toBe(0);
  });

  it("preserves Location grant revocation at finalization", async () => {
    const state = await scenario("grant revoked");
    await fixture.query(
      `DELETE FROM membership_location_access
       WHERE organization_id=$1 AND membership_id=$2 AND location_id=$3`,
      [state.organizationId, state.membershipId, state.locationId],
    );
    await expectDeniedWithoutAudit(state);
  });

  it("preserves reportExports and dashboardAccess revocation", async () => {
    const reportExports = await scenario("report exports revoked");
    await fixture.query(
      `UPDATE organization_subscriptions
       SET report_exports_enabled=FALSE, updated_at=clock_timestamp()
       WHERE organization_id=$1`,
      [reportExports.organizationId],
    );
    await expectDeniedWithoutAudit(reportExports);

    const dashboardAccess = await scenario("dashboard access revoked");
    await fixture.query(
      `UPDATE organization_subscriptions
       SET dashboard_access_enabled=FALSE, report_exports_enabled=TRUE,
           updated_at=clock_timestamp()
       WHERE organization_id=$1`,
      [dashboardAccess.organizationId],
    );
    await expectDeniedWithoutAudit(dashboardAccess);
  });

  it("keeps Company Admin exact-session MFA and valid export behavior", async () => {
    const state = await scenario("company admin", "ORG_ADMIN");
    await expect(finalize(state)).rejects.toMatchObject({
      code: "MFA_STEP_UP_REQUIRED",
    });
    expect(await auditCount(state)).toBe(0);
    await fixture.enrollAndAssure(state.auth);
    const result = await finalize(state);
    expect(result.contentType).toBe("text/csv; charset=utf-8");
    expect(await auditCount(state)).toBe(1);
  });
});
