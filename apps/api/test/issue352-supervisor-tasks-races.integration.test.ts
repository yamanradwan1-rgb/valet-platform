import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createOverviewCursorCodec } from "../src/modules/dashboard/overview-cursor";
import { listDashboardTasks } from "../src/modules/dashboard/overview-retrieval-tasks-query";
import { Issue352TakeoverTestContext } from "./issue352-takeover-test-context";

const context = new Issue352TakeoverTestContext("supervisor_read_races");
const cursorCodec = createOverviewCursorCodec("tasks");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function waitForSupervisorReadToBlock(): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const activity = await context.adminPool.query<{ blocked: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_stat_activity
         WHERE datname = current_database()
           AND pid <> pg_backend_pid()
           AND wait_event_type = 'Lock'
           AND query LIKE '%membership.id::text%'
           AND query LIKE '%shift_row%'
       ) AS blocked`,
    );
    if (activity.rows[0]?.blocked) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(
    "Expected the Supervisor read to wait for a live eligibility writer.",
  );
}

describe("Issue #352 real PostgreSQL Supervisor Tasks read races", () => {
  it("waits for an in-flight LocationAccess revocation and denies after COMMIT", async () => {
    const source = await context.parking();
    const { initiator } = await context.actors(source);
    const credential = await context.credential(initiator.userId);
    const writer = await context.adminPool.connect();
    let settled = false;
    try {
      await writer.query("BEGIN");
      await writer.query(
        `DELETE FROM membership_location_access
         WHERE membership_id = $1 AND location_id = $2`,
        [initiator.membershipId, source.locationId],
      );
      const pendingRead = listDashboardTasks(context.runtimePool, {
        authenticatedUserId: initiator.userId,
        staffSessionContext: credential,
        locationId: source.locationId,
        limit: 50,
      }).then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      await waitForSupervisorReadToBlock();
      await writer.query("COMMIT");
      settled = true;
      expect(await pendingRead).toMatchObject({
        ok: false,
        error: { code: "AUTHORIZATION_DENIED" },
      });
    } finally {
      if (!settled) await writer.query("ROLLBACK");
      writer.release();
    }
  }, 25_000);

  it("waits for an in-flight LocationAccess revocation and reads after ROLLBACK", async () => {
    const source = await context.parking();
    const { initiator } = await context.actors(source);
    const credential = await context.credential(initiator.userId);
    const writer = await context.adminPool.connect();
    let settled = false;
    try {
      await writer.query("BEGIN");
      await writer.query(
        `DELETE FROM membership_location_access
         WHERE membership_id = $1 AND location_id = $2`,
        [initiator.membershipId, source.locationId],
      );
      const pendingRead = listDashboardTasks(context.runtimePool, {
        authenticatedUserId: initiator.userId,
        staffSessionContext: credential,
        locationId: source.locationId,
        limit: 50,
      });
      await waitForSupervisorReadToBlock();
      await writer.query("ROLLBACK");
      settled = true;
      const result = await pendingRead;
      expect(result.items.map((item) => item.taskId)).toContain(source.taskId);
    } finally {
      if (!settled) await writer.query("ROLLBACK");
      writer.release();
    }
  }, 25_000);

  it("waits for an in-flight Shift end and denies after COMMIT", async () => {
    const source = await context.parking();
    const { initiator } = await context.actors(source);
    const credential = await context.credential(initiator.userId);
    const writer = await context.adminPool.connect();
    let settled = false;
    try {
      await writer.query("BEGIN");
      await writer.query(
        `UPDATE shifts SET status = 'ENDED', ended_at = clock_timestamp()
         WHERE membership_id = $1 AND location_id = $2`,
        [initiator.membershipId, source.locationId],
      );
      const pendingRead = listDashboardTasks(context.runtimePool, {
        authenticatedUserId: initiator.userId,
        staffSessionContext: credential,
        locationId: source.locationId,
        limit: 50,
      }).then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      await waitForSupervisorReadToBlock();
      await writer.query("COMMIT");
      settled = true;
      expect(await pendingRead).toMatchObject({
        ok: false,
        error: { code: "AUTHORIZATION_DENIED" },
      });
    } finally {
      if (!settled) await writer.query("ROLLBACK");
      writer.release();
    }
  }, 25_000);

  it("keeps exact Organization scope when the same User has a second membership", async () => {
    const source = await context.parking();
    const { initiator } = await context.actors(source);
    const otherOrganization = await context.createFixture(
      { role: "ORG_ADMIN" },
      initiator.userId,
    );
    expect(otherOrganization.organizationId).not.toBe(source.organizationId);
    const result = await listDashboardTasks(context.runtimePool, {
      authenticatedUserId: initiator.userId,
      staffSessionContext: await context.credential(initiator.userId),
      locationId: source.locationId,
      limit: 50,
    });
    expect(result.items.map((item) => item.taskId)).toContain(source.taskId);
  });

  it("treats a foreign Task cursor as ordering only, never location authority", async () => {
    const foreign = await context.parking();
    const { initiator: foreignActor } = await context.actors(foreign);
    const source = await context.parking();
    const { initiator } = await context.actors(source);
    const a = await listDashboardTasks(context.runtimePool, {
      authenticatedUserId: initiator.userId,
      staffSessionContext: await context.credential(initiator.userId),
      locationId: source.locationId,
      limit: 50,
    });
    const first = a.items.find((item) => item.taskId === source.taskId);
    expect(first).toBeDefined();
    const cursor = cursorCodec.encode({
      sortKey: first!.createdAt,
      tiebreakerId: first!.taskId,
    });
    const b = await listDashboardTasks(context.runtimePool, {
      authenticatedUserId: foreignActor.userId,
      staffSessionContext: await context.credential(foreignActor.userId),
      locationId: foreign.locationId,
      cursor,
      limit: 50,
    });
    expect(b.items.map((item) => item.taskId)).toContain(foreign.taskId);
    expect(b.items.every((item) => item.taskId !== source.taskId)).toBe(true);
    expect(b.nextCursor === null || typeof b.nextCursor === "string").toBe(
      true,
    );
  });
});
