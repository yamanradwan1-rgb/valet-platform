import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { shiftPresenceChallengeResponseSchema } from "@valet/contracts";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { presenceAbuseLimits } from "../src/modules/shifts/shift-presence-anti-abuse";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { presenceHttp } from "./shift-presence-http-test-helper";

const db = new PresenceServerTestContext("presence-consumer-continuation");
let http: Awaited<ReturnType<typeof presenceHttp>>;
const prefix = "/v1/staff/shifts/presence";
beforeAll(async () => {
  await db.setup();
  http = await presenceHttp(db);
}, 120_000);
afterAll(async () => {
  await http?.app.close();
  await db.teardown();
}, 60_000);

describe("terminal measured A followed by explicit fresh exception B", () => {
  it.each(["START", "END"] as const)(
    "commits %s only after fresh exact approval and explicit continuation",
    async (action) => {
      const f = await db.createFixture();
      const shiftId =
        action === "END" ? (await db.start(f)).shiftId : undefined;
      await db.policy(f, "REQUIRE_OR_OVERRIDE");
      await db.zone(f);
      const auth = await db.session(f.userId);
      const path =
        action === "START"
          ? "/v1/staff/shifts/start"
          : `/v1/staff/shifts/${shiftId}/end`;
      const intent = (cashReported: string) =>
        action === "START"
          ? {
              action,
              targetLocationId: f.locationId,
              operationId: randomUUID(),
            }
          : { action, shiftId, cashReported, operationId: randomUUID() };
      const body = (cashReported: string) =>
        action === "START"
          ? { targetLocationId: f.locationId }
          : { cashReported };
      const a = shiftPresenceChallengeResponseSchema.parse(
        (
          await http.request(
            "POST",
            `${prefix}/challenges`,
            auth.token,
            intent("1"),
          )
        ).body,
      );
      const rejected = await http.request("POST", path, auth.token, {
        ...body("1"),
        presence: db.measured(a, 32.1),
      });
      expect(rejected.status).toBe(422);
      const terminal = (
        await http.request(
          "GET",
          `${prefix}/operations/${a.operationId}`,
          auth.token,
        )
      ).body;
      expect(terminal).toMatchObject({
        status: "DENIED",
        summary: { classification: "CONFIDENT_OUTSIDE", reason: "OUTSIDE" },
      });
      expect(
        (
          await http.request(
            "POST",
            `${prefix}/operations/${a.operationId}/exception`,
            auth.token,
            {
              challengeId: a.challengeId,
              reason: "OUTSIDE_ZONE",
            },
          )
        ).body,
      ).toMatchObject({ code: "PRESENCE_OPERATION_EXPIRED" });
      for (const status of ["PENDING", "COMMITTED"])
        await expect(
          db.adminPool.query(
            `UPDATE shift_presence_operations SET status=$2 WHERE operation_id=$1`,
            [a.operationId, status],
          ),
        ).rejects.toMatchObject({ code: "23514" });
      expect(
        (
          await db.adminPool.query(
            `SELECT count(*)::int AS count FROM shift_presence_operations WHERE user_id=$1`,
            [f.userId],
          )
        ).rows[0].count,
      ).toBe(1);
      // Explicit approval action: B uses new identity and current END cash, never A's intent.
      const b = shiftPresenceChallengeResponseSchema.parse(
        (
          await http.request(
            "POST",
            `${prefix}/challenges`,
            auth.token,
            intent("2.000"),
          )
        ).body,
      );
      expect(b.operationId).not.toBe(a.operationId);
      expect(b.presence.mode).toBe("REQUIRE_OR_OVERRIDE");
      const requested = await http.request(
        "POST",
        `${prefix}/operations/${b.operationId}/exception`,
        auth.token,
        {
          challengeId: b.challengeId,
          reason: "OUTSIDE_ZONE",
        },
      );
      expect(requested.status).toBe(200);
      const manager = await db.manager(f);
      await db.management.review(
        manager.context,
        manager.target,
        String(requested.body.exceptionId),
        {
          expectedRevision: 1,
          mutationId: randomUUID(),
        },
        "APPROVED",
      );
      expect(
        (
          await http.request(
            "GET",
            `${prefix}/exceptions/${requested.body.exceptionId}`,
            auth.token,
          )
        ).body.status,
      ).toBe("APPROVED");
      expect(await db.facts(f)).toEqual({
        shifts: action === "END" ? 1 : 0,
        decisions: 0,
        starts: action === "END" ? 1 : 0,
        ends: 0,
      });
      const presence = {
        kind: "EXCEPTION",
        operationId: b.operationId,
        challengeId: b.challengeId,
        exceptionId: requested.body.exceptionId,
      };
      if (action === "END") {
        expect(
          (
            await http.request("POST", path, auth.token, {
              ...body("3"),
              presence,
            })
          ).body.code,
        ).toBe("PRESENCE_OPERATION_CONFLICT");
        expect(
          (
            await http.request(
              "GET",
              `${prefix}/exceptions/${presence.exceptionId}`,
              auth.token,
            )
          ).body.status,
        ).toBe("APPROVED");
      }
      const committed = await http.request("POST", path, auth.token, {
        ...body("2"),
        presence,
      });
      expect(committed.status).toBe(200);
      if (action === "END")
        expect(committed.body).toMatchObject({
          cashReconciliation: { cashReported: "2.000" },
        });
      expect(
        (
          await http.request("POST", path, auth.token, {
            ...body("2.000"),
            presence,
          })
        ).body,
      ).toEqual(committed.body);
      expect(
        (
          await http.request(
            "GET",
            `${prefix}/operations/${b.operationId}`,
            auth.token,
          )
        ).body,
      ).toMatchObject({
        status: "COMMITTED",
        summary: null,
        result: committed.body,
      });
      expect(
        (
          await http.request(
            "GET",
            `${prefix}/operations/${a.operationId}`,
            auth.token,
          )
        ).body,
      ).toEqual(terminal);
      expect(await db.facts(f)).toEqual({
        shifts: 1,
        decisions: 1,
        starts: 1,
        ends: action === "END" ? 1 : 0,
      });
      for (const [kind, expected] of [
        ["CHALLENGE", 2],
        ["EXCEPTION", 2],
      ] as const) {
        const key = new AntiAbuseKeyDeriver().derive(
          presenceAbuseLimits[kind].scope,
          f.userId,
        );
        expect(
          (
            await db.adminPool.query(
              `SELECT count(*)::int AS count FROM anti_abuse_events WHERE scope=$1 AND key_hash=$2`,
              [key.scope, key.keyHash],
            )
          ).rows[0].count,
        ).toBe(expected);
      }
    },
  );
  it.each(["REQUIRE", "REQUIRE_OR_OVERRIDE"] as const)(
    "permits local-style fallback only in %s according to current guidance",
    async (mode) => {
      const f = await db.createFixture();
      await db.policy(f, mode);
      const auth = await db.session(f.userId);
      for (const reason of [
        "LOCATION_UNAVAILABLE",
        "GPS_UNAVAILABLE",
        "AMBIGUOUS_FIX",
      ]) {
        const b = await db.challenge(f, auth.context);
        expect(b.presence.mode).toBe(mode);
        const request = await http.request(
          "POST",
          `${prefix}/operations/${b.operationId}/exception`,
          auth.token,
          { challengeId: b.challengeId, reason },
        );
        expect(request.status).toBe(mode === "REQUIRE" ? 422 : 200);
      }
      expect(await db.facts(f)).toEqual({
        shifts: 0,
        decisions: 0,
        starts: 0,
        ends: 0,
      });
    },
  );
});
