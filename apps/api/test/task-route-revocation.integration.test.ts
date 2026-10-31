import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { authorizeTaskRouteHistory } from "../src/modules/tracking/task-route-authorization";
import { expectRouteDenied } from "./route-history-test-context";
import { TaskRouteTestContext } from "./task-route-test-context";

const context = new TaskRouteTestContext("revocation_race");
beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

describe("Task route reauthorization and concurrent revocation", () => {
  it("revocation between discovery and raw pages prevents further disclosure", async () => {
    const f = await context.createParkingTrackingFixture();
    await context.ingest(f, [
      await context.sample({ latitude: 30 }),
      await context.sample({ latitude: 31 }),
    ]);
    await context.complete(f);
    const actor = await context.createActor(f, "LOCATION_MANAGER");
    const session = await context.credential(actor.userId);
    expect(
      (await context.discover(session, f.movementTaskId)).recordings,
    ).toHaveLength(1);
    const first = await context.query({
      authenticatedUserId: actor.userId,
      trackingSessionId: f.trackingSessionId,
      limit: 1,
    });
    expect(first.samples).toHaveLength(1);
    await context.adminPool.query(
      `DELETE FROM membership_location_access WHERE membership_id = $1`,
      [actor.membershipId],
    );
    await expectRouteDenied(
      context.query({
        authenticatedUserId: actor.userId,
        trackingSessionId: f.trackingSessionId,
        cursor: first.nextCursor!,
        limit: 1,
      }),
    );
    await expectRouteDenied(context.discover(session, f.movementTaskId));
  });

  it("holds exact grant proof through the read transaction, then observes committed revocation", async () => {
    const f = await context.createParkingTrackingFixture();
    await context.complete(f);
    const actor = await context.createActor(f, "LOCATION_MANAGER");
    const session = await context.credential(actor.userId);
    let release!: () => void;
    let proved!: () => void;
    const pause = new Promise<void>((resolve) => {
      release = resolve;
    });
    const proof = new Promise<void>((resolve) => {
      proved = resolve;
    });
    const reading = inPostgresTransaction(context.runtimePool, async (tx) => {
      const scope = await authorizeTaskRouteHistory(
        tx,
        actor.userId,
        f.movementTaskId,
      );
      expect(scope).not.toBeNull();
      proved();
      await pause;
    });
    await proof;
    const writer = await context.adminPool.connect();
    try {
      const pid = (
        await writer.query<{ pid: number }>(`SELECT pg_backend_pid() AS pid`)
      ).rows[0]!.pid;
      const revocation = writer.query(
        `DELETE FROM membership_location_access WHERE membership_id = $1`,
        [actor.membershipId],
      );
      let blocked = false;
      for (let i = 0; i < 100; i++) {
        const row = await context.adminPool.query<{ blocked: boolean }>(
          `SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked`,
          [pid],
        );
        if (row.rows[0]!.blocked) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
      release();
      await reading;
      await revocation;
      await expectRouteDenied(context.discover(session, f.movementTaskId));
    } finally {
      release();
      writer.release();
    }
  });

  it.each(["COMMIT", "ROLLBACK"])(
    "a waiting reader re-evaluates a grant writer %s",
    async (outcome) => {
      const f = await context.createParkingTrackingFixture();
      await context.complete(f);
      const actor = await context.createActor(f, "LOCATION_MANAGER");
      const session = await context.credential(actor.userId);
      const writer = await context.adminPool.connect();
      try {
        await writer.query("BEGIN");
        await writer.query(
          `DELETE FROM membership_location_access WHERE membership_id = $1`,
          [actor.membershipId],
        );
        const reading = context.discover(session, f.movementTaskId).then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        );
        await new Promise((resolve) => setTimeout(resolve, 40));
        await writer.query(outcome);
        const result = await reading;
        if (outcome === "COMMIT")
          expect(result).toMatchObject({
            error: { code: "AUTHORIZATION_DENIED" },
          });
        else
          expect(result).toMatchObject({
            value: { recordings: [{ trackingSessionId: f.trackingSessionId }] },
          });
      } finally {
        await writer.query("ROLLBACK");
        writer.release();
      }
    },
  );
});

it("takes Location lifecycle protection before Location row locks", async () => {
  const f = await context.createParkingTrackingFixture();
  await context.complete(f);
  const actor = await context.createActor(f, "VALET_SUPERVISOR", {
    activeShift: true,
  });
  const session = await context.credential(actor.userId);
  const writer = await context.adminPool.connect();
  try {
    await writer.query("BEGIN");
    await writer.query(
      `SELECT pg_advisory_xact_lock(hashtextextended('location-lifecycle:' || $1::text, 0))`,
      [f.locationId],
    );
    const reading = context.discover(session, f.movementTaskId).then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    await writer.query(`SET LOCAL statement_timeout = '2s'`);
    await writer.query(
      `UPDATE locations SET status = 'INACTIVE', accepting_intake = FALSE WHERE id = $1`,
      [f.locationId],
    );
    await writer.query("COMMIT");
    expect(await reading).toMatchObject({
      error: { code: "AUTHORIZATION_DENIED" },
    });
  } finally {
    await writer.query("ROLLBACK");
    writer.release();
  }
});
