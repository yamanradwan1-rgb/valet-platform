import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import type { ShiftFixture } from "./shift-test-context";

const db = new PresenceServerTestContext("presence-policy-function");
beforeAll(() => db.setup(), 120_000);
afterAll(() => db.teardown(), 60_000);

interface PolicyActor {
  readonly userId: string;
  readonly membershipId: string;
  readonly context: StaffSessionContext;
}

async function setPolicy(
  actor: PolicyActor,
  fixture: ShiftFixture,
  input: {
    readonly value: string | null;
    readonly revision: number;
    readonly companyRevision: number;
    readonly mutationId?: string;
    readonly locationId?: string | null;
  },
) {
  return db.runtimePool.query<{ revision: number }>(
    `SELECT public.shift_presence_set_policy(
      $1::uuid,$2::uuid,$3::uuid,$4::text,$5::uuid,$6::uuid,
      'shiftStartPresenceMode',$7::text,false,$8::integer,$9::integer,$10::uuid
    ) AS revision`,
    [
      actor.userId,
      actor.membershipId,
      actor.context.staffAuthSessionId,
      actor.context.accessTokenHash,
      fixture.organizationId,
      input.locationId ?? null,
      input.value,
      input.revision,
      input.companyRevision,
      input.mutationId ?? randomUUID(),
    ],
  );
}

describe("Issue #267 SQL policy mutation boundary", () => {
  it("retains SECURITY DEFINER least privilege on the replaced function", async () => {
    const signature =
      "public.shift_presence_set_policy(uuid,uuid,uuid,text,uuid,uuid,text,text,boolean,integer,integer,uuid)";
    const functionAccess = await db.adminPool.query(
      `SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed,
       p.prosecdef AS security_definer,
       p.proconfig=ARRAY['search_path=pg_catalog, public']::text[] AS fixed_path,
       NOT EXISTS(
         SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
         WHERE a.grantee=0 AND a.privilege_type='EXECUTE'
       ) AS private
       FROM pg_proc p WHERE p.oid=$2::regprocedure`,
      [db.runtimeRole, signature],
    );
    expect(functionAccess.rows[0]).toEqual({
      allowed: true,
      security_definer: true,
      fixed_path: true,
      private: true,
    });
    const tableAccess = await db.adminPool.query(
      `SELECT has_table_privilege($1,'organizations','UPDATE') AS organizations,
              has_table_privilege($1,'locations','UPDATE') AS locations`,
      [db.runtimeRole],
    );
    expect(tableAccess.rows[0]).toEqual({
      organizations: false,
      locations: false,
    });
  });

  it("accepts REQUIRE and REQUIRE_OR_OVERRIDE with exact revisions and audit semantics", async () => {
    const fixture = await db.createFixture();
    const manager = await db.manager(fixture);
    const requireId = randomUUID();
    const first = await setPolicy(manager, fixture, {
      value: "REQUIRE",
      revision: 1,
      companyRevision: 1,
      mutationId: requireId,
    });
    expect(first.rows[0]?.revision).toBe(2);

    const overrideId = randomUUID();
    const second = await setPolicy(manager, fixture, {
      value: "REQUIRE_OR_OVERRIDE",
      revision: 2,
      companyRevision: 2,
      mutationId: overrideId,
    });
    expect(second.rows[0]?.revision).toBe(3);
    expect(
      (
        await db.adminPool.query(
          `SELECT shift_start_presence_mode,shift_presence_revision
           FROM organizations WHERE id=$1`,
          [fixture.organizationId],
        )
      ).rows[0],
    ).toEqual({
      shift_start_presence_mode: "REQUIRE_OR_OVERRIDE",
      shift_presence_revision: 3,
    });
    expect(
      (
        await db.adminPool.query(
          `SELECT count(*)::int AS count FROM audit_events
           WHERE id IN ($1,$2) AND event_type='SHIFT_PRESENCE_COMPANY_POLICY_CHANGED'`,
          [requireId, overrideId],
        )
      ).rows[0].count,
    ).toBe(2);

    const noOpId = randomUUID();
    expect(
      (
        await setPolicy(manager, fixture, {
          value: "REQUIRE_OR_OVERRIDE",
          revision: 3,
          companyRevision: 3,
          mutationId: noOpId,
        })
      ).rows[0]?.revision,
    ).toBe(3);
    expect(
      (
        await db.adminPool.query(
          `SELECT count(*)::int AS count FROM audit_events WHERE id=$1`,
          [noOpId],
        )
      ).rows[0].count,
    ).toBe(0);

    await expect(
      setPolicy(manager, fixture, {
        value: "REQUIRE",
        revision: 3,
        companyRevision: 3,
        mutationId: overrideId,
      }),
    ).rejects.toMatchObject({ code: "23505" });
    expect(
      (
        await db.adminPool.query(
          `SELECT shift_start_presence_mode,shift_presence_revision
           FROM organizations WHERE id=$1`,
          [fixture.organizationId],
        )
      ).rows[0],
    ).toEqual({
      shift_start_presence_mode: "REQUIRE_OR_OVERRIDE",
      shift_presence_revision: 3,
    });
  });

  it("keeps invalid mode, stale revision and stale inherited context fail-closed", async () => {
    const fixture = await db.createFixture();
    const manager = await db.manager(fixture);
    await setPolicy(manager, fixture, {
      value: "REQUIRE",
      revision: 1,
      companyRevision: 1,
    });
    await expect(
      setPolicy(manager, fixture, {
        value: "INVALID_MODE",
        revision: 2,
        companyRevision: 2,
      }),
    ).rejects.toMatchObject({
      code: "23514",
      message: expect.stringContaining("Presence policy mode invalid."),
    });
    await expect(
      setPolicy(manager, fixture, {
        value: "WARN_ONLY",
        revision: 1,
        companyRevision: 2,
      }),
    ).rejects.toMatchObject({ code: "40001" });
    await expect(
      setPolicy(manager, fixture, {
        value: "REQUIRE",
        revision: 1,
        companyRevision: 1,
        locationId: fixture.locationId,
      }),
    ).rejects.toMatchObject({ code: "40001" });
    expect(
      (
        await setPolicy(manager, fixture, {
          value: "REQUIRE",
          revision: 1,
          companyRevision: 2,
          locationId: fixture.locationId,
        })
      ).rows[0]?.revision,
    ).toBe(2);
  });

  it("keeps role authority and sensitive MFA mandatory", async () => {
    const fixture = await db.createFixture();
    const employeeSession = await db.session(fixture.userId, true);
    await expect(
      setPolicy(
        {
          userId: fixture.userId,
          membershipId: fixture.membershipId,
          context: employeeSession.context,
        },
        fixture,
        { value: "REQUIRE", revision: 1, companyRevision: 1 },
      ),
    ).rejects.toMatchObject({ code: "42501" });

    const manager = await db.manager(fixture);
    const unassured = await db.session(manager.userId, false);
    await expect(
      setPolicy(
        {
          userId: manager.userId,
          membershipId: manager.membershipId,
          context: unassured.context,
        },
        fixture,
        { value: "REQUIRE", revision: 1, companyRevision: 1 },
      ),
    ).rejects.toMatchObject({ code: "42501" });
    expect(
      (
        await db.adminPool.query(
          `SELECT shift_start_presence_mode,shift_presence_revision
           FROM organizations WHERE id=$1`,
          [fixture.organizationId],
        )
      ).rows[0],
    ).toEqual({ shift_start_presence_mode: "OFF", shift_presence_revision: 1 });
  });
});
