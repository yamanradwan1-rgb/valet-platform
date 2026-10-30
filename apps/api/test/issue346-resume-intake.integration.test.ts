import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { Pool } from "pg";
import { ManagementAuditTestFixture } from "./management-audit-test-fixture";
import { seedResumeOperationalRecords } from "./issue346-operational-records";
import {
  createActiveLocationRaceScenario,
  createLocationRaceIntake,
  locationRaceBarrierClient,
  waitForLocationRaceBlocked,
} from "./management-location-race-test-helpers";

const fixture = new ManagementAuditTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function scenario(activeShift = false) {
  const s = await createActiveLocationRaceScenario(fixture);
  const base = s.base;
  const organizationId = s.admin.membership.organizationId;
  const stopped = await fixture.managementPost(
    `${base}/stop-intake`,
    s.admin.auth.accessToken,
    {
      expectedUpdatedAt: s.updatedAt,
    },
  );
  expect(stopped.status).toBe(201);
  const shiftId = activeShift
    ? await fixture.startActiveShift(
        organizationId,
        s.locationId,
        s.employeeMembershipId,
      )
    : null;
  const post = (
    action: string,
    version: unknown = stopped.body?.updatedAt,
    token = s.admin.auth.accessToken,
  ) =>
    fixture.managementPost(`${base}/${action}`, token, {
      expectedUpdatedAt: version,
    });
  return { ...s, organizationId, post, stopped, shiftId };
}

it.each([true, false])(
  "resumes with activeShift=%s, preserves operational rows, admits normal Check-In and deduplicates audit",
  async (activeShift) => {
    const s = await scenario(activeShift);
    if (activeShift) await seedResumeOperationalRecords(fixture, s);
    const snapshot = async () =>
      (
        await fixture.query(
          `SELECT (SELECT jsonb_agg(to_jsonb(s)) FROM shifts s WHERE organization_id=$1) AS shifts,
      (SELECT jsonb_agg(to_jsonb(s)) FROM valet_sessions s WHERE organization_id=$1) AS sessions,
      (SELECT jsonb_agg(to_jsonb(s)) FROM tasks s WHERE organization_id=$1) AS tasks,
      (SELECT jsonb_agg(to_jsonb(s)) FROM dispatch_events s WHERE organization_id=$1) AS dispatch,
      (SELECT jsonb_agg(to_jsonb(s)) FROM payments s WHERE organization_id=$1) AS payments,
      (SELECT jsonb_agg(to_jsonb(s)) FROM key_custody_events s WHERE organization_id=$1) AS keys`,
          [s.organizationId],
        )
      ).rows;
    const before = await snapshot();
    const runtime = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      if (activeShift) {
        await expect(
          createLocationRaceIntake(runtime, {
            employeeUserId: s.employee.id,
            locationId: s.locationId,
          }),
        ).rejects.toMatchObject({ code: "LOCATION_INTAKE_STOPPED" });
      }
      const resumed = await s.post("resume-intake");
      expect(resumed.status).toBe(201);
      expect(resumed.body).toMatchObject({
        status: "ACTIVE",
        acceptingIntake: true,
      });
      expect(await snapshot()).toEqual(before);
      const repeated = await s.post("resume-intake");
      expect(repeated.status).toBe(201);
      expect(repeated.body?.updatedAt).toBe(resumed.body?.updatedAt);
      if (activeShift)
        await expect(
          createLocationRaceIntake(runtime, {
            employeeUserId: s.employee.id,
            locationId: s.locationId,
          }),
        ).resolves.toBeDefined();
      const audit = await fixture.query(
        `SELECT actor_membership_id::text,location_id::text,metadata_json
       FROM audit_events WHERE location_id=$1 AND event_type='LOCATION_INTAKE_RESUMED'`,
        [s.locationId],
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]).toMatchObject({
        actor_membership_id: s.admin.membership.membershipId,
        location_id: s.locationId,
        metadata_json: {
          fromAcceptingIntake: false,
          toAcceptingIntake: true,
          status: "ACTIVE",
        },
      });
    } finally {
      await runtime.end();
    }
  },
  30_000,
);

