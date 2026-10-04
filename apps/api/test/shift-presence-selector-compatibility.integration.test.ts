import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { noEvidenceCase } from "./shift-presence-no-evidence-test-helper";
import { presenceHttp } from "./shift-presence-http-test-helper";

const db = new PresenceServerTestContext("presence-selector-compatibility");
let http: Awaited<ReturnType<typeof presenceHttp>>;
beforeAll(async () => {
  await db.setup();
  http = await presenceHttp(db);
}, 120_000);
afterAll(async () => {
  await http?.app.close();
  await db.teardown();
}, 60_000);

describe("matching top-level and evidence selectors preserve measured fingerprint/recovery", () => {
  it.each(["START", "END"] as const)(
    "%s both selectors commit once and evidence-only terminal retry matches",
    async (action) => {
      const c = await noEvidenceCase(db, action, "WARN_ONLY");
      await db.zone(c.f);
      const presence = db.measured(c.challenge);
      const path =
        action === "START"
          ? "/v1/staff/shifts/start"
          : `/v1/staff/shifts/${c.shift!.shiftId}/end`;
      const intent =
        action === "START"
          ? { targetLocationId: c.f.locationId, presence }
          : { cashReported: "7", presence };
      const first = await http.request("POST", path, c.auth.token, {
        ...intent,
        operationId: c.challenge.operationId,
      });
      expect(first.status).toBe(200);
      const facts = await db.facts(c.f);
      const retry = await http.request("POST", path, c.auth.token, intent);
      expect(retry.status).toBe(200);
      expect(retry.body).toEqual(first.body);
      expect(await db.facts(c.f)).toEqual(facts);
      expect(await c.row()).toMatchObject({
        status: "COMMITTED",
        completion_basis: null,
      });
      expect(
        (
          await db.adminPool.query(
            `SELECT operation_id,classification,reason FROM shift_presence_decisions WHERE user_id=$1`,
            [c.f.userId],
          )
        ).rows,
      ).toEqual([
        {
          operation_id: c.challenge.operationId,
          classification: "CONFIDENT_INSIDE",
          reason: "INSIDE",
        },
      ]);
    },
  );
});
