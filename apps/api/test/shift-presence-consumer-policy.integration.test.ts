import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { shiftPresenceChallengeResponseSchema } from "@valet/contracts";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { presenceHttp } from "./shift-presence-http-test-helper";

const db = new PresenceServerTestContext("presence-consumer-policy");
let http: Awaited<ReturnType<typeof presenceHttp>>;
const prefix = "/v1/staff/shifts/presence";
beforeAll(async () => {
  await db.setup();
  await db.permitStrictFixtures();
  http = await presenceHttp(db);
}, 120_000);
afterAll(async () => {
  await http?.app.close();
  await db.teardown();
}, 60_000);

describe("employee-authorized current action acquisition guidance", () => {
  it("publishes OFF and Company WARN_ONLY before acquisition without changing legacy success", async () => {
    const f = await db.createFixture();
    const auth = await db.session(f.userId);
    const issue = () =>
      http.request("POST", `${prefix}/challenges`, auth.token, {
        action: "START",
        targetLocationId: f.locationId,
        operationId: randomUUID(),
      });
    expect(
      shiftPresenceChallengeResponseSchema.parse((await issue()).body).presence,
    ).toEqual({
      mode: "OFF",
      maxAccuracyMeters: 50,
      maxFixAgeSeconds: 30,
    });
    await db.policy(f, "WARN_ONLY");
    expect(
      shiftPresenceChallengeResponseSchema.parse((await issue()).body).presence
        .mode,
    ).toBe("WARN_ONLY");
    expect(
      (
        await http.request("POST", "/v1/staff/shifts/start", auth.token, {
          targetLocationId: f.locationId,
        })
      ).body,
    ).toMatchObject({ status: "ACTIVE" });
  });
  it("inherits bounds independently and GET returns current action mode rather than issuance policy", async () => {
    const f = await db.createFixture();
    const auth = await db.session(f.userId);
    await db.policy(f, "WARN_ONLY", "REQUIRE");
    await db.adminPool.query(
      `UPDATE organizations SET shift_presence_max_accuracy_meters=40,
      shift_presence_max_fix_age_seconds=20 WHERE id=$1`,
      [f.organizationId],
    );
    await db.adminPool.query(
      `UPDATE locations SET shift_start_presence_mode_override='REQUIRE_OR_OVERRIDE',
      shift_presence_max_accuracy_meters_override=25 WHERE id=$1`,
      [f.locationId],
    );
    const a = await db.challenge(f, auth.context);
    expect(a.presence).toEqual({
      mode: "REQUIRE_OR_OVERRIDE",
      maxAccuracyMeters: 25,
      maxFixAgeSeconds: 20,
    });
    await db.adminPool.query(
      `UPDATE locations SET shift_start_presence_mode_override='OFF',
      shift_presence_max_fix_age_seconds_override=15 WHERE id=$1`,
      [f.locationId],
    );
    const current = await http.request(
      "GET",
      `${prefix}/operations/${a.operationId}/challenge`,
      auth.token,
    );
    const reread = shiftPresenceChallengeResponseSchema.parse(current.body);
    expect(reread.challengeId).toBe(a.challengeId);
    expect(reread.presence).toEqual({
      mode: "OFF",
      maxAccuracyMeters: 25,
      maxFixAgeSeconds: 15,
    });
    expect(Object.keys(reread.presence).sort()).toEqual([
      "maxAccuracyMeters",
      "maxFixAgeSeconds",
      "mode",
    ]);
    const shift = await db.start(f, auth.context);
    const end = await db.challenge(f, auth.context, shift.shiftId, "1.000");
    expect(end.presence).toEqual({
      mode: "REQUIRE",
      maxAccuracyMeters: 25,
      maxFixAgeSeconds: 15,
    });
  });
  it("final command uses changed current policy, never permissive old challenge guidance", async () => {
    const f = await db.createFixture();
    const auth = await db.session(f.userId);
    const a = await db.challenge(f, auth.context);
    expect(a.presence.mode).toBe("OFF");
    await db.zone(f);
    await db.policy(f, "REQUIRE");
    await expect(
      db.start(f, auth.context, db.measured(a, 32.1)),
    ).rejects.toMatchObject({ code: "PRESENCE_REJECTED" });
    expect(await db.facts(f)).toEqual({
      shifts: 0,
      decisions: 0,
      starts: 0,
      ends: 0,
    });
    expect(await db.presence.status(auth.context, a.operationId)).toMatchObject(
      {
        status: "DENIED",
        summary: { classification: "CONFIDENT_OUTSIDE", reason: "OUTSIDE" },
      },
    );
  });
  it("conceals foreign target and challenge selectors without publishing policy", async () => {
    const owner = await db.createFixture();
    const ownAuth = await db.session(owner.userId);
    const a = await db.challenge(owner, ownAuth.context);
    const foreign = await db.createFixture();
    const auth = await db.session(foreign.userId);
    const denied = await http.request(
      "POST",
      `${prefix}/challenges`,
      auth.token,
      {
        action: "START",
        targetLocationId: owner.locationId,
        operationId: randomUUID(),
      },
    );
    expect(denied.status).toBe(404);
    const read = await http.request(
      "GET",
      `${prefix}/operations/${a.operationId}/challenge`,
      auth.token,
    );
    expect(read.status).toBe(409);
    expect(read.body).not.toHaveProperty("presence");
    expect(
      (
        await http.request(
          "GET",
          `${prefix}/operations/${a.operationId}`,
          auth.token,
        )
      ).body,
    ).toEqual({
      state: "EXPIRED",
      operationId: a.operationId,
    });
  });
});
