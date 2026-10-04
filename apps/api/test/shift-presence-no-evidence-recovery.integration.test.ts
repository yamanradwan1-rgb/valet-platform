import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  shiftPresenceRecoveryResponseSchema,
  startShiftResponseSchema,
  endShiftResponseSchema,
} from "@valet/contracts";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { presenceHttp } from "./shift-presence-http-test-helper";

const db = new PresenceServerTestContext("presence-no-evidence-recovery");
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

describe("correlated evidence-free Shift result after real acknowledgement loss", () => {
  it.each([
    ["START", "OFF"],
    ["END", "OFF"],
    ["START", "WARN_ONLY"],
    ["END", "WARN_ONLY"],
  ] as const)(
    "%s %s uses O only and survives Nest reconstruction",
    async (action, mode) => {
      const f = await db.createFixture();
      const auth = await db.session(f.userId);
      const shift = action === "END" ? await db.start(f, auth.context) : null;
      await db.policy(f, mode);
      const operationId = randomUUID();
      const intent =
        action === "START"
          ? { action, targetLocationId: f.locationId, operationId }
          : {
              action,
              shiftId: shift!.shiftId,
              cashReported: "7.000",
              operationId,
            };
      const issue = await http.request(
        "POST",
        `${prefix}/challenges`,
        auth.token,
        intent,
      );
      expect(issue.status).toBe(200);
      const challengeId = issue.body.challengeId;
      const body =
        action === "START"
          ? { targetLocationId: f.locationId, operationId }
          : { cashReported: "7.000", operationId };
      const path =
        action === "START"
          ? "/v1/staff/shifts/start"
          : `/v1/staff/shifts/${shift!.shiftId}/end`;
      await expect(
        http.request("POST", path, auth.token, body, "DISCONNECT"),
      ).rejects.toThrow();
      await http.app.close();
      http = await presenceHttp(db);
      const read = await http.request(
        "GET",
        `${prefix}/operations/${operationId}`,
        auth.token,
      );
      expect(read.status).toBe(200);
      const recovered = shiftPresenceRecoveryResponseSchema.parse(read.body);
      expect(recovered).toMatchObject({
        state: "RECOVERABLE",
        action,
        status: "COMMITTED",
        operationId,
        summary: null,
      });
      if (recovered.state !== "RECOVERABLE")
        throw new Error("Expected exact result");
      const original =
        action === "START"
          ? startShiftResponseSchema.parse(recovered.result)
          : endShiftResponseSchema.parse(recovered.result);
      expect(original.locationId).toBe(f.locationId);
      if (action === "END") {
        const ended = endShiftResponseSchema.parse(original);
        expect(ended.shiftId).toBe(shift!.shiftId);
        expect(ended.cashReconciliation).toEqual({
          cashExpected: "0.000",
          cashReported: "7.000",
          cashVariance: "7.000",
          currency: "JOD",
          reportedAt: ended.endedAt,
        });
      }
      const ops = (
        await db.adminPool.query(
          "SELECT * FROM shift_presence_operations WHERE user_id=$1",
          [f.userId],
        )
      ).rows;
      expect(ops).toHaveLength(1);
      expect(ops[0]).toMatchObject({
        operation_id: operationId,
        status: "COMMITTED",
        result_shift_id: original.shiftId,
        completion_basis: mode === "OFF" ? "OFF_NO_EVIDENCE" : null,
      });
      const decisions = (
        await db.adminPool.query(
          "SELECT * FROM shift_presence_decisions WHERE user_id=$1",
          [f.userId],
        )
      ).rows;
      if (mode === "OFF") {
        expect(decisions).toHaveLength(0);
        expect(recovered.decisionId).toBeNull();
      } else {
        expect(decisions).toHaveLength(1);
        expect(decisions[0]).toMatchObject({
          operation_id: operationId,
          challenge_id: challengeId,
          applied_mode: "WARN_ONLY",
          classification: "MEASUREMENT_UNUSABLE",
          reason: "INVALID_FIX",
          accuracy_band: "UNUSABLE",
          freshness_band: "UNUSABLE",
        });
      }
      const challenge = (
        await db.adminPool.query(
          "SELECT consumed_at FROM shift_presence_challenges WHERE id=$1",
          [challengeId],
        )
      ).rows[0];
      expect(challenge.consumed_at === null).toBe(mode === "OFF");
      const facts = await db.facts(f);
      // Explicit exact terminal command lookup is also idempotent; Native must use GET, never auto-replay.
      const retry = await http.request("POST", path, auth.token, body);
      expect(retry.status).toBe(200);
      expect(retry.body).toEqual(original);
      expect(await db.facts(f)).toEqual(facts);
      if (action === "END") {
        const changed = await http.request("POST", path, auth.token, {
          ...body,
          cashReported: "8",
        });
        expect(changed.status).toBe(409);
        expect(changed.body).toMatchObject({
          code: "PRESENCE_OPERATION_CONFLICT",
        });
      }
      for (const material of [ops, decisions, read.body]) {
        const serialized = JSON.stringify(material);
        for (const field of [
          "latitude",
          "longitude",
          "accuracy_meters",
          "captured_at",
          "request_payload",
          "metadata_json",
        ])
          expect(serialized).not.toContain(`"${field}"`);
      }
    },
  );

  it.each(["REQUIRE", "REQUIRE_OR_OVERRIDE"] as const)(
    "current %s without evidence terminalizes exact O, including lost denial",
    async (mode) => {
      const f = await db.createFixture();
      const auth = await db.session(f.userId);
      const challenge = await db.challenge(f, auth.context);
      await db.policy(f, mode);
      await expect(
        http.request(
          "POST",
          "/v1/staff/shifts/start",
          auth.token,
          {
            targetLocationId: f.locationId,
            operationId: challenge.operationId,
          },
          "DISCONNECT",
        ),
      ).rejects.toThrow();
      await http.app.close();
      http = await presenceHttp(db);
      const read = await http.request(
        "GET",
        `${prefix}/operations/${challenge.operationId}`,
        auth.token,
      );
      expect(
        shiftPresenceRecoveryResponseSchema.parse(read.body),
      ).toMatchObject({
        state: "RECOVERABLE",
        status: "DENIED",
        operationId: challenge.operationId,
        denialReason: "PRESENCE_REQUIRED",
        summary: null,
        result: null,
        decisionId: null,
      });
      expect(await db.facts(f)).toEqual({
        shifts: 0,
        decisions: 0,
        starts: 0,
        ends: 0,
      });
      expect(
        (
          await db.adminPool.query(
            "SELECT count(*)::int AS count FROM shift_presence_exceptions WHERE user_id=$1",
            [f.userId],
          )
        ).rows[0].count,
      ).toBe(0);
    },
  );

  it("recovers original OFF Start before a later ended/replacement Shift", async () => {
    const f = await db.createFixture();
    const auth = await db.session(f.userId);
    const challenge = await db.challenge(f, auth.context);
    const first = await http.request(
      "POST",
      "/v1/staff/shifts/start",
      auth.token,
      { targetLocationId: f.locationId, operationId: challenge.operationId },
    );
    expect(first.status).toBe(200);
    await db.end(f, String(first.body.shiftId));
    const later = await db.start(f, auth.context);
    expect(later.shiftId).not.toBe(first.body.shiftId);
    const read = await http.request(
      "GET",
      `${prefix}/operations/${challenge.operationId}`,
      auth.token,
    );
    expect(read.body.result).toEqual(first.body);
    const exact = await http.request(
      "POST",
      "/v1/staff/shifts/start",
      auth.token,
      { targetLocationId: f.locationId, operationId: challenge.operationId },
    );
    expect(exact.body).toEqual(first.body);
    expect(await db.facts(f)).toEqual({
      shifts: 2,
      decisions: 0,
      starts: 2,
      ends: 1,
    });
  });

  it.each(["OFF", "WARN_ONLY"] as const)(
    "legacy %s omission still works without a challenge",
    async (mode) => {
      const f = await db.createFixture();
      await db.policy(f, mode);
      const auth = await db.session(f.userId);
      const start = await http.request(
        "POST",
        "/v1/staff/shifts/start",
        auth.token,
        { targetLocationId: f.locationId },
      );
      expect(start.status).toBe(200);
      const end = await http.request(
        "POST",
        `/v1/staff/shifts/${start.body.shiftId}/end`,
        auth.token,
        { cashReported: "0" },
      );
      expect(end.status).toBe(200);
      expect(startShiftResponseSchema.safeParse(start.body).success).toBe(true);
      expect(endShiftResponseSchema.safeParse(end.body).success).toBe(true);
      expect(
        (
          await db.adminPool.query(
            "SELECT count(*)::int AS count FROM shift_presence_operations WHERE user_id=$1",
            [f.userId],
          )
        ).rows[0].count,
      ).toBe(mode === "OFF" ? 0 : 2);
    },
  );
});
