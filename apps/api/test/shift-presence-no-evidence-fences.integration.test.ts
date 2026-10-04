import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { noEvidenceCase } from "./shift-presence-no-evidence-test-helper";
import { presenceHttp } from "./shift-presence-http-test-helper";
import { createStartShiftCommandExecutor } from "../src/modules/shifts/start-shift-command";
import { createEndShiftCommandExecutor } from "../src/modules/shifts/end-shift-command";

const db = new PresenceServerTestContext("presence-no-evidence-fences");
let http: Awaited<ReturnType<typeof presenceHttp>>;
beforeAll(async () => {
  await db.setup();
  await db.permitStrictFixtures();
  http = await presenceHttp(db);
}, 120_000);
afterAll(async () => {
  await http?.app.close();
  await db.teardown();
}, 60_000);

describe("correlation is neither authority nor permission to change the exact intent", () => {
  it("safe-own-End remains available after membership/location access loss", async () => {
    const c = await noEvidenceCase(db, "END");
    await db.adminPool.query(
      `DELETE FROM membership_location_access WHERE membership_id=$1`,
      [c.f.membershipId],
    );
    await db.adminPool.query(
      `UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1`,
      [c.f.membershipId],
    );
    expect((await c.run()).status).toBe("ENDED");
    expect(
      await db.presence.status(c.auth.context, c.challenge.operationId),
    ).toMatchObject({
      status: "COMMITTED",
      result: { shiftId: c.shift!.shiftId },
    });
  });

  it("canonical open work blocks correlated End before binding or consumption", async () => {
    const c = await noEvidenceCase(db, "END", "WARN_ONLY");
    const vehicle = randomUUID(),
      visit = randomUUID();
    await db.adminPool.query(
      `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at) VALUES($1,$2,'Synthetic work',clock_timestamp())`,
      [vehicle, c.f.organizationId],
    );
    await db.adminPool.query(
      `INSERT INTO valet_sessions(id,organization_id,location_id,vehicle_id,checked_in_by_membership_id,state,customer_access_token_hash,customer_access_expires_at,updated_at)
      VALUES($1,$2,$3,$4,$5,'AWAITING_PARKING',$6,clock_timestamp()+interval '1 hour',clock_timestamp())`,
      [
        visit,
        c.f.organizationId,
        c.f.locationId,
        vehicle,
        c.f.membershipId,
        `disabled:${randomUUID()}`,
      ],
    );
    await db.adminPool.query(
      `INSERT INTO tasks(id,organization_id,location_id,valet_session_id,task_type,status,current_assignee_membership_id,updated_at)
      VALUES($1,$2,$3,$4,'PARKING','IN_PROGRESS',$5,clock_timestamp())`,
      [
        randomUUID(),
        c.f.organizationId,
        c.f.locationId,
        visit,
        c.f.membershipId,
      ],
    );
    await expect(c.run()).rejects.toMatchObject({
      code: "OPEN_TASK_HANDOFF_REQUIRED",
    });
    expect(await c.row()).toMatchObject({
      status: "PENDING",
      request_fingerprint: null,
    });
    expect(await db.facts(c.f)).toEqual({
      shifts: 1,
      starts: 1,
      ends: 0,
      decisions: 0,
    });
  });

  it.each(["REQUIRE", "REQUIRE_OR_OVERRIDE"] as const)(
    "END lost %s denial survives fresh HTTP reconstruction",
    async (mode) => {
      const c = await noEvidenceCase(db, "END");
      await db.policy(c.f, mode);
      await expect(
        http.request(
          "POST",
          `/v1/staff/shifts/${c.shift!.shiftId}/end`,
          c.auth.token,
          { cashReported: "7", operationId: c.challenge.operationId },
          "DISCONNECT",
        ),
      ).rejects.toThrow();
      await http.app.close();
      http = await presenceHttp(db);
      const read = await http.request(
        "GET",
        `/v1/staff/shifts/presence/operations/${c.challenge.operationId}`,
        c.auth.token,
      );
      expect(read.status).toBe(200);
      expect(read.body).toMatchObject({
        state: "RECOVERABLE",
        status: "DENIED",
        denialReason: "PRESENCE_REQUIRED",
        result: null,
        decisionId: null,
        summary: null,
      });
      expect(await db.facts(c.f)).toEqual({
        shifts: 1,
        starts: 1,
        ends: 0,
        decisions: 0,
      });
    },
  );
  it.each(["START", "END"] as const)(
    "%s rejects invalid, foreign, unknown and conflicting evidence selectors before writes",
    async (action) => {
      const c = await noEvidenceCase(db, action);
      const foreign = await noEvidenceCase(db, action);
      const path =
        action === "START"
          ? "/v1/staff/shifts/start"
          : `/v1/staff/shifts/${c.shift!.shiftId}/end`;
      const intent =
        action === "START"
          ? { targetLocationId: c.f.locationId }
          : { cashReported: "7" };
      const facts = await db.facts(c.f);
      for (const [operationId, expected] of [
        ["invalid", 400],
        [randomUUID(), 404],
        [foreign.challenge.operationId, 404],
      ] as const) {
        const response = await http.request("POST", path, c.auth.token, {
          ...intent,
          operationId,
        });
        expect(response.status).toBe(expected);
        expect(response.body).not.toHaveProperty("organizationId");
        expect(response.body).not.toHaveProperty("locationId");
      }
      const mismatch = await http.request("POST", path, c.auth.token, {
        ...intent,
        operationId: c.challenge.operationId,
        presence: db.measured(foreign.challenge),
      });
      expect(mismatch.status).toBe(400);
      expect(await db.facts(c.f)).toEqual(facts);
      expect(await c.row()).toMatchObject({
        status: "PENDING",
        request_fingerprint: null,
      });
      expect(
        (
          await db.adminPool.query(
            `SELECT count(*)::int AS n FROM shift_presence_operations WHERE user_id=$1`,
            [c.f.userId],
          )
        ).rows[0].n,
      ).toBe(1);
    },
  );

  it("same User cannot substitute a Location or membership/Organization", async () => {
    const c = await noEvidenceCase(db, "START");
    const locationId = await db.addLocation(c.f);
    const other = await db.createFixture({}, c.f.userId);
    for (const targetLocationId of [locationId, other.locationId]) {
      await expect(
        createStartShiftCommandExecutor(db.runtimePool)({
          authenticatedUserId: c.f.userId,
          targetLocationId,
          operationId: c.challenge.operationId,
          sessionContext: c.auth.context,
        }),
      ).rejects.toMatchObject({ code: "PRESENCE_OPERATION_CONFLICT" });
    }
    expect(await c.row()).toMatchObject({
      status: "PENDING",
      request_fingerprint: null,
    });
    expect((await db.facts(c.f)).shifts).toBe(0);
    expect((await db.facts(other)).shifts).toBe(0);
  });

  it("END rejects changed cash, wrong Shift and START identity while canonical cash remains equivalent", async () => {
    const c = await noEvidenceCase(db, "END");
    const end = createEndShiftCommandExecutor(db.runtimePool);
    const intent = {
      authenticatedUserId: c.f.userId,
      shiftId: c.shift!.shiftId,
      sessionContext: c.auth.context,
      operationId: c.challenge.operationId,
    };
    for (const cashReported of ["8", "7.0001"])
      await expect(end({ ...intent, cashReported })).rejects.toThrow();
    const start = await db.challenge(c.f, c.auth.context);
    await expect(
      end({ ...intent, cashReported: "7", operationId: start.operationId }),
    ).rejects.toMatchObject({ code: "PRESENCE_OPERATION_CONFLICT" });
    expect(await c.row()).toMatchObject({
      status: "PENDING",
      request_fingerprint: null,
    });
    const committed = await end({ ...intent, cashReported: "7" });
    expect(await end({ ...intent, cashReported: "7.000" })).toEqual(committed);
    const later = await db.start(c.f, c.auth.context);
    await expect(
      end({ ...intent, shiftId: later.shiftId, cashReported: "7" }),
    ).rejects.toMatchObject({ code: "PRESENCE_OPERATION_CONFLICT" });
    expect((await db.facts(c.f)).ends).toBe(1);
  });

  it("fresh Start eligibility revocation denies before Operation binding", async () => {
    const c = await noEvidenceCase(db, "START");
    await db.adminPool.query(
      `DELETE FROM membership_location_access WHERE membership_id=$1`,
      [c.f.membershipId],
    );
    await expect(c.run()).rejects.toThrow();
    expect(await c.row()).toMatchObject({
      status: "PENDING",
      request_fingerprint: null,
    });
    expect((await db.facts(c.f)).shifts).toBe(0);
  });

  for (const action of ["START", "END"] as const) {
    it.each(["OFF", "WARN_ONLY"] as const)(
      `${action} %s audit failure rolls back business facts, O, Decision and challenge`,
      async (mode) => {
        const c = await noEvidenceCase(db, action, mode);
        const donor = await db.createFixture();
        const donorShift = await db.start(donor);
        const duplicate = (
          await db.adminPool.query(
            `SELECT id FROM audit_events WHERE entity_id=$1 AND event_type='SHIFT_STARTED'`,
            [donorShift.shiftId],
          )
        ).rows[0].id as string;
        const facts = await db.facts(c.f);
        await expect(
          c.run(db.runtimePool, () => duplicate),
        ).rejects.toMatchObject({ code: "23505" });
        expect(await db.facts(c.f)).toEqual(facts);
        expect(await c.row()).toMatchObject({
          status: "PENDING",
          request_fingerprint: null,
          request_policy_fingerprint: null,
          result_shift_id: null,
          result_decision_id: null,
          completion_basis: null,
        });
        expect(
          (
            await db.adminPool.query(
              `SELECT consumed_at FROM shift_presence_challenges WHERE id=$1`,
              [c.challenge.challengeId],
            )
          ).rows[0].consumed_at,
        ).toBeNull();
        if (action === "END")
          expect(
            (
              await db.adminPool.query(
                `SELECT status,cash_reported,cash_reported_at FROM shifts WHERE id=$1`,
                [c.shift!.shiftId],
              )
            ).rows[0],
          ).toEqual({
            status: "ACTIVE",
            cash_reported: null,
            cash_reported_at: null,
          });
      },
    );
  }
});
