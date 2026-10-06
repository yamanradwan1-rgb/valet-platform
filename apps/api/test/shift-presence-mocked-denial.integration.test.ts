import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { shiftPresenceRecoveryResponseSchema } from "@valet/contracts";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { presenceHttp } from "./shift-presence-http-test-helper";
import {
  mockedHttpCase,
  mockedSignals,
  presenceActions,
  presencePrefix,
} from "./shift-presence-mocked-test-helper";

const db = new PresenceServerTestContext("presence-mocked-denial");
let http: Awaited<ReturnType<typeof presenceHttp>>;
beforeAll(async () => {
  await db.setup();
  http = await presenceHttp(db);
}, 120_000);
afterAll(async () => {
  await http?.app.close();
  await db.teardown();
}, 60_000);

describe.each(presenceActions)("lost measured %s denial", (action) => {
  it.each(mockedSignals)(
    "recovers mocked=%s with only the existing minimized summary",
    async (mocked) => {
      const c = await mockedHttpCase(db, http, action, mocked, "REQUIRE", 32.1);
      const logs = [
        vi.spyOn(console, "log"),
        vi.spyOn(console, "error"),
        vi.spyOn(console, "warn"),
      ];
      try {
        await expect(
          http.request("POST", c.path, c.auth.token, c.body, "DISCONNECT"),
        ).rejects.toThrow();
        await http.app.close();
        http = await presenceHttp(db);
        const read = await http.request(
          "GET",
          `${presencePrefix}/operations/${c.challenge.operationId}`,
          c.auth.token,
        );
        expect(read.status).toBe(200);
        expect(
          shiftPresenceRecoveryResponseSchema.parse(read.body),
        ).toMatchObject({
          state: "RECOVERABLE",
          status: "DENIED",
          result: null,
          decisionId: null,
          denialReason: "PRESENCE_REJECTED",
          summary: { classification: "CONFIDENT_OUTSIDE", reason: "OUTSIDE" },
        });
        const retry = await http.request("POST", c.path, c.auth.token, c.body);
        expect(retry.status).toBe(422);
        expect(retry.body).toMatchObject({ code: "PRESENCE_REJECTED" });
        const operation = (
          await db.adminPool.query(
            `SELECT * FROM shift_presence_operations WHERE operation_id=$1`,
            [c.challenge.operationId],
          )
        ).rows[0];
        expect(operation.request_fingerprint).toMatch(/^[a-f0-9]{64}$/);
        expect(operation).toMatchObject({
          denial_classification: "CONFIDENT_OUTSIDE",
          denial_measurement_reason: "OUTSIDE",
        });
        const history = (
          await db.adminPool.query(
            `SELECT row_to_json(a) AS audit FROM audit_events a WHERE organization_id=$1`,
            [c.fixture.organizationId],
          )
        ).rows;
        const exceptions = (
          await db.adminPool.query(
            `SELECT * FROM shift_presence_exceptions WHERE user_id=$1`,
            [c.fixture.userId],
          )
        ).rows;
        expect(exceptions).toEqual([]);
        for (const material of [
          operation,
          history,
          exceptions,
          read.body,
          retry.body,
          logs.flatMap((spy) => spy.mock.calls),
        ]) {
          const serialized = JSON.stringify(material);
          for (const field of [
            "mocked",
            "latitude",
            "longitude",
            "accuracyMeters",
            "capturedAt",
            "measurement",
            "requestBody",
            "source",
          ]) {
            expect(serialized).not.toContain(`"${field}"`);
          }
          expect(serialized).not.toContain(c.evidence.measurement.capturedAt);
        }
        expect(await db.facts(c.fixture)).toEqual({
          shifts: action === "START" ? 0 : 1,
          decisions: 0,
          starts: action === "START" ? 0 : 1,
          ends: 0,
        });
      } finally {
        for (const log of logs) log.mockRestore();
      }
    },
  );
});
