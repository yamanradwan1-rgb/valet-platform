import { randomUUID } from "node:crypto";

import type { PostgresPool, PostgresTransaction } from "../src/common/database/postgres";
import { inDispatchTransaction } from "../src/modules/dispatch/dispatch-transaction";
import { createEmergencyTakeoverCommandExecutor } from "../src/modules/dispatch/emergency-takeover-command";
import { assertPostTakeoverRetrievalCustodyEvidence } from "../src/modules/retrieval/handoff-takeover-proof-guard";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Issue352TakeoverTestContext, takeoverTaskId } from "./issue352-takeover-test-context";
import type { StartRetrievalFixture } from "./start-retrieval-test-context";

const context = new Issue352TakeoverTestContext("custody_xid");
beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

const takeover = () => createEmergencyTakeoverCommandExecutor(context.runtimePool);
const conflict = (): never => { throw new Error("KEY_CUSTODY_NOT_READY"); };

async function epoch(taskId: string) {
  const rows = await context.adminPool.query<{
    birth_xid: string | null;
    occurred_at: Date;
  }>(
    `SELECT pagination_birth_xid::text AS birth_xid, occurred_at
     FROM dispatch_events WHERE task_id = $1 AND event_type = 'EMERGENCY_TAKEOVER'
     ORDER BY pagination_birth_xid DESC NULLS LAST, occurred_at DESC LIMIT 1`,
    [taskId],
  );
  const row = rows.rows[0];
  if (!row?.birth_xid) throw new Error("Missing committed takeover xid8 marker");
  return { birthXid: row.birth_xid, occurredAt: row.occurred_at };
}

async function appendSyntheticCustody(
  queryable: Pick<PostgresPool, "query">,
  source: StartRetrievalFixture,
  actor: string,
  type: "CHECKED_OUT" | "RETURNED_TO_SLOT" | "SLOT_ASSIGNED",
  occurredAt: Date,
  eventId = randomUUID(),
) {
  await queryable.query(
    `INSERT INTO key_custody_events
       (id, organization_id, location_id, valet_session_id, key_slot_id,
        actor_membership_id, event_type, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [eventId, source.organizationId, source.locationId, source.sessionId,
      source.keySlotId, actor, type, occurredAt],
  );
  return eventId;
}

async function assertCustody(
  source: StartRetrievalFixture,
  assigneeMembershipId: string,
) {
  return inDispatchTransaction(context.runtimePool, (transaction) =>
    assertCustodyInTransaction(transaction, source, assigneeMembershipId));
}

function assertCustodyInTransaction(
  transaction: PostgresTransaction,
  source: StartRetrievalFixture,
  assigneeMembershipId: string,
) {
  return assertPostTakeoverRetrievalCustodyEvidence(transaction, {
    organizationId: source.organizationId,
    locationId: source.locationId,
    sessionId: source.sessionId,
    taskId: takeoverTaskId(source),
    keySlotId: source.keySlotId,
    currentAssigneeMembershipId: assigneeMembershipId,
  }, conflict);
}

describe("Issue #352 real PostgreSQL xid8 custody epoch", () => {
  it("accepts B checkout from a later transaction even at the identical event time", async () => {
    const source = await context.retrieving();
    const { initiator, replacement } = await context.actors(source);
    await takeover()(await context.request(source, initiator, replacement));
    const marker = await epoch(source.retrievalTaskId);
    await expect(assertCustody(source, replacement.membershipId))
      .rejects.toThrow("KEY_CUSTODY_NOT_READY");

    const id = await appendSyntheticCustody(context.adminPool, source,
      replacement.membershipId, "CHECKED_OUT", marker.occurredAt);
    const db = await context.adminPool.query<{
      marker_type: string;
      newer: boolean;
      birth_xid: string;
    }>(
      `SELECT pg_typeof(pagination_birth_xid)::text AS marker_type,
              pagination_birth_xid::text AS birth_xid,
              (pagination_birth_xid > $2::xid8) AS newer
       FROM key_custody_events WHERE id = $1`,
      [id, marker.birthXid],
    );
    expect(db.rows[0]).toMatchObject({ marker_type: "xid8", newer: true });
    await expect(assertCustody(source, replacement.membershipId)).resolves.toBeUndefined();
  });

  it("rejects tied RETURNED_TO_SLOT over SLOT_ASSIGNED despite reverse UUID order", async () => {
    const source = await context.retrieving();
    const { initiator, replacement } = await context.actors(source);
    await takeover()(await context.request(source, initiator, replacement));
    const marker = await epoch(source.retrievalTaskId);
    const client = await context.adminPool.connect();
    const returnId = "00000000-0000-4000-8000-000000000001";
    const assignId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    try {
      await client.query("BEGIN");
      await appendSyntheticCustody(client, source, replacement.membershipId,
        "RETURNED_TO_SLOT", marker.occurredAt, returnId);
      await appendSyntheticCustody(client, source, replacement.membershipId,
        "SLOT_ASSIGNED", marker.occurredAt, assignId);
      await client.query("COMMIT");
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
    const tied = await context.adminPool.query<{ distinct_births: number; distinct_times: number }>(
      `SELECT count(DISTINCT pagination_birth_xid)::int AS distinct_births,
              count(DISTINCT occurred_at)::int AS distinct_times
       FROM key_custody_events WHERE id = ANY($1::uuid[])`,
      [[returnId, assignId]],
    );
    expect(tied.rows[0]).toEqual({ distinct_births: 1, distinct_times: 1 });
    await expect(assertCustody(source, replacement.membershipId))
      .rejects.toThrow("KEY_CUSTODY_NOT_READY");
  });

  it("requires a new A checkout after A→B→A instead of reviving historical A custody", async () => {
    const source = await context.retrieving();
    const { initiator, replacement } = await context.actors(source);
    await takeover()(await context.request(source, initiator, replacement));
    await takeover()(await context.request(source, initiator, {
      membershipId: source.membershipId, userId: source.userId,
    }));
    const marker = await epoch(source.retrievalTaskId);
    await expect(assertCustody(source, source.membershipId))
      .rejects.toThrow("KEY_CUSTODY_NOT_READY");
    await appendSyntheticCustody(context.adminPool, source, source.membershipId,
      "CHECKED_OUT", marker.occurredAt);
    await expect(assertCustody(source, source.membershipId)).resolves.toBeUndefined();
  });

  it("does not treat a B checkout rolled back after takeover as custody evidence", async () => {
    const source = await context.retrieving();
    const { initiator, replacement } = await context.actors(source);
    await takeover()(await context.request(source, initiator, replacement));
    const marker = await epoch(source.retrievalTaskId);
    const client = await context.adminPool.connect();
    const rolledBackId = randomUUID();
    try {
      await client.query("BEGIN");
      await appendSyntheticCustody(client, source, replacement.membershipId,
        "CHECKED_OUT", marker.occurredAt, rolledBackId);
      await expect(assertCustodyInTransaction(client, source, replacement.membershipId))
        .resolves.toBeUndefined();
      await client.query("ROLLBACK");
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
    const persisted = await context.adminPool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM key_custody_events WHERE id = $1`,
      [rolledBackId],
    );
    expect(persisted.rows[0]?.count).toBe(0);
    await expect(assertCustody(source, replacement.membershipId))
      .rejects.toThrow("KEY_CUSTODY_NOT_READY");
  });
});
