import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { shiftPresenceManagementResultSchema } from "@valet/contracts";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { presenceHttp } from "./shift-presence-http-test-helper";
import { disconnectBeforePresenceCommit } from "./shift-presence-disconnect-test-helper";
import {
  abortPresenceCommitBarriers,
  observePresenceCommandWait,
  presenceCommitBarrier,
} from "./shift-presence-commit-test-helper";

const db = new PresenceServerTestContext("presence-zone-create-recovery");
let http: Awaited<ReturnType<typeof presenceHttp>>;
beforeAll(async () => {
  await db.setup();
  http = await presenceHttp(db);
}, 120_000);
afterAll(async () => {
  abortPresenceCommitBarriers();
  await http?.app.close();
  await db.teardown();
}, 60_000);
async function scenario() {
  const f = await db.createFixture();
  const m = await db.manager(f, "LOCATION_MANAGER");
  const prefix = `/v1/staff/dashboard/locations/${f.locationId}/configuration/shift-presence`;
  const body = {
    mutationId: randomUUID(),
    zoneId: randomUUID(),
    code: "ENTRY",
    label: "Synthetic",
    latitude: 31.95,
    longitude: 35.91,
    radiusMeters: 100,
    state: "ACTIVE" as const,
  };
  return { f, m, prefix, body };
}
async function recover(
  a: Awaited<ReturnType<typeof scenario>>,
  mutationId = a.body.mutationId,
  zoneId = a.body.zoneId,
) {
  return http.request(
    "GET",
    `${a.prefix}/results/${mutationId}?kind=ZONE&entityId=${zoneId}`,
    a.m.token,
  );
}
async function facts(a: Awaited<ReturnType<typeof scenario>>) {
  return (
    await db.adminPool.query(
      `SELECT
    (SELECT count(*)::integer FROM shift_presence_zones WHERE id=$1) AS zones,
    (SELECT count(*)::integer FROM audit_events WHERE id=$2) AS audits,
    (SELECT count(*)::integer FROM shift_presence_management_results WHERE mutation_id=$2) AS receipts`,
      [a.body.zoneId, a.body.mutationId],
    )
  ).rows[0];
}
function unknown(result: Awaited<ReturnType<typeof http.request>>) {
  expect(result.status).toBe(200);
  expect(shiftPresenceManagementResultSchema.parse(result.body)).toMatchObject({
    attribution: "UNKNOWN",
    effect: null,
    entityId: null,
    revision: null,
    canonical: { kind: "ZONE", value: { zone: null } },
  });
}
describe("real HTTP stable Zone CREATE result identity", () => {
  it.each(["DISCONNECT", "MALFORMED"] as const)(
    "committed create survives %s response and reconstructs exact Zone without replay",
    async (loss) => {
      const a = await scenario();
      await expect(
        http.request("POST", `${a.prefix}/zones`, a.m.token, a.body, loss),
      ).rejects.toThrow();
      await http.app.close();
      http = await presenceHttp(db);
      const result = await recover(a);
      expect(result.status).toBe(200);
      expect(
        shiftPresenceManagementResultSchema.parse(result.body),
      ).toMatchObject({
        attribution: "COMMITTED",
        effect: "CHANGED",
        entityId: a.body.zoneId,
        revision: 1,
        canonical: { value: { zone: { id: a.body.zoneId } } },
      });
      expect(await facts(a)).toEqual({ zones: 1, audits: 1, receipts: 1 });
      expect(
        (await http.request("POST", `${a.prefix}/zones`, a.m.token, a.body))
          .status,
      ).toBe(409);
      expect(await facts(a)).toEqual({ zones: 1, audits: 1, receipts: 1 });
    },
  );
  it("actual PostgreSQL connection loss before commit leaves absent Zone UNKNOWN, with zero audit/receipt", async () => {
    const a = await scenario();
    const disconnected = await presenceHttp(
      db,
      disconnectBeforePresenceCommit(db),
    );
    try {
      expect(
        (
          await disconnected.request(
            "POST",
            `${a.prefix}/zones`,
            a.m.token,
            a.body,
          )
        ).status,
      ).toBe(500);
    } finally {
      await disconnected.app.close();
    }
    unknown(await recover(a));
    expect(await facts(a)).toEqual({ zones: 0, audits: 0, receipts: 0 });
  });
  it("absence alone is UNKNOWN; an in-flight create fences result reads until commit or rollback", async () => {
    const a = await scenario();
    unknown(await recover(a));
    const barrier = presenceCommitBarrier(db.runtimePool);
    const writing = await presenceHttp(db, barrier.pool);
    try {
      const write = writing.request(
        "POST",
        `${a.prefix}/zones`,
        a.m.token,
        a.body,
      );
      await barrier.atCommit;
      let settled = false;
      const read = recover(a).then((result) => {
        settled = true;
        return result;
      });
      await observePresenceCommandWait(db);
      expect(settled).toBe(false);
      barrier.finish("ROLLBACK");
      expect((await write).status).toBe(500);
      unknown(await read);
      expect(await facts(a)).toEqual({ zones: 0, audits: 0, receipts: 0 });
    } finally {
      barrier.finish("ROLLBACK");
      await writing.app.close();
    }
  });
  it("existing exact Zone without own mutation proof is UNKNOWN; matching code/label elsewhere proves nothing", async () => {
    const a = await scenario();
    expect(
      (await http.request("POST", `${a.prefix}/zones`, a.m.token, a.body))
        .status,
    ).toBe(201);
    const unrelated = await recover(a, randomUUID());
    expect(unrelated.status).toBe(200);
    expect(
      shiftPresenceManagementResultSchema.parse(unrelated.body),
    ).toMatchObject({
      attribution: "UNKNOWN",
      effect: null,
      entityId: null,
      canonical: { value: { zone: { id: a.body.zoneId } } },
    });
    unknown(await recover(a, randomUUID(), randomUUID()));
    expect(await facts(a)).toEqual({ zones: 1, audits: 1, receipts: 1 });
  });
  it("conceals foreign tenant/Location Zone selectors and revoked current result authority", async () => {
    const a = await scenario();
    const foreign = await scenario();
    await db.management.saveZone(
      foreign.m.context,
      foreign.m.target,
      foreign.body,
    );
    expect((await recover(a, randomUUID(), foreign.body.zoneId)).status).toBe(
      404,
    );
    const siblingId = await db.addLocation(a.f);
    const sibling = { ...a.f, locationId: siblingId };
    const siblingZone = await db.zone(sibling);
    expect((await recover(a, randomUUID(), siblingZone)).status).toBe(404);
    await db.adminPool.query(
      `DELETE FROM membership_location_access WHERE membership_id=$1 AND location_id=$2`,
      [a.m.membershipId, a.f.locationId],
    );
    expect((await recover(a)).status).toBe(404);
    expect(
      (await recover(a, foreign.body.mutationId, foreign.body.zoneId)).status,
    ).toBe(404);
  });
});
