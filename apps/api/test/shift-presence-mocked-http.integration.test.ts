import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  endShiftResponseSchema,
  startShiftResponseSchema,
  shiftPresenceRecoveryResponseSchema,
} from "@valet/contracts";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { presenceHttp } from "./shift-presence-http-test-helper";
import {
  mockedHttpCase,
  mockedSignals,
  presenceActions,
  presencePrefix,
} from "./shift-presence-mocked-test-helper";

const db = new PresenceServerTestContext("presence-mocked-http");
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

describe.each(presenceActions)("real HTTP %s source signal", (action) => {
  it.each(mockedSignals)(
    "inside REQUIRE accepts %s, recovers exactly, and binds all three values",
    async (mocked) => {
      const c = await mockedHttpCase(db, http, action, mocked);
      const response = await http.request("POST", c.path, c.auth.token, c.body);
      expect(response.status).toBe(200);
      const schema =
        action === "START" ? startShiftResponseSchema : endShiftResponseSchema;
      expect(schema.parse(response.body).status).toBe(
        action === "START" ? "ACTIVE" : "ENDED",
      );
      const retry = await http.request("POST", c.path, c.auth.token, c.body);
      expect(retry.status).toBe(200);
      expect(retry.body).toEqual(response.body);
      for (const changed of mockedSignals.filter((value) => value !== mocked)) {
        const fix = { ...c.evidence.measurement };
        delete fix.mocked;
        const presence = {
          ...c.evidence,
          measurement: {
            ...fix,
            ...(changed === undefined ? {} : { mocked: changed }),
          },
        };
        const conflict = await http.request("POST", c.path, c.auth.token, {
          ...c.body,
          presence,
        });
        expect(conflict.status).toBe(409);
        expect(conflict.body).toMatchObject({
          code: "PRESENCE_OPERATION_CONFLICT",
        });
      }
      const status = await http.request(
        "GET",
        `${presencePrefix}/operations/${c.challenge.operationId}`,
        c.auth.token,
      );
      expect(status.status).toBe(200);
      expect(
        shiftPresenceRecoveryResponseSchema.parse(status.body),
      ).toMatchObject({
        state: "RECOVERABLE",
        status: "COMMITTED",
        result: response.body,
        summary: null,
      });
      expect(
        (
          await db.adminPool.query(
            `SELECT classification,reason FROM shift_presence_decisions WHERE membership_id=$1`,
            [c.fixture.membershipId],
          )
        ).rows,
      ).toEqual([{ classification: "CONFIDENT_INSIDE", reason: "INSIDE" }]);
      expect(await db.facts(c.fixture)).toEqual({
        shifts: 1,
        decisions: 1,
        starts: 1,
        ends: action === "START" ? 0 : 1,
      });
    },
  );

  it.each(mockedSignals)(
    "outside REQUIRE denies %s without Shift mutation",
    async (mocked) => {
      const c = await mockedHttpCase(db, http, action, mocked, "REQUIRE", 32.1);
      const response = await http.request("POST", c.path, c.auth.token, c.body);
      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        code: "PRESENCE_REJECTED",
      });
      const status = await http.request(
        "GET",
        `${presencePrefix}/operations/${c.challenge.operationId}`,
        c.auth.token,
      );
      expect(
        shiftPresenceRecoveryResponseSchema.parse(status.body),
      ).toMatchObject({
        state: "RECOVERABLE",
        status: "DENIED",
        result: null,
        summary: { classification: "CONFIDENT_OUTSIDE", reason: "OUTSIDE" },
      });
      expect(await db.facts(c.fixture)).toEqual({
        shifts: action === "START" ? 0 : 1,
        decisions: 0,
        starts: action === "START" ? 0 : 1,
        ends: 0,
      });
    },
  );

  it.each(mockedSignals)(
    "outside WARN_ONLY accepts %s under existing warning policy",
    async (mocked) => {
      const c = await mockedHttpCase(
        db,
        http,
        action,
        mocked,
        "WARN_ONLY",
        32.1,
      );
      const response = await http.request("POST", c.path, c.auth.token, c.body);
      expect(response.status).toBe(200);
      const status = await http.request(
        "GET",
        `${presencePrefix}/operations/${c.challenge.operationId}`,
        c.auth.token,
      );
      expect(
        shiftPresenceRecoveryResponseSchema.parse(status.body),
      ).toMatchObject({
        state: "RECOVERABLE",
        status: "COMMITTED",
        result: response.body,
        summary: null,
      });
      expect(
        (
          await db.adminPool.query(
            `SELECT classification,reason FROM shift_presence_decisions WHERE membership_id=$1`,
            [c.fixture.membershipId],
          )
        ).rows,
      ).toEqual([{ classification: "CONFIDENT_OUTSIDE", reason: "OUTSIDE" }]);
      expect(await db.facts(c.fixture)).toEqual({
        shifts: 1,
        decisions: 1,
        starts: 1,
        ends: action === "START" ? 0 : 1,
      });
    },
  );

  it("rejects a non-boolean at the API boundary without consuming the challenge", async () => {
    const c = await mockedHttpCase(db, http, action, undefined);
    const response = await http.request("POST", c.path, c.auth.token, {
      ...c.body,
      presence: {
        ...c.evidence,
        measurement: { ...c.evidence.measurement, mocked: "true" },
      },
    });
    expect(response.status).toBe(400);
    const status = await http.request(
      "GET",
      `${presencePrefix}/operations/${c.challenge.operationId}`,
      c.auth.token,
    );
    expect(
      shiftPresenceRecoveryResponseSchema.parse(status.body),
    ).toMatchObject({ state: "PENDING" });
    expect(await db.facts(c.fixture)).toEqual({
      shifts: action === "START" ? 0 : 1,
      decisions: 0,
      starts: action === "START" ? 0 : 1,
      ends: 0,
    });
  });
});
