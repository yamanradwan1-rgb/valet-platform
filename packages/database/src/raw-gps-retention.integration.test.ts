import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RawGpsRetentionTestContext } from "./raw-gps-retention-test-context.js";

const context = new RawGpsRetentionTestContext();

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-007F raw GPS retention", () => {
  it("keeps direct mutation denied and grants only the safe function", async () => {
    const result = await context.adminPool.query<{
      public_denied: boolean;
      runtime_allowed: boolean;
      search_path_safe: boolean;
      security_definer: boolean;
    }>(
      `SELECT has_function_privilege($1, $2, 'EXECUTE') AS runtime_allowed,
              function.prosecdef AS security_definer,
              function.proconfig = ARRAY['search_path=pg_catalog, public']::text[]
                AS search_path_safe,
              NOT EXISTS (
                SELECT 1 FROM aclexplode(
                  COALESCE(function.proacl, acldefault('f', function.proowner))
                ) AS privilege
                WHERE privilege.grantee = 0
                  AND privilege.privilege_type = 'EXECUTE'
              ) AS public_denied
       FROM pg_proc AS function
       WHERE function.oid = to_regprocedure($2)`,
      [context.runtimeRole, "public.cleanup_expired_raw_gps_samples(integer)"],
    );
    expect(result.rows[0]).toEqual({
      public_denied: true,
      runtime_allowed: true,
      search_path_safe: true,
      security_definer: true,
    });
    await context.expectDenied(
      context.runtimePool.query(`DELETE FROM raw_gps_samples`),
    );
    await context.expectDenied(
      context.runtimePool.query(`TRUNCATE raw_gps_samples`),
    );
    for (const limit of [0, 1001]) {
      await expect(
        context.runtimePool.query(
          `SELECT cleanup_expired_raw_gps_samples($1)`,
          [limit],
        ),
      ).rejects.toMatchObject({ code: "22023" });
    }
  });

  it("uses received_at and each exact Location policy", async () => {
    const inherited = await context.fixture();
    const overridden = await context.fixture();
    const active = await context.fixture();
    const shortened = await context.fixture();
    const recent = await context.fixture();
    const inheritedId = await context.sample(inherited);
    const overriddenId = await context.sample(overridden);
    const activeId = await context.sample(active);
    const shortenedId = await context.sample(shortened);
    const recentId = await context.sample(recent);
    await context.adminPool.query(
      `UPDATE task_tracking_sessions
       SET ended_at = started_at + interval '1 second'
       WHERE id = ANY($1::uuid[])`,
      [[
        inherited.trackingSessionId,
        overridden.trackingSessionId,
        shortened.trackingSessionId,
        recent.trackingSessionId,
      ]],
    );
    await context.adminPool.query(
      `UPDATE locations SET raw_gps_retention_days_override = 60
       WHERE id = $1`,
      [overridden.locationId],
    );
    await context.adminPool.query(
      `UPDATE locations SET raw_gps_retention_days_override = 14
       WHERE id = $1`,
      [shortened.locationId],
    );
    await context.adminPool.query(
      `UPDATE raw_gps_samples
       SET received_at = transaction_timestamp() - interval '31 days',
           captured_at = transaction_timestamp() + interval '1 day'
       WHERE id = ANY($1::uuid[])`,
      [[inheritedId, overriddenId, activeId]],
    );
    await context.adminPool.query(
      `UPDATE raw_gps_samples
       SET received_at = transaction_timestamp() - interval '15 days'
       WHERE id = $1`,
      [shortenedId],
    );
    await context.adminPool.query(
      `UPDATE raw_gps_samples
       SET captured_at = transaction_timestamp() - interval '100 days'
       WHERE id = $1`,
      [recentId],
    );
    const cleanup = await context.runtimePool.query<{ deleted: number }>(
      `SELECT cleanup_expired_raw_gps_samples(1000) AS deleted`,
    );
    expect(cleanup.rows[0]?.deleted).toBe(2);
    const survivors = await context.adminPool.query<{ id: string }>(
      `SELECT id::text FROM raw_gps_samples WHERE id = ANY($1::uuid[])`,
      [[inheritedId, overriddenId, activeId, shortenedId, recentId]],
    );
    expect(survivors.rows.map((row) => row.id).sort()).toEqual(
      [overriddenId, activeId, recentId].sort(),
    );
  });

  it("lets normal cleanup proceed beside an extreme valid retention policy", async () => {
    const normal = await context.fixture();
    const extreme = await context.fixture();
    const normalId = await context.sample(normal);
    const extremeId = await context.sample(extreme);
    await context.adminPool.query(
      `UPDATE task_tracking_sessions
       SET ended_at = started_at + interval '1 second'
       WHERE id = ANY($1::uuid[])`,
      [[normal.trackingSessionId, extreme.trackingSessionId]],
    );
    await context.adminPool.query(
      `UPDATE organizations SET raw_gps_retention_days = 2147483647
       WHERE id = $1`,
      [extreme.organizationId],
    );
    await context.adminPool.query(
      `UPDATE raw_gps_samples
       SET received_at = transaction_timestamp() - interval '100 years'
       WHERE id = $1`,
      [extremeId],
    );
    await context.adminPool.query(
      `UPDATE raw_gps_samples
       SET received_at = transaction_timestamp() - interval '31 days'
       WHERE id = $1`,
      [normalId],
    );

    const cleanup = await context.runtimePool.query<{ deleted: number }>(
      `SELECT cleanup_expired_raw_gps_samples(1000) AS deleted`,
    );
    expect(cleanup.rows[0]?.deleted).toBe(1);
    const survivors = await context.adminPool.query<{ id: string }>(
      `SELECT id::text FROM raw_gps_samples
       WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [[normalId, extremeId]],
    );
    expect(survivors.rows).toEqual([{ id: extremeId }]);
  });

  it("converges concurrently and preserves non-raw operational history", async () => {
    const fixture = await context.fixture();
    const sampleIds = await Promise.all(
      Array.from({ length: 3 }, () => context.sample(fixture)),
    );
    await context.adminPool.query(
      `UPDATE task_tracking_sessions
       SET ended_at = started_at + interval '1 second' WHERE id = $1`,
      [fixture.trackingSessionId],
    );
    await context.adminPool.query(
      `UPDATE raw_gps_samples
       SET received_at = transaction_timestamp() - interval '31 days'
       WHERE id = ANY($1::uuid[])`,
      [sampleIds],
    );
    await context.adminPool.query(
      `INSERT INTO geofence_events
         (id, organization_id, location_id, valet_session_id, task_id,
          tracking_session_id, map_area_id, event_type, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ENTERED', transaction_timestamp())`,
      [
        randomUUID(),
        fixture.organizationId,
        fixture.locationId,
        fixture.valetSessionId,
        fixture.taskId,
        fixture.trackingSessionId,
        fixture.mapAreaId,
      ],
    );
    const calls = await Promise.all([
      context.runtimePool.query<{ deleted: number }>(
        `SELECT cleanup_expired_raw_gps_samples(2) AS deleted`,
      ),
      context.runtimePool.query<{ deleted: number }>(
        `SELECT cleanup_expired_raw_gps_samples(2) AS deleted`,
      ),
    ]);
    expect(calls.reduce((sum, call) => sum + call.rows[0]!.deleted, 0)).toBe(3);
    const counts = await context.adminPool.query<{
      events: number;
      samples: number;
      tasks: number;
      trackers: number;
    }>(
      `SELECT
         (SELECT count(*)::integer FROM raw_gps_samples
          WHERE tracking_session_id = $1) AS samples,
         (SELECT count(*)::integer FROM geofence_events
          WHERE tracking_session_id = $1) AS events,
         (SELECT count(*)::integer FROM task_tracking_sessions
          WHERE id = $1) AS trackers,
         (SELECT count(*)::integer FROM tasks WHERE id = $2) AS tasks`,
      [fixture.trackingSessionId, fixture.taskId],
    );
    expect(counts.rows[0]).toEqual({
      events: 1, samples: 0, tasks: 1, trackers: 1,
    });
  });

  it("never deletes through an uncommitted movement-end race", async () => {
    const fixture = await context.fixture();
    const sampleId = await context.sample(fixture);
    await context.adminPool.query(
      `UPDATE raw_gps_samples
       SET received_at = transaction_timestamp() - interval '31 days'
       WHERE id = $1`,
      [sampleId],
    );
    const movement = await context.adminPool.connect();
    try {
      await movement.query("BEGIN");
      await movement.query(
        `UPDATE task_tracking_sessions
         SET ended_at = started_at + interval '1 second' WHERE id = $1`,
        [fixture.trackingSessionId],
      );
      const racing = await context.runtimePool.query<{ deleted: number }>(
        `SELECT cleanup_expired_raw_gps_samples(1000) AS deleted`,
      );
      expect(racing.rows[0]?.deleted).toBe(0);
      await movement.query("COMMIT");
    } finally {
      await movement.query("ROLLBACK").catch(() => undefined);
      movement.release();
    }
    const afterEnd = await context.runtimePool.query<{ deleted: number }>(
      `SELECT cleanup_expired_raw_gps_samples(1000) AS deleted`,
    );
    expect(afterEnd.rows[0]?.deleted).toBe(1);
  });

  it("runs a bounded runtime command with aggregate-only output", async () => {
    const fixture = await context.fixture();
    const sampleId = await context.sample(fixture);
    await context.adminPool.query(
      `UPDATE task_tracking_sessions
       SET ended_at = started_at + interval '1 second' WHERE id = $1`,
      [fixture.trackingSessionId],
    );
    await context.adminPool.query(
      `UPDATE raw_gps_samples
       SET received_at = transaction_timestamp() - interval '31 days'
       WHERE id = $1`,
      [sampleId],
    );
    const output = await context.runMaintenance();
    expect(JSON.parse(output.trim())).toEqual({ batches: 1, deletedRows: 1 });
    expect(output).not.toContain(context.runtimePassword);
    expect(output).not.toMatch(/latitude|longitude|organization|location|sampleId/i);
  });

  it("fails non-zero without leaking runtime credentials", async () => {
    const secret = "must-not-leak";
    try {
      await context.runFailedMaintenance(
        `postgresql://runtime:${secret}@127.0.0.1:1/unavailable`,
      );
      throw new Error("Expected cleanup failure.");
    } catch (error) {
      expect((error as Error).message).toContain("Raw GPS cleanup failed.");
      expect((error as Error).message).not.toContain(secret);
    }
  });
});
