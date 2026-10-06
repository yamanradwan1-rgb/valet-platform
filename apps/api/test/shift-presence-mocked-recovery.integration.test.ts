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

const db = new PresenceServerTestContext("presence-mocked-recovery");
let http: Awaited<ReturnType<typeof presenceHttp>>;
beforeAll(async () => {
  await db.setup();
  http = await presenceHttp(db);
}, 120_000);
afterAll(async () => {
  await http?.app.close();
  await db.teardown();
}, 60_000);

describe.each(presenceActions)(
  "real lost %s response with retained-key recovery",
  (action) => {
    it.each(mockedSignals)(
      "recovers %s after restart without raw evidence in storage, response or logs",
      async (mocked) => {
        const c = await mockedHttpCase(db, http, action, mocked);
        const original = process.env.SHIFT_PRESENCE_FINGERPRINT_KEY!;
        process.env.SHIFT_PRESENCE_FINGERPRINT_KEY = Buffer.alloc(
          32,
          9,
        ).toString("base64");
        process.env.SHIFT_PRESENCE_PREVIOUS_FINGERPRINT_KEYS = JSON.stringify([
          original,
        ]);
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
            status: "COMMITTED",
            result: { status: action === "START" ? "ACTIVE" : "ENDED" },
            summary: null,
          });
          const retry = await http.request(
            "POST",
            c.path,
            c.auth.token,
            c.body,
          );
          expect(retry.status).toBe(200);
          expect(retry.body).toEqual(read.body.result);
          const rows = await db.adminPool.query(
            `SELECT row_to_json(o) AS operation, row_to_json(d) AS decision,
          row_to_json(c) AS challenge
        FROM shift_presence_operations o
        JOIN shift_presence_challenges c ON c.operation_row_id=o.id
        JOIN shift_presence_decisions d ON d.id=o.result_decision_id
        WHERE o.operation_id=$1`,
            [c.challenge.operationId],
          );
          expect(rows.rowCount).toBe(1);
          expect(rows.rows[0].decision).toMatchObject({
            classification: "CONFIDENT_INSIDE",
            reason: "INSIDE",
          });
          expect(rows.rows[0].operation.request_fingerprint).toMatch(
            /^[a-f0-9]{64}$/,
          );
          const audits = (
            await db.adminPool.query(
              `SELECT * FROM audit_events WHERE organization_id=$1`,
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
            rows.rows,
            audits,
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
            shifts: 1,
            decisions: 1,
            starts: 1,
            ends: action === "START" ? 0 : 1,
          });
        } finally {
          for (const log of logs) log.mockRestore();
          process.env.SHIFT_PRESENCE_FINGERPRINT_KEY = original;
          delete process.env.SHIFT_PRESENCE_PREVIOUS_FINGERPRINT_KEYS;
        }
      },
    );
  },
);
