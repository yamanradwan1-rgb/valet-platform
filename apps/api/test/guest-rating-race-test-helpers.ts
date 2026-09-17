import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import { GuestAccessService } from "../src/modules/guest-access/guest-access.service";
import { GuestRatingService } from "../src/modules/guest-access/guest-rating.service";
import type { CompleteHandoffTestContext } from "./complete-handoff-test-context";
import type { HandoffFixture } from "./handoff-test-context";

export function settled<T>(operation: Promise<T>) {
  return operation.then(
    (value) => ({ kind: "FULFILLED" as const, value }),
    (error: unknown) => ({ error, kind: "REJECTED" as const }),
  );
}

export async function prepareRatingSubmission(
  context: CompleteHandoffTestContext,
  fixture: HandoffFixture,
  label: string,
) {
  const antiAbuse = context.antiAbuse();
  const decision = await antiAbuse.reserve(
    antiAbuse.key(
      "v1:guest-client-address",
      `${label}-${fixture.sessionId}-${randomUUID()}`,
    ),
    60,
  );
  if (!decision.allowed) throw new Error("Guest rating test reservation was limited.");
  const service = new GuestRatingService(
    context.runtimePool,
    antiAbuse,
    new GuestAccessService(context.runtimePool),
  );
  return {
    reservationId: decision.reservation.id,
    submit: (rating: number) =>
      service.submit(decision.reservation, fixture.guestToken, rating),
  };
}

async function holdRow(
  context: CompleteHandoffTestContext,
  query: string,
  id: string,
): Promise<PoolClient> {
  const client = await context.adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(query, [id]);
    return client;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    throw error;
  }
}

export function holdRatingReservation(
  context: CompleteHandoffTestContext,
  reservationId: string,
) {
  return holdRow(
    context,
    "SELECT id FROM anti_abuse_events WHERE id = $1 FOR UPDATE",
    reservationId,
  );
}

export function holdRetrievalTask(
  context: CompleteHandoffTestContext,
  taskId: string,
) {
  return holdRow(context, "SELECT id FROM tasks WHERE id = $1 FOR UPDATE", taskId);
}

export async function waitForLockWaiters(
  context: CompleteHandoffTestContext,
  queryFragment: string,
  minimum = 1,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await context.adminPool.query<{ count: number }>(
      `SELECT count(*)::integer AS count
       FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock'
         AND query ILIKE $1`,
      [`%${queryFragment}%`],
    );
    if ((result.rows[0]?.count ?? 0) >= minimum) return;
  }
  throw new Error(
    `Expected ${minimum} lock waiter(s) matching ${queryFragment}.`,
  );
}

export async function releaseBarrier(client: PoolClient): Promise<void> {
  try {
    await client.query("COMMIT");
  } finally {
    client.release();
  }
}

export async function rollbackBarrier(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
}
