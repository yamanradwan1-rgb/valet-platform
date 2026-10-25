import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { ManagementAuditTestFixture } from "./management-audit-test-fixture";
import {
  locationRaceBarrierClient,
  waitForLocationRaceBlocked,
} from "./management-location-race-test-helpers";

const fixture = new ManagementAuditTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function scenario(role: "ORG_ADMIN" | "LOCATION_MANAGER" = "ORG_ADMIN") {
  const user = await fixture.createUser();
  const member = await fixture.createMembership(user.id, { role });
  const auth = await fixture.nativeLogin(user);
  if (role === "ORG_ADMIN") await fixture.enrollAndAssure(auth);
  const location = await fixture.addLocation(member.organizationId);
  if (role === "LOCATION_MANAGER")
    await fixture.query(
      "INSERT INTO membership_location_access(organization_id,membership_id,location_id) VALUES($1,$2,$3)",
      [member.organizationId, member.membershipId, location.locationId],
    );
  const employee = await fixture.createUser();
  const reporter = await fixture.addMembership(
    member.organizationId,
    employee.id,
    "VALET_EMPLOYEE",
  );
  await fixture.query(
    "UPDATE organization_memberships SET first_name='Nadia',last_name='Salem' WHERE id=$1",
    [reporter],
  );
  const path = `/v1/staff/management/organizations/${member.organizationId}/shifts`;
  async function shift(
    reported: string | null = "12.345",
    variance = "2.344",
    active = false,
  ) {
    const id = randomUUID();
    await fixture.query(
      `INSERT INTO shifts(id,organization_id,location_id,membership_id,status,started_at,ended_at,
        cash_expected,cash_reported,cash_variance,cash_currency,cash_reported_at,cash_reported_by_membership_id)
       VALUES($1,$2,$3,$4,$5,'2026-10-01T05:00:00Z',$6,
         $7,$8,$9,$10,$11,$12)`,
      [
        id,
        member.organizationId,
        location.locationId,
        reporter,
        active ? "ACTIVE" : "ENDED",
        active ? null : "2026-10-01T07:00:00Z",
        reported === null ? null : "10.001",
        reported,
        reported === null ? null : variance,
        reported === null ? null : "JOD",
        reported === null ? null : "2026-10-01T07:00:00Z",
        reported === null ? null : reporter,
      ],
    );
    return id;
  }
  const get = (id: string, token = auth.accessToken) =>
    fixture.managementGet(`${path}/${id}?includeCashReconciliation=true`, token);
  return { user, member, auth, location, reporter, employee, path, shift, get };
}

it.each(["ORG_ADMIN", "LOCATION_MANAGER"] as const)(
  "allows existing %s financial authority, reads exact immutable values only in detail",
  async (role) => {
    const s = await scenario(role);
    for (const [reported, variance] of [
      ["12.345", "2.344"],
      ["9.999", "-0.002"],
      ["10.001", "0.000"],
    ]) {
      const id = await s.shift(reported, variance);
      const before = (
        await fixture.query(
          "SELECT to_jsonb(s) AS snapshot FROM shifts s WHERE id=$1",
          [id],
        )
      ).rows;
      const result = await s.get(id);
      expect(result.status).toBe(200);
      expect(result.headers.get("cache-control")).toContain("no-store");
      expect(result.body?.cashReconciliation).toEqual({
        state: "REPORTED",
        snapshot: {
          cashExpected: "10.001",
          cashReported: reported,
          cashVariance: variance,
          currency: "JOD",
          reportedAt: "2026-10-01T07:00:00.000Z",
          reportedBy: "Nadia Salem",
        },
      });
      expect(
        (
          await fixture.query(
            "SELECT to_jsonb(s) AS snapshot FROM shifts s WHERE id=$1",
            [id],
          )
        ).rows,
      ).toEqual(before);
    }
    const list = await fixture.managementGet(s.path, s.auth.accessToken);
    expect(list.status).toBe(200);
    for (const item of list.body?.items as Record<string, unknown>[]) {
      expect(item).not.toHaveProperty("cashReconciliation");
      expect(JSON.stringify(item)).not.toContain("cashExpected");
    }
  },
  30_000,
);