it("rejects stale versions, inactive Location, foreign tenant, wrong role, revoked member and stale MFA", async () => {
  const s = await scenario();
  expect((await s.post("resume-intake", s.updatedAt)).status).toBe(409);
  const foreign = await fixture.createUser();
  await fixture.createMembership(foreign.id);
  const foreignAuth = await fixture.nativeLogin(foreign);
  await fixture.enrollAndAssure(foreignAuth);
  expect(
    (await s.post("resume-intake", undefined, foreignAuth.accessToken)).status,
  ).toBe(404);
  const employeeAuth = await fixture.nativeLogin(s.employee);
  expect(
    (await s.post("resume-intake", undefined, employeeAuth.accessToken)).status,
  ).toBe(404);
  await fixture.query(
    "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
    [s.admin.membership.membershipId],
  );
  expect((await s.post("resume-intake")).status).toBe(404);
  await fixture.query(
    "UPDATE organization_memberships SET status='ACTIVE' WHERE id=$1",
    [s.admin.membership.membershipId],
  );
  await fixture.query(
    "UPDATE staff_auth_sessions SET created_at=clock_timestamp()-interval '2 hours', mfa_authenticated_at=clock_timestamp()-interval '6 minutes' WHERE id=$1",
    [s.admin.auth.sessionId],
  );
  expect((await s.post("resume-intake")).body).toMatchObject({
    code: "MFA_STEP_UP_REQUIRED",
  });
  await fixture.query(
    "UPDATE staff_auth_sessions SET mfa_authenticated_at=clock_timestamp(),last_admin_activity_at=clock_timestamp() WHERE id=$1",
    [s.admin.auth.sessionId],
  );
  expect((await s.post("deactivate")).status).toBe(201);
  expect((await s.post("resume-intake")).body).toMatchObject({
    code: "LOCATION_INVALID_STATE",
  });
  const audit = await fixture.query(
    "SELECT 1 FROM audit_events WHERE location_id=$1 AND event_type='LOCATION_INTAKE_RESUMED'",
    [s.locationId],
  );
  expect(audit.rows).toHaveLength(0);
}, 30_000);

it("serializes repeated Resume, Stop and Deactivate with deterministic CAS and no duplicate audit", async () => {
  const s = await scenario();
  const resumes = await Promise.all([
    s.post("resume-intake"),
    s.post("resume-intake"),
  ]);
  expect(resumes.map((r) => r.status)).toEqual([201, 201]);
  expect(resumes[0]?.body?.updatedAt).toBe(resumes[1]?.body?.updatedAt);
  expect((await s.post("stop-intake")).status).toBe(409);
  const stopped = await s.post("stop-intake", resumes[0]?.body?.updatedAt);
  const results = await Promise.all([
    s.post("resume-intake", stopped.body?.updatedAt),
    s.post("deactivate", stopped.body?.updatedAt),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  const read = await fixture.managementGet(
    `${s.base}/lifecycle`,
    s.admin.auth.accessToken,
  );
  expect(read.body).toMatchObject(
    results[0]?.status === 201
      ? { status: "ACTIVE", acceptingIntake: true }
      : { status: "INACTIVE", acceptingIntake: false },
  );
}, 30_000);

it("rechecks management revocation committed while Resume waits at the lifecycle boundary", async () => {
  const s = await scenario();
  const barrier = await locationRaceBarrierClient(
    fixture.migrationDatabaseUrl(),
  );
  try {
    await barrier.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('location-lifecycle:' || $1::text,0))",
      [s.locationId],
    );
    const resume = s.post("resume-intake");
    await waitForLocationRaceBlocked(fixture, 1, barrier);
    await barrier.query(
      "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
      [s.admin.membership.membershipId],
    );
    await barrier.query("COMMIT");
    expect((await resume).status).toBe(404);
    expect(
      (
        await fixture.query(
          "SELECT accepting_intake FROM locations WHERE id=$1",
          [s.locationId],
        )
      ).rows[0],
    ).toEqual({ accepting_intake: false });
    expect(
      (
        await fixture.query(
          "SELECT 1 FROM audit_events WHERE location_id=$1 AND event_type='LOCATION_INTAKE_RESUMED'",
          [s.locationId],
        )
      ).rowCount,
    ).toBe(0);
  } finally {
    await barrier.query("ROLLBACK").catch(() => undefined);
    await barrier.end();
  }
}, 30_000);

it("rolls back intake and version if the required audit cannot be appended", async () => {
  const s = await scenario();
  await fixture.query(`CREATE FUNCTION test_resume_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.event_type='LOCATION_INTAKE_RESUMED' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF;
      RETURN NEW; END $$;
    CREATE TRIGGER test_resume_audit_failure BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION test_resume_audit_failure()`);
  try {
    expect((await s.post("resume-intake")).status).toBe(500);
    const read = await fixture.managementGet(
      `${s.base}/lifecycle`,
      s.admin.auth.accessToken,
    );
    expect(read.body).toMatchObject({
      acceptingIntake: false,
      updatedAt: s.stopped.body?.updatedAt,
    });
    expect(
      (
        await fixture.query(
          "SELECT 1 FROM audit_events WHERE location_id=$1 AND event_type='LOCATION_INTAKE_RESUMED'",
          [s.locationId],
        )
      ).rowCount,
    ).toBe(0);
  } finally {
    await fixture.query(
      "DROP TRIGGER test_resume_audit_failure ON audit_events; DROP FUNCTION test_resume_audit_failure()",
    );
  }
}, 30_000);
