import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { shiftPresenceManagementResultSchema } from "@valet/contracts";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { pendingPresenceException } from "./shift-presence-exception-test-helper";
import { presenceHttp } from "./shift-presence-http-test-helper";

const db = new PresenceServerTestContext("presence-management-http-recovery");
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

describe("zone and review HTTP unknown outcome with fresh application reconciliation", () => {
  it.each([
    ["ZONE", "DISCONNECT"],
    ["ZONE", "MALFORMED"],
    ["EXCEPTION", "DISCONNECT"],
    ["EXCEPTION", "MALFORMED"],
  ] as const)(
    "%s %s commits once and is attributable after application reconstruction",
    async (kind, loss) => {
      const a = await pendingPresenceException(db);
      const prefix = `/v1/staff/management/organizations/${a.fixture.organizationId}/shift-presence/locations/${a.fixture.locationId}`;
      const mutationId = randomUUID();
      const entityId =
        kind === "ZONE" ? randomUUID() : String(a.exception.exceptionId);
      const path =
        kind === "ZONE"
          ? `${prefix}/zones`
          : `${prefix}/exceptions/${entityId}/approve`;
      const body =
        kind === "ZONE"
          ? {
              mutationId,
              zoneId: entityId,
              code: "ENTRY",
              label: "Synthetic",
              latitude: 31.95,
              longitude: 35.91,
              radiusMeters: 100,
              state: "ACTIVE",
            }
          : { mutationId, expectedRevision: 1 };
      await expect(
        http.request("POST", path, a.manager.token, body, loss),
      ).rejects.toThrow();
      await http.app.close();
      http = await presenceHttp(db);
      const read = await http.request(
        "GET",
        `${prefix}/results/${mutationId}?kind=${kind}&entityId=${entityId}`,
        a.manager.token,
      );
      expect(read.status).toBe(200);
      const recovered = shiftPresenceManagementResultSchema.parse(read.body);
      expect(recovered).toMatchObject({
        attribution: "COMMITTED",
        entityId,
        revision: kind === "ZONE" ? 1 : 2,
        canonical: { kind },
      });
      expect(
        (
          await db.adminPool.query(
            `SELECT count(*)::int AS count FROM audit_events WHERE id=$1`,
            [mutationId],
          )
        ).rows[0].count,
      ).toBe(1);
      expect(await db.facts(a.fixture)).toEqual({
        shifts: 0,
        decisions: 0,
        starts: 0,
        ends: 0,
      });
      // Same dispatched identity is not automatically replayed: a manual repeat conflicts.
      expect(
        (await http.request("POST", path, a.manager.token, body)).status,
      ).toBe(409);
      expect(
        (
          await db.adminPool.query(
            `SELECT count(*)::int AS count FROM audit_events WHERE id=$1`,
            [mutationId],
          )
        ).rows[0].count,
      ).toBe(1);
    },
  );
});
