import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { shiftPresenceRecoveryResponseSchema } from "@valet/contracts";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { presenceHttp } from "./shift-presence-http-test-helper";

const db = new PresenceServerTestContext("presence-consumer-recovery");
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

describe("durable minimized denial recovery after real HTTP loss", () => {
  it.each([
    ["OUTSIDE", "CONFIDENT_OUTSIDE", 32.1, 5, 0],
    ["EDGE", "AMBIGUOUS_EDGE", 31.95088, 5, 0],
    ["INACCURATE_FIX", "MEASUREMENT_UNUSABLE", 31.95, 100, 0],
    ["STALE_FIX", "MEASUREMENT_UNUSABLE", 31.95, 5, 3],
    ["FUTURE_FIX", "MEASUREMENT_UNUSABLE", 31.95, 5, -60],
    ["NO_ACTIVE_ZONE", "CONFIGURATION_UNUSABLE", 31.95, 5, 0],
  ] as const)(
    "persists %s without private facts and recovers in a new Nest instance",
    async (reason, classification, latitude, accuracy, age) => {
      const f = await db.createFixture();
      await db.policy(f, "REQUIRE_OR_OVERRIDE");
      if (reason !== "NO_ACTIVE_ZONE") await db.zone(f);
      if (reason === "STALE_FIX")
        await db.adminPool.query(
          `UPDATE organizations
      SET shift_presence_max_fix_age_seconds=1 WHERE id=$1`,
          [f.organizationId],
        );
      const auth = await db.session(f.userId);
      const a = await db.challenge(f, auth.context);
      const evidence = db.measured(a, latitude);
      evidence.measurement.accuracyMeters = accuracy;
      evidence.measurement.capturedAt = new Date(
        Date.now() - age * 1000,
      ).toISOString();
      const logs = [
        vi.spyOn(console, "log"),
        vi.spyOn(console, "error"),
        vi.spyOn(console, "warn"),
      ];
      try {
        await expect(
          http.request(
            "POST",
            "/v1/staff/shifts/start",
            auth.token,
            {
              targetLocationId: f.locationId,
              presence: evidence,
            },
            "DISCONNECT",
          ),
        ).rejects.toThrow();
        await http.app.close();
        http = await presenceHttp(db);
        const read = await http.request(
          "GET",
          `${prefix}/operations/${a.operationId}`,
          auth.token,
        );
        expect(read.status).toBe(200);
        expect(
          shiftPresenceRecoveryResponseSchema.parse(read.body),
        ).toMatchObject({
          state: "RECOVERABLE",
          status: "DENIED",
          result: null,
          denialReason: "PRESENCE_REJECTED",
          summary: { classification, reason },
        });
        const persisted = (
          await db.adminPool.query(
            `SELECT * FROM shift_presence_operations WHERE operation_id=$1`,
            [a.operationId],
          )
        ).rows[0];
        expect(persisted).toMatchObject({
          denial_classification: classification,
          denial_measurement_reason: reason,
        });
        const audits = (
          await db.adminPool.query(
            `SELECT * FROM audit_events WHERE organization_id=$1`,
            [f.organizationId],
          )
        ).rows;
        const exceptions = (
          await db.adminPool.query(
            `SELECT * FROM shift_presence_exceptions WHERE user_id=$1`,
            [f.userId],
          )
        ).rows;
        for (const material of [
          persisted,
          audits,
          exceptions,
          read.body,
          logs.flatMap((spy) => spy.mock.calls),
        ]) {
          const serialized = JSON.stringify(material);
          for (const field of [
            "latitude",
            "longitude",
            "accuracyMeters",
            "capturedAt",
            "distance",
            "measurement",
            "requestBody",
          ]) {
            // The typed field denial_measurement_reason is allowed; generic measurement is not.
            expect(serialized).not.toContain(`"${field}"`);
          }
          expect(serialized).not.toContain(evidence.measurement.capturedAt);
        }
        expect(exceptions).toEqual([]); // Denial/read never allocate Operation B or approval.
        expect(
          (
            await db.adminPool.query(
              `SELECT count(*)::int AS count FROM shift_presence_operations WHERE user_id=$1`,
              [f.userId],
            )
          ).rows[0].count,
        ).toBe(1);
        expect(await db.facts(f)).toEqual({
          shifts: 0,
          decisions: 0,
          starts: 0,
          ends: 0,
        });
      } finally {
        for (const log of logs) log.mockRestore();
      }
    },
  );
  it("lost allocation/exception acknowledgements recover exact selectors without new allocation", async () => {
    const f = await db.createFixture();
    await db.policy(f, "REQUIRE_OR_OVERRIDE");
    const auth = await db.session(f.userId);
    const operationId = randomUUID();
    await expect(
      http.request(
        "POST",
        `${prefix}/challenges`,
        auth.token,
        {
          action: "START",
          targetLocationId: f.locationId,
          operationId,
        },
        "DISCONNECT",
      ),
    ).rejects.toThrow();
    expect(
      (
        await http.request(
          "GET",
          `${prefix}/operations/${operationId}`,
          auth.token,
        )
      ).body,
    ).toEqual({ state: "PENDING", operationId, exceptionId: null });
    const challenge = (
      await http.request(
        "GET",
        `${prefix}/operations/${operationId}/challenge`,
        auth.token,
      )
    ).body;
    const command = {
      challengeId: challenge.challengeId,
      reason: "GPS_UNAVAILABLE",
    };
    await expect(
      http.request(
        "POST",
        `${prefix}/operations/${operationId}/exception`,
        auth.token,
        command,
        "DISCONNECT",
      ),
    ).rejects.toThrow();
    const recovered = await http.request(
      "GET",
      `${prefix}/operations/${operationId}`,
      auth.token,
    );
    expect(recovered.body.exceptionId).toEqual(expect.any(String));
    expect(
      (
        await http.request(
          "GET",
          `${prefix}/exceptions/${recovered.body.exceptionId}`,
          auth.token,
        )
      ).body,
    ).toMatchObject({ status: "PENDING", reason: "GPS_UNAVAILABLE" });
    expect(
      (
        await db.adminPool.query(
          `SELECT count(*)::int AS count FROM shift_presence_exceptions WHERE user_id=$1`,
          [f.userId],
        )
      ).rows[0].count,
    ).toBe(1);
    expect(
      (
        await db.adminPool.query(
          `SELECT count(*)::int AS count FROM shift_presence_operations WHERE user_id=$1`,
          [f.userId],
        )
      ).rows[0].count,
    ).toBe(1);
    expect(await db.facts(f)).toEqual({
      shifts: 0,
      decisions: 0,
      starts: 0,
      ends: 0,
    });
  });
});
