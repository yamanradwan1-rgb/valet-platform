import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { incidentResolutionFixture } from "./incident-resolution-test-fixture";

const { fixture, actor, seed, command } = incidentResolutionFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

describe("#337 rollback, scoped pagination and least privilege", () => {
  it("requires fresh sensitive Company Admin MFA before a write or terminal retry", async () => {
    const owner = await actor();
    const target = await seed(owner);
    await fixture.query(
      `UPDATE staff_auth_sessions SET created_at=created_at-interval '10 minutes',
      mfa_authenticated_at=clock_timestamp()-interval '6 minutes'
      WHERE user_id=$1`,
      [owner.user.id],
    );
    const response = await fixture.managementPost(
      `${target.base}/${target.incident}/resolve`,
      owner.auth.accessToken,
      command(),
    );
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
    const saved = await fixture.query(
      `SELECT status::text FROM incidents WHERE id=$1`,
      [target.incident],
    );
    expect(saved.rows).toEqual([{ status: "OPEN" }]);
    await fixture.query(
      `UPDATE staff_auth_sessions SET mfa_authenticated_at=statement_timestamp(),last_admin_activity_at=statement_timestamp()
      WHERE user_id=$1`,
      [owner.user.id],
    );
    const request = command();
    expect(
      (
        await fixture.managementPost(
          `${target.base}/${target.incident}/resolve`,
          owner.auth.accessToken,
          request,
        )
      ).status,
    ).toBe(201);
    await fixture.query(
      `UPDATE staff_auth_sessions SET mfa_authenticated_at=clock_timestamp()-interval '6 minutes'
      WHERE user_id=$1`,
      [owner.user.id],
    );
    expect(
      (
        await fixture.managementPost(
          `${target.base}/${target.incident}/resolve`,
          owner.auth.accessToken,
          request,
        )
      ).status,
    ).toBe(403);
  });

  it("rechecks and locks commercial Dashboard access through the resolution commit", async () => {
    const owner = await actor("LOCATION_MANAGER");
    const target = await seed(owner);
    const blocker = await fixture.databasePool().connect();
    let committed = false;
    let pending: ReturnType<typeof fixture.managementPost> | null = null;
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        `SELECT 1 FROM organization_subscriptions WHERE organization_id=$1 FOR UPDATE`,
        [owner.member.organizationId],
      );
      pending = fixture.managementPost(
        `${target.base}/${target.incident}/resolve`,
        owner.auth.accessToken,
        command(),
      );
      let waiting = false;
      for (let attempt = 0; attempt < 150; attempt++) {
        const locks = await fixture.query<{ blocked: number }>(
          `SELECT count(*)::int AS blocked FROM pg_stat_activity
           WHERE datname=current_database() AND wait_event_type='Lock'
             AND query LIKE '%shift_presence_lock_management_entitlement%'`,
        );
        if ((locks.rows[0]?.blocked ?? 0) > 0) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(waiting).toBe(true);
      await blocker.query(
        `UPDATE organization_subscriptions SET dashboard_access_enabled=false
         WHERE organization_id=$1`,
        [owner.member.organizationId],
      );
      await blocker.query("COMMIT");
      committed = true;
      expect((await pending).status).toBe(404);
      const saved = await fixture.query(
        `SELECT status::text FROM incidents WHERE id=$1`,
        [target.incident],
      );
      expect(saved.rows).toEqual([{ status: "OPEN" }]);
    } finally {
      if (!committed) await blocker.query("ROLLBACK");
      blocker.release();
      await pending?.catch(() => undefined);
    }
  }, 45_000);
  it("rolls back the actual runtime mutation if appending Audit fails", async () => {
    const owner = await actor("LOCATION_MANAGER");
    const target = await seed(owner);
    await fixture.query(`CREATE FUNCTION test_resolution_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.event_type='INCIDENT_RESOLVED' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END; $$`);
    await fixture.query(`CREATE TRIGGER test_resolution_failure BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION test_resolution_audit_failure()`);
    try {
      const response = await fixture.managementPost(
        `${target.base}/${target.incident}/resolve`,
        owner.auth.accessToken,
        command(),
      );
      expect(response.status).toBe(500);
      const saved = await fixture.query(
        `SELECT status::text,resolved_at,resolution_notes FROM incidents WHERE id=$1`,
        [target.incident],
      );
      expect(saved.rows).toEqual([
        { status: "OPEN", resolved_at: null, resolution_notes: null },
      ]);
      const history = await fixture.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM audit_events
        WHERE entity_id=$1 AND event_type='INCIDENT_RESOLVED'`,
        [target.incident],
      );
      expect(history.rows[0]?.count).toBe(0);
    } finally {
      await fixture.query(
        `DROP TRIGGER test_resolution_failure ON audit_events`,
      );
      await fixture.query(`DROP FUNCTION test_resolution_audit_failure()`);
    }
  });

  it("paginates mixed states without dropping resolved rows and binds the filter to its cursor", async () => {
    const owner = await actor("LOCATION_MANAGER");
    const targets = await Promise.all([
      seed(owner),
      seed(owner, "INVESTIGATING"),
      seed(owner, "CLOSED"),
    ]);
    const first = targets[0]!;
    expect(
      (
        await fixture.managementPost(
          `${first.base}/${first.incident}/resolve`,
          owner.auth.accessToken,
          command(),
        )
      ).status,
    ).toBe(201);
    const found: string[] = [];
    let cursor: string | null = null;
    for (let index = 0; index < 3; index++) {
      const page = await fixture.managementGet(
        `${first.base}?limit=1${cursor ? `&cursor=${cursor}` : ""}`,
        owner.auth.accessToken,
      );
      expect(page.status).toBe(200);
      const item = (page.body?.items as { incidentId: string }[])[0]!;
      found.push(item.incidentId);
      cursor = page.body?.nextCursor as string | null;
      if (cursor && index === 0) {
        expect(
          (
            await fixture.managementGet(
              `${first.base}?limit=1&filter=ACTIVE&cursor=${cursor}`,
              owner.auth.accessToken,
            )
          ).status,
        ).toBe(400);
      }
    }
    expect(new Set(found)).toEqual(
      new Set(targets.map((entry) => entry.incident)),
    );
    expect(cursor).toBeNull();
  });

  it("grants exactly resolution columns and no table-level UPDATE or deletion", async () => {
    const role = new URL(fixture.runtimeDatabaseUrl()).username;
    const privileges = await fixture.query<{
      column_name: string;
      allowed: boolean;
    }>(
      `SELECT column_name,has_column_privilege($1,'public.incidents',column_name,'UPDATE') AS allowed
       FROM information_schema.columns WHERE table_schema='public' AND table_name='incidents'`,
      [role],
    );
    expect(
      privileges.rows
        .filter((row) => row.allowed)
        .map((row) => row.column_name)
        .sort(),
    ).toEqual(
      [
        "status",
        "resolved_at",
        "resolved_by_membership_id",
        "resolution_notes",
      ].sort(),
    );
    const table = await fixture.query(
      `SELECT has_table_privilege($1,'public.incidents','UPDATE') AS update,
      has_table_privilege($1,'public.incidents','DELETE') AS delete`,
      [role],
    );
    expect(table.rows[0]).toEqual({ update: false, delete: false });
  });
});