it("returns truthful active/legacy states and hides inactive reporting identity without leaking UUIDs", async () => {
  const s = await scenario();
  const legacy = await s.shift(null);
  await fixture.query(
    `INSERT INTO shift_force_end_closures
    (shift_id,organization_id,actor_membership_id,operation_id,request_fingerprint,ended_at)
    VALUES($1,$2,$3,$4,$5,'2026-10-01T07:00:00Z')`,
    [
      legacy,
      s.member.organizationId,
      s.member.membershipId,
      randomUUID(),
      "a".repeat(64),
    ],
  );
  const active = await s.shift(null, "0", true);
  for (const id of [legacy, active])
    expect((await s.get(id)).body?.cashReconciliation).toEqual({
      state: "NOT_REPORTED",
      snapshot: null,
    });
  const reported = await s.shift();
  await fixture.query(
    "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
    [s.reporter],
  );
  const result = await s.get(reported);
  expect(result.body?.cashReconciliation).toMatchObject({
    state: "REPORTED",
    snapshot: { reportedBy: null },
  });
  expect(JSON.stringify(result.body?.cashReconciliation)).not.toContain(
    s.reporter,
  );
}, 30_000);

it("does not disclose cash after actor revocation wins the protected read race", async () => {
  const s = await scenario();
  const id = await s.shift();
  const barrier = await locationRaceBarrierClient(
    fixture.migrationDatabaseUrl(),
  );
  try {
    await barrier.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('staff-user-security:' || $1::text,0))",
      [s.user.id],
    );
    const read = s.get(id);
    await waitForLocationRaceBlocked(fixture, 1);
    await barrier.query(
      "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
      [s.member.membershipId],
    );
    await barrier.query("COMMIT");
    const response = await read;
    expect(response.status).toBe(404);
    expect(JSON.stringify(response.body)).not.toContain("cashExpected");
  } finally {
    await barrier.query("ROLLBACK").catch(() => undefined);
    await barrier.end();
  }
}, 30_000);

it("denies foreign tenants, guessed IDs, ungranted Locations, wrong roles, revoked memberships and missing MFA", async () => {
  const s = await scenario();
  const id = await s.shift();
  const foreign = await scenario();
  expect((await s.get(id, foreign.auth.accessToken)).status).toBe(404);
  expect((await s.get(randomUUID())).status).toBe(404);
  const lm = await fixture.createUser();
  const lmId = await fixture.addMembership(
    s.member.organizationId,
    lm.id,
    "LOCATION_MANAGER",
  );
  const lmAuth = await fixture.nativeLogin(lm);
  expect((await s.get(id, lmAuth.accessToken)).status).toBe(404);
  await fixture.query(
    "INSERT INTO membership_location_access(organization_id,membership_id,location_id) VALUES($1,$2,$3)",
    [s.member.organizationId, lmId, s.location.locationId],
  );
  expect((await s.get(id, lmAuth.accessToken)).status).toBe(200);
  await fixture.query(
    "UPDATE organization_memberships SET role='VALET_SUPERVISOR' WHERE id=$1",
    [lmId],
  );
  expect((await s.get(id, lmAuth.accessToken)).status).toBe(404);
  await fixture.query(
    "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
    [s.member.membershipId],
  );
  expect((await s.get(id)).status).toBe(404);
  await fixture.query(
    "UPDATE organization_memberships SET status='ACTIVE' WHERE id=$1",
    [s.member.membershipId],
  );
  await fixture.query(
    "UPDATE staff_auth_sessions SET mfa_authenticated_at=NULL,mfa_factor_id=NULL,last_admin_activity_at=NULL WHERE id=$1",
    [s.auth.sessionId],
  );
  expect((await s.get(id)).body).toMatchObject({
    code: "MFA_STEP_UP_REQUIRED",
  });
}, 30_000);
