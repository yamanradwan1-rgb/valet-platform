import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  shiftPresenceChallengeResponseSchema,
  shiftPresenceRecoveryResponseSchema,
  shiftPresenceLocationResponseSchema,
  shiftPresenceManagementResultSchema,
} from "@valet/contracts";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { presenceHttp } from "./shift-presence-http-test-helper";

const db = new PresenceServerTestContext("presence-http");
let http: Awaited<ReturnType<typeof presenceHttp>>;
beforeAll(async () => {
  await db.setup();
  http = await presenceHttp(db);
}, 120_000);
afterAll(async () => {
  await http?.app.close();
  await db.teardown();
}, 60_000);
const operational = "/v1/staff/shifts/presence";
const company = (org: string) =>
  `/v1/staff/management/organizations/${org}/shift-presence`;

describe("real presence HTTP and fresh result reconciliation", () => {
  it("exposes the exact new challenge/recovery routes and unchanged old Start response", async () => {
    const f = await db.createFixture();
    await db.policy(f, "REQUIRE");
    await db.zone(f);
    const session = await db.session(f.userId);
    const issued = await http.request(
      "POST",
      `${operational}/challenges`,
      session.token,
      {
        action: "START",
        targetLocationId: f.locationId,
        operationId: randomUUID(),
      },
    );
    expect(issued.status).toBe(200);
    expect(issued.headers.get("cache-control")).toContain("no-store");
    const challenge = shiftPresenceChallengeResponseSchema.parse(issued.body);
    const evidence = db.measured(challenge);
    expect(
      (
        await http.request(
          "GET",
          `${operational}/operations/${challenge.operationId}/challenge`,
          session.token,
        )
      ).body,
    ).toEqual(issued.body);
    const started = await http.request(
      "POST",
      "/v1/staff/shifts/start",
      session.token,
      { targetLocationId: f.locationId, presence: evidence },
    );
    expect(started.status).toBe(200);
    expect(Object.keys(started.body).sort()).toEqual([
      "endedAt",
      "locationId",
      "shiftId",
      "startedAt",
      "status",
    ]);
    const recovery = await http.request(
      "GET",
      `${operational}/operations/${challenge.operationId}`,
      session.token,
    );
    expect(
      shiftPresenceRecoveryResponseSchema.parse(recovery.body),
    ).toMatchObject({
      state: "RECOVERABLE",
      status: "COMMITTED",
      result: started.body,
    });
    expect(await db.facts(f)).toEqual({
      shifts: 1,
      decisions: 1,
      starts: 1,
      ends: 0,
    });
  });
  it("registers separate CA and exact LM routes with strict bodies and no protected client replay", async () => {
    const f = await db.createFixture();
    const ca = await db.manager(f);
    const lm = await db.manager(f, "LOCATION_MANAGER");
    const caPath = `${company(f.organizationId)}/locations/${f.locationId}`;
    const lmPath = `/v1/staff/dashboard/locations/${f.locationId}/configuration/shift-presence`;
    for (const [path, token] of [
      [caPath, ca.token],
      [lmPath, lm.token],
    ] as const) {
      const read = await http.request("GET", `${path}/policy`, token);
      expect(read.status).toBe(200);
      expect(
        shiftPresenceLocationResponseSchema.parse(read.body),
      ).toMatchObject({
        locationId: f.locationId,
        readiness: { strictActivationAllowed: true },
      });
      expect(
        (await http.request("GET", `${path}/zones?limit=1`, token)).body,
      ).toEqual({ items: [], nextCursor: null });
      expect(
        (
          await http.request("PUT", `${path}/policy/override`, token, {
            organizationId: f.organizationId,
          })
        ).status,
      ).toBe(400);
    }
    expect(
      (
        await http.request(
          "GET",
          `${company(f.organizationId)}/policy`,
          lm.token,
        )
      ).status,
    ).toBe(404);
  });
  it.each(["DISCONNECT", "MALFORMED"])(
    "management commit with %s response is recovered only by exact read",
    async (loss) => {
      const f = await db.createFixture();
      const ca = await db.manager(f);
      const mutationId = randomUUID();
      const path = company(f.organizationId);
      await expect(
        http.request(
          "PUT",
          `${path}/policy/default`,
          ca.token,
          {
            mutationId,
            expectedRevision: 1,
            field: "shiftStartPresenceMode",
            value: "WARN_ONLY",
          },
          loss,
        ),
      ).rejects.toThrow();
      const read = await http.request(
        "GET",
        `${path}/results/${mutationId}`,
        ca.token,
      );
      expect(read.status).toBe(200);
      expect(
        shiftPresenceManagementResultSchema.parse(read.body),
      ).toMatchObject({
        attribution: "COMMITTED",
        revision: 2,
        canonical: { value: { policy: { startMode: "WARN_ONLY" } } },
      });
      const unrelated = await http.request(
        "GET",
        `${path}/results/${randomUUID()}`,
        ca.token,
      );
      expect(unrelated.body).toMatchObject({
        attribution: "UNKNOWN",
        canonical: { value: { policy: { revision: 2 } } },
      });
      expect(
        (
          await db.adminPool.query(
            `SELECT count(*)::int AS count FROM audit_events WHERE organization_id=$1`,
            [f.organizationId],
          )
        ).rows[0].count,
      ).toBe(1);
    },
  );
  it.each(["DISCONNECT", "MALFORMED"])(
    "Start commit with %s response survives a new service lookup without replay",
    async (loss) => {
      const f = await db.createFixture();
      await db.policy(f, "REQUIRE");
      await db.zone(f);
      const session = await db.session(f.userId);
      const challenge = await db.challenge(f, session.context);
      await expect(
        http.request(
          "POST",
          "/v1/staff/shifts/start",
          session.token,
          { targetLocationId: f.locationId, presence: db.measured(challenge) },
          loss,
        ),
      ).rejects.toThrow();
      expect(
        (
          await http.request(
            "GET",
            `${operational}/operations/${challenge.operationId}`,
            session.token,
          )
        ).body,
      ).toMatchObject({
        state: "RECOVERABLE",
        status: "COMMITTED",
        result: { status: "ACTIVE" },
      });
      expect(await db.facts(f)).toEqual({
        shifts: 1,
        decisions: 1,
        starts: 1,
        ends: 0,
      });
    },
  );
  it("foreign selectors conceal existence; stale exact session cannot act or reconcile", async () => {
    const f = await db.createFixture();
    const owner = await db.session(f.userId);
    const challenge = await db.challenge(f, owner.context);
    const foreign = await db.createFixture();
    const other = await db.session(foreign.userId);
    expect(
      (
        await http.request(
          "GET",
          `${operational}/operations/${challenge.operationId}`,
          other.token,
        )
      ).body,
    ).toEqual({ operationId: challenge.operationId, state: "EXPIRED" });
    expect(
      (
        await http.request("POST", `${operational}/challenges`, other.token, {
          action: "START",
          targetLocationId: f.locationId,
          operationId: randomUUID(),
        })
      ).status,
    ).toBe(404);
    await db.adminPool.query(
      `UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1`,
      [owner.context.staffAuthSessionId],
    );
    expect(
      (
        await http.request("POST", "/v1/staff/shifts/start", owner.token, {
          targetLocationId: f.locationId,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await http.request(
          "GET",
          `${operational}/operations/${challenge.operationId}`,
          owner.token,
        )
      ).status,
    ).toBe(401);
    expect(await db.facts(f)).toEqual({
      shifts: 0,
      decisions: 0,
      starts: 0,
      ends: 0,
    });
  });
});
