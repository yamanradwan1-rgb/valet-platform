import { setTimeout as delay } from "node:timers/promises";

import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { syntheticJpeg } from "./issue215-http-fixture";
import {
  openIssue309PhotoHttpFixture,
  type Issue309PhotoHttpFixture,
} from "./issue309-photo-http-fixture";

const managementLock = `
  SELECT pg_advisory_xact_lock(
    hashtextextended('staff-management-org:' || $1::text, 0)
  )`;

async function waitForBlockedReader(
  client: PoolClient,
  waitMs = 10_000,
): Promise<boolean> {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const result = await client.query<{ count: number }>(`
      SELECT count(*)::int AS count FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND wait_event_type='Lock' AND wait_event='advisory'
    `);
    if ((result.rows[0]?.count ?? 0) > 0) return true;
    await delay(40);
  }
  return false;
}

describe("#309 real-PostgreSQL management grant revocation racing photo byte read", () => {
  let h: Issue309PhotoHttpFixture;
  beforeAll(async () => {
    h = await openIssue309PhotoHttpFixture({ hypotheticalApprovedRoles: true });
  }, 240_000);
  afterAll(async () => { await h?.close(); }, 90_000);

  for (const type of ["manifest", "bytes"] as const) {
    it(`revoker-first ${type} reader cannot reveal saved photo after committed grant removal`, async () => {
      const { scope, authorization: staff } = await h.seedPhoto();
      const uploaded = await h.upload(scope.sessionId, staff, await syntheticJpeg());
      expect(uploaded.status).toBe(201);
      const { vehiclePhotoId } = JSON.parse(uploaded.body.toString("utf8")) as {
        vehiclePhotoId: string;
      };
      const viewer = await h.createViewer(scope);
      const manifest = `/v1/staff/dashboard/locations/${scope.locationId}/sessions/${scope.sessionId}/condition-photos`;
      const path = type === "manifest" ? manifest : `${manifest}/${vehiclePhotoId}/bytes`;
      // The writer takes the same EXCLUSIVE organization advisory fence as the
      // supported management grant mutation; the transaction's DELETE remains
      // uncommitted until the live HTTP reader is blocked at its SHARED fence.
      const writer = await h.db.admin.connect();
      let open = false;
      try {
        await writer.query("BEGIN");
        open = true;
        await writer.query(managementLock, [scope.orgId]);
        await writer.query(
          `DELETE FROM membership_location_access
           WHERE organization_id=$1 AND membership_id=$2 AND location_id=$3`,
          [scope.orgId, viewer.memberId, scope.locationId],
        );
        const pending = h.get(path, viewer.authorization);
        const blocked = await waitForBlockedReader(writer);
        await writer.query("COMMIT");
        open = false;
        const returned = await pending;
        expect(blocked).toBe(true);
        expect([403, 404]).toContain(returned.status);
        expect(returned.headers.get("content-type")).not.toContain("image/jpeg");
        expect(returned.body.includes(Buffer.from("JFIF"))).toBe(false);
        expect((await h.get(path, viewer.authorization)).status).not.toBe(200);
      } finally {
        if (open) await writer.query("ROLLBACK");
        writer.release();
      }
    }, 90_000);
  }
});
